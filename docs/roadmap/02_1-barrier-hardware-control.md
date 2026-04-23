# Roadmap supplement — 02.1 Barrier, gates, camera loop & operations

> **Companion to:** [02-barrier-hardware-control.md](02-barrier-hardware-control.md)  
> **Last updated:** 2026-04-23  
> **Audience:** Field setup, support, and engineering

This document captures **what was added after the original item-2 spec**, what is **still intentionally missing**, and **how to debug** when the Bariyer Ekranı does not update or the terminal stays quiet.

---

## What was implemented beyond the original `02` document

| Area | What exists now |
|------|-----------------|
| **Per-gate hardware** | `parking_gates` table: each row = **one camera source + one barrier driver** (Kapı ayarları UI). |
| **Barrier drivers** | `api/barrier/` — `dummy`, `relay` (USB serial), `ip` (HTTP GET). Per-gate instances + cache; invalidate on gate edit/delete. |
| **Audit** | `barrier_events` includes optional `gate_id` FK. |
| **API** | `GET/POST/DELETE /api/gates`, `POST /api/gates/{id}/test-barrier`, `GET /api/gates/{id}/barrier-health`, legacy `GET/POST /api/barrier/*`. |
| **Candidates** | `POST/GET/DELETE /api/candidate` require **`gate_id`** — one buffer per gate (entrance vs exit do not overwrite each other). |
| **`camera_loop.py`** | Fetches **`GET /api/gates`**, starts **one thread per active gate**, pushes candidates with that row’s `id` as `gate_id`. **No `CAMERA_SOURCE` for the loop** (camera comes from DB). Hot reload when gate list / `camera_source` changes (`GATES_POLL_SEC`). |
| **Console logging** | Throttled **INFO** lines: OCR failure, no plate, or **plate / raw OCR / confidence / valid / why not pushed to API**. HTTP errors on POST include **status + body**. Startup logs each gate id + **exact Bariyer Ekranı URL** with `?gate_id=`. |
| **Frontend** | **Kapı ayarları** (`/gates`), **Bariyer Ekranı** (`/gate?gate_id=…`), single-gate auto-redirect. |

---

## Still missing from the *original* item-2 narrative (not bugs — backlog)

These remain **product / UI work** described in `02` but not built yet:

1. **Subscriber full-screen** (green, audio, auto-reset) on **Bariyer Ekranı** — depends on **item 3 (subscriptions)**.
2. **Calling `trigger_barrier_open` from the Gate UI** when the worker confirms entry/exit (today the UI saves the session but does not pulse the per-gate barrier automatically).
3. **RS-232 / RS-485** third driver class (only relay + IP + dummy today).
4. **Installer / client PDF** “plug relay here” — still separate deliverable.

Track these in item 3 + a small “gate confirm → barrier” task when you prioritise.

---

## Pre-client demo readiness (must-fix vs can-demo)

Use this as the final gate before showing the app to the client.

### Must-fix before client demo

1. **Worker confirm must open barrier:** when operator confirms entry/exit on Gate UI, backend must call per-gate `trigger_barrier_open` and show success/failure feedback.
2. **One canonical health check path in UI/support docs:** use per-gate health (`GET /api/gates/{id}/barrier-health`) as the primary operational check.
3. **End-to-end lane validation:** for every active gate, verify camera -> candidate -> Gate screen -> barrier pulse on that same `gate_id`.
4. **Threshold documented and pinned:** set one agreed `BAR_CONFIDENCE_THRESHOLD` in `.env` for demo day and record it in runbook notes.

### Can demo with workaround (acceptable short-term)

1. **Subscriber green full-screen / beep / auto-reset** can remain deferred to item 3 if explicitly presented as "subscription-phase UX".
2. **RS-232 / RS-485 driver** can stay backlog if client hardware is relay or IP.
3. **Installer PDF** can be replaced by a short internal setup checklist during demo, then delivered formally after sign-off.

---

## Canonical operational flow (source of truth)

To avoid confusion between legacy and current routes, support and field setup should follow this flow:

1. Configure lanes in **Kapı ayarları** (`/gates`) with `camera_source` + barrier settings per row.
2. Run `camera_loop.py`; it fetches `GET /api/gates` and starts one worker per active gate.
3. Workers send plate candidates via `POST /api/candidate` with that row's `gate_id`.
4. Gate screen uses `GET /api/candidate?gate_id=<id>` and shows only that lane.
5. Barrier connectivity check is **per gate**: `GET /api/gates/{id}/barrier-health`.

Legacy `/api/barrier/*` endpoints remain compatibility paths and should not be the primary operational playbook for multi-gate sites.

---

## Why the UI might not update when you “see” a plate in the camera

Work through this list **in order**:

### 1. Wrong or missing `gate_id` in the browser

The API stores candidates **per gate**. The browser must poll:

`GET /api/candidate?gate_id=<same integer as parking_gates.id>`

- Open **Kapı ayarları** and note **which gate** uses camera `0` (the row’s **id** column).
- Open **Bariyer ekranı** for that lane: use the **“Bariyer ekranı”** button on the card, or manually  
  `http://<API_HOST>:8000/gate?gate_id=<id>`  
  (dev with Vite: `http://localhost:5173/gate?gate_id=<id>`).

If you open `/gate` with **two** active gates and no query string, you only get the picker — until you pick the matching gate, you will not see the other lane’s candidates.

### 2. `camera_loop.py` not running or `API_BASE_URL` wrong

The loop must run **on the same machine that can reach the API** and use the same base URL:

```dotenv
API_BASE_URL=http://localhost:8000
```

If the API is on another host, set `API_BASE_URL` accordingly. A failed POST is now logged at **ERROR** with HTTP body (e.g. **422** if `gate_id` does not exist).

### 3. Confidence or Turkish validation blocks the push

A reading is **logged** every `DETECTION_LOG_INTERVAL_SEC` even when **not** sent to the UI. Look for:

- `→ NOT sent: confidence below threshold`
- `→ NOT sent: invalid Turkish plate format`
- `→ NOT sent: same plate cooldown`

Lower threshold in `.env`:

```dotenv
BAR_CONFIDENCE_THRESHOLD=0.65
```

### 4. IRiun / virtual webcam index

IRiun Webcam usually appears as a **normal** DirectShow / USB camera. Index `0` is correct **only if** it is the first device OpenCV enumerates. If unsure, on Windows run:

```bash
python -c "import cv2; [print(i, cv2.VideoCapture(i, cv2.CAP_DSHOW).isOpened()) for i in range(5)]"
```

Put the working index into **Kapı ayarları → Kamera kaynağı** for that gate, save, wait for `camera_loop` hot reload (or restart `camera_loop.py`).

### 5. `FRAME_SKIP` too aggressive

If the car is only in frame briefly, increase processing rate:

```dotenv
FRAME_SKIP=2
```

---

## Environment variables (camera / visibility)

| Variable | Default | Role |
|----------|---------|------|
| `DETECTION_LOG_INTERVAL_SEC` | `1.0` | Minimum seconds between **INFO** scan lines (plate / OCR / push reason). |
| `STATUS_EVERY_SEC` | — | **Legacy:** used only if `DETECTION_LOG_INTERVAL_SEC` is unset. |
| `BAR_CONFIDENCE_THRESHOLD` | `0.90` in code docstring; your `.env` may differ | Minimum confidence **to call** `/api/candidate`. |
| `LOG_LEVEL` | `INFO` | Set to **`DEBUG`** for very noisy YOLO / internal logs (not usually needed). |
| `GATES_POLL_SEC` | `30` | How often `camera_loop` re-fetches `/api/gates` to pick up edits. |

---

## Quick verification checklist

1. API up: `GET http://localhost:8000/health`
2. At least one gate: `GET http://localhost:8000/api/gates` → `is_active: true`, correct `camera_source`
3. Run: `python camera_loop.py` — terminal should print **each gate’s id** and **Bariyer Ekranı** URL
4. Browser: open that **exact** `…/gate?gate_id=…` URL
5. Watch terminal: every ~1 s you should see either **no plate**, **OCR error**, or **plate=… conf=…** with a clear **NOT sent** reason or **sending to /api/candidate**

---

## Related roadmap items

- **Item 4** (`04-camera-management.md`): “Discover cameras” wizard — **not** required for IRiun if you already know the index; the Kapı row is the minimal registry.
- **Item 3**: Subscriptions + auto barrier on that flow.
