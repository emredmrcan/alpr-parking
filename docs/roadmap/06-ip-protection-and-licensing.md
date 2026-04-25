# Roadmap Item 6 — IP Protection, Licensing, and Delivery Hardening

**Priority:** P5 — Commercial hardening after stable Windows package  
**Estimated effort:** 2–3 engineering days (requirements + PoC scope definition)  
**Depends on:** Item 5 (Windows packaging) must be complete and stable  
**Blocks:** Commercial rollout at scale (multi-customer distribution)

---

## Problem Statement

The current delivery model ships a fully offline Windows package built from Python
code. This is operationally good, but commercially risky:

1. A packaged Python application can still be reverse-engineered by a determined user.
2. The package can be copied to additional machines without any usage control.
3. There is no formal license policy (duration, machine binding, renewal, violation).
4. There is no customer-specific tracing strategy for leaked binaries.

The business requirement is not "perfect anti-reverse-engineering" (impossible for
offline apps), but **practical protection**: raise extraction cost, control usage, and
reduce unauthorized redistribution.

---

## Goal

1. Define a production-ready **IP protection baseline** for the Windows package.
2. Define an **offline-capable licensing policy** (machine-bound, signed, verifiable).
3. Define legal and operational controls (EULA, per-customer build traceability).
4. Keep the system usable for non-technical clients (no complex activation UX).

This item is requirements/specification only. Implementation is a separate follow-up.

---

## Scope

### In scope (requirements to define)

- Code protection approach and minimum acceptable hardening level.
- Offline license format and verification rules.
- Machine fingerprint policy and tolerated hardware-change rules.
- Expiry/renewal model and support process.
- Tamper/abuse handling policy.
- Packaging and delivery requirements for customer-specific distributions.

### Out of scope (for this item)

- Writing or integrating the actual license-check implementation.
- Building backend licensing servers.
- Writing obfuscation/build scripts.
- Legal contract drafting text (lawyer-owned; engineering provides technical inputs).

---

## Functional Requirements

### R1 — Code hardening baseline

The final distributed package must include at least one code-hardening layer beyond raw
PyInstaller output:

- Obfuscation of Python modules (or compiled replacement for critical modules).
- Exclusion of non-runtime files (training scripts, dev-only artifacts).
- No debug/developer secrets in package.

### R2 — Offline license verification

The app must verify a license without internet:

- License file contains customer metadata + allowed machine scope + validity period.
- License file is cryptographically signed by vendor private key.
- App verifies signature with embedded public key at startup.

### R3 — Machine binding policy

License must bind to a machine fingerprint policy with tolerance:

- Fingerprint should combine multiple hardware traits (not single fragile value).
- Define acceptable drift (e.g., RAM/disk replacement should not always invalidate).
- Define manual reissue/support fallback for genuine hardware changes.

### R4 — Expiry and grace rules

Must define and document:

- Perpetual vs term license model per customer type.
- Grace behavior on expiry (hard stop vs warning period).
- Operator-facing messages for invalid/expired license.

### R5 — Per-customer traceability

Each delivered package must be uniquely traceable:

- Build metadata includes customer/license ID.
- Package contains non-invasive watermark identifier (not user-visible in normal flow).
- Support can map leaked package back to delivery record.

### R6 — Safe failure mode

On license validation failure:

- App must fail safely (no barrier action side-effects).
- Error state should be clear and recoverable by support steps.
- Audit log entry should be generated with failure reason.

---

## Non-Functional Requirements

### N1 — Performance

License check overhead must be negligible:

- Startup validation target: < 500 ms average on typical Windows laptop.
- No recurring heavy checks in hot camera loop.

### N2 — Reliability

- License check must not require internet.
- Clock-skew handling policy should be defined (small tolerance window).
- Corrupted license file handling must be deterministic and user-friendly.

### N3 — Maintainability

- Key rotation process must be defined.
- Build pipeline steps for customer-specific packaging must be documented.
- Emergency reissue workflow must be documented for field support.

### N4 — Security baseline

- Private signing key never stored in client package.
- Public key embedding location documented.
- Tamper checks must produce explicit reasons (signature mismatch, expired, machine mismatch).

---

## Candidate Solution Directions (to evaluate)

1. **Obfuscated Python + signed offline license**  
   Lowest implementation risk, fastest rollout.

2. **Compiled critical modules (Cython/Nuitka) + signed offline license**  
   Better IP hardening, medium complexity.

3. **Hybrid: compiled core + obfuscated shell + signed offline license**  
   Strongest protection in offline-first model, highest complexity.

Decision criteria:

- Time to ship
- Operational support burden
- Reverse-engineering cost increase
- Stability risk for Windows deployment

---

## Acceptance Criteria

1. A written technical spec exists for code hardening, licensing format, and support workflow.
2. A signed license can be validated offline in a prototype flow definition.
3. Machine-binding policy and hardware-change tolerance are explicitly documented.
4. Customer-specific package traceability requirements are documented.
5. Failure/expiry UX requirements are documented for non-technical operators.
6. Implementation backlog (separate tasks) is created with risk and priority.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Overly strict machine binding causes support load | High | Define tolerance + reissue workflow before implementation |
| Obfuscation breaks runtime behavior | Medium | Start with PoC build on reference Windows machine |
| False sense of "perfect protection" | High | Document realistic threat model and expected limits |
| Key management mistakes | High | Keep signing key offline and define rotation policy |

---

## Deliverables (for this roadmap item)

- Technical requirements document (this item).
- Chosen approach decision memo (option 1/2/3 above).
- Implementation backlog for next roadmap item.
- Support runbook outline (activation, reissue, expiry handling, troubleshooting).
