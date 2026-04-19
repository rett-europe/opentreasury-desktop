# Project Context

- **Owner:** Pedro (perocha)
- **Project:** OpenTreasury Desktop — Electron-based treasury management for NGOs. Desktop version of the cloud-based rett-europe/opentreasury, designed to work without complex cloud setup.
- **Stack:** Electron (frontend), rest TBD. Reference app: Angular 19 + Python FastAPI + Cosmos DB + Entra ID on Azure.
- **Created:** 2026-04-19

## Key Reference

The cloud version's backend (Python FastAPI) features:
- Cosmos DB NoSQL containers: transactions (partitioned by YYYY-MM), categories, reference_data (tags + bank accounts), audit_log
- RBAC: Admin (full read/write), Viewer (read-only)
- Soft deletes — financial data never permanently lost
- Audit trail on all changes (7-year TTL in cloud)
- Excel/CSV import and export endpoints
- Transaction CRUD with category/subcategory/tag associations
- Multi-account support

The desktop version needs equivalent functionality with local persistence (no cloud DB).

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

## 2026-04-19T18:56:23Z — WI-12 shipped: IPC contract frozen (transaction:create + movements:list)

**Status:** Completed — both main-side handlers + preload surface + 11 tests green.

Morpheus delivered WI-12 main-side IPC bridge (transaction:create handler, movements:list handler, ULID generation, preload namespaces). Contract finalized and locked. Trinity's renderer clients (transactionApi, movementsApi) integrate against this contract. Next: WI-13 (Add-Transaction modal) ready to spawn. No further contract changes until WI-14 (Panel invalidation event bus).

## 2026-04-19T16:14:07Z — TEAM DECISION: Panel-first unlock for M1 → M1.25 Saldo (from Scribe)

**Link + Neo agreed:** Shift M1 implementation sequence to Panel → Movements (not Movements → Panel).

**Why this changes your sprint:**
- **Your next task:** Core query surface design + IPC contract for Panel (1–3 days). Read-only queries only — `queryRecentMovements(limit, offset)` sorted DESC by created_at.
- **Panel scope:** recent-txs table + totals strip. Zero forms, zero command-side wiring. Pure read-model.
- **After Panel:** Command-side Movements wiring (accounts, categories, mutations) in M1+1 *after* Panel ships and proves the event-sourced core.
- **Saldo:** defers to M1.25. Same data layer, different query surface.

**Rationale:** Panel is read-only (no user-input validation), has no empty-state gate (renders even with 0 txs), and validates the entire data layer on the simplest code surface. Once Panel renders from real encrypted events, the team knows: OneDrive read works, crypto decrypt works, event-sourced read-model works, IPC contract is sound. All proved before Movements' complex command-side wiring.

**Your M1 exit gate (redefined):** Account creation → Tx entry → Panel visibility (not "three full-featured views"). Movements structure complete; command wiring in M1+1.

**Work breakdown (1 sprint):**
- Phase 1a (2–3 days): finalize `core/query/` interface. Gate: Vitest 100%, fixtures in-memory.
- Phase 1b (1 day, coordinated with Trinity): IPC contract. Zod schema in `app/src/shared/ipc-schemas.ts`. Gate: IPC round-trip vitest.
- Phase 1d (3–4 days, coordinated with Switch): Crypto wiring for reads. Load DEK from keychain via `@napi-rs/keyring`. Decrypt events on main-process read path. Gate: Switch reviews; vitest envelope round-trip + keychain mocks.
- Phase 2 (parallel / M1+8–12 days): Command-side Movements. `core/commands/` for `tx.created`, `account.created`. Implement `core/reducers/` for command-side projections.

**Unblocked for you:**
- No waiting on complex Movements form state.
- Panel IPC can land in main by M1+5 days.
- Movements command-side design can happen in parallel once Panel proves the read-model.

See `.squad/decisions.md` § "Panel-First Unlock" for full rationale + work packages + Phase 1 details.

## 2026-04-19 — Team Context Update (from Scribe)
- ADR-001 (Proposed) at `docs/architecture/adr-001-tech-stack.md` — Neo recommends Option A (React+TS, append-only event-sourced JSON, `age` encryption).
- Security Requirements v0.1 at `docs/security/security-requirements-v0.1.md` — Switch: 20 requirements, 15 stack constraints, 8 accepted risks, 6 open questions for Pedro.
- Both are team context now.

### 2026-04-19: Crypto spec v1.0 + ADR-001 Accepted
Crypto spec v1.0 at `docs/security/crypto-spec.md`. Security Requirements bumped to v0.2. ADR-001 Accepted with conditions C1–C15. Every implementation ticket must cite the C1–C15 condition(s) it satisfies.

## 2026-04-19 — Team update (via Scribe)
ADR-002 repo structure **Proposed** (Neo) — strict main/preload/renderer boundary enforcement (ESLint import/no-restricted-paths + TS project refs + CI grep). core/, crypto/, storage/ modules are Electron-free for unit-testing and single-pass Switch audit. docs/specs/_template.md is the canonical SDD template with mandatory Traceability section. Roadmap v1 at docs/product/roadmap-v1.md — M1 = single-user happy path on prototype's 3 canonical screens. Three PRDs drafted (movements/saldo/panel). Niobe's 12 UX gaps and 3 flow skeletons frame your upcoming work.

### 2026-04-19: Product + architecture updates
- **Transactions model has NO pending state** — always confirmed, imported from bank/PayPal statements (CSV) or manually entered as confirmed.
- **i18n is M0 (day 0)** — Spanish + English from v1.
- **ADR-002 ACCEPTED** — npm, no monorepo tool, strict TS (+ `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`), flat `app/`, hybrid tests. `app/` scaffolding is the next PR.


### 2026-04-19: ADR-003 accepted -- react-i18next. app/ scaffolded on branch feat/app-scaffold-and-i18n-adr. Flat layout, strict TS. After Pedro runs npm install and lockfile lands on main, first real feature work targets PRD-001 Movements against crypto-spec section 11.


### 2026-04-19: Scaffold GREEN (team note from Scribe)
You can clone, `npm install --legacy-peer-deps`, and run: `npm run typecheck`, `npm run lint`, `npm test`. First real feature work can begin against feat/app-scaffold-and-i18n-adr once merged to main.
### 2026-04-19 — From Scribe: Wave 1 UX specs batch 1 landed
- Draft v0.1. Batch 2 (screens) arriving shortly.


## Cross-agent update (Scribe, 2026-04-19T10:34:16Z)
Wave 1 UX COMPLETE - all 6 specs Draft v0.1. Implementation specs/tickets can anchor to these. Every spec has a Traceability Matrix mapping to PRDs/ADRs/R-series/C-series/crypto sections.

## 2026-04-19T16:49:03Z — Team Update: WI-1/2 complete, Panel-first Wave 1 shipped

**What shipped:**
- ✅ **WI-1 complete:** Event-sourced read model (commits 0f427fe, cf30e92)
  - Zod schemas, entity types, reducers, 5 query functions
  - Vitest 100% coverage with realistic ULID fixtures
  - Cloud reference study: field mapping + deviations logged

- ✅ **WI-2 complete:** IPC contract + mock handlers
  - TypeScript types exported for Trinity's use
  - Zod request/response schemas locked
  - Mock handlers return deterministic fixtures

- ✅ **Pedro approved Q1–Q6:**
  - Q3 refined: Cloud schema mirroring; deviations logged in docs/schemas/cloud-reference-notes.md
  - Q5 refined: "Ver todos →" pre-filters to current month

**What's next for you:**
- **WI-4:** OneDrive storage (events.jsonl.age read path)
- **WI-5:** Crypto wiring (DEK from keychain; coordinate with Switch)
- **WI-6:** Wire real core/query into IPC handlers (replace mocks)

**How it unblocks you:**
- Trinity can wire Panel UI immediately (real data flows once WI-6 lands)
- Core query interface is stable; no schema churn expected
- Panel MVP proves event-sourced core by day 10 (M1 alpha gate)

- 2026-04-19 — Crypto-error UX strings ratified in docs/security/crypto-error-copy-catalog.md v1.0. Diagnostic-bundle spec (§4) defines per-scenario whitelisted fields for main-process export path. Use string keys verbatim; never surface crypto-layer names to UI.

### 2026-04-19: Cross-agent update from Scribe
Trinity defined `Movement` type at `app/src/renderer/types/movement.ts`. When implementing the real storage layer, align the read-side projection to this shape or deliberately evolve it and coordinate with Trinity.


### 2026-04-19: Movement schema v0.2 (subcategory already existed; added tags/status + nullable category)
Task from Pedro on `fix/trinity-prototype-parity`: expand Trinity's `Movement` contract so the prototype's Movements table can render Subcategoría / Etiquetas / Estado and the "solo sin categorizar" filter actually filters.

## 2026-04-19 — Data gap flagged (Scribe note)
**Account-color rendering gap identified (fix/trinity-prototype-parity):**
All accounts currently render in the same color. The prototype and the Movements table need per-account color tokens or a `color` field in the Movement schema (or Accounts schema) so treasurers can visually distinguish transactions by account. Propose adding to the real backend schema design phase (M1 follow-up). Related to Mouse's outstanding "Account colour palette" token follow-up.

**New shape** (`app/src/renderer/types/movement.ts`):
- `category: string` → `category: string | null` (`null` = uncategorised).
- `tags: readonly string[]` — always an array, possibly empty.
- `status: 'pending' | 'approved' | 'rejected'` + exported `MovementStatus` type. Explicitly documented as an **application-level review flag**, NOT ledger state — the team decision of 2026-04-19 (no pending transactions at the data layer) still holds.
- `subcategory` unchanged (already `string | null`).

**Mock seed** (`app/src/renderer/mocks/movements.ts`):
- Kept the 48 hand-written SEED rows (Oct-2025 → Apr-2026) intact.
- Derived the v0.2 fields deterministically by row index to keep snapshots stable:
  - `tags`: 0-3 picks from `['urgente','beca-2025','proyecto-a','auditable','recurrente']`.
  - `status`: every 17th row `rejected`, every 7th `pending`, rest `approved` (~80/15/5).
  - `category`: indices `{4, 12, 27, 41}` forced to `null` (4 uncategorised rows for the filter).
- `Seed` type now excludes `tags` / `status` (projected in) but still accepts nullable `category`.

**Guards added in `MovementsScreen.tsx`** (minimal, strict-TS only — NO UI behaviour change; Trinity owns the prototype-parity columns pass):
- Sort comparator: `(a.category ?? '').localeCompare(b.category ?? '')`.
- `categoryOptions` skips `null` when building the dropdown Set.
- Category cell renders `—` when `category == null`.
- Removed the old `TODO` at the `uncategorizedOnly` filter — it now works against real data.

**Verification:** `npm run typecheck` ✓ · `npm run lint` ✓ (max-warnings 0) · `npm test` ✓ (39/39) · `npm run build` ✓.

**Decision doc:** `.squad/decisions/inbox/morpheus-movement-v0.2-schema.md` — includes the real-backend mapping (events → SQLite projection columns, `tx_tags` M:N, review_status default, ULID vs UUID, audit log surface, `month` bucket follow-up). Trinity's superseded gap note removed.

**Commit:** `feat(movements): expand Movement schema with subcategory/tags/status/nullable category (Morpheus)` on `fix/trinity-prototype-parity`.

## 2026-04-19T16:21:30Z — Panel-First Work Package Decomposition (from Neo)

**Neo completed:** Full decomposition of Panel-first M1 implementation into 10 sequenced work items (WI-1 through WI-10) with owners, acceptance criteria, dependency graph, and critical-path analysis. Artifact: `.squad/decisions.md` § Neo — Panel-First Work Package Decomposition.

**Your assignments (awaiting Pedro approval on Q1–Q6):**

| WI | Phase | Owner | Your Role | Est. Days | Gate |
|---|---|---|---|---|---|
| WI-1 | Early | Morpheus | Lead | 2–3 | Vitest 100%, `core/query/` interface |
| WI-2 | Gate | Morpheus+Trinity | Collab with Trinity | 1 | IPC round-trip vitest |
| WI-4 | Parallel | Morpheus | Lead | 3–4 | OneDrive storage layer tested |
| WI-5 | After WI-4 | Morpheus+Switch | Collab with Switch | 3–4 | Switch reviews; crypto round-trip vitest |
| WI-6 | Final | Morpheus | Lead | 1 | Real core wired to IPC handlers |

**First wave (day 1, after Pedro answers Q1–Q6):** 
- WI-1 (you, Morpheus core) starts immediately — no blocking dependencies.
- WI-3 (Trinity, Panel UI) starts immediately in parallel with WI-1 — can mock IPC calls.
- WI-2 (you + Trinity, IPC contract) starts after WI-1 query signatures stabilize (~1 day lag).

**Critical path to M1 Panel alpha:** WI-1 → WI-2 → WI-3 + (WI-4→WI-5) → WI-6 → polish. By day 10, Panel renders from real encrypted OneDrive events. Days 11–15 = sparklines + chart + empty states + skeleton.

**Your Q1–Q6 blocking reads:**
- Q3: **Accounts metadata** — You need to know: does Link draft PRD-010 Accounts, or do you infer the schema from prototype? Neo recommends: minimal schema (id, short, color, createdAt) in WI-1 prep, or Morpheus infers from `prototype/data.js` accounts.
- Q4: **Chart library** — Neo recommends custom SVG for M1 (no deps, matches prototype). Benchmark deferred to M1+1.

**Status:** Work package merged to `.squad/decisions.md`. Awaiting Pedro approval to spawn first-wave agents (you on WI-1, Trinity on WI-3, dual-spawn WI-2 once WI-1 stabilizes).

## 2026-04-19T18:55:00Z — WI-2 Gap Fixed: Panel IPC Bridge End-to-End Wired

**Task:** Wire Panel IPC end-to-end so renderer's `panelApi.ts` reaches mock handlers in `app/src/main/ipc/handlers/panel.ts`.

**Problem:** Renderer showed error banner because `window.opentreasury.panel.*` methods didn't exist. Mock handlers were registered but unreachable from the renderer.

**Solution implemented:**

1. **Preload bridge** (`app/src/preload/index.ts`):
   - Exposed `panel` sub-surface on `window.opentreasury` with 5 typed methods:
     - `getAccounts()`, `getAccountBalances()`, `getMonthKPIs(req)`, `getAccountSparklines(req)`, `queryRecentTransactions(req)`
   - Imported channel constants from `app/src/shared/ipc-contracts/panel.ts` (no hardcoded strings)
   - Updated exported `OpenTreasuryApi` type with full panel surface

2. **Main registration** (`app/src/main/ipc/handlers.ts`):
   - Imported all 5 Panel handler functions from `./handlers/panel.js`
   - Imported all Zod request/response schemas from `../../shared/ipc-contracts/panel.js`
   - Registered all 5 handlers with `ipcMain.handle()` at app-ready time
   - Belt-and-suspenders validation: parse request with schema, invoke handler, parse response with schema

3. **Renderer typing** (`app/src/renderer/vite-env.d.ts`):
   - Added Window interface augmentation declaring `window.opentreasury: OpenTreasuryApi`
   - Removed all `(window as any)` escape hatches from `panelApi.ts`
   - All calls now properly typed with no ESLint suppressions

**Verification:**
- ✅ `npm run typecheck` — zero errors
- ✅ `npm run lint` — max-warnings 0 (ignoring TS version warning)
- ✅ `npm test` — 48/48 tests passed
- ✅ `npm run build` — successful Vite production build

**Commit:** `fix(panel): replace hardcoded Spanish strings with i18n keys (EN+ES)` (commit 1583135) — included the IPC wiring alongside Trinity's i18n fixes.

**Status:** Panel IPC bridge is now fully wired. Renderer can call `window.opentreasury.panel.*` methods, which invoke channel constants, reach registered handlers in main, and return mock data. Ready for Trinity to test in dev build. Next: WI-4 (OneDrive storage) + WI-5 (crypto wiring) to replace mocks with real event-sourced data.

**Key learnings:**
- Preload must import types and channel constants from shared contracts — type safety across the boundary
- Main handlers need both request AND response validation for belt-and-suspenders security (ADR-001 C13)
- Window augmentation in vite-env.d.ts eliminates all `any` escape hatches in renderer services
- All 5 Panel queries validated end-to-end: IPC round-trip works, mock data flows correctly

## 2026-04-19T19:05:00Z — Electron + Vite Dev Loop Wired (ADR-002 §11 Complete)

**Task:** Wire Electron + Vite together so `npm run dev:electron` actually works instead of being a TODO stub.

**Problem:** 
- `npm run dev:electron` was just `echo '...' && exit 1`
- Pedro had been running `npm run dev` (Vite only, browser renderer) → `window.opentreasury` undefined
- Panel threw `TypeError: Cannot read properties of undefined (reading 'panel')` in browser
- All WI-2/WI-3 code was correct; just never loaded inside Electron runtime

**Solution implemented:**

1. **Tooling choice:** `vite-plugin-electron` + `vite-plugin-electron-renderer`
   - Most popular, well-maintained plugin for Electron + Vite integration
   - Handles main + preload builds via esbuild (fast incremental)
   - Renderer via Vite dev server with HMR
   - Single command starts everything

2. **vite.config.ts changes:**
   - Added electron plugin with 2 entries:
     - Main process: `app/src/main/index.ts` → `dist/main`
     - Preload script: `app/src/preload/index.ts` → `dist/preload`
   - Plugin auto-injects `VITE_DEV_SERVER_URL` env var in dev mode
   - Builds all 3 targets (renderer + main + preload) in `npm run build`

3. **app/src/main/index.ts changes:**
   - Load from `VITE_DEV_SERVER_URL` in dev, `file://` in production
   - Updated CSP to allow `ws://localhost:5173` and `http://localhost:5173` for HMR
   - Navigation guard allows dev server URLs during development

4. **app/src/preload/index.ts changes:**
   - Added console.log: `[preload] opentreasury API exposed — window.opentreasury.panel is ready`
   - Verifies preload script actually runs in Electron context

5. **package.json changes:**
   - `dev:electron` now runs `vite` (plugin auto-starts Electron)
   - `build` now produces all 3 artifacts via plugin
   - Both scripts work seamlessly

**Verification:**
- ✅ `npm run typecheck` — zero errors
- ✅ `npm run lint` — max-warnings 0
- ✅ `npm test` — 48/48 tests passed
- ✅ `npm run build` — produces dist/main, dist/preload, dist/renderer
- ✅ All artifacts verified in dist/ directories

**Commit:** `feat(dev): wire Electron + Vite dev loop (closes ADR-002 §11)` (commit 2243f78)

**Status:** Pedro can now run `npm run dev:electron` and:
- Electron launches with renderer at `http://localhost:5173`
- Vite HMR works (renderer hot reloads on changes)
- Main + preload rebuild on change; Electron auto-restarts
- Preload console.log confirms `window.opentreasury` API is exposed
- Panel screen loads with Morpheus's mock fixture data (3 accounts, KPIs, 8 transactions, sparklines)
- No more "cannot read properties of undefined" errors

**Key learnings:**
- vite-plugin-electron is the right tool for Electron + Vite integration (simpler than electron-vite)
- Entry paths must use `resolve(__dirname, 'path')` for correct resolution
- CSP must be updated to allow dev server connections (ws:// and http:// for HMR)
- VITE_DEV_SERVER_URL env var is auto-injected by plugin; just check it in main process
- Single npm command (`dev:electron`) can orchestrate renderer + main + preload builds + Electron launch
- Preload console.log is valuable for debugging — confirms bridge actually loads
- ADR-001 C7 (Electron hardening) still enforced: contextIsolation, no nodeIntegration, sandbox enabled

## 2026-04-19 — WI-11: createTransaction command + TransactionCreated event + reducer wiring

**Scope (strict):** Pure-domain slice only. No IPC (WI-12), no UI (WI-13), no storage/event-log (WI-4' — running in parallel).

**Schema locked (cloud-mirror, per docs/schemas/cloud-reference-notes.md):**
- mount: number is ALWAYS **positive**.
- Sign is carried by 	ype: 'income' | 'expense' (enum).
- Mirrors cloud 	ransactions.amount (Decimal > 0) + 	ransaction_type.
- NOT a signed amount, NOT credit/debit split. Don't re-open this.
- Event payload fields (id, date, 	ype, mount, currency, description, ccountId, categoryId, subcategoryId, 	agIds, status, createdAt) match 	ransactionCreatedPayloadSchema in `app/src/core/events/schemas.ts` verbatim — WI-1 had already locked it.
- Task brief's counterparty? and simple category? string: **NOT added**. Schema uses categoryId ULID (cloud-aligned); counterparty deferred to a future WI (cloud has `counterparty_name`/`counterparty_reference` — not in M1.5 scope).

**Files added:**
- `app/src/core/commands/createTransaction.ts` — pure command function, returns `Result<TransactionCreatedEvent, ValidationError>`.
- `app/src/core/commands/index.ts` — module barrel.
- `app/src/core/commands/createTransaction.test.ts` — 12 tests (happy path, all validation codes, determinism).
- `app/src/core/query/reducers.test.ts` — 2 multi-event reducer tests (3 tx projection, out-of-order createdAt).

**Files modified:**
- `app/src/core/index.ts` — re-exports commands.

**Files NOT touched (other WIs own them):**
- `app/src/core/eventLog/` (WI-4')
- `app/src/core/events/schemas.ts` (WI-1, already has `tx.created` event)
- `app/src/core/query/reducers.ts` (already handles `tx.created` — the existing projection satisfies WI-11's requirements)
- `app/src/main/ipc/handlers.ts` (WI-12)
- All renderer (WI-13)

**Validation rules (enum `ValidationErrorCode`):**
- `TYPE_INVALID` — type must be `'income'` or `'expense'`
- `AMOUNT_NON_POSITIVE` — amount must be finite and > 0 (0, negatives, NaN, Infinity all rejected)
- `CURRENCY_EMPTY` — currency must be non-empty string after trim
- `DESCRIPTION_EMPTY` — description must be non-empty after trim
- `DATE_INVALID` — must match `YYYY-MM-DD` AND be a real calendar date (Feb 31 rejected via round-trip parse)
- `ACCOUNT_NOT_FOUND` — `accountId` must exist in the injected `readModel.accounts`

**Command signature:**
`createTransaction(input: CreateTransactionInput, deps: { now, newId, readModel, datasetId, actorDeviceId, dekVersion? }): Result<TransactionCreatedEvent, ValidationError>`

`newId` is called twice per invocation — once for the event envelope `id`, once for `payload.id` (transactionId). Both are ULIDs. Caller injects deterministic `now` + `newId` in tests.

**Reducer note:** `applyEvent` in `app/src/core/query/reducers.ts` already handled `tx.created` from WI-1. The existing read model does NOT materialize `recentMovements`, `monthKPIs`, or `accounts[id].balance` as stored fields — they're computed by `queryRecentTransactions`, `getMonthKPIs`, and `getAccountBalances` on demand against `model.transactions`. Per the task's `check — if not, skip` clause, I added NO new reducer fields and instead wrote an integration-style reducer test that produces events via the real command, applies them through the reducer, and asserts the three query surfaces return the right projection (sort order, month bucketing, account aggregation).

**Verification:**
- `npx vitest run app/src/core/commands app/src/core/query` — 15/15 green (12 + 2 + 1).
- `npm test` — 66/66 green (no regressions).
- `npx tsc -p app/src/core/tsconfig.json` — clean for WI-11 files. Pre-existing errors in `app/src/core/eventLog/JsonFileEventLog.ts` (4, from WI-4') are the parallel-instance's scope; not touched.

**Commit:** feat(core): WI-11 createTransaction command + TransactionCreated event + reducers

**Key learnings for future commands:**
- `exactOptionalPropertyTypes` + `verbatimModuleSyntax` mean: use `import type` for types; `?? null` only when the schema infers `| null` (not when it's truly optional). Nullables propagate.
- `z.array(z.string())` infers `string[]` (mutable), but `readonly string[]` inputs need `[...input.tagIds]` when writing into the event payload — zod-inferred types aren't `readonly`.
- Test files MUST be `*.test.ts` (vitest config `include`), NOT `*.spec.ts` — task brief used `.spec.ts` but the repo convention wins. Documenting so no one else trips.
- Validation ordering matters: type → amount → currency → description → date format → account existence. Cheapest checks first; account lookup last (it's O(n) in accounts).
- Calendar-date validation via regex + round-trip ISO parse: `new Date('2026-02-31T00:00:00Z').toISOString().slice(0,10)` yields `'2026-03-03'` ≠ original, so we reject. The regex alone is insufficient.


## 2026-04-19 — WI-4′ shipped: local NDJSON event log + startup hydration

**Scope:** M1.5 vertical slice storage layer. Deferred OneDrive + crypto to M2
(WI-4 / WI-5). Delivered a swappable EventLog interface with a local NDJSON
adapter, startup hydration, and prototype-shaped dev-seed on first run.

**Files added:**
- `app/src/core/eventLog/EventLog.ts` — interface (LOCKED contract, shared with WI-11).
- `app/src/core/eventLog/JsonFileEventLog.ts` — NDJSON implementation (`fs/promises`, fsync on append, in-memory idempotency set).
- `app/src/core/eventLog/index.ts` — barrel.
- `app/src/core/eventLog/JsonFileEventLog.test.ts` — 4 unit tests (round-trip, missing file, idempotency, crash tail).
- `app/src/main/bootstrap.ts` — resolves `app.getPath(''userData'')/dev-events/`, constructs the log, hydrates via `replayEvents`, gates dev-seed behind NODE_ENV !== ''production'' AND empty log.
- `app/src/main/devSeed.ts` — mirrors prototype/data.js (5 accounts, 8 categories, 6 tags, 30 transactions) as real DomainEvents.

**Files modified:**
- `app/src/main/index.ts` — awaits `initializeApp()` inside `app.whenReady()` before registering IPC.
- `app/src/main/ipc/handlers/panel.ts` — mock fixtures replaced with thin projections over `core/query` (same IPC contract).
- `app/src/core/query/queries.ts` — `getAccountBalances()` now includes accounts with zero activity (so Panel renders one card per account).
- `app/src/core/tsconfig.json` — added `"types": ["node"]` so core can import `node:fs` / `node:path` for the adapter.

**Verification:** `npx vitest run app/src/core/eventLog` 4/4 green · `npm test` 66/66 green · `npm run lint` clean · `npm run typecheck` clean · `npm run build` produces dist/main + dist/preload + dist/renderer.

### Learnings

- **EventLog interface shape (LOCKED):** `append(event): Promise<void>` (idempotent by `event.id`) + `load(): Promise<DomainEvent[]>` (insertion order). Two methods, no cursor, no query — reducers fold the full stream. Keeping the surface this small is what lets OneDrive drop in later without touching core/query or IPC.
- **NDJSON rationale:** one JSON object per line + trailing `\n` makes `append` a single syscall with zero read-modify-write, and recovery from a truncated tail is a one-liner (skip unparseable lines). A JSON array would require rewriting the closing bracket on every append and has no natural crash-recovery story. `fs.open(path, ''a'') → writeFile(line) → sync() → close()` gives ordering guarantees strong enough for single-writer M1.5; M2 will revisit when concurrent sync arrives.
- **Dev-seed gate:** seed ONLY when `events.ndjson` does not yet exist AND `NODE_ENV !== ''production''`. Never overwrite existing events, ever — append-only is the whole point. Seed emits real domain events (AccountCreated / CategoryCreated / TagCreated / TransactionCreated) so the replay path is identical in seeded and user-written modes.
- **Electron userData timing gotcha:** `app.getPath(''userData'')` is only stable after `app.whenReady()` resolves — calling it earlier can return a value that Electron later overrides. Bootstrap MUST be awaited inside the `whenReady()` callback, not at module load. Same reason `initializeApp()` isn''t a top-level side effect.
- **Pure core, path resolution in main:** keeping `JsonFileEventLog` Electron-free (no `app.getPath` inside the class) is what makes it unit-testable in vitest''s `node` environment with real `fs.mkdtemp` tmp dirs. The bootstrap file in `main/` is the only place the two worlds meet.
- **Fake-ULID seed IDs:** the event envelope schema requires `z.string().length(26)`; dev-seed derives deterministic 26-char Crockford-alphabet strings from short names (e.g. `ACCUNI000…`). Real production events will use crypto-random ULIDs. Side effect: the renderer''s `MOCK_TX_COUNTS` keyed on prototype short ids no longer matches — it falls back to `kpis.transactionCount`, which is acceptable for M1.5 and tracked for WI-6 replacement.
- **Idempotency scope:** in-memory Set per process is sufficient for M1.5 (single-writer, load-before-write ordering enforced by bootstrap). When sync arrives (M2), the seen-set must persist alongside the log or be reconstructed eagerly on startup; today''s adapter already seeds the Set during `load()` so the invariant holds across restarts.
- **Corruption tolerance:** `load()` skips malformed lines with a warning rather than throwing. Throwing would brick the app on a single bad byte; silently dropping interior bad lines is worse but avoidable in practice because append is line-atomic with fsync. The crash-simulation test locks this behaviour in.

---

## 2026-04-19T18-27-12Z — Team Update (from Scribe): M1.5 Storage + Domain Complete

**Status:** WI-4′ (local event log) and WI-11 (createTransaction command) both shipped. Storage and domain layers of M1.5 vertical slice are complete.

**Decisions locked (now live in `.squad/decisions.md`):**
1. **Transaction schema:** positive `amount` + `type: 'income' | 'expense'` (cloud-mirror, not signed). Validation: 6 codes, cheap-first ordering.
2. **EventLog interface:** `append(event)` idempotent by `event.id` + `load()` insertion-order. Contracts locked for WI-4 (OneDrive) and WI-11 (commands).

**Trinity's status:** Panel visuals polished (icons, CSS consolidation, responsive 5→4→3→2, prototype mocks). Ready for WI-6 (replace mocks with real queries) and WI-13 (Add-Transaction form).

**Pedro verified:** App runs with 49 hydrated events, Panel renders 5 accounts + KPIs + transactions, no console errors, no visual regressions. Ready for command-side wiring (WI-12/13/14).

**Your next:** WI-12 (IPC handlers for createTransaction — thin pass-through). Then WI-14 (Panel invalidation after commit). Coordinate with Trinity on form field → validation code mapping for i18n keys.

## 2026-04-19 — WI-12 main-side: transaction.create + movements.list IPC bridge

**Task:** Ship main-side handlers + preload exposure for the WI-12 IPC contracts Trinity consumes on the renderer.

**Scope delivered:**
- Contracts (new, under `app/src/shared/ipc-contracts/`): `transaction.ts` (`transaction:create`) + `movements.ts` (`movements:list`), each with request/response zod schemas and wire-level type aliases.
- Handler factories (`app/src/main/ipc/handlers/`): `transaction.ts` + `movements.ts` — deps-injected, unit-testable without Electron.
- Registration (`app/src/main/ipc/handlers.ts`): pulls `eventLog` from bootstrap, `getReadModel` from core/query reducers, new `newUlid`/`DATASET_ID`/`ACTOR_DEVICE_ID` from new `app/src/main/ids.ts`.
- Preload exposure (`app/src/preload/index.ts`): `window.opentreasury.transaction.create(input)` + `window.opentreasury.movements.list(filter?)`.
- Tests (vitest, 11/11 green): happy path + validation failures (ACCOUNT_NOT_FOUND, SCHEMA_INVALID, enum reject) + idempotency (same `event.id` → reducer applied once) + unexpected-throw → `INTERNAL` for transaction; date/accountId/date-range/limit+offset filters for movements.

**Verification:** `npx vitest run app/src/main/ipc/handlers` 11/11 · `npm test` 81/81 · `npm run typecheck` clean · `npm run lint` clean · `npm run build` clean · `node --check dist/preload/index.cjs` valid.

### Learnings

- **Handler factories > module-level singletons.** The panel handlers bind the read-model singleton implicitly via imports; for commands (which also need EventLog + clock + id gen) the deps set is too big to thread through module scope. Factory pattern (`createTransactionCreateHandler(deps)`) keeps tests pure — pass an in-memory `EventLog` stub and you exercise the full happy/error path without touching `ipcMain` or Electron.
- **Two-layer validation at the IPC boundary.** (1) Zod-parse the raw payload — renderer is untrusted, malformed shapes → `SCHEMA_INVALID` structured error. (2) Business-rule validation inside the core command — unknown account etc. → `ACCOUNT_NOT_FOUND`/`AMOUNT_NON_POSITIVE`. Both paths return the discriminated union; nothing throws across IPC. `try/catch` around the whole handler converts any unexpected throw (e.g. `EventLog.append` rejecting) to `{ ok: false, error: { code: ''INTERNAL'' } }` so structured errors always round-trip.
- **Idempotency guard for the reducer.** The NDJSON log dedupes by `event.id`, but the in-memory reducer has no such guard — applying the same event twice would double-project the transaction. Pattern: check `(await load()).length` before+after `append`; only call `applyEvent` when the log actually grew. Avoids double-book on retries and matches the log''s own semantics.
- **Shared contract must not import core/.** `app/src/shared/ipc-contracts/` is renderer-safe; renderer → core is forbidden by ESLint zones. Initially I imported `transactionCreatedEventSchema` from `core/events` into the transaction contract — TS compiled but the lint boundary would reject any renderer import path that pulls core transitively. Fix: mirror the event envelope schema inline in the contract (~25 LOC). Contracts stay the canonical wire types, core owns the domain types; they happen to be shape-compatible.
- **Contract naming coordination with Trinity.** She authored renderer stubs expecting `MovementRecord` (ID-based, wire-level) because WI-14 will do the label-resolution pass. I initially mirrored the renderer''s `types/movement.ts` display shape (labels). Mid-task pivot: moved the contract to `MovementRecord` (IDs) and kept `Movement` as a type alias to avoid breaking her in-flight files. Lesson: when two agents author opposite sides of a contract, re-read both sides'' TODO comments before locking the shape — the renderer''s `types/movementsFilter.ts` explicitly documented the wire contract and said ''Morpheus, please match''.
- **ULID at runtime in main.** No existing util; added `newUlid()` in `app/src/main/ids.ts` using `node:crypto.randomBytes` + the 32-char Crockford base32 alphabet. 10-char timestamp prefix + 16 random chars, 26 total. Kept in `main/` because `node:crypto` is unreachable from preload (sandbox) and from renderer (no Node). Also exported `DATASET_ID` + `ACTOR_DEVICE_ID` as the deterministic fake-ULIDs used by `devSeed` so new transactions land in the same dataset as seeded ones.
- **Preload CJS stayed clean.** No new preload-specific patterns needed — the contract files are pure zod/TS with no Node imports, so the esbuild CJS bundle built cleanly (`node --check dist/preload/index.cjs` exit 0). The only preload change was extending the `api` object; contextBridge surface grew by 2 methods.
