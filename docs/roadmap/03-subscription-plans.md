# Roadmap Item 3 — Subscription Plans

**Priority:** P2 — Core business feature  
**Estimated effort:** 3 engineering days  
**Depends on:** Item 1 (Database), Item 2 (Barrier Hardware)  
**Blocks:** Nothing (but must be done before delivery)

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
3. The gate entrance flow checks for an active subscription **before** prompting the
   worker. Subscribers bypass worker confirmation entirely.
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
| `is_subscribed` | BOOLEAN | True if session was auto-created for a subscriber |
| `subscription_id` | INTEGER FK → subscriptions.id | nullable |

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

### Check subscription — response (used by ALPR engine at entrance)

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
Camera detects plate
  → candidate pushed to /api/candidate
  → Gate UI polls and shows plate (editable)
  → Worker presses "Confirm Entry"
  → POST /api/sessions/entrance saves session
  → Worker opens barrier manually
```

### New flow with subscription check

```
Camera detects plate (confidence ≥ threshold)
  → ALPR engine calls GET /api/subscriptions/check/{plate}
  │
  ├── Active subscription found:
  │     → POST /api/sessions/entrance (auto, is_subscribed=True, amount_due=0)
  │     → barrier.open()                    ← hardware signal
  │     → POST /api/barrier/events (AUTO_SUBSCRIBER, success/fail)
  │     → Gate UI receives "subscriber_open" event via polling
  │     → UI goes green: "SUBSCRIBER — BARRIER OPENED"
  │     → Auto-resets after 8 seconds
  │
  └── No active subscription (or low confidence):
        → candidate pushed to /api/candidate (existing flow)
        → Worker confirms manually
        → Worker opens barrier manually
```

### Confidence threshold for auto-open

Auto-open should only trigger when OCR confidence is **high**. A misread plate that
matches a subscriber record would open the gate for an unauthorised car — a security
risk. Use a **separate, higher threshold** for subscriber auto-open:

```dotenv
# .env — new variable
SUBSCRIBER_CONFIDENCE_THRESHOLD=0.85   # Must be higher than normal BAR_CONFIDENCE_THRESHOLD
```

If OCR confidence is below this threshold, even a matching plate falls back to the
manual worker confirmation flow (the worker still sees "POSSIBLE SUBSCRIBER" highlighted).

---

## Modified Exit Flow

When the worker (or system) looks up a session by plate at exit:

- If `session.is_subscribed = True`:
  - Display: `₺0.00 — SUBSCRIBER — NO CHARGE`
  - The exit barrier opens automatically via `barrier.open()`
  - Session is closed with `amount_due = 0`, `amount_paid = 0`, `status = PAID`
  - No manual confirmation needed from the worker (same auto-open logic as entrance)

---

## Subscription Status Business Rules

1. A subscription is **active** if: `is_active = True` AND `start_date ≤ today ≤ end_date`.
2. A subscription is **expired** if: `end_date < today` (even if `is_active = True`).
3. An admin can **deactivate** a subscription early (set `is_active = False`).
4. A plate can have **multiple subscriptions** in the database (history of renewals), but
   only one can be active on any given day. The API must enforce this.
5. Renewal = create a new subscription record starting the day after the current end date.
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
(calculated on the frontend — no round-trip needed for display, server recalculates
on save for consistency).

### Gate UI — subscriber badge on entrance screen

When the Gate UI polls `/api/candidate` and the candidate includes a subscription match
(below confidence threshold — worker must still confirm):

```
┌────────────────────────────────────────┐
│  PARKING ENTRANCE                      │
│                                        │
│  Detected Plate:                       │
│  ┌──────────────────────────────────┐  │
│  │  34 ABC 1234              ★ SUB  │  │  ← gold badge
│  └──────────────────────────────────┘  │
│                                        │
│  ★ Monthly subscriber — ends 01 Jun   │
│    Fee: ₺0.00 (subscription)          │
│                                        │
│        [ CONFIRM ENTRY ]               │
└────────────────────────────────────────┘
```

(This state only appears when confidence is **below** `SUBSCRIBER_CONFIDENCE_THRESHOLD`
but a subscription match was found. Worker still confirms. If confidence is above the
threshold, the auto-open flow fires and this screen is never shown.)

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `api/models.py` | Add `Subscription` model; add `is_subscribed`, `subscription_id` to `ParkingSession` |
| `api/schemas.py` | Add `SubscriptionCreate`, `SubscriptionRead`, `SubscriptionCheck` Pydantic schemas |
| `api/routes/subscriptions.py` | Create — all subscription endpoints |
| `api/routes/sessions.py` | Modify entrance/exit logic to check subscriptions |
| `api/main.py` | Register subscriptions router |
| `alpr_engine.py` | Call subscription check before pushing candidate; auto-open logic |
| `frontend/src/api/subscriptions.ts` | Create — API client functions |
| `frontend/src/pages/Subscriptions.tsx` | Create — admin list + CRUD UI |
| `frontend/src/components/SubscriptionModal.tsx` | Create — add/edit modal |
| `frontend/src/pages/GateView.tsx` | Modify — show subscriber badge and green-screen state |
| `frontend/src/App.tsx` | Add `/subscriptions` route |
| `.env` | Add `SUBSCRIBER_CONFIDENCE_THRESHOLD` |
| `requirements.txt` | Add `python-dateutil` |

---

## Testing Checklist

- [ ] Create WEEKLY subscription → end date = start + 7 days
- [ ] Create MONTHLY subscription on Jan 31 → end date = Feb 28 (not Mar 2)
- [ ] Create YEARLY subscription on Feb 29 (leap year) → end date = Feb 28 next year
- [ ] Expired subscription → `check/{plate}` returns `has_active_subscription: false`
- [ ] Deactivated subscription → same as expired
- [ ] Two subscriptions for same plate → only the active one returned; API rejects
      creating overlapping active subscriptions for the same plate
- [ ] Auto-open: plate matches subscriber at confidence ≥ 0.85 → session created,
      `is_subscribed=True`, `amount_due=0`, barrier fires
- [ ] Auto-open: confidence 0.70 (below threshold) → manual confirmation flow,
      subscriber badge shown
- [ ] Non-subscriber plate → normal paid flow, no subscriber badge
- [ ] Exit for subscribed session → `amount_due=0`, barrier fires automatically
- [ ] Exit for non-subscribed session → normal fee calculation, manual confirmation

---

## Acceptance Criteria

1. Admin can create a subscription in under 30 seconds via the UI with no technical knowledge.
2. End date is always calculated server-side (not just client-side) to prevent tampering.
3. A subscriber car at high confidence triggers barrier open + session log with 0 fee,
   with zero worker input.
4. A subscriber car at low confidence shows a clear subscriber badge to the worker,
   who can confirm manually.
5. Non-subscribers are completely unaffected — existing flow unchanged.
6. The subscriptions list is searchable by plate and filterable by status (active/expired/all).
7. Subscription history (old/expired records) is preserved and viewable.
