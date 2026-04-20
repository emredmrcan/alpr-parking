from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File

from api.schemas import PlateCandidateOut, RecognitionOut

router = APIRouter(prefix="/recognize", tags=["recognition"])

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/bmp"}
MAX_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB


@router.post("", response_model=RecognitionOut, summary="Upload an image and detect the licence plate")
async def recognize_plate(file: UploadFile = File(...)) -> RecognitionOut:
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{file.content_type}'. Allowed: JPEG, PNG, WebP, BMP.",
        )

    image_bytes = await file.read()
    if len(image_bytes) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds 20 MB limit.")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "image.jpg").suffix or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = UPLOAD_DIR / filename
    dest.write_bytes(image_bytes)

    from alpr_engine import engine

    result = engine.recognize_from_bytes(image_bytes)

    if not result.success:
        return RecognitionOut(
            success=False,
            image_path=str(dest),
            error=result.error,
        )

    best_out = None
    if result.best:
        best_out = PlateCandidateOut(
            plate=result.best.plate,
            raw_ocr=result.best.raw_ocr,
            confidence=result.best.confidence,
            is_valid=result.best.is_valid,
            bbox=result.best.bbox,
        )

    candidates_out = [
        PlateCandidateOut(
            plate=c.plate,
            raw_ocr=c.raw_ocr,
            confidence=c.confidence,
            is_valid=c.is_valid,
            bbox=c.bbox,
        )
        for c in result.candidates
    ]

    return RecognitionOut(
        success=True,
        best=best_out,
        candidates=candidates_out,
        image_path=str(dest),
    )
