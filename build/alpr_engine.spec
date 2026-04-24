# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller spec — ALPR Camera Engine (alpr_engine.exe)
#
# Run from the project root on Windows:
#   pyinstaller build\alpr_engine.spec
#
# Output: dist\alpr_engine\  (onedir bundle)
#
# NOTE: PyInstaller resolves paths relative to SPECPATH (the directory that
# contains this spec file, i.e. build\).  All source paths must therefore be
# expressed as absolute paths anchored to the project root, which is one
# level above SPECPATH.
#
# EasyOCR model files (~300 MB) are bundled inside this exe's folder under
# .EasyOCR\.  They must be pre-downloaded before building:
#   python -c "import easyocr; easyocr.Reader(['en','tr'], gpu=False)"
# The build_windows.py script does this automatically.

import os
import pathlib
from PyInstaller.utils.hooks import collect_all

block_cipher = None

# ── Project root (one level above build\) ─────────────────────────────────
ROOT = os.path.abspath(os.path.join(SPECPATH, ".."))

# ── EasyOCR model cache (pre-downloaded, bundled for offline use) ──────────
_easyocr_cache = pathlib.Path.home() / ".EasyOCR"
_easyocr_datas = []
if _easyocr_cache.exists():
    _easyocr_datas = [(str(_easyocr_cache), ".EasyOCR")]

# ── Collect heavy ML packages ──────────────────────────────────────────────
ultralytics_datas, ultralytics_binaries, ultralytics_hidden = collect_all("ultralytics")
easyocr_datas, easyocr_binaries, easyocr_hidden = collect_all("easyocr")

try:
    timm_datas, timm_binaries, timm_hidden = collect_all("timm")
except Exception:
    timm_datas, timm_binaries, timm_hidden = [], [], []

# ── Analysis ───────────────────────────────────────────────────────────────
a = Analysis(
    [os.path.join(ROOT, "camera_loop_entry.py")],
    pathex=[ROOT],
    binaries=ultralytics_binaries + easyocr_binaries + timm_binaries,
    datas=[
        (os.path.join(ROOT, "utils"),             "utils"),
        (os.path.join(ROOT, "alpr_engine.py"),    "."),
        (os.path.join(ROOT, "camera_loop.py"),    "."),
    ]
    + _easyocr_datas
    + ultralytics_datas
    + easyocr_datas
    + timm_datas,
    hiddenimports=[
        "torch",
        "torch.nn",
        "torch.nn.functional",
        "torchvision",
        "cv2",
        "easyocr",
        "easyocr.easyocr",
        "easyocr.detection",
        "easyocr.recognition",
        "easyocr.utils",
        "easyocr.config",
        "ultralytics",
        "ultralytics.models",
        "ultralytics.models.yolo",
        "ultralytics.engine",
        "ultralytics.engine.model",
        "ultralytics.engine.predictor",
        "ultralytics.nn.tasks",
        "ultralytics.utils",
        "requests",
        "urllib3",
        "dateutil",
        "dateutil.parser",
    ]
    + ultralytics_hidden
    + easyocr_hidden
    + timm_hidden,
    hookspath=[os.path.join(SPECPATH, "hooks")],
    runtime_hooks=[],
    # Do not exclude unittest/test — ultralytics / torch import them when loading YOLO.
    excludes=[
        "tkinter",
        "fastapi",
        "uvicorn",
        "sqlalchemy",
        "tensorboard",
        "wandb",
        "clearml",
        "comet_ml",
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

_icon = os.path.join(SPECPATH, "icon.ico")

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
    name="alpr_engine",
)
