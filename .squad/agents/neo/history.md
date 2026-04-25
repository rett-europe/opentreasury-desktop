# Project Context

- **Owner:** Pedro (perocha)
- **Project:** OpenTreasury Desktop — Electron-based treasury management for NGOs. Desktop version of the cloud-based rett-europe/opentreasury, designed to work without complex cloud setup.
- **Stack:** Electron (frontend), rest TBD. Reference app: Angular 19 + Python FastAPI + Cosmos DB + Entra ID on Azure.
- **Created:** 2026-04-19

## Key Reference

The cloud version (rett-europe/opentreasury) features:
- Transaction management with categories, subcategories, and tags
- Multi-account support (bank accounts + PayPal)
- Excel/CSV import from bank exports, Excel export for accounting
- Dashboard with account balances and monthly summary
- RBAC (Admin / Viewer)
- Audit trail, soft deletes
- Multi-language support (Spanish + English)

The desktop version aims to replicate this functionality without requiring Azure infrastructure.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

## 2026-04-19 — WI-15/16 scope finalized (Configuración + Datos deep-dive from web reference)

Completed comprehensive scope inventory of rett-europe/opentreasury (web reference app). 
Mapped Accounts/Categories/Subcategories/Tags CRUD, Import (3-step wizard, alias-based column mapping, 
hash-based dedup, partial-success model, category auto-creation with type guessing + override), 
Export (XLSX only, date-range + optional filters). Event model additions defined (10 new event types: 
account.*, category.*, subcategory.*, tag.*, import.*). Work packages WI-15 (10–12d), WI-16 (12–14d), 
WI-17 (5–6d integration + polish). Six blocking open questions for Pedro (event-sourced config vs 
separate store, multi-currency, bank parsers, category type mutability, import rollback, export format). 
v1-minimal slice (WI-15-lite, create-only for accounts/categories/tags) proposed as separate 3–4d 
milestone if Pedro prefers faster proof-of-concept before full CRUD.



**Context:** Scoped CONFIGURACIÓN + DATOS work packages by studying `rett-europe/opentreasury` (Angular 19 + Python FastAPI web reference).

**Import flow insight:**
The web app's bank statement import (XLSX/CSV → transactions) has **three complexity centers** that desktop must replicate:

1. **Column alias detection** — hardcoded bank-specific logic (`/api/app/constants/import_constants.py`). Parser normalizes headers (lowercase, strip accents), then checks aliases: `"FECHA": ["fecha", "f. valor", "date"]`, `"IMPORTE": ["importe", "amount", "cargo", "abono"]`, etc. **No user-configurable mapping UI** — parser either auto-detects or fails with "Missing required columns" error. This simplifies UX but breaks if banks change formats.

2. **Duplicate detection** — hash-based idempotency. For each row, compute `md5(accountId + date + amount + description)` → stored as `source_reference`. Before insert, query for existing txn with same hash; if found, skip. **No external bank transaction ID** used — hash is the only de-dup mechanism. Edge case: if same real-world transaction appears in two files with different descriptions (bank truncates), hash won't match → duplicate inserted.

3. **Category auto-creation** — parser extracts unique (category, subcategory) pairs from import file, compares against existing categories by name (case-insensitive). If not found, creates new category with type guessed from keywords ("Cuota", "Donación" → income; "Gasto", "Alquiler" → expense) OR user override via `categoryTypeOverrides` metadata. **User override is critical** — without it, imports fail or create wrong-type categories when parser guesses incorrectly.

**Partial success model works well:** Web app commits valid rows, skips malformed rows (invalid date/amount), returns warnings array. User can fix errors in subsequent import (duplicates auto-skipped via hash). This is better UX than atomic rollback.

**Desktop implication:** Replicate all three mechanisms in `app/src/main/services/import-parser.ts`. Use same alias lookup (port Python constants to TS). Use same hash logic for `source_reference`. Support category type overrides in import wizard Step 2. Accept partial success (warnings array).

**2026-04-20 — ERROR SHAPE STANDARDIZATION (Morpheus/Trinity coordination note):** Import error shape is now structured as `{ code, raw, offending? }` for all dry-run errors. This enables i18n, cross-agent error handling, and future extensibility (date-format ambiguity UX, advanced suggestions). If your future dry-run work (date parser, etc.) adds error codes, follow the same pattern. See decisions.md §"2026-04-20: Import Error Row Semantics" for full spec.

**Reusable pattern — "mirroring a web reference repo into desktop twin":**
1. API endpoints → command surface (each POST/PUT/DELETE = one command that appends event).
2. Service layer → business logic (port validation rules: IBAN format, soft-delete protection, txn count checks).
3. Frontend components → UI patterns (modal dialogs, inline toggles, confirmation dialogs map cleanly from Angular to React).
4. **Do NOT port database layer** — web uses Cosmos DB (document store); desktop uses event log + in-memory projections. Schema conversion required (e.g., web stores `is_deleted: bool` on document; desktop appends `AccountDeleted` event).

**Artifact:** `.squad/decisions/inbox/neo-wi15-configuracion-datos-scope.md` (21-day work package plan, 6 open questions for Pedro).

## 2026-04-19T18:56:23Z — WI-12 landed: E2E IPC bridge unlocks M1.5 demo path

**Status:** IPC contract finalized by Morpheus + Trinity, unblocking WI-13 + WI-14.

Morpheus + Trinity completed WI-12 (transaction:create + movements:list IPC bridge). Main-side handlers + renderer clients are production-ready. Contract is locked — no changes until Panel invalidation event bus (WI-14). M1.5 critical path now proven viable: WI-4′ (event log) + WI-11 (command) + WI-12 (IPC) complete; WI-13 (Add-Transaction modal) + WI-14 (Panel invalidation) ready to spawn. ETA: 2–3 days to "add transaction → see it live" demo.

## 2026-04-19 — M1.5 Vertical Slice Re-sequencing

**Trigger:** Pedro asked when we'd have an end-to-end "add a transaction, see it reflected" scenario.

**Call:** Re-sequenced M1. OneDrive (WI-4) + crypto (WI-5) deferred to M2. Inserted **WI-4′ (local-JSON event log, dev-only)**, **WI-11 (createTransaction command + projection)**, **WI-12 (movements IPC contract)**, **WI-13 (Add-Transaction modal + Movements real wiring)**, **WI-14 (Panel invalidation)**. Critical path: WI-4′ → WI-11 → WI-12 → WI-13 → WI-14. ETA 4–6 days to M1.5 demo.

**Storage-fallback recommendation:** ship local-JSON append-only log now behind the same `EventLog` interface WI-4 will later implement against OneDrive. Storage is a swappable adapter; no core/UI work is thrown away when OneDrive lands in M2.

**Rationale:** Pedro's stated preference is shipping working software fast. OneDrive+crypto = 6–8 days gated on Switch; local JSON = <1 day and unblocks the full event-sourcing loop end-to-end. The event-sourced architecture (ADR-001 Option A) is preserved exactly — only the byte-persistence layer is a dev stub.

**Owners for first wave:** Morpheus (WI-4′, WI-11, WI-12 main side), Trinity (WI-12 client, WI-13, WI-14).

**Artifact:** `.squad/decisions/inbox/neo-e2e-vertical-slice-plan.md`.

## 2026-04-19T16:21:30Z — Panel-First Work Package Decomposition

**Status:** Proposed — awaiting Pedro go/no-go on Q1–Q6 before first-wave spawn.

**Deliverable:** 10 concrete work items (WI-1 through WI-10) with owners, acceptance criteria, dependency graph, and 12–15 day ETA.

**Critical Path:** WI-1→WI-2→WI-3+(WI-4→WI-5)→WI-6→polish.

**First Wave (day 1 parallel, after Pedro approval):**
- WI-1: Morpheus (core read queries)
- WI-3: Trinity (Panel UI with mock IPC)
- WI-2: Morpheus+Trinity (IPC contract, after WI-1 stabilizes)

**M1 Panel Alpha Gate:** ~Day 10 (WI-6 lands, real data flows).

**Six Open Questions:** See .squad/decisions.md § Neo — Panel-First Work Package Decomposition (Q1–Q6 with recommendations on all six).

**Archive:** 
eo-history-archive.md (ADR-001/002/003, prototype authority, tech stack rationale).

## 2026-04-20 — WI-17 pivot: bank-specific parsers → generic column mapper

**Context:** Pedro rejected the bank-specific parser approach (Unicaja/CaixaBank hardcoded aliases). WI-17 is now a **generic column-mapping importer** with dry-run preview.

**Key architectural decisions:**

1. **Account-first binding** — user selects destination account BEFORE upload (1 file = 1 account rule). Eliminates need for account-column mapping; simplifies UI.

2. **Dual-format support from day 1** — .csv AND .xlsx via `papaparse` (44KB) + SheetJS `xlsx` (~400KB). Not a future enhancement; core requirement. SheetJS chosen over exceljs for size (half the weight) and read performance.

3. **Row-hash deduplication** — SHA-256 of `accountId|date|amount|description` (normalized: lowercase, trimmed, 2-decimal amount). Truncated to 16-char hex. Stored in `movement.imported` event payload for idempotent re-imports. Hash index lives in read model (in-memory `Set<string>`), not on-demand log scan.

4. **Dry-run is non-negotiable** — Step 5 shows first 5 sample rows, total count, duplicates detected, validation errors. User MUST inspect before commit. This is the critical safety gate missing from the web app's auto-parser (which fails silently or creates garbage data on format mismatch).

5. **Mapping memory per account** — last-used column mapping stored as event-sourced `import.mapping.updated` event keyed by accountId. Next import pre-fills mapping (but remains editable). Handles the variance problem: Santander CSV ≠ CaixaBank CSV; different accounts likely = different banks.

6. **Partial success model preserved** — commit imports valid rows, skips invalid rows, returns warnings array. Matches web app UX (which Pedro confirmed works well). Duplicates skipped by default (opt-in to re-import via checkbox).

7. **Flat event shape** — `movement.imported` is a flat event (like WI-15-lite `AccountCreated`), not enveloped (like `tx.created`). Both coexist in NDJSON log. Envelope unification deferred to M2 crypto work.

8. **Amount type derivation heuristic** — added a sign-convention toggle in Step 4: "Positive amounts are [Income/Expense]". Default: Income. Banks vary (credit vs debit perspective); user corrects via UI rather than us guessing wrong.

**Reusable pattern — "user-driven mapping beats hardcoded heuristics":**
The web app's bank-specific alias tables (`import_constants.py`) work for 90% of RETT's imports but become technical debt when banks change formats (requires code deploy to fix). A generic mapper shifts format variance to the UI layer, which users can self-correct without waiting for a release. Trade-off: more clicks per import, but zero code changes for new bank formats. For a desktop app (no continuous deployment), this is the right trade.

**Import flow complexity budget:**
6 steps is the threshold before users perceive friction. We're at exactly 6 (account → upload → sheet-picker → mapping → dry-run → commit). Mapping memory (pre-fill on subsequent imports) keeps recurring imports at 4 steps (skip mapping + dry-run becomes a quick glance). Target: <30 seconds for a 50-row top-up, <2 minutes for a 500-row bulk load.

**Artifact:** `.squad/decisions/inbox/neo-wi17-v2-spec.md` (frozen data contracts, row-hash algorithm, 6 work items, 7 open questions for Pedro).


## 2026-04-20T10:47:33Z — WI-18 scope locked (header detection + 2-of-3 junk rule)

**Status:** Decision file dropped at .squad/decisions/inbox/neo-wi18-header-row-detection.md. Morpheus + Trinity spawning in parallel against it.

### Learnings

**Header-detection heuristic (generalizable pattern).** Bank statement preambles are unbounded in format but bounded in structure: 2–8 "metadata" rows then a real header then data. Scoring heuristic (score each row on "looks like headers" + "row below looks like data") beats every alternative we considered (fixed-offset, regex-per-bank, ML). Four rules, integer scores, tie-break on earliest row, low-confidence fallback to row 1. Key insight: the **most predictive signal is the row *below*** (does it look like data?), not the candidate row itself — +3 weight vs +2 for the header-ish signal. Applies to any tabular-ingest problem with variable preamble (invoice imports, CSV exports from legacy systems, etc.).

**2-of-3 junk rule (golden invariant: never silently lose a legitimate row).** When classifying bottom-of-file rows, "number of parseable required fields" is the right axis — not regex on cell content, not row-position-from-EOF. 0 or 1 parseable = junk (silent skip, count in skippedJunkRows info counter). 2 = surface as row-level error (could be real data with a broken field). 3 = import. The asymmetry is deliberate: silent skip is cheap when wrong in the junk direction (user re-imports), catastrophic when wrong in the data direction (user loses a transaction and may never notice). Always bias toward surfacing. Any future "smarter" rule (e.g. auto-skip /^Total/) requires a new decision — this invariant is locked.

**IPC contract evolution pattern — additive optional fields.** Every WI-18 contract change is (a) new optional request fields with sensible defaults, or (b) new response fields that existing renderers ignore. Zero breaking changes to WI-17. This is now the house pattern for evolving ipc-contracts/*.ts: request additions are .optional(), response additions are fields existing clients won't read. Reserve breaking changes for a numbered contract version bump, which we have not yet needed. Lets Morpheus + Trinity ship in parallel without a flag day.

## 2026-04-20T19:XX:XXZ — WI-19 scope: Transaction fields (reference, details) + Notes entity

**Status:** Scope doc delivered at `.squad/decisions/inbox/neo-wi-19-scope.md`. Awaiting Pedro's sign-off.

### Learnings

**Commentary entities need hard-delete.** Notes (timestamped user comments on a transaction) are ephemeral annotations, not auditable financial records. Soft-delete + versioning adds complexity without business value — users don't need "note edit history" the way they might need transaction audit trails. Hard-delete via `tx.note.deleted` event is simpler and still maintains event-sourced immutability (the delete is an event, not a log mutation).

**Transaction detail view is a prerequisite for notes UI.** MovementsScreen currently has no row-click handler — it's a list view only. Notes thread needs a container to live in (detail modal or inline expand). Modal is simpler; inline expand is slicker but more complex. Recommended modal for M1.5.

### 2026-04-25 — PR #46 Playwright perf-gate review

Reviewed PR #46 perf-budget gate; identified blocker (Electron launch arg prevents userData resolution), two calibration issues (timeout 240s, budget 1500ms). All issues empirically validated. Cypher verified fix commit and merged. See `.squad/decisions.md` §"2026-04-25: Neo PR #46 code review..." for full details. Skill written: `.squad/skills/perf-gate-verification/SKILL.md`.

**Null normalization simplifies queries.** Storing empty strings vs NULL creates two representations of "absent". Normalizing to NULL (trim + empty→null) keeps queries simple (`WHERE field IS NOT NULL`). Applied to both `reference` and `details` fields.

## 2026-04-21 — WI-20 scope: Transaction Manual Add + Edit

**Status:** Scope doc delivered at `.squad/decisions/inbox/neo-wi-20-scope.md`. Awaiting Pedro sign-off.

### Summary

Pedro asked to "close the loop" on manual transaction entry. WI-20 adds:
- **Edit flow:** TransactionDetailModal (WI-19) gains an Edit button → opens form pre-filled → submits `transaction:update` IPC → `tx.updated` event → reducer updates projection.
- **Manual add polish:** Existing `AddTransactionModal` needs status picker (currently hardcoded) + reference/details fields (WI-19 fields, not wired yet).
- **(Pending Pedro)** Delete: `tx.deleted` event + confirmation UI.

### Key architectural decision

Event-sourcing edit pattern: **Full payload snapshot (`tx.updated`)** — not field-level patch. Rationale: single-user desktop app, storage is cheap, replay is trivial, no patch versioning needed.

### Immutability constraints

`accountId` stays immutable after creation (no account reassignment in WI-20). Rationale: reassignment affects balance projections across accounts — complexity not worth it for M1.5. Users can delete + re-create if truly needed.

### Four decisions for Pedro

1. Include delete in WI-20? (Rec: Yes)
2. Account immutability OK? (Rec: Yes)
3. Add "New transaction" to MovementsScreen header? (Rec: Yes)
4. Edit UX in-place swap OK? (Rec: Yes)

**Artifact:** `.squad/decisions/inbox/neo-wi-20-scope.md`

## 2026-04-21 — WI-20 shipped

**Status:** All gates green (360/360 tests). Morpheus + Trinity delivered in parallel.

**What shipped:**
- Backend: `tx.updated` + `tx.deleted` events, IPC contracts, reducers, 16 tests (Morpheus: commits d3ad1ce + 7c48518)
- Frontend: TransactionDetailModal edit/delete, TransactionFormModal (add+edit modes), status picker, reference/details fields, i18n, 16 tests (Trinity: merged via Morpheus)
- Entry points: "New transaction" button in PanelScreen + MovementsScreen headers
- Confirmation dialogs: delete confirmation in detail modal

**Key decisions locked:**
- Immutable `accountId` (ignore incoming value, use stored) — prevents balance-projection drift
- Full payload snapshot (`tx.updated`) — simpler than field patches for single-user app
- Separate edit modal (Option B) — leverages TransactionFormModal reusability despite earlier Option A suggestion

**Cross-coordination:**
- Morpheus created TransactionFormModal as shared UI surface; Trinity wired it to both add (WI-13) and edit (WI-20) flows
- Trinity reports: modal composition was actually Option B (separate dialog) rather than Option A (in-place swap), but mental model preserved — user sees seamless edit-in-place workflow

**Follow-up:** Account deletion rule (Pedro directive: "only if no transactions") flagged for future Accounts work item; NOT in WI-20 scope.

**Artifact:** `.squad/orchestration-log/2026-04-21T20-44-08Z-{morpheus,trinity}.md`

## Team Updates

- **WI-19 shipped:** Neo scoped, Pedro approved, Morpheus + Trinity delivered. All gates green (345/345 tests). TransactionDetailModal + NotesThread + import wizard mapping live on main. Contract deviations (noteId + id split, transactionsByReference projection) documented in decisions.md.
- **WI-20 shipped:** Neo scoped, Pedro approved 4 decisions, Morpheus + Trinity delivered. All gates green (360/360 tests). Edit + delete + form refactor live on main. Decisions merged to decisions.md; inbox cleared.
- **2026-04-22 — NEXT:** Link recommended **WI-22 Saldo** as next priority (primary). WI-23/24 runners-up. See decisions.md § "Link — WI-22 Recommendation (post-WI-21 merge)" for full spec. Polish pass scoped before WI-22. Awaiting Pedro confirmation.

## Learnings — Saldo contract adequacy review (2026-04-22, WI-22)

- **Visual-diff-driven contract audit is a real pattern.** Pedro showed the original Saldo prototype (`panel_saldo.png`) after PR #11 was already in flight. Running a field-by-field adequacy pass against the frozen Zod contract before Trinity reworks the renderer caught one hard gap (prior-year monthly net series) that the renderer could not have faked. Lesson: when a prototype surfaces late, audit the contract first, not the rendered component.
- **priorPeriod was under-specified vs currentPeriod by design, and the prototype exposed that.** We had scalar `totalIncome` / `totalExpense` + `netByCategory` on `priorPeriod` but no `monthlySeries`. Asymmetry was deliberate (only current period needed a chart in WI-22 S2), but the two-series comparison chart in the real prototype makes prior-year monthly buckets mandatory. Rule of thumb for future read-model contracts: **if current period has a per-time-bucket series, assume prior period will eventually need the symmetric one** — design it in from day one, or at least leave the schema additively extensible.
- **server-derived-fields vs "per-category rows are never projected" is a latent conflict.** The prototype's per-category "↑ 39 % proy. vs 2025" delta is a projection applied at category granularity, which we explicitly excluded from server computation in thin-spec §5. The renderer can derive it from exposed daysInPeriod/daysElapsed, which is numerically identical but policy-soft. Next time I write a projection-bearing contract I'll state up front whether derived-on-client is permitted for sub-totals, instead of leaving it implicit.
- **Additive amendments beat restructuring when a PR is still in flight.** PR #11 hadn't merged, so we could add priorMonthlySeries without a breaking change; a new optional (or required-but-ignored-by-old-renderers) field rode cleanly through. Value: preserves Trinity's in-flight work, keeps property-test invariants intact (just extended with a symmetric one), and costs Morpheus one extra uildMonthlySeries call plus two tests.
- **Always extend property-test invariants alongside the schema.** Adding priorMonthlySeries without adding Σ buckets ≡ priorPeriod totals would leave a silent gap. Invariants are cheap to add and catch aggregation drift immediately — shipping a schema field without its matching invariant is technical debt.

---

## Learnings — 2026-04-22 — post-PR#15 triage (Panel/Movements raw IDs + Saldo "Sin categoría" + chart heights)

**Files inspected:**
- `app/src/renderer/screens/PanelScreen/PanelScreen.tsx` (full)
- `app/src/renderer/screens/MovementsScreen/MovementsScreen.tsx` (mapMovementRecord + loadAll)
- `app/src/renderer/screens/SaldoScreen/SaldoScreen.tsx` (MonthlyNetChart, CategoryPanels, buildPanelRows)
- `app/src/renderer/components/GroupedBarChart/GroupedBarChart.tsx` (full — scale + tooltip)
- `app/src/main/devSeed.ts` (category/tag/tx event emission, lines 720-815)
- `app/src/main/ipc/handlers/categories.ts` (list + CRUD)
- `app/src/main/projections/config.ts` (selectActiveCategories)
- `app/src/core/query/reducers.ts` (both event families)
- `app/src/core/query/saldo.ts` (UNCATEGORIZED_LABEL, resolveCategoryName, buildMonthlySeries)
- `app/src/core/events/schemas.ts` (event type literals)
- `app/src/shared/ipc-contracts/saldo.ts` (monthly bucket schema)

**Key things learned:**
1. **Dual event families, one project.** There are TWO parallel event families for config entities: legacy `category.created`/`tag.created`/`account.created` (populate `readModel.categories`/`.tags`/`.accounts`) and new `CategoryCreated`/`TagCreated`/`AccountCreated` (populate `readModel.configCategories`/`.configTags`/`.configAccounts`). The IPC `*:list` handlers read **only** from the `config*` slices. devSeed.ts still emits the legacy shapes → all dev sessions get empty `listCategories()`/`listTags()`. This is the single point cause behind both Bug 1 and Bug 2's presentation. Anyone wiring new features off `listCategories()` will hit this until the seed is rewritten.
2. **The Saldo "chart" is NOT Income-vs-Expense.** `MonthlyNetChart` (SaldoScreen.tsx:396) renders currentYear-NET vs priorYear-NET as a 2-bar YoY group — not an I/E breakdown. `curNet = netIncome - netExpense` (single signed number). The legend is `[currentYear, priorYear]` string years. Can easily be misread as I/E. The chart math is correct (shared y-axis, supports negatives). If users expect I/E, that's a UX/product decision, not a math bug.
3. **Server-emitted display strings.** `app/src/core/query/saldo.ts:38` hardcodes `'Sin categoría'` and emits it on every null or unresolved category. This violates the backend-has-no-UI-strings boundary and leaks Spanish into EN. Any i18n bug in Saldo category rows traces to this single constant. Future: worth a lint rule forbidding user-facing strings in `app/src/core/**`.
4. **GroupedBarChart internals** (reusable context): SVG 600x300 viewBox, shared y domain `[min(0,v), max(0,v)]`, zero-line rendered, tabIndex per group for keyboard nav, tooltip built from `s.label` + `legend[0]`/`legend[1]` + formatted values. Not Recharts/visx — hand-rolled SVG. Height of each `rect` comes from `scaleBar(v)` which maps value → y/height about the zero line.
5. **Name-lookup pattern across screens.** PR #15's pattern — build `categoryNameById`/`subcategoryNameById` Map from `listCategories()` and fallback to raw ID — appears in PanelScreen.tsx:173-180 and MovementsScreen.tsx:203-213 (via `mapMovementRecord`). Consistent pattern; both use the same fallback-to-ID rule. Future reviewers: check any new list screen uses the same shape.

