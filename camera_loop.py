"""
Live camera workers — one OpenCV capture + ALPR pipeline per active ``parking_gates`` row.

Operators configure **camera + barrier** in the web UI (**Kapı ayarları**). This script
polls ``GET /api/gates`` and starts / restarts workers when the configuration changes.

Usage:
    python camera_loop.py

Environment (see .env):
    API_BASE_URL               FastAPI root. Default: http://localhost:8000
    GATES_POLL_SEC             Re-fetch gate list interval (seconds). Default: 30
    BAR_CONFIDENCE_THRESHOLD   Min confidence to push a candidate. Default: 0.90
    FRAME_SKIP                 Process 1 in every N frames. Default: 5
    LOG_LEVEL / STATUS_EVERY_SEC / DETECTION_CONFIDENCE / OCR_CONFIDENCE (via alpr_engine)
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
    format="%(asctime)s [camera_loop] %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000").rstrip("/")
GATES_URL = f"{API_BASE_URL}/api/gates"
CANDIDATE_URL = f"{API_BASE_URL}/api/candidate"

BAR_CONFIDENCE_THRESHOLD = float(os.getenv("BAR_CONFIDENCE_THRESHOLD", "0.90"))
FRAME_SKIP = int(os.getenv("FRAME_SKIP", "5"))
STATUS_EVERY_SEC = float(os.getenv("STATUS_EVERY_SEC", "5"))
GATES_POLL_SEC = float(os.getenv("GATES_POLL_SEC", "30"))


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
) -> None:
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
        logger.info("Gate %s → pushed candidate %s (%.0f%%)", gate_id, plate, confidence * 100)
    except requests.RequestException as exc:
        logger.warning("Gate %s → failed to push candidate: %s", gate_id, exc)


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

    frame_idx = 0
    last_pushed_plate: str | None = None
    last_push_time: float = 0.0
    last_status_time: float = 0.0
    consecutive_failures = 0
    min_push_interval = 3.0
    max_failures_reopen = 3

    from alpr_engine import engine

    try:
        while not stop.is_set():
            ret, frame = cap.read()
            if not ret:
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
                else:
                    time.sleep(0.2)
                continue

            consecutive_failures = 0
            frame_idx += 1
            if frame_idx % FRAME_SKIP != 0:
                continue

            ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if not ok:
                continue

            result = engine.recognize_from_bytes(buf.tobytes())
            if not result.success or result.best is None:
                continue

            best = result.best
            now = time.monotonic()
            if now - last_status_time >= STATUS_EVERY_SEC:
                logger.info(
                    "Gate %s best → %s | conf=%.1f%% valid=%s (thr=%.1f%%)",
                    gate_id,
                    best.plate,
                    best.confidence * 100,
                    best.is_valid,
                    BAR_CONFIDENCE_THRESHOLD * 100,
                )
                last_status_time = now

            is_new = best.plate != last_pushed_plate or (now - last_push_time) >= min_push_interval
            if best.confidence >= BAR_CONFIDENCE_THRESHOLD and best.is_valid and is_new:
                _push_candidate(
                    gate_id,
                    best.plate,
                    best.raw_ocr,
                    best.confidence,
                    best.is_valid,
                )
                last_pushed_plate = best.plate
                last_push_time = now

    finally:
        cap.release()
        logger.info("Gate %s: camera worker stopped", gate_id)


def run() -> None:
    from alpr_engine import engine

    logger.info("Loading ALPR models (this may take a moment)…")
    engine._load_models()
    if not engine.is_ready():
        logger.error("ALPR engine failed to initialise. Check MODEL_PATH and dependencies.")
        sys.exit(1)
    logger.info("ALPR engine ready.")

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
