# Roadmap Item 1 — Database Flexibility (SQLite + PostgreSQL)

**Priority:** P0 — Must be completed before any other roadmap item  
**Estimated effort:** 0.5 engineering day  
**Depends on:** Nothing (this is the foundation)  
**Blocks:** All other items

---

## Problem Statement

The current `api/database.py` is hard-wired to PostgreSQL. Some clients will operate in
environments without internet access or a database server. Running a PostgreSQL instance
on those machines adds unnecessary operational burden and a failure point. SQLite, which
ships as part of the Python standard library, requires zero installation and stores the
entire database in a single file.

At the same time, clients who **do** have a network may prefer PostgreSQL for
multi-machine access (e.g., a single database server shared between an entrance PC
and an exit PC). We must support both, selectable by a single environment variable.

---

## Goal

Toggle between SQLite and PostgreSQL by changing one line in `.env`. The rest of the
application — models, routes, sessions — must remain **completely unchanged**.

---

## Current State

```python
# api/database.py — current (PostgreSQL only)
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://alpr_user:alpr_pass@localhost:5432/alpr_parking",
)
engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=10)
```

SQLAlchemy's `pool_size` and `max_overflow` arguments raise an error when the dialect
is SQLite, so the engine creation must be conditional.

---

## Solution Design

### Environment Variables

```dotenv
# .env — new fields

# Choose the database backend.
# "sqlite"     → local file, no server needed, works offline
# "postgresql" → network database server
DATABASE_TYPE=sqlite

# SQLite: path to the .db file (relative to project root)
DATABASE_URL=sqlite:///./alpr_parking.db

# PostgreSQL (only used when DATABASE_TYPE=postgresql):
# DATABASE_URL=postgresql://alpr_user:alpr_pass@localhost:5432/alpr_parking
```

### Updated `api/database.py`

```python
import os
from typing import Generator

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

load_dotenv()

_DATABASE_TYPE = os.getenv("DATABASE_TYPE", "sqlite").lower()
_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./alpr_parking.db",
)

if _DATABASE_TYPE == "sqlite":
    # SQLite does not support pool_size / max_overflow; needs check_same_thread=False
    engine = create_engine(
        _DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
    # Enable WAL mode for better concurrent read performance
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
else:
    engine = create_engine(
        _DATABASE_URL,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### Why WAL Mode for SQLite?

The ALPR engine (camera loop) and the API server run as separate processes. Without
Write-Ahead Logging (WAL), SQLite uses an exclusive write lock that blocks reads during
any write operation. WAL allows concurrent readers during writes — essential when the
camera loop is writing candidates while the UI is reading sessions.

---

## Files to Change

| File | Change |
|------|--------|
| `api/database.py` | Replace with the conditional engine creation above |
| `.env` | Add `DATABASE_TYPE=sqlite` and update `DATABASE_URL` |
| `requirements.txt` | No change — SQLAlchemy already supports both dialects |
| `docker-compose.yml` | Mark PostgreSQL service as optional (`profiles: ["postgres"]`) |

---

## Migration Strategy

SQLAlchemy's `Base.metadata.create_all(bind=engine)` already runs at startup in
`api/main.py`. This is idempotent — it creates tables that do not yet exist and leaves
existing tables untouched. No Alembic migration scripts are needed for the MVP.

> **Future consideration:** Once the product ships to multiple clients with live data,
> add Alembic for schema versioning. For now, `create_all` is sufficient and much
> simpler to manage.

---

## Testing Checklist

- [ ] `DATABASE_TYPE=sqlite` — API starts, tables created in `alpr_parking.db`
- [ ] `DATABASE_TYPE=sqlite` — Create a session, verify it persists after restart
- [ ] `DATABASE_TYPE=postgresql` — API starts with a running Postgres instance
- [ ] `DATABASE_TYPE=postgresql` — Create a session, verify it persists
- [ ] Switch `DATABASE_TYPE` from `sqlite` to `postgresql` (different DB, not migration)
      and confirm the API starts without errors on a fresh database
- [ ] Concurrent camera loop + API writes under SQLite (WAL stress test): run 50
      dummy candidate pushes while the session list endpoint is polled; confirm no
      "database is locked" errors

---

## Acceptance Criteria

1. Changing `DATABASE_TYPE` in `.env` and restarting the API is the **only** step
   required to switch databases.
2. All existing API endpoints (`/sessions`, `/candidate`, `/pricing`, `/stats`) work
   identically under both backends.
3. No "database is locked" errors occur during normal operation under SQLite.
4. The PostgreSQL `docker-compose.yml` service is only started when explicitly requested
   (not the default for new installs).
