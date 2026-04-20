# ALPRv2 — MVP Implementation Plan

## Overview

This document describes the MVP architecture for the Turkish ALPR parking management system.
The goal is to connect the existing plate recognition engine to a minimal backend and a
gate-side UI that a worker operates in person.

**Important MVP constraint:** The barrier bar is opened **manually by the worker** at all times.
The system never opens the bar automatically. The worker is always physically present at the gate,
which means every database record is explicitly confirmed by a human before it is saved.

---

## Operational Flow

### Entrance Gate

1. Car pulls up to the barrier.
2. Camera detects the plate → recognised plate number appears on the gate screen.
3. Worker checks the plate on screen. If it is wrong, worker types the correct plate.
4. Worker presses **"Confirm Entry"** → session saved to database.
5. Worker opens the bar → car enters.

### Exit Gate

1. Car pulls up to the barrier.
2. Camera detects the plate → system looks up the open session → screen shows plate + fee.
3. Worker checks the plate. If it is wrong, worker types the correct plate.
4. Worker collects cash from the driver.
5. Worker presses **"Confirm Payment & Exit"** → session closed and marked as paid.
6. Worker opens the bar → car leaves.

### When the Camera Fails Completely

The worker types the plate number manually into the same confirmation screen.
No special "failed recognition" mode is needed — the form is always editable.

---

## Current State

| Component | Status |
|-----------|--------|
| YOLOv11 plate detector (`train.py`) | Done |
| EasyOCR + Turkish validation (`main.py`, `utils/plate_utils.py`) | Done |
| Backend API | Not started |
| Database | Not started |
| Gate UI | Not started |
| Camera integration (live feed) | Partial — image/video works, live camera loop exists |

---

## System Architecture

```
┌─────────────────────────────────────┐
│           Camera (USB / IP)          │
└──────────────┬──────────────────────┘
               │ frames
               ▼
┌─────────────────────────────────────┐
│        ALPR Engine  (main.py)        │
│  YOLO detect → crop → EasyOCR       │
│  → validate_tr_plate                 │
│  → push best candidate to UI        │
└──────────────┬──────────────────────┘
               │ HTTP POST (candidate only — not saved yet)
               ▼
┌─────────────────────────────────────┐
│        Gate UI  (index.html)         │
│  Shows detected plate (editable)     │
│  Worker corrects if needed           │
│  Worker presses Confirm              │
└──────────────┬──────────────────────┘
               │ HTTP POST (confirmed plate)
               ▼
┌─────────────────────────────────────┐
│        Backend API  (FastAPI)        │
│  POST /entrance                      │
│  POST /exit                          │
│  GET  /sessions                      │
└──────────────┬──────────────────────┘
               │ SQLite
               ▼
┌─────────────────────────────────────┐
│          Database  (SQLite)          │
└─────────────────────────────────────┘
```

**Key point:** The ALPR engine sends a detection *candidate* to the UI. Nothing is written to
the database until the worker confirms. This keeps every record human-verified without creating
any bottleneck, because the worker is at the gate anyway.

---

## Components

### 1. ALPR Engine

The existing `main.py` will be extended to:

- Run continuously against a live camera stream (camera index `0` or a configured IP camera URL).
- On each detection above confidence threshold, push the best plate candidate to the backend via
  `POST /candidate`. This is a temporary, in-memory state — not a database write.
- Continue reading frames. If a higher-confidence candidate arrives for the same gate event,
  replace the previous candidate.
- After the worker confirms (or the session is reset), clear the candidate and resume scanning.

No changes to `plate_utils.py` are needed at this stage.

### 2. Backend API

**Framework:** FastAPI (Python — consistent with existing stack)  
**Database:** SQLite via SQLAlchemy (no database server required for MVP)

#### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/candidate` | ALPR engine pushes a detected plate (in-memory, not saved) |
| `GET`  | `/candidate` | Gate UI polls for the latest detected plate |
| `POST` | `/entrance` | Worker confirms entry — saves session to DB |
| `POST` | `/exit` | Worker confirms payment & exit — closes session in DB |
| `GET`  | `/sessions` | List all sessions (used by the back-office view) |
| `GET`  | `/sessions/{plate}` | Look up the open session for a plate (used on exit gate) |

#### Database Schema

**`parking_sessions` table**

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `plate_number` | TEXT | Confirmed plate, e.g. `34ABC1234` |
| `raw_ocr_text` | TEXT | What the camera originally read (for accuracy tracking) |
| `entrance_time` | DATETIME | Set on worker confirmation at entrance |
| `exit_time` | DATETIME | Set on worker confirmation at exit |
| `duration_minutes` | INTEGER | Calculated on exit |
| `amount_due` | DECIMAL | Calculated on exit via price table |
| `status` | TEXT | `ACTIVE` / `PAID` |
| `entered_manually` | BOOLEAN | True if worker typed the plate (no OCR result) |

Storing `raw_ocr_text` alongside the confirmed `plate_number` lets you measure real-world OCR
accuracy over time simply by comparing the two columns.

**`price_schema` table**

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `duration_from_min` | INTEGER | Lower bound (inclusive) in minutes |
| `duration_to_min` | INTEGER | Upper bound (exclusive), NULL = open-ended |
| `price` | DECIMAL | Fee in TRY |

Example price rows:

| From | To | Price |
|------|----|-------|
| 0 | 30 | 0.00 |
| 30 | 60 | 20.00 |
| 60 | 120 | 35.00 |
| 120 | NULL | 50.00 |

Price rows are seeded once at startup and can be updated by editing the database directly for MVP.

### 3. Gate UI

**Technology:** Plain HTML + vanilla JavaScript (single `index.html` served by FastAPI).  
**Deployment:** Runs on the same machine as the camera and backend. Opened in a browser at
`http://localhost:8000` on a screen at the gate.

The UI has two modes, selected at startup via a URL parameter (e.g. `?gate=entrance` or
`?gate=exit`):

#### Entrance Mode

```
┌────────────────────────────────────┐
│  PARKING ENTRANCE                  │
│                                    │
│  Detected Plate:                   │
│  ┌──────────────────────────────┐  │
│  │  34 ABC 1234                 │  │  ← editable text field, pre-filled by OCR
│  └──────────────────────────────┘  │
│                                    │
│       [ CONFIRM ENTRY ]            │  ← large button
│                                    │
│  (No plate detected? Type above.)  │
└────────────────────────────────────┘
```

- Polls `GET /candidate` every second and updates the plate field automatically.
- Worker can edit the field at any time.
- Pressing "Confirm Entry" calls `POST /entrance` with the (possibly corrected) plate and the
  original `raw_ocr_text`. Clears the field afterwards.

#### Exit Mode

```
┌────────────────────────────────────┐
│  PARKING EXIT                      │
│                                    │
│  Detected Plate:                   │
│  ┌──────────────────────────────┐  │
│  │  34 ABC 1234                 │  │  ← editable
│  └──────────────────────────────┘  │
│                                    │
│  Duration:  2 hours 15 minutes     │
│  Fee:        ₺50.00                │
│                                    │
│   [ CONFIRM PAYMENT & EXIT ]       │
└────────────────────────────────────┘
```

- After the plate field is filled (by OCR poll or worker typing), pressing Tab or a "Look up"
  button fetches `GET /sessions/{plate}` and displays duration and fee.
- Pressing "Confirm Payment & Exit" calls `POST /exit`.

#### Back-Office View (Optional for MVP)

A second page (`/admin`) shows the full session list with columns:
Plate | Entrance | Exit | Duration | Fee | Status | Manual?

This is read-only at MVP — no editing needed here since all corrections happen at the gate in real time.

### 4. Configuration

A single `.env` file at the project root:

```
GATE=ENTRANCE           # or EXIT — set per machine/screen
CAMERA_SOURCE=0         # 0 = default USB cam, or rtsp://... for IP cam
DETECTION_CONFIDENCE=0.4
OCR_CONFIDENCE=0.3
API_BASE_URL=http://localhost:8000
```

---

## File Structure (Target)

```
PythonProject/
├── main.py                  # ALPR engine (extended to POST /candidate)
├── train.py                 # Training script (unchanged)
├── .env                     # NEW — central config
├── api/
│   ├── main.py              # NEW — FastAPI app entry point
│   ├── models.py            # NEW — SQLAlchemy models
│   ├── database.py          # NEW — DB session setup
│   ├── routes/
│   │   └── sessions.py      # NEW — all endpoints
│   └── static/
│       └── index.html       # NEW — Gate UI (entrance + exit + back-office)
├── utils/
│   └── plate_utils.py       # Unchanged
├── models/                  # YOLO weights + dataset
├── docs/
│   ├── ALPR.md              # Requirements (unchanged)
│   └── ALPRv2.md            # This document
└── requirements.txt         # NEW — pinned dependencies
```

---

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `ultralytics` | YOLOv11 detector |
| `easyocr` | OCR |
| `opencv-python` | Image processing & camera capture |
| `fastapi` | Backend API + static file serving |
| `uvicorn` | ASGI server |
| `sqlalchemy` | ORM / SQLite |
| `requests` | ALPR engine → API calls |
| `python-dotenv` | `.env` config loading |

---

## MVP Scope Boundaries

The following are **explicitly out of scope** for the MVP:

- Automated bar/barrier control (worker opens the bar manually at all times)
- Online payment integration (worker collects cash and confirms manually)
- Multi-camera / multi-gate synchronisation
- User-facing mobile or web app
- Cloud deployment (runs entirely on the local gate machine)
- Role-based access control (UI is on a local screen, not internet-facing)

---

## Build Order

1. `requirements.txt` and `.env`
2. `api/database.py` + `api/models.py` (SQLite + SQLAlchemy)
3. `api/routes/sessions.py` (all endpoints including `/candidate`)
4. `api/main.py` (wire up FastAPI + serve static files)
5. `api/static/index.html` (entrance mode + exit mode + back-office view)
6. Extend `main.py` to push candidates to `POST /candidate` instead of just printing

Each step is independently testable before moving to the next.
