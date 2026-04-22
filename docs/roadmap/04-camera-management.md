# Roadmap Item 4 — In-App Camera Management

**Priority:** P3 — Key operational feature for client setup  
**Estimated effort:** 2–3 engineering days  
**Depends on:** Item 1 (Database Flexibility)  
**Blocks:** Nothing — can be built in parallel with Item 3

---

## Problem Statement

Currently the camera source is a static environment variable (`CAMERA_SOURCE=0`). This
means every camera change requires editing a config file and restarting the application —
an operation that a non-technical client cannot reasonably do.

The client must be able to:
1. Plug in a USB camera.
2. Click "Add New Camera" in the running app.
3. See a list of detected cameras with a live preview thumbnail.
4. Select the desired camera, give it a name, and assign it to a gate (ENTRANCE or EXIT).
5. The ALPR engine immediately starts reading from the new camera without a restart.

---

## Goal

1. A camera registry in the database stores all configured cameras.
2. The admin UI has a "Cameras" settings page with a button to discover and add cameras.
3. Camera discovery enumerates all connected USB cameras and displays a live thumbnail.
4. RTSP/HTTP/IP camera URLs can be added manually.
5. The ALPR engine dynamically loads its cameras from the registry — not from `.env`.
6. Multiple cameras can run simultaneously (one thread per camera, each assigned to a
   specific gate or acting independently).
7. The legacy `CAMERA_SOURCE` env variable still works as a fallback if no cameras are
   registered (backwards compatibility).

---

## Database Schema

### New table: `cameras`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `name` | TEXT(100) | Human-readable name, e.g. "Entrance Left" |
| `source` | TEXT(500) | `"0"` / `"1"` for USB index, or full RTSP/HTTP URL |
| `source_type` | TEXT(10) | `USB` / `RTSP` / `HTTP` |
| `gate_assignment` | TEXT(10) | `ENTRANCE` / `EXIT` / `BOTH` |
| `is_active` | BOOLEAN | Inactive cameras are ignored by the ALPR engine |
| `confidence_threshold` | DECIMAL | Per-camera override (null = use global .env value) |
| `notes` | TEXT | Optional |
| `last_seen_at` | DATETIME | Updated by ALPR engine each time a frame is grabbed |
| `created_at` | DATETIME | |

---

## Camera Discovery (Backend)

### Discovery endpoint

```
POST /api/cameras/discover
Response: [
  { "index": 0, "available": true,  "resolution": "1920x1080", "thumbnail_b64": "..." },
  { "index": 1, "available": true,  "resolution": "1280x720",  "thumbnail_b64": "..." },
  { "index": 2, "available": false, "resolution": null,         "thumbnail_b64": null  }
]
```

### Discovery logic (Python / OpenCV)

```python
import cv2, base64, numpy as np
from concurrent.futures import ThreadPoolExecutor, as_completed

MAX_CAMERAS_TO_PROBE = 10

def probe_camera(index: int) -> dict:
    """Try to open camera at the given index and grab one frame."""
    cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)   # CAP_DSHOW = DirectShow, Windows-only
    if not cap.isOpened():
        return {"index": index, "available": False}

    ret, frame = cap.read()
    cap.release()
    if not ret or frame is None:
        return {"index": index, "available": False}

    h, w = frame.shape[:2]
    # Encode thumbnail as base64 JPEG (small, 160px wide)
    scale = 160 / w
    thumb = cv2.resize(frame, (160, int(h * scale)))
    _, buf = cv2.imencode(".jpg", thumb, [cv2.IMWRITE_JPEG_QUALITY, 70])
    b64 = base64.b64encode(buf).decode()

    return {
        "index": index,
        "available": True,
        "resolution": f"{w}x{h}",
        "thumbnail_b64": b64,
    }

def discover_cameras() -> list[dict]:
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = {ex.submit(probe_camera, i): i for i in range(MAX_CAMERAS_TO_PROBE)}
        results = [f.result() for f in as_completed(futures)]
    return sorted(results, key=lambda r: r["index"])
```

> **Why threads?** `cv2.VideoCapture()` blocks for ~2 seconds if the index does not exist.
> Probing all 10 slots sequentially would take up to 20 seconds. Threading brings this
> down to ~2–3 seconds total.

> **`cv2.CAP_DSHOW` on Windows:** DirectShow backend avoids the MSMF (Media Foundation)
> backend which has a long cold-start delay on Windows. Always use `CAP_DSHOW` on
> Windows when enumerating cameras. On Mac/Linux, omit this argument.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/cameras/discover` | Probe system for connected cameras, return thumbnails |
| `GET` | `/api/cameras` | List registered cameras |
| `POST` | `/api/cameras` | Register a new camera |
| `GET` | `/api/cameras/{id}` | Get camera detail |
| `PUT` | `/api/cameras/{id}` | Update camera config |
| `DELETE` | `/api/cameras/{id}` | Remove camera from registry |
| `GET` | `/api/cameras/{id}/snapshot` | Grab a single live frame (for "Test" button) |
| `PUT` | `/api/cameras/{id}/active` | Toggle active/inactive |

---

## ALPR Engine Changes

### Current architecture (single camera, env var)

```python
# alpr_engine.py — current simplified
source = int(os.getenv("CAMERA_SOURCE", "0"))
cap = cv2.VideoCapture(source)
while True:
    ret, frame = cap.read()
    # ... detect, OCR, push candidate ...
```

### New architecture (multi-camera, DB registry)

```python
# alpr_engine.py — new
import threading
from api.database import SessionLocal
from api.models import Camera

def start_camera_loop(camera: Camera):
    """Run one ALPR loop for a single camera in its own thread."""
    source = int(camera.source) if camera.source.isdigit() else camera.source
    backend = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY
    cap = cv2.VideoCapture(source, backend)
    ...
    while camera.is_active:
        ret, frame = cap.read()
        if not ret:
            time.sleep(1)
            continue
        # detect, OCR, push candidate to /api/candidate?gate={camera.gate_assignment}
        # update camera.last_seen_at

def load_and_start_cameras():
    db = SessionLocal()
    cameras = db.query(Camera).filter(Camera.is_active == True).all()
    db.close()

    if not cameras:
        # Fallback: use CAMERA_SOURCE env var
        source = os.getenv("CAMERA_SOURCE", "0")
        fake_cam = Camera(source=source, gate_assignment="ENTRANCE", name="Default")
        cameras = [fake_cam]

    threads = []
    for cam in cameras:
        t = threading.Thread(target=start_camera_loop, args=(cam,), daemon=True)
        t.start()
        threads.append(t)
    return threads
```

### Hot-reload of camera registry

The ALPR engine should poll the camera registry every 30 seconds and start/stop threads
as cameras are added, removed, or toggled active/inactive — without restarting the
entire process. This allows the client to add a new camera while the system is running.

---

## Frontend — Camera Settings Page

Route: `/settings/cameras`

### Cameras list

```
Cameras                                       [ + Add Camera ]

┌───────────────┬────────┬──────────────┬────────────┬────────┬───────────────────┐
│ Name          │ Source │ Gate         │ Last Seen  │ Active │ Actions           │
├───────────────┼────────┼──────────────┼────────────┼────────┼───────────────────┤
│ Entrance Left │ USB 0  │ ENTRANCE     │ 2s ago     │ ●      │ [Snap] [Edit][Del]│
│ Exit Camera   │ USB 1  │ EXIT         │ 5s ago     │ ●      │ [Snap] [Edit][Del]│
└───────────────┴────────┴──────────────┴────────────┴────────┴───────────────────┘
```

### "Add New Camera" flow (step-by-step UI)

**Step 1 — Detect cameras**

```
Add New Camera

Scanning for connected cameras...

  ┌──────────┐   ┌──────────┐   ┌──────────┐
  │ [thumb]  │   │ [thumb]  │   │          │
  │          │   │          │   │ (no cam) │
  │ USB #0   │   │ USB #1   │   │ USB #2   │
  │ 1920×1080│   │ 1280×720 │   │          │
  └──────────┘   └──────────┘   └──────────┘
    [Select]       [Select]

Or enter an RTSP/HTTP URL manually:
[ rtsp://192.168.1.50:554/stream          ]  [Test URL]
```

**Step 2 — Configure the selected camera**

```
Configure Camera

Camera:     USB #0 (1920×1080)
            ┌────────────────────┐
            │   [live preview]   │   ← 5-second auto-refreshing snapshot
            └────────────────────┘

Name:       [ Entrance Left      ]
Gate:       (●) ENTRANCE  ( ) EXIT  ( ) BOTH
Notes:      [                    ]

            [ Back ]   [ Save Camera ]
```

**Step 3 — Confirmation**

```
✓ Camera "Entrance Left" has been added successfully.
  The ALPR engine will start using this camera within 30 seconds.

            [ Add Another Camera ]   [ Go to Dashboard ]
```

---

## Platform Considerations

### Windows-specific

| Issue | Solution |
|-------|----------|
| `CAP_DSHOW` is Windows-only | Detect `sys.platform == "win32"` and pass backend accordingly |
| Camera index numbers change after USB unplug/replug | Show a warning in the UI when `last_seen_at` is > 60 seconds old |
| Windows Defender may block OpenCV at first run | Include note in installer: allow the app through Windows Defender |
| Camera driver not installed | Instruct client to use Windows Update or manufacturer driver |

### RTSP / IP cameras

- Test the URL by attempting `cap.read()` with a 5-second timeout
- Display error if stream unreachable
- Store URL exactly as entered — no normalization

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `api/models.py` | Add `Camera` model |
| `api/schemas.py` | Add `CameraCreate`, `CameraRead`, `CameraDiscovery` schemas |
| `api/routes/cameras.py` | Create — all camera endpoints including discovery |
| `api/main.py` | Register cameras router |
| `alpr_engine.py` | Multi-camera loop with hot-reload; DB-driven camera loading |
| `frontend/src/api/cameras.ts` | Create — API client |
| `frontend/src/pages/CameraSettings.tsx` | Create — camera list page |
| `frontend/src/components/AddCameraWizard.tsx` | Create — 3-step add camera wizard |
| `frontend/src/App.tsx` | Add `/settings/cameras` route and sidebar link |

---

## Testing Checklist

- [ ] `POST /api/cameras/discover` returns at least the built-in webcam on the dev machine
- [ ] Discover endpoint completes in under 5 seconds for 10 probe slots
- [ ] Register a USB camera, verify ALPR engine thread starts within 30 seconds
- [ ] Toggle camera inactive — thread stops processing, `last_seen_at` stops updating
- [ ] Delete camera — thread stops, no orphan threads
- [ ] Add camera while ALPR engine is running — hot-reload picks it up without restart
- [ ] RTSP URL with bad address — graceful error, thread retries every 5 seconds
- [ ] Two cameras (entrance + exit) running simultaneously — both push candidates
      to their respective gate endpoints without interference
- [ ] `CAMERA_SOURCE` env var fallback works when no cameras in DB

---

## Acceptance Criteria

1. A non-technical user can add a camera in under 2 minutes with no config file editing.
2. The camera discovery scan completes in under 5 seconds on a Windows machine.
3. The live preview snapshot in the wizard updates at least every 3 seconds.
4. Adding or removing a camera takes effect without restarting the application.
5. The system supports at least 4 simultaneous camera streams on a modern laptop.
6. A failed camera (disconnected mid-run) logs an error and retries every 5 seconds
   without crashing the rest of the system.
