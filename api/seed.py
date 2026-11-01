"""Demo data so a fresh install has something to look at.

Usage:
    python3 -m api.seed            # seed only if the database has no gates/sessions/subscriptions
    python3 -m api.seed --reset    # wipe gates, sessions, subscriptions and barrier events, then seed
    SEED_DEMO_DATA=true uvicorn api.main:app     # seed on startup (only when the DB is empty)
    python3 -m api.main_entry --seed              # same, for the packaged server

Seeded data is fictional: plates are made up and gates use the "dummy" barrier driver,
so nothing touches real hardware.
"""

from __future__ import annotations

import argparse
import random
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from api.models import BarrierEvent, ParkingGate, ParkingSession, Subscription

DEMO_NOTE = "[demo]"

# Made-up plates that satisfy the Turkish plate format.
PLATES = [
    "34ABC123", "06DEF456", "35GHK789", "16LMN012", "07PRS345",
    "41TUV678", "01YZA901", "34BCD234", "06EFG567", "35HJK890",
    "42KLM123", "26NPR456", "55STU789", "61VYZ012", "34AB4567",
    "06CD8901", "35EF2345", "16GH6789", "07JK0123", "41LM4567",
]


def _is_empty(db: Session) -> bool:
    return (
        db.query(ParkingGate).count() == 0
        and db.query(ParkingSession).count() == 0
        and db.query(Subscription).count() == 0
    )


def reset_demo_data(db: Session) -> None:
    """Remove everything operational. Pricing rules are kept (they are re-seeded when missing)."""
    db.query(BarrierEvent).delete()
    db.query(ParkingSession).delete()
    db.query(Subscription).delete()
    db.query(ParkingGate).delete()
    db.commit()


def seed_demo_data(db: Session, *, force: bool = False) -> bool:
    """Insert demo gates, subscriptions and sessions. Returns False if skipped."""
    # Imported lazily: these modules import the FastAPI app machinery.
    from api.routes.pricing import seed_default_rules
    from api.routes.sessions import _calculate_fee

    if not force and not _is_empty(db):
        return False

    seed_default_rules(db)
    rng = random.Random(42)  # deterministic: everyone sees the same demo
    now = datetime.now(timezone.utc).replace(microsecond=0)
    today = date.today()

    # ── Gates ────────────────────────────────────────────────────────────────
    db.add_all([
        ParkingGate(label="Entrance — main gate", sort_order=0, camera_source="0",
                    gate_type="entrance", barrier_driver="dummy"),
        ParkingGate(label="Exit — main gate", sort_order=1, camera_source="1",
                    gate_type="exit", barrier_driver="dummy"),
    ])

    # ── Subscriptions (active / expiring / expired / deactivated) ────────────
    subs = [
        ("34SUB001", "MONTHLY", today - timedelta(days=10), today + timedelta(days=20), True, "Company car — ACME Ltd."),
        ("06SUB002", "YEARLY", today - timedelta(days=100), today + timedelta(days=265), True, None),
        ("35SUB003", "WEEKLY", today - timedelta(days=5), today + timedelta(days=2), True, None),
        ("16SUB004", "MONTHLY", today - timedelta(days=60), today - timedelta(days=30), True, "Expired — good renewal example"),
        ("07SUB005", "MONTHLY", today - timedelta(days=3), today + timedelta(days=27), False, "Cancelled early"),
    ]
    sub_rows = []
    for plate, plan, start, end, active, notes in subs:
        row = Subscription(plate_number=plate, plan_type=plan, start_date=start,
                           end_date=end, is_active=active, notes=notes)
        db.add(row)
        sub_rows.append(row)
    db.flush()

    # ── Completed sessions over the past 7 days ──────────────────────────────
    for i in range(28):
        days_ago = rng.randint(0, 6)
        minutes = rng.choice([12, 25, 41, 55, 78, 95, 130, 185, 260])
        exit_t = now - timedelta(days=days_ago, hours=rng.randint(0, 8), minutes=rng.randint(0, 59))
        if days_ago == 0:
            exit_t = min(exit_t, now - timedelta(minutes=5))
        entrance = exit_t - timedelta(minutes=minutes)
        fee = _calculate_fee(minutes, db)
        db.add(ParkingSession(
            plate_number=PLATES[i % len(PLATES)], raw_ocr_text=PLATES[i % len(PLATES)],
            entrance_time=entrance, exit_time=exit_t, duration_minutes=minutes,
            amount_due=fee, amount_paid=fee, status="PAID",
            entered_manually=(i % 9 == 0), notes=DEMO_NOTE if i % 9 else f"{DEMO_NOTE} manual entry",
        ))

    # A subscriber visit (free) and one with a paid-different-amount note
    db.add(ParkingSession(
        plate_number="34SUB001", raw_ocr_text="34SUB001",
        entrance_time=now - timedelta(days=1, hours=3), exit_time=now - timedelta(days=1, hours=1),
        duration_minutes=120, amount_due=Decimal("0.00"), amount_paid=Decimal("0.00"),
        status="PAID", is_subscribed=True, subscription_id=sub_rows[0].id, notes=DEMO_NOTE,
    ))
    fee = _calculate_fee(75, db)
    db.add(ParkingSession(
        plate_number="26NPR456", raw_ocr_text="26NPR4S6",
        entrance_time=now - timedelta(hours=4), exit_time=now - timedelta(hours=2, minutes=45),
        duration_minutes=75, amount_due=fee, amount_paid=fee + Decimal("5.00"),
        status="PAID", notes=f"{DEMO_NOTE} customer rounded up",
    ))

    # ── Vehicles currently parked ────────────────────────────────────────────
    for plate, minutes_ago in [("34ACT111", 8), ("06ACT222", 47), ("35ACT333", 130), ("41ACT444", 310)]:
        db.add(ParkingSession(
            plate_number=plate, raw_ocr_text=plate,
            entrance_time=now - timedelta(minutes=minutes_ago), status="ACTIVE", notes=DEMO_NOTE,
        ))

    db.commit()
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the ALPR database with demo data")
    parser.add_argument("--reset", action="store_true",
                        help="DELETE all gates, sessions, subscriptions and barrier events first")
    args = parser.parse_args()

    from api.database import Base, SessionLocal, engine
    from api.schema_compat import apply_schema_compat

    Base.metadata.create_all(bind=engine)
    apply_schema_compat(engine)

    db = SessionLocal()
    try:
        if args.reset:
            reset_demo_data(db)
        if seed_demo_data(db, force=args.reset):
            print("Demo data seeded: 2 gates, 5 subscriptions, ~30 completed and 4 active sessions.")
        else:
            print("Database already has data — nothing seeded. Use --reset to wipe and re-seed.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
