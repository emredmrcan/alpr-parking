# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller spec — ALPR Parking API Server (alpr_server.exe)
#
# Run from the project root on Windows:
#   pyinstaller build\alpr_server.spec
#
# Output: dist\alpr_server\  (onedir bundle)
#
# NOTE: PyInstaller resolves paths relative to SPECPATH (the directory that
# contains this spec file, i.e. build\).  All source paths must therefore be
# expressed as absolute paths anchored to the project root, which is one
# level above SPECPATH.

import os
import pathlib
from PyInstaller.utils.hooks import collect_all, collect_submodules

block_cipher = None

# ── Project root (one level above build\) ─────────────────────────────────
ROOT = os.path.abspath(os.path.join(SPECPATH, ".."))

# ── Collect heavy ML packages ──────────────────────────────────────────────
ultralytics_datas, ultralytics_binaries, ultralytics_hidden = collect_all("ultralytics")
easyocr_datas, easyocr_binaries, easyocr_hidden = collect_all("easyocr")

# timm is an optional transitive dep of easyocr — collect only if present
try:
    timm_datas, timm_binaries, timm_hidden = collect_all("timm")
except Exception:
    timm_datas, timm_binaries, timm_hidden = [], [], []

# ── Analysis ───────────────────────────────────────────────────────────────
a = Analysis(
    [os.path.join(ROOT, "api", "main_entry.py")],
    pathex=[ROOT],
    binaries=ultralytics_binaries + easyocr_binaries + timm_binaries,
    datas=[
        # Serve the compiled React SPA from inside the bundle
        (os.path.join(ROOT, "api", "static"),  "api/static"),
        # i18n strings loaded at runtime by the translations route
        (os.path.join(ROOT, "translations"),   "translations"),
        # utils is a local package used by alpr_engine
        (os.path.join(ROOT, "utils"),          "utils"),
    ]
    + ultralytics_datas
    + easyocr_datas
    + timm_datas,
    hiddenimports=[
        # uvicorn internals (dynamically loaded, not auto-detected)
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.http.httptools_impl",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        # SQLAlchemy dialects
        "sqlalchemy.dialects.sqlite",
        "sqlalchemy.dialects.postgresql",
        "sqlalchemy.orm",
        "sqlalchemy.ext.declarative",
        # psycopg2 (optional — only needed for PostgreSQL mode)
        "psycopg2",
        # multipart / form uploads
        "multipart",
        "python_multipart",
        # starlette internals
        "starlette.routing",
        "starlette.staticfiles",
        # alembic
        "alembic",
        "alembic.runtime.migration",
        "alembic.operations",
        # dateutil
        "dateutil",
        "dateutil.parser",
    ]
    + ultralytics_hidden
    + easyocr_hidden
    + timm_hidden
    + collect_submodules("api"),
    hookspath=[os.path.join(SPECPATH, "hooks")],
    runtime_hooks=[],
    # Do not exclude unittest/test — ultralytics / torch import them when loading YOLO.
    excludes=[
        "tkinter",
        "doctest",
        "tensorboard",
        "wandb",
        "clearml",
        "comet_ml",
        "matplotlib.backends._backend_tk",
        "PyQt5",
        "PyQt6",
        "wx",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

_icon = os.path.join(SPECPATH, "icon.ico")

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="alpr_server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    icon=_icon if os.path.exists(_icon) else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[
        "vcruntime140.dll",
        "python3*.dll",
        "torch_*.pyd",
    ],
    name="alpr_server",
)
