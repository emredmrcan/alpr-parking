from __future__ import annotations

import sys
import time
from typing import Optional

import cv2
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from api import frame_hub
from api.barrier import trigger_barrier_open
from api.barrier.factory import get_controller_for_gate, invalidate_gate_controller
from api.database import get_db
from api.models import ParkingGate
from api.schemas import GateBarrierHealthOut, GateCreate, GateOut, GateUpdate
from api.user_messages import barrier_operator_notes, msg

router = APIRouter(prefix="/gates", tags=["gates"])


def _check_camera_source_unique(
    db: Session, camera_source: str, exclude_gate_id: Optional[int] = None
) -> None:
    """Raise 409 if another gate is already using this camera source."""
    q = db.query(ParkingGate).filter(ParkingGate.camera_source == camera_source)
    if exclude_gate_id is not None:
        q = q.filter(ParkingGate.id != exclude_gate_id)
    conflict = q.first()
    if conflict:
        raise HTTPException(
            status_code=409,
            detail=msg("camera_source_in_use", label=conflict.label),
        )


def _validate_barrier_combo(driver: str, port: Optional[str], url: Optional[str]) -> None:
    d = driver.lower()
    if d not in {"dummy", "relay", "ip"}:
        raise HTTPException(status_code=400, detail=msg("invalid_barrier_driver"))
    if d == "relay" and not (port or "").strip():
        raise HTTPException(
            status_code=400,
            detail=msg("relay_requires_port"),
        )
    if d == "ip" and not (url or "").strip():
        raise HTTPException(
            status_code=400,
            detail=msg("ip_requires_url"),
        )


def _parse_camera_source(raw: str) -> int | str:
    raw = raw.strip()
    try:
        return int(raw)
    except ValueError:
        return raw


def _open_capture(source: int | str) -> cv2.VideoCapture:
    if sys.platform == "win32" and isinstance(source, int):
        cap = cv2.VideoCapture(source, cv2.CAP_DSHOW)
    else:
        cap = cv2.VideoCapture(source)
    return cap


@router.get("", response_model=list[GateOut], summary="List camera + barrier gate pairs")
def list_gates(db: Session = Depends(get_db)) -> list[GateOut]:
    rows = (
        db.query(ParkingGate)
        .order_by(ParkingGate.sort_order.asc(), ParkingGate.id.asc())
        .all()
    )
    return [GateOut.model_validate(r) for r in rows]


_PREVIEW_WARMUP_FRAMES = 3  # discard initial black frames from auto-exposure


@router.get("/camera-preview", summary="Read one frame from configured camera source")
def gate_camera_preview(source: str) -> Response:
    parsed_source = _parse_camera_source(source)
    cap = _open_capture(parsed_source)
    if not cap.isOpened():
        cap.release()
        raise HTTPException(
            status_code=400,
            detail=msg("camera_open_failed"),
        )
    # Discard warm-up frames so auto-exposure can settle before grabbing the preview
    for _ in range(_PREVIEW_WARMUP_FRAMES):
        cap.read()
    ok, frame = cap.read()
    cap.release()
    if not ok or frame is None:
        raise HTTPException(status_code=400, detail=msg("camera_no_frame"))
    encoded_ok, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not encoded_ok:
        raise HTTPException(status_code=500, detail=msg("camera_encode_failed"))
    return Response(content=jpeg.tobytes(), media_type="image/jpeg")


@router.get("/{gate_id}/camera-stream", summary="MJPEG stream from gate camera")
def gate_camera_stream(gate_id: int, db: Session = Depends(get_db)) -> StreamingResponse:
    gate = db.query(ParkingGate).filter(ParkingGate.id == gate_id).first()
    if not gate:
        raise HTTPException(status_code=404, detail=msg("gate_not_found"))

    def _generate():
        # camera_loop is the exclusive owner of every camera device.
        # This stream only serves frames that camera_loop pushed to the hub.
        # If no frame is available yet (e.g. ALPR models still loading at
        # startup) the stream simply waits — the configured camera index is
        # always honoured, never silently substituted.
        try:
            while True:
                fb = frame_hub.get_frame(gate_id)
                if fb is not None:
                    yield (
                        b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
                        + fb
                        + b"\r\n"
                    )
                time.sleep(0.5)
        except GeneratorExit:
            pass

    return StreamingResponse(
        _generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-store"},
    )


@router.put("/{gate_id}/frame", include_in_schema=False)
async def put_gate_frame(gate_id: int, request: Request) -> dict:
    """Internal endpoint: camera_loop pushes raw JPEG bytes here for the MJPEG stream.

    This lets the stream serve frames from the hub instead of opening a second
    VideoCapture on the same USB device (which fails on Windows / DirectShow).
    """
    data = await request.body()
    if data:
        frame_hub.put_frame(gate_id, data)
    return {"ok": True}


@router.post("", response_model=GateOut, status_code=201, summary="Add a new gate (camera + barrier)")
def create_gate(body: GateCreate, db: Session = Depends(get_db)) -> GateOut:
    _check_camera_source_unique(db, body.camera_source.strip())
    gate = ParkingGate(
        label=body.label.strip(),
        sort_order=body.sort_order,
        is_active=body.is_active,
        camera_source=body.camera_source.strip(),
        gate_type=body.gate_type,
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
        raise HTTPException(status_code=404, detail=msg("gate_not_found"))
    return GateOut.model_validate(gate)


@router.put("/{gate_id}", response_model=GateOut, summary="Update a gate")
def update_gate(
    gate_id: int,
    body: GateUpdate,
    db: Session = Depends(get_db),
) -> GateOut:
    gate = db.query(ParkingGate).filter(ParkingGate.id == gate_id).first()
    if not gate:
        raise HTTPException(status_code=404, detail=msg("gate_not_found"))

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
    _check_camera_source_unique(db, gate.camera_source, exclude_gate_id=gate_id)

    db.add(gate)
    db.commit()
    db.refresh(gate)

    invalidate_gate_controller(gate_id)
    return GateOut.model_validate(gate)


@router.delete("/{gate_id}", status_code=204, summary="Delete a gate")
def delete_gate(gate_id: int, db: Session = Depends(get_db)) -> None:
    gate = db.query(ParkingGate).filter(ParkingGate.id == gate_id).first()
    if not gate:
        raise HTTPException(status_code=404, detail=msg("gate_not_found"))
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
        raise HTTPException(status_code=404, detail=msg("gate_not_found"))
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
        raise HTTPException(status_code=404, detail=msg("gate_not_found"))
    ok, _ = trigger_barrier_open(
        db,
        gate=gate,
        trigger_type="MANUAL_TEST",
        duration_sec=None,
    )
    return {"success": ok, "notes": barrier_operator_notes(ok)}
