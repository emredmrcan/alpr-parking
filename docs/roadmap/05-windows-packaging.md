# Roadmap Item 5 — Windows Packaging & Easy Launcher

**Priority:** P4 — Final delivery step  
**Estimated effort:** 3–4 engineering days  
**Depends on:** All previous items (1–4) must be complete and stable  
**Blocks:** Nothing — this is the last step before client delivery

---

## Problem Statement

The system currently runs from a developer terminal (`uvicorn api.main:app ...`). The
client is a non-technical user who must be able to:

1. Receive a USB stick or download a ZIP file.
2. Double-click a file.
3. See the application open in their browser automatically.
4. Never touch a terminal or edit a config file unless explicitly guided by the setup wizard.

Additionally, the ALPR engine uses Python ML libraries (PyTorch, YOLO, EasyOCR) that
have complex native dependencies. All of these must be bundled and work offline.

---

## Goal

1. Produce a **portable folder** (ZIP) that requires no installation: unzip → double-click
   `START.bat` → app launches.
2. Produce an optional **Windows installer** (`.exe`) that installs to Program Files,
   adds a Start Menu shortcut, and optionally starts the app on Windows login.
3. Both outputs produced automatically by a **build script** (`build_windows.bat` /
   `build_windows.py`) that any developer can run to produce a release.
4. A **first-run setup wizard** guides the user through: choosing database type, setting
   up the barrier (or skipping), and adding their first camera.
5. The built package must work on **Windows 10 and Windows 11**, both 64-bit.

---

## Architecture of the Packaged Application

```
ALPRParking/                          ← root folder
├── START.bat                         ← double-click to launch (primary entry point)
├── STOP.bat                          ← gracefully stop the app
├── app/                              ← PyInstaller onedir output
│   ├── alpr_server.exe               ← FastAPI + all Python deps bundled
│   ├── alpr_engine.exe               ← ALPR camera loop (separate process)
│   ├── python312.dll
│   ├── torch/                        ← PyTorch (large)
│   ├── easyocr/                      ← EasyOCR models (pre-downloaded)
│   └── ... (all other deps)
├── models/
│   └── best.pt                       ← YOLO weights
├── translations/
│   ├── en.json
│   └── tr.json
├── uploads/                          ← created on first run
├── config/
│   └── .env                          ← user config (editable, survives updates)
└── README_CLIENT.txt                 ← plain-language instructions
```

### Why two executables?

The FastAPI server (`alpr_server.exe`) and the ALPR camera engine
(`alpr_engine.exe`) are separate processes that communicate via HTTP. Bundling them as
one process and running them in threads causes PyInstaller issues with PyTorch's
multiprocessing. Keeping them separate also means a camera crash does not take down
the web UI.

---

## Build Tooling

### Primary tool: PyInstaller

```bash
pip install pyinstaller
```

PyInstaller bundles the Python interpreter, all imports, and all native libraries
into a self-contained folder. It supports PyTorch, OpenCV, and EasyOCR when configured
correctly.

### Spec files (not CLI flags — always use spec files for complex projects)

**`build/alpr_server.spec`**

```python
# PyInstaller spec for the FastAPI server
block_cipher = None
a = Analysis(
    ['api/main_entry.py'],           # thin wrapper: calls uvicorn.run(...)
    pathex=['.'],
    binaries=[],
    datas=[
        ('api/static',  'api/static'),
        ('translations', 'translations'),
    ],
    hiddenimports=[
        'uvicorn.logging', 'uvicorn.loops', 'uvicorn.loops.auto',
        'uvicorn.protocols', 'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto', 'uvicorn.lifespan',
        'uvicorn.lifespan.on', 'sqlalchemy.dialects.sqlite',
        'sqlalchemy.dialects.postgresql',
        'passlib.handlers.bcrypt',   # if auth is added later
    ],
    hookspath=['build/hooks'],
    runtime_hooks=[],
    excludes=['tkinter', 'test', 'unittest'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True,
          name='alpr_server', debug=False, bootloader_ignore_signals=False,
          strip=False, upx=True, console=True, icon='build/icon.ico')
coll = COLLECT(exe, a.binaries, a.zipfiles, a.datas,
               strip=False, upx=True, upx_exclude=[],
               name='alpr_server')
```

**`build/alpr_engine.spec`** — same pattern, entry point is `alpr_engine.py`.

### EasyOCR model pre-download

EasyOCR downloads models on first use (~400 MB). On a client machine without internet,
this will fail silently. The build process must pre-download models and bundle them:

```bash
# Run once during build (on build machine with internet)
python -c "
import easyocr
r = easyocr.Reader(['tr', 'en'], gpu=False)  # downloads to ~/.EasyOCR/model/
"
# Then include ~/.EasyOCR/ in the PyInstaller datas
```

Add to spec file:
```python
import os, pathlib
easyocr_cache = pathlib.Path.home() / '.EasyOCR'
datas=[
    (str(easyocr_cache), '.EasyOCR'),
    ...
]
```

### PyTorch CPU-only build

The client machine likely has no NVIDIA GPU. The default PyTorch package includes
CUDA libraries that add ~2 GB to the bundle. Install the CPU-only build:

```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
```

Resulting bundle size: ~800 MB instead of ~3 GB.

---

## START.bat (primary launcher)

```batch
@echo off
title ALPR Parking System
cd /d "%~dp0"

echo Starting ALPR Parking System...

REM Start the API server in a hidden window
start "" /min app\alpr_server\alpr_server.exe --config config\.env

REM Wait for server to be ready (poll health endpoint)
:waitloop
timeout /t 1 /nobreak >nul
curl -s http://localhost:8000/health >nul 2>&1
if errorlevel 1 goto waitloop

REM Start the camera engine
start "" /min app\alpr_engine\alpr_engine.exe --config config\.env

REM Open the browser
start "" http://localhost:8000

echo System started. Close this window to keep running in background.
echo Press Ctrl+C or run STOP.bat to shut down.
pause
```

---

## STOP.bat

```batch
@echo off
echo Stopping ALPR Parking System...
taskkill /f /im alpr_server.exe >nul 2>&1
taskkill /f /im alpr_engine.exe >nul 2>&1
echo Done.
timeout /t 2
```

---

## First-Run Setup Wizard

On first launch (no `.env` exists in `config/` or it contains the default placeholder
values), the browser opens at `http://localhost:8000/setup` instead of the dashboard.

The wizard is a multi-step page served by FastAPI:

### Step 1 — Language

```
Welcome / Hoş Geldiniz

Select your language / Dilinizi seçin:

    [ English ]    [ Türkçe ]
```

### Step 2 — Database

```
Database Setup

How will this computer be used?

(●) Standalone (offline, no internet required)
    ✓ Recommended for most installations
    Uses a local database file on this computer.

( ) Connected (shares a database with other computers on the network)
    Requires a PostgreSQL server on your network.
    Server address: [                    ]
    Username:       [                    ]
    Password:       [                    ]
    Database name:  [                    ]
    [ Test Connection ]

                    [ Next → ]
```

### Step 3 — Barrier

```
Barrier / Gate Control

Do you have a USB relay board connected to control the barrier?

(●) Yes — I have a USB relay board connected
    Select COM port: [ COM3 ▼ ]    (auto-detected from Device Manager)
    [ Test Relay — Click to trigger for 1 second ]

( ) No — I will open the barrier manually (worker presses physical button)

( ) IP Barrier — My barrier has a network address
    URL: [ http://                    ]
    [ Test Connection ]

                    [ ← Back ]   [ Next → ]
```

### Step 4 — Add First Camera

Renders the same Add Camera Wizard from Item 4.

### Step 5 — Done

```
✓ Setup Complete!

Your ALPR Parking System is ready.

Summary:
  • Database:  Local SQLite (alpr_parking.db)
  • Barrier:   USB Relay on COM3
  • Cameras:   1 camera registered (Entrance — USB #0)

                [ Open Dashboard → ]
```

Wizard writes the final `config/.env` file. Subsequent launches go directly to the
dashboard.

---

## Optional Windows Installer (Inno Setup)

For clients who want Start Menu integration and auto-start:

```iss
; build/installer.iss — Inno Setup script
[Setup]
AppName=ALPR Parking System
AppVersion=1.0.0
DefaultDirName={autopf}\ALPRParking
DefaultGroupName=ALPR Parking
OutputDir=dist
OutputBaseFilename=ALPRParking-Setup-1.0.0
Compression=lzma2
SolidCompression=yes

[Files]
Source: "dist\ALPRParking\*"; DestDir: "{app}"; Flags: recursesubdirs

[Icons]
Name: "{group}\ALPR Parking System"; Filename: "{app}\START.bat"
Name: "{group}\Stop ALPR Parking"; Filename: "{app}\STOP.bat"
Name: "{commondesktop}\ALPR Parking System"; Filename: "{app}\START.bat"

[Run]
Filename: "{app}\START.bat"; Description: "Launch ALPR Parking System"; Flags: postinstall nowait
```

---

## Build Script (`build_windows.py`)

A single Python script orchestrates the entire build:

```
Step 1: Clean dist/ and build/ output directories
Step 2: Install CPU-only PyTorch (if not already installed correctly)
Step 3: Pre-download EasyOCR models
Step 4: Build frontend (npm run build in frontend/)
Step 5: Copy built frontend to api/static/
Step 6: PyInstaller: build alpr_server (spec file)
Step 7: PyInstaller: build alpr_engine (spec file)
Step 8: Assemble final folder structure (models, translations, config template, .bat files)
Step 9: Create ZIP archive
Step 10: (Optional) Run Inno Setup to produce installer .exe
Step 11: Print checksums (SHA-256) for both ZIP and installer
```

The script is intended to be run on a **Windows 10/11 machine** (cross-compilation from
Mac/Linux is not reliable for Windows GUI + native libs like OpenCV + PyTorch).
For automated builds, use a GitHub Actions Windows runner.

---

## Windows-Specific Issues and Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Windows Defender flags the .exe | PyInstaller executables are often flagged | Code-sign the exe (optional) or add Defender exclusion in installer |
| "This app can't run on your PC" | 32-bit vs 64-bit mismatch | Always build with 64-bit Python |
| OpenCV can't open camera (MSMF timeout) | Media Foundation slow on Windows | Use `cv2.CAP_DSHOW` backend |
| Port 8000 blocked by firewall | Windows Firewall | Installer adds firewall rule via `netsh` |
| `alpr_parking.db` locked | Multiple processes open same SQLite file | WAL mode (Item 1) + single writer process |
| EasyOCR GPU warning in logs | No CUDA on client machine | Set `gpu=False` explicitly |
| Long cold-start (15–30 seconds) | PyTorch/YOLO initialization | Show a loading screen in the browser during startup |

---

## Client-Facing Documentation (`README_CLIENT.txt`)

Included in the ZIP. Plain language, no technical jargon:

```
ALPR PARKING SYSTEM — QUICK START GUIDE
========================================

To start the system:
  → Double-click START.bat
  → Wait about 20 seconds
  → The app will open automatically in your browser

To stop the system:
  → Double-click STOP.bat
  → Or press Ctrl+C in the black window

First time setup:
  → The system will ask you some questions the first time.
  → Follow the on-screen instructions.
  → It takes about 5 minutes.

If the browser does not open automatically:
  → Open any browser (Chrome, Edge, Firefox)
  → Go to: http://localhost:8000

If you need help: [support contact details here]
```

---

## Testing Checklist

- [ ] Clean Windows 10 VM (no Python, no Visual C++ runtime) — `START.bat` launches
      successfully
- [ ] Clean Windows 11 machine — same
- [ ] Cold start time from double-click to browser opening ≤ 30 seconds
- [ ] Add a camera via wizard on first run — camera detected and ALPR starts
- [ ] SQLite database created in `config/alpr_parking.db` after first run
- [ ] All existing sessions and subscriptions survive a `STOP.bat` → `START.bat` restart
- [ ] Installer (`ALPRParking-Setup-1.0.0.exe`) installs cleanly and creates Start Menu
      shortcut
- [ ] Uninstall from Control Panel removes files without leaving orphans
- [ ] USB relay triggers correctly after packaging (pyserial dependency included)
- [ ] ZIP file size ≤ 1.5 GB (CPU-only PyTorch)
- [ ] Windows Defender scan — note any detections; code-sign or document workaround

---

## Acceptance Criteria

1. A non-technical user with zero programming knowledge can get the system running
   in under 10 minutes using only the `README_CLIENT.txt` and the first-run wizard.
2. The portable ZIP requires no internet connection after extraction.
3. The application starts in under 30 seconds on a typical Windows laptop (8 GB RAM,
   no GPU).
4. The installer cleanly installs and uninstalls without leaving registry orphans.
5. All features from Items 1–4 work identically in the packaged version as in the
   development environment.
6. The build process is fully scripted and reproducible by any developer with a
   Windows 10/11 machine and Python installed.
