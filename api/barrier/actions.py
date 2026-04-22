from __future__ import annotations

import os
from typing import Optional

from sqlalchemy.orm import Session

from api.models import BarrierEvent, ParkingGate

from .factory import get_barrier_controller, get_controller_for_gate


def trigger_barrier_open(
    db: Session,
    *,
    plate_number: Optional[str] = None,
    session_id: Optional[int] = None,
    gate: Optional[ParkingGate] = None,
    trigger_type: str,
    duration_sec: Optional[float] = None,
) -> tuple[bool, BarrierEvent]:
    """
    Execute a hardware open pulse and persist an audit row.

    ``gate`` selects the per-gate driver from the database. When omitted, the
    legacy process-wide ``BARRIER_*`` environment defaults are used.

    Never raises — failures are recorded with success=False.
    """
    notes: Optional[str] = None
    ok = False

    if gate is not None:
        barrier_type = (gate.barrier_driver or "dummy").lower()
        ctrl = get_controller_for_gate(gate)
        eff_duration = (
            duration_sec
            if duration_sec is not None
            else float(gate.barrier_open_duration_sec or 1.5)
        )
        try:
            ok = bool(ctrl.open(eff_duration))
        except Exception as exc:  # noqa: BLE001
            ok = False
            notes = str(exc)
    else:
        barrier_type = os.getenv("BARRIER_TYPE", "dummy").lower()
        ctrl = get_barrier_controller()
        try:
            ok = bool(ctrl.open(duration_sec))
        except Exception as exc:  # noqa: BLE001
            ok = False
            notes = str(exc)

    if not ok and notes is None:
        notes = "open() returned False"

    event = BarrierEvent(
        plate_number=plate_number.upper().strip() if plate_number else None,
        session_id=session_id,
        gate_id=int(gate.id) if gate is not None and gate.id is not None else None,
        trigger_type=trigger_type,
        barrier_type=barrier_type,
        success=ok,
        notes=notes,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return ok, event
