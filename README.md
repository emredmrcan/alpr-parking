# ALPR Parking Management System

Automated licence-plate recognition system for Turkish parking operations.  
A YOLO v11 + RapidOCR engine reads plates from camera images; an admin panel lets an operator confirm entry, track sessions, and process payments.

---

## Architecture

```
┌─────────────────────┐     POST /api/recognize      ┌──────────────────────┐
│   Admin Panel (FE)  │ ──────────────────────────▶  │   FastAPI Backend    │
│   React + Vite      │ ◀────────────────────────── │   api/main.py        │
│   localhost:5173    │     JSON responses            │   localhost:8000     │
└─────────────────────┘                              └──────────┬───────────┘
                                                                │ SQLAlchemy
                                                                ▼
                                                     ┌──────────────────────┐
                                                     │   PostgreSQL 16      │
                                                     │   Docker container   │
                                                     │   localhost:5432     │
                                                     └──────────────────────┘
```

**Key constraint:** The barrier is always opened manually by the worker.  
Nothing is written to the database until a human confirms the action.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.11+ (3.14 recommended) | [python.org](https://python.org) |
| Docker Desktop | Latest | [docker.com/get-started](https://www.docker.com/get-started/) |
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| Git | Any | [git-scm.com](https://git-scm.com) |

---

## Project Structure

```
PythonProject/
├── api/                         # FastAPI backend
│   ├── main.py                  # App entry point, lifespan, middleware
│   ├── database.py              # SQLAlchemy engine + session factory
│   ├── models.py                # ORM models (parking_sessions, price_rules)
│   ├── schemas.py               # Pydantic request/response schemas
│   └── routes/
│       ├── recognize.py         # POST /api/recognize  — ALPR image upload
│       ├── sessions.py          # CRUD for parking sessions
│       ├── pricing.py           # CRUD for pricing rules
│       └── translations.py      # GET /api/translations — i18n strings
├── translations/
│   ├── tr.json                  # Turkish UI strings (default)
│   └── en.json                  # English UI strings
├── frontend/                    # React admin panel (to be created)
├── utils/
│   └── plate_utils.py           # Plate preprocessing + Turkish format validation
├── alpr_engine.py               # Headless YOLO + EasyOCR engine
├── main.py                      # Original ALPR script (image/video/camera)
├── train.py                     # YOLO training script
├── docker-compose.yml           # PostgreSQL container
├── .env                         # Local config (not committed)
├── .env.example                 # Config template
├── requirements.txt             # Python dependencies
├── uploads/                     # Uploaded images (git-ignored)
└── docs/
    ├── ALPR.md                  # Original requirements
    ├── ALPRv2.md                # MVP architecture plan
    └── Frontend.md              # Frontend specification
```

---

## Quick Start

### 1 — Clone and set up Python environment

```bash
git clone <your-repo-url>
cd PythonProject

python3.14 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2 — Configure environment

```bash
cp .env.example .env
```

Open `.env` and verify these values match your setup:

```dotenv
# Database — matches docker-compose.yml defaults, no change needed for local
DATABASE_URL=postgresql://alpr_user:alpr_pass@localhost:5432/alpr_parking

# Path to your trained YOLO weights
MODEL_PATH=runs/detect/runs/detect/turkish_plate_run/weights/best.pt

# Confidence thresholds
DETECTION_CONFIDENCE=0.4
OCR_CONFIDENCE=0.3

# Directory where uploaded images are saved
UPLOAD_DIR=uploads
```

### 3 — Start the database

Make sure Docker Desktop is running, then:

```bash
docker compose up -d
```

Verify the container is healthy:

```bash
docker compose ps
# NAME             STATUS
# alpr_postgres    Up (healthy)
```

The database tables and default pricing rules are created automatically on first API startup — no manual migration step needed.

To stop the database (data is preserved in a named volume):

```bash
docker compose down
```

To wipe all data and start fresh:

```bash
docker compose down -v
```

### 4 — Start the backend

```bash
source .venv/bin/activate          # if not already active
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

### 5 — Start the frontend (development)

```bash
cd frontend
npm install          # first time only
npm run dev          # http://localhost:5173
```

The Vite dev server proxies all `/api/*` and `/uploads/*` requests to the backend automatically.

### 5 (alternative) — Build for production and serve via FastAPI

```bash
cd frontend
npm run build        # outputs to api/static/
```

Then the admin panel is served at `http://localhost:8000` alongside the API.

On first run you will see:

```
INFO  Creating database tables...
INFO  Seeding default pricing rules...
INFO  Uvicorn running on http://0.0.0.0:8000
```

**Interactive API docs:** [http://localhost:8000/docs](http://localhost:8000/docs)  
**Alternative docs (ReDoc):** [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

## API Endpoints

### Recognition
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/recognize` | Upload a car image, get detected plate(s) back |

### Sessions
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sessions` | Confirm entry — creates a new `ACTIVE` session |
| `GET` | `/api/sessions` | List all sessions (filter by `status`, `plate`, paginate) |
| `GET` | `/api/sessions/{id}` | Get a single session by ID |
| `GET` | `/api/sessions/plate/{plate}` | Look up the active session for a plate + live fee |
| `POST` | `/api/sessions/{id}/exit` | Confirm payment — closes session, records amount paid |

### Pricing
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/pricing` | List all pricing rules |
| `POST` | `/api/pricing` | Add a pricing rule |
| `PUT` | `/api/pricing/{id}` | Update a pricing rule |
| `DELETE` | `/api/pricing/{id}` | Delete a pricing rule |

### Translations
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/translations` | List available languages (`tr`, `en`) |
| `GET` | `/api/translations/{lang}` | Full UI string bundle for a language |
| `GET` | `/api/translations/{lang}/{namespace}` | Single namespace (e.g. `common`, `nav`) |

### Utilities
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/uploads/{filename}` | Serve an uploaded image |

---

## Default Pricing Rules

Seeded automatically on first startup:

| From | To | Price | Label |
|------|----|-------|-------|
| 0 min | 30 min | ₺0.00 | İlk 30 dakika (ücretsiz) |
| 30 min | 60 min | ₺20.00 | 30–60 dakika |
| 60 min | 120 min | ₺35.00 | 1–2 saat |
| 120 min | — | ₺50.00 | 2 saatten fazla |

Edit via the Pricing page in the admin panel or directly via `PUT /api/pricing/{id}`.

---

## Admin Workflow

### Entering a vehicle

1. Open **New Session** in the admin panel.
2. Upload or drag-and-drop a photo of the vehicle/plate.
3. The ALPR engine detects the plate — the result appears pre-filled and editable.
4. Correct the plate number if OCR made a mistake, or toggle **Manual entry** to type it directly.
5. Press **GİRİŞİ ONAYLA** — the session is saved as `ACTIVE`.
6. Open the barrier manually.

### Processing an exit

1. Open **Aktif Araçlar** in the admin panel.
2. Find the vehicle row — duration and live fee are shown.
3. Press **Çıkış** — the exit modal opens.
4. The calculated fee is pre-filled. Change the amount if the driver paid differently.
5. Optionally upload an exit photo and add notes.
6. Press **ÇIKIŞI ONAYLA** — session is marked `PAID`.
7. Open the barrier manually.

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
OCR_CONFIDENCE=0.3         # EasyOCR character score — lower = more text attempts
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

## Translations

UI strings live in `translations/tr.json` (default) and `translations/en.json`.  
They are served via the API — no frontend rebuild required to update a label.

To add a new language:

1. Copy `translations/tr.json` to `translations/{lang}.json`
2. Translate all values (keep keys identical)
3. Add the language code to `SUPPORTED_LANGS` in `api/routes/translations.py`

```python
SUPPORTED_LANGS = {"tr", "en", "de"}   # example
```

---

## Development Tips

### Resetting the database

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
- [ ] Improve OCR accuracy: retrain/fine-tune on more Turkish plate data, night/blur/angle cases
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
