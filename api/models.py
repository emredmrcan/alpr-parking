from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, Numeric, String, Text, func

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


class ParkingGate(Base):
    """
    One physical gate: a camera source paired with its barrier driver.

    Operators think in terms of "Giriş / Çıkış" — this row is that single unit.
    """

    __tablename__ = "parking_gates"

    id = Column(Integer, primary_key=True, index=True)
    label = Column(String(100), nullable=False)
    sort_order = Column(Integer, nullable=False, default=0, index=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)

    # USB index ("0"), RTSP URL, etc. — same semantics as CAMERA_SOURCE in .env
    camera_source = Column(String(500), nullable=False)

    barrier_driver = Column(String(16), nullable=False, default="dummy")
    barrier_port = Column(String(32), nullable=True)
    barrier_relay_channel = Column(Integer, nullable=False, default=1)
    barrier_ip_url = Column(String(512), nullable=True)
    barrier_open_duration_sec = Column(Float, nullable=False, default=1.5)
    barrier_timeout_sec = Column(Float, nullable=False, default=3.0)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class BarrierEvent(Base):
    """Audit log for every barrier hardware trigger."""

    __tablename__ = "barrier_events"

    id = Column(Integer, primary_key=True, index=True)
    plate_number = Column(String(24), nullable=True, index=True)
    session_id = Column(
        Integer,
        ForeignKey("parking_sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    gate_id = Column(
        Integer,
        ForeignKey("parking_gates.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    trigger_type = Column(String(32), nullable=False)
    barrier_type = Column(String(16), nullable=False)
    success = Column(Boolean, nullable=False)
    triggered_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    notes = Column(Text, nullable=True)
