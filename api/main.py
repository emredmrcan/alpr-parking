from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.requests import Request

from api.database import DATABASE_TYPE, SessionLocal, check_db_connection, engine
from api.models import Base
from api.routes import barrier, cameras, candidate, gates, pricing, recognize, sessions, stats, subscriptions, translations
from api.schema_compat import apply_schema_compat
from api.routes.pricing import seed_default_rules


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Create tables on startup (idempotent)
    Base.metadata.create_all(bind=engine)
    apply_schema_compat(engine)

    # Seed default pricing rules if the table is empty
    db = SessionLocal()
    try:
        seed_default_rules(db)
    finally:
        db.close()

    # Ensure upload directory exists
    upload_dir = Path(os.getenv("UPLOAD_DIR", "uploads"))
    upload_dir.mkdir(parents=True, exist_ok=True)

    yield
    # Nothing to clean up for MVP


app = FastAPI(
    title="ALPR Parking API",
    description="Turkish licence-plate recognition + parking session management",
    version="1.0.0",
    lifespan=lifespan,
)


@app.exception_handler(RequestValidationError)
async def _validation_exception_handler(
    _request: Request,
    _exc: RequestValidationError,
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Gönderilen bilgiler geçersiz. Lütfen alanları kontrol edin.",
        },
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(gates.router, prefix="/api")
app.include_router(cameras.router, prefix="/api")
app.include_router(barrier.router, prefix="/api")
app.include_router(candidate.router, prefix="/api")
app.include_router(recognize.router, prefix="/api")
app.include_router(sessions.router, prefix="/api")
app.include_router(pricing.router, prefix="/api")
app.include_router(stats.router, prefix="/api")
app.include_router(subscriptions.router, prefix="/api")
app.include_router(translations.router, prefix="/api")

# Serve uploaded images
upload_dir = Path(os.getenv("UPLOAD_DIR", "uploads"))
upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")

_STATIC_DIR = Path(__file__).parent / "static"


@app.get("/health", tags=["health"])
def health_check() -> dict:
    db_ok = check_db_connection()
    return {
        "status": "ok" if db_ok else "degraded",
        "database": {
            "backend": DATABASE_TYPE,
            "connected": db_ok,
        },
    }


# Serve the React SPA for all non-API, non-upload routes.
# The StaticFiles mount is added LAST so API routes take priority.
if _STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(_STATIC_DIR / "assets")), name="spa-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str) -> FileResponse:
        index = _STATIC_DIR / "index.html"
        return FileResponse(str(index))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=True)
