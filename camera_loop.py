"""
Live camera workers — one OpenCV capture + ALPR pipeline per active ``parking_gates`` row.

Operators configure **camera + barrier** in the web UI (**Kapı ayarları**). This script
polls ``GET /api/gates`` and starts / restarts workers when the configuration changes.

Usage:
    python camera_loop.py

Environment (see .env):
    API_BASE_URL               FastAPI root. Default: http://localhost:8000
    GATES_POLL_SEC             Re-fetch gate list interval (seconds). Default: 30
    BAR_CONFIDENCE_THRESHOLD   Min confidence to push a candidate to the UI. Default: 0.90
    PROCESS_INTERVAL_SEC       Minimum seconds between ALPR inferences per gate. Default: 0.5
                               Lower = more responsive, higher = lower CPU.  2 inferences/sec
                               (0.5 s) is more than sufficient for a parking barrier.
    DETECTION_LOG_INTERVAL_SEC How often to log each gate's last OCR result (seconds). Default: 2.0
    LOG_LEVEL                  Use DEBUG for per-frame YOLO detail (very noisy).
    FRAME_SKIP                 Deprecated — superseded by PROCESS_INTERVAL_SEC.  Ignored if
                               PROCESS_INTERVAL_SEC is set.
    STATUS_EVERY_SEC           Deprecated alias for DETECTION_LOG_INTERVAL_SEC if the latter unset.
    DETECTION_CONFIDENCE / OCR_CONFIDENCE (via alpr_engine)
"""

from __future__ import annotations

import logging
import os
import sys
import threading
import time
from typing import Any

import cv2
import requests
from dotenv import load_dotenv

load_dotenv()

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s.%(msecs)03d [%(threadName)s] %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000").rstrip("/")
GATES_URL = f"{API_BASE_URL}/api/gates"
CANDIDATE_URL = f"{API_BASE_URL}/api/candidate"

BAR_CONFIDENCE_THRESHOLD = float(os.getenv("BAR_CONFIDENCE_THRESHOLD", "0.90"))
GATES_POLL_SEC = float(os.getenv("GATES_POLL_SEC", "30"))

# How often the ALPR pipeline runs per gate.
# Default: 0.5 s = 2 inferences/second — plenty for a parking barrier where
# a car sits still for several seconds.  Increase to reduce CPU further.
_env_interval = os.getenv("PROCESS_INTERVAL_SEC")
if _env_interval is None:
    # Backwards-compat: derive from legacy FRAME_SKIP (assume 30 FPS camera)
    _frame_skip = int(os.getenv("FRAME_SKIP", "5"))
    PROCESS_INTERVAL_SEC = _frame_skip / 30.0
else:
    PROCESS_INTERVAL_SEC = float(_env_interval)

DETECTION_LOG_INTERVAL_SEC = float(
    os.getenv("DETECTION_LOG_INTERVAL_SEC") or os.getenv("STATUS_EVERY_SEC", "2.0")
)


def _parse_camera_source(raw: str) -> int | str:
    raw = raw.strip()
    try:
        return int(raw)
    except ValueError:
        return raw


def _open_capture(source: int | str) -> cv2.VideoCapture:
    if sys.platform == "win32" and isinstance(source, int):
        cap = cv2.VideoCapture(source, cv2.CAP_DSHOW)
    else:
        cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open camera source: {source!r}")
    return cap


def _fetch_active_gates() -> list[dict[str, Any]]:
    resp = requests.get(GATES_URL, timeout=8)
    resp.raise_for_status()
    gates = resp.json()
    return [g for g in gates if g.get("is_active", True)]


def _gate_signature(gates: list[dict[str, Any]]) -> tuple[tuple[Any, ...], ...]:
    rows = []
    for g in sorted(gates, key=lambda x: int(x["id"])):
        rows.append(
            (
                int(g["id"]),
                str(g.get("camera_source", "")).strip(),
                bool(g.get("is_active", True)),
            )
        )
    return tuple(rows)


def _push_candidate(
    gate_id: int,
    plate: str,
    raw_ocr: str,
    confidence: float,
    is_valid: bool,
) -> bool:
    payload = {
        "gate_id": gate_id,
        "plate": plate,
        "raw_ocr": raw_ocr,
        "confidence": confidence,
        "is_valid": is_valid,
    }
    try:
        resp = requests.post(CANDIDATE_URL, json=payload, timeout=3)
        resp.raise_for_status()
        logger.info("Gate %s → API OK | pushed candidate %s (%.0f%%)", gate_id, plate, confidence * 100)
        return True
    except requests.HTTPError as exc:
        body = ""
        if exc.response is not None:
            try:
                body = exc.response.text[:500]
            except Exception:  # noqa: BLE001
                body = ""
        logger.error(
            "Gate %s → POST %s failed HTTP %s: %s | body=%r",
            gate_id,
            CANDIDATE_URL,
            getattr(exc.response, "status_code", "?"),
            exc,
            body,
        )
        return False
    except requests.RequestException as exc:
        logger.error("Gate %s → POST candidate network error: %s", gate_id, exc)
        return False


def _gate_worker(stop: threading.Event, gate: dict[str, Any]) -> None:
    gate_id = int(gate["id"])
    label = gate.get("label", f"Gate {gate_id}")
    source = _parse_camera_source(str(gate.get("camera_source", "")))

    try:
        cap = _open_capture(source)
    except Exception as exc:  # noqa: BLE001
        logger.error("Gate %s (%s): cannot open camera %r — %s", gate_id, label, source, exc)
        return

    logger.info("Gate %s (%s): camera online — source=%r", gate_id, label, source)

    last_pushed_plate: str | None = None
    last_push_time: float = 0.0
    last_detection_log_time: float = 0.0
    consecutive_failures = 0
    min_push_interval = 3.0
    max_failures_reopen = 5

    # Time-based gate: only run ALPR at most once per PROCESS_INTERVAL_SEC.
    # Between inferences, cap.grab() drains the camera buffer without decoding
    # the frame — this is the primary CPU reduction vs the old tight loop.
    next_process_time: float = 0.0

    from alpr_engine import engine

    try:
        while not stop.is_set():
            now = time.monotonic()

            # ── Idle: drain the camera buffer cheaply ─────────────────────
            if now < next_process_time:
                if not cap.grab():
                    consecutive_failures += 1
                    if consecutive_failures >= max_failures_reopen:
                        _reopen_capture(cap, source, gate_id)
                        consecutive_failures = 0
                    time.sleep(0.01)
                else:
                    consecutive_failures = 0
                    time.sleep(0.01)
                continue

            # ── Process: decode + ALPR ────────────────────────────────────
            ret, frame = cap.read()
            next_process_time = now + PROCESS_INTERVAL_SEC

            if not ret or frame is None:
                consecutive_failures += 1
                logger.warning(
                    "Gate %s: frame read failed (%d/%d)",
                    gate_id,
                    consecutive_failures,
                    max_failures_reopen,
                )
                if consecutive_failures >= max_failures_reopen:
                    cap.release()
                    time.sleep(1)
                    if stop.is_set():
                        break
                    try:
                        cap = _open_capture(source)
                        consecutive_failures = 0
                        logger.info("Gate %s: camera re-opened", gate_id)
                    except Exception as exc:  # noqa: BLE001
                        logger.error("Gate %s: re-open failed — %s", gate_id, exc)
                        time.sleep(3)
                continue

            consecutive_failures = 0

            # Pass the numpy frame directly — avoids JPEG encode→decode round-trip
            result = engine.recognize_from_frame(frame)
            now = time.monotonic()

            # ── Periodic console log ──────────────────────────────────────
            if now - last_detection_log_time >= DETECTION_LOG_INTERVAL_SEC:
                last_detection_log_time = now
                if not result.success:
                    err = (result.error or "no result").strip()
                    logger.info("Gate %s | scan | OCR/detector: %s", gate_id, err[:200])
                elif result.best is None:
                    logger.info("Gate %s | scan | no plate crop (YOLO found nothing usable)", gate_id)
                else:
                    b = result.best
                    is_new = b.plate != last_pushed_plate or (now - last_push_time) >= min_push_interval
                    parts = [
                        f"plate={b.plate}",
                        f"raw={b.raw_ocr!r}",
                        f"conf={b.confidence * 100:.1f}%",
                        f"valid_fmt={b.is_valid}",
                        f"push_thr={BAR_CONFIDENCE_THRESHOLD * 100:.0f}%",
                    ]
                    if not b.is_valid:
                        parts.append("→ NOT sent: invalid Turkish plate format")
                    elif b.confidence < BAR_CONFIDENCE_THRESHOLD:
                        parts.append(
                            f"→ NOT sent: confidence below threshold ({b.confidence * 100:.1f}% < {BAR_CONFIDENCE_THRESHOLD * 100:.0f}%)"
                        )
                    elif not is_new:
                        parts.append("→ NOT sent: same plate cooldown (min 3s between pushes)")
                    else:
                        parts.append("→ sending to /api/candidate …")
                    logger.info("Gate %s | %s", gate_id, " | ".join(parts))

            if not result.success or result.best is None:
                continue

            best = result.best
            is_new = best.plate != last_pushed_plate or (now - last_push_time) >= min_push_interval
            if best.confidence >= BAR_CONFIDENCE_THRESHOLD and best.is_valid and is_new:
                if _push_candidate(
                    gate_id,
                    best.plate,
                    best.raw_ocr,
                    best.confidence,
                    best.is_valid,
                ):
                    last_pushed_plate = best.plate
                    last_push_time = now

    finally:
        cap.release()
        logger.info("Gate %s: camera worker stopped", gate_id)


def _reopen_capture(cap: cv2.VideoCapture, source: int | str, gate_id: int) -> cv2.VideoCapture:
    """Release and reopen a VideoCapture — called after repeated grab failures."""
    cap.release()
    time.sleep(1)
    try:
        new_cap = _open_capture(source)
        logger.info("Gate %s: camera re-opened after grab failures", gate_id)
        return new_cap
    except Exception as exc:  # noqa: BLE001
        logger.error("Gate %s: re-open failed — %s", gate_id, exc)
        time.sleep(3)
        return cap


def run() -> None:
    from alpr_engine import engine

    logger.info("Loading ALPR models (this may take a moment)…")
    engine._load_models()
    if not engine.is_ready():
        logger.error("ALPR engine failed to initialise. Check MODEL_PATH and dependencies.")
        sys.exit(1)
    logger.info("ALPR engine ready.")
    logger.info(
        "Processing interval: %.2f s (%.1f inferences/sec per gate)",
        PROCESS_INTERVAL_SEC,
        1.0 / PROCESS_INTERVAL_SEC if PROCESS_INTERVAL_SEC > 0 else 0,
    )

    stop_all = threading.Event()
    threads: list[threading.Thread] = []
    last_sig: tuple[Any, ...] | None = None

    def stop_workers() -> None:
        stop_all.set()
        for t in threads:
            t.join(timeout=5)
        threads.clear()
        stop_all.clear()

    try:
        while True:
            try:
                active = _fetch_active_gates()
            except requests.RequestException as exc:
                logger.warning("Cannot reach API (%s) — retrying in 5 s…", exc)
                time.sleep(5)
                continue

            if not active:
                logger.warning(
                    "No active gates — open %s/gates in the browser and add at least one gate "
                    "(camera + barrier).",
                    API_BASE_URL,
                )
                stop_workers()
                last_sig = None
                time.sleep(10)
                continue

            sig = _gate_signature(active)
            if sig == last_sig and threads and all(t.is_alive() for t in threads):
                time.sleep(GATES_POLL_SEC)
                continue

            logger.info("Starting %d camera worker(s)…", len(active))
            for g in active:
                logger.info(
                    "  • gate_id=%s label=%r camera_source=%r barrier=%s",
                    g.get("id"),
                    g.get("label"),
                    g.get("camera_source"),
                    g.get("barrier_driver"),
                )
            logger.info(
                "Bariyer ekranı için doğru URL: %s/gate?gate_id=<yukarıdaki_gate_id>",
                API_BASE_URL,
            )
            stop_workers()

            for g in active:
                t = threading.Thread(
                    target=_gate_worker,
                    args=(stop_all, g),
                    name=f"gate-{g['id']}",
                    daemon=True,
                )
                t.start()
                threads.append(t)

            last_sig = sig
            time.sleep(GATES_POLL_SEC)

    except KeyboardInterrupt:
        logger.info("Stopping camera loop (keyboard interrupt).")
    finally:
        stop_workers()


if __name__ == "__main__":
    run()
