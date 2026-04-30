"""
PyInstaller entry point for the ALPR camera engine process.

This thin wrapper is the __main__ target for the alpr_engine PyInstaller build.
It resolves the packaged app root, loads config/.env, then runs the camera loop.

DO NOT use this file for local development — use:
    python camera_loop.py
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
            alpr_engine/
              alpr_engine.exe   ← sys.executable lives here
          config/
            .env

    Dev layout:
        project_root/
          camera_loop_entry.py  ← __file__ lives here
    """
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent.parent.parent
    return Path(__file__).resolve().parent


def main() -> None:
    parser = argparse.ArgumentParser(description="ALPR Camera Engine")
    parser.add_argument(
        "--config", default=None,
        help="Path to .env config file (default: <app_root>/config/.env)",
    )
    args, _ = parser.parse_known_args()

    root = _app_root()
    os.chdir(root)

    env_path = Path(args.config) if args.config else root / "config" / ".env"
    if not env_path.is_absolute():
        env_path = root / env_path

    if env_path.exists():
        from dotenv import load_dotenv
        load_dotenv(env_path, override=True)

    # RapidOCR bundles its ONNX models inside the package wheel — no external
    # model cache or environment variables are required in either dev or packaged mode.

    from camera_loop import run
    run()


if __name__ == "__main__":
    main()
