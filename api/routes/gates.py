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
from api.user_messages import barrier_operator_notes

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
            detail="Kamera kaynağı açılamadı. Numara veya adresi kontrol edin.",
        )
    # Discard warm-up frames so auto-exposure can settle before grabbing the preview
    for _ in range(_PREVIEW_WARMUP_FRAMES):
        cap.read()
    ok, frame = cap.read()
    cap.release()
    if not ok or frame is None:
        raise HTTPException(status_code=400, detail="Kameradan görüntü alınamadı.")
    encoded_ok, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not encoded_ok:
        raise HTTPException(status_code=500, detail="Kamera karesi JPEG'e dönüştürülemedi.")
    return Response(content=jpeg.tobytes(), media_type="image/jpeg")


@router.get("/{gate_id}/camera-stream", summary="MJPEG stream from gate camera")
def gate_camera_stream(gate_id: int, db: Session = Depends(get_db)) -> StreamingResponse:
    gate = db.query(ParkingGate).filter(ParkingGate.id == gate_id).first()
    if not gate:
        raise HTTPException(status_code=404, detail="Kapı bulunamadı.")
    parsed_source = _parse_camera_source(gate.camera_source)

    def _generate():
        # ── Phase 1: wait up to 2 s for camera_loop to push a frame ─────────
        # camera_loop is the sole owner of USB cameras on Windows; it feeds
        # frames here so we never need a second VideoCapture on the same device.
        hub_deadline = time.monotonic() + 2.0
        while time.monotonic() < hub_deadline:
            if frame_hub.has_fresh_frame(gate_id):
                break
            time.sleep(0.1)

        if frame_hub.has_fresh_frame(gate_id):
            # ── Hub mode: serve frames pushed by camera_loop ─────────────────
            try:
                while True:
                    fb = frame_hub.get_frame(gate_id)
                    if fb is not None:
                        yield (
                            b"--frame\r\n"
                            b"Content-Type: image/jpeg\r\n\r\n"
                            + fb
                            + b"\r\n"
                        )
                    time.sleep(0.5)  # match FRAME_PUSH_INTERVAL_SEC (2 fps)
            except GeneratorExit:
                return

        # ── Fallback: direct capture (RTSP/IP cameras or standalone dev mode) ─
        cap = _open_capture(parsed_source)
        if not cap.isOpened():
            cap.release()
            return
        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                ok2, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                if not ok2:
                    continue
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n"
                    + jpeg.tobytes()
                    + b"\r\n"
                )
        except GeneratorExit:
            pass
        finally:
            cap.release()

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
    ok, _ = trigger_barrier_open(
        db,
        gate=gate,
        trigger_type="MANUAL_TEST",
        duration_sec=None,
    )
    return {"success": ok, "notes": barrier_operator_notes(ok)}
