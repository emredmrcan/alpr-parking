"""
In-memory candidate store.

The camera loop pushes the current best plate detection here via POST.
The Gate UI polls GET to display it.  DELETE resets after the worker
acknowledges or the bar has been opened.

Nothing here is persisted to the database — that happens only when the
worker presses "Confirm Entry" in the main session flow.
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/candidate", tags=["candidate"])

# ── In-memory state (thread-safe) ────────────────────────────────────────────

_lock = threading.Lock()

_current: Optional[dict] = None


# ── Schemas ───────────────────────────────────────────────────────────────────

class CandidateIn(BaseModel):
    plate: str
    raw_ocr: str
    confidence: float = Field(ge=0.0, le=1.0)
    is_valid: bool


class CandidateOut(BaseModel):
    plate: str
    raw_ocr: str
    confidence: float
    is_valid: bool
    detected_at: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", response_model=CandidateOut, status_code=200, summary="Camera loop pushes a detected plate candidate")
def push_candidate(body: CandidateIn) -> CandidateOut:
    global _current
    record = {
        "plate": body.plate.upper().strip(),
        "raw_ocr": body.raw_ocr,
        "confidence": body.confidence,
        "is_valid": body.is_valid,
        "detected_at": datetime.now(timezone.utc).isoformat(),
    }
    with _lock:
        _current = record
    return CandidateOut(**record)


@router.get("", response_model=Optional[CandidateOut], summary="Gate UI polls for the current plate candidate")
def get_candidate() -> Optional[CandidateOut]:
    with _lock:
        if _current is None:
            return None
        return CandidateOut(**_current)


@router.delete("", status_code=204, summary="Reset candidate after worker acknowledges")
def clear_candidate() -> None:
    global _current
    with _lock:
        _current = None
