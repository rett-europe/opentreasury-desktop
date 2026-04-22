# Project Context

- **Owner:** Pedro (perocha)
- **Project:** OpenTreasury Desktop — Electron-based treasury management for NGOs. Desktop version of the cloud-based rett-europe/opentreasury, designed to work without complex cloud setup.
- **Stack:** Electron (frontend), rest TBD. Reference app: Angular 19 + Python FastAPI + Cosmos DB + Entra ID on Azure.
- **Created:** 2026-04-19

## Core Context

**WI-17 Implementation & Security Hardening SHIPPED (2026-04-20, commit a97d21e)**
- Main-side import: 4 IPC handlers, 2 events, utilities (24 tests green)
- Renderer: 6-step import wizard, service layer (6 tests green)
- Security: All 6 Switch conditions applied (pathGuard, sessionFileRegistry, exceljs swap, fileId tokens, row-cap, parser safety)
- Total: 175 tests passing, typecheck+lint+format clean
- **Your next task (WI-17.4):** E2E tests (50-row CSV import, duplicate detection re-import, error handling with invalid dates). See `.squad/decisions.md` §"WI-17 Implementation & Security Hardening" for full acceptance criteria.

## Key Reference

Testing considerations for a financial desktop app:
- Financial rounding and precision (currency amounts)
- Date boundary handling (month transitions, year-end)
- Import/export data fidelity (Excel/CSV round-trips)
- Concurrent access patterns (if multi-window)
- Data integrity under crash scenarios (local DB)
- RBAC enforcement (Admin vs Viewer)
- Audit trail completeness

**WI-17 Orientation (2026-04-20):** Import wizard e2e test specs ready. Niobe's UX spec + Neo's technical spec provide the test surface. Your tasks for WI-17.4 (integration + UX smoke tests): (1) Build 3 Playwright e2e tests — import 50-row CSV (verify 50 movements in list), re-import same CSV (verify dry-run shows 50 duplicates, commit skips all), import with 5 invalid dates (verify dry-run shows 5 errors, commit imports 45 valid). (2) Create test fixtures (50-row CSV + XLSX samples under `test/fixtures/`). (3) Validate on Windows + macOS. See decisions.md §"WI-17 v2" §"Scope decomposition" for full acceptance criteria WI-17.4.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-04-22 — WI-22 Saldo property test verified (commit 255b0f8, PR #7)

**Verification complete:** 510 fast-check property-test iterations across 8 invariants + 6 boundary cases. All green. INVARIANT HELD — no shrunk counterexample. Morpheus' aggregation is provably sound.

**Invariants:** I1–I4 (internal consistency), I5–I6 (monthly series consistency, no projection drift), I7 (prior-period brute-force), **I8 (Saldo ≡ Movements — critical equivalence)**.

**Boundary cases pinned:** Leap-day collapse, UTC boundaries, day-1 projection, period-end, zero events, same-month-prior-year semantics.

**Skill drafted:** `.squad/skills/property-testing-aggregations/` — pattern (on-demand read-model aggregation + period resolver + brute-force reference) is reusable for Panel, Movements, any future aggregation query.

## 2026-04-19 — Team Context Update (from Scribe)
- ADR-001 (Proposed) at `docs/architecture/adr-001-tech-stack.md` — Neo recommends Option A (React+TS, append-only event-sourced JSON, `age` encryption).
- Security Requirements v0.1 at `docs/security/security-requirements-v0.1.md` — Switch: 20 requirements, 15 stack constraints, 8 accepted risks, 6 open questions for Pedro.
- Both are team context now.

### 2026-04-19: Crypto spec v1.0 + ADR-001 Accepted
Crypto spec v1.0 at `docs/security/crypto-spec.md`. Security Requirements bumped to v0.2. ADR-001 Accepted with conditions C1–C15. Every implementation ticket must cite the C1–C15 condition(s) it satisfies.

## 2026-04-19 — Team update (via Scribe)
Roadmap v1 + 3 PRDs drafted (Link). Tests layout is one of Neo's 5 open questions in ADR-002 (recommended: hybrid — co-located *.test.ts for unit + separate 	ests/integration/ and 	ests/e2e/). Niobe's flow skeletons at docs/ux/flows/ (first-run, device-enrollment, movements-date-range) will drive E2E test scenarios.

### 2026-04-19: Test plan implications
- No pending-state test cases needed (product has no pending concept).
- **i18n testing (ES + EN) required from M1** — both locales populated as each feature ships; CI `missing key` lint from M1.
- Hybrid tests layout confirmed (ADR-002): unit co-located as `*.test.ts`; `app/tests/integration/` and `app/tests/e2e/` as separate trees.


### 2026-04-19: Vitest (unit, co-located) + Playwright (E2E in tests/e2e/) configured. tests/integration/ ready for integration tests. Smoke test stub in tests/e2e/smoke.spec.ts.


### 2026-04-19: Scaffold GREEN (team note from Scribe)
You can clone, `npm install --legacy-peer-deps`, and run: `npm run typecheck`, `npm run lint`, `npm test`. First real feature work can begin against feat/app-scaffold-and-i18n-adr once merged to main.

## Cross-agent update (Scribe, 2026-04-19T10:34:16Z)
Wave 1 UX COMPLETE. Acceptance criteria sections in each spec give you testable statements for E2E test derivation.

## 2026-04-22 — WI-22 Saldo property test (commit 255b0f8, PR #7)

**Outcome:** INVARIANT HELD. 510 fast-check runs + 6 boundary unit tests green against Morpheus' backend. Test count 436→446.

**Pattern (reusable for any read-model aggregation):**
1. Generator yields randomized EVENT logs (create/update/delete), not just entities — closer to what the reducer sees.
2. Project events to entities inline in the test (don't couple to production reducer — duplication IS the test).
3. Brute-force reference impl in the same file, one loop + range check. Intentionally NOT sharing code with the unit under test.
4. Amounts as integer cents; compare with strict === after Math.round(x*100). Avoids float tolerance wobble — saldo's round2 is idempotent on 2dp inputs.
5. Include a `now` arbitrary so projection/isPartial gets fuzzed too. Don't only test the "period complete" path.
6. Pair property blocks with deterministic boundary unit tests — property tests are statistical, corners need explicit pins (leap day, UTC midnight, daysElapsed=1, daysElapsed=daysInPeriod, empty period).

**Gotcha found (not a bug — live behaviour):** when the current period is partial AND has zero events, `currentProjectedTotal` is `{income:0, expense:0}` (populated, not null). Null is reserved strictly for `isPartial=false`. Asserted explicitly in the zero-events boundary test so future refactors can't silently flip it.

**Gotcha (lint):** `import fc from 'fast-check'` triggers `import/no-named-as-default-member` at max-warnings 0. Use `import * as fc from 'fast-check'`.

**fast-check added as devDependency ^4.7.0.** No other scaffolding touched.
