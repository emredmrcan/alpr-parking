from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Literal

import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


class BarrierState(str, Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"


class ReentryPolicy(str, Enum):
    IGNORE = "ignore"
    QUEUE_ONE = "queue_one"
    EXTEND = "extend"


class FailureMode(str, Enum):
    HTTP_500 = "http_500"
    TIMEOUT_504 = "timeout_504"


class OpenCommandResponse(BaseModel):
    barrier_id: int
    accepted: bool
    state: BarrierState
    policy: ReentryPolicy
    queued: bool
    message: str


class FaultProfile(BaseModel):
    fixed_delay_ms: int = Field(0, ge=0, le=20_000)
    jitter_ms: int = Field(0, ge=0, le=20_000)
    fail_rate_percent: int = Field(0, ge=0, le=100)
    failure_mode: FailureMode = FailureMode.HTTP_500
    timeout_ms: int = Field(5_000, ge=500, le=60_000)
    stuck_open: bool = False
    stuck_closed: bool = False


class FaultProfileUpdate(BaseModel):
    fixed_delay_ms: int = Field(0, ge=0, le=20_000)
    jitter_ms: int = Field(0, ge=0, le=20_000)
    fail_rate_percent: int = Field(0, ge=0, le=100)
    failure_mode: FailureMode = FailureMode.HTTP_500
    timeout_ms: int = Field(5_000, ge=500, le=60_000)
    stuck_open: bool = False
    stuck_closed: bool = False


class BarrierSnapshot(BaseModel):
    barrier_id: int
    state: BarrierState
    open_seconds: float
    policy: ReentryPolicy
    queue_depth: int
    is_busy: bool
    open_until: datetime | None
    last_opened_at: datetime | None
    total_commands: int
    accepted_commands: int
    rejected_busy: int
    failed_commands: int
    total_cycles: int
    fault_profile: FaultProfile


class BarrierListResponse(BaseModel):
    barriers: list[BarrierSnapshot]


@dataclass
class BarrierDevice:
    barrier_id: int
    open_seconds: float = 10.0
    policy: ReentryPolicy = ReentryPolicy.IGNORE
    state: BarrierState = BarrierState.CLOSED
    queue_depth: int = 0
    open_until: datetime | None = None
    last_opened_at: datetime | None = None
    total_commands: int = 0
    accepted_commands: int = 0
    rejected_busy: int = 0
    failed_commands: int = 0
    total_cycles: int = 0
    fault_profile: FaultProfile = field(default_factory=FaultProfile)
    _runner: asyncio.Task | None = None
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def snapshot(self) -> BarrierSnapshot:
        return BarrierSnapshot(
            barrier_id=self.barrier_id,
            state=self.state,
            open_seconds=self.open_seconds,
            policy=self.policy,
            queue_depth=self.queue_depth,
            is_busy=self.state == BarrierState.OPEN,
            open_until=self.open_until,
            last_opened_at=self.last_opened_at,
            total_commands=self.total_commands,
            accepted_commands=self.accepted_commands,
            rejected_busy=self.rejected_busy,
            failed_commands=self.failed_commands,
            total_cycles=self.total_cycles,
            fault_profile=self.fault_profile,
        )

    async def request_open(self) -> OpenCommandResponse:
        async with self._lock:
            self.total_commands += 1
            if self.state == BarrierState.CLOSED:
                self.accepted_commands += 1
                self._start_runner_unlocked()
                return OpenCommandResponse(
                    barrier_id=self.barrier_id,
                    accepted=True,
                    state=self.state,
                    policy=self.policy,
                    queued=self.queue_depth > 0,
                    message="Barrier opening pulse accepted.",
                )

            # OPEN state handling
            if self.policy == ReentryPolicy.IGNORE:
                self.rejected_busy += 1
                return OpenCommandResponse(
                    barrier_id=self.barrier_id,
                    accepted=False,
                    state=self.state,
                    policy=self.policy,
                    queued=self.queue_depth > 0,
                    message="Barrier already open; command ignored.",
                )

            if self.policy == ReentryPolicy.QUEUE_ONE:
                if self.queue_depth >= 1:
                    self.rejected_busy += 1
                    return OpenCommandResponse(
                        barrier_id=self.barrier_id,
                        accepted=False,
                        state=self.state,
                        policy=self.policy,
                        queued=True,
                        message="Barrier open and one command already queued.",
                    )

                self.queue_depth = 1
                self.accepted_commands += 1
                return OpenCommandResponse(
                    barrier_id=self.barrier_id,
                    accepted=True,
                    state=self.state,
                    policy=self.policy,
                    queued=True,
                    message="Barrier open; queued one extra pulse.",
                )

            # EXTEND policy
            self.accepted_commands += 1
            self.open_until = _utc_now_plus(self.open_seconds)
            return OpenCommandResponse(
                barrier_id=self.barrier_id,
                accepted=True,
                state=self.state,
                policy=self.policy,
                queued=False,
                message=f"Barrier open duration extended by {self.open_seconds:.1f}s.",
            )

    async def force_close(self) -> None:
        async with self._lock:
            self.queue_depth = 0
            self.state = BarrierState.CLOSED
            self.open_until = None

    def _start_runner_unlocked(self) -> None:
        if self._runner and not self._runner.done():
            return
        self._runner = asyncio.create_task(self._run_pulses())

    async def _run_pulses(self) -> None:
        while True:
            async with self._lock:
                self.state = BarrierState.OPEN
                self.last_opened_at = datetime.now(timezone.utc)
                self.total_cycles += 1
                if self.open_until is None:
                    self.open_until = _utc_now_plus(self.open_seconds)

            # Simulate hardware stuck-open fault: gate does not close by itself.
            while True:
                async with self._lock:
                    stuck = self.fault_profile.stuck_open
                    state = self.state
                if not stuck or state != BarrierState.OPEN:
                    break
                await asyncio.sleep(0.1)

            # Keep open until open_until. EXTEND policy can move this timestamp forward.
            while True:
                async with self._lock:
                    open_until = self.open_until
                if open_until is None:
                    break
                remaining = (open_until - datetime.now(timezone.utc)).total_seconds()
                if remaining <= 0:
                    break
                await asyncio.sleep(min(0.1, remaining))

            async with self._lock:
                self.open_until = None
                if self.queue_depth > 0:
                    self.queue_depth -= 1
                    self.open_until = _utc_now_plus(self.open_seconds)
                    continue

                self.state = BarrierState.CLOSED
                self._runner = None
                return

    async def maybe_apply_fault_latency(self) -> None:
        async with self._lock:
            fixed_ms = self.fault_profile.fixed_delay_ms
            jitter_ms = self.fault_profile.jitter_ms
        delay_ms = fixed_ms
        if jitter_ms > 0:
            delay_ms += random.randint(0, jitter_ms)
        if delay_ms > 0:
            await asyncio.sleep(delay_ms / 1000.0)

    async def maybe_raise_fault(self) -> None:
        async with self._lock:
            stuck_closed = self.fault_profile.stuck_closed
            fail_rate = self.fault_profile.fail_rate_percent
            mode = self.fault_profile.failure_mode
            timeout_ms = self.fault_profile.timeout_ms
        if stuck_closed:
            async with self._lock:
                self.total_commands += 1
                self.failed_commands += 1
            raise HTTPException(status_code=503, detail="Simulated stuck-closed barrier fault.")

        should_fail = fail_rate > 0 and random.randint(1, 100) <= fail_rate
        if not should_fail:
            return

        async with self._lock:
            self.total_commands += 1
            self.failed_commands += 1

        if mode == FailureMode.TIMEOUT_504:
            await asyncio.sleep(timeout_ms / 1000.0)
            raise HTTPException(status_code=504, detail="Simulated timeout while opening barrier.")
        raise HTTPException(status_code=500, detail="Simulated hardware fault (relay/IP failure).")


def _utc_now_plus(seconds: float) -> datetime:
    return datetime.now(timezone.utc) + timedelta_safe(seconds)


def timedelta_safe(seconds: float):
    # Keep this helper tiny and explicit for readability.
    from datetime import timedelta

    return timedelta(seconds=float(seconds))


class BarrierRegistry:
    def __init__(self) -> None:
        self._items: dict[int, BarrierDevice] = {}
        self._lock = asyncio.Lock()

    async def get_or_create(
        self,
        barrier_id: int,
        *,
        open_seconds: float = 10.0,
        policy: ReentryPolicy = ReentryPolicy.IGNORE,
    ) -> BarrierDevice:
        async with self._lock:
            item = self._items.get(barrier_id)
            if item is None:
                item = BarrierDevice(
                    barrier_id=barrier_id,
                    open_seconds=open_seconds,
                    policy=policy,
                )
                self._items[barrier_id] = item
            return item

    async def list_all(self) -> list[BarrierSnapshot]:
        async with self._lock:
            items = list(self._items.values())
        return [item.snapshot() for item in sorted(items, key=lambda x: x.barrier_id)]


app = FastAPI(
    title="Barrier Simulator",
    description="Multi-barrier hardware simulator for local integration testing.",
    version="1.0.0",
)
registry = BarrierRegistry()

static_dir = Path(__file__).resolve().parent / "static"
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


@app.get("/")
def ui() -> FileResponse:
    return FileResponse(static_dir / "index.html")


@app.get("/health")
def health() -> dict[str, Literal["ok"]]:
    return {"status": "ok"}


@app.get("/barriers", response_model=BarrierListResponse)
async def list_barriers() -> BarrierListResponse:
    return BarrierListResponse(barriers=await registry.list_all())


@app.get("/barrier/{barrier_id}", response_model=BarrierSnapshot)
async def get_barrier(barrier_id: int) -> BarrierSnapshot:
    if barrier_id < 1:
        raise HTTPException(status_code=400, detail="barrier_id must be >= 1")
    item = await registry.get_or_create(barrier_id)
    return item.snapshot()


async def _open_barrier_impl(
    barrier_id: int,
    open_seconds: float,
    policy: ReentryPolicy,
) -> OpenCommandResponse:
    if barrier_id < 1:
        raise HTTPException(status_code=400, detail="barrier_id must be >= 1")
    item = await registry.get_or_create(barrier_id, open_seconds=open_seconds, policy=policy)
    item.open_seconds = open_seconds
    item.policy = policy
    await item.maybe_apply_fault_latency()
    await item.maybe_raise_fault()
    return await item.request_open()


@app.post("/open/{barrier_id}", response_model=OpenCommandResponse)
async def open_barrier_post(
    barrier_id: int,
    open_seconds: float = Query(10.0, gt=0.2, le=60),
    policy: ReentryPolicy = Query(ReentryPolicy.IGNORE),
) -> OpenCommandResponse:
    return await _open_barrier_impl(barrier_id, open_seconds, policy)


@app.get("/open/{barrier_id}", response_model=OpenCommandResponse)
async def open_barrier_get(
    barrier_id: int,
    open_seconds: float = Query(10.0, gt=0.2, le=60),
    policy: ReentryPolicy = Query(ReentryPolicy.IGNORE),
) -> OpenCommandResponse:
    # Compatibility route: current IP driver uses GET for open command.
    return await _open_barrier_impl(barrier_id, open_seconds, policy)


@app.post("/close/{barrier_id}", response_model=BarrierSnapshot)
async def close_barrier(barrier_id: int) -> BarrierSnapshot:
    if barrier_id < 1:
        raise HTTPException(status_code=400, detail="barrier_id must be >= 1")
    item = await registry.get_or_create(barrier_id)
    await item.force_close()
    return item.snapshot()


@app.get("/faults/{barrier_id}", response_model=FaultProfile)
async def get_faults(barrier_id: int) -> FaultProfile:
    if barrier_id < 1:
        raise HTTPException(status_code=400, detail="barrier_id must be >= 1")
    item = await registry.get_or_create(barrier_id)
    return item.fault_profile


@app.put("/faults/{barrier_id}", response_model=BarrierSnapshot)
async def set_faults(barrier_id: int, body: FaultProfileUpdate) -> BarrierSnapshot:
    if barrier_id < 1:
        raise HTTPException(status_code=400, detail="barrier_id must be >= 1")
    item = await registry.get_or_create(barrier_id)
    async with item._lock:
        item.fault_profile = FaultProfile(**body.model_dump())
        if not item.fault_profile.stuck_open and item.state == BarrierState.OPEN and item.open_until is None:
            item.open_until = _utc_now_plus(item.open_seconds)
    return item.snapshot()


if __name__ == "__main__":
    uvicorn.run("barrier_simulator.app:app", host="0.0.0.0", port=8181, reload=True)
