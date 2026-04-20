"""
Headless ALPR engine — no cv2.imshow, no window management.
Designed for use from the FastAPI backend (accepts bytes, returns dicts).
"""

from __future__ import annotations

import os
import logging
from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

MODEL_PATH = os.getenv("MODEL_PATH", "runs/detect/runs/detect/turkish_plate_run/weights/best.pt")
DETECTION_CONFIDENCE = float(os.getenv("DETECTION_CONFIDENCE", "0.4"))
OCR_CONFIDENCE = float(os.getenv("OCR_CONFIDENCE", "0.3"))
ALLOWLIST = "0123456789ABCDEFGHIJKLMNOPRSTUVYZ"


@dataclass
class PlateCandidate:
    plate: str
    raw_ocr: str
    confidence: float
    is_valid: bool
    bbox: list = field(default_factory=list)


@dataclass
class RecognitionResult:
    success: bool
    candidates: list[PlateCandidate] = field(default_factory=list)
    best: Optional[PlateCandidate] = None
    error: Optional[str] = None


class ALPREngine:
    """Singleton ALPR engine that loads models once and reuses them."""

    _instance: Optional["ALPREngine"] = None

    def __new__(cls) -> "ALPREngine":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._model = None
        self._reader = None
        self._initialized = True

    def _load_models(self) -> None:
        if self._model is not None and self._reader is not None:
            return
        try:
            from ultralytics import YOLO
            self._model = YOLO(MODEL_PATH)
            logger.info("YOLO model loaded from %s", MODEL_PATH)
        except Exception as exc:
            logger.error("Failed to load YOLO model: %s", exc)
            self._model = None

        try:
            import easyocr
            self._reader = easyocr.Reader(["en", "tr"], gpu=False)
            logger.info("EasyOCR reader initialised")
        except Exception as exc:
            logger.error("Failed to initialise EasyOCR: %s", exc)
            self._reader = None

    def is_ready(self) -> bool:
        return self._model is not None and self._reader is not None

    def recognize_from_bytes(self, image_bytes: bytes) -> RecognitionResult:
        self._load_models()

        if not self.is_ready():
            return RecognitionResult(
                success=False,
                error="ALPR models not available — check MODEL_PATH and dependencies",
            )

        nparr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            return RecognitionResult(success=False, error="Could not decode image")

        return self._process_frame(frame)

    def recognize_from_path(self, path: str) -> RecognitionResult:
        self._load_models()

        if not self.is_ready():
            return RecognitionResult(
                success=False,
                error="ALPR models not available",
            )

        frame = cv2.imread(path)
        if frame is None:
            return RecognitionResult(success=False, error=f"Could not read {path}")

        return self._process_frame(frame)

    def _process_frame(self, frame: np.ndarray) -> RecognitionResult:
        from utils.plate_utils import preprocess_plate, validate_tr_plate, clean_tr_plate as preprocess_ocr

        try:
            results = self._model(frame, verbose=False)[0]
        except Exception as exc:
            return RecognitionResult(success=False, error=f"Detection failed: {exc}")

        if len(results.boxes) == 0:
            return RecognitionResult(success=True, candidates=[], best=None)

        candidates: list[PlateCandidate] = []

        for box_data in results.boxes.data.tolist():
            x1, y1, x2, y2, score, _ = box_data
            if score < DETECTION_CONFIDENCE:
                continue

            x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
            h, w = frame.shape[:2]
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)

            if x2 <= x1 or y2 <= y1:
                continue

            plate_crop = frame[y1:y2, x1:x2]
            if plate_crop.size == 0:
                continue

            processed = preprocess_plate(plate_crop)
            if processed is None:
                continue

            try:
                detections = self._reader.readtext(
                    processed,
                    allowlist=ALLOWLIST,
                    paragraph=False,
                    detail=1,
                )
            except Exception as exc:
                logger.warning("OCR error: %s", exc)
                continue

            texts = [(bbox, text, prob) for bbox, text, prob in detections if prob >= OCR_CONFIDENCE]
            if not texts:
                continue

            texts.sort(key=lambda x: x[0][0][0])
            combined = "".join(t[1] for t in texts)
            avg_conf = sum(t[2] for t in texts) / len(texts)

            corrected = preprocess_ocr(combined)
            is_valid, clean = validate_tr_plate(corrected)
            if corrected != combined:
                logger.info("OCR correction: %s → %s (valid=%s)", combined, clean, is_valid)
            candidates.append(
                PlateCandidate(
                    plate=clean,
                    raw_ocr=combined,
                    confidence=round(avg_conf, 4),
                    is_valid=is_valid,
                    bbox=[x1, y1, x2, y2],
                )
            )

        if not candidates:
            return RecognitionResult(success=True, candidates=[], best=None)

        candidates.sort(key=lambda c: (c.is_valid, c.confidence), reverse=True)
        return RecognitionResult(success=True, candidates=candidates, best=candidates[0])


engine = ALPREngine()
