# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller spec — ALPR Parking API Server (alpr_server.exe)
#
# Run from the project root on Windows:
#   pyinstaller build\alpr_server.spec
#
# Output: dist\alpr_server\  (onedir bundle)
#
# The build_windows.py script invokes this automatically.

import pathlib
from PyInstaller.utils.hooks import collect_all, collect_submodules

block_cipher = None

# ── Collect heavy ML packages ──────────────────────────────────────────────
# collect_all gathers datas, binaries, and hidden imports for the package.

ultralytics_datas, ultralytics_binaries, ultralytics_hidden = collect_all("ultralytics")
easyocr_datas, easyocr_binaries, easyocr_hidden = collect_all("easyocr")
timm_datas, timm_binaries, timm_hidden = collect_all("timm")

# ── Analysis ───────────────────────────────────────────────────────────────
a = Analysis(
    ["api/main_entry.py"],
    pathex=["."],
    binaries=ultralytics_binaries + easyocr_binaries + timm_binaries,
    datas=[
        # Serve the compiled React SPA from inside the bundle
        ("api/static", "api/static"),
        # i18n strings loaded at runtime by the translations route
        ("translations", "translations"),
        # utils is a local package used by alpr_engine; include it explicitly
        ("utils", "utils"),
    ]
    + ultralytics_datas
    + easyocr_datas
    + timm_datas,
    hiddenimports=[
        # uvicorn internals (not auto-detected because they use dynamic loading)
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.loops.asyncio",
        "uvicorn.loops.uvloop",
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
        # passlib / auth (prepared for future auth feature)
        "passlib.handlers.bcrypt",
        # multipart / form uploads
        "multipart",
        "python_multipart",
        # starlette internals
        "starlette.routing",
        "starlette.staticfiles",
        # alembic (schema migrations)
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
    hookspath=["build/hooks"],
    runtime_hooks=[],
    excludes=[
        "tkinter",
        "test",
        "unittest",
        "doctest",
        # Remove training dependencies (not needed in production)
        "tensorboard",
        "wandb",
        "clearml",
        "comet_ml",
        # Remove unused GUI backends
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
    console=True,   # console=True so the operator can see server logs
    icon="build/icon.ico" if pathlib.Path("build/icon.ico").exists() else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[
        # Never UPX these — they break when compressed
        "vcruntime140.dll",
        "python3*.dll",
        "torch_*.pyd",
    ],
    name="alpr_server",
)
