# Roadmap Item 3 — Subscription Plans

**Priority:** P2 — Core business feature  
**Estimated effort:** 3 engineering days  
**Depends on:** Item 1 (Database), Item 2 (Barrier Hardware — completed)  
**Blocks:** Nothing (but must be done before client delivery)

---

## Problem Statement

Some car owners have recurring arrangements with the parking facility. Instead of paying
per visit, they pay for a **weekly**, **monthly**, or **yearly** subscription. When their
car arrives at the barrier:

1. The ALPR engine reads the plate.
2. The system checks for an active subscription.
3. If found: the gate opens automatically, the session is logged with `amount_due = 0`,
   no worker action is required.
4. If **not** found: normal paid-parking flow (worker confirms, fee calculated on exit).

The admin manages subscriptions through the back-office UI — adding, renewing, and
deactivating them.

---

## Goal

1. A new `subscriptions` database table stores all subscription records.
2. The admin can create a subscription by choosing a plate, a plan type, and a start
   date. The **end date is calculated automatically** by the system.
3. The gate entrance flow checks for an active subscription **automatically** when a
   candidate plate is pushed. Subscribers bypass worker confirmation entirely.
4. Subscribed sessions are logged with `amount_due = 0` and `is_subscribed = True`.
5. At exit, subscribed cars are auto-released with `amount_due = 0` and no fee prompt.
6. The admin UI shows a dedicated "Subscriptions" page with full CRUD.

---

## Plan Types and Duration Rules

| Plan | Duration | Calculation rule |
|------|----------|-----------------|
| `WEEKLY` | 7 days | `end_date = start_date + timedelta(days=7)` |
| `MONTHLY` | 1 calendar month | `end_date = start_date + relativedelta(months=1)` |
| `YEARLY` | 1 calendar year | `end_date = start_date + relativedelta(years=1)` |

> **Use `dateutil.relativedelta` for MONTHLY and YEARLY**, not `timedelta`. A 30-day
> month and a 31-day month must both advance by exactly one calendar month.
> Example: 31 Jan + 1 month = 28 Feb (or 29 Feb in a leap year), not 2 March.

---

## Database Schema

### New table: `subscriptions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `plate_number` | TEXT(20) | Exact plate, indexed |
| `plan_type` | TEXT(10) | `WEEKLY` / `MONTHLY` / `YEARLY` |
| `start_date` | DATE | Admin sets this (date only, no time) |
| `end_date` | DATE | Auto-calculated on create; stored for display |
| `is_active` | BOOLEAN | Admin can deactivate without deleting |
| `notes` | TEXT | Optional (e.g. "Company car — Acme Ltd") |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

**Index:** `(plate_number, is_active, end_date)` — used by the entrance check query.

### Modified table: `parking_sessions`

Add two columns:

| Column | Type | Notes |
|--------|------|-------|
| `is_subscribed` | BOOLEAN | `True` if session was auto-created for a subscriber |
| `subscription_id` | INTEGER FK → subscriptions.id | nullable |

---

## Architecture Context (as-built, item 2)

The codebase uses a **per-gate architecture**. Item 2 is fully implemented:

- Each lane is a row in `parking_gates` (Kapı ayarları UI at `/gates`).
- `camera_loop.py` fetches `GET /api/gates` at startup and spawns **one worker thread
  per active gate**. Each worker runs its own ALPR pipeline independently.
- Workers push plate candidates via `POST /api/candidate` with the row's `gate_id`.
- The Gate screen (Bariyer Ekranı) polls `GET /api/candidate?gate_id=<id>` for exactly
  its own lane — entrance and exit lanes never overwrite each other.
- Barrier control is per-gate: `trigger_barrier_open(db, gate=gate, trigger_type=...)`.
  The `gate` object carries `barrier_driver`, `barrier_port`, `barrier_relay_channel`,
  `barrier_ip_url`, and `barrier_open_duration_sec` directly from the database.
- Every barrier trigger (success or failure) is recorded in `barrier_events` with
  `gate_id`, `trigger_type`, `success`, and optional error notes.

All subscription logic must fit into this per-gate model.

---

## Confidence Threshold — Single Threshold Policy

The system uses a **single confidence threshold** (`BAR_CONFIDENCE_THRESHOLD` in `.env`,
default `0.90`) for deciding whether to send a plate to the API.

**A plate that matches a subscriber record is treated as a correct read.**  
If the OCR produces a plate that exists in the active subscriptions list, the likelihood
of a misread coincidentally matching a known subscription is negligible. Requiring a
higher threshold for subscribers would only delay legitimate openings and add complexity
with no meaningful security gain at this site scale.

**Policy:**
- Below `BAR_CONFIDENCE_THRESHOLD` → `camera_loop.py` discards the read entirely.
  No candidate is pushed, no subscription check runs.
- At or above `BAR_CONFIDENCE_THRESHOLD`, valid Turkish plate format → candidate is
  pushed to `POST /api/candidate`. The subscription check runs **on the backend** at
  this point.
- Subscription match found → **auto-open** (session created, barrier triggered, Gate UI
  shows green screen).
- No subscription match → normal manual confirmation flow (worker confirms on Gate UI).

No `SUBSCRIBER_CONFIDENCE_THRESHOLD` environment variable is needed or used.

---

## API Endpoints

### Subscription management (admin)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/subscriptions` | List all subscriptions (supports `?active=true&plate=34ABC`) |
| `POST` | `/api/subscriptions` | Create a subscription |
| `GET` | `/api/subscriptions/{id}` | Get single subscription detail |
| `PUT` | `/api/subscriptions/{id}` | Update (renew, deactivate, change notes) |
| `DELETE` | `/api/subscriptions/{id}` | Hard delete (use deactivate in practice) |
| `GET` | `/api/subscriptions/check/{plate}` | Check if plate has an active subscription right now |

### Create subscription — request body

```json
{
  "plate_number": "34ABC1234",
  "plan_type": "MONTHLY",
  "start_date": "2026-05-01",
  "notes": "Company fleet — Acme Ltd"
}
```

### Create subscription — response

```json
{
  "id": 42,
  "plate_number": "34ABC1234",
  "plan_type": "MONTHLY",
  "start_date": "2026-05-01",
  "end_date": "2026-06-01",
  "is_active": true,
  "notes": "Company fleet — Acme Ltd",
  "created_at": "2026-04-22T10:30:00Z"
}
```

### Check subscription — response

```json
{
  "has_active_subscription": true,
  "subscription": {
    "id": 42,
    "plan_type": "MONTHLY",
    "end_date": "2026-06-01",
    "days_remaining": 40
  }
}
```

---

## Modified Entrance Flow

### Current flow (non-subscriber)

```
camera_loop.py — per-gate worker thread
  → ALPR detects plate (confidence ≥ BAR_CONFIDENCE_THRESHOLD, valid Turkish format)
  → POST /api/candidate {gate_id, plate, confidence, ...}
  → candidate stored in in-memory buffer per gate_id
  → Gate UI polls GET /api/candidate?gate_id=<id>
  → Gate UI shows plate (editable) — worker confirms
  → POST /api/sessions {plate_number, gate_id, trigger_barrier: true}
  → Backend: creates ParkingSession, calls trigger_barrier_open(gate=gate)
  → barrier_events row written (trigger_type="MANUAL_WORKER_ENTRY")
  → Gate UI shows confirmation, resets
```

### New flow with subscription check

The subscription check is performed **server-side inside `POST /api/candidate`**.
This is the earliest possible point — no round-trip from the frontend is needed and
the Gate UI worker is not involved for subscriber lanes.

```
camera_loop.py — per-gate worker thread
  → ALPR detects plate (confidence ≥ BAR_CONFIDENCE_THRESHOLD, valid Turkish format)
  → POST /api/candidate {gate_id, plate, confidence, ...}
    │
    ├── Backend checks: active subscription for this plate?
    │     (plate_number = plate AND is_active = True
    │      AND start_date ≤ today ≤ end_date)
    │
    ├── Active subscription found:
    │     → ParkingSession created (is_subscribed=True, subscription_id=..., amount_due=0)
    │     → trigger_barrier_open(db, gate=gate, trigger_type="AUTO_SUBSCRIBER")
    │     → barrier_events row written (success / failure)
    │     → candidate stored with is_subscriber=True + subscription details
    │     → 200 response to camera_loop (no change to camera_loop.py needed)
    │
    │   Gate UI polls GET /api/candidate?gate_id=<id>
    │     → sees is_subscriber=True
    │     → full-screen GREEN: "ABONE — OTOMATİK AÇILDI"
    │     → plays audio beep
    │     → auto-resets after 8 seconds (or worker presses OK)
    │     → DELETE /api/candidate?gate_id=<id> to clear buffer
    │
    └── No active subscription:
          → candidate stored as normal (is_subscriber=False)
          → Gate UI polls, shows plate for worker confirmation (existing flow)
          → Worker confirms: POST /api/sessions + trigger_barrier (existing)
```

### Candidate response — extended for subscriptions

`POST /api/candidate` and `GET /api/candidate` must return subscription state so the
Gate UI can react without an extra API call:

```json
{
  "gate_id": 1,
  "plate": "34ABC1234",
  "raw_ocr": "34ABC1234",
  "confidence": 0.93,
  "is_valid": true,
  "detected_at": "2026-04-23T10:15:00Z",
  "is_subscriber": true,
  "subscription": {
    "id": 42,
    "plan_type": "MONTHLY",
    "end_date": "2026-06-01",
    "days_remaining": 40
  },
  "session_id": 187,
  "barrier_triggered": true
}
```

When `is_subscriber=false`, the `subscription` field is `null`, `session_id` is `null`,
and `barrier_triggered` is `false`. This keeps the Gate UI polling contract unchanged —
only the payload grows.

---

## Modified Exit Flow

When the worker looks up a session by plate at exit:

- If `session.is_subscribed = True`:
  - Display: `₺0.00 — ABONE — ÜCRET YOK`
  - The exit barrier opens automatically via `trigger_barrier_open(gate=gate, trigger_type="AUTO_SUBSCRIBER_EXIT")`
  - Session is closed: `amount_due = 0`, `amount_paid = 0`, `status = PAID`
  - No manual confirmation or fee entry required from the worker

- If `session.is_subscribed = False`:
  - Normal fee calculation and manual confirmation (unchanged)

Exit trigger type recorded in `barrier_events`: `AUTO_SUBSCRIBER_EXIT`.

---

## Subscription Status Business Rules

1. A subscription is **active** if: `is_active = True` AND `start_date ≤ today ≤ end_date`.
2. A subscription is **expired** if: `end_date < today` (even if `is_active = True`).
3. An admin can **deactivate** a subscription early (set `is_active = False`).
4. A plate can have **multiple subscriptions** in the database (history of renewals), but
   only one can be active on any given day. The API must enforce this on create.
5. Renewal = create a new subscription record starting the day after the current `end_date`.
   The old record remains in the database as history.

---

## Frontend — Subscriptions Admin Page

Route: `/subscriptions`

### List view

```
Subscriptions                        [ + Add Subscription ]

Search plate: [ __________ ]   Filter: [All ▼]   Status: [Active ▼]

┌──────────────┬─────────┬────────────┬────────────┬────────┬──────────────────────┐
│ Plate        │ Plan    │ Start      │ End        │ Status │ Actions              │
├──────────────┼─────────┼────────────┼────────────┼────────┼──────────────────────┤
│ 34 ABC 1234  │ MONTHLY │ 2026-05-01 │ 2026-06-01 │ Active │ [Renew] [Edit] [Del] │
│ 06 XY 9876   │ YEARLY  │ 2026-01-01 │ 2027-01-01 │ Active │ [Renew] [Edit] [Del] │
│ 34 DE 5555   │ WEEKLY  │ 2026-04-01 │ 2026-04-08 │ Expired│ [Renew] [Edit] [Del] │
└──────────────┴─────────┴────────────┴────────────┴────────┴──────────────────────┘
```

### Add / Edit subscription modal

```
Add Subscription

Plate Number:   [ 34 ABC 1234        ]   (validated as Turkish plate)
Plan Type:      ( ) Weekly
                (●) Monthly
                ( ) Yearly
Start Date:     [ 2026-05-01         ]   (date picker, defaults to today)
End Date:       [ 2026-06-01         ]   (read-only, auto-calculated and displayed)
Notes:          [ Company car — Acme Ltd ]

                [ Cancel ]   [ Save Subscription ]
```

When the admin changes Plan Type or Start Date, the End Date field updates in real time
(calculated on the frontend for display — server recalculates on save for consistency).

### Gate UI — subscriber auto-open screen (Bariyer Ekranı)

When `GET /api/candidate?gate_id=<id>` returns `is_subscriber: true`, the Gate UI
replaces the normal confirmation screen with a full-screen green state:

```
┌──────────────────────────────────────────────┐
│  ██████████████████████████████████████████  │ ← full green background
│                                              │
│         ✓  ABONE TESPİT EDİLDİ              │
│                                              │
│         Plaka:  34 ABC 1234                  │
│         Plan:   MONTHLY (31 Mayıs 2026'ya    │
│                 kadar geçerli)               │
│                                              │
│         BARİYER AÇILIYOR...                  │
│                                              │
│         [  Tamam — Sıfırla  ]                │  ← manual override
└──────────────────────────────────────────────┘
```

Key design decisions:
- **The barrier has already opened.** The backend triggered it when the candidate was
  pushed. The Gate UI is informational only.
- An audible beep (Web Audio API) confirms the event.
- The "Tamam — Sıfırla" button clears the candidate buffer and resets the screen.
  Without it, the screen auto-resets after 8 seconds.
- If `barrier_triggered: false` in the candidate response (hardware failure), the screen
  shows a yellow warning: `ABONE — BARİYER AÇILAMADI — MANUEL AÇIN`.

There is **no "possible subscriber below threshold" screen**. Below-threshold plates are
discarded by `camera_loop.py` before reaching the API — they never appear on the Gate UI.

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `api/models.py` | Add `Subscription` model; add `is_subscribed`, `subscription_id` to `ParkingSession` |
| `api/schemas.py` | Add `SubscriptionCreate`, `SubscriptionRead`, `SubscriptionCheck` Pydantic schemas; extend `CandidateOut` with `is_subscriber`, `subscription`, `session_id`, `barrier_triggered` |
| `api/routes/subscriptions.py` | Create — all subscription CRUD endpoints + `GET /check/{plate}` |
| `api/routes/candidate.py` | Modify `POST /api/candidate` — inject DB, check subscription, auto-create session and trigger barrier if subscriber found |
| `api/routes/sessions.py` | Modify entrance / exit logic: detect `is_subscribed` on exit, auto-trigger barrier for subscribed sessions |
| `api/main.py` | Register subscriptions router |
| `frontend/src/api/subscriptions.ts` | Create — API client functions |
| `frontend/src/pages/Subscriptions.tsx` | Create — admin list + CRUD UI |
| `frontend/src/components/SubscriptionModal.tsx` | Create — add/edit modal |
| `frontend/src/pages/GateView.tsx` | Modify — handle `is_subscriber=true` in candidate poll; show green-screen state and auto-clear |
| `frontend/src/App.tsx` | Add `/subscriptions` route |
| `requirements.txt` | Add `python-dateutil` |

> **No new `.env` variable is needed for the confidence threshold.** The existing
> `BAR_CONFIDENCE_THRESHOLD` in `.env` (already pinned for the demo) is the only
> gate for candidate visibility. Subscriptions are checked after the candidate passes
> that gate.

---

## Testing Checklist

- [ ] Create WEEKLY subscription → end date = start + 7 days
- [ ] Create MONTHLY subscription on Jan 31 → end date = Feb 28 (not Mar 2)
- [ ] Create YEARLY subscription on Feb 29 (leap year) → end date = Feb 28 next year
- [ ] Expired subscription → `check/{plate}` returns `has_active_subscription: false`
- [ ] Deactivated subscription → same as expired
- [ ] Two subscriptions for same plate → API rejects creating overlapping active
      subscriptions for the same plate; only the active one returned on check
- [ ] Plate at confidence ≥ BAR_CONFIDENCE_THRESHOLD + active subscription →
      candidate API auto-creates session (is_subscribed=True, amount_due=0),
      triggers barrier, returns is_subscriber=true in candidate response
- [ ] Plate at confidence ≥ BAR_CONFIDENCE_THRESHOLD, no subscription →
      normal candidate buffer, worker confirmation flow unchanged
- [ ] Plate below BAR_CONFIDENCE_THRESHOLD → not sent to API at all (camera_loop
      log shows "NOT sent: confidence below threshold"), subscription check never runs
- [ ] Exit for subscribed session → amount_due=0, barrier fires automatically,
      no fee input required from worker
- [ ] Exit for non-subscribed session → normal fee calculation, manual confirmation
- [ ] barrier_events row written with correct gate_id and trigger_type for both
      AUTO_SUBSCRIBER and AUTO_SUBSCRIBER_EXIT triggers

---

## Acceptance Criteria

1. Admin can create a subscription in under 30 seconds via the UI with no technical
   knowledge.
2. End date is always calculated server-side (not just client-side) to prevent tampering.
3. A subscriber car whose plate passes `BAR_CONFIDENCE_THRESHOLD` triggers:
   barrier open + session log with `is_subscribed=True` and `amount_due=0` — with
   **zero worker input**.
4. The Gate UI shows a clear full-screen green state when a subscriber is auto-processed.
   If the barrier hardware fails, it shows a yellow warning instead.
5. Non-subscribers are completely unaffected — the existing manual confirmation flow is
   unchanged.
6. The subscriptions list is searchable by plate and filterable by status
   (active / expired / all).
7. Subscription history (old/expired records) is preserved and viewable.
8. Every barrier trigger — including AUTO_SUBSCRIBER and AUTO_SUBSCRIBER_EXIT — is
   recorded in `barrier_events` with the correct `gate_id`.
