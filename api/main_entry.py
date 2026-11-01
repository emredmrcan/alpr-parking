"""
PyInstaller entry point for the ALPR Parking FastAPI server.

This thin wrapper is the __main__ target for the alpr_server PyInstaller build.
It resolves the packaged app root, loads config/.env, then starts uvicorn.

DO NOT use this file for local development — use:
    uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


def _app_root() -> Path:
    """
    Return the ALPRParking root directory in both frozen and dev modes.

    Packaged layout (PyInstaller onedir):
        ALPRParking/
          app/
            alpr_server/
              alpr_server.exe   ← sys.executable lives here
          config/
            .env

    Dev layout:
        project_root/
          api/
            main_entry.py      ← __file__ lives here
    """
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent.parent.parent
    return Path(__file__).resolve().parent.parent


def main() -> None:
    parser = argparse.ArgumentParser(description="ALPR Parking API Server")
    parser.add_argument(
        "--config", default=None,
        help="Path to .env config file (default: <app_root>/config/.env)",
    )
    parser.add_argument(
        "--seed", action="store_true",
        help="Fill an empty database with demo gates, subscriptions and sessions",
    )
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    args, _ = parser.parse_known_args()

    root = _app_root()

    # Set working directory so that all relative paths in .env resolve correctly
    # (e.g. DATABASE_URL=sqlite:///./config/alpr_parking.db, UPLOAD_DIR=uploads)
    os.chdir(root)

    env_path = Path(args.config) if args.config else root / "config" / ".env"
    if not env_path.is_absolute():
        env_path = root / env_path

    if env_path.exists():
        from dotenv import load_dotenv
        load_dotenv(env_path, override=True)

    if args.seed:
        os.environ["SEED_DEMO_DATA"] = "true"

    import uvicorn

    uvicorn.run(
        "api.main:app",
        host=args.host,
        port=args.port,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
