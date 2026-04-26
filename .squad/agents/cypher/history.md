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

### 2026-04-22 — Bug evidence capture (PR #15 follow-up, 3 bugs)

**Task:** Investigate 3 reported bugs WITHOUT fixing them. Gather evidence (screenshots, code citations, data dumps).

**Reported bugs:**
1. Panel + Movements screens: category/subcategory columns show raw ULID strings instead of human names.
2. Saldo chart: "Sin categoría" text appears in EN locale (should be i18n'd).
3. Saldo chart: bar heights not proportional to income/expense numbers.

**Approach taken:**
- Playwright for Electron IS set up (`@playwright/test` in devDeps, `tests/e2e/smoke.spec.ts` exists).
- However, unit-level evidence was faster and sufficient for bugs #1 and #2.
- Created `app/src/core/query/evidence-pr15.test.ts` to query seeded data and dump category resolution + saldo chart data.
- **Limitation discovered:** Unit tests run against empty read model (bootstrap seeds only happen in main process at runtime).
- Pivoted to **code evidence** (grep + line citations) instead of runtime data dumps.

**Outcomes:**
- **Bug #2 CONFIRMED (100%):** `app/src/core/query/saldo.ts:38` hardcodes `const UNCATEGORIZED_LABEL = 'Sin categoría';` (not i18n'd). Grep evidence saved to `.squad/evidence/bug2-grep-evidence.txt`.
- **Bug #1 CODE CONFIRMED:** Fallback logic in Panel/Movements screens (`categoryNameById.get(row.categoryId) ?? row.categoryId`) will display raw IDs if lookup fails. Cannot confirm runtime behavior without E2E or manual test with seeded data.
- **Bug #3 CANNOT CONFIRM:** Chart scaling math looks correct (`scaleBar` function computes proportional heights). May be a data issue (NET vs separate income/expense bars) or visual perception. Needs E2E screenshots + bar height dumps.

**Evidence deliverables:**
- `.squad/evidence/bug1-category-resolution.txt` (unit test, empty model)
- `.squad/evidence/bug2-hardcoded-spanish.txt` (unit test, empty model)
- `.squad/evidence/bug2-grep-evidence.txt` (grep context for hardcoded string)
- `.squad/evidence/bug3-chart-data.txt` (unit test, empty model)
- `.squad/decisions/inbox/cypher-saldo-3bug-evidence.md` (comprehensive summary)
- `tests/e2e/evidence-pr15.spec.ts` (E2E spec drafted but not executed)

## 2026-04-25 — PR #26 Fix Assignment (WI-23 Projection Unification)

**Assigned:** Fix `scripts/perf-seed.mjs:183` legacy `account.created` envelope + add load-replay smoke check.

**Blocker context:** Neo's review identified that perf-seed script is half-migrated. Categories and tags already use flat `CategoryCreated` / `TagCreated`, but accounts still emit legacy enveloped shape. Post-merge, boot-guard would reject these on app boot, breaking perf gate.

**Required work:**
1. Replace `for (const acc of ACCOUNTS)` block with flat `AccountCreated` shape (per `devSeed.ts:703–716`)
2. Include new `sortOrder: ACCOUNTS.indexOf(acc)`, preserve id
3. Add smoke step to `perf-measure.ts` — `JsonFileEventLog.load()` on seeded NDJSON, assert no throw
4. Re-run `npm run perf:seed && npm test` locally

**Reviewer Rejection Lockout enforced:** This fix routed to Cypher (not @copilot per original PR author, not Morpheus per conflict-resolver exclusion).

**Status:** Awaiting implementation.

### 2026-04-25 — PR #46 verification + merge (post-Neo-review)

Verified @copilot's fix commit 91d3fc3 addressed all 3 of Neo's CHANGES_REQUESTED items. Ran gate locally on Windows: 418ms median vs 1500ms budget (3.6× headroom). Approved + squash-merged via `gh pr merge --squash --delete-branch --auto`. Umbrella #39 closed. Reviewer Rejection Lockout honoured. See `.squad/decisions.md` §"2026-04-25: Neo PR #46..." for full details. Skill written: `.squad/skills/perf-gate-verification/SKILL.md`.

**Test infrastructure gaps identified:**
- E2E tests require `npm run build` first (dist/main/index.js must exist).
- No `playwright.config.ts` existed; created minimal config.
- Unit tests cannot access seeded data (bootstrap happens in main process, not test environment).
- For future bug repros: E2E with Playwright-for-Electron is the right tool, but requires built app + longer setup time.

**Commands that worked:**
- `npm run build` — builds main + renderer bundles (4.3s + 5.7s).
- `npm test -- evidence-pr15` — runs unit tests matching pattern.
- Grep for literals: `Get-Content <file> | Select-String -Pattern "<text>" -Context 2,2`

### 2026-04-23 — WI-23 perf-seed unification + load-replay smoke gate (commit bc11c1f, PR #26 fix)

**Context:** Neo rejected PR #26 — `scripts/perf-seed.mjs:183` emitted legacy `account.created` envelope post-WI-23 unification. Boot-guard would refuse with `LEGACY_EVENT_TYPE_REJECTED`. CI missed it because perf gate runs on `main` only.

**Fix applied:**
1. **Unified all config event envelopes in perf-seed:**
   - `account.created` (nested payload) → `AccountCreated` (flat WI-23 shape with `sortOrder`)
   - Added missing `sortOrder` to `CategoryCreated` and `TagCreated` events
   - All config events now match `devSeed.ts` canonical shape

2. **Created permanent load-replay smoke gate:**
   - `app/src/core/eventLog/event-log-smoke.test.ts` (5 test cases)
   - Runs `npm run perf:seed --count=100`, loads output through `JsonFileEventLog.load()`
   - Fails if boot-guard rejects any event (catches legacy types)
   - Validates all `AccountCreated`/`CategoryCreated`/`TagCreated` events have `sortOrder`
   - Explicitly tests legacy event rejection (negative case)
   - **Runs on every PR** (part of `npm test`), so future schema migrations fail the PR gate, not main

**Outcome:**
- All 552 tests pass (+5 new smoke tests)
- Lint + format clean
- `npm run perf:seed` produces 144 valid events that load cleanly through boot-guard
- Pattern is reusable: any future schema migration that adds required fields to event types should add a similar load-replay test

**Pattern (event schema migration gates):**
1. When adding required fields to event types (e.g., `sortOrder` in WI-23), update ALL event producers:
   - Main seeder (`devSeed.ts`)
   - Perf seeder (`scripts/perf-seed.mjs`)
   - IPC handlers that emit those event types
2. Add a load-replay smoke test that:
   - Generates seed data (use small N for speed: 100 tx is plenty)
   - Loads through the actual EventLog implementation (catches Zod validation failures)
   - Validates the new required fields are present
   - Runs on PR branches (not just `main`)
3. If the schema change is breaking (legacy events should be refused), add boot-guard validation:
   - Explicit rejection in `JsonFileEventLog.load()` with a custom error code
   - Negative test case that verifies legacy events ARE rejected


### 2026-04-25 — PR #46 perf-budget gate verified (commit 91d3fc3, post-Neo-review)

**Task:** Verify @copilot's revision commit fixes Neo's 3 CHANGES_REQUESTED items on the Playwright perf-budget gate. Reviewer Rejection Lockout in effect — independent verification required.

**What I checked in the diff:**
1. `args: ['.']` (was `['dist/main/index.js']`) at `tests/e2e/movements-perf.spec.ts:73` — correct, makes `app.getName()` resolve to `opentreasury-desktop`.
2. `BUDGET_MS = 1500` at spec L12 — matches Neo's ask.
3. `timeout: 240_000` at `playwright.config.ts:27` — plus explicit `workers: 1`.
4. Selector audit:
   - `nav[aria-label="Primary"]` matches `AppShell.tsx:182`.
   - `table.ot-table tbody tr:not([aria-hidden="true"])` correctly excludes the virtualised padding spacers in `Table.tsx` (lines 229, 242 carry aria-hidden=true; data rows do not).

**Local gate run (Windows, 5000-tx seed):**
`npx playwright test tests/e2e/movements-perf.spec.ts --reporter=list`
- run 1: 353 ms, run 2: 461 ms, run 3: 418 ms
- **median = 418 ms** vs budget 1500 ms (3.6× headroom)
- 1 passed in 35.8 s, no timeouts, seed wrote 5044 events to %APPDATA%\opentreasury-desktop\perf-events\events.ndjson

**Outcome:** Approved + auto-merged via `gh pr merge 46 --squash --delete-branch --auto`. No corrections pushed — fix commit was complete. Umbrella #39 already closed.

**Pattern (now lives at `.squad/skills/perf-gate-verification/SKILL.md`):**
- The Electron-launch gotcha (`args: ['.']` vs `['dist/main/index.js']`) is a real foot-gun: tests fail as "selector not found" not "perf regression," misleading the reader. Always launch via package.json `main`.
- For cold Electron launches, global Playwright `timeout` must cover RUNS × worst-case cold-start. `240_000` for 3 runs is the right ballpark.
- Day-1 budget should be `observed_median × 2`. Tighten to `× 1.5` after one week of CI data.
- Verification ≠ reading the diff — always run the gate locally and capture all three timings + median for future calibration.

**Commands that worked:**
- `git fetch origin <branch> && git checkout <branch> && git pull`
- `npm run build` (~12 s) — required before E2E since main bundle must exist.
- `npx playwright test tests/e2e/movements-perf.spec.ts --reporter=list`
- `gh pr review 46 --approve --body-file <f>` then `gh pr merge 46 --squash --delete-branch --auto`

### 2026-04-25 — PR #51 resolution (WI-23 legacy fixture gate)

**Context:** PR #51 (`test/wi23-legacy-fixture-gate`) added two test cases to `event-log-smoke.test.ts`: (1) legacy-fixture backfill validation, (2) enveloped-shape rejection test. Morpheus's PR #50 (WI-23 legacy backfill) was merged to main between when I drafted #51 and when Pedro requested rebase.

**Conflict analysis:**
- Main (post-#50): Contains all 7 tests including BOTH of my additions from #51
- My branch: Same 7 tests with minor comment wording variation (no functional diff)
- Diff: 4-line comment change only

**Resolution:** Closed PR #51 as subsumed by #50. Morpheus's PR already included the tests I added (likely coordinated since we were both working on the WI-23 legacy compatibility gap). No merge needed — main already has all coverage.

**Validation:** Ran `npx vitest run --pool=forks --poolOptions.forks.singleFork=true app/src/core/eventLog/event-log-smoke.test.ts` on main — all 7 tests pass (1284ms).

**Outcome:** Branch deleted. No update to `.squad/skills/event-schema-migration-gate/SKILL.md` needed — the skill already documents the two-path pattern (fresh seed + legacy fixtures) that PR #50 implemented.

**Learning:** When working on test coverage for coordinated work (Morpheus fixing, me validating), check main frequently during rebase. This wasn't a conflict — it was convergence.

### 2026-04-25 — PR #51 + #50 reconciliation (test coordination, merged)

PR #51 (wi23-legacy-fixture-gate tests) closed as redundant — PR #50 already included both test cases I was proposing (fresh seed + legacy fixture smoke gate). Morpheus and I converged on the same solution independently. Branch deleted. Orchestration log + merge-train summary logged to `.squad/orchestration-log/` and `.squad/log/`.

### 2026-04-29 — SPEC-023 Split Transactions — Wave 1 Anticipatory Test Plan (PR #62, issue #59)

**Task:** Create anticipatory e2e test plan + skeleton test files for Split Transactions BEFORE Morpheus's IPC implementation lands (parallel worktree).

**Deliverables (all in worktree C:\rettx\opentreasury-desktop-59-tests, branch squad/59-split-tests):**
1. `tests/e2e/SPLIT-TRANSACTIONS-TEST-PLAN.md` — comprehensive test taxonomy mapping all 15 SPEC-023 acceptance criteria to test scenarios
2. `tests/e2e/split-transactions.spec.ts` — 30+ skeleton e2e tests (HP/EC/BC/UX scenarios)
3. `tests/e2e/split-transactions-bulk.spec.ts` — error states, aggregations, bulk update interactions
4. `tests/unit/split-cents.test.md` — unit test plan for cents arithmetic (actual unit tests will be in Morpheus's reducer files)

**Test Taxonomy Created:**
- **Happy Path (HP-01 to HP-07):** Basic split flows — create 2-part/3-part splits, badge visibility, totals strip aggregation, category filter, remove split, offline operation
- **Edge Cases Cents (EC-01 to EC-06):** Integer cents validation — 33+33+34=100 ✅, 33+33+33=99 ❌, negative amounts, zero-child rejection
- **Boundary Conditions (BC-01 to BC-08):** Min 2 splits, max 20 splits, 500-char comment limit (499/500/501), nullable categories
- **Error States (ES-01 to ES-07):** Parent amount edit rejection (`TX_HAS_ACTIVE_SPLITS`), bulk update skip logic, delete parent cascades to splits
- **UI/UX (UX-01 to UX-07):** Keyboard nav, ARIA live regions, focus trap, i18n ES+EN, running total updates, save-button-disabled-until-valid
- **Aggregations (AG-01 to AG-05):** Movements totals strip, Saldo category breakdown, Panel — all use split amounts NOT parent amount (FR9)
- **CSV Export (EX-01 to EX-02):** Wave 3 future feature — one row per child, parent envelope not exported (SPEC-023 §6.6)

**Pedro's 6 Locks — Test Coverage:**
1. ✅ Integer cents — children sum EQUALS parent in cents (EC-01 to EC-06, unit tests)
2. ✅ Parent amount edit rejected when split exists (ES-01, ES-02)
3. ✅ Bulk update skips split parents — reports skip count (ES-03, ES-04)
4. ✅ M1 — no crypto assumptions (all tests plaintext-only)
5. ✅ CSV export one row per child (EX-01, EX-02 — Wave 3)
6. ✅ 500-char limit on child comment (BC-05, BC-06, BC-07)

**Performance Budget Note:**
- Test plan includes PERF-01 for Wave 2: validate split-heavy dataset (500 split parents, 1500 split records) doesn't regress MovementsScreen 1500ms mount budget
- Risk: split badge rendering + `hasSplits` checks. Mitigation: `splitParentIds` is a Set (O(1)), virtual table already handles 5000 rows efficiently

**All Tests Skipped with Wave 2 Notes:**
- Used `test.skip(true, 'Awaiting Wave 2 IPC wiring')` on all test bodies
- Each test includes detailed Wave 2 wiring notes as comments:
  - IPC channel to call (`tx:split`, `tx:split:remove`, `tx:split:get`)
  - Expected payload/response shapes
  - Assertions to wire (badge visibility, totals strip values, error codes)
- Lint clean (removed unused `expect` and `electron` imports from skipped tests)

**Open Questions for Wave 2 (documented in test plan):**
1. **Final IPC error codes:** Placeholder assumptions — `SPLIT_SUM_MISMATCH`, `MIN_SPLITS_REQUIRED`, `MAX_SPLITS_EXCEEDED`. Awaiting Morpheus's actual codes.
2. **Negative split amounts:** Spec doesn't explicitly address debits. Assumption: sign propagates from parent (test EC-05 flags this).
3. **Zero-amount splits:** Spec says `positive()` constraint. Confirm zero is rejected.
4. **Floating-point parent amounts:** What if parent is €1.005 (3 decimals from import)? Document rounding rule.

**Pattern — Anticipatory Test-Driven Development:**
- **Why it works:** Writing tests before implementation forces clarity on acceptance criteria, surfaces ambiguities early, and creates a clear wiring checklist for backend dev.
- **When to use:** Complex features with parallel backend/frontend work where the contract (IPC shape) is stable even if implementation isn't done.
- **When NOT to use:** Exploratory work where the contract is still evolving (would create churn).
- **Split transactions was ideal:** SPEC-023 locked down the IPC contract (§7), event schemas (§6.1), and FR1-FR16 acceptance criteria. Pedro's 6 lock answers removed ambiguity. Tests could be written confidently against stable requirements.

**Gotchas Found:**
1. **Cents arithmetic edge cases are the real test surface:** The sum constraint (FR3) is the critical invariant. Most bugs will be rounding errors (33+33+33≠100). Exhaustive boundary tests (EC-01 to EC-06) + unit tests are essential.
2. **Bulk update skip logic is subtle:** FR15 says skip split parents entirely (not just amount field). Test ES-03 validates the `skippedSplitParentCount` response field — easy to forget in implementation.
3. **Aggregation touchpoints are widespread:** Five query functions must be updated (`effectiveAmounts()` helper pattern). AG-01 to AG-05 ensure no query is missed.
4. **Performance risk is real:** Split badge rendering on 5000-row virtual table could regress mount time. PERF-01 documents the validation step for Wave 2.

**Skills Identified (not yet written):**
- `.squad/skills/anticipatory-test-planning/` — Pattern for writing e2e skeletons before backend lands. Key: stable contract + locked requirements + parallel work.
- **Defer skill creation** until after Wave 2 wiring proves the pattern worked. If tests need major rework post-IPC, the pattern failed.

**Outcome:**
- PR #62 opened against main (NOT merged — awaiting Wave 2)
- Issue #59 commented with summary
- Lint clean, all files committed
- Ready for Neo + Pedro review

**Commands that worked:**
- `git rev-parse --show-toplevel` to verify worktree path
- `npm run lint` to validate skeletons compile
- `gh pr create` with detailed body
- `gh issue comment` to cross-reference PR

**Next Steps (Wave 2 — not my task):**
1. Morpheus lands IPC PR with `tx:split`, `tx:split:remove`, `tx:split:get` channels
2. Remove `test.skip()` from tests
3. Wire IPC calls and assertions per Wave 2 notes in each test
4. Run `npm run build && npm run e2e` to validate
5. Add split-heavy perf seed script (`--split-ratio=0.1`)
6. Run PERF-01 to confirm no budget regression
7. Update test plan with actual IPC error codes (replace placeholders)
8. Merge PR #62 (or squash into Morpheus's PR as joint delivery)
