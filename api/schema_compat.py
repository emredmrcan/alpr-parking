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
    if "barrier_events" not in insp.get_table_names():
        return

    col_names = {c["name"] for c in insp.get_columns("barrier_events")}
    if "gate_id" in col_names:
        return

    stmt = text("ALTER TABLE barrier_events ADD COLUMN gate_id INTEGER NULL")
    with engine.begin() as conn:
        conn.execute(stmt)
