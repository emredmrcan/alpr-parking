"""
Headless ALPR engine — no cv2.imshow, no window management.
Designed for use from the FastAPI backend (accepts bytes, returns dicts).
"""

from __future__ import annotations

import logging
import os
import threading
from dataclasses import dataclass, field
from typing import Any, Optional

import cv2
import numpy as np
from dotenv import load_dotenv

from utils.device_config import (
    AlprDevice,
    env_bool,
    format_alpr_device,
    log_device_summary,
    resolve_alpr_device,
    resolve_ocr_use_cuda,
)

load_dotenv()

# On Windows, Python often ships without the system CA bundle, causing
# SSL: CERTIFICATE_VERIFY_FAILED when EasyOCR tries to download models.
# Use certifi's bundle when available so downloads succeed.
try:
    import certifi
    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
    os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())
except ImportError:
    pass

logger = logging.getLogger(__name__)

MODEL_PATH = os.getenv("MODEL_PATH", "runs/detect/runs/detect/turkish_plate_run2/weights/best.pt")
DETECTION_CONFIDENCE = float(os.getenv("DETECTION_CONFIDENCE", "0.4"))
OCR_CONFIDENCE = float(os.getenv("OCR_CONFIDENCE", "0.3"))
# Maximum width (pixels) to which frames are downscaled before YOLO inference.
# Smaller resolution = significantly faster CPU inference with minimal accuracy loss.
# Set to 0 to disable downscaling (use full camera resolution).
PROCESS_WIDTH = int(os.getenv("PROCESS_WIDTH", "960"))

# When false, RapidOCR skips its own text detection / angle classifier because YOLO
# already supplies a plate crop (lower CPU). Defaults true when unset — same as legacy.
OCR_USE_DET = env_bool("OCR_USE_DET", True)
OCR_USE_CLS = env_bool("OCR_USE_CLS", True)


def _create_rapidocr_reader(use_cuda: bool, use_det: bool, use_cls: bool) -> Any:
    """Initialise RapidOCR; enable CUDA on the recognition model when requested."""
    from rapidocr_onnxruntime import RapidOCR

    kwargs: dict[str, Any] = {
        "use_text_det": use_det,
        "use_angle_cls": use_cls,
    }

    # Newer rapidocr-onnxruntime builds accept *_use_cuda kwargs directly.
    if use_cuda:
        kwargs.update(
            det_use_cuda=True,
            cls_use_cuda=True,
            rec_use_cuda=True,
        )

    try:
        reader = RapidOCR(**kwargs)
    except (TypeError, KeyError):
        reader = RapidOCR(use_text_det=use_det, use_angle_cls=use_cls)
        if use_cuda:
            _upgrade_rapidocr_recognizer_cuda(reader, use_det=use_det, use_cls=use_cls)

    if use_cuda:
        _log_rapidocr_providers(reader, use_det=use_det, use_cls=use_cls)

    return reader


def _upgrade_rapidocr_recognizer_cuda(reader: Any, *, use_det: bool, use_cls: bool) -> None:
    """Reload RapidOCR ONNX sessions with use_cuda=True (rapidocr-onnxruntime 1.2.x)."""
    import rapidocr_onnxruntime
    from rapidocr_onnxruntime.ch_ppocr_v3_rec.text_recognize import TextRecognizer
    from rapidocr_onnxruntime.utils import UpdateParameters, concat_model_path, read_yaml

    root = rapidocr_onnxruntime.__file__
    if root is None:
        raise RuntimeError("rapidocr_onnxruntime package path not found")

    from pathlib import Path

    config_path = Path(root).resolve().parent / "config.yaml"
    config = concat_model_path(read_yaml(str(config_path)))
    config = UpdateParameters()(
        config,
        use_text_det=use_det,
        use_angle_cls=use_cls,
    )
    config["Rec"]["use_cuda"] = True
    reader.text_recognizer = TextRecognizer(config["Rec"])

    if use_det and hasattr(reader, "text_detector"):
        from rapidocr_onnxruntime.ch_ppocr_v3_det.text_detect import TextDetector

        config["Det"]["use_cuda"] = True
        reader.text_detector = TextDetector(config["Det"])

    if use_cls and hasattr(reader, "text_cls"):
        from rapidocr_onnxruntime.ch_ppocr_v2_cls.text_cls import TextClassifier

        config["Cls"]["use_cuda"] = True
        reader.text_cls = TextClassifier(config["Cls"])


def _onnx_session_providers(session_wrapper: Any) -> list[str]:
    inner = getattr(session_wrapper, "session", session_wrapper)
    return list(inner.get_providers())


def _log_rapidocr_providers(reader: Any, *, use_det: bool, use_cls: bool) -> None:
    try:
        rec_eps = _onnx_session_providers(reader.text_recognizer.session)
        logger.info("RapidOCR recognition ONNX providers: %s", rec_eps)
        if use_det and hasattr(reader, "text_detector"):
            det_eps = _onnx_session_providers(reader.text_detector.session)
            logger.info("RapidOCR detection ONNX providers: %s", det_eps)
        if use_cls and hasattr(reader, "text_cls"):
            cls_eps = _onnx_session_providers(reader.text_cls.session)
            logger.info("RapidOCR classifier ONNX providers: %s", cls_eps)
    except Exception as exc:
        logger.warning("Could not read RapidOCR ONNX providers: %s", exc)


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
    _load_lock = threading.Lock()

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
        self._alpr_device: AlprDevice = "cpu"
        self._ocr_use_cuda = False
        self._initialized = True

    def _load_models(self) -> None:
        if self._model is not None and self._reader is not None:
            return

        # camera_loop workers call this concurrently; ensure only one thread
        # performs heavyweight model initialisation at a time.
        with self._load_lock:
            if self._model is not None and self._reader is not None:
                return

            self._alpr_device = resolve_alpr_device()
            self._ocr_use_cuda = resolve_ocr_use_cuda()
            log_device_summary(self._alpr_device, self._ocr_use_cuda)

            # Limit PyTorch and OpenCV thread counts so the process does not peg
            # all CPU cores during inference.  These are read once at model-load
            # time; changing them later in the same process has no effect.
            try:
                import torch
                _torch_threads = int(os.getenv("TORCH_THREADS", "2"))
                torch.set_num_threads(_torch_threads)
                logger.info("PyTorch thread count set to %d", _torch_threads)
            except Exception as exc:
                logger.warning("Could not set PyTorch thread count: %s", exc)

            _cv2_threads = int(os.getenv("CV2_THREADS", "2"))
            cv2.setNumThreads(_cv2_threads)
            logger.info("OpenCV thread count set to %d", _cv2_threads)

            try:
                from ultralytics import YOLO
                self._model = YOLO(MODEL_PATH)
                logger.info(
                    "YOLO model loaded from %s (inference device: %s)",
                    MODEL_PATH,
                    format_alpr_device(self._alpr_device),
                )
            except Exception as exc:
                logger.error("Failed to load YOLO model: %s", exc)
                self._model = None

            try:
                self._reader = _create_rapidocr_reader(
                    use_cuda=self._ocr_use_cuda,
                    use_det=OCR_USE_DET,
                    use_cls=OCR_USE_CLS,
                )
                logger.info(
                    "RapidOCR initialised (det=%s cls=%s cuda=%s)",
                    OCR_USE_DET,
                    OCR_USE_CLS,
                    self._ocr_use_cuda,
                )
            except Exception as exc:
                logger.error("Failed to initialise RapidOCR: %s", exc)
                self._reader = None

    def is_ready(self) -> bool:
        return self._model is not None and self._reader is not None

    def recognize_from_frame(self, frame: np.ndarray) -> RecognitionResult:
        """Run ALPR on a pre-decoded numpy frame (BGR, uint8).

        Preferred over recognize_from_bytes() when the caller already has the
        frame as a numpy array — avoids the JPEG encode→decode round-trip.
        """
        self._load_models()

        if not self.is_ready():
            return RecognitionResult(
                success=False,
                error="ALPR models not available — check MODEL_PATH and dependencies",
            )

        if frame is None or frame.size == 0:
            return RecognitionResult(success=False, error="Empty frame received")

        return self._process_frame(frame)

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

        # Downscale wide frames before YOLO — significantly reduces CPU on full-HD
        # cameras while preserving plate detection accuracy at typical distances.
        if PROCESS_WIDTH > 0 and frame.shape[1] > PROCESS_WIDTH:
            scale = PROCESS_WIDTH / frame.shape[1]
            frame = cv2.resize(
                frame,
                (PROCESS_WIDTH, int(frame.shape[0] * scale)),
                interpolation=cv2.INTER_LINEAR,
            )

        try:
            results = self._model(frame, verbose=False, device=self._alpr_device)[0]
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
                raw_result, _ = self._reader(processed)
                # RapidOCR returns (result, elapse).
                # result is None or a list of [bbox, text, score]
                # where bbox is [[x1,y1],[x2,y2],[x3,y3],[x4,y4]].
                page = raw_result if raw_result else []
            except Exception as exc:
                logger.warning("OCR error: %s", exc)
                continue

            texts = [(det[0], det[1], float(det[2])) for det in page if float(det[2]) >= OCR_CONFIDENCE]
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
