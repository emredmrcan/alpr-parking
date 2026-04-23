from __future__ import annotations

"""Lightweight schema adjustments for existing installs (no Alembic required)."""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def apply_schema_compat(engine: Engine) -> None:
    """
    Add columns / fixes that SQLAlchemy create_all does not apply to existing tables.
    Safe to call on every startup (idempotent).
    """
    insp = inspect(engine)
    tables = set(insp.get_table_names())

    # ── barrier_events.gate_id ────────────────────────────────────────────────
    if "barrier_events" in tables:
        col_names = {c["name"] for c in insp.get_columns("barrier_events")}
        if "gate_id" not in col_names:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE barrier_events ADD COLUMN gate_id INTEGER NULL"))

    # ── parking_sessions: subscription columns ────────────────────────────────
    if "parking_sessions" in tables:
        col_names = {c["name"] for c in insp.get_columns("parking_sessions")}
        with engine.begin() as conn:
            if "is_subscribed" not in col_names:
                conn.execute(text(
                    "ALTER TABLE parking_sessions ADD COLUMN is_subscribed BOOLEAN NOT NULL DEFAULT FALSE"
                ))
            if "subscription_id" not in col_names:
                conn.execute(text(
                    "ALTER TABLE parking_sessions ADD COLUMN subscription_id INTEGER NULL"
                ))
