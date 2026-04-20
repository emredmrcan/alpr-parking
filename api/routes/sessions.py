from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from api.database import get_db
from api.models import ParkingSession, PriceRule
from api.schemas import (
    ExitConfirm,
    PriceSummary,
    SessionCreate,
    SessionListOut,
    SessionOut,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def _calculate_fee(duration_minutes: int, db: Session) -> Decimal:
    rules = (
        db.query(PriceRule)
        .order_by(PriceRule.duration_from_min)
        .all()
    )
    if not rules:
        return Decimal("0.00")

    for rule in rules:
        lower = rule.duration_from_min
        upper = rule.duration_to_min
        if duration_minutes >= lower and (upper is None or duration_minutes < upper):
            return Decimal(str(rule.price))

    # Fallback: last rule
    return Decimal(str(rules[-1].price))


def _get_active_session(plate: str, db: Session) -> Optional[ParkingSession]:
    return (
        db.query(ParkingSession)
        .filter(
            ParkingSession.plate_number == plate.upper(),
            ParkingSession.status == "ACTIVE",
        )
        .order_by(ParkingSession.entrance_time.desc())
        .first()
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", response_model=SessionOut, status_code=201, summary="Confirm entry — create a new parking session")
def create_session(body: SessionCreate, db: Session = Depends(get_db)) -> SessionOut:
    plate = body.plate_number.upper().strip()

    existing = _get_active_session(plate, db)
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"An ACTIVE session already exists for plate {plate} (id={existing.id}).",
        )

    session = ParkingSession(
        plate_number=plate,
        raw_ocr_text=body.raw_ocr_text,
        entrance_time=datetime.now(timezone.utc),
        status="ACTIVE",
        entered_manually=body.entered_manually,
        image_path=body.image_path,
        notes=body.notes,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return SessionOut.model_validate(session)


@router.get("", response_model=SessionListOut, summary="List all sessions")
def list_sessions(
    status: Optional[str] = Query(None, description="Filter by status: ACTIVE or PAID"),
    plate: Optional[str] = Query(None, description="Filter by plate number (partial match)"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> SessionListOut:
    q = db.query(ParkingSession)
    if status:
        q = q.filter(ParkingSession.status == status.upper())
    if plate:
        q = q.filter(ParkingSession.plate_number.ilike(f"%{plate.upper()}%"))
    total = q.count()
    items = q.order_by(ParkingSession.entrance_time.desc()).offset(offset).limit(limit).all()
    return SessionListOut(total=total, items=[SessionOut.model_validate(s) for s in items])


@router.get("/plate/{plate_number}", response_model=PriceSummary, summary="Look up the active session and fee for a plate")
def get_active_session_by_plate(plate_number: str, db: Session = Depends(get_db)) -> PriceSummary:
    session = _get_active_session(plate_number, db)
    if not session:
        raise HTTPException(
            status_code=404,
            detail=f"No ACTIVE session found for plate {plate_number.upper()}.",
        )

    now = datetime.now(timezone.utc)
    entrance = session.entrance_time
    if entrance.tzinfo is None:
        entrance = entrance.replace(tzinfo=timezone.utc)
    duration = int((now - entrance).total_seconds() / 60)
    fee = _calculate_fee(duration, db)

    return PriceSummary(
        session_id=session.id,
        plate_number=session.plate_number,
        entrance_time=session.entrance_time,
        duration_minutes=duration,
        amount_due=fee,
    )


@router.get("/{session_id}", response_model=SessionOut, summary="Get session by ID")
def get_session(session_id: int, db: Session = Depends(get_db)) -> SessionOut:
    session = db.query(ParkingSession).filter(ParkingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")
    return SessionOut.model_validate(session)


@router.post("/{session_id}/exit", response_model=SessionOut, summary="Confirm payment and close a session")
def confirm_exit(
    session_id: int,
    body: ExitConfirm,
    db: Session = Depends(get_db),
) -> SessionOut:
    session = db.query(ParkingSession).filter(ParkingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")
    if session.status != "ACTIVE":
        raise HTTPException(
            status_code=409,
            detail=f"Session {session_id} is already {session.status}.",
        )

    now = datetime.now(timezone.utc)
    entrance = session.entrance_time
    if entrance.tzinfo is None:
        entrance = entrance.replace(tzinfo=timezone.utc)
    duration = int((now - entrance).total_seconds() / 60)
    fee = _calculate_fee(duration, db)

    session.exit_time = now
    session.duration_minutes = duration
    session.amount_due = fee
    session.amount_paid = body.amount_paid
    session.exit_image_path = body.exit_image_path
    session.status = "PAID"
    if body.notes:
        existing_notes = session.notes or ""
        session.notes = f"{existing_notes}\n[exit] {body.notes}".strip()
    session.updated_at = now

    db.commit()
    db.refresh(session)
    return SessionOut.model_validate(session)
