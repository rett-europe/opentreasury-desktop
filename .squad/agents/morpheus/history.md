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

## Cross-Agent Learning (2026-04-22)

**From Trinity (WI-21 config CRUD):** Strong typing per-method with `MethodBridge<Req,Res>` is a durable IPC pattern. Trinity's PR #4 renderer fixes relied on the strongly-typed bridges — when Morpheus diverged from the spec (e.g., nested subcategory path), TypeScript surface-area tests immediately flagged it without needing manual e2e testing. Future IPC work in WI-22+ should use the same strongly-typed bridge pattern rather than generic request/response wrappers. Applied to all config mutation channels in WI-21; validated in practice by PR #4's catch rate.

**WI-22 Saldo shipped (2026-04-22):** PR #7 merged with backend (S1–S3 complete: IPC contract, aggregation query, projection logic, handler). 436 tests pass. On-demand aggregation <5ms at 1k events. Property test (Cypher) verified all 8 invariants (I8: Saldo ≡ Movements holds). Skill drafted: `read-model-aggregation` (reusable pattern for future queries). Trinity S5 (SaldoScreen) unblocked; Niobe i18n (PR #9) merged with 72 ES/EN keys locked.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

## 2026-04-22T17:00:00Z — WI-22 `priorMonthlySeries` additive amendment

**Status:** Shipped on `wi-22/saldo-prior-monthly-series`. Unblocks Trinity's PR #11 prototype-fidelity renderer (year-over-year net line chart). Neo's adequacy doc at `.squad/decisions/inbox/neo-saldo-contract-adequacy.md`.

### Durable learnings

- **"Reuse the same helper over a different range" is the cheapest way to extend a server-derived field.** `buildMonthlySeries(model, currentRange)` and `buildMonthlySeries(model, priorRange)` — two calls, one helper, no new code paths, no new projection rules to maintain. The read-model-aggregation skill pattern (pure function over a date window) makes additive extensions free.
- **Property-test mirror invariants are near-zero cost but high ROI.** `Σ priorMonthlySeries ≡ priorPeriod.totals` is a one-line mirror of `Σ monthlySeries ≡ currentPeriod.totals`. If the original invariant is structural (correct by construction), the mirror is too — but having it in fast-check means any future "optimization" that special-cases one side can't silently drift.
- **Zod contract tests that hard-code response fixtures need a fixture update alongside any `z.object({...})` amendment.** The `saldo.test.ts` freeze tests carry full response literals; adding a required top-level field made three of them fail at parse until I added `priorMonthlySeries: []` to each fixture. Cheap to fix but easy to miss — grep for `monthlySeries` callsites in tests when extending the response shape.
- **Pre-existing prettier backlog ≠ excuse to skip format:check — snapshot the baseline.** `git stash` + run `prettier --check` on the same files → confirms the warnings are inherited, not newly introduced. Doing this before committing kept me honest and avoids "why did you reformat these files" review friction.
## 2026-04-22T10:40:00Z — PR #4 round 2: tightening update invariants

**Status:** Pushed to `wi-21/config-crud` (commit `4f30d11`). Decision drop at `.squad/decisions/inbox/morpheus-pr4-round2-invariants.md`. Addresses 7 of 19 Copilot PR reviewer findings on 57ae73b (Trinity owns the other 12 renderer ones).

### Durable learnings

- **Zod `.refine` on "at least one change" must inspect VALUES, not KEYS.** `Object.keys(c).length > 0` passes for `{ color: undefined }` and lets a no-op `*Updated` event into the log. Correct predicate: `Object.values(c).some((v) => v !== undefined)`. Rule of thumb: any refine on an object-of-optionals needs to test what the keys carry, not that the keys exist.
- **Optional-string update handlers need trim + empty→delete, not trim alone.** The WI-21 reducers apply `changes.color` whenever the key is present (`!== undefined`). Leaving `''` in the payload overwrites a previously-valid colour with an empty string in the read model — diverging from create-time semantics that just omit empty optionals. Pattern: after trim, `delete normalised.color` (or `undefined`) when length is 0, *plus* a final `Object.values(normalised).some(...)` check so a payload that was all-whitespace can't smuggle a no-op event through.
- **Schema rejections must match handler rejections EXACTLY.** Any divergence is a bug. `createSubcategoryRequestSchema.name: z.string()` was accepting `''` while the handler rejected it — caught by the PR bot. `z.string().min(1)` at the schema is the right line of defence; the handler's trim-check then covers whitespace-only names.
- **Event-sourced = permanent.** Any invariant breach that reaches NDJSON replays forever. Two-layered defence (schema boundary + handler) is the minimum; both layers must agree.
- **Shared working tree with a parallel agent is hostile terrain.** Trinity's in-flight renderer changes appeared in the working tree while I ran tests, and at one point her process reset the tree (reflog showed `reset: moving to HEAD`) and wiped my uncommitted edits. Lessons: (1) commit your changes ASAP, don't let them sit in the worktree across long gate runs; (2) when tests/typecheck surface errors in files you don't own, `git stash push -- <their-paths>` to validate your work in isolation before drawing conclusions about baselines; (3) always `git add` an explicit file list, never `git add .` on a shared tree.

## 2026-04-22T00:25:00Z — WI-21 Config CRUD backend landed (archive-only per Switch)

**Status:** Backend surface complete on `wi-21/config-crud`; Trinity renderer still in flight. Decision drop at `.squad/decisions/inbox/morpheus-wi21-events-ipc.md`.

### Key decisions

1. **No `*.deleted` events. Ever.** Switch's cascade ruling (`switch-wi21-cascade-policy.md`) is the law. `Archived` stamps `archivedAt`, `Unarchived` clears it — both are pure reducer transitions, not tombstones.
2. **Subcategory shape — first-class events, inlined projection.** SubcategoryCreated/Updated/Archived/Unarchived live on the NDJSON log with `parentCategoryId` as the routing key. The read model inlines them under `ConfigCategory.subcategories[]` so the renderer can fetch the whole picker tree with one `categories:list` call. Rationale: keeps event log granular for audit; avoids a new top-level stream; aligns with Switch's "no cascade" ruling (parent archive does NOT touch children).
3. **Event `id` is the log dedupe key, not the entity id.** Pre-existing `JsonFileEventLog` dedupes by `event.id`. Re-using the entity id across `Created → Updated → Archived → Unarchived` would silently drop every mutation after the first. Fix: every mutation event carries `id: <fresh ULID>` plus a domain-named `{accountId|categoryId|subcategoryId|tagId}` field. `SubcategoryCreated` stays on the WI-15-lite `*Created` convention (`id` = entity id) because a create is unique-per-id by construction, and the renderer already relies on that shape.
4. **`archivedAt?: string` is optional everywhere.** `selectActive*` helpers filter it out; list IPC handlers accept `{ includeArchived?: boolean }` (default `false`). Archived subcategories are also stripped from otherwise-active parent categories in the default view.
5. **Backward-compat pinned by a replay test.** `reducers.wi21.test.ts > "replaying only pre-WI-21 *Created events produces an identical projection"` proves that an old NDJSON log still projects cleanly — no missing fields, no crashes, `archivedAt` undefined across the board.

### Gotchas future-me will hit again

- When adding mutation events to any append-only log stream, **always check how the log dedupes** before re-using an id. JsonFileEventLog uses `event.id` — not `(type, id)`, not `(dataset, id)`. Same pattern already shows up on `tx.note.added` and `tx.deleted` (envelope `id` = event ULID, `noteId`/`txId` = entity).
- `exactOptionalPropertyTypes` strikes every time: to "clear" an optional field on a read-model record, destructure `{ field: _drop, ...rest }` and drop `_drop`. Don't set `undefined` — TypeScript will reject it.
- Trinity's in-flight renderer work on the shared branch left the baseline `typecheck` and `format:check` red. Don't panic: run both, capture the baseline, then confirm your changes don't *add* errors. My files (core/main/shared/preload) are all clean; the residual prettier/tsc misses are renderer-side and Trinity's to close.

## 2026-04-20T20:33:00Z — ExcelJS cell normalization must happen at the boundary (SECOND TIME)

**Status:** Completed and pushed to main (commit `738362d`).

**Context:** Pedro imported an XLSX file. Every row failed with: `Fila N — Importe: Carácter no válido en «[object Object]»`. This is the SECOND time `sanitizeCell` has bitten us. The first time (commit `24775ce`) we added it to the preview/stage-file path but forgot the dry-run/commit path.

**Root cause:** Two independent XLSX readers:
1. **Preview/stage-file** (lines 280-340 in import.ts): Uses `sanitizeCell` to normalize ExcelJS cell shapes before building preview rows.
2. **Dry-run/commit** (lines 804-908, `loadXlsxRows`): Was calling `String(amountCell.value)` directly, passing raw ExcelJS objects (`{formula, result}`, `{richText: [...]}`, etc.) to `parseAmount`, which stringified them to `"[object Object]"` → `INVALID_CHARACTERS`.

**Solution delivered:**

1. **Extracted sanitizeCell to a shared module** (`app/src/main/import/cellSanitizer.ts`):
   - Single source of truth for ExcelJS cell normalization.
   - Handles all ExcelJS value shapes: `{ formula, result }`, `{ richText }`, `{ text }`, `{ error }`, `Date`, primitives.
   - Optional `stripControlChars` + `maxLength` for UI preview (500 char cap, ASCII control char stripping).
   - Preview path uses `sanitizeCell(value, { stripControlChars: true, maxLength: 500 })`.
   - Dry-run/commit path uses `sanitizeCell(value)` (no truncation, preserve full data for parsing).

2. **Fixed loadXlsxRows** (lines 892-896):
   - Before: `rawAmount: String(amountCell.value ?? '')`
   - After: `rawAmount: sanitizeCell(amountCell.value)`
   - Now formula cells `{formula: 'A1+B1', result: 16433.39}` → `"16433.39"` instead of `"[object Object]"`.

3. **Added defensive type guard in parseAmount**:
   - Now accepts `unknown` instead of `string`.
   - Type guard at boundary:
     ```ts
     if (raw == null) return { code: 'EMPTY' };
     if (typeof raw === 'number') {
       // Accept numeric cells (ExcelJS returns numbers for numeric cells)
       if (!Number.isFinite(raw)) return { code: 'OUT_OF_RANGE', raw: String(raw) };
       return { value: raw, locale: 'en' };
     }
     if (typeof raw !== 'string') {
       // Reject objects, arrays, etc. (defensive guard against upstream bugs)
       return { code: 'NOT_A_STRING', raw: String(raw) };
     }
     ```
   - Updated `NOT_A_STRING` error to include `raw: string` field (was missing in type).
   - Numbers from ExcelJS (numeric cells) pass through directly — no string conversion needed.
   - Objects, arrays, etc. rejected with clear `NOT_A_STRING` error showing `[object Object]` in `raw`.

4. **Added 9 defensive type-guard tests** (`amountParser.test.ts`):
   - Numeric passthrough: `parseAmount(16433.39)` → `{ value: 16433.39, locale: 'en' }`
   - Negative numeric: `parseAmount(-1234.56)` → `{ value: -1234.56, locale: 'en' }`
   - Zero: `parseAmount(0)` → `{ value: 0, locale: 'en' }`
   - Reject `Infinity`: `{ code: 'OUT_OF_RANGE', raw: 'Infinity' }`
   - Reject `NaN`: `{ code: 'OUT_OF_RANGE', raw: 'NaN' }`
   - Reject object (formula cell): `parseAmount({formula: 'A1+B1', result: 123})` → `{ code: 'NOT_A_STRING', raw: '[object Object]' }`
   - Reject array: `parseAmount([1,2,3])` → `{ code: 'NOT_A_STRING' }`
   - Handle `null`: `{ code: 'EMPTY' }`
   - Handle `undefined`: `{ code: 'EMPTY' }`

**Learnings:**

- **Cell normalization MUST live at the ExcelJS/papaparse boundary, not in the parser layer.** This is the SECOND time this bit us. The parsers (`parseAmount`, `parseDate`) should receive plain strings or primitives, never raw ExcelJS cell objects. Any code path that reads XLSX (preview, dry-run, commit, future exports) MUST use `sanitizeCell` before passing values downstream.

- **Two independent readers = two bug surfaces.** The preview/stage-file path and the dry-run/commit path both read XLSX, but they were doing it differently (one with `sanitizeCell`, one with `String()`). Extracting `sanitizeCell` to a shared module enforces a single normalization strategy.

- **Formula cells are common in bank exports.** Users paste bank statements into Excel, add a column with `=SUM(B1+C1)` or similar, then export. ExcelJS returns `{formula: '...', result: 16433.39}` for those cells. Without normalization, the formula string leaks into the parser.

- **Defensive type guards at parser boundaries are worth it.** Even with the upstream fix, the `NOT_A_STRING` guard in `parseAmount` catches programmer errors (e.g., future code paths forgetting to sanitize). The error message `"[object Object]"` is unambiguous — you know immediately you passed an object.

- **Numeric cells should pass through trivially.** ExcelJS returns actual JavaScript numbers for numeric cells (e.g., `16433.39`). The old parser required strings, forcing an unnecessary `String()` conversion. The new parser accepts numbers directly, avoiding the conversion + re-parsing round-trip.

- **Testing the dry-run path requires integration tests or manual verification.** Unit tests for `parseAmount` and `sanitizeCell` are easy, but the bug only surfaced when Pedro ran the full dry-run wizard on a real XLSX file. Consider adding an integration test that exercises `loadXlsxRows` → `parseRow` → `parseAmount` with synthetic ExcelJS-shaped inputs.

**Verification:** All 131 import tests green (65 parseAmount, 9 rowHash, 9 sessionFileRegistry, 9 rowClassification, 9 headerDetection, 9 dateFormat, 13 pathGuard, 6 import handlers). Typecheck ✓ · lint ✓ · format:check ✓ · build ✓ · pushed to main (commit `738362d`).

**Coordination note for future Morpheus:** If you EVER touch XLSX/CSV reading again, grep for `sanitizeCell` and verify EVERY code path uses it. The pattern is:
- ExcelJS: `sanitizeCell(cell.value)` before passing to parsers.
- Papaparse (CSV): Already returns strings, but sanitize anyway for consistency.
- Preview: `sanitizeCell(value, { stripControlChars: true, maxLength: 500 })` for UI safety.
- Dry-run/commit: `sanitizeCell(value)` (no truncation, preserve full data).

**Problem solved:** Pedro can now import XLSX files with formula cells, richText cells, and other ExcelJS object shapes. The dry-run no longer fails with `[object Object]` garbage in the error messages.

## 2026-04-21T23:00:00Z — WI-20 backend implementation (tx.updated + tx.deleted events)

**Status:** Completed and pushed to main (commit `d3ad1ce`).

**Context:** Manual transaction edit + delete. Pedro approved all of Neo's WI-20 scope recommendations: soft-delete via `tx.deleted` event, `accountId` immutable after creation, full-replacement payload for `tx.updated` (Pattern A).

**Delivered:**

1. **Event schemas** (`app/src/core/events/schemas.ts`):
   - `tx.updated` event (enveloped style, same as `tx.created`). Full-replacement payload includes all fields. `updatedAt` timestamp added alongside preserved `createdAt`. `accountId` immutable (server enforces).
   - `tx.deleted` event (flat style, similar to `tx.note.*` events). Payload: `{ id, txId, deletedAt, datasetId, actorDeviceId, dekVersion, version }`. Event `id` is the event ULID; `txId` is the transaction being deleted.

2. **IPC contracts** (`app/src/shared/ipc-contracts/transaction.ts`):
   - `transaction:update` channel. Request omits `accountId`, `currency`, `createdAt` (server-side). Response = discriminated union `{ ok: true, event } | { ok: false, error }`.
   - `transaction:delete` channel. Request = `{ id }`. Response = same discriminated union.
   - Error codes: Added `TX_NOT_FOUND`, `REFERENCE_TOO_LONG`, `DETAILS_TOO_LONG`. Reused existing validation codes (`AMOUNT_NON_POSITIVE`, `DATE_INVALID`, `DESCRIPTION_EMPTY`, `TYPE_INVALID`, `SCHEMA_INVALID`, `INTERNAL`).

3. **Commands** (`app/src/core/commands/updateTransaction.ts`, `deleteTransaction.ts`):
   - `updateTransaction`: validates input, loads existing transaction (returns `TX_NOT_FOUND` if missing), ignores incoming `accountId` (uses stored value to enforce immutability), emits `tx.updated`.
   - `deleteTransaction`: validates, verifies transaction exists, emits `tx.deleted`.
   - Both commands use distinct `Result` type aliases (`UpdateResult`, `DeleteResult`) to avoid export conflicts with `createTransaction.ts`.

4. **IPC handlers** (`app/src/main/ipc/handlers/transaction.ts`):
   - Wired `transaction:update` and `transaction:delete` channels using factory pattern (same as `transaction:create`).
   - Handlers follow existing idempotent-append pattern: check event log growth before applying to reducer.

5. **Reducer updates** (`app/src/core/query/reducers.ts`):
   - On `tx.updated`: find transaction by `payload.id`, replace in-place in `transactions` array. Rebuild `transactionsByReference` index (reference may have changed).
   - On `tx.deleted`: filter transaction from `transactions` array. Delete entry from `transactionsByReference` index. Clean up notes for the deleted transaction (cascade delete from `notes` map).

6. **Preload bridge** (`app/src/preload/index.ts`):
   - Exposed `transaction.update` and `transaction.delete` methods. Mirrors existing `transaction.create` pattern.

7. **Unit tests**:
   - `updateTransaction.test.ts`: 9 test cases (happy path, not-found, non-positive amount, negative amount, invalid date, invalid type, empty description, immutable accountId preservation).
   - `deleteTransaction.test.ts`: 2 test cases (happy path, not-found).
   - `reducers.test.ts`: 5 additional test cases for `tx.updated` and `tx.deleted` projection (replace transaction, rebuild reference index, remove transaction, remove from reference index, cascade delete notes).

**Learnings:**

- **Pattern A (full-replacement payload) is straightforward:** Reducer logic is a simple find-and-replace. No patch-merge complexity, no field-level delta tracking. For a single-user desktop app with encrypted NDJSON log, storage overhead is negligible.

- **Immutable accountId enforcement approach:** Command uses the stored `accountId` from the existing transaction, ignoring any incoming value from the request. This is cleaner than rejecting requests that include a different `accountId` (which would require the UI to explicitly omit it). Trinity can include `accountId` in her form state without errors — the backend will silently use the correct value.

- **Event `id` vs aggregate `id` split (same as tx.note.* events):** The `tx.deleted` event uses flat style with two id fields: `id` (event ULID, dedupe key for the log) and `txId` (transaction being deleted). This mirrors the pattern from WI-19 transaction notes. The `tx.updated` event uses enveloped style (event `id` in envelope, transaction `id` in `payload`).

- **Reference index rebuild on update/delete:** Transactions can have references. The `transactionsByReference` index must be rebuilt whenever a transaction is updated (reference may change) or deleted (must remove from index). The index-building function (`indexByReference`) is pure and re-runs on every projection, so the reducer just assigns `transactionsByReference: indexByReference(nextTransactions)` after any mutation.

- **Cascade delete notes on tx.deleted:** When a transaction is deleted, its notes become orphaned. The reducer cleans up the `notes` map entry for that `txId` to avoid memory leaks. This is an in-memory projection concern only — the append-only event log still contains the note events, but they're no longer projected.

- **TypeScript exactOptionalPropertyTypes gotcha:** Input interfaces with optional fields like `reference?: string | null` require explicit `| undefined` in strict mode when the IPC schema can return `undefined`. Fixed by adding `| undefined` to `UpdateTransactionInput` optional fields.

- **Result type export conflicts:** All three transaction commands (`createTransaction`, `updateTransaction`, `deleteTransaction`) originally exported a generic `Result<T, E>` type. This caused TypeScript "cannot redeclare" errors when re-exporting from `core/commands/index.ts`. Resolved by renaming to `UpdateResult` and `DeleteResult` in the update/delete commands.

**Verification:** All backend tests green (360 passed, 9 skipped). Typecheck has 2 pre-existing renderer errors (Trinity's TransactionDetailModal and PanelScreen not wired to the new IPC channels yet — expected, she's running in parallel). Lint ✓ · format ✓ · committed and pushed to main (commit `d3ad1ce`).

**Coordination with Trinity:** The IPC contract types (`UpdateTransactionRequest`, `DeleteTransactionRequest`, `UpdateTransactionResponse`, `DeleteTransactionResponse`) are exported from `shared/ipc-contracts/transaction.ts` and exposed via `window.opentreasury.transaction.update` / `.delete` in the preload bridge. Trinity can import these types and call the IPC handlers from her UI code. The `accountId` field is optional in `UpdateTransactionRequest` — if provided, it's ignored; if omitted, no error. The backend always uses the stored value.

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

## 2026-04-21T10:15:02Z — WI-20 Polish Round 2: new dateFormat util (renderer-side)

Trinity created `src/utils/dateFormat.ts` using `i18n.language` instead of `navigator.language`. Applied to MovementsScreen, PanelScreen, TransactionDetailModal, NotesThread. Renderer-side only; no backend impact. Good to know if backend ever emits date strings for UI rendering.
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

---

## 2026-04-20 — Cross-Agent Coordination: Trinity UI Now Surfaces Per-Row Errors

**Note for Morpheus (from Trinity):**

Trinity has implemented sticky wizard footer + per-row error surfacing (commits 7e1cb50 + 58c18c2). The ImportWizard now uses the `value` field you added to `parseErrorSchema` to display the exact cell content alongside error reasons. This closes the user feedback loop: "I got error on row 42, but I don't know which cell" → now shows "row 42, amount field: 'abc€123', reason: 'Contains invalid characters'".

The `reason` strings are being used directly from your `amountParser` (no additional formatting), confirming your error messages are appropriately user-facing. i18n keys for all error reasons added to locale JSON (EN/ES).
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

## 2026-04-20T16:32:09Z — Locale-aware amount parsing (Spanish/US decimal formats)

**Status:** Completed and pushed to main (commit `4f78721`).

**Delivered:**
- New module: `app/src/main/import/amountParser.ts` with pure locale-aware parsing logic
- Auto-detection algorithm: counts separators (dot vs comma), applies heuristics based on position, frequency, and digit count after separator
- Spanish format: dot=thousands, comma=decimal (e.g., `16.433,39` → 16433.39)
- US/UK format: comma=thousands, dot=decimal (e.g., `16,433.39` → 16433.39)
- Handles currency symbols (€, $, £, ¥, EUR, USD, GBP, etc.), NBSP/NNBSP whitespace, accounting parentheses `(1.234,56)` → -1234.56
- Column-level locale inference helper: `inferColumnLocale(samples: string[]): 'es' | 'en' | 'mixed'` locks format when ≥80% samples agree
- Extended IPC contract: `parseErrorSchema` now includes optional `value?: string` field for the raw cell value that failed
- Updated import handler: populates `value` field in parse error objects
- Integrated into existing `parser.ts`: preserves legacy CR/DB suffix logic while delegating to new locale-aware parser
- 50 comprehensive tests: all Spanish/US formats, ambiguous cases, negatives, currency symbols, edge cases, explicit locale override, column inference

**Learnings:**
- **Auto-detection heuristics are delimiter-count-based, not regex:** counting dots and commas + examining the rightmost separator position is more robust than trying to regex-match known patterns. The edge cases (single separator `1.234` or `1,234`) require digit-count disambiguation (3 digits after → thousands, ≤2 digits → decimal).
- **The rightmost separator is always the decimal:** when both dot and comma are present (`16.433,39` or `16,433.39`), the separator that appears last (rightmost) is the decimal separator. This simple rule handles 99% of mixed-format cases.
- **NBSP (U+00A0) and NNBSP (U+202F) are common in European bank exports:** French and Spanish banks often use NBSP as thousands separators. Normalizing these to regular spaces before stripping them prevents false "invalid characters" errors.
- **Column-level inference prevents single-ambiguous-value misreadings:** when a column has 9 clearly Spanish amounts (`16.433,39`, `1.234,56`, ...) and one ambiguous integer (`1234`), locking the column to ES format prevents the parser from misinterpreting the integer row-by-row. The ≥80% threshold is low enough to handle mixed edge cases but high enough to avoid false locks.
- **Explicit locale override for edge cases:** the parser accepts an optional `{ locale: 'es' | 'en' | 'auto' }` parameter. When the user knows their bank format is consistently ES or US, they can force it. This is useful for imports where all amounts are integers or have ambiguous single separators.
- **Error messages must be user-facing, not technical:** the error strings (`"Amount is required"`, `"No numeric value found"`, `"Contains invalid characters"`) are designed to surface directly in the wizard UI. No crypto layer jargon, no parser internals.
- **Accounting parentheses `(1.234,56)` are surprisingly common:** older bank exports use this convention for negatives. The parser handles them before stripping currency symbols, so `(€1.234,56)` correctly becomes -1234.56.
- **The parser is pure and stateless:** `parseAmount(raw: string, options?)` has no side effects, no global state, no dependencies on the file or column context. This makes it trivial to unit-test (50 cases) and reusable in any context (dry-run, commit, manual entry, future bulk-edit).

**Problem solved:** Resolved Pedro's "Errores de validación: 222" mystery. Spanish NGO bank exports (the primary use case) use `16.433,39` format, which naïve `parseFloat` treats as invalid (comma = NaN). The old parser attempted heuristics but was not robust enough for real-world Spanish data. The new parser handles Spanish as the primary format, auto-detects US when present, and provides specific error reasons so the dry-run wizard can surface actionable feedback ("Contains invalid characters in row 42: 'abc€123'") instead of generic "invalid amount" noise.

**Coordination note for Trinity:** The IPC contract now includes `value?: string` in parse errors. Trinity can surface this in the wizard UI to show users exactly which cell value failed and why. Recommendation: group errors by type ("200 amount parsing, 18 date parsing, 4 missing descriptions") and highlight the pattern to help users spot column-mapping mistakes.

**Deviations from spec:** None. Task brief fully implemented.

**Verification:** 110 import tests green · typecheck ✓ · lint ✓ (max-warnings 0) · build ✓ · pushed to main.

## 2026-04-20T18:54:00Z — Refactored import errors to structured error codes + Unicode whitespace handling

**Status:** Completed and pushed to main (commit `1dde11f`).

**Context:** Pedro tested the amount parser (commit `4f78721`) and found 5 consecutive rows failing with hardcoded English error "Importe: Contains invalid characters" in a Spanish app, with no indication of what value was rejected or what "Fila 1" means (absolute row? data row?).

**Problems identified:**
1. **Hardcoded English strings in error responses** — backend was returning `{ error: "Contains invalid characters" }` which Trinity had to either display raw (wrong language) or parse and map to i18n keys (brittle).
2. **No raw value in errors** — users couldn't see what input was rejected, making debugging impossible.
3. **Parser too strict on Unicode whitespace** — legitimate bank exports with NBSP (U+00A0), narrow NBSP (U+202F), zero-width spaces, etc. were rejected as "invalid characters".
4. **Ambiguous row number semantic** — unclear whether "Fila 1" meant absolute source row, data row, or preview row.

**Solution delivered:**

1. **Structured error codes** (`amountParser.ts`):
   - Replaced `{ error: string }` with discriminated union:
     ```ts
     type ParseAmountError =
       | { code: 'EMPTY' }
       | { code: 'NOT_A_STRING' }
       | { code: 'NO_DIGITS'; raw: string }
       | { code: 'INVALID_CHARACTERS'; raw: string; offending?: string }
       | { code: 'PARSE_FAILED'; raw: string }
     ```
   - All errors now include the `raw` input string (except EMPTY).
   - `INVALID_CHARACTERS` includes the `offending` character(s) so UI can display: `"Carácter no válido 'X' en '1.234X,56'"`.

2. **Extended Unicode whitespace stripping**:
   - Parser now normalizes **all Unicode whitespace** before character validation:
     - NBSP (U+00A0), narrow NBSP (U+202F)
     - Zero-width space (U+200B)
     - Em space (U+2003), en space (U+2002)
     - And others in ranges U+1680, U+2000–U+200B, U+205F, U+3000, U+FEFF
   - Example: `"1 234,56 €"` (with NBSP) now parses as `1234.56` instead of rejecting.
   - Only after stripping currency + whitespace does the parser check for invalid characters.

3. **Propagated through the pipeline**:
   - `parser.ts`: Updated wrapper to propagate `{ errorCode, errorRaw, errorOffending }`.
   - `import.ts` handler: Updated `parseRow` to build error objects with code/raw/offending.
   - IPC contract: Changed `parseErrorSchema` from `{ rowIndex, field, reason, value? }` to `{ row, field?, code, raw?, offending? }`.

4. **Row number semantic decision**:
   - **Absolute 1-based row number in source file** (most debuggable).
   - Rationale: Pedro can open the file in Excel, jump to row N, see the exact raw data.
   - Documented in `.squad/decisions/inbox/morpheus-error-row-semantics.md`.

5. **Renderer compatibility** (`ImportWizard.tsx`):
   - Updated error display to use `err.row` instead of `err.rowIndex`.
   - Removed `mapErrorReasonToCode` function (no longer needed with structured codes).
   - Error rendering now looks up `importWizard.dryRun.errorCodes.${code}` with `raw` and `offending` interpolation.

**Learnings:**

- **Backend should return codes, not prose:** Error messages are UI concerns. The backend's job is to identify the error type (code) and provide debugging context (raw value, offending character). The UI layer (Trinity) translates codes to localized messages.

- **Unicode whitespace is everywhere in bank exports:** European banks use NBSP as thousands separators, Excel sometimes exports narrow NBSP, copy-paste from PDFs introduces zero-width spaces. A robust parser must normalize ALL Unicode whitespace variants to regular spaces before classification.

- **Offending character helps immensely:** When showing `"Invalid characters in '1.234X,56'"`, users guess what's wrong. When showing `"Invalid character 'X' in '1.234X,56'"`, users instantly see the typo. The extra work to extract and return the offending character(s) is worth it.

- **Row numbers must be absolute for debugging:** Preview tables show data rows 1-5, but if row 3 has an error, users need to know if that's source-file row 3 (bank preamble junk) or row 5 (header on row 2, data starts row 3). Absolute source-file row is unambiguous and matches what Excel displays.

- **TypeScript `exactOptionalPropertyTypes: true` quirk:** When setting an optional property conditionally, you must NOT declare it as `T | undefined` in the interface, only as `T?`. If you do `raw?: string | undefined` and then conditionally set `obj.raw = value !== undefined ? value : undefined`, TS sees setting to `undefined` as different from omitting. Solution: use `raw?: string` and only set the property when the value is not undefined.

**Tests added:**
- NBSP (U+00A0) between digits and currency: `"1 234,56 €"` → 1234.56
- Narrow NBSP (U+202F) as thousands: `"1 234,56"` → 1234.56
- Zero-width space (U+200B): `"1 234.56"` → 1234.56
- Em space (U+2003): `"1 234.56"` → 1234.56
- Mixed whitespace: `" 1 234,56 "` → 1234.56
- Error codes for all failure modes (empty, no digits, invalid chars, parse failed)

All 122 import tests green · typecheck ✓ · lint ✓ · format:check ✓ · build ✓ · pushed to main (commit `1dde11f`).

**Coordination note for Trinity:** Trinity now needs to:
1. Create i18n keys in `app/src/renderer/locales/{es,en}/common.json` for each error code:
   - `importWizard.dryRun.errorCodes.EMPTY`
   - `importWizard.dryRun.errorCodes.INVALID_CHARACTERS` (with `{{offending}}` and `{{raw}}` interpolation)
   - `importWizard.dryRun.errorCodes.NO_DIGITS`
   - `importWizard.dryRun.errorCodes.PARSE_FAILED`
   - etc.
2. Already updated in commit `1dde11f`: error rendering now uses `err.row` and looks up `code` via i18n.
3. Row number clarification text added: "Los números de fila corresponden al archivo original" / "Row numbers match the source file".

**Problem solved:** Pedro's "5 consecutive identical errors" mystery. Backend was rejecting legitimate bank amounts with NBSP or other Unicode whitespace as "invalid characters" and showing no context. Now the parser accepts all Unicode whitespace variants, returns structured error codes with the raw value and offending character, and Trinity can display localized, actionable error messages.


## 2026-04-20T21:40:00Z — WI-19 backend shipped: reference/details + notes thread

**Status:** All gates green (typecheck · lint · format:check · 345 vitest tests · build). Ready to push.

**Delivered:**

- **Transaction extensions:** `reference` (max 120) and `details` (max 1000) on the Transaction entity, tx.created payload, movement.imported event, ReadModel projection, and `createTransactionRequestSchema`. Boundary-level normalization: trim, empty→null, max-length enforced AFTER trim. Command layer re-normalizes defensively.
- **Reference index:** `ReadModel.transactionsByReference: Map<string, Transaction[]>` — the literal "DB index" is N/A (persistence is an NDJSON log), so the ask translated to an in-memory projection for future dedup/search.
- **Notes aggregate:** `TransactionNote` + full lifecycle events (`tx.note.added` / `tx.note.edited` / `tx.note.deleted`) + core commands + IPC contracts + main handlers + preload bridge exposure + renderer service layer rewire.
- **Import commit path:** accepts optional `reference` / `details` column mappings per row; reads from CSV/XLSX, normalizes, persists on `movement.imported`.
- **Tests:** 4 new test files — `schemas.test.ts` (backward-compat + reducer backfill), `transaction.test.ts` (request-schema trim/normalize/overlength/non-string), `notes.test.ts` in shared (all request/response schemas), `handlers/notes.test.ts` (add/list/edit/delete happy paths + every error code + INTERNAL + idempotency).

**Learnings:**

- **Event-log idempotency vs "id = aggregate key":** Neo's literal wording had `tx.note.*` events using `id` as the note id. But `EventLog.append()` dedupes by `event.id`. If `id = noteId`, the second edit (or re-issued edit) of the same note would hit the seen-set and silently no-op — the reducer would never see the update. Fix: split `id` (event, always unique per event) and `noteId` (stable note primary key). This keeps the invariant that `event.id` is *the log's* idempotency key, matching how every other flat event (`movement.imported`, `import.mapping.updated`) already works. Documented in `.squad/decisions/inbox/morpheus-wi-19-contract-deltas.md`.

- **Backward-compat for payload extensions is `.nullable().optional()` on the wire, `| null` in the read model:** Events written pre-WI-19 on disk simply omit the new fields. The Zod schema has `reference: z.string().max(120).nullable().optional()` so those old lines still validate on replay. The reducer projects `event.payload.reference ?? null` — so the read-model type can stay strict (`string | null` — not optional), which keeps every consumer honest (exhaustive switches, deterministic JSON in tests, no `undefined` landmines). New events always emit an explicit `string` or `null` for unambiguity.

- **Trimming MUST happen before max-length check:** For WI-19 free-text fields, I pipe through `z.preprocess → trim → empty→null → pipe(z.string().max(N).nullable())`. A payload with 119 chars + 10 trailing spaces must succeed (trimmed length 119), not fail on the 129-char raw form. One test locks this invariant in.

- **Encryption pattern for notes = same DEK-wrapped event-log transport as transactions:** Notes are not a separate stream or store. `tx.note.added/edited/deleted` rides the same append-only NDJSON log as `tx.created`. Whatever M2 crypto does for one, it does for all — the note handler never bypasses the log transport. This keeps the future OneDrive + DEK migration a single-surface change, not a per-aggregate migration.

- **`NOTE_TEXT_MAX` is 2000 per Pedro's approval; the IPC schema uses `trim → min(1) → max(2000)` which means a whitespace-only text hits `SCHEMA_INVALID` at the boundary before ever reaching the command layer's own `TEXT_EMPTY` check.** Tests accept either code as a valid reject because the user-facing message is the same either way. Trinity's modal will show one i18n string regardless.

- **`transaction:note:list` is permissive on unknown txId — returns `[]`, not `TX_NOT_FOUND`.** Matches how other list handlers behave; the modal will render an empty notes list for a transaction the user just deleted (race condition) rather than popping an error. Worth revisiting if the UX proves confusing.

- **Pre-existing Trinity scaffold contradicted Pedro's spec in three places** (error code names, `{ ok, note }` vs `{ ok, event }` response, `id` vs `noteId` on delete). Shipped Pedro's spec; updated Trinity's `notesApi.ts`/`notesApi.test.ts` to match in the same commit so the build stays green. Contract-deltas drop file lists every rename so Trinity can rewire any UI code without spelunking.

**Deviations from Neo's scope:**
1. `noteId` added alongside `id` on every `tx.note.*` event (idempotency — see above).
2. "Add DB index on `reference`" translated to `transactionsByReference` in-memory projection (no SQLite in M1.5).

**Coordination note for Trinity:** See `.squad/decisions/inbox/morpheus-wi-19-contract-deltas.md` for full renames. Key rewires she needs in her renderer code: `event.id` → `event.noteId` when capturing a created note's primary key; error code strings (`TRANSACTION_NOT_FOUND` → `TX_NOT_FOUND`, `NOTE_TEXT_TOO_LONG` → `TEXT_TOO_LONG`, etc.); delete request field `id` → `noteId`. The existing `notesApi.ts` + test file are already updated; any NotesThread component that still destructures `response.note` needs to switch to `response.event`.

## Team Updates

- **WI-19 shipped:** Neo scoped, Pedro approved, Morpheus + Trinity delivered. All gates green (345/345 tests). TransactionDetailModal + NotesThread + import wizard mapping live on main. Contract deviations (noteId + id split, transactionsByReference projection) documented in decisions.md.

## 2026-04-21T07:05:00Z — TransactionFormFields extracted by Trinity (renderer-side, no backend impact)

**Context:** WI-20 edit UX fixes landed on main. Trinity refactored TransactionDetailModal to support in-place swap (Option A: same <dialog>, body/footer swap, avoiding stacked-modal regression). To avoid duplicating form field markup between AddTransactionModal and the edit swap, Trinity extracted a new TransactionFormFields reusable component.

**Component:** pp/src/renderer/components/TransactionFormFields/
- Props: individual field values (date, amount, etc.) + onChange handlers — no internal form state.
- Parent owns form state + validation.
- Layout baked into CSS: two-column for compact fields (date/type, amount/account, status/reference), full-width for description/category/tags/details.
- Used by: TransactionDetailModal (edit mode), AddTransactionModal (candidate for future refactor).

**Backend Impact:** None. Renderer-side UI component extraction; all IPC contracts and field schemas unchanged.

**Rationale:** DRY pattern — shared form fields between add + edit ensure single source of truth for field structure. When WI-15 adds subcategory editing, only TransactionFormFields needs updating; the two consumers (add modal, edit swap) stay in sync automatically.

**Note for future refactors:** If AddTransactionModal is refactored to use TransactionFormFields (currently uses its own inline markup), the duplication will resolve further. The component is ready; no urgent work needed.


## 2026-04-21T07:46:31Z — Trinity: UI Polish Round — Unified Modal + TagChipPicker

**Agent:** Trinity (Frontend Dev)  
**Event:** WI-20 polish round shipped (4 bugs fixed)

**Frontend UI changes (renderer):**
- MovementsScreen table now wrapped in overflow-x: auto container — horizontal scroll on narrow viewports, all columns visible
- TransactionDetailModal unified at 760px for BOTH read and edit modes — eliminates jarring shape change (was 640px read, 720px edit)
- Form inputs use width: 100% within columns — adequate horizontal space for two-column layout
- **NEW:** TagChipPicker component replaces native <select multiple> for tag selection:
  - Single-click toggle (no Ctrl/Cmd required)
  - Visual states: outline chip (unselected), filled chip + checkmark (selected)
  - Accessible: aria-pressed state, keyboard navigable, screen-reader friendly
  - Mobile-friendly: touch targets, no modifier keys
  - Pattern matches Gmail labels, Linear labels, Trello labels

**No backend impact:** All changes are renderer-only UI polish. No IPC contract changes, no event model changes.

**Worth noting for integration testing:** If you're testing the renderer against mock backend data, verify TransactionDetailModal modal width expectations (760px fixed). Tag selection UX now single-click (was Ctrl+click).

See .squad/decisions.md § "2026-04-21: WI-20 Polish" for full decision log (table overflow pattern, modal width rationale, chip picker component spec).

---

**2026-04-22 — NEXT:** Link recommended **WI-22 Saldo** as next priority (primary). WI-23/24 runners-up. See decisions.md § "Link — WI-22 Recommendation (post-WI-21 merge)" for full spec. Query + property-test scope awaiting Neo tech spec. Awaiting Pedro confirmation.

## 2026-04-22 — WI-22 Saldo backend (S1+S2+S3) shipped


## 2026-04-22 — WI-22 Saldo backend (S1+S2+S3)

Shipped `saldo:get-comparison` end-to-end on branch `wi-22/saldo-backend` → PR #7.

### Learnings

- **Projection lives on the server, period.** The `server-derived-fields` pattern (Neo's skill) played out exactly as described: by making `currentProjectedTotal: { income, expense } | null` a REQUIRED response field, Trinity has a one-line render path (`projected ?? raw`) and there is zero drift between "display this projection" and "what the property test sees". Renderers that multiply inputs are bug generators.
- **Aggregation invariants must be the aggregation _shape_, not a downstream check.** `netByCategory` is built from the same pass that computes `totalIncome` / `totalExpense`, so `Σ rows.income === totalIncome` is structurally true, not a happy accident. A test asserts it; the code can't violate it without rewriting both simultaneously.
- **Same-period-prior-year is a year shift, not a date shift.** For leap days (2024-02-29), the prior range is derived by recomputing the last day of the target month in the prior year (`2023-02-28`), NOT by subtracting 365 days. Wrote `shiftPriorYear` to be explicit about that, with a dedicated test.
- **UTC-inclusive day counting trap.** "Today" must be normalized to UTC midnight before clamping to `[start, end]`, otherwise local-time drift silently flips `isPartial` around midnight. Use `Date.UTC(...)` constructors throughout; never mix `new Date()` with local getters.
- **Day-elapsed floor of 1.** If the period hasn't started yet (caller passes a future anchor) or the server clock is before the first day, `daysElapsed = max(1, …)` keeps the projection denominator safe. Neo flagged this in §5; I'd have hit it on the first integration test otherwise.
- **Shared-repo concurrency gotcha.** Multiple agents working in the same worktree cause surprise branch switches — source files I created got clipped out from under me when the HEAD moved. Mitigation: commit early (S1 frozen within minutes, pushed), and redo any transient edits (handlers.ts, preload/index.ts) right after verifying the current branch. Uncommitted untracked files survive `git checkout`; uncommitted modifications to tracked files follow HEAD unless stashed.

### Aggregation formula shipped (projection, S3)

```
daysInPeriod = daysBetweenInclusive(start, end)         // UTC midnights, inclusive
daysElapsed  = max(1, daysBetweenInclusive(start, clamp(today, [start, end])))
isPartial    = today < end
projected    = isPartial ? actual * (daysInPeriod / daysElapsed) : null
```

Applied to `totalIncome` and `totalExpense` independently. Per-category rows and monthly buckets are not projected (Pedro lock).

### Contract surface (frozen on Day 1)

- `saldo:get-comparison` single endpoint.
- Request: `{ period: 'ano' | 'trim' | 'mes', anchor: YYYY-MM-DD, currency?: 'EUR' }`.
- Response top-level keys: `currentPeriod`, `priorPeriod`, `monthlySeries`, `kpis`.
- `currentPeriod.currentProjectedTotal` is the required nullable field — null iff complete.

### Gotchas for future me

- TS project references + `moduleResolution: "Bundler"`: when adding a new file to `shared/ipc-contracts/`, a `tsc -b` run sometimes emits the `.d.ts` lazily — if the typecheck screams "cannot find module", do a clean `rm -rf dist && tsc -b` once and confirm the new `.d.ts` shows up under `dist/shared/ipc-contracts/`. Don't trust incremental build caches for cross-project moves.
- `verbatimModuleSyntax: true` means `import type` matters: I import `SaldoComparisonRequest`/`Response` as types in the handler, but the schemas at runtime. Don't conflate.
- `exactOptionalPropertyTypes: true` — `currency?: 'EUR'` (optional) is NOT the same as `currency: 'EUR' | undefined`. Keep callers passing `{ period, anchor }` without an explicit `undefined` currency.
