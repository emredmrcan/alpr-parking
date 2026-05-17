"""Resolve ALPR / OCR compute devices from environment (auto → CPU fallback)."""

from __future__ import annotations

import logging
import os
from typing import Any, Union

logger = logging.getLogger(__name__)

AlprDevice = Union[str, int]


def env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def torch_cuda_available() -> bool:
    try:
        import torch

        return bool(torch.cuda.is_available())
    except Exception:
        return False


def ort_cuda_available() -> bool:
    try:
        import onnxruntime as ort

        return "CUDAExecutionProvider" in ort.get_available_providers()
    except Exception:
        return False


def _normalize_device_setting(raw: str) -> str:
    return raw.strip().lower()


def resolve_alpr_device() -> AlprDevice:
    """Return Ultralytics YOLO device: 'cpu', 0, 'cuda:0', etc."""
    setting = _normalize_device_setting(os.getenv("ALPR_DEVICE", "auto"))

    if setting in ("", "auto"):
        if torch_cuda_available():
            return 0
        return "cpu"

    if setting == "cpu":
        return "cpu"

    if setting in ("cuda", "gpu"):
        if torch_cuda_available():
            return 0
        logger.warning("ALPR_DEVICE=%s but PyTorch CUDA is unavailable — using CPU", setting)
        return "cpu"

    if setting.startswith("cuda:"):
        if torch_cuda_available():
            suffix = setting.split(":", 1)[1]
            return int(suffix) if suffix.isdigit() else suffix
        logger.warning("ALPR_DEVICE=%s but PyTorch CUDA is unavailable — using CPU", setting)
        return "cpu"

    if setting.isdigit():
        idx = int(setting)
        if torch_cuda_available():
            return idx
        logger.warning("ALPR_DEVICE=%s but PyTorch CUDA is unavailable — using CPU", setting)
        return "cpu"

    logger.warning("Unknown ALPR_DEVICE=%r — using CPU", setting)
    return "cpu"


def resolve_ocr_use_cuda() -> bool:
    """Whether RapidOCR should request ONNX Runtime CUDA for recognition."""
    setting = _normalize_device_setting(os.getenv("OCR_DEVICE", "auto"))

    if setting == "cpu":
        return False

    if setting in ("", "auto"):
        return ort_cuda_available()

    if setting in ("cuda", "gpu") or setting.startswith("cuda:"):
        if ort_cuda_available():
            return True
        logger.warning(
            "OCR_DEVICE=%s but CUDAExecutionProvider is unavailable — using CPU OCR",
            setting,
        )
        return False

    logger.warning("Unknown OCR_DEVICE=%r — using CPU OCR", setting)
    return False


def format_alpr_device(device: AlprDevice) -> str:
    if device == "cpu":
        return "cpu"
    return f"cuda:{device}"


def log_device_summary(alpr_device: AlprDevice, ocr_use_cuda: bool) -> None:
    ort_providers: Any = "n/a"
    try:
        import onnxruntime as ort

        ort_providers = ort.get_available_providers()
    except Exception:
        pass

    logger.info(
        "ALPR compute: YOLO device=%s | OCR CUDA requested=%s | ONNX providers=%s",
        format_alpr_device(alpr_device),
        ocr_use_cuda,
        ort_providers,
    )
