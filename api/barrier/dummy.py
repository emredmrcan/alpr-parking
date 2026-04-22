from __future__ import annotations

import logging

from .base import BarrierController

logger = logging.getLogger(__name__)


class DummyBarrierController(BarrierController):
    """No-op driver for development and CI."""

    def open(self, duration_sec: float | None = None) -> bool:
        logger.info("[DUMMY BARRIER] Gate open signal (no hardware)")
        return True

    def is_connected(self) -> bool:
        return True

    def close(self) -> None:
        return
