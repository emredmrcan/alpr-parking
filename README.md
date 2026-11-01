# ALPR Parking Management System

Automated licence-plate recognition (ALPR) for Turkish parking lots, aimed at small parking operators who want to run entry/exit control on a single PC with ordinary IP/USB cameras.

A **YOLO v11** detector and **RapidOCR** (ONNX) read plates from one or more camera feeds. A React admin panel lets the operator confirm entries, track active sessions, take payments, manage subscribers and open barriers. Registered subscribers can be opened automatically.

**Built with:** Python 3.11+, FastAPI, SQLAlchemy (SQLite or PostgreSQL), Ultralytics YOLO, RapidOCR, OpenCV, React 18 + Vite + TypeScript + Tailwind, PyInstaller (Windows packaging).

> The UI is Turkish-only. Training uses the public CC BY 4.0 [Turkish Number Plates](https://universe.roboflow.com/plakatanima-vnt3k/turkish-number-plates) dataset (not included in this repo — see [Training data](#training-data)).

---

## Architecture

```
 Cameras (USB / RTSP / IP)
        │
        ▼
┌──────────────────┐  POST /api/candidate   ┌──────────────────────┐   SQLAlchemy   ┌────────────────────┐
│  camera_loop.py  │ ─────────────────────▶ │   FastAPI backend    │ ─────────────▶ │ SQLite (default)   │
│  YOLO + RapidOCR │                        │   api/main.py :8000  │                │ or PostgreSQL 16   │
└──────────────────┘                        └───────┬──────▲───────┘                └────────────────────┘
                                                    │      │ REST + MJPEG stream
                                     barrier driver │      │
                          (dummy / USB relay / IP)  ▼      │
                                         ┌──────────────┐  │  ┌─────────────────────┐
                                         │   Barrier    │  └──│ React admin panel   │
                                         └──────────────┘     │ Vite :5173 (dev)    │
                                                              └─────────────────────┘
```

**Key constraint:** For non-subscribers the barrier is opened by the worker. Nothing is written to the database until a human confirms the action. Active subscribers are opened automatically.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.11+ | [python.org](https://python.org) |
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| Docker Desktop | Latest — *only* if you want PostgreSQL | [docker.com](https://www.docker.com/get-started/) |
| Git | Any | [git-scm.com](https://git-scm.com) |

---

## Project Structure

```
├── api/                      # FastAPI backend
│   ├── main.py               # App entry point, lifespan, middleware
│   ├── database.py           # SQLAlchemy engine (SQLite / PostgreSQL via DATABASE_TYPE)
│   ├── models.py, schemas.py # ORM models and Pydantic schemas
│   ├── frame_hub.py          # Shared camera frames for MJPEG streaming
│   ├── barrier/              # Barrier drivers: dummy, USB relay, IP
│   └── routes/               # gates, cameras, candidate, recognize, sessions,
│                             #   pricing, subscriptions, stats, barrier, translations
├── frontend/                 # React admin panel (Vite, TypeScript)
├── barrier_simulator/        # Local multi-barrier hardware simulator (port 8181)
├── camera_loop.py            # Headless camera worker: detect → OCR → push candidates
├── alpr_engine.py            # YOLO + RapidOCR engine
├── utils/plate_utils.py      # Plate cleaning + Turkish format validation
├── main.py                   # Standalone ALPR script (image / video / camera)
├── train.py                  # YOLO training script
├── models/                   # YOLO weights (dataset is downloaded separately, git-ignored)
├── tests/                    # unittest suite (run_all_tests.sh)
├── build/, build_windows.py  # PyInstaller specs and Windows packaging
├── translations/             # Turkish UI strings served by the API
├── docker-compose.yml        # Optional PostgreSQL container
└── docs/                     # Specs, roadmap, OCR migration notes, Turkish user manual
```

---

## Quick Start

### 1 — Set up Python environment

```bash
git clone https://github.com/<your-user>/<this-repo>.git
cd <this-repo>

python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2 — Configure environment

Copy the provided template to a local, git-ignored `.env` file in the project root (see `config/` for the Windows template) and edit as needed. Main settings:

```dotenv
DATABASE_TYPE=sqlite            # sqlite (default, zero setup) | postgresql
# DATABASE_URL=postgresql://user:pass@localhost:5432/alpr_parking   # when using PostgreSQL
MODEL_PATH=models/best.pt       # YOLO weights
BARRIER_TYPE=dummy              # dummy | relay | ip
DETECTION_CONFIDENCE=0.4
OCR_CONFIDENCE=0.3
PROCESS_INTERVAL_SEC=2.0        # camera worker inference interval
```

Never commit your `.env`; it is listed in `.gitignore`.

### 3 — (Optional) PostgreSQL instead of SQLite

```bash
docker compose up -d            # then set DATABASE_TYPE=postgresql and DATABASE_URL
docker compose down             # stop, data kept     |   docker compose down -v  # wipe
```

Tables and default pricing rules are created automatically on first API start.

### 4 — Start the backend

```bash
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

### 5 — Start the frontend

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173 (proxies /api to :8000)
# or: npm run build             # output served by FastAPI at http://localhost:8000
```

### 6 — Start the camera worker (optional)

Register a gate (camera + barrier) in the admin panel, then:

```bash
./run_camera_loop.sh            # reads gates from the API, pushes plate candidates
./run_barrier_simulator.sh      # optional: fake barrier hardware on :8181
```

### 7 — Run tests

```bash
./run_all_tests.sh
```

**Interactive API docs:** [http://localhost:8000/docs](http://localhost:8000/docs) · **ReDoc:** [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

## API Endpoints

All paths are prefixed with `/api`. Full, authoritative list at `/docs`.

| Area | Endpoints |
|------|-----------|
| **Recognition** | `POST /recognize` — upload an image, get detected plate(s) |
| **Candidate** | `POST /candidate` — camera worker pushes a plate; `GET /candidate` — poll latest per gate; `DELETE /candidate` — clear |
| **Gates** | `GET/POST /gates`, `GET/PUT/DELETE /gates/{id}`, `GET /gates/{id}/camera-stream` (MJPEG), `GET /gates/camera-preview`, `GET /gates/{id}/barrier-health`, `POST /gates/{id}/test-barrier` |
| **Cameras** | `POST /cameras/discover` — probe USB cameras, return thumbnails |
| **Barrier** | `GET /barrier/health`, `POST /barrier/test-open` |
| **Sessions** | `POST /sessions` (confirm entry), `GET /sessions`, `GET /sessions/{id}`, `GET /sessions/plate/{plate}` (live fee), `POST /sessions/{id}/exit` (confirm payment), `DELETE /sessions/{id}` (soft delete) |
| **Pricing** | `GET/POST /pricing`, `PUT/DELETE /pricing/{id}` |
| **Subscriptions** | `GET/POST /subscriptions`, `GET/PUT/DELETE /subscriptions/{id}`, `GET /subscriptions/check/{plate}` |
| **Stats** | `GET /stats/today` — dashboard numbers |
| **Translations** | `GET /translations`, `GET /translations/{lang}[/{namespace}]` |
| **Utilities** | `GET /health` (no prefix), `GET /uploads/{filename}` |

---

## Default Pricing Rules

Seeded automatically on first startup:

| From | To | Price | Label |
|------|----|-------|-------|
| 0 min | 30 min | ₺0.00 | First 30 min (free) |
| 30 min | 60 min | ₺20.00 | 30–60 min |
| 60 min | 120 min | ₺35.00 | 1–2 hours |
| 120 min | — | ₺50.00 | Over 2 hours |

Edit via the Pricing page in the admin panel or directly via `PUT /api/pricing/{id}`.

---

## Admin Workflow

### Gate view (`/gate`)

1. Open **Gate View** and select a gate. The live camera stream is shown.
2. When the camera worker reads a plate, the candidate appears pre-filled and editable.
   - **Active subscriber:** the barrier opens automatically.
   - **Everyone else:** the worker corrects the plate if needed (or types it manually) and confirms the entry.
3. The session is saved as `ACTIVE` and the barrier opens.

### Processing an exit

1. Open **Aktif Araçlar** (`/active`) or the exit gate view.
2. Find the vehicle — duration and live fee are shown.
3. Press **Çıkış** — the calculated fee is pre-filled; change it if the driver paid differently, optionally add notes/photo.
4. Confirm — the session is marked `PAID` and the barrier opens.

Other pages: Dashboard (`/`), All sessions, Pricing, Gates (camera + barrier setup), Subscriptions.

---

## ALPR Engine

### Running standalone (image / video / camera)

```bash
source .venv/bin/activate
python main.py
```

Edit the bottom of `main.py` to point at your source:

```python
process_alpr("samples/8m.jpg")          # single image
process_alpr("samples/videos/test.mov") # video file
process_alpr(0)                          # live USB camera
process_alpr("rtsp://...")               # IP camera
```

### Confidence thresholds

Adjust in `.env`:

```dotenv
DETECTION_CONFIDENCE=0.4   # YOLO box score — lower = more detections, more false positives
OCR_CONFIDENCE=0.3         # OCR character score — lower = more text attempts
```

---

## Database

### Connecting directly (optional)

```bash
docker exec -it alpr_postgres psql -U alpr_user -d alpr_parking
```

Useful queries:

```sql
-- All active sessions
SELECT id, plate_number, entrance_time, status FROM parking_sessions WHERE status = 'ACTIVE';

-- Today's revenue
SELECT SUM(amount_paid) FROM parking_sessions
WHERE status = 'PAID' AND exit_time::date = CURRENT_DATE;

-- OCR accuracy check (compare raw vs confirmed)
SELECT plate_number, raw_ocr_text,
       plate_number = raw_ocr_text AS exact_match
FROM parking_sessions
WHERE raw_ocr_text IS NOT NULL;
```

### Schema

**`parking_sessions`**

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer PK | |
| `plate_number` | varchar(20) | Confirmed plate, indexed |
| `raw_ocr_text` | varchar(50) | Original OCR output for accuracy tracking |
| `entrance_time` | timestamptz | Set on entry confirmation |
| `exit_time` | timestamptz | Set on exit confirmation |
| `duration_minutes` | integer | Calculated at exit |
| `amount_due` | numeric(10,2) | Calculated from pricing rules |
| `amount_paid` | numeric(10,2) | Actually collected — may differ |
| `status` | varchar(10) | `ACTIVE` or `PAID` |
| `entered_manually` | boolean | True if worker typed the plate |
| `image_path` | varchar(500) | Relative path under `uploads/` |
| `exit_image_path` | varchar(500) | Relative path under `uploads/` |
| `notes` | text | Free-form notes |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**`price_rules`**

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer PK | |
| `duration_from_min` | integer | Lower bound (inclusive) |
| `duration_to_min` | integer | Upper bound (exclusive), NULL = open-ended |
| `price` | numeric(10,2) | Fee in TRY |
| `label` | varchar(100) | Human-readable description |

---

## Training data

The dataset is **not** stored in this repository. Running the app only needs the weights in `models/`; download the data only if you want to retrain with `train.py`.

1. Open the [Turkish Number Plates (v2)](https://universe.roboflow.com/plakatanima-vnt3k/turkish-number-plates) dataset on Roboflow Universe (author: *plakatanima-vnt3k*, licence **CC BY 4.0**).
2. Download it in **YOLOv11** format and unzip to `models/turkish_number_plates.v2i.yolov11/` so that `data.yaml` sits at `models/turkish_number_plates.v2i.yolov11/data.yaml`.
3. Train:

```bash
python train.py        # outputs go to runs/ (git-ignored)
```

Both the dataset folder and `runs/` are listed in `.gitignore`.

---

## Translations

The UI is Turkish-only. Strings live in `translations/tr.json` and are served via `/api/translations`. An `en.json` bundle is kept for reference.

---

## Development Tips

### Resetting the database

SQLite: stop the API and delete the local `*.db` file (git-ignored). PostgreSQL:

```bash
docker compose down -v   # removes the postgres_data volume
docker compose up -d     # fresh container — tables re-created on next API start
```

### Checking logs

```bash
# API logs (in the terminal running uvicorn)

# Postgres logs
docker compose logs db

# Follow live
docker compose logs -f db
```

### Running without the YOLO model

If you haven't trained the model yet, the API still starts and all endpoints work except `/api/recognize`, which returns:

```json
{
  "success": false,
  "error": "ALPR models not available — check MODEL_PATH and dependencies"
}
```

You can still create sessions manually using the **Manual entry** toggle in the UI.

---

## Roadmap / TODO

Detailed specs live in [`docs/roadmap/`](docs/roadmap/00-index.md).

### Done

- [x] YOLO v11 plate detector (Turkish plates)
- [x] OCR with Turkish plate validation (migrated EasyOCR → RapidOCR ONNX, see [`docs/migration-paddleocr.md`](docs/migration-paddleocr.md))
- [x] FastAPI backend with PostgreSQL + SQLite support
- [x] Docker local environment
- [x] React admin panel
- [x] Multi-gate entrance/exit flow with live MJPEG camera stream
- [x] Barrier control layer and barrier simulator
- [x] Subscription plans and camera management endpoints
- [x] USB camera discovery, IP-to-RTSP URL suggestions
- [x] Windows packaging (PyInstaller) and Turkish user manual v1

### In progress / Next

- [ ] Alembic database migrations (schema currently auto-created at startup)
- [ ] Expand automated tests (currently only `tests/test_plate_utils.py`): API routes, session/fee logic, OCR cleaning
- [ ] CI pipeline (GitHub Actions) running backend tests and frontend build
- [ ] Improve plate post-processing (character-confusion fixes, multi-frame voting) for night/blur/angle cases
- [ ] Offline licensing and code/IP hardening ([06](docs/roadmap/06-ip-protection-and-licensing.md))
- [ ] Update README structure/docs to match the current codebase (gates, cameras, subscriptions routes)
- [ ] Authentication / role-based access for the admin panel

### Future ideas

- [ ] Real hardware barrier integrations beyond the simulator (relay / IP controllers)
- [ ] Reporting: daily revenue, occupancy and OCR-accuracy dashboards
- [ ] Multi-language UI (i18n was removed in favour of Turkish-only; revisit if needed)
- [ ] Multi-site synchronisation / remote dashboard
- [ ] Mobile app (operator companion: live gate view, confirm entry/exit, active sessions, push alerts)

### Non-goals

Online payment processing.
