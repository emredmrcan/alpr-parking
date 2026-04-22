from __future__ import annotations

import logging
import os
import threading
from typing import TYPE_CHECKING

from .base import BarrierController
from .dummy import DummyBarrierController
from .ip_barrier import IPBarrierController
from .relay import RelayBarrierController

if TYPE_CHECKING:
    from api.models import ParkingGate

logger = logging.getLogger(__name__)

_instance: BarrierController | None = None

_gate_controllers: dict[int, BarrierController] = {}
_gate_lock = threading.Lock()


def get_barrier_controller() -> BarrierController:
    """Legacy default driver from process-wide ``BARRIER_*`` environment variables."""
    global _instance
    if _instance is None:
        _instance = _create_from_env()
    return _instance


def reset_barrier_controller_for_tests() -> None:
    global _instance
    if _instance is not None:
        try:
            _instance.close()
        except Exception:  # noqa: BLE001
            pass
    _instance = None


def invalidate_gate_controller(gate_id: int) -> None:
    """Close and drop a cached per-gate driver (call after DB update/delete)."""
    with _gate_lock:
        ctrl = _gate_controllers.pop(gate_id, None)
    if ctrl is not None:
        try:
            ctrl.close()
        except Exception:  # noqa: BLE001
            pass


def invalidate_all_gate_controllers() -> None:
    with _gate_lock:
        ids = list(_gate_controllers.keys())
    for gid in ids:
        invalidate_gate_controller(gid)


def build_controller_from_gate(gate: "ParkingGate") -> BarrierController:
    """Construct a fresh driver instance from a ``ParkingGate`` row (not cached)."""
    driver = (gate.barrier_driver or "dummy").lower()

    if driver == "relay":
        port = (gate.barrier_port or "").strip() or os.getenv("BARRIER_PORT", "COM3")
        channel = int(gate.barrier_relay_channel or 1)
        duration = float(gate.barrier_open_duration_sec or 1.5)
        return RelayBarrierController(port=port, channel=channel, open_duration_sec=duration)

    if driver == "ip":
        url = (gate.barrier_ip_url or "").strip() or os.getenv(
            "BARRIER_IP_URL", "http://192.168.1.100/open"
        )
        timeout = float(gate.barrier_timeout_sec or 3.0)
        return IPBarrierController(url=url, timeout_sec=timeout)

    if driver == "dummy":
        return DummyBarrierController()

    logger.warning("Unknown barrier_driver=%r on gate id=%s — using dummy", driver, gate.id)
    return DummyBarrierController()


def get_controller_for_gate(gate: "ParkingGate") -> BarrierController:
    """
    Return a cached driver for a persisted gate (id not None).

    Unsaved ORM objects (id is None) always get a fresh instance.
    """
    if gate.id is None:
        return build_controller_from_gate(gate)

    with _gate_lock:
        existing = _gate_controllers.get(int(gate.id))
        if existing is not None:
            return existing
        ctrl = build_controller_from_gate(gate)
        _gate_controllers[int(gate.id)] = ctrl
        return ctrl


def _create_from_env() -> BarrierController:
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

    if driver == "dummy":
        return DummyBarrierController()

    logger.warning("Unknown BARRIER_TYPE=%r — using dummy driver", driver)
    return DummyBarrierController()
