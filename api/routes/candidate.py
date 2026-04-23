"""
Per-gate in-memory candidate store.

Each camera worker POSTs to /api/candidate with its ``gate_id`` (from ``parking_gates``).
The Gate UI polls GET /api/candidate?gate_id=… for the lane it is serving.

Subscription check:
  - On every POST, the backend queries the subscriptions table.
  - Active subscriber + no open session  → session auto-created, barrier triggered (entrance).
  - Active subscriber + open session > 60 s old → session auto-closed, barrier triggered (exit).
  - Active subscriber + open session ≤ 60 s old → recent entrance re-detection; skip auto-action.
  - No active subscription → normal manual confirmation flow (unchanged).
"""

from __future__ import annotations

import logging
import threading
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from api.barrier import trigger_barrier_open
from api.database import get_db
from api.models import ParkingGate, ParkingSession, Subscription

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/candidate", tags=["candidate"])

_lock = threading.Lock()

# gate_id → latest candidate record
_by_gate: dict[int, dict] = {}

# Minimum session age (seconds) before a subscriber is auto-exited on re-detection
_MIN_AGE_FOR_AUTO_EXIT_SEC = 60


# ── Pydantic models ──────────────────────────────────────────────────────────

class CandidateIn(BaseModel):
    gate_id: int = Field(..., ge=1, description="parking_gates.id from Kapı ayarları")
    plate: str
    raw_ocr: str
    confidence: float = Field(ge=0.0, le=1.0)
    is_valid: bool


class SubscriptionSummary(BaseModel):
    id: int
    plan_type: str
    end_date: date
    days_remaining: int


class CandidateOut(BaseModel):
    gate_id: int
    plate: str
    raw_ocr: str
    confidence: float
    is_valid: bool
    detected_at: str
    is_subscriber: bool = False
    subscription: Optional[SubscriptionSummary] = None
    session_id: Optional[int] = None
    barrier_triggered: bool = False


# ── Helpers ──────────────────────────────────────────────────────────────────

def _find_active_subscription(plate: str, db: Session) -> Optional[Subscription]:
    today = date.today()
    return (
        db.query(Subscription)
        .filter(
            Subscription.plate_number == plate,
            Subscription.is_active.is_(True),
            Subscription.start_date <= today,
            Subscription.end_date >= today,
        )
        .first()
    )


def _find_open_session(plate: str, db: Session) -> Optional[ParkingSession]:
    return (
        db.query(ParkingSession)
        .filter(
            ParkingSession.plate_number == plate,
            ParkingSession.status == "ACTIVE",
        )
        .order_by(ParkingSession.entrance_time.desc())
        .first()
    )


def _elapsed_seconds(session: ParkingSession) -> float:
    now = datetime.now(timezone.utc)
    entrance = session.entrance_time
    if entrance.tzinfo is None:
        entrance = entrance.replace(tzinfo=timezone.utc)
    return (now - entrance).total_seconds()


def _fetch_gate(gate_id: int, db: Session) -> Optional[ParkingGate]:
    return db.query(ParkingGate).filter(ParkingGate.id == gate_id).first()


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=CandidateOut,
    status_code=200,
    summary="Camera worker pushes a plate candidate for one gate",
)
def push_candidate(body: CandidateIn, db: Session = Depends(get_db)) -> CandidateOut:
    plate = body.plate.upper().strip()

    is_subscriber = False
    subscription_summary: Optional[dict] = None
    session_id: Optional[int] = None
    barrier_triggered = False

    sub = _find_active_subscription(plate, db)

    if sub is not None:
        today = date.today()
        days_remaining = max(0, (sub.end_date - today).days)
        subscription_summary = {
            "id": sub.id,
            "plan_type": sub.plan_type,
            "end_date": sub.end_date,
            "days_remaining": days_remaining,
        }

        open_session = _find_open_session(plate, db)

        if open_session is None:
            # ── AUTO-ENTRANCE ─────────────────────────────────────────────
            is_subscriber = True
            now = datetime.now(timezone.utc)
            new_session = ParkingSession(
                plate_number=plate,
                raw_ocr_text=body.raw_ocr,
                entrance_time=now,
                status="ACTIVE",
                entered_manually=False,
                is_subscribed=True,
                subscription_id=sub.id,
                amount_due=Decimal("0.00"),
            )
            db.add(new_session)
            db.commit()
            db.refresh(new_session)
            session_id = new_session.id

            gate = _fetch_gate(body.gate_id, db)
            if gate:
                ok, ev = trigger_barrier_open(
                    db,
                    plate_number=plate,
                    session_id=new_session.id,
                    gate=gate,
                    trigger_type="AUTO_SUBSCRIBER",
                )
                barrier_triggered = ok
                if not ok:
                    logger.warning(
                        "AUTO_SUBSCRIBER barrier failed for plate=%s gate=%s event=%s notes=%r",
                        plate, body.gate_id, ev.id, ev.notes,
                    )
            else:
                logger.warning("AUTO_SUBSCRIBER: gate_id=%s not found — barrier not triggered", body.gate_id)

        else:
            elapsed = _elapsed_seconds(open_session)

            if elapsed >= _MIN_AGE_FOR_AUTO_EXIT_SEC:
                # ── AUTO-EXIT ─────────────────────────────────────────────
                is_subscriber = True
                now = datetime.now(timezone.utc)
                duration_min = max(0, int(elapsed / 60))

                open_session.exit_time = now
                open_session.duration_minutes = duration_min
                open_session.amount_due = Decimal("0.00")
                open_session.amount_paid = Decimal("0.00")
                open_session.status = "PAID"
                # Ensure subscription linkage is correct even on manual-entry sessions
                if not open_session.is_subscribed:
                    open_session.is_subscribed = True
                    open_session.subscription_id = sub.id
                db.commit()
                db.refresh(open_session)
                session_id = open_session.id

                gate = _fetch_gate(body.gate_id, db)
                if gate:
                    ok, ev = trigger_barrier_open(
                        db,
                        plate_number=plate,
                        session_id=open_session.id,
                        gate=gate,
                        trigger_type="AUTO_SUBSCRIBER_EXIT",
                    )
                    barrier_triggered = ok
                    if not ok:
                        logger.warning(
                            "AUTO_SUBSCRIBER_EXIT barrier failed for plate=%s gate=%s event=%s notes=%r",
                            plate, body.gate_id, ev.id, ev.notes,
                        )
                else:
                    logger.warning(
                        "AUTO_SUBSCRIBER_EXIT: gate_id=%s not found — barrier not triggered", body.gate_id
                    )
            else:
                # ── RECENT RE-DETECTION at entrance gate ──────────────────
                # Session is too young to be an exit; treat as non-subscriber
                # so the Gate UI shows the normal too_early screen.
                logger.debug(
                    "Subscriber %s re-detected %.1fs after entrance — skipping auto-action",
                    plate, elapsed,
                )

    record: dict = {
        "gate_id": body.gate_id,
        "plate": plate,
        "raw_ocr": body.raw_ocr,
        "confidence": body.confidence,
        "is_valid": body.is_valid,
        "detected_at": datetime.now(timezone.utc).isoformat(),
        "is_subscriber": is_subscriber,
        "subscription": subscription_summary,
        "session_id": session_id,
        "barrier_triggered": barrier_triggered,
    }
    with _lock:
        _by_gate[body.gate_id] = record
    return CandidateOut(**record)


@router.get(
    "",
    response_model=Optional[CandidateOut],
    summary="Poll the latest candidate for a gate",
)
def get_candidate(gate_id: int = Query(..., ge=1, description="parking_gates.id")) -> Optional[CandidateOut]:
    with _lock:
        rec = _by_gate.get(gate_id)
        if rec is None:
            return None
        return CandidateOut(**rec)


@router.delete("", status_code=204, summary="Clear the candidate buffer for one gate")
def clear_candidate(gate_id: int = Query(..., ge=1)) -> None:
    with _lock:
        _by_gate.pop(gate_id, None)
