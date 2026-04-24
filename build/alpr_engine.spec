# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller spec — ALPR Camera Engine (alpr_engine.exe)
#
# Run from the project root on Windows:
#   pyinstaller build\alpr_engine.spec
#
# Output: dist\alpr_engine\  (onedir bundle)
#
# The build_windows.py script invokes this automatically.
#
# NOTE: EasyOCR model files (~300 MB) are bundled inside this exe's folder
# under .EasyOCR/.  They must be pre-downloaded before building:
#   python -c "import easyocr; easyocr.Reader(['en','tr'], gpu=False)"
# The build_windows.py script does this automatically.

import os
import pathlib
from PyInstaller.utils.hooks import collect_all, collect_submodules

block_cipher = None

# ── EasyOCR model cache ────────────────────────────────────────────────────
# Pre-downloaded models live in %USERPROFILE%\.EasyOCR\ on Windows.
# We bundle them so the packaged app runs fully offline.
_easyocr_cache = pathlib.Path.home() / ".EasyOCR"
_easyocr_datas = []
if _easyocr_cache.exists():
    _easyocr_datas = [(str(_easyocr_cache), ".EasyOCR")]

# ── Collect heavy ML packages ──────────────────────────────────────────────
ultralytics_datas, ultralytics_binaries, ultralytics_hidden = collect_all("ultralytics")
easyocr_datas, easyocr_binaries, easyocr_hidden = collect_all("easyocr")
timm_datas, timm_binaries, timm_hidden = collect_all("timm")

# ── Analysis ───────────────────────────────────────────────────────────────
a = Analysis(
    ["camera_loop_entry.py"],
    pathex=["."],
    binaries=ultralytics_binaries + easyocr_binaries + timm_binaries,
    datas=[
        # Local packages
        ("utils", "utils"),
        ("alpr_engine.py", "."),
        ("camera_loop.py", "."),
    ]
    + _easyocr_datas
    + ultralytics_datas
    + easyocr_datas
    + timm_datas,
    hiddenimports=[
        # PyTorch / YOLO internals
        "torch",
        "torch.nn",
        "torch.nn.functional",
        "torchvision",
        # OpenCV
        "cv2",
        # EasyOCR internals
        "easyocr",
        "easyocr.easyocr",
        "easyocr.detection",
        "easyocr.recognition",
        "easyocr.utils",
        "easyocr.config",
        # Ultralytics / YOLO
        "ultralytics",
        "ultralytics.models",
        "ultralytics.models.yolo",
        "ultralytics.engine",
        "ultralytics.engine.model",
        "ultralytics.engine.predictor",
        "ultralytics.nn.tasks",
        "ultralytics.utils",
        # requests (camera_loop polls the API)
        "requests",
        "urllib3",
        # dateutil
        "dateutil",
        "dateutil.parser",
    ]
    + ultralytics_hidden
    + easyocr_hidden
    + timm_hidden,
    hookspath=["build/hooks"],
    runtime_hooks=[],
    excludes=[
        "tkinter",
        "test",
        "unittest",
        # Remove unused server deps
        "fastapi",
        "uvicorn",
        "sqlalchemy",
        # Remove training dependencies
        "tensorboard",
        "wandb",
        "clearml",
        "comet_ml",
        # Remove unused GUI backends
        "matplotlib.backends._backend_tk",
        "PyQt5",
        "PyQt6",
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
    name="alpr_engine",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,   # console=True so the operator can see camera logs
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
        "vcruntime140.dll",
        "python3*.dll",
        "torch_*.pyd",
    ],
    name="alpr_engine",
)
