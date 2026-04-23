from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from api.database import get_db
from api.models import Subscription
from api.schemas import (
    SubscriptionCheckOut,
    SubscriptionCreate,
    SubscriptionInfo,
    SubscriptionRead,
    SubscriptionUpdate,
)

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def calculate_end_date(plan_type: str, start: date) -> date:
    pt = plan_type.upper()
    if pt == "WEEKLY":
        return start + timedelta(days=7)
    if pt == "MONTHLY":
        return start + relativedelta(months=1)
    if pt == "YEARLY":
        return start + relativedelta(years=1)
    raise ValueError(f"Unknown plan_type: {plan_type!r}")


def get_active_subscription_for_plate(plate: str, db: Session) -> Optional[Subscription]:
    """Return the currently active subscription for *plate*, or None."""
    today = date.today()
    return (
        db.query(Subscription)
        .filter(
            Subscription.plate_number == plate.upper().strip(),
            Subscription.is_active.is_(True),
            Subscription.start_date <= today,
            Subscription.end_date >= today,
        )
        .first()
    )


def _has_overlap(plate: str, start: date, end: date, db: Session, exclude_id: Optional[int] = None) -> bool:
    """Return True if any active subscription for *plate* overlaps [start, end]."""
    q = (
        db.query(Subscription)
        .filter(
            Subscription.plate_number == plate,
            Subscription.is_active.is_(True),
            Subscription.start_date <= end,
            Subscription.end_date >= start,
        )
    )
    if exclude_id is not None:
        q = q.filter(Subscription.id != exclude_id)
    return db.query(q.exists()).scalar()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[SubscriptionRead], summary="List all subscriptions")
def list_subscriptions(
    plate: Optional[str] = Query(None, description="Filter by plate (partial match)"),
    active: Optional[bool] = Query(None, description="true=currently active, false=expired/deactivated"),
    db: Session = Depends(get_db),
) -> list[SubscriptionRead]:
    q = db.query(Subscription)
    if plate:
        q = q.filter(Subscription.plate_number.ilike(f"%{plate.upper().strip()}%"))
    if active is True:
        today = date.today()
        q = q.filter(
            Subscription.is_active.is_(True),
            Subscription.start_date <= today,
            Subscription.end_date >= today,
        )
    elif active is False:
        today = date.today()
        q = q.filter(
            or_(Subscription.is_active.is_(False), Subscription.end_date < today)
        )
    rows = q.order_by(Subscription.created_at.desc()).all()
    return [SubscriptionRead.model_validate(r) for r in rows]


@router.post("", response_model=SubscriptionRead, status_code=201, summary="Create a subscription")
def create_subscription(body: SubscriptionCreate, db: Session = Depends(get_db)) -> SubscriptionRead:
    end = calculate_end_date(body.plan_type, body.start_date)

    if _has_overlap(body.plate_number, body.start_date, end, db):
        raise HTTPException(
            status_code=409,
            detail=(
                "Bu plaka için seçilen tarih aralığında zaten aktif bir abonelik var. "
                "Mevcut aboneliği yenilemeyi veya devre dışı bırakmayı deneyin."
            ),
        )

    sub = Subscription(
        plate_number=body.plate_number,
        plan_type=body.plan_type,
        start_date=body.start_date,
        end_date=end,
        is_active=True,
        notes=body.notes,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return SubscriptionRead.model_validate(sub)


@router.get("/check/{plate}", response_model=SubscriptionCheckOut, summary="Check active subscription for a plate")
def check_subscription(plate: str, db: Session = Depends(get_db)) -> SubscriptionCheckOut:
    sub = get_active_subscription_for_plate(plate, db)
    if sub is None:
        return SubscriptionCheckOut(has_active_subscription=False)
    days_remaining = max(0, (sub.end_date - date.today()).days)
    return SubscriptionCheckOut(
        has_active_subscription=True,
        subscription=SubscriptionInfo(
            id=sub.id,
            plan_type=sub.plan_type,
            end_date=sub.end_date,
            days_remaining=days_remaining,
        ),
    )


@router.get("/{sub_id}", response_model=SubscriptionRead, summary="Get a subscription by ID")
def get_subscription(sub_id: int, db: Session = Depends(get_db)) -> SubscriptionRead:
    sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Abonelik bulunamadı.")
    return SubscriptionRead.model_validate(sub)


@router.put("/{sub_id}", response_model=SubscriptionRead, summary="Update a subscription")
def update_subscription(
    sub_id: int,
    body: SubscriptionUpdate,
    db: Session = Depends(get_db),
) -> SubscriptionRead:
    sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Abonelik bulunamadı.")

    data = body.model_dump(exclude_unset=True)

    new_plan = data.get("plan_type", sub.plan_type)
    new_start = data.get("start_date", sub.start_date)

    if "plan_type" in data or "start_date" in data:
        new_end = calculate_end_date(new_plan, new_start)
        if _has_overlap(sub.plate_number, new_start, new_end, db, exclude_id=sub_id):
            raise HTTPException(
                status_code=409,
                detail="Bu plaka için seçilen tarih aralığında zaten aktif başka bir abonelik var.",
            )
        sub.end_date = new_end

    for field, value in data.items():
        setattr(sub, field, value)

    db.commit()
    db.refresh(sub)
    return SubscriptionRead.model_validate(sub)


@router.delete("/{sub_id}", status_code=204, summary="Delete a subscription record")
def delete_subscription(sub_id: int, db: Session = Depends(get_db)) -> None:
    sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Abonelik bulunamadı.")
    db.delete(sub)
    db.commit()
