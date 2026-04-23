from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


# ── Recognition ──────────────────────────────────────────────────────────────

class PlateCandidateOut(BaseModel):
    plate: str
    raw_ocr: str
    confidence: float
    is_valid: bool
    bbox: list[int]


class RecognitionOut(BaseModel):
    success: bool
    best: Optional[PlateCandidateOut] = None
    candidates: list[PlateCandidateOut] = []
    image_path: Optional[str] = None
    error: Optional[str] = None


# ── Sessions ─────────────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    plate_number: str = Field(..., min_length=5, max_length=20)
    raw_ocr_text: Optional[str] = None
    entered_manually: bool = False
    image_path: Optional[str] = None
    notes: Optional[str] = None
    gate_id: Optional[int] = Field(None, ge=1)
    trigger_barrier: bool = False


class ExitConfirm(BaseModel):
    amount_paid: Decimal = Field(..., ge=0, decimal_places=2)
    exit_image_path: Optional[str] = None
    notes: Optional[str] = None
    gate_id: Optional[int] = Field(None, ge=1)
    trigger_barrier: bool = False


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    plate_number: str
    raw_ocr_text: Optional[str]
    entrance_time: datetime
    exit_time: Optional[datetime]
    duration_minutes: Optional[int]
    amount_due: Optional[Decimal]
    amount_paid: Optional[Decimal]
    status: str
    entered_manually: bool
    image_path: Optional[str]
    exit_image_path: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime


class SessionListOut(BaseModel):
    total: int
    items: list[SessionOut]


class BarrierTriggerOut(BaseModel):
    triggered: bool
    event_id: Optional[int] = None
    notes: Optional[str] = None


class SessionActionOut(BaseModel):
    session: SessionOut
    barrier: Optional[BarrierTriggerOut] = None


class PriceSummary(BaseModel):
    """Returned when a worker looks up an active session to see the fee."""
    session_id: int
    plate_number: str
    entrance_time: datetime
    duration_minutes: int
    amount_due: Decimal


# ── Pricing ──────────────────────────────────────────────────────────────────

class PriceRuleCreate(BaseModel):
    duration_from_min: int = Field(..., ge=0)
    duration_to_min: Optional[int] = Field(None, ge=1)
    price: Decimal = Field(..., ge=0, decimal_places=2)
    label: Optional[str] = None


class PriceRuleUpdate(BaseModel):
    duration_from_min: Optional[int] = Field(None, ge=0)
    duration_to_min: Optional[int] = Field(None, ge=1)
    price: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    label: Optional[str] = None


class PriceRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    duration_from_min: int
    duration_to_min: Optional[int]
    price: Decimal
    label: Optional[str]
    created_at: datetime


# ── Barrier / gate hardware ───────────────────────────────────────────────────

class BarrierHealthOut(BaseModel):
    connected: bool
    driver: str
    barrier_type: str


class BarrierEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    plate_number: Optional[str]
    session_id: Optional[int]
    gate_id: Optional[int]
    trigger_type: str
    barrier_type: str
    success: bool
    triggered_at: datetime
    notes: Optional[str]


class BarrierTestOpenOut(BaseModel):
    success: bool
    event_id: int
    notes: Optional[str] = None


# ── Parking gates (camera + barrier pair) ─────────────────────────────────────

class GateCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=100)
    camera_source: str = Field(..., min_length=1, max_length=500)
    barrier_driver: str = Field(..., min_length=2, max_length=16)
    barrier_port: Optional[str] = Field(None, max_length=32)
    barrier_relay_channel: int = Field(1, ge=1, le=8)
    barrier_ip_url: Optional[str] = Field(None, max_length=512)
    barrier_open_duration_sec: float = Field(1.5, gt=0, le=60)
    barrier_timeout_sec: float = Field(3.0, gt=0, le=120)
    sort_order: int = 0
    is_active: bool = True

    @model_validator(mode="after")
    def _validate_barrier(self) -> "GateCreate":
        d = self.barrier_driver.lower()
        if d not in {"dummy", "relay", "ip"}:
            raise ValueError("barrier_driver must be dummy, relay, or ip")
        if d == "relay" and not (self.barrier_port or "").strip():
            raise ValueError("Relay için COM port gerekli (ör. COM3 veya /dev/ttyUSB0).")
        if d == "ip" and not (self.barrier_ip_url or "").strip():
            raise ValueError("IP bariyer için tam URL gerekli (ör. http://192.168.1.10/relay/on).")
        return self


class GateUpdate(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=100)
    camera_source: Optional[str] = Field(None, min_length=1, max_length=500)
    barrier_driver: Optional[str] = Field(None, min_length=2, max_length=16)
    barrier_port: Optional[str] = Field(None, max_length=32)
    barrier_relay_channel: Optional[int] = Field(None, ge=1, le=8)
    barrier_ip_url: Optional[str] = Field(None, max_length=512)
    barrier_open_duration_sec: Optional[float] = Field(None, gt=0, le=60)
    barrier_timeout_sec: Optional[float] = Field(None, gt=0, le=120)
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class GateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    sort_order: int
    is_active: bool
    camera_source: str
    barrier_driver: str
    barrier_port: Optional[str]
    barrier_relay_channel: int
    barrier_ip_url: Optional[str]
    barrier_open_duration_sec: float
    barrier_timeout_sec: float
    created_at: datetime
    updated_at: datetime


class GateBarrierHealthOut(BaseModel):
    gate_id: int
    label: str
    connected: bool
    driver: str
    barrier_driver: str
