from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


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


class ExitConfirm(BaseModel):
    amount_paid: Decimal = Field(..., ge=0, decimal_places=2)
    exit_image_path: Optional[str] = None
    notes: Optional[str] = None


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
