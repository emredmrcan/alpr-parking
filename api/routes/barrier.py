from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from api.barrier import get_barrier_controller, trigger_barrier_open
from api.database import get_db
from api.models import BarrierEvent, ParkingGate
from api.schemas import BarrierEventOut, BarrierHealthOut, BarrierTestOpenOut

router = APIRouter(prefix="/barrier", tags=["barrier"])


@router.get("/health", response_model=BarrierHealthOut, summary="Barrier driver status")
def barrier_health() -> BarrierHealthOut:
    ctrl = get_barrier_controller()
    h = ctrl.health_check()
    return BarrierHealthOut(
        connected=h["connected"],
        driver=h["driver"],
        barrier_type=os.getenv("BARRIER_TYPE", "dummy").lower(),
    )


@router.post(
    "/test-open",
    response_model=BarrierTestOpenOut,
    summary="Pulse the barrier once (hardware test / commissioning)",
)
def barrier_test_open(
    gate_id: Optional[int] = Query(
        None,
        ge=1,
        description="When set, use this gate's barrier driver (see GET /api/gates).",
    ),
    duration_sec: Optional[float] = Query(
        None,
        gt=0,
        le=30,
        description="Relay pulse length override (seconds); ignored for IP barriers",
    ),
    plate_number: Optional[str] = Query(
        None,
        description="Optional plate number stored on the audit row",
    ),
    session_id: Optional[int] = Query(
        None,
        ge=1,
        description="Optional parking_sessions.id stored on the audit row",
    ),
    db: Session = Depends(get_db),
) -> BarrierTestOpenOut:
    gate = None
    if gate_id is not None:
        gate = db.query(ParkingGate).filter(ParkingGate.id == gate_id).first()
        if not gate:
            raise HTTPException(status_code=404, detail="Kapı bulunamadı.")

    ok, ev = trigger_barrier_open(
        db,
        plate_number=plate_number,
        session_id=session_id,
        gate=gate,
        trigger_type="MANUAL_TEST",
        duration_sec=duration_sec,
    )
    return BarrierTestOpenOut(success=ok, event_id=ev.id, notes=ev.notes)


@router.get(
    "/events",
    response_model=list[BarrierEventOut],
    summary="Recent barrier hardware events (newest first)",
)
def list_barrier_events(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> list[BarrierEventOut]:
    rows = (
        db.query(BarrierEvent)
        .order_by(BarrierEvent.id.desc())
        .limit(limit)
        .all()
    )
    return [BarrierEventOut.model_validate(r) for r in rows]
