from __future__ import annotations

from abc import ABC, abstractmethod


class BarrierController(ABC):
    """Hardware abstraction for a parking barrier / boom gate."""

    @abstractmethod
    def open(self, duration_sec: float | None = None) -> bool:
        """
        Trigger the barrier to open.

        Returns True if the hardware sequence completed without error.
        Implementations must swallow exceptions and return False instead of raising.
        """
        ...

    @abstractmethod
    def is_connected(self) -> bool:
        """True if the driver considers the hardware reachable / ready."""

    def health_check(self) -> dict:
        return {
            "connected": self.is_connected(),
            "driver": self.__class__.__name__,
        }

    def close(self) -> None:
        """Release hardware handles (serial ports, etc.). Override in drivers that need it."""
