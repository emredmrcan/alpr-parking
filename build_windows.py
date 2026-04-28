"""
Windows packaging build script for ALPR Parking System.

Usage (run from project root on a Windows 10/11 machine):
    python build_windows.py [--model models/best.pt] [--version 1.0.0] [--skip-frontend]

Requirements on the build machine:
    - Windows 10 or 11 (64-bit)
    - Python 3.10-3.12 (64-bit) — same version you develop with
    - Node.js >= 18 (for frontend build, unless --skip-frontend)
    - pip install pyinstaller
    - pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
      (CPU-only PyTorch reduces bundle size from ~3 GB to ~800 MB)

What this script does:
    Step 1  — Verify we are on Windows with 64-bit Python
    Step 2  — Install/verify CPU-only PyTorch
    Step 3  — Pre-download EasyOCR models (Turkish + English, ~300 MB)
    Step 4  — Build the React frontend (npm run build → api/static/)
    Step 5  — Run PyInstaller: alpr_server (FastAPI + ALPR engine)
    Step 6  — Run PyInstaller: alpr_engine (camera loop + ALPR engine)
    Step 7  — Assemble final ALPRParking/ folder structure
    Step 8  — Create ZIP archive (dist/ALPRParking-<version>.zip)
    Step 9  — Print SHA-256 checksums and bundle size summary

The resulting ZIP is self-contained and works fully offline on Windows 10/11.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import platform
import shutil
import struct
import subprocess
import sys
import zipfile
from pathlib import Path

# ── Colours for console output ────────────────────────────────────────────
try:
    import colorama

    colorama.init()
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    CYAN = "\033[96m"
    RESET = "\033[0m"
    BOLD = "\033[1m"
except ImportError:
    GREEN = YELLOW = RED = CYAN = RESET = BOLD = ""

# ── Paths ─────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent
DIST_DIR = ROOT / "dist"
PYINSTALLER_DIST = DIST_DIR / "_pyinstaller"
PACKAGE_NAME = "ALPRParking"


# ── Helpers ───────────────────────────────────────────────────────────────

def step(n: int, msg: str) -> None:
    print(f"\n{BOLD}{CYAN}[Step {n}]{RESET} {msg}")


def ok(msg: str) -> None:
    print(f"  {GREEN}✓{RESET} {msg}")


def warn(msg: str) -> None:
    print(f"  {YELLOW}⚠{RESET} {msg}")


def fail(msg: str) -> None:
    print(f"  {RED}✗{RESET} {msg}")
    sys.exit(1)


def run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
    """Run a subprocess command and raise on non-zero exit."""
    print(f"  {YELLOW}>{RESET} {' '.join(str(c) for c in cmd)}")
    result = subprocess.run(cmd, **kwargs)
    if result.returncode != 0:
        fail(f"Command failed with exit code {result.returncode}")
    return result


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def human_size(path: Path) -> str:
    total = sum(f.stat().st_size for f in path.rglob("*") if f.is_file())
    for unit in ("B", "KB", "MB", "GB"):
        if total < 1024:
            return f"{total:.1f} {unit}"
        total /= 1024
    return f"{total:.1f} TB"


def copytree_force(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


# ── Build steps ───────────────────────────────────────────────────────────

def check_platform() -> None:
    step(1, "Verifying build environment")

    if platform.system() != "Windows":
        fail(
            "This script must run on Windows 10/11.\n"
            "  Cross-compilation from macOS/Linux is not supported for PyTorch + OpenCV.\n"
            "  Use a Windows machine or GitHub Actions 'windows-latest' runner."
        )

    bits = struct.calcsize("P") * 8
    if bits != 64:
        fail(f"64-bit Python required (detected {bits}-bit). Use python.org 64-bit installer.")

    ver = sys.version_info
    if not (3, 10) <= (ver.major, ver.minor) <= (3, 12):
        warn(f"Python {ver.major}.{ver.minor} detected. Tested range is 3.10–3.12.")
    else:
        ok(f"Python {ver.major}.{ver.minor}.{ver.micro} (64-bit)")

    # pyinstaller is installed into the Scripts/ folder of the active venv/Python.
    # shutil.which() may miss it when using the py launcher without a venv, so
    # fall back to checking via the current interpreter directly.
    if shutil.which("pyinstaller") is None:
        import importlib.util
        if importlib.util.find_spec("PyInstaller") is None:
            fail(
                "pyinstaller not found.\n"
                "  Run: py -m pip install pyinstaller\n"
                "  or:  python -m pip install pyinstaller"
            )
    ok("PyInstaller found")


def ensure_cpu_pytorch() -> None:
    step(2, "Verifying CPU-only PyTorch (reduces bundle from ~3 GB → ~800 MB)")

    try:
        import torch
        has_cuda = torch.cuda.is_available()
        is_cpu_only = "+cpu" in torch.__version__ or not has_cuda
        if not is_cpu_only:
            warn(
                f"CUDA-enabled PyTorch detected ({torch.__version__}).\n"
                "  The bundle will include ~2 GB of CUDA libraries.\n"
                "  For a smaller bundle, reinstall with:\n"
                "    pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu"
            )
        else:
            ok(f"PyTorch {torch.__version__} (CPU-only) ✓")
    except ImportError:
        fail(
            "PyTorch not installed.\n"
            "  Run: pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu"
        )


def _fix_ssl_certs() -> None:
    """Apply certifi's CA bundle so urllib / requests can verify HTTPS on Windows.

    Python installed from python.org on Windows ships without the system CA
    store, which causes SSL: CERTIFICATE_VERIFY_FAILED when downloading models.
    certifi bundles Mozilla's CA set and is always available (it is a dependency
    of requests, which is a dependency of easyocr).
    """
    try:
        import certifi
        os.environ.setdefault("SSL_CERT_FILE", certifi.where())
        os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())
        ok(f"SSL CA bundle set from certifi ({certifi.where()})")
    except ImportError:
        import ssl
        ssl._create_default_https_context = ssl._create_unverified_context  # type: ignore[attr-defined]
        warn(
            "certifi not found — SSL verification disabled for model download.\n"
            "  Install it with: pip install certifi"
        )


def predownload_easyocr() -> None:
    step(3, "Pre-downloading EasyOCR models (Turkish + English, ~300 MB)")

    # Windows Python often lacks a valid CA bundle; fix before any HTTPS call.
    _fix_ssl_certs()

    easyocr_cache = Path.home() / ".EasyOCR"
    model_dir = easyocr_cache / "model"

    # Check if models are already present to avoid re-downloading
    needed = ["english_g2.pth", "latin_g2.pth", "craft_mlt_25k.pth"]
    if model_dir.exists() and all((model_dir / m).exists() for m in needed):
        ok(f"EasyOCR models already cached at {easyocr_cache}")
        return

    print("  Downloading EasyOCR models (this may take a few minutes)…")
    try:
        import easyocr
        easyocr.Reader(["en", "tr"], gpu=False, verbose=False)
        ok(f"EasyOCR models downloaded to {easyocr_cache}")
    except Exception as exc:
        fail(f"EasyOCR model download failed: {exc}\n  Check your internet connection.")


def build_frontend(skip: bool) -> None:
    step(4, "Building React frontend")

    if skip:
        warn("--skip-frontend flag set, skipping npm build.")
        static = ROOT / "api" / "static"
        if not (static / "index.html").exists():
            fail(
                "api/static/index.html not found.\n"
                "  Either remove --skip-frontend or run: cd frontend && npm run build"
            )
        ok("Using existing api/static/ (pre-built)")
        return

    frontend_dir = ROOT / "frontend"
    if not frontend_dir.exists():
        fail("frontend/ directory not found.")

    node = shutil.which("node") or shutil.which("node.exe")
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if not node or not npm:
        fail(
            "Node.js / npm not found.\n"
            "  Install from https://nodejs.org (LTS) then re-run."
        )

    node_ver = subprocess.run([node, "--version"], capture_output=True, text=True)
    ok(f"Node.js {node_ver.stdout.strip()}")

    run([npm, "install"], cwd=frontend_dir)
    run([npm, "run", "build"], cwd=frontend_dir)

    static = ROOT / "api" / "static"
    if not (static / "index.html").exists():
        fail("Frontend build produced no index.html in api/static/.")
    ok(f"Frontend built → {static}")


def run_pyinstaller(spec: str, label: str) -> None:
    """Run PyInstaller for a given spec file, output to PYINSTALLER_DIST."""
    run(
        [
            sys.executable, "-m", "PyInstaller",
            f"build/{spec}",
            "--distpath", str(PYINSTALLER_DIST),
            "--workpath", str(ROOT / "build" / "_work"),
            "--noconfirm",
        ],
        cwd=ROOT,
    )
    ok(f"{label} built → {PYINSTALLER_DIST / spec.replace('.spec', '')}")


def build_executables() -> None:
    step(5, "Building alpr_server.exe (FastAPI + ALPR engine)")
    run_pyinstaller("alpr_server.spec", "alpr_server")

    step(6, "Building alpr_engine.exe (camera loop + ALPR engine)")
    run_pyinstaller("alpr_engine.spec", "alpr_engine")


def assemble_package(version: str, model_path: Path) -> Path:
    step(7, f"Assembling final package: {PACKAGE_NAME}-{version}/")

    out = DIST_DIR / f"{PACKAGE_NAME}-{version}"
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    # app/ — the two PyInstaller bundles
    app_dir = out / "app"
    app_dir.mkdir()
    copytree_force(PYINSTALLER_DIST / "alpr_server", app_dir / "alpr_server")
    ok("Copied alpr_server bundle → app/alpr_server/")
    copytree_force(PYINSTALLER_DIST / "alpr_engine", app_dir / "alpr_engine")
    ok("Copied alpr_engine bundle → app/alpr_engine/")

    # EasyOCR model cache — must sit beside alpr_engine.exe so the packaged
    # exe can run fully offline.  camera_loop_entry.py sets EASYOCR_MODEL_DIR
    # to this location at runtime.
    easyocr_src = Path.home() / ".EasyOCR"
    easyocr_dst = app_dir / "alpr_engine" / ".EasyOCR"
    if easyocr_src.exists() and any(easyocr_src.rglob("*.pth")):
        copytree_force(easyocr_src, easyocr_dst)
        ok(f"Copied EasyOCR model cache → app/alpr_engine/.EasyOCR/")
    else:
        fail(
            "EasyOCR model cache not found at ~/.EasyOCR/ (or contains no .pth files).\n"
            "  Make sure Step 3 completed successfully, then re-run this script."
        )

    # models/ — the YOLO .pt weights file
    models_dir = out / "models"
    models_dir.mkdir()
    if not model_path.exists():
        fail(
            f"Model file not found: {model_path}\n"
            "  Specify the correct path with --model <path/to/best.pt>"
        )
    shutil.copy2(model_path, models_dir / "best.pt")
    ok(f"Copied model: {model_path.name} → models/best.pt")

    # translations/
    if (ROOT / "translations").exists():
        copytree_force(ROOT / "translations", out / "translations")
        ok("Copied translations/")
    else:
        warn("translations/ directory not found — skipping")

    # config/ — template .env and placeholder for database
    config_dir = out / "config"
    config_dir.mkdir()
    template = ROOT / "config" / ".env.template"
    if template.exists():
        shutil.copy2(template, config_dir / ".env")
        ok("Copied config/.env.template → config/.env")
    else:
        warn("config/.env.template not found — writing minimal default")
        _write_default_env(config_dir / ".env")

    # uploads/ — created empty so the server doesn't error on first start
    (out / "uploads").mkdir()

    # Launcher scripts
    _write_start_bat(out, version)
    _write_stop_bat(out)
    ok("Wrote START.bat and STOP.bat")

    # Client README
    readme_src = ROOT / "README_CLIENT.txt"
    if readme_src.exists():
        shutil.copy2(readme_src, out / "README_CLIENT.txt")
        ok("Copied README_CLIENT.txt")
    else:
        warn("README_CLIENT.txt not found — skipping")

    ok(f"Package assembled at {out}  (size: {human_size(out)})")
    return out


def _write_default_env(path: Path) -> None:
    path.write_text(
        "DATABASE_TYPE=sqlite\n"
        "DATABASE_URL=sqlite:///./config/alpr_parking.db\n"
        "MODEL_PATH=models/best.pt\n"
        "UPLOAD_DIR=uploads\n"
        "API_BASE_URL=http://localhost:8000\n"
        "DETECTION_CONFIDENCE=0.4\n"
        "OCR_CONFIDENCE=0.3\n"
        "BAR_CONFIDENCE_THRESHOLD=0.70\n"
        "FRAME_SKIP=5\n"
        "GATES_POLL_SEC=30\n"
        "DETECTION_LOG_INTERVAL_SEC=1.0\n"
        "LOG_LEVEL=INFO\n"
        "BARRIER_TYPE=dummy\n"
        "BARRIER_PORT=COM3\n"
        "BARRIER_RELAY_CHANNEL=1\n"
        "BARRIER_OPEN_DURATION_SEC=1.5\n"
        "BARRIER_TIMEOUT_SEC=3\n",
        encoding="utf-8",
    )


def _write_start_bat(out: Path, version: str) -> None:
    (out / "START.bat").write_text(
        "@echo off\n"
        f"title ALPR Parking System v{version}\n"
        "cd /d \"%~dp0\"\n"
        "\n"
        "echo ============================================\n"
        f"echo  ALPR Parking System v{version}\n"
        "echo ============================================\n"
        "echo.\n"
        "\n"
        "REM ── Check config exists ──────────────────────────────────────────\n"
        "if not exist \"config\\.env\" (\n"
        "    echo ERROR: config\\.env not found.\n"
        "    echo Please copy config\\.env.template to config\\.env and edit it.\n"
        "    pause\n"
        "    exit /b 1\n"
        ")\n"
        "\n"
        "REM ── Start the API server (minimised window) ──────────────────────\n"
        "echo Starting API server...\n"
        "start \"ALPR Server\" /min app\\alpr_server\\alpr_server.exe --config config\\.env\n"
        "\n"
        "REM ── Wait until the health endpoint responds ──────────────────────\n"
        "echo Waiting for server to be ready (up to 60 seconds)...\n"
        "set /a tries=0\n"
        ":waitloop\n"
        "timeout /t 2 /nobreak >nul\n"
        "curl -s -o nul -w \"%%{http_code}\" http://localhost:8000/health 2>nul | findstr /c:\"200\" >nul\n"
        "if not errorlevel 1 goto server_ready\n"
        "set /a tries+=1\n"
        "if %tries% lss 30 goto waitloop\n"
        "echo ERROR: Server did not start within 60 seconds.\n"
        "echo Check the server window for error messages.\n"
        "pause\n"
        "exit /b 1\n"
        "\n"
        ":server_ready\n"
        "echo Server is ready.\n"
        "\n"
        "REM ── Start the camera engine (minimised window) ───────────────────\n"
        "echo Starting camera engine...\n"
        "start \"ALPR Engine\" /min app\\alpr_engine\\alpr_engine.exe --config config\\.env\n"
        "\n"
        "REM ── Open the browser ─────────────────────────────────────────────\n"
        "timeout /t 2 /nobreak >nul\n"
        "start \"\" http://localhost:8000\n"
        "\n"
        "echo.\n"
        "echo System is running. This window can be closed.\n"
        "echo To stop the system, run STOP.bat.\n"
        "echo.\n"
        "pause\n",
        encoding="utf-8",
    )


def _write_stop_bat(out: Path) -> None:
    (out / "STOP.bat").write_text(
        "@echo off\n"
        "echo Stopping ALPR Parking System...\n"
        "taskkill /f /im alpr_server.exe >nul 2>&1\n"
        "taskkill /f /im alpr_engine.exe >nul 2>&1\n"
        "echo Done.\n"
        "timeout /t 2 /nobreak\n",
        encoding="utf-8",
    )


def create_zip(package_dir: Path, version: str) -> Path:
    step(8, "Creating ZIP archive")

    zip_path = DIST_DIR / f"{PACKAGE_NAME}-{version}.zip"
    print(f"  Writing {zip_path} …")

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for file in sorted(package_dir.rglob("*")):
            if file.is_file():
                arcname = file.relative_to(DIST_DIR)
                zf.write(file, arcname)

    size_mb = zip_path.stat().st_size / 1024 / 1024
    ok(f"ZIP created: {zip_path}  ({size_mb:.0f} MB)")
    return zip_path


def print_summary(package_dir: Path, zip_path: Path) -> None:
    step(9, "Build summary")

    print(f"\n  {BOLD}Package folder:{RESET}  {package_dir}")
    print(f"  {BOLD}ZIP archive:{RESET}     {zip_path}")
    print(f"  {BOLD}ZIP size:{RESET}        {zip_path.stat().st_size / 1024 / 1024:.0f} MB")
    print(f"  {BOLD}SHA-256:{RESET}         {sha256(zip_path)}")

    limit_mb = 1536  # 1.5 GB
    zip_mb = zip_path.stat().st_size / 1024 / 1024
    if zip_mb > limit_mb:
        warn(f"ZIP exceeds 1.5 GB target ({zip_mb:.0f} MB). Consider using CPU-only PyTorch.")
    else:
        ok(f"ZIP size is within 1.5 GB target ({zip_mb:.0f} MB)")

    print(
        f"\n  {GREEN}{BOLD}Build complete!{RESET}\n"
        f"  Deliver {zip_path.name} to the client.\n"
        f"  Instruct them to: unzip → double-click START.bat\n"
    )


# ── Main ──────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build the Windows ALPR Parking System package.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--version", default="1.0.0",
        help="Version string for the output folder/ZIP (default: 1.0.0)",
    )
    parser.add_argument(
        "--model", default=None,
        help="Path to the YOLO .pt weights file to bundle (default: auto-detected)",
    )
    parser.add_argument(
        "--skip-frontend", action="store_true",
        help="Skip npm build step (use existing api/static/ content)",
    )
    parser.add_argument(
        "--skip-torch-check", action="store_true",
        help="Skip the CPU-PyTorch verification step",
    )
    args = parser.parse_args()

    # Resolve model path
    if args.model:
        model_path = Path(args.model)
        if not model_path.is_absolute():
            model_path = ROOT / model_path
    else:
        # Auto-detect: prefer models/best.pt, then scan runs/detect/
        candidates = [
            ROOT / "models" / "best.pt",
            ROOT / "models" / "license_plate_detector.pt",
        ]
        candidates += sorted((ROOT / "runs" / "detect").rglob("best.pt"), reverse=True)
        model_path = next((p for p in candidates if p.exists()), None)
        if model_path is None:
            fail(
                "Could not auto-detect a YOLO .pt model file.\n"
                "  Use --model path/to/best.pt to specify it explicitly."
            )
        print(f"\n  Auto-detected model: {model_path}")

    print(f"\n{BOLD}ALPR Parking System — Windows Build Script{RESET}")
    print(f"  Version : {args.version}")
    print(f"  Model   : {model_path}")
    print(f"  Output  : {DIST_DIR}")

    check_platform()
    if not args.skip_torch_check:
        ensure_cpu_pytorch()
    predownload_easyocr()
    build_frontend(skip=args.skip_frontend)
    build_executables()
    package_dir = assemble_package(args.version, model_path)
    zip_path = create_zip(package_dir, args.version)
    print_summary(package_dir, zip_path)


if __name__ == "__main__":
    main()
