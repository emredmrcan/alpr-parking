"""
Per-gate in-memory candidate store.

Each camera worker POSTs to /api/candidate with its ``gate_id`` (from ``parking_gates``).
The Gate UI polls GET /api/candidate?gate_id=… for the lane it is serving.
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/candidate", tags=["candidate"])

_lock = threading.Lock()

# gate_id → latest candidate record (only the newest detection per gate)
_by_gate: dict[int, dict] = {}


class CandidateIn(BaseModel):
    gate_id: int = Field(..., ge=1, description="parking_gates.id from Kapı ayarları")
    plate: str
    raw_ocr: str
    confidence: float = Field(ge=0.0, le=1.0)
    is_valid: bool


class CandidateOut(BaseModel):
    gate_id: int
    plate: str
    raw_ocr: str
    confidence: float
    is_valid: bool
    detected_at: str


@router.post("", response_model=CandidateOut, status_code=200, summary="Camera worker pushes a plate candidate for one gate")
def push_candidate(body: CandidateIn) -> CandidateOut:
    record = {
        "gate_id": body.gate_id,
        "plate": body.plate.upper().strip(),
        "raw_ocr": body.raw_ocr,
        "confidence": body.confidence,
        "is_valid": body.is_valid,
        "detected_at": datetime.now(timezone.utc).isoformat(),
    }
    with _lock:
        _by_gate[body.gate_id] = record
    return CandidateOut(**record)


@router.get("", response_model=Optional[CandidateOut], summary="Poll the latest candidate for a gate")
def get_candidate(gate_id: int = Query(..., ge=1, description="parking_gates.id")) -> Optional[CandidateOut]:
    with _lock:
        rec = _by_gate.get(gate_id)
        if rec is None:
            return None
        return CandidateOut(**rec)


@router.delete("", status_code=204, summary="Clear the candidate buffer for one gate")
def clear_candidate(gate_id: int = Query(..., ge=1)) -> None:
    with _lock:
        if gate_id in _by_gate:
            del _by_gate[gate_id]
