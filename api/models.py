from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, Integer, Numeric, String, Text, func

from .database import Base


class ParkingSession(Base):
    __tablename__ = "parking_sessions"

    id = Column(Integer, primary_key=True, index=True)
    plate_number = Column(String(20), nullable=False, index=True)
    raw_ocr_text = Column(String(50), nullable=True)

    entrance_time = Column(DateTime(timezone=True), nullable=False)
    exit_time = Column(DateTime(timezone=True), nullable=True)
    duration_minutes = Column(Integer, nullable=True)

    amount_due = Column(Numeric(10, 2), nullable=True)
    amount_paid = Column(Numeric(10, 2), nullable=True)

    # ACTIVE → PAID
    status = Column(String(10), nullable=False, default="ACTIVE", index=True)

    entered_manually = Column(Boolean, nullable=False, default=False)

    image_path = Column(String(500), nullable=True)
    exit_image_path = Column(String(500), nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class PriceRule(Base):
    __tablename__ = "price_rules"

    id = Column(Integer, primary_key=True, index=True)
    duration_from_min = Column(Integer, nullable=False)
    duration_to_min = Column(Integer, nullable=True)  # NULL = open-ended
    price = Column(Numeric(10, 2), nullable=False)
    label = Column(String(100), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
