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
# RapidOCR ONNX models are bundled inside the rapidocr_onnxruntime wheel and
# collected automatically by collect_all().  No external model cache is needed.

import os
from PyInstaller.utils.hooks import collect_all

block_cipher = None

# ── Project root (one level above build\) ─────────────────────────────────
ROOT = os.path.abspath(os.path.join(SPECPATH, ".."))

# ── Collect heavy ML packages ──────────────────────────────────────────────
ultralytics_datas, ultralytics_binaries, ultralytics_hidden = collect_all("ultralytics")
rapidocr_datas, rapidocr_binaries, rapidocr_hidden = collect_all("rapidocr_onnxruntime")

try:
    onnxruntime_datas, onnxruntime_binaries, onnxruntime_hidden = collect_all("onnxruntime")
except Exception:
    onnxruntime_datas, onnxruntime_binaries, onnxruntime_hidden = [], [], []

# ── Analysis ───────────────────────────────────────────────────────────────
a = Analysis(
    [os.path.join(ROOT, "camera_loop_entry.py")],
    pathex=[ROOT],
    binaries=ultralytics_binaries + rapidocr_binaries + onnxruntime_binaries,
    datas=[
        (os.path.join(ROOT, "utils"),             "utils"),
        (os.path.join(ROOT, "alpr_engine.py"),    "."),
        (os.path.join(ROOT, "camera_loop.py"),    "."),
    ]
    + ultralytics_datas
    + rapidocr_datas
    + onnxruntime_datas,
    hiddenimports=[
        # dotenv — conditional import in camera_loop_entry.py; PyInstaller misses it
        "dotenv",
        "dotenv.main",
        "torch",
        "torch.nn",
        "torch.nn.functional",
        "torchvision",
        "cv2",
        "rapidocr_onnxruntime",
        "onnxruntime",
        "shapely",
        "pyclipper",
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
    + rapidocr_hidden
    + onnxruntime_hidden,
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
