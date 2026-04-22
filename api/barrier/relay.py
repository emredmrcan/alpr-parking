from __future__ import annotations

import logging
import threading
import time
from typing import Any, Optional

from .base import BarrierController

logger = logging.getLogger(__name__)

_lock = threading.Lock()


def _relay_frame(channel: int, on: bool) -> bytes:
    """
    SainSmart-style 1-byte relay boards over CH340 serial.

    Per-channel checksum: (0xA0 + channel + state) & 0xFF
    """
    if channel < 1 or channel > 8:
        raise ValueError("Relay channel must be 1–8")
    state = 0x01 if on else 0x00
    checksum = (0xA0 + channel + state) & 0xFF
    return bytes([0xA0, channel, state, checksum])


class RelayBarrierController(BarrierController):
    """USB serial relay (common CH340 boards)."""

    def __init__(
        self,
        port: str,
        channel: int = 1,
        open_duration_sec: float = 1.5,
        baudrate: int = 9600,
    ) -> None:
        self._port = port
        self._channel = max(1, min(8, channel))
        self._duration = open_duration_sec
        self._baudrate = baudrate
        self._ser: Any = None
        self._connect()

    def _connect(self) -> None:
        try:
            import serial  # type: ignore[import-untyped]

            self._ser = serial.Serial(self._port, baudrate=self._baudrate, timeout=1)
            logger.info("Relay barrier connected on %s", self._port)
        except Exception as exc:  # noqa: BLE001 — must never crash startup
            logger.error("Relay barrier could not open %s: %s", self._port, exc)
            self._ser = None

    def open(self, duration_sec: float | None = None) -> bool:
        dur = float(duration_sec) if duration_sec is not None else float(self._duration)
        if dur <= 0:
            dur = self._duration

        with _lock:
            if self._ser is None:
                logger.warning("Relay barrier: serial port not open — open skipped")
                return False

            ser = self._ser
            try:
                if not getattr(ser, "is_open", False):
                    logger.warning("Relay barrier: serial port closed — open skipped")
                    return False

                on_cmd = _relay_frame(self._channel, True)
                off_cmd = _relay_frame(self._channel, False)
                ser.write(on_cmd)
                time.sleep(dur)
                ser.write(off_cmd)
                logger.info(
                    "Relay barrier pulse %.2fs on %s ch=%d",
                    dur,
                    self._port,
                    self._channel,
                )
                return True
            except Exception as exc:  # noqa: BLE001
                logger.error("Relay barrier write error: %s", exc)
                return False

    def is_connected(self) -> bool:
        ser = self._ser
        if ser is None:
            return False
        return bool(getattr(ser, "is_open", False))

    def close(self) -> None:
        ser = self._ser
        self._ser = None
        if ser is None:
            return
        try:
            if getattr(ser, "is_open", False):
                ser.close()
        except Exception:  # noqa: BLE001
            pass
