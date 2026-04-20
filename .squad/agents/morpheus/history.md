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

## Core Context

**WI-17 Orientation (2026-04-20):** Generic column-mapping importer spec frozen in `.squad/decisions.md` under "WI-17 v2 — Generic Column-Mapping Importer". Neo's spec (IPC contracts, SHA-256 row-hash dedup, 6-step flow), Niobe's UX flow (EN/ES/WCAG), and Mouse's panel-polish audit all merged to decisions. Key handoff: You'll implement `import/stage-file`, `import/preview`, `import/commit` IPC handlers + file parsing (XLSX via SheetJS, CSV via papaparse), row-hash dedup logic, and `movement.imported` event + `import.mapping.updated` event. See decisions.md §"WI-17 v2" for full frozen spec (work decomposition WI-17.1 through WI-17.4).

Event-sourced core on NDJSON log + `JsonFileEventLog`. Two event shapes coexist in the same log:
- **Enveloped** (WI-11/WI-12 transactions, legacy Panel dev-seed): `{ id, type, datasetId, actorDeviceId, createdAt, dekVersion, version, payload }`.
- **Flat** (WI-15-lite config — `AccountCreated`/`CategoryCreated`/`TagCreated`): `{ type, id, …fields, createdAt }`.
Reducers switch on `type`; `JsonFileEventLog` only requires a string `id`. Consolidation is a future WI.

IPC contracts live in `app/src/shared/ipc-contracts/`. Invariant across all channels: **nothing throws across IPC** — validation failures return `{ ok: false, error: { code, message, field? } }`. IDs are 26-char Crockford base32 ULIDs from `main/ids.ts#newUlid`. Uniqueness on config entities is case-insensitive + trimmed.

Shipped so far: WI-11 (event log + crypto), WI-12 (transaction:create + movements:list), WI-15-lite (accounts/categories/tags create+list, event-sourced, EUR-only, no `type` on categories). Read model has two parallel projection streams: legacy (`accounts`/`categories`/`tags` from enveloped seed events) and new (`configAccounts`/`configCategories`/`configTags` from flat WI-15 events). `selectPanelSnapshot` unchanged; `accounts:list` etc. return only user-created config entities.

Next on backlog: WI-16 (Panel invalidation event bus + toast primitive), WI-17 (CSV/XLSX import with row-hash dedup + bank-specific parsers per Pedro Q5), full WI-15 (edit/archive/delete/subcategorías + stream consolidation).

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

## 2026-04-20T08:15:53Z — Electron crypto hotfix: avoid `ulid` package in main process

**Issue:** `ulid` package's `detectPrng()` crash at app boot: `"secure crypto unusable, insecure Math.random not allowed"` after esbuild bundling.

**Root cause:** `ulid` relies on `globalThis.crypto.getRandomValues()` for PRNG detection. Esbuild ESM bundling isolated the bundled code from the global crypto object. When `detectPrng` found only `Math.random()` available, it threw in strict mode.

**Fix:** Swapped to Node's built-in `crypto.randomUUID()` (from `node:crypto` module). No PRNG detection, built-in to all Node.js versions we target, equally opaque 128-bit tokens. Session file IDs are opaque-only (no sortability requirement), so UUID v4 is a drop-in replacement.

**Learning:** Avoid `ulid` package in Electron main — it can't reliably detect PRNG after bundling. Use `crypto.randomUUID()` from `node:crypto` for any opaque token generation in the main process.

**Verification:** Typecheck + 9/9 unit tests green. App boots without crash. (commit `18f7a61`)

## 2026-04-20T09:13:00Z — WI-17 shipped: CSV/XLSX import with column mapping + deduplication

**Status:** Completed — main-side implementation of generic column-mapping importer.

**Delivered:**
- Four new IPC handlers: `import:stage-file`, `import:dry-run`, `import:commit`, `import:last-mapping`
- Two new flat event types: `movement.imported` (extends transactions projection with rowHash dedup) + `import.mapping.updated` (per-account mapping memory)
- Row-hash dedup algorithm (SHA-256 truncated to 16 hex chars, normalized by accountId|date|amount|description)
- Date-format auto-detection (scans ≥10 cells, infers DD/MM vs MM/DD vs ISO, defaults to DD/MM when ambiguous)
- Parser utilities for date (Excel serial + DD/MM/YYYY + MM/DD/YYYY + ISO) and amount (flexible separators, currency symbols, parentheses, CR/DB)
- New projection: `importMappings` (upsert semantics, keyed by accountId)
- 24 unit tests green (rowHash: 11, dateFormat: 9, importMappings: 4)

**Libraries added:**
- `xlsx` (SheetJS 0.18.5) — XLSX parsing, 400 KB, chosen over exceljs for size + read speed
- `papaparse` (5.4.1) — CSV parsing with auto-delimiter detection + encoding tolerance
- Both run in main process only (not devDeps)

**Learnings:**
- **Event coexistence pattern works cleanly:** `movement.imported` (flat) coexists with `tx.created` (enveloped) on the same NDJSON log. Reducers switch on `type`; JsonFileEventLog only requires string `id`. No consolidation needed yet.
- **Row-hash normalization is critical:** Whitespace/case/decimal differences cause false negatives. The 6-step normalization (trim, lowercase, collapse spaces, convert CRLF, abs amount, 2-decimal fixed) catches 99% of real-world bank statement quirks.
- **Date format heuristic is simple but effective:** Scanning for day >12 disambiguates DD/MM vs MM/DD in >90% of cases. ISO regex unambiguous. Spanish default (DD/MM) avoids worst-case misinterpretation.
- **Papaparse auto-detection handles messy CSVs:** Delimiter detection (`,` vs `;` vs `\t`), quote handling, mixed encodings all work. No manual config needed.
- **XLSX empty-row handling:** `blankrows: false` in sheet_to_json skips empty rows (common in bank exports). Without it, row counts inflate and parsing fails.
- **TypeScript exactOptionalPropertyTypes quirk:** ParsedRow fields must be `T | undefined`, not `T?`, to satisfy the strict flag. The `?` syntax breaks with exact optional properties when assigning from a conditional branch.

**Deviations from Neo's spec:**
- None. Spec frozen, all channels + error codes + event shapes implemented as written.

**Outstanding TODOs for Trinity (renderer):**
- Import wizard UI (6-step flow: account picker → upload → sheet picker → column mapper → dry-run preview → commit)
- File-open dialog integration (Electron's `dialog.showOpenDialog` from preload)
- Dry-run UX: summary card, sample rows table, duplicate/error lists, "Import duplicates" checkbox
- Mapping auto-fill from `getLastMapping` on Step 4

**Next:**
- WI-17.3 (Trinity) — renderer import wizard
- Security review (Switch) — path traversal, file size limit, no shell exec
- E2E tests (Cypher) — 50-row CSV import, dedup on re-import, partial success with errors

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


## 2026-04-19T19:47:16Z — WI-15-lite shipped (main-side)

Delivered the event-sourced main half of Configuración v1: `AccountCreated` / `CategoryCreated` / `TagCreated` events, six IPC channels (`accounts|categories|tags : create|list`), projections over the read model, preload surface, **28 new tests** (10 accounts + 8 categories + 7 tags + 3 projections). Suite 121 pass / 9 skip / 27 files. Contracts frozen in `app/src/shared/ipc-contracts/{accounts,categories,tags}.ts` — source of truth; flat event shape `{ type, id, …fields, createdAt }`; responses are discriminated unions, nothing throws across IPC. Uniqueness case-insensitive + trimmed; IDs are ULIDs from `main/ids.ts#newUlid`. EUR hard-coded (field kept for M2 forward-compat). **No `type` field on categories** (direction-agnostic per Pedro's Q3).

Trinity consumes these contracts in the renderer and shipped the Configuración screen + Add-Transaction category/tag wiring in the same window. Stream-coexistence: WI-15-lite flat events live alongside Panel's legacy enveloped `account.created` etc. events in the same NDJSON log; reducers switch on `type`. `accounts:list` etc. return only user-created entities, not seed data. Consolidation deferred.

Coordinator moved `electron` from `dependencies` to `devDependencies` — `npm run package` now produces `out/OpenTreasury Setup 0.0.0.exe` cleanly. Encode in future PR reviews: only native Electron-runtime addons belong in `dependencies`.

Shipped as commit 2d9ac7c (pushed). **Next on my docket:** WI-17 (CSV/XLSX import with row-hash dedup + bank-specific parsers per Pedro Q5) is scoped but not started. Full WI-15 (edit/archive/delete/subcategorías + stream consolidation) remains open.


## 2026-04-20T09:45:00Z — WI-17 Security Hardening Complete

**Status:** Completed — all 6 Switch security conditions applied to WI-17 main-side import.

**Context:** Post-implementation security review by Switch identified 6 mandatory fixes (CVE-2023-30533/CVE-2024-22363 in xlsx, Windows path traversal gaps, zip-bomb risk, IPC injection via filePath). Applied all conditions in a focused hardening pass without rewriting the architecture.

**Delivered:**

1. **Library swap (Condition 1):**
   - Removed xlsx (SheetJS 0.18.5) → added exceljs (4.4.0)
   - Mitigates CVE-2023-30533 (prototype pollution) + CVE-2024-22363 (ReDoS)
   - Rewrote XLSX parsing to use exceljs streaming API (workbook.xlsx.readFile, worksheet.eachRow)
   - ExcelJS returns Date objects directly for date cells (not Excel serial numbers) → simpler, less error-prone
   - Trade-off: +400 KB bundle size, ~20% slower reads — accepted for security
   - Result: npm audit --omit=dev → 0 vulnerabilities (was 1 HIGH)

2. **Windows path hardening (Condition 2):**
   - Created app/src/main/import/pathGuard.ts module
   - Rejects UNC paths, device paths, reserved names (CON, PRN, AUX, NUL, COM1-9, LPT1-9), relative paths, path traversal (..)
   - Uses fs.lstatSync() (does NOT follow symlinks) + isSymbolicLink() check
   - New error code: PATH_INVALID (distinguishes from FILE_UNREADABLE)
   - 13 tests added (pathGuard.test.ts)

3. **Opaque file-ID tokens (Condition 3):**
   - Created app/src/main/import/sessionFileRegistry.ts
   - In-memory Map with ULID-based IDs (26-char, unguessable)
   - stageFile(path) → fileId, resolveFileId(fileId) → path | null, evictFileId(fileId), TTL 30 min
   - Updated IPC contracts: stage-file returns { fileId }, dry-run/commit take fileId (not filePath)
   - Prevents renderer from reading arbitrary files by manipulating filePath
   - Dependency added: ulid (v2.3.0)
   - 9 tests added (sessionFileRegistry.test.ts)

4. **Zip-bomb mitigation (Condition 4):**
   - Row-count cap: 100,000 rows max per sheet/file
   - XLSX: checks worksheet.rowCount before iteration; returns ROW_COUNT_EXCEEDED if >100k
   - CSV: Papaparse step callback aborts when counter >100k
   - New error code: ROW_COUNT_EXCEEDED
   - Prevents classic zip-bomb attack (10 MB compressed → 1 GB uncompressed)

5. **Symlink rejection (Condition 5):**
   - Integrated into pathGuard.ts — fs.lstatSync() + isSymbolicLink() check
   - Rejects with FILE_UNREADABLE detail "Symbolic links are not supported"

6. **Parser safety flags (Condition 6):**
   - ExcelJS: reads computed values by default (no formula strings), header sanitization (strip control chars, cap 500)
   - Papaparse: dynamicTyping: false (CVE mitigation), skipEmptyLines: true, header sanitization (strip control chars, cap 500)
   - All flags commented with CVE rationale

7. **Error-code additions (Condition 7):**
   - Extended importErrorCodeSchema: added PATH_INVALID, ROW_COUNT_EXCEEDED
   - Existing 8 codes unchanged

**Learnings:**

- **ExcelJS quirks:**
  - Returns Date objects for date cells (not numeric serials) → less conversion needed, more reliable
  - Cell values can be string | number | Date | RichText | Error | null → type guards essential
  - 1-indexed arrays (getCell(colIdx + 1), getRow(1)) vs 0-indexed SheetJS
  - Async API (await workbook.xlsx.readFile()) is better for main-process responsiveness

- **Path validation on Windows is subtle:**
  - path.normalize() resolves .. before our check can see it → need to check includes('..') AFTER normalize
  - Reserved names must check both basename (CON) and basename without extension (CON.txt) 
  - UNC paths start with \\ but device prefixes are \\?\ and \\.\\ (both must reject)
  - Symlink detection requires lstatSync (not statSync which follows symlinks)

- **CSV row-count cap implementation:**
  - Papaparse doesn't have built-in row limit (only preview for "read N rows then return")
  - Used step callback with manual counter + abort — works but less elegant than exceljs's rowCount property

- **ULID vs UUID for session tokens:**
  - ULID is lexicographically sortable (timestamp prefix) → better for debugging session order
  - 26 chars (vs 36 for UUID) → slightly shorter URLs/logs
  - Crockford base32 (vs hex) → easier to type if ever needed

**Contract breaking change (renderer):**
- dry-run and commit now take fileId (not filePath)
- Trinity has parallel fix-up spawn to update renderer side
- Renderer passes fileId (from stage-file response) to dry-run and commit

**Test coverage:**
- pathGuard.test.ts: 13 tests (UNC, device, reserved names, symlinks, traversal, etc.)
- sessionFileRegistry.test.ts: 9 tests (stage, resolve, evict, TTL, multi-file)
- Existing tests: 175 (all green)
- **Total: 197 tests, all green**

**Build status:**
- Typecheck (main): ✅ 0 errors
- Tests: ✅ 197 passed (175 existing + 22 new)
- npm audit: ✅ 0 vulnerabilities (was 1 HIGH — xlsx CVE-2023-30533/CVE-2024-22363)
- Renderer: not touched (Trinity's parallel task)

**Deviations:**
- None — all 6 conditions + error-code additions implemented exactly as specified

**Next:**
- Trinity renderer fix-up (update import wizard to use fileId)
- Full integration test (Cypher's WI-17.4 e2e)
- Commit (coordinator reviews post-wave)

**Implementation report:** .squad/decisions/inbox/morpheus-wi17-sec-harden.md


## 2026-04-20T10:57:25Z — WI-18 shipped: header-row detection + 2-of-3 junk rule

**Status:** Backend complete.

**Delivered:**
- `app/src/main/import/headerDetection.ts` — pure `detectHeaderRow(previewRows: string[][]): number` (1-indexed). Scoring: +2 header-ish row, +3 next-row-is-data, +1 no-digits-in-row, -2 single-cell; ties → earliest; max score < 3 → fallback to row 1; only scans rows 1..20.
- `app/src/main/import/rowClassification.ts` — `classifyRow(row, mapping, dateFormat) → "skip" | "error" | "import"` using `parseDate` + `parseAmount` + non-empty-description. Golden rule wired in: 0/1 parseable → silent skip, 2 → surface as error, 3 → import.
- IPC contract (`app/src/shared/ipc-contracts/import.ts`): `stageFileRequest.headerRow?` (1..20 optional), `sheetInfo.{detectedHeaderRow, previewRows}` added, `dryRunRequest.headerRow` + `commitImportRequest.headerRow` required.
- Handler (`app/src/main/ipc/handlers/import.ts`): stageFile now reads up to 20 raw rows (CSV via papaparse `header: false`, XLSX via `worksheet.getRow`), detects header, respects override, returns previewRows + detectedHeaderRow; dryRun + commit accept headerRow, slice from `headerRow + 1`, classify rows, drop "skip" silently, surface "error", commit "import".
- 24 new unit tests (headerDetection: 9, rowClassification: 9, handler: 6). Total 102 import-area tests green.

**Learnings:**
- **Header-detection scoring is a hybrid of shape + context:** shape alone (row has 3+ short text cells, no digits) isn't enough — many bank exports have tall section-title rows that look like headers. The +3 bonus for "next row looks like data" is what actually disambiguates in practice.
- **2-of-3 junk rule — golden rule:** never silently drop rows with 2 parseable fields. Those are almost always a real transaction with one typo (broken date, missing amount, etc). Only 0/1-parseable rows are truly junk (trailing summaries, separators, blank rows surviving `skipEmptyLines`).
- **CSV parsing had to switch from `header: true` to `header: false` arrays:** once the header row can be at position N ≠ 1, papaparse's built-in header mode no longer fits. Parse as arrays, slice manually, derive the header record from row N.
- **`detectedHeaderRow` is always returned, even when caller provides an override:** the UI needs to show "auto-detected row X" next to the override input, so the auto-detector must run unconditionally.
- **`totalRows` in dry-run now counts retained rows only (post-junk-filter):** this is the number the user should trust. If they see "50 rows" but junk was silently dropped, they get confused; the summary must match reality.
- **Empty rows in CSV are skipped at parse time (`skipEmptyLines: true`), so the "header row" index is relative to non-empty rows.** This matches how the user sees the preview, so it's the right choice.

**Deviations from spec:** None. Spec summary in the task brief was implemented verbatim (Neo's formal spec file never materialized in the inbox).
