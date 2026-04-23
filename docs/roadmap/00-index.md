# ALPR Parking System — Feature Roadmap

> **Status:** Planning  
> **Last updated:** 2026-04-22  
> **Prepared by:** Engineering + Product

---

## Overview

This roadmap covers the four new requirements added after the initial MVP plan
(`docs/ALPRv2.md`). Each requirement has its own detailed document. They are ordered
by **build dependency**: each item is a prerequisite for the next. Do not start a later
item until the earlier one is complete and tested.

---

## Execution Order

| # | Document | Requirement | Estimated Effort | Blocks |
|---|----------|-------------|-----------------|--------|
| 1 | [01-database-flexibility.md](01-database-flexibility.md) | SQLite + PostgreSQL dual support | 0.5 day | Everything |
| 2 | [02-barrier-hardware-control.md](02-barrier-hardware-control.md) (+ [02_1 supplement](02_1-barrier-hardware-control.md)) | Hardware barrier/gate control + gates / camera loop | 2 days | Subscriptions |
| 3 | [03-subscription-plans.md](03-subscription-plans.md) | Weekly / monthly / yearly subscriptions | 3 days | — |
| 4 | [04-camera-management.md](04-camera-management.md) | In-app camera registration UI | 2–3 days | — |
| 5 | [05-windows-packaging.md](05-windows-packaging.md) | Windows executable & easy launcher | 3–4 days | — |

**Total estimated effort: 11–13 engineering days**

---

## Why This Order

1. **Database flexibility** is the foundation. Every model, migration, and data access
   pattern must be correct before we add new tables (subscriptions, cameras) or run
   integration tests. Getting this wrong would force rewrites later.

2. **Barrier hardware control** is an independent hardware-integration layer. It must
   exist before subscriptions can work end-to-end, because the subscriber auto-open
   feature requires a real barrier signal — not just a UI prompt.

3. **Subscription plans** depend on both a stable DB layer and a working barrier
   controller. Once those two are solid, the subscription logic is purely
   additive (new table, new endpoints, modified gate flow).

4. **Camera management** depends on the DB layer (camera registry) but is otherwise
   independent of subscriptions and the barrier. It can be built in parallel with item 3
   if two developers are available; otherwise build it after.

5. **Windows packaging** is the last step. It validates that the entire integrated
   system — DB, barrier, subscriptions, cameras, frontend — runs cleanly as a
   self-contained Windows binary. No new features are added at this stage.

---

## Key Architectural Decisions (already confirmed)

| Topic | Decision |
|-------|----------|
| Barrier open for subscribers | Hardware signal **+** UI green-screen indicator |
| Subscriber entry flow | Fully automatic (no worker button press needed) |
| Database | **Both SQLite and PostgreSQL** supported; toggled by env variable |
| Cameras per machine | Flexible — N cameras per machine, configured via UI |
| Windows delivery | Portable folder + optional installer; zero technical knowledge required |

---

## Non-Goals (still out of scope)

- Online payment processing
- Cloud / remote dashboard
- Mobile app
- Role-based access control (RBAC) with login
- Multi-site synchronisation
