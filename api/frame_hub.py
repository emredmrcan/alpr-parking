"""
Shared in-process frame store.

camera_loop (a separate OS process) pushes JPEG frames here via
``PUT /api/gates/{gate_id}/frame``.  The MJPEG stream endpoint reads from
this store instead of trying to open a second VideoCapture on the same USB
device — which fails on Windows (DirectShow allows only one owner at a time).
"""
from __future__ import annotations

import threading
import time
from typing import Optional

_lock = threading.Lock()
# gate_id -> (monotonic timestamp, raw JPEG bytes)
_frames: dict[int, tuple[float, bytes]] = {}

# Frames older than this are considered stale (camera_loop died / gate disabled)
FRAME_TTL_SEC: float = 3.0


def put_frame(gate_id: int, jpeg_bytes: bytes) -> None:
    """Store the latest JPEG frame for a gate (called from the internal HTTP route)."""
    with _lock:
        _frames[gate_id] = (time.monotonic(), jpeg_bytes)


def get_frame(gate_id: int) -> Optional[bytes]:
    """Return the latest JPEG bytes for a gate, or None if stale / not yet received."""
    with _lock:
        entry = _frames.get(gate_id)
    if entry is None:
        return None
    ts, data = entry
    if time.monotonic() - ts > FRAME_TTL_SEC:
        return None
    return data


def has_fresh_frame(gate_id: int) -> bool:
    return get_frame(gate_id) is not None
