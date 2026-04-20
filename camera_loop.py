"""
Live camera loop — reads frames from the configured camera source (iPhone via
Continuity Camera, EpocCam, or any OpenCV-compatible device) and pushes
high-confidence plate detections to the local ALPR API as candidates.

Usage:
    python camera_loop.py

Environment variables (from .env):
    CAMERA_SOURCE              Camera index (int) or RTSP/HTTP URL. Default: 1
    BAR_CONFIDENCE_THRESHOLD   Min confidence to push a candidate. Default: 0.90
    API_BASE_URL               Base URL of the FastAPI backend. Default: http://localhost:8000
    DETECTION_CONFIDENCE       Min YOLO detection score. Default: 0.4
    OCR_CONFIDENCE             Min EasyOCR character score. Default: 0.3
    FRAME_SKIP                 Process 1 in every N frames. Default: 5
    LOG_LEVEL                  INFO or DEBUG. Default: INFO
    STATUS_EVERY_SEC           Print periodic detection status. Default: 5
"""

from __future__ import annotations

import os
import sys
import time
import logging

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

# ── Config ────────────────────────────────────────────────────────────────────

_raw_source = os.getenv("CAMERA_SOURCE", "1")
try:
    CAMERA_SOURCE: int | str = int(_raw_source)
except ValueError:
    CAMERA_SOURCE = _raw_source  # treat as URL string

BAR_CONFIDENCE_THRESHOLD = float(os.getenv("BAR_CONFIDENCE_THRESHOLD", "0.90"))
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000").rstrip("/")
FRAME_SKIP = int(os.getenv("FRAME_SKIP", "5"))
STATUS_EVERY_SEC = float(os.getenv("STATUS_EVERY_SEC", "5"))

CANDIDATE_URL = f"{API_BASE_URL}/api/candidate"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _open_camera(source: int | str) -> cv2.VideoCapture:
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        logger.error(
            "Could not open camera source: %s\n"
            "  • For iPhone via Continuity Camera try index 1 or 2\n"
            "  • Run: python -c \"import cv2; "
            "[print(i, cv2.VideoCapture(i).isOpened()) for i in range(5)]\"\n"
            "  • Make sure your iPhone is unlocked and nearby",
            source,
        )
        sys.exit(1)
    logger.info("Camera opened: %s", source)
    return cap


def _push_candidate(plate: str, raw_ocr: str, confidence: float, is_valid: bool) -> None:
    payload = {
        "plate": plate,
        "raw_ocr": raw_ocr,
        "confidence": confidence,
        "is_valid": is_valid,
    }
    try:
        resp = requests.post(CANDIDATE_URL, json=payload, timeout=2)
        resp.raise_for_status()
        logger.info("Pushed candidate → %s (%.0f%%)", plate, confidence * 100)
    except requests.RequestException as exc:
        logger.warning("Failed to push candidate: %s", exc)


# ── Main loop ─────────────────────────────────────────────────────────────────

def run() -> None:
    from alpr_engine import engine

    logger.info("Loading ALPR models (this may take a moment)…")
    engine._load_models()
    if not engine.is_ready():
        logger.error("ALPR engine failed to initialise. Check MODEL_PATH and dependencies.")
        sys.exit(1)
    logger.info("ALPR engine ready.")

    cap = _open_camera(CAMERA_SOURCE)
    logger.info(
        "Starting live loop — confidence threshold: %.0f%% — frame skip: %d",
        BAR_CONFIDENCE_THRESHOLD * 100,
        FRAME_SKIP,
    )

    frame_idx = 0
    last_pushed_plate: str | None = None
    last_push_time: float = 0.0
    last_status_time: float = 0.0
    consecutive_read_failures = 0
    MIN_PUSH_INTERVAL = 3.0  # seconds — avoid spamming the same plate
    MAX_READ_FAILURES_BEFORE_REOPEN = 3

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                consecutive_read_failures += 1
                logger.warning(
                    "Failed to read frame (%d/%d) — retrying in 1 s…",
                    consecutive_read_failures,
                    MAX_READ_FAILURES_BEFORE_REOPEN,
                )
                if consecutive_read_failures >= MAX_READ_FAILURES_BEFORE_REOPEN:
                    logger.warning("Re-opening camera source: %s", CAMERA_SOURCE)
                    cap.release()
                    time.sleep(1)
                    cap = _open_camera(CAMERA_SOURCE)
                    consecutive_read_failures = 0
                time.sleep(1)
                continue
            consecutive_read_failures = 0

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
            logger.debug(
                "Detected: %s | conf=%.2f | valid=%s",
                best.plate, best.confidence, best.is_valid,
            )

            now = time.monotonic()
            if now - last_status_time >= STATUS_EVERY_SEC:
                logger.info(
                    "Best detection → raw OCR: %s → cleaned plate: %s | conf=%.1f%% valid=%s (threshold=%.1f%%)",
                    best.raw_ocr,
                    best.plate,
                    best.confidence * 100,
                    best.is_valid,
                    BAR_CONFIDENCE_THRESHOLD * 100,
                )
                last_status_time = now
            is_new = (
                best.plate != last_pushed_plate
                or (now - last_push_time) >= MIN_PUSH_INTERVAL
            )

            if (
                best.confidence >= BAR_CONFIDENCE_THRESHOLD
                and best.is_valid
                and is_new
            ):
                _push_candidate(best.plate, best.raw_ocr, best.confidence, best.is_valid)
                last_pushed_plate = best.plate
                last_push_time = now

    except KeyboardInterrupt:
        logger.info("Stopping camera loop.")
    finally:
        cap.release()


if __name__ == "__main__":
    run()
