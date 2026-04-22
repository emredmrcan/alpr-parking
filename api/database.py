from __future__ import annotations

import os
from typing import Generator

from dotenv import load_dotenv
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

load_dotenv()

# ── Backend selection ─────────────────────────────────────────────────────────
# Set DATABASE_TYPE=sqlite  for a local file DB (offline, no server required).
# Set DATABASE_TYPE=postgresql for a network PostgreSQL server.
DATABASE_TYPE: str = os.getenv("DATABASE_TYPE", "sqlite").lower()

_DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "sqlite:///./alpr_parking.db",
)

# ── Engine creation ───────────────────────────────────────────────────────────
if DATABASE_TYPE == "sqlite":
    # SQLite does not support pool_size / max_overflow.
    # check_same_thread=False is required because FastAPI serves requests on
    # multiple threads while sharing the same connection pool.
    engine: Engine = create_engine(
        _DATABASE_URL,
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def _configure_sqlite(dbapi_conn, _connection_record) -> None:
        """Apply per-connection pragmas on every new SQLite connection."""
        cursor = dbapi_conn.cursor()
        # WAL mode: allows concurrent reads during writes (camera loop + API).
        cursor.execute("PRAGMA journal_mode=WAL")
        # Enforce foreign-key constraints (SQLite disables them by default).
        cursor.execute("PRAGMA foreign_keys=ON")
        # Tighten synchronisation — safe for WAL; trades durability for speed.
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

elif DATABASE_TYPE == "postgresql":
    engine = create_engine(
        _DATABASE_URL,
        pool_pre_ping=True,   # discard stale connections after network hiccup
        pool_size=5,
        max_overflow=10,
    )

else:
    raise ValueError(
        f"Unsupported DATABASE_TYPE '{DATABASE_TYPE}'. "
        "Choose 'sqlite' or 'postgresql'."
    )

# ── Session factory ───────────────────────────────────────────────────────────
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


# ── FastAPI dependency ────────────────────────────────────────────────────────
def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Utility: lightweight connectivity check ───────────────────────────────────
def check_db_connection() -> bool:
    """Return True if the database is reachable, False otherwise."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
