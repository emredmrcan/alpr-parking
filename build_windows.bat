@echo off
REM ============================================================
REM  ALPR Parking System — Windows Package Builder
REM  Run this on a Windows 10/11 machine from the project root.
REM
REM  Usage:
REM    build_windows.bat
REM    build_windows.bat --version 1.2.0 --model models\best.pt
REM    build_windows.bat --skip-frontend
REM ============================================================

title ALPR Build

echo.
echo ============================================================
echo  ALPR Parking System - Windows Build
echo ============================================================
echo.

REM ── Detect Python executable (py launcher or python) ─────────────────
set PYTHON_EXE=

where py >nul 2>&1
if not errorlevel 1 (
    set PYTHON_EXE=py
    goto python_found
)

where python >nul 2>&1
if not errorlevel 1 (
    set PYTHON_EXE=python
    goto python_found
)

echo ERROR: Python not found.
echo Install from https://python.org (Windows installer, 64-bit).
echo Make sure to check "Add python.exe to PATH" during installation.
pause
exit /b 1

:python_found
echo Using Python: %PYTHON_EXE%
%PYTHON_EXE% --version

REM Install/upgrade build dependencies silently
echo Installing build dependencies...
%PYTHON_EXE% -m pip install --upgrade pyinstaller colorama --quiet

REM Hand off to the Python build script, forwarding all arguments
%PYTHON_EXE% build_windows.py %*

if errorlevel 1 (
    echo.
    echo BUILD FAILED. See error messages above.
    pause
    exit /b 1
)

pause
