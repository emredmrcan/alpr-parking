from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from api.database import get_db
from api.models import ParkingSession

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/today", summary="Dashboard statistics for today")
def today_stats(db: Session = Depends(get_db)) -> dict:
    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    active_count: int = (
        db.query(func.count(ParkingSession.id))
        .filter(ParkingSession.status == "ACTIVE")
        .scalar()
        or 0
    )

    today_sessions = (
        db.query(ParkingSession)
        .filter(ParkingSession.entrance_time >= today_start)
        .all()
    )

    total_today = len(today_sessions)

    paid_today = [s for s in today_sessions if s.status == "PAID"]
    revenue_today = round(
        sum(float(s.amount_paid or 0) for s in paid_today), 2
    )

    durations = [s.duration_minutes for s in paid_today if s.duration_minutes is not None]
    avg_duration_minutes: int | None = (
        int(sum(durations) / len(durations)) if durations else None
    )

    return {
        "active_count": active_count,
        "total_today": total_today,
        "revenue_today": revenue_today,
        "avg_duration_minutes": avg_duration_minutes,
    }
