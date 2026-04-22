from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.barrier import trigger_barrier_open
from api.barrier.factory import get_controller_for_gate, invalidate_gate_controller
from api.database import get_db
from api.models import ParkingGate
from api.schemas import GateBarrierHealthOut, GateCreate, GateOut, GateUpdate

router = APIRouter(prefix="/gates", tags=["gates"])


def _validate_barrier_combo(driver: str, port: Optional[str], url: Optional[str]) -> None:
    d = driver.lower()
    if d not in {"dummy", "relay", "ip"}:
        raise HTTPException(status_code=400, detail="Geçersiz bariyer tipi.")
    if d == "relay" and not (port or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Relay seçildiğinde COM port zorunludur (ör. COM3).",
        )
    if d == "ip" and not (url or "").strip():
        raise HTTPException(
            status_code=400,
            detail="IP bariyer seçildiğinde URL zorunludur.",
        )


@router.get("", response_model=list[GateOut], summary="List camera + barrier gate pairs")
def list_gates(db: Session = Depends(get_db)) -> list[GateOut]:
    rows = (
        db.query(ParkingGate)
        .order_by(ParkingGate.sort_order.asc(), ParkingGate.id.asc())
        .all()
    )
    return [GateOut.model_validate(r) for r in rows]


@router.post("", response_model=GateOut, status_code=201, summary="Add a new gate (camera + barrier)")
def create_gate(body: GateCreate, db: Session = Depends(get_db)) -> GateOut:
    gate = ParkingGate(
        label=body.label.strip(),
        sort_order=body.sort_order,
        is_active=body.is_active,
        camera_source=body.camera_source.strip(),
        barrier_driver=body.barrier_driver.lower(),
        barrier_port=(body.barrier_port or "").strip() or None,
        barrier_relay_channel=body.barrier_relay_channel,
        barrier_ip_url=(body.barrier_ip_url or "").strip() or None,
        barrier_open_duration_sec=body.barrier_open_duration_sec,
        barrier_timeout_sec=body.barrier_timeout_sec,
    )
    db.add(gate)
    db.commit()
    db.refresh(gate)
    return GateOut.model_validate(gate)


@router.get("/{gate_id}", response_model=GateOut, summary="Get one gate")
def get_gate(gate_id: int, db: Session = Depends(get_db)) -> GateOut:
    gate = db.query(ParkingGate).filter(ParkingGate.id == gate_id).first()
    if not gate:
        raise HTTPException(status_code=404, detail="Kapı bulunamadı.")
    return GateOut.model_validate(gate)


@router.put("/{gate_id}", response_model=GateOut, summary="Update a gate")
def update_gate(
    gate_id: int,
    body: GateUpdate,
    db: Session = Depends(get_db),
) -> GateOut:
    gate = db.query(ParkingGate).filter(ParkingGate.id == gate_id).first()
    if not gate:
        raise HTTPException(status_code=404, detail="Kapı bulunamadı.")

    data = body.model_dump(exclude_unset=True)
    for field, value in data.items():
        if field == "label" and isinstance(value, str):
            setattr(gate, field, value.strip())
        elif field == "camera_source" and isinstance(value, str):
            setattr(gate, field, value.strip())
        elif field == "barrier_driver" and isinstance(value, str):
            setattr(gate, field, value.lower())
        elif field in {"barrier_port", "barrier_ip_url"} and isinstance(value, str):
            setattr(gate, field, value.strip() or None)
        else:
            setattr(gate, field, value)

    driver = gate.barrier_driver
    _validate_barrier_combo(driver, gate.barrier_port, gate.barrier_ip_url)

    db.add(gate)
    db.commit()
    db.refresh(gate)

    invalidate_gate_controller(gate_id)
    return GateOut.model_validate(gate)


@router.delete("/{gate_id}", status_code=204, summary="Delete a gate")
def delete_gate(gate_id: int, db: Session = Depends(get_db)) -> None:
    gate = db.query(ParkingGate).filter(ParkingGate.id == gate_id).first()
    if not gate:
        raise HTTPException(status_code=404, detail="Kapı bulunamadı.")
    invalidate_gate_controller(gate_id)
    db.delete(gate)
    db.commit()


@router.get(
    "/{gate_id}/barrier-health",
    response_model=GateBarrierHealthOut,
    summary="Barrier hardware status for this gate",
)
def gate_barrier_health(gate_id: int, db: Session = Depends(get_db)) -> GateBarrierHealthOut:
    gate = db.query(ParkingGate).filter(ParkingGate.id == gate_id).first()
    if not gate:
        raise HTTPException(status_code=404, detail="Kapı bulunamadı.")
    ctrl = get_controller_for_gate(gate)
    h = ctrl.health_check()
    return GateBarrierHealthOut(
        gate_id=gate.id,
        label=gate.label,
        connected=h["connected"],
        driver=h["driver"],
        barrier_driver=gate.barrier_driver,
    )


@router.post(
    "/{gate_id}/test-barrier",
    summary="Pulse this gate's barrier once (commissioning)",
)
def gate_test_barrier(
    gate_id: int,
    db: Session = Depends(get_db),
) -> dict:
    gate = db.query(ParkingGate).filter(ParkingGate.id == gate_id).first()
    if not gate:
        raise HTTPException(status_code=404, detail="Kapı bulunamadı.")
    ok, ev = trigger_barrier_open(
        db,
        gate=gate,
        trigger_type="MANUAL_TEST",
        duration_sec=None,
    )
    return {"success": ok, "event_id": ev.id, "notes": ev.notes}
