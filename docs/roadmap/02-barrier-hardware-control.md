# Roadmap Item 2 — Hardware Barrier / Gate Control

**Priority:** P1 — Required before subscriptions can work end-to-end  
**Estimated effort:** 2 engineering days  
**Depends on:** Item 1 (Database Flexibility)  
**Blocks:** Item 3 (Subscription Plans — auto-open feature)

---

## Problem Statement

The current system requires a worker to physically press a button on the barrier at all
times. For subscribers, the requirement is **full automation**: the system must send a
hardware signal to the barrier motor controller so the gate opens without any worker
action. A UI indicator alone is not sufficient — the barrier must physically open.

This is a hardware integration problem. A software abstraction layer must sit between
the business logic ("open the gate") and the specific hardware device being used at
each site.

---

## Goal

1. Design a `BarrierController` abstraction that decouples business logic from hardware.
2. Implement at least two concrete drivers: **USB relay** (most common) and **IP/HTTP**
   (for network-addressable barriers).
3. Expose a `DummyBarrierController` for development and CI environments where no
   physical hardware is connected.
4. Make the controller type and all connection parameters configurable via `.env`.
5. When a subscriber is auto-confirmed, call `barrier.open()` in the same code path.
6. Show a clear green-screen indicator in the Gate UI alongside the hardware trigger.

---

## Hardware Context

### What "opening the barrier" means electrically

Most parking barriers (boom gates) expose one of:

| Interface | How it works | Common hardware |
|-----------|-------------|-----------------|
| **Dry contact relay** (most common) | Momentary short-circuit on two terminals triggers the motor | USB-to-relay module (CH340, HID) |
| **RS-232 / RS-485 serial** | Send a vendor-specific ASCII/hex command over serial | Parking barrier controller with serial port |
| **IP / HTTP** | HTTP GET or TCP socket to a barrier controller's built-in web server | Newer networked barriers |

We will support all three. The client chooses one via `.env`. 90% of sites will use
the USB relay (cheapest, ~€5, works on Windows out of the box).

### Recommended hardware for new installs

**USB-to-Relay module (recommended)**
- 4-channel or 8-channel HID/CH340 relay board (~€5–15 on Amazon/AliExpress)
- Connect relay NO (normally open) + COM terminals to barrier's "open" trigger input
- Windows recognises it as a COM port (CH340 driver) or USB HID device
- Library: `pyserial` for CH340 (serial) or `hid` for HID relay boards

---

## Software Design

### Directory structure

```
api/
└── barrier/
    ├── __init__.py          # exports BarrierController, get_barrier_controller()
    ├── base.py              # Abstract base class
    ├── dummy.py             # No-op controller (dev / testing)
    ├── relay.py             # USB relay via pyserial or hid
    └── ip_barrier.py        # HTTP/TCP IP barrier
```

### Abstract base class (`api/barrier/base.py`)

```python
from abc import ABC, abstractmethod

class BarrierController(ABC):
    """
    Hardware abstraction for a parking barrier gate.
    All concrete drivers must implement this interface.
    """

    @abstractmethod
    def open(self, duration_sec: float | None = None) -> None:
        """
        Trigger the barrier to open.
        duration_sec: how long to hold the relay closed (None = use default from config).
        """
        ...

    @abstractmethod
    def is_connected(self) -> bool:
        """Return True if the hardware is reachable / the port is open."""
        ...

    def health_check(self) -> dict:
        return {"connected": self.is_connected(), "driver": self.__class__.__name__}
```

### Dummy controller (`api/barrier/dummy.py`)

```python
import logging
from .base import BarrierController

logger = logging.getLogger(__name__)

class DummyBarrierController(BarrierController):
    def open(self, duration_sec=None):
        logger.info("[DUMMY BARRIER] Gate open signal sent (no hardware)")

    def is_connected(self):
        return True
```

### USB Relay controller (`api/barrier/relay.py`)

```python
import os, time, logging
import serial
from .base import BarrierController

logger = logging.getLogger(__name__)

# CH340-based USB relay serial protocol (common for SainSmart / generic boards)
_RELAY_ON_CMD  = bytes([0xA0, 0x01, 0x01, 0xA2])
_RELAY_OFF_CMD = bytes([0xA0, 0x01, 0x00, 0xA1])

class RelayBarrierController(BarrierController):
    def __init__(self, port: str, channel: int = 1, open_duration_sec: float = 1.5):
        self._port = port
        self._channel = channel
        self._duration = open_duration_sec
        self._ser: serial.Serial | None = None
        self._connect()

    def _connect(self):
        try:
            self._ser = serial.Serial(self._port, baudrate=9600, timeout=1)
            logger.info(f"Relay controller connected on {self._port}")
        except serial.SerialException as exc:
            logger.error(f"Relay controller could not open {self._port}: {exc}")
            self._ser = None

    def open(self, duration_sec=None):
        dur = duration_sec or self._duration
        if not self._ser or not self._ser.is_open:
            logger.warning("Relay not connected — gate open skipped")
            return
        try:
            self._ser.write(_RELAY_ON_CMD)
            time.sleep(dur)
            self._ser.write(_RELAY_OFF_CMD)
            logger.info(f"Barrier opened for {dur}s on {self._port}")
        except Exception as exc:
            logger.error(f"Relay write error: {exc}")

    def is_connected(self):
        return self._ser is not None and self._ser.is_open
```

### IP barrier controller (`api/barrier/ip_barrier.py`)

```python
import logging, requests
from .base import BarrierController

logger = logging.getLogger(__name__)

class IPBarrierController(BarrierController):
    def __init__(self, url: str, timeout_sec: float = 3.0):
        self._url = url          # e.g. http://192.168.1.100/open
        self._timeout = timeout_sec

    def open(self, duration_sec=None):
        try:
            resp = requests.get(self._url, timeout=self._timeout)
            resp.raise_for_status()
            logger.info(f"IP barrier open command sent to {self._url}: {resp.status_code}")
        except Exception as exc:
            logger.error(f"IP barrier open failed: {exc}")

    def is_connected(self):
        try:
            requests.get(self._url, timeout=2)
            return True
        except Exception:
            return False
```

### Factory function (`api/barrier/__init__.py`)

```python
import os
from .base import BarrierController
from .dummy import DummyBarrierController
from .relay import RelayBarrierController
from .ip_barrier import IPBarrierController

_instance: BarrierController | None = None

def get_barrier_controller() -> BarrierController:
    global _instance
    if _instance is None:
        _instance = _create()
    return _instance

def _create() -> BarrierController:
    driver = os.getenv("BARRIER_TYPE", "dummy").lower()

    if driver == "relay":
        return RelayBarrierController(
            port=os.getenv("BARRIER_PORT", "COM3"),
            channel=int(os.getenv("BARRIER_RELAY_CHANNEL", "1")),
            open_duration_sec=float(os.getenv("BARRIER_OPEN_DURATION_SEC", "1.5")),
        )

    if driver == "ip":
        return IPBarrierController(
            url=os.getenv("BARRIER_IP_URL", "http://192.168.1.100/open"),
            timeout_sec=float(os.getenv("BARRIER_TIMEOUT_SEC", "3")),
        )

    return DummyBarrierController()
```

---

## Environment Variables (additions to `.env`)

```dotenv
# ─── Barrier / Gate Control ────────────────────────────────────────────────
# "dummy"  → no hardware, log only (use for dev and testing)
# "relay"  → USB relay board via serial (CH340 driver, most sites)
# "ip"     → HTTP GET to a network-addressable barrier controller
BARRIER_TYPE=dummy

# For BARRIER_TYPE=relay:
BARRIER_PORT=COM3                  # Windows serial port (use Device Manager to find it)
BARRIER_RELAY_CHANNEL=1            # Which relay channel (1-based)
BARRIER_OPEN_DURATION_SEC=1.5      # Seconds to hold relay closed

# For BARRIER_TYPE=ip:
BARRIER_IP_URL=http://192.168.1.100/open
BARRIER_TIMEOUT_SEC=3
```

---

## API Endpoint: Barrier Health

Add a new endpoint so the Gate UI can show barrier connection status in the header:

```
GET /api/barrier/health
Response: { "connected": true, "driver": "RelayBarrierController" }
```

---

## Gate UI Changes

When a subscriber is auto-detected, the entire Gate UI screen changes state:

```
┌──────────────────────────────────────────────┐
│  ██████████████████████████████████████████  │ ← full green background
│                                              │
│         ✓  SUBSCRIBER DETECTED              │
│                                              │
│         Plate:  34 ABC 1234                  │
│         Plan:   MONTHLY (valid until         │
│                 31 May 2026)                 │
│                                              │
│         BARRIER OPENING...                   │
│                                              │
│         [  OK — Log and Reset  ]             │  ← manual override button
└──────────────────────────────────────────────┘
```

Key design decisions:
- **The barrier opens automatically.** The worker does not need to press anything.
- An audible beep (via the browser's Web Audio API) confirms the event.
- The "OK — Log and Reset" button is a manual override that the worker can press to
  acknowledge and reset the screen; otherwise the screen auto-resets after 8 seconds.
- If the barrier hardware signal fails (e.g., relay not connected), the screen shows
  a yellow warning: "SUBSCRIBER — BARRIER SIGNAL FAILED — OPEN MANUALLY".

---

## Audit Logging

Every barrier open event — whether triggered automatically (subscriber) or manually
confirmed (worker) — must be recorded. Add a `barrier_events` table:

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `plate_number` | TEXT | |
| `session_id` | INTEGER FK | nullable (auto-open may not yet have a session) |
| `trigger_type` | TEXT | `AUTO_SUBSCRIBER` / `MANUAL_WORKER` |
| `barrier_type` | TEXT | `relay` / `ip` / `dummy` |
| `success` | BOOLEAN | Did the hardware call succeed? |
| `triggered_at` | DATETIME | |
| `notes` | TEXT | error message if success=false |

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `api/barrier/__init__.py` | Create — factory function |
| `api/barrier/base.py` | Create — abstract class |
| `api/barrier/dummy.py` | Create — no-op driver |
| `api/barrier/relay.py` | Create — USB relay driver |
| `api/barrier/ip_barrier.py` | Create — IP barrier driver |
| `api/models.py` | Add `BarrierEvent` model |
| `api/routes/barrier.py` | Create — `GET /api/barrier/health` |
| `api/main.py` | Register barrier router |
| `.env` | Add `BARRIER_*` variables |
| `requirements.txt` | Add `pyserial` |

---

## Testing Checklist

- [ ] `BARRIER_TYPE=dummy` — `GET /api/barrier/health` returns `{"connected": true}`
- [ ] `BARRIER_TYPE=relay` with wrong COM port — health returns `connected: false`,
      API does not crash
- [ ] `BARRIER_TYPE=relay` with correct hardware — relay clicks on `barrier.open()`
      and releases after `BARRIER_OPEN_DURATION_SEC`
- [ ] `BARRIER_TYPE=ip` with a mock HTTP server — GET request sent, logged correctly
- [ ] Barrier open failure (relay disconnected mid-run) — error logged,
      warning shown in UI, system continues without crashing
- [ ] `barrier_events` table populated for every open call (success and failure)

---

## Acceptance Criteria

1. `barrier.open()` can be called from any Python code without importing hardware details.
2. Switching `BARRIER_TYPE` in `.env` is the only change needed to switch hardware.
3. A failed barrier call (hardware error) **never** crashes the API or the camera loop.
4. Every barrier trigger — success or failure — is recorded in `barrier_events`.
5. The Gate UI shows a distinct green full-screen state for subscribers with hardware
   status clearly visible.

---

## Client Installation Guide (to be written separately)

When delivering to a client using USB relay:
1. Plug the USB relay board into the Windows PC
2. Open Device Manager → find the COM port (usually `COM3` or `COM4`)
3. Set `BARRIER_PORT=COM3` (or whichever port) in `.env`
4. Set `BARRIER_TYPE=relay`
5. Connect relay channel 1 (NO + COM) to the barrier's open-trigger terminals
6. Test with `GET /api/barrier/health` and manually trigger via the admin panel
