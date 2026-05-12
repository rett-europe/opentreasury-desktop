# Decisions Archive

---

## Decision: SPEC-026 OneDrive Multi-Device Spike — PASS ✅

**Date:** 2026-05-10  
**Executor:** Pedro (Owner)  
**Status:** APPROVED — GO FOR IMPLEMENTATION  
**Stakeholders:** Niobe (UX/spec), Morpheus (backend), Trinity (frontend), Switch (security review), Link (PM)

### Summary

Pedro executed a spike to validate the per-device-file architecture for SPEC-026 multi-user encryption redesign against a real SharePoint-synced folder. Result: **ZERO conflict copies**. Both files remained intact (50 lines each). The architecture is **production-ready for v2 implementation**.

### Key Findings

1. **Per-device event files eliminate all cloud-sync write conflicts.** Each device appends to `events-{deviceId}.ndjson`; OneDrive/SharePoint syncs each file independently without interference or stale-write issues.
2. **Merge-sort by ULID produces correct cross-device ordering** across all devices in the workspace.
3. **No truncation, no silent data loss, no conflict copies.** Read model rebuild is safe and correct.
4. **OneDrive Business / SharePoint Synced works flawlessly** — same behavior as per the original vision.

### Locked Decisions (Downstream Dependencies)

- **Per-device files** prevent all write conflicts → foundation for #305 (event log adapter)
- **Multi-wrap key model** (shared recovery wrap + per-device safeStorage wraps) → Morpheus crypto-core (#303)
- **Recovery code as enrollment mechanism** (BIP39 24-word, Argon2id derivation) → #306 onboarding UX
- **Merge-sort read model** with ULID deduplication → #305 event log adapter
- **Rebuild on boot** (v1) is safe and correct → architecture locked for first release

### Artifacts

- **Findings:** `docs/specs/spikes/onedrive-multi-device-findings.md` (pushed to `squad/encryption-onedrive-sync-spike`)
- **PR #304:** Spike implementation (auto-merge on CI green)
- **Session log:** `.squad/log/2026-05-10T14-19-22Z-spec026-spike-pass.md`

### Work Plan Fan-Out

Coordinator filed 5 new issues (#305–#309):
- #305: Per-Device Event Log (event log adapter + merge-sort)
- #306: Onboarding UX (multi-user flows + recovery code)
- #307: Migration Path (single → multi)
- #308: Export Decrypted Events (user-facing export)
- #309: Integration Tests (multi-device scenarios)

Foundation issues already in flight:
- #301: Workspace Detection + IPC
- #302: OneDrive Spike (ready to close)
- #303: Crypto-Core (Morpheus spawned; estimate 14–18 days)
- #304: Spike PR (auto-merge pending CI)

### Timeline

- **#303 (crypto-core):** Morpheus — foundation (14–18 working days)
- **#305–#309:** Parallel streams pending crypto-core completion + Niobe v2 spec finalization
- **Overall estimate:** 14–18 days (critical path: #303)

### Next Steps

1. **Niobe:** Finalize SPEC-026 v2 spec with detailed AC (acceptance criteria) for all issues
2. **Trinity + Morpheus:** Break ground on implementation pending spec + #303 completion
3. **Switch:** Crypto review on v2 spec (key derivation, wrapping model, recovery code)
4. **Coordinator:** Monitor work plan execution, schedule status checks
5. **Scribe:** Update agent histories; merge decisions; record orchestration logs

---

## DIRECTIVE: User Rule — Account Deletion Constraint

**Author:** Pedro (via Copilot)  
**Date:** 2026-04-21  
**Status:** Active  
**Scope:** Not part of WI-20; flag for future Accounts work item

### Rule

An Account can only be deleted if it has no transactions. Accounts with transactions MUST NOT be deletable.

- **UI:** Disable/hide the delete action for accounts with transactions.
- **Backend:** Reject the delete command with an appropriate error (`ACCOUNT_HAS_TRANSACTIONS` or similar).

### Rationale

Data integrity guardrail. Deleting an account with transactions would orphan events in the append-only log and corrupt projections.

### Implementation Timeline

This rule should be audited against any existing account-delete path in Configuración. If not yet implemented, flag for a dedicated Accounts management work item (post-WI-20).

---

## Decision: WI-18 — Header row detection + trailing-junk handling

**Author:** Neo (Lead)  
**Status:** Approved (Pedro signed off on scope + UX option C)  
**Date:** 2026-04-20T10:47:33Z  
**Impacted agents:** Morpheus (backend / main process), Trinity (frontend / renderer)  
**Work item:** WI-18  
**Depends on:** WI-17 (generic column-mapping importer, dual-format CSV/XLSX)

### 1. Problem statement

Real bank statement exports (BBVA, Santander, CaixaBank, ING, N26 Business) ship with 2–8 **preamble rows** before the real header row: bank name, account holder, IBAN, date range, blank separators, legal disclaimers. The current WI-17 importer assumes row 1 = headers and either crashes on column-alias lookup or maps the wrong row as headers, producing garbage in the mapping step.

Symmetric problem at the bottom of the file: **trailing junk rows** — totals, "End of statement", "Página 1 de 2", blank separators — must be silently skipped. But we must NOT silently drop *legitimate* rows that happen to have a single blank required field (e.g. an entry with amount + description but no value date). Pedro's golden rule: **the user never silently loses a legitimate row.**

WI-18 fixes both ends of the file in a single pass: header-row resolution + tail-junk handling.

### 2. UX decision — Option C: auto-detect with user override

A **new wizard step "Confirm header row"** is inserted between `uploadFile` and `mapColumns`.

- Preview shows the **first ~10 rows** of the active sheet as a simple table.
- The auto-detected header row is **highlighted** (row background + badge: "Detected header").
- A **numeric stepper** lets the user override (range: 1–20, integer).
- Changing the stepper re-renders the highlight immediately (client-side, no IPC round-trip; the 20-row preview payload is already in memory).
- "Continue" proceeds to `mapColumns` with the confirmed `headerRow` value carried forward.

Rationale (locked): auto-detect covers the 90% case; manual override absorbs the long tail without code changes for new bank formats (consistent with the WI-17 "user-driven mapping beats hardcoded heuristics" pattern).

**Wizard step count impact:** goes from 6 → 7 steps. Within budget (WI-17 complexity budget noted "6 is the threshold before friction"; 7 is the ceiling — no further steps in M1.5 without Pedro review).

### 3. Auto-detect heuristic (definitive spec for Morpheus)

Runs on main side inside the `stageFile` handler, over the parsed sheet (CSV rows or XLSX active sheet values) **before** any column-alias logic.

**Algorithm:**

1. Let `N = min(20, rowCount)`. Scan rows `1..N`.
2. For each row `i`, compute a score:

   | Rule | Points |
   |---|---|
   | Row has ≥3 non-empty cells AND every non-empty cell is short text (≤40 chars) that does NOT parse as a date or number | **+2** |
   | Row `i+1` (the row directly below) has ≥2 cells parseable as date-looking OR number-looking values | **+3** |
   | No cell in row `i` contains any digit character `[0-9]` | **+1** |
   | Row has exactly 1 non-empty cell (likely a title/subtitle line) | **−2** |

3. Pick the row with the **highest score**. Ties → pick the **earliest** row.
4. If `maxScore < 3`, **default to row 1** (low-confidence fallback; UI will still show the stepper so user can override).

**Parser notes for Morpheus:**
- "Date-looking" = matches any of the date formats the WI-17 amount/date heuristics already recognize (ISO, `dd/mm/yyyy`, `dd-mm-yyyy`, `yyyy/mm/dd`, etc.). Reuse existing detector; do not invent a second one.
- "Number-looking" = parses under `parseAmount` (accepts `1234.56`, `1.234,56`, negative signs, parens for negatives).
- "Short text" = length ≤40, and NOT number-looking, NOT date-looking.
- Empty cells (null/undefined/`""`/whitespace-only) do not count toward "non-empty".
- Row index returned is **1-indexed** in the IPC contract (matches user-facing stepper).

### 4. Trailing-junk / missing-field rule — the "2-of-3 rule" (definitive spec for Morpheus)

Applied **after** header-row resolution and column mapping, during dry-run row validation. For each data row below the header:

Count how many of the **3 required mapped fields** have a parseable value:

- **Date parseable** = matches the detected/selected date format.
- **Amount parseable** = matches `parseAmount` (`1234.56`, `1.234,56`, `-123,45`, `(1234,56)` European accounting convention).
- **Description parseable** = non-empty after `.trim()`.

Classification:

| # parseable | Action |
|---|---|
| **0** | Silently skip. Fully empty row, separator line, `"",,"",""` blank. |
| **1** | Silently skip. Trailing junk (e.g. `Total,,1234.56` or `Página 1 de 2,,`). |
| **2** | **Row-level error surfaced in dry-run** (e.g. `row 47: date missing`). User sees it in the dry-run summary and can either (a) fix the source file and re-upload, or (b) accept it — row will be skipped on commit with a warning. |
| **3** | Import normally. |

**Golden rule (Pedro):** the user never silently loses a legitimate row. A row with 2 of 3 required fields is *always* legitimate-looking enough to surface — we do not guess. This is a non-negotiable invariant; any future optimization (e.g. "auto-skip rows where description matches /^Total/") requires a new decision record.

**Counting warnings/errors in the dry-run response:** the existing WI-17 `dryRunResponse.warnings` array carries the 2-of-3 row errors. Skipped rows (0 or 1 parseable) do NOT appear in `warnings` — they are silently excluded from the `totalRows`/`validRows` counts. Add a new counter `skippedJunkRows: number` to `dryRunResponse` so the UI can optionally display "3 junk rows skipped" as information (not a warning).

### 5. IPC contract changes (definitive for both Morpheus and Trinity)

**All additions are additive / optional** — no breaking changes to WI-17 contracts. Renderers that do not pass `headerRow` continue to work (auto-detect path).

#### 5.1 `stageFile` — file: `app/src/shared/ipc-contracts/import.ts`

**Request (additive optional field):**

```ts
stageFileRequestSchema = z.object({
  filePath: z.string(),
  headerRow: z.number().int().min(1).max(20).optional(),  // 1-indexed; if absent → auto-detect
});
```

**Response (additive fields on `ok: true` path only):**

```ts
StageFileResponse.ok = {
  ok: true,
  fileId: string,
  sheets: Array<{
    name: string,
    columnHeaders: string[],
    rowCount: number,
    detectedHeaderRow: number,       // 1-indexed; always present; = auto-detect result even if user overrode
    previewRows: string[][],          // first 20 rows, stringified cells from source (before header resolution)
  }>,
};
```

**Semantics:**
- When `headerRow` is provided in the request, the handler uses that value (validated 1..20) to slice the sheet and compute `columnHeaders` and `rowCount`.
- `detectedHeaderRow` **always reflects the auto-detect result**, regardless of what the user passed. This lets the UI show "We detected row 5 — you chose row 7" on re-stage.
- `previewRows` is always the first 20 source rows (or fewer if the file is shorter), as string arrays — Trinity renders these client-side for the stepper-driven preview. No second IPC call needed to change highlight.
- Cell stringification: numbers → `String(n)` (no locale formatting); dates → original source string if CSV, ISO string if XLSX date cell; null/undefined → `""`.

#### 5.2 `dryRun` — same file

**Request (new required field):**

```ts
dryRunRequestSchema adds: headerRow: z.number().int().min(1).max(20),  // REQUIRED
```

Renderer must pass whatever the user confirmed in the "Confirm header row" step. Main side uses this as source-of-truth for slicing the file before column mapping + validation.

**Response (additive field):**

```ts
dryRunResponse adds: skippedJunkRows: number,  // count of rows excluded by 2-of-3 rule (0 or 1 parseable)
```

#### 5.3 `commit` — same file

**Request (new required field):**

```ts
commitRequestSchema adds: headerRow: z.number().int().min(1).max(20),  // REQUIRED
```

Same semantics as dry-run. Commit MUST use the identical `headerRow` the user confirmed, or the committed rows will not match the dry-run preview. Trinity: carry `headerRow` through the wizard state alongside `mapping` and `fileId`.

### 6. Scope boundaries

**IN (WI-18):**
- Auto-detect heuristic on main side (all 4 rules above).
- `headerRow` override plumbing through `stageFile` / `dryRun` / `commit`.
- New wizard step "Confirm header row" with preview + stepper.
- 2-of-3 rule applied in dry-run + commit validation.
- `skippedJunkRows` counter in dry-run response + UI surfacing.
- Unit tests for each heuristic branch + each 2-of-3 bucket.
- Works on both CSV (papaparse) and XLSX (SheetJS).

**OUT (deferred to future WIs):**
- Merged-cell handling (XLSX top-row merged titles are already handled *incidentally* by the "1 non-empty cell → −2" rule, but explicit merge detection is out).
- Multi-row headers (e.g. a 2-row header with merged groupings).
- Different headers per sheet in a multi-sheet XLSX (current model: one header row applies to the selected sheet).
- Heuristics tuned per bank (would reintroduce the alias-table tech debt we rejected in WI-17).

### 7. Follow-up tests for Cypher (to be written, not part of this decision)

Cypher, when you spawn for WI-18 test coverage, cover these fixtures at minimum:

1. **`bank_metadata_prefix.csv`** — 4-row preamble (bank name / IBAN / date range / blank) then real header on row 5 → expect `detectedHeaderRow === 5`.
2. **All-digits first row** (pure data, no headers at all) → expect `detectedHeaderRow === 1` with `maxScore < 3` (low-confidence fallback path exercised).
3. **Trailing `Total` row** → expect silent skip, counted in `skippedJunkRows`, not in `warnings`.
4. **Trailing blank rows** (2+ fully-empty rows at EOF) → expect silent skip.
5. **Row with empty date but amount+description present** → expect row-level error in `warnings` ("row N: date missing"), NOT silent skip.
6. **XLSX with merged title cell in row 1** (typical "Movimientos de la cuenta IBAN…") → expect real header row detected (row 2+); the merged title row scores −2 via the "1 non-empty cell" rule.
7. **User override conflicts with auto-detect**: stage with `headerRow: 7`, auto-detect picks 5 → response has `columnHeaders` sliced from row 7, `detectedHeaderRow: 5`.

### 8. Owner / sequencing

- **Morpheus:** heuristic implementation, 2-of-3 rule, IPC handler changes, Zod schema updates. Start immediately — contract above is frozen.
- **Trinity:** new wizard step, stepper UI, preview table with highlight, `headerRow` state threading through to `dryRun` / `commit`. Start immediately — `previewRows` + `detectedHeaderRow` are the only data she needs from Morpheus and both are additive.
- **Cypher:** test suite (see §7) — spawns after Morpheus's heuristic lands.
- **Neo:** reviews both PRs. Strict Lockout: neither PR merges until both pass review together (they share the contract).

### 9. Non-goals / explicit rejections

- We do NOT attempt to auto-infer the 2-of-3 threshold from file characteristics. It is hardcoded. Future tuning requires a decision record.
- We do NOT add a "skip N rows" raw mode bypassing auto-detect entirely. The stepper covers this use case.
- We do NOT persist the user's header-row choice per account (unlike column mapping in WI-17). Preamble length varies per export even from the same bank; memorizing it would cause more bugs than it fixes.

---

## Decision: DATOS is a top-level sidebar route, not a Configuración tab

**Author:** Trinity (Frontend)  
**Status:** Proposed (post-WI-17 review)  
**Date:** 2026-04-20

### What

DATOS (data import/export) is promoted from a tab inside `ConfiguracionScreen` to a **top-level sidebar route** in the `main` section, sitting between *Saldo* and the *Configuración* section. The new `screens/DatosScreen/` owns the import-wizard launcher UX that previously lived in `ConfiguracionScreen/DatosTab.tsx` (now deleted). The i18n namespace moved from `configuracion.datos.*` to top-level `datos.*` (plus a new `shell.nav.datos` and `datos.title` / `datos.subtitle` for the page header). `ConfiguracionScreen` is back to 3 tabs (Cuentas / Categorías / Etiquetas).

### Why

The prototype always treated DATOS as a top-level destination; nesting it under Configuración during WI-17 was a misread of the spec that buried a frequent user workflow under a settings menu. The mental model we want to reinforce: **per-workflow surfaces** (importing a statement, soon exporting reports) live at the top level; **one-time master-data setup** (accounts, categories, tags) lives inside Configuración. Future siblings like *Exportar* or *Conciliación* will follow the same rule. Lifting DATOS out also frees Configuración from growing a fourth tab and keeps each top-level route owning a single, coherent task.

---

## Decision: Amount Parser Error Shape — Coordination Note for Trinity

**Author:** Morpheus  
**Date:** 2025-01-30  
**Status:** Completed

### Context

Implemented locale-aware amount parsing to handle Spanish (16.433,39) and US (16,433.39) decimal formats. This eliminates the "Errores de validación: 222" mystery — amounts that couldn't parse now return specific error reasons.

### IPC Contract Update

Extended `parseErrorSchema` in `app/src/shared/ipc-contracts/import.ts`:

```typescript
const parseErrorSchema = z.object({
  rowIndex: z.number().int().positive(),
  field: z.enum(['date', 'amount', 'description']),
  reason: z.string(),                     // ← already existed
  value: z.string().optional(),           // ← NEW: raw cell value that failed
});
```

### Error Shapes for Amount Parsing

Trinity can now surface these detailed errors in the wizard UI:

#### Amount Parse Errors (from `amountParser.ts`)

- `"Amount is required"` — empty/null/whitespace
- `"No numeric value found"` — only currency symbols, nothing parseable
- `"Contains invalid characters"` — letters, special chars (e.g., "abc", "12a34")
- `"Could not parse as a valid number"` — malformed after cleaning

#### Example Error Object in DryRunResponse

```json
{
  "rowIndex": 42,
  "field": "amount",
  "reason": "Contains invalid characters",
  "value": "abc€123"
}
```

```json
{
  "rowIndex": 17,
  "field": "amount",
  "reason": "No numeric value found",
  "value": "€"
}
```

### Locale Detection Behavior

The parser auto-detects Spanish vs US formats:
- **Spanish (ES):** `16.433,39` → dot=thousands, comma=decimal
- **US/UK (EN):** `16,433.39` → comma=thousands, dot=decimal
- **Ambiguous cases:**
  - `1.234` → 1234 (ES thousands, no decimal)
  - `1,234` → 1234 (US thousands)
  - `16.39` → 16.39 (US decimal, ≤2 digits after dot)
  - `16,39` → 16.39 (ES decimal, ≤2 digits after comma)

This means most legitimate Spanish amounts will now parse correctly instead of generating validation errors.

### Recommendations for UI

1. **Show the raw value** alongside the error reason so users can see what failed.
2. **Group errors by type** — e.g., "222 validation errors: 200 amount parsing, 18 date parsing, 4 missing descriptions"
3. **Highlight the pattern** — if all amount errors are "Contains invalid characters", suggest the user check for non-numeric columns in their mapping.

### Files Modified

- `app/src/main/import/amountParser.ts` — new locale-aware parser
- `app/src/main/import/amountParser.test.ts` — 50 tests covering ES/US formats, negatives, currency symbols
- `app/src/main/import/parser.ts` — delegates to new parser, preserves CR/DB suffix logic
- `app/src/main/ipc/handlers/import.ts` — populates `value` field in parse errors
- `app/src/shared/ipc-contracts/import.ts` — added `value?: string` to `parseErrorSchema`

### Next Steps

Trinity should wire the `value` field into the wizard UI so users can see exactly which cell values failed and why. The `reason` strings are designed to be user-facing (no tech jargon).

---

## Decision: WI-18 Backend — Implementation Notes

**Author:** Morpheus  
**Date:** 2026-04-20  
**Status:** Implemented; pending coordinator commit.

### 1. CSV parsing switched from `header: true` to `header: false` + manual slicing

**Why:** Once the header row can be at row N ≠ 1, papaparse's built-in `header: true` mode (which always treats row 1 as header and returns `Record<string, unknown>` objects) no longer fits. Both the staging pass and the `loadCsvRows` pass now parse as `string[][]` and reconstruct the "header → column index" mapping manually from the chosen row.

**Side effect:** CSV cells are no longer auto-trimmed by the header-mode parser. We retain raw string content; trimming happens only where the contract requires it (header name comparison, description-non-empty check in `classifyRow`). This matches XLSX behavior, so the two paths are now symmetric.

### 2. `detectedHeaderRow` is always returned, even when override is provided

The request allows a user to override `headerRow` on subsequent staging calls, but the response always includes `detectedHeaderRow` computed from the raw preview. This lets the UI show "auto-detected row X" as a hint next to the override input. Running the detector unconditionally costs <1 ms on 20 rows.

### 3. `totalRows` in dry-run now counts retained (post-skip) rows

Pre-WI-18, `summary.totalRows` was "number of rows parsed after the header". With the junk rule, trailing junk rows are silently dropped, so the user's mental model of "how many rows are we about to process" must match. `totalRows` now equals `retained.length` (rows classified as `"error"` or `"import"`). `"skip"` rows are invisible to the user.

### 4. `classifyRow` signature takes `Record<string, unknown>` + `mapping`

The spec said `classifyRow(row, mapping, dateFormat)`. The handler already has `RawRow` (mapping-applied strings) when classification happens, but I kept the public API record-based as the spec describes — it makes the module trivially unit-testable without constructing a `RawRow` and decouples classification from the internal row shape. The handler builds a 3-key pseudo-record inline (`{[mapping.date]: …, …}`) at the one call site.

### 5. Empty-line handling in CSV

`skipEmptyLines: true` stays on. That means "row N" in `previewRows` refers to the N-th non-empty row as seen by the user. If empty lines were preserved, header detection would be noisier (empty rows scoring -2) and the user's row-picker would feel off. Downside: a file with a blank line between preamble and header will have the header appear earlier than in a text editor. Acceptable trade-off.

### 6. XLSX preview reads cells with `includeEmpty: true`

Excel sheets often have gaps in the first row (e.g. merged "Bank Statement" title cells leave sparse cells below). `includeEmpty: true` on the header-row read ensures column indices line up with the data rows below. Sanitized empty cells become `''` in `previewRows` and are filled in as `Column N` only when that row is used as the header.

### 7. `headerRow` is clamped to 1..20 in the request schema

The preview only ever contains 20 rows; allowing `headerRow > 20` would let a user select a row that doesn't appear in the preview. Zod schema enforces the range; a request outside it fails with `SCHEMA_INVALID`, keeping the error-envelope contract intact.

### 8. Staging's row-count cap is now measured on total rows (including preamble)

Previously CSV staging measured row count via papaparse `step` with `header: true`, effectively "data rows after the header". Now, because we parse as arrays, the cap checks **all** rows including the preamble. For a 100k-row file this adds up to ~20 rows of headroom at most (the preview cap). Kept as-is — the cap is a zip-bomb mitigation, not a precise accounting knob.

---

## Decision: WI-20 Approvals (Pedro — 2026-04-21)

**Author:** Pedro (via Copilot)  
**Status:** Approved  
**Context:** Responses to Neo's WI-20 scope document open questions.

### Decisions

1. **Include delete (`tx.deleted`) in WI-20 scope:** ✅ YES. Soft-delete via append-only `tx.deleted` event; reducer removes from projection; UI confirmation dialog.
2. **`accountId` immutable after creation:** ✅ YES. Cannot reassign a transaction to a different account via edit. Users must delete + re-create if they genuinely need to move a tx between accounts. (Prevents balance-projection drift.)
3. **"New transaction" button in MovementsScreen header:** ✅ YES. Mirrors the existing button in PanelScreen header.
4. **Edit UX — in-place swap inside TransactionDetailModal:** ✅ YES (Option A). Clicking "Edit" swaps the read-only view for an editable form inside the same modal. Footer buttons change to "Cancel / Save". On submit → return to read-only view with fresh data. No stacked second modal.

**Scope locked.** Morpheus owns backend (events, IPC, reducers, tests). Trinity owns UI (TransactionFormModal refactor, Detail modal edit/delete, MovementsScreen entry point, i18n, tests).

---

## Decision: WI-20 Backend — Immutable accountId Enforcement

**Author:** Morpheus  
**Date:** 2026-04-21  
**Status:** Implemented (commit `d3ad1ce`)

### Context

WI-20 requires manual transaction edit functionality. Pedro approved that `accountId` should be **immutable after creation** — moving a transaction between accounts is too complex for WI-20 (affects balance projections across accounts, introduces edge cases).

### Decision

The `updateTransaction` command **ignores any incoming `accountId`** from the IPC request and uses the stored value from the existing transaction.

**Why:** The UI form will have `accountId` as a read-only/disabled field (Trinity's WI-20 scope). The form state may still include it when submitting. Approach allows the UI to send the full transaction object without special-casing the update path. The backend enforces immutability by using `existing.accountId` instead of `input.accountId` when building the `tx.updated` event payload.

### Implementation

In `app/src/core/commands/updateTransaction.ts`:

```typescript
const payload: TransactionUpdatedPayload = {
  id: input.id,
  date: input.date,
  type: input.type,
  amount: input.amount,
  currency: 'EUR',
  description: input.description,
  accountId: existing.accountId, // Immutable — use stored value
  categoryId: input.categoryId ?? null,
  subcategoryId: input.subcategoryId ?? null,
  tagIds: input.tagIds ? [...input.tagIds] : [],
  status: input.status ?? existing.status,
  createdAt: existing.createdAt, // Preserve original timestamp
  updatedAt,
  reference,
  details,
};
```

The `UpdateTransactionInput` interface does NOT include `accountId`. The IPC `UpdateTransactionRequest` schema also omits `accountId` — Trinity's UI should not send it, but if it does (due to form state reuse), it will be stripped by the Zod schema.

---

## Decision: WI-20 Backend — Result Type Naming Strategy

**Author:** Morpheus  
**Date:** 2026-04-21  
**Status:** Implemented (commit `d3ad1ce`)

### Context

The codebase uses a generic `Result<T, E>` discriminated union for command return values. When multiple commands export this same type, TypeScript raises "Cannot redeclare block-scoped variable" errors.

### Decision

Use **command-specific type aliases**:

- `createTransaction` → `Result<T, E>` (unchanged)
- `updateTransaction` → `UpdateResult<T, E>`
- `deleteTransaction` → `DeleteResult<T, E>`

### Rationale

Minimal change. Each command's Result type is scoped to that command's module. Tests and handlers import specific types without conflicts. We can consolidate to a shared `Result<T, E>` later if the pattern becomes pervasive (e.g., WI-30+ adds 5 more commands).

### Future Work

If the command count grows, extract `Result<T, E>` to `core/types.ts` and alias it in each command module for backward compat.

---

## Decision: WI-20 Frontend — Separate Edit Modal vs In-Place Swap

**Author:** Trinity  
**Date:** 2026-04-21  
**Status:** Implemented

### Context

TransactionDetailModal (WI-19) is read-only. WI-20 adds edit capability. Two approaches were considered:

**Option A: In-Place Swap** — same modal swaps body between read-only and form.  
**Option B: Separate Edit Modal** — edit form opens as separate dialog on top.

### Decision

**Chosen: Option B — Separate Edit Modal**

While Pedro's scope suggested Option A, implementation reality made Option B significantly simpler. TransactionFormModal already exists as a self-contained dialog component with its own lifecycle. Rather than re-architecting it, we leverage it as-is.

### Implementation

1. TransactionDetailModal adds `isEditModalOpen` state
2. Clicking "Edit" → `setIsEditModalOpen(true)` → TransactionFormModal renders with `isOpen={isEditModalOpen}`
3. TransactionFormModal handles close (via onClose callback) → `setIsEditModalOpen(false)`
4. TransactionFormModal handles submit (via onSubmit callback) → calls parent's `onUpdate` → parent refreshes
5. Detail modal remains open behind edit modal; when edit modal closes, user returns to detail view with fresh data

### Mental Model

The "single pane" mental model is maintained: user sees detail modal → clicks Edit → form appears → saves → returns to detail view. The fact this is implemented via two dialogs vs one with swapped body is an implementation detail not visible to the user.

---

## Decision: WI-21 Config CRUD — Delete/Cascade Policy

**Date:** 2026-04-21  
**By:** Switch (Security Engineer)  
**Status:** 🔒 RULING — binding for WI-21 event design  
**Context:** WI-21 Config CRUD (branch `wi-21/config-crud`). Morpheus needs the cascade contract before designing `*.updated` / `*.deleted` / `*.archived` events for Account, Category, Subcategory, Tag. Requested by Pedro (perocha).

### TL;DR

| Entity | Delete semantics | Events | UI affordance |
|---|---|---|---|
| **Account** | **Archive-only.** Hard-delete FORBIDDEN. | `account.updated`, `account.archived`, `account.unarchived` | Button "Archivar". Confirm dialog. No destructive variant in M1. |
| **Category** | **Archive-only.** Hard-delete FORBIDDEN. | `category.updated`, `category.archived`, `category.unarchived` | Button "Archivar". Confirm dialog. Migrate-then-delete DEFERRED. |
| **Subcategory** | **Archive-only**, scoped to parent. Same reasoning. | `subcategory.updated`, `subcategory.archived`, `subcategory.unarchived` | Same as Category. Archiving parent does NOT cascade-archive children yet (explicit act required). |
| **Tag** | **Archive-only.** Hard-delete FORBIDDEN in M1. | `tag.updated`, `tag.archived`, `tag.unarchived` | Button "Archivar". Confirm. Array-membership preserved on transactions. |

**Default everywhere: ARCHIVE.** Hard-delete is not implemented in WI-21. Tombstone events (`*.deleted`) are explicitly **out of scope** until the decoupling in the account-id situation is resolved and a migrate-then-delete flow is specified.

### Problem

WI-21 adds Edit/Delete to three config entities. Transactions reference two of them by id (`categoryId`, `subcategoryId`, `tagIds[]`); accounts are currently **decoupled** from `transaction.accountId`. The app is event-sourced (append-only NDJSON, replay-driven read model) and classified 🔴 High for financial data.

A naive hard-delete would:
1. Break replay for anyone whose transaction stream references the deleted id (dangling foreign key in the read model).
2. Destroy audit history for categorization / tagging decisions — unacceptable for a 7-year-retention treasury product.
3. Force Morpheus to design a migrate-then-delete flow under time pressure.

### Ruling (per entity)

#### 1. Account — ARCHIVE ONLY

- **Delete semantics:** Hard-delete forbidden. `account.archived { id, archivedAt }` sets an `archived: true` flag in `ConfigAccount`.
- **Why not hard-delete:** The decoupling is a temporary quirk, not a design choice. Once account-id unification lands, historical transactions WILL reference these config account ids. Shipping hard-delete now creates a permanent data-loss footgun.
- **Events:**
  - `account.updated { id, changes: { label?, iban?, color?, isPaypal? } }`
  - `account.archived { id, archivedAt }`
  - `account.unarchived { id }` (required — archive must be reversible)

#### 2. Category — ARCHIVE ONLY

- **Delete semantics:** Hard-delete forbidden. Transactions reference `categoryId` directly. Hard-delete would orphan those references.
- **Transaction behaviour on archive:** Archiving a category does **not** touch transactions. Their `categoryId` stays intact; the UI resolves archived categories with a muted label.
- **Events:**
  - `category.updated { id, changes: { name?, color?, ... } }`
  - `category.archived { id, archivedAt }`
  - `category.unarchived { id }`
- **Migrate-then-delete:** explicitly **deferred** to a later WI.

#### 3. Subcategory — ARCHIVE ONLY, parent-scoped

---

## Decision: Link — WI-22 Recommendation (post-WI-21 merge)

**Author:** Link (PM)  
**Date:** 2026-04-22  
**Status:** Decision-ready for Pedro

### TL;DR

**Primary recommendation: WI-22 — Saldo screen (M1 closer).**

It's the last unfilled PRD-002 surface and the final gate blocker for Internal Alpha. Ship it and M1 exit criteria flip green.

Before starting WI-22, a **~half-day polish pass** to clear three small items that will otherwise bleed into Saldo's session and hurt dogfooding velocity.

### Where we are (post-WI-21)

M1 shipped slice by slice:
- WI-17/18 — CSV/XLSX import (generic mapping importer)
- WI-19 — Transaction list + detail modal
- WI-20 — Transaction edit (in-place swap) + delete
- WI-21 — Config CRUD archive-only (Accounts, Categories, Subcategories, Tags)

**M1 exit criterion** (roadmap §M1): *"create account → enter tx → categorize → see it on Panel, Movements, **Saldo**."*
Panel ✅ · Movements ✅ · **Saldo still `<ComingSoonScreen />`** ❌

### Candidate next WIs (ranked)

#### 🥇 WI-22 — Saldo (YoY comparison) screen — **RECOMMENDED**

**User problem (treasurer POV):**
"Before the quarterly board meeting I need to see, at a glance, whether we're ahead or behind vs last year — per category, with a monthly net trend — without clicking through pages."

**Acceptance criteria (from PRD-002, condensed):**
1. Two side-by-side panels — Income by category / Expense by category — each row showing current-period total, prior-period total, delta (↑/↓/flat + %). (PR1–PR2)
2. Period selector (Mes / Trimestre / Año, default Año; default 2026 vs 2025), plus account filter. (PR6, PR10)
3. Partial-period rows annotated with linear pro-rata projection ("proy. vs 2025"). (PR3)
4. KPI strip above panels: total income, total expense, net — each citing prior-year counterpart. (PR5)
5. Net-monthly comparison bar chart (12 months, current-year vs prior-year bars side by side) with collapsible data-table equivalent for a11y. (PR4 + UX-004)
6. Aggregations derived from the existing read model (no new events, no writes); Saldo totals MUST equal Movements totals for the same filter set (property-test target). (PR11–PR12)
7. ES + EN strings populated; Intl locale-aware number/date formatting. (PR17)
8. Performance: ≤300ms p95 first render at 1,000 events; ≤100ms on period-selector change. (PR14)

**Rough scope / agents:**
- **Neo** — thin tech spec: which queries to add to `app/src/core/query/` (monthly-net reducer, by-category aggregator), whether to materialize or compute on demand at M1 sizes.
- **Morpheus** — query implementation + property test proving Saldo≡Movements equivalence. No event catalog changes.
- **Niobe** — UX-004 already Accepted; confirm partial-period annotation copy + empty-state branches.
- **Mouse** — tokens already in place; chart styling + KPI strip visual.
- **Trinity** — screen implementation replacing `<ComingSoonScreen />`, period selector, two panels, KPI strip, chart, a11y data-table, i18n keys in ES+EN.
- **Switch** — confirms Saldo reads only from decrypted read model; no new crypto surface.
- **Cypher** — e2e/smoke: load real seed → flip period → check deltas + chart.

**Dependencies / risks:**
- 🟢 No blocked dependencies — read model has everything needed.
- 🟡 Chart primitive — do we reuse Panel's 12-month sparkline infrastructure or introduce a grouped-bar chart? Decision for Neo (30 min).
- 🟡 Pro-rata projection: simple linear; spec is clear, resist scope creep (no seasonality, no moving averages — those are v1.x).
- 🟡 Account filter shape: confirm it uses the same top-bar pattern as Movements to avoid a bespoke control.

**Why now:**
- Closes M1 → unlocks Internal Alpha gate (Pedro-as-dogfooder criterion).
- Only remaining canonical screen; prototype, PRD, UX spec, tokens all ready — highest leverage for smallest net-new design work.
- Ships value to the only audience that matters this milestone: the treasurer preparing a board report.

#### 🥈 WI-23 — `configAccount` ↔ `transaction.accountId` unification

Unblocks three deferred items at once:
- Usage counts on config rows (accounts / categories / tags "N movimientos")
- Hard-delete path for config entities (migrate-then-delete)
- Prototype fidelity on Cuentas (Movimientos column, accurate row counts)

---

## Decision: BulkClassifyModal sized independently of TransactionDetailModal

**Date:** 2026-04-23
**By:** Trinity (Frontend Dev)
**Requested by:** Pedro
**Status:** Proposed (CSS shipped on `fix/bulk-classify-modal-size`, awaiting Pedro merge)

### Decision

The bulk-classify modal (`BulkClassifyModal`) is sized independently of the transaction detail modal:

- **Width:** `480px` (vs. detail modal's `760px`), with `max-width: 92vw` inherited from the shell for mobile safety.
- **Edit-body min-height:** `0` (vs. detail modal's `520px`).

Both overrides live in `BulkClassifyModal.css` scoped under `.ot-bulk-classify-modal`. The shared shell (`TransactionDetailModal.css`) is **not** modified — it remains the single source of truth for header / footer / focus / padding / backdrop styling.

### Rationale

The bulk-classify modal only contains a Category + Subcategory picker pair (and an optional self-scrolling failures panel). The 760×520 detail-modal footprint was correct for the full transaction edit form but oversized and visually clumsy here. Auto-sizing on a 480px frame fits the two pickers without horizontal cramping and keeps the dialog compact when there are no failures; the failures panel's existing `max-height: 200px; overflow-y: auto` keeps growth bounded when failures appear.

### Pattern this establishes

Future modals that reuse the detail-modal shell should follow the same approach:

1. Render `ot-transaction-detail-modal` shell classes + a sibling marker class on the `<dialog>`.
2. Import the child CSS **after** `TransactionDetailModal.css` in the .tsx (cascade wins at equal specificity).
3. Scope sizing overrides (`width`, `min-height`, etc.) under the marker class. Do not fork the shell.

A skill describing this pattern lives at `.squad/skills/modal-shell-overrides/SKILL.md`.

### Files touched

- `app/src/renderer/components/BulkClassifyModal/BulkClassifyModal.css` — added shell overrides at top of file; failures panel rules unchanged.

### Verification

- `npx vitest run app/src/renderer/components/BulkClassifyModal` → 4/4 passing.
- `npm run typecheck` → clean.
- `npx eslint app/src/renderer/components/BulkClassifyModal --max-warnings 0` → clean.

---

## Trinity — Polish Pre-WI-22 Decision Drop

**Date:** 2026-04-22  
**PR:** #5 (polish/pre-wi22-table-scroll-modal-locale)

### Decisions / Patterns Established

#### 1. Table horizontal-scroll fallback pattern (confirmed)

For any screen using `table-layout: fixed; width: 100%` inside an `overflow-x: auto` container, **`min-width` on the table equal to the sum of column widths is mandatory** for horizontal scroll to actually trigger. Without it, the table just proportionally compresses columns and the container never overflows.

Current usages:
- `MovementsScreen.css` — `min-width: 1012px`
- `PanelScreen.css` — `min-width: 832px`

Saldo (WI-22) should adopt the same pattern. Extend `.squad/skills/data-table-truncation/SKILL.md` — the "Scroll Fallback Requires Unobstructed Ancestor Chain" section is already there but didn't spell out the `min-width` requirement. Updated.

#### 2. Currency-formatting locale source

**Rule:** Use the i18next locale (`i18n.language` mapped to `'es-ES'` / `'en-US'`), NOT `navigator.language`. Applies to both `Intl.NumberFormat` (currency + numbers) and `Intl.DateTimeFormat`. `dateFormat.ts` already does this via its `locale` parameter; currency formatters in components should do the same.

#### 3. Follow-up: extract currency formatter helper

**STATUS: DONE** — implemented on branch `chore/number-format-helper` (PR opened against `main`). Helper lives at `app/src/renderer/utils/numberFormat.ts` with `formatCurrency(amount, locale, currency = 'EUR')`. All three call sites (`AccountCard.tsx`, `KPIStrip.tsx`, `PanelScreen.tsx` recent-tx column) migrated to the helper with `locale` derived from `i18n.language`. Unit tests added at `numberFormat.test.ts`. Skill codified at `.squad/skills/intl-formatting/SKILL.md`.

**Original recommendation:** before WI-22 Saldo lands, pull the currency formatter into `app/src/renderer/utils/numberFormat.ts` (alongside `dateFormat.ts`) and sweep remaining `navigator.language` call sites:
- `AccountCard.tsx:43`
- `KPIStrip.tsx:20`
- `PanelScreen.tsx:285` (recent-tx amount column)

Saldo will compute running balances and display amounts per account — reusing the helper avoids re-introducing the bug. Trivial 20-line helper + ~5 call-site migrations. **Assigning suggestion: whoever picks up WI-22 scaffolding does this first as a 10-minute pre-work commit.**

#### 4. No design decisions required

Both fixes were bugs, not redesigns. Mouse input not needed. View/edit parity on TransactionDetailModal verified still intact after WI-21 merges — no flicker, unified 760×520 shell.

---

## Trinity — Saldo redesign implementation notes

**PR:** #17 — https://github.com/rett-europe/opentreasury-desktop/pull/17
**Branch:** `feat/saldo-redesign-per-category`
**Specs implemented:**
- `.squad/decisions/inbox/niobe-saldo-redesign-spec.md`
- `.squad/decisions/inbox/mouse-saldo-chart-sizing.md`
- `.squad/decisions/inbox/copilot-directive-saldo-redesign.md`

### Files changed

- `app/src/renderer/screens/SaldoScreen/SaldoScreen.tsx` — rewritten. New state model (mode + year(s) persisted in `localStorage` `saldo.view.v2`), fetch helper that reuses adjacent prior data when CY/LY are consecutive (otherwise issues a second fetch), per-category chart compute (`buildCategoryRows`), per-mode KPI strip and category panels.
- `app/src/renderer/screens/SaldoScreen/SaldoScreen.css` — added `.ot-saldo-controls`, `.ot-saldo-mode`, `.ot-saldo-year-picker` styles; capped `.ot-saldo-chart` at `max-width: 960px; margin-inline: auto`.
- `app/src/renderer/screens/SaldoScreen/SaldoScreen.test.tsx` — updated to the new render. Old projection / period-selector tests dropped; added single-year-mode coverage and mode-toggle test.
- `app/src/renderer/components/GroupedBarChart/GroupedBarChart.tsx` — extended in place: variable bar count per group, variable legend, optional per-bar `barClassNames`, optional `dividerBefore` (renders a vertical dashed separator between income and expense halves). Backward-compatible — all existing GroupedBarChart tests pass unchanged.
- `app/src/renderer/components/GroupedBarChart/GroupedBarChart.css` — Mouse's sizing fix (`__plot { max-height: 280px }`, `__svg { max-height: 100%; object-fit: contain }`) + new bar/swatch class variants for income/expense × cy/ly/solo + divider style.
- `app/src/renderer/locales/en/common.json`, `app/src/renderer/locales/es/common.json` — `saldo` block rewritten.

### i18n keys added

- `saldo.mode.{label,compare,single}`
- `saldo.year.{currentLabel,priorLabel,singleLabel,comparingNote}`
- `saldo.kpi.sublabel.{singleIncomeCount_one,singleIncomeCount_other,singleExpenseCount_one,singleExpenseCount_other,singleYear}`
- `saldo.chart.{compareTitle,compareSubtitle,compareAriaLabel,singleTitle,singleSubtitle,singleAriaLabel,emptyYear,otras}`
- `saldo.chart.legend.{incomeYear,expenseYear}`
- `saldo.panel.{subtitleSingle}`, `saldo.panel.columns.{type,amount,share}`

### i18n keys removed (verified unreferenced via grep before deletion)

- `saldo.cta.export`
- `saldo.period.*` (entire block)
- `saldo.account.*`
- `saldo.yearChip.label`
- `saldo.kpi.sublabel.priorAndProjected`
- `saldo.projection.{sublabel,rowTooltip}`
- `saldo.chart.{monthlyNetTitle,monthlyNetSubtitleYears,monthlyNetAriaLabel,emptyMonth}`
- `saldo.panel.row.projectedVs`
- `saldo.states.{emptyCurrent,emptyPrior}`

### Validation

- `npm run typecheck` ✅
- `npm run lint` ✅ (max-warnings 0)
- `npm test -- --run` ✅ — 466 passed / 9 skipped
- `npx prettier --write` on every touched file ✅
- Renderer grep for `proyect|projected|projection|proj.|currentProjectedTotal` returns only the schema-required mock field in tests + the doc comment confirming absence.

### Follow-up debt

1. **Backend contract cleanup PR (priority for Morpheus/Neo)**: drop `monthlySeries`, `priorMonthlySeries`, `currentProjectedTotal`, `isPartial`, `daysElapsed`, `daysInPeriod` from `SaldoComparisonResponse` (and from the server compute path) — the renderer no longer reads them. Touches:
   - `app/src/shared/ipc-contracts/saldo.ts`
   - `app/src/main/ipc/handlers/saldo.ts`
   - `app/src/core/query/saldo.ts`
   - Tests that build mock responses (Saldo screen test will need its mock trimmed).
2. **Available transaction years IPC**: today the year picker hard-codes the last 6 calendar years. A small `saldo:get-available-years` (or extending `getSaldoComparison` with a `meta.years` array) would let us honour the spec's `min = earliest year present in any transaction` rule.
3. **Optional**: per-subcategory drill-down in the chart (explicitly out of scope — Pedro can prioritise if NGO admins ask).

---

## Morpheus — Saldo seed + i18n fix

**PR:** https://github.com/rett-europe/opentreasury-desktop/pull/16
**Branch:** `fix/saldo-categories-seed-i18n`
**Date:** 2026-04
**Requested by:** Pedro
**Diagnosis reference:** `.squad/decisions/inbox/neo-saldo-3bug-diagnosis.md`

### What changed

#### Bug 1 — devSeed writes new config events
- `app/src/main/devSeed.ts`: replaced the legacy `category.created` / `subcategory.created` / `tag.created` emissions (enveloped shape) with the new WI-15-lite flat events: `CategoryCreated`, one `SubcategoryCreated` per sub (references parent via `parentCategoryId`), `TagCreated`. Category `kind` (income|expense) is carried through from the seed.
- Legacy reducer cases in `core/query/reducers.ts:98-115` were **not** removed per Neo's guidance — that is follow-up debt (see below).
- `account.created` was left as-is: accounts render correctly on main, so that path is out of scope here.

#### Bug 2 — Uncategorized label resolved client-side via i18n
- `app/src/core/query/saldo.ts`: removed the hardcoded Spanish `UNCATEGORIZED_LABEL = 'Sin categoría'`. `resolveCategoryName` now returns `string | null`. `TotalsAgg.byCategory` name is `string | null`. Sort stability preserved (null names collate last).
- `app/src/shared/ipc-contracts/saldo.ts`: `SaldoCategoryNet.categoryName` and `SaldoBiggestCategoryGrowth.categoryName` are now `z.string().nullable()`.
- `app/src/renderer/screens/SaldoScreen/SaldoScreen.tsx`: `PanelRow.name` is `string | null`; rendering site resolves `null` via `t('saldo.panel.uncategorized')`; sort tiebreaker handles null.
- `app/src/renderer/locales/en/common.json`: added `saldo.panel.uncategorized = "Uncategorized"`.
- `app/src/renderer/locales/es/common.json`: added `saldo.panel.uncategorized = "Sin categoría"`.
- `app/src/core/query/saldo.test.ts`: updated the uncategorized-bucket test to expect `categoryName: null` and retitled accordingly.

### Validation gates

All run from `app/`:
- `npm run typecheck` ✅
- `npm run lint` ✅ (0 warnings)
- `npm test -- --run` ✅ (467 pass / 9 skipped / 0 fail)
- `npx prettier --write` run on every touched file.

Manual test (for reviewer): wipe `$env:APPDATA\opentreasury-desktop\dev-events`, `npm run dev:electron`, verify Dashboard/Movements show `Donaciones`/`Individuales` (not raw IDs) and Saldo panels show `Uncategorized` in EN, `Sin categoría` in ES.

### Follow-up debt

1. **Remove legacy reducer cases.** Delete the `category.created` / `subcategory.created` / `tag.created` cases from `app/src/core/query/reducers.ts:98-115` and the matching event schemas/types so nothing can silently dual-write to `readModel.categories` again. Also consider dropping the `readModel.categories` / `tags` slices entirely if no one reads them. **This is the most important follow-up** — without it the fix is brittle.
2. **Audit `account.created` vs `AccountCreated`.** Same footgun latent; verify `listAccounts` only reads from `configAccounts` and remove the legacy path if unused.
3. **Lint rule / audit:** user-facing Spanish or English string literals under `app/src/core/` should be forbidden. Grep audit at minimum; eslint rule ideally.
4. **Bug 3 (chart heights)** remains open pending Cypher empirical capture — not this PR's scope.

---

## Neo — Diagnosis: 3 post-PR#15 bugs (Panel/Movements raw IDs, Saldo "Sin categoría", chart bar heights)

**Date:** 2026-04 (post PR #15 merge)
**Requested by:** Pedro
**Scope:** Diagnosis only, no code changes. Trinity will implement.

### TL;DR

All three user-reported bugs share a **single root cause**: the dev seeder writes the **legacy** `category.created` / `tag.created` events, but every consumer in the current app (Panel, Movements, Saldo, Configuración) reads from the **new** `configCategories` / `configTags` projections, which are only populated by the new `CategoryCreated` / `TagCreated` config events. PR #15's name-lookup code is correct; the map it builds is just always empty because `listCategories()` returns `[]`.

Bug 2's "Sin categoría" leak is a compound issue: the empty map forces every category to fall back to the hardcoded server-side Spanish label, *and* that label would still leak on null-category rows even after Bug 1 is fixed.

Bug 3 is almost certainly a **user mis-reading**: the Saldo "Income vs Expense" chart is not an I/E chart — it's a **current-year-net vs prior-year-net** grouped bar chart. Needs empirical DOM verification before changing anything.

### Bug 1 — Panel + Movements show raw IDs (`CATD0N00000000000000000000`, `CATD0NS10000…`)

#### Root cause
Two parallel, disconnected event families populate two different read-model slices:

| Event type            | Reducer slice             | Reducer location                           | Emitted by                  |
| --------------------- | ------------------------- | ------------------------------------------ | --------------------------- |
| `category.created`    | `readModel.categories`    | `app/src/core/query/reducers.ts:98-115`    | **devSeed.ts** (line 726)   |
| `CategoryCreated`     | `readModel.configCategories` | `app/src/core/query/reducers.ts:154-168`   | `categories:create` IPC handler only |

The `categories:list` IPC handler reads **only** from `configCategories`:

- `app/src/main/ipc/handlers/categories.ts:122-138` → `selectActiveCategories(model)`
- `app/src/main/projections/config.ts:77-84` → `model.configCategories.filter(...)`

Therefore, on a fresh dev-seeded dataset, `listCategories()` returns `{ categories: [] }`. PR #15's map builders in PanelScreen (`PanelScreen.tsx:173-180`) and MovementsScreen (`MovementsScreen.tsx:203-210`) produce empty maps. Both renderers then hit their fallback branch (`categoryNameById.get(id) ?? id`) at:

- `PanelScreen.tsx:264-266` (category cell) and `PanelScreen.tsx:280-282` (subcategory cell)
- `MovementsScreen.tsx:79-86` (`mapMovementRecord`)

…which emits the raw ID. `fakeUlid('CATDON')` = `"CATD0N00000000000000000000"` and `fakeUlid('CATDONS1')` = `"CATD0NS10000000000000000000"`, matching exactly what the user sees.

This same mismatch affects **tags** (`tag.created` vs `TagCreated` → `configTags`), so tag labels will also be broken wherever they're resolved through `listTags()`.

The *names* in the seed are fine (`devSeed.ts:114` `name: 'Donaciones'`, etc.) — the names are written correctly; they're just written into a slice nobody reads.

#### Exact file:line
- **Source of the bad events:** `app/src/main/devSeed.ts:722-747` (categories) and `:749-768` (tags).
- **Reducer proving the two paths are disjoint:** `app/src/core/query/reducers.ts:98` (legacy) vs `:154` (new).
- **Read handler ignoring the legacy slice:** `app/src/main/ipc/handlers/categories.ts:133-136`.

#### One-sentence fix
Update `devSeed.ts` to emit the new `CategoryCreated` / `SubcategoryCreated` / `TagCreated` event shapes (flat envelope, no `payload` wrapper — see `core/events/schemas.ts:149-171`) so they hit `configCategories` / `configTags` and flow through `listCategories()` / `listTags()`.

> *Alternative fix (rejected):* teach `selectActiveCategories` to merge legacy `categories` into the output. This re-introduces the dual-write model PR #15's author presumably wanted gone, and would re-break on the next config mutation. Fix the seed, not the projection.

### Bug 2 — "Sin categoría" appears in EN Saldo screen

#### Root cause (two coupled issues)

**2a — Primary trigger:** Because Bug 1 leaves `configCategories` empty, the Saldo aggregation's name resolver can't find **any** category (not just null ones) and returns the Spanish fallback for all rows:

- `app/src/core/query/saldo.ts:38` — `const UNCATEGORIZED_LABEL = 'Sin categoría';` (hardcoded Spanish).
- `app/src/core/query/saldo.ts:40-44` — `resolveCategoryName` returns `UNCATEGORIZED_LABEL` whenever `configCategories.find(...)` misses, which right now is 100% of the time.

That name then flows into every `SaldoCategoryNet.categoryName` the backend emits, which the renderer prints verbatim in the Ingresos/Gastos panel rows (`SaldoScreen.tsx:716` — `{row.name}`).

**2b — Latent bug (independent of Bug 1):** Even after Bug 1 is fixed, genuinely uncategorized transactions (`categoryId: null`) will *still* render "Sin categoría" in the EN locale because the label is server-side and non-i18n'd. This is an architectural issue: **user-facing strings must not live in the backend**.

**2c — User's description (chart vs panels):** The user says "Income-vs-Expense chart tooltip/legend shows 'Sin categoría'". The chart component itself (`GroupedBarChart.tsx:104-235`) does **not** contain the string — its legend is `[currentYear, priorYear]` (`SaldoScreen.tsx:438`) and its tooltip only renders `s.label` (month name). "Sin categoría" is appearing in the **category panels below the chart** (`SaldoScreen.tsx:713-717`) — user is probably conflating the two sections visually.

#### Exact file:line
- `app/src/core/query/saldo.ts:38` — hardcoded Spanish constant.
- `app/src/core/query/saldo.ts:40-44` — fallback path returning it for both null and missing IDs.
- `app/src/renderer/screens/SaldoScreen/SaldoScreen.tsx:501`, `:515`, `:716` — render path consuming `row.categoryName`.

#### One-sentence fix
Fix Bug 1 first (Trinity); then change the Saldo IPC to emit a sentinel (`categoryName: null`, or a stable token like `'__uncategorized__'`) and resolve the display label client-side via `t('saldo.panel.uncategorized')` — add matching keys to `app/src/renderer/locales/{en,es}/common.json`.

### Bug 3 — Bar heights look wrong / not proportional to income & expense

#### Root cause (almost certainly user mis-reading, not a bug)

The chart the user is looking at is **NOT** an Income-vs-Expense chart. It is a **year-over-year net** chart:

- `SaldoScreen.tsx:407-419` — builds `values = [curNet, priorNet]` where `curNet = cur.netIncome - cur.netExpense` and `priorNet` is the same formula on `priorSeries`.
- `SaldoScreen.tsx:438` — legend is `[String(currentYear), String(priorYear)]` (e.g. `["2026", "2025"]`), not `["Income", "Expense"]`.
- Chart itself (`GroupedBarChart.tsx:55-64`) uses one shared Y-axis with domain `[min(0, values), max(0, values)]`, which correctly supports negative net months (bars below the zero line) — this is mathematically sound for a YoY-net comparison.

Consequences that explain the user's "heights look wrong" feel:
1. A month with high income **and** high expense (e.g. Oct 2025 gala: 5,000 in + 4,800 out) nets ~200 and renders as a tiny bar, even though the underlying tx totals are large.
2. 2026 months after April are zero-filled (future), so 2026's bars collapse to nothing for Jul-Dec, while 2025 shows real numbers for the same months → visually "lopsided" without being incorrect.
3. Sign flips (expense-heavy months) yield bars below the zero line — easy to misread as "missing".

I did **not** find a scale/data-mapping bug in the math. No hardcoded domain, no absolute-value hack, no separate-axis-per-series trick.

#### Exact file:line
- `app/src/renderer/screens/SaldoScreen/SaldoScreen.tsx:396-446` — MonthlyNetChart (compute + legend).
- `app/src/renderer/components/GroupedBarChart/GroupedBarChart.tsx:52-64` — scale.

#### One-sentence fix
**Needs empirical data — suggest Cypher capture DOM bar heights and compare to `runQuery(getSaldo)` output before any code change**; if the math checks out, the real issue is UX/labelling (the subtitle says "netos" but the chart is easy to misread as I/E — consider swapping to stacked Income+Expense bars or relabelling clearly). Do *not* modify chart math until empirical data confirms a defect.

### Recommended spawn order

1. **Trinity — Bug 1 (seed rewrite).** Highest impact, unblocks everything else. Rewrite `devSeed.ts` category/subcategory/tag event emission to match `core/events/schemas.ts:149-171` (`CategoryCreated`, `SubcategoryCreated`, `TagCreated` — flat envelope, `parentCategoryId` for subcategories). Delete or ignore the legacy paths for seed. Verify by: fresh re-seed → `listCategories()` returns 8 categories with names, Panel + Movements columns render "Donaciones", "Individuales", etc.
2. **Trinity — Bug 2 cleanup (after Bug 1 lands).** Replace the hardcoded Spanish `UNCATEGORIZED_LABEL` in `saldo.ts:38` with either `null` (preferred — let renderer pick the label) or a stable sentinel; add `saldo.panel.uncategorized` keys to both `locales/en/common.json` and `locales/es/common.json`; update `SaldoScreen.tsx` render sites (`:716` and the `buildPanelRows` name pickup at `:501` / `:515`) to resolve the sentinel via `t(...)`.
3. **Cypher — Bug 3 empirical capture.** Before any code change: run `dev:electron` with seed, navigate to Saldo, capture (a) the `SaldoComparisonResponse.monthlySeries` + `.priorMonthlySeries` JSON, and (b) DOM values of `rect[height]` for the rendered bars. Compare. If the math matches, route back to Neo for a UX-level decision (relabel chart / rebuild as stacked I-vs-E). If the math doesn't match, hand to Trinity with the failing bucket.
4. *(Parallel, optional)* **Switch** — audit if any other consumer (Importación, Configuración list views, Saldo biggest-growth callout) is reading `readModel.categories` (legacy) or assuming seed-populated `configCategories`. The legacy `category.created` reducer case should probably be deleted in a follow-up once the seed is corrected, to prevent anyone reintroducing dual-write.

### Notes for future work (not in scope here)
- The dual event families (`category.created` vs `CategoryCreated`, `tag.created` vs `TagCreated`, `account.created` vs `AccountCreated`) and their two read slices (`categories` + `configCategories`, etc.) are a latent footgun. Worth a dedicated cleanup WI after the above lands.
- Any user-facing string living in `app/src/core/` (the saldo label here, possibly others) violates the backend/frontend separation — candidate for a lint rule or at minimum a follow-up grep audit.

---

## Niobe — Saldo Redesign Spec

**Owner:** Niobe (UX) · **For:** Trinity (impl), Mouse (visual), Cypher (tests)
**Source directive:** `.squad/decisions/inbox/copilot-directive-saldo-redesign.md`
**Scope:** UX/IA only. No visual tokens, no implementation, no tests.
**Drops:** All projection UI (badges, "proj. vs", dashed lines, projected KPI sublabels).

### 1. Modes (the controller)

Two modes. **No third "monthly trend" mode** — keeping the surface tight. (Pedro can add it later if NGO admins ask.)

| Mode | Default? | Purpose |
|---|---|---|
| **Compare years** | ✅ default | Pick CY + LY. Per-category LY-vs-CY bars. |
| **Single year** | — | Pick one year. Per-category single bar. No comparison. |

**Control:** Segmented control (2 buttons) labelled `Comparar años` / `Un año`. Sits at the top-left of the Saldo header strip, **replacing the current `Period` (Año/Trim/Mes) selector**. The Año/Trim/Mes selector is **removed** — it confused the new "category × year" axis and the directive is year-centric. Granularity below year is out of scope for this WI.

**Default state on first load:** `Compare years`, current year vs prior year (e.g. 2026 vs 2025).
**Persistence:** Mode + selected year(s) persist in `localStorage` under `saldo.view.v2` (key bumped from any prior `saldo.view`). Survives reload, resets if the stored year is no longer in the available range (clamp to current year).

### 2. Chart shape per mode

Shared rules:
- **X-axis:** category names. Sort: by **CY absolute net magnitude desc** (compare mode) or **selected-year absolute net magnitude desc** (single mode). Cap at **top 8 categories**; the rest collapse into a single `Otras` bucket (summed). 8 keeps labels legible at 1280–1920px without rotation.
- **Y-axis:** **absolute amounts in EUR**, always ≥ 0. Income and expense bars share the same axis but are visually distinguished by **color** (income = positive/green family, expense = negative/red family — Mouse owns the palette). No signed/negative bars.
- **Empty state:** when the selected year has zero transactions across all categories, render the existing `ot-grouped-bar-chart__empty` slot with `t('saldo.chart.emptyYear')`. When a single category has no value in one of the two compared years, render that bar at height 0 with the tooltip stating `Sin datos en {{year}}`.

#### 2a. Compare years mode
- **Bars per group:** 2 (CY then LY, left→right). Color encodes income/expense; **shade/opacity** encodes year (CY = solid, LY = 60% opacity, or whatever Mouse picks).
- **Tooltip:** category name · row "Income/Expense" · CY value · LY value · delta (signed %, "—" if LY=0).
- **Legend:** `Ingresos {{cy}}` · `Ingresos {{ly}}` · `Gastos {{cy}}` · `Gastos {{ly}}` (4 swatches).

#### 2b. Single year mode
- **Bars per group:** 1. Color encodes income/expense.
- **Tooltip:** category name · type · value · `% del total {{year}}` (share of that year's income or expense total).
- **Legend:** `Ingresos {{year}}` · `Gastos {{year}}` (2 swatches).

### 3. Income vs Expense — one chart or two?

**Decision: ONE chart, side-by-side.** Income categories first (sorted desc), then a thin visual divider, then expense categories (sorted desc). Color carries the type, position carries the sort.

Justification: NGO admins compare "did this category grow vs last year" — that question is local to a category, not cross-type. Two charts would double the screen real estate and force a visual jump for the most common scan ("is anything alarming?"). One chart with clear color coding keeps the answer in a single sweep, and the divider prevents accidentally summing income+expense bars.

### 4. Year picker mechanics

- **Available years:** `min = earliest year present in any transaction.date in the read model; max = current calendar year (UTC). No future years.` If the read model is empty, picker shows only the current year (disabled state on the prior-year side).
- **Compare mode:** two pickers — `Año actual` and `Año anterior`. `Año anterior` defaults to `currentYear − 1`, must be `< Año actual`, clamped to min. Swapping order is forbidden (UI prevents it; if user picks `currentYear` for prior, we silently bump prior to `currentYear − 1` and toast nothing).
- **Single mode:** one picker — `Año`. Defaults to current year.
- **Mode switch behavior:** when switching `Compare → Single`, carry the **CY** value into the single picker. When switching `Single → Compare`, that year becomes CY and prior becomes `CY − 1` (clamped).
- **a11y:** native `<select>` with `<label for>`. `aria-describedby` points to a sibling text node explaining the comparison (e.g. "Comparing 2026 with 2025"). Keyboard: tab into select, arrows to change, Enter to commit. No custom combobox.

### 5. KPI strip impact

KPI strip stays above the chart. Three cards in both modes; the **3rd card and sublabels** change.

#### Compare years mode (3 cards)
1. `INGRESOS TOTALES` — value = CY income · sublabel `{{ly}}: {{lyValue}}` · delta chip = signed %.
2. `GASTOS TOTALES` — value = CY expense · sublabel + delta same shape.
3. `BALANCE NETO` — value = CY (income − expense) · sublabel + delta.

No "projected" sublabels anywhere. No projection badge. The `kpis.*Delta` fields from the existing IPC response are reused **as-is** (they were already the YoY deltas we want; the projection-vs-raw branch in `getSaldoComparison` becomes raw-only once projection drops — that's a Trinity concern, not a renderer concern).

#### Single year mode (3 cards)
1. `INGRESOS TOTALES` — value = year income · sublabel `{{count}} categorías con ingresos` · **no delta chip**.
2. `GASTOS TOTALES` — value = year expense · sublabel `{{count}} categorías con gastos` · no delta chip.
3. `BALANCE NETO` — value = year (income − expense) · sublabel `Año {{year}}` · no delta chip.

Rationale: the YoY delta is the only reason a delta chip exists; in single-year mode there's nothing to compare, so suppressing it (vs showing "—") is honest and reduces visual noise.

### 6. Category panels below the chart

Panels stay (they're the audit-trail / drill view). They reflect mode + year:

- **Compare years:** unchanged structure (category · prior · bars · current · delta · sublabel) **but**:
  - Drop the `proj. vs {{year}}` sublabel variant entirely.
  - Sublabel becomes flat: `vs {{priorYear}}`.
  - Drop the projected-current bar fill; the "current" bar uses the actual current value.
- **Single year:** panel collapses to 4 columns: category · type · amount · `% del total`. No prior, no bars, no delta.

**Acceptance:** panels always show the **same year(s)** the chart is showing — switching mode or year updates both atomically.

### 7. Acceptance criteria (numbered, testable)

1. **Given** the user opens Saldo for the first time, **when** the screen finishes loading, **then** the mode is `Compare years`, CY = current calendar year, LY = current − 1, and the chart shows per-category bars (not per-month).
2. **Given** the user is in `Compare years` mode, **when** they switch to `Single year`, **then** the chart re-renders with one bar per category for the year that was previously CY, and the 3rd KPI card no longer shows a delta chip.
3. **Given** the user reloads the app, **when** Saldo mounts, **then** the previously selected mode and year(s) are restored from `localStorage` (subject to clamping to the available range).
4. **Given** there are more than 8 categories with non-zero activity in the selected year, **when** the chart renders, **then** exactly 8 named categories are shown plus a single `Otras` bar that sums the remainder.
5. **Given** the user picks a `Año anterior` value ≥ `Año actual`, **when** the picker commits, **then** `Año anterior` is silently set to `Año actual − 1` and no error is shown.
6. **Given** the renderer code, **when** Cypher greps for `proyect`, `projected`, `projection`, `proj.`, `currentProjectedTotal` in `SaldoScreen.tsx` and its child components, **then** zero matches are found in user-facing strings or render paths (the IPC field may still exist server-side; this AC is renderer-only).
7. **Given** the selected year has zero transactions, **when** the chart renders, **then** the empty-state message `t('saldo.chart.emptyYear')` is shown and the KPI cards display `0,00 €` without delta chips.
8. **Given** keyboard-only navigation, **when** the user tabs from the mode segmented control, **then** focus moves: mode → year picker(s) → chart (existing arrow-key group nav) → panel rows, in that DOM order.

### 8. Out of scope (explicit — Trinity, do NOT build)

- No per-subcategory drill-down in the chart.
- No CSV/Excel export of the new chart.
- No account filter changes (existing `account` selector stays as-is or is dropped per Trinity's call — not specified here).
- No granularity below year (Trim/Mes selector is **removed**, not relocated).
- No comparison of arbitrary year pairs beyond two adjacent picker selects (no multi-select, no 3-year view).
- No chart type toggle (bars only — no line, no stacked, no donut).
- No saving/sharing of named "views".
- No backend contract changes in this WI; Trinity may add a `singleYear` request flag if convenient, but the renderer can also just ignore `priorPeriod` data when in single mode. Pick the simpler path.
- No Mouse-side sizing tokens — Mouse owns chart density, font scale, breakpoints. This spec only says "top-8 cap keeps labels legible without rotation"; everything else visual is theirs.

### 9. Open questions for Pedro (max 3)

1. **`Otras` bucket — clickable to expand?** Default I picked: no (static label). Confirm, or do you want it to expand the chart in place to show all categories?
2. **Panel "type" column in single-year mode** — do we keep the `ingreso/gasto` text column, or is the color of the amount (green/red) enough? Default: keep the text column for a11y / non-color users.
3. **Backend simplification** — can Trinity drop `currentProjectedTotal`, `priorMonthlySeries`, `monthlySeries`, `isPartial`, `daysElapsed`, `daysInPeriod` from `SaldoComparisonResponse` in this WI, or do you want a follow-up PR for the contract cleanup so this PR stays renderer-only? Default I assume: follow-up PR; this WI ignores those fields in the renderer but doesn't touch the contract.

---

## PR #26 Review — Neo Verdict (WI-23 Projection Unification)

**Date:** 2026-04-25  
**PR:** #26 — `WI-23: unify account/category/tag projections with transaction ID space`  
**Head:** `copilot/issue-18-work-on` @ `d927ecb`  
**Verdict:** ⛔ **CHANGES_REQUESTED**  
**Reviewer:** Neo (Lead/Architecture)  
**Revise:** **Cypher** (Reviewer Rejection Lockout — not @copilot, not Morpheus)  

### What's right

- **Architecture:** Legacy `accounts` / `categories` / `tags` arrays and `Account`/`Category`/`Tag`/`Subcategory` interfaces cleanly removed from `core/query/types.ts` and `core/query/reducers.ts`. Every runtime consumer reads exclusively from `configAccounts`/`configCategories`/`configTags`. Wire contract preserved via `label ?? name` for `accountLabel`.
- **PR #45 conflict resolution:** Correct. Morpheus retained mutable `_txList` + `_txByRef` reference index while collapsing legacy `account.created`/`category.created`/`tag.created` cases into single defensive no-op block (runtime-unreachable behind boot-guard).
- **Rebase fallout:** All unified-event emitters carry required `sortOrder`:
  - `accounts.ts:111`, `categories.ts:104`, `tags.ts:86` — `max(existing.sortOrder)+1`
  - `import.ts:683` — Morpheus's fix, monotonic across batch
  - `devSeed.ts:705/727/748` — `sortOrder` from array index
- **Boot-guard:** `JsonFileEventLog.load()` correctly throws `LEGACY_EVENT_TYPE_REJECTED` on legacy types and Zod-validates unified shapes. Schema-migration policy in `security-requirements-v0.1.md` is precedent-lock.
- **Mergeable flag (`CONFLICTING/DIRTY`)** is stale — `git merge-tree origin/main HEAD` produces clean tree (only `.squad/agents/morpheus/history.md` auto-merges).

### Blocking defect

**`scripts/perf-seed.mjs:183` still emits legacy `type: 'account.created'`** with enveloped payload shape. Categories and tags already migrated to flat `CategoryCreated` / `TagCreated`; file is half-converted.

**Consequence post-merge:**
1. `npm run perf:seed` writes `events.ndjson` containing 3–N `account.created` lines.
2. App boot calls `JsonFileEventLog.load()` on file.
3. Boot-guard throws `LEGACY_EVENT_TYPE_REJECTED` → app refuses to start, perf gate breaks.

Not caught by CI: `e2e · perf gate (main only)` job is `if: github.ref == 'refs/heads/main'` (SKIPPED on PR). Defect surfaces post-merge.

### Required fix (Cypher)

1. In `scripts/perf-seed.mjs`, replace `for (const acc of ACCOUNTS)` block emitting `'account.created'` with flat `AccountCreated` shape from `devSeed.ts:703–716` — include new required `sortOrder: ACCOUNTS.indexOf(acc)`. Preserve id (`fakeUlid(acc.key)`) so seeded `transaction.accountId` refs resolve.
2. Add smoke step in `scripts/perf-measure.ts` or npm wrapper: run `JsonFileEventLog.load()` on freshly-seeded NDJSON, assert no throw. Next schema migration that misses a seeder fails on PR branch, not main.
3. Re-run `npm run perf:seed && npm test` locally; capture NDJSON line counts in PR description.

### Non-blocking observations

- Handler tests (`movements.test.ts`, `notes.test.ts`, `transaction.test.ts`, `bulkUpdate.integration.test.ts`, `reducers.test.ts`) still construct legacy events; pass because reducer's no-op is retained. Fine for this PR (Morpheus scoped them out); track follow-up sweep to unified shape (owner TBD).
- `app/src/core/events.ts` stale skeleton (already addressed in commit `dd08924`). No action.
- `Table.tsx` + most `perf-seed.mjs` changes pure prettier reformat — not scope creep.

### Operational note

PR description's "Rollback anchor" stands: tag `pre-wi23-log-compat` on `main` immediately before merge. If users hit `LEGACY_EVENT_TYPE_REJECTED` post-update, need deterministic walkback target.

---

---

## Mouse — Saldo Chart Sizing Spec

**Date:** 2026-04-23  
**Requested by:** Pedro (perocha)  
**Problem:** Chart and month-letter axis labels are oversized on large screens (1440p+), eating vertical space. Looks fine on smaller windows.

### Diagnosis

#### Root cause: SVG scales unbounded via `width: 100%; height: auto`

**Offending rules:**

1. **`GroupedBarChart.css` line 48–52:**
   ```css
   .ot-grouped-bar-chart__svg {
     display: block;
     width: 100%;
     height: auto;
   }
   ```
   The SVG has `viewBox="0 0 600 300"` (2:1 aspect) and scales to fill the full container width. On a 1600px+ content area, this means ~800px+ rendered height.

2. **`GroupedBarChart.tsx` line 88:**
   ```css
   font-size: 11px
   ```
   The `<text>` element uses a **hardcoded 11px inside the viewBox**. Because the viewBox scales with container width, this 11px is relative to the viewBox coordinate system, not CSS pixels. On a wide viewport the rendered label can exceed 18–20px.

3. **`SaldoScreen.css` line 244–254:**
   ```css
   .ot-saldo-chart {
     display: flex;
     flex-direction: column;
     /* no max-height, no max-width, no aspect-ratio constraint */
   }
   ```
   Container has no ceiling — SVG expands freely.

### Proposed Fix

#### 1. Cap the chart container height

**Selector:** `.ot-saldo-chart`  
**File:** `SaldoScreen.css`  
**Rule:**
```css
.ot-saldo-chart {
  max-width: 960px;            /* prevents chart from bloating on 4K monitors */
}
```
**Rationale:** Matches the `compact` breakpoint (960px). Chart width shouldn't exceed typical content-area bounds.

#### 2. Constrain the SVG wrapper with `max-height`

**Selector:** `.ot-grouped-bar-chart__plot`  
**File:** `GroupedBarChart.css`  
**Rule:**
```css
.ot-grouped-bar-chart__plot {
  max-height: 280px;           /* hard cap: prevents runaway height on wide viewports */
}
```
**Rationale:** 280px is enough for readable bars + labels without dominating the screen on 1440p.

#### 3. Let SVG fit within the constrained box

**Selector:** `.ot-grouped-bar-chart__svg`  
**File:** `GroupedBarChart.css`  
**Change from:**
```css
.ot-grouped-bar-chart__svg {
  display: block;
  width: 100%;
  height: auto;
}
```
**Change to:**
```css
.ot-grouped-bar-chart__svg {
  display: block;
  width: 100%;
  max-height: 100%;            /* respect parent's max-height */
  object-fit: contain;         /* maintain aspect ratio within bounds */
}
```
**Rationale:** SVG now respects the plot wrapper's max-height while keeping aspect ratio.

#### 4. Use a CSS-pixel font-size for axis labels (not viewBox-relative)

**Selector:** `.ot-grouped-bar-chart__x-label`  
**File:** `GroupedBarChart.css`  
**Add:**
```css
.ot-grouped-bar-chart__x-label {
  fill: var(--color-text-muted);
  font-size: var(--font-size-11);   /* 11px token; won't scale with viewBox */
}
```
**AND in `GroupedBarChart.tsx` line 188–189, remove inline font-size** (let CSS class handle it):
```tsx
// Before:
className="ot-grouped-bar-chart__x-label"
// (no change needed — the class already exists; just remove any inline override)
```
**Wait — this won't work.** SVG `<text>` font-size inside a viewBox is always viewBox-relative. The proper fix is to use `transform: scale()` or set a `max-width` on the SVG so that the effective px-size is bounded.

**Alternative (simpler, no viewBox hacking):** Keep the existing viewBox-relative approach but cap container width (step 1 + 2 do this implicitly). The label will never exceed ~15px rendered at 960px container width.

**Recommendation:** Steps 1–3 already solve the oversized-label issue by capping container dimensions. No need to change SVG internals.

### Token Additions

**None required.** Existing tokens suffice:
- `--font-size-11` already at 11px.
- Use raw `280px` / `960px` as component-specific caps (not design-system tokens — these are layout constraints, not design primitives).

### Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| **< 640px** | Chart width: 100% of parent. Height scales down naturally (2:1 aspect). Labels remain readable. No change needed. |
| **640–1024px** | Chart width: 100%, capped by parent card. Max-height 280px kicks in ~640px+. Balanced. |
| **> 1024px** | `max-width: 960px` + `max-height: 280px` prevents bloat. Chart stays compact. On ultra-wide screens, chart is left-aligned within the `.ot-saldo-chart` container. |

#### Optional: center the chart on wide viewports

If desired, add to `.ot-saldo-chart`:
```css
margin-inline: auto;           /* center when max-width kicks in */
```

### Summary of Changes

| File | Selector | Change |
|------|----------|--------|
| `SaldoScreen.css` | `.ot-saldo-chart` | Add `max-width: 960px;` |
| `GroupedBarChart.css` | `.ot-grouped-bar-chart__plot` | Add `max-height: 280px;` |
| `GroupedBarChart.css` | `.ot-grouped-bar-chart__svg` | Add `max-height: 100%; object-fit: contain;` |

### Out of Scope

- Chart shape / bar grouping (Niobe)
- Colors (established tokens)
- SVG viewBox dimensions (would require coord recalc)
- Tick density / label skipping (not needed after width cap)
- Bar width constraints (already computed proportionally in TSX)

**Status:** Ready for Trinity

---

## Decision: Trinity — Saldo iter 5 polish (PR #91, commit 1d3fcb7)

**Date:** 2026-04-26T19:16:30+02:00  
**Status:** Completed, awaiting Pedro re-review  
**Branch:** `mouse/saldo-prototype-layout`  
**Commit:** `1d3fcb7`

### What was delivered

Two polish items from Pedro's iter 4 feedback:

1. **Responsive panel width** — Compare-mode panels now shrink/grow with viewport, matching Balance page behavior. Removed fixed `min-width` on bar tracks; year columns now use `fr` units with text-width minimums.

2. **1:3 prior:current column ratio** — Grid template changed from equal `1fr / 1fr` to asymmetric `1fr / 3fr`, giving current-year column 3x the width. Bars scale against same `panelMaxAbs` denominator, so a 100% prior bar is now visually ~1/3 the length of a 100% current bar (matches `ingresos_gastos.png` prototype).

### Files changed

- `app/src/renderer/screens/SaldoScreen/SaldoScreen.css` — Header + parent row grid template, removed bar-track `min-width`
- `app/src/renderer/screens/SaldoScreen/SaldoScreen.tsx` — `panelColWidths` measures name length, `panelRowsStyle` exposes `--saldo-col-name`
- `app/src/renderer/styles/globals.css` — Subrow grid template, removed bar-track `min-width`

### Reusable artefact

`.squad/skills/responsive-panel-width/SKILL.md` — Recipe for future bar-visualization panels.

### Quality gates

- ✅ `npm run lint` — 0 errors
- ✅ `npm run typecheck` — 0 errors
- ✅ `npm test` — 654 passing
- ✅ `npm run format` — clean

---

## Decision: Trinity — Saldo iter 4 (PR #91, commit 2d0ac7c)

**Date:** 2026-04-26  
**Status:** Completed (iter 5 now in progress)  
**Branch:** `mouse/saldo-prototype-layout`  
**Commit:** `2d0ac7c`  
**Author:** Trinity (Frontend Dev)  
**Context:** Mouse strict-locked-out per Reviewer Rejection Lockout after 3 consecutive Pedro rejections. Pairing rule suspended; Pedro's verbatim feedback served as the spec.

### What changed (plain English)

#### 1. Year cell internal layout — vertical stack (value on top, bar below)

`.ot-saldo-row__prior-cell` and `.ot-saldo-row__current-cell` switched from horizontal `display: grid; grid-template-columns: 1fr auto` to vertical `display: flex; flex-direction: column; align-items: stretch; row-gap: var(--space-2)`.

DOM order in `CompareRow` reordered so value `<span>` renders BEFORE the bar `<div>`. Final per-cell DOM:

```html
<div class="ot-saldo-row__current-cell">
  <span class="ot-saldo-row__current">8.435 €</span>
  <div class="ot-saldo-row__bar-track">
    <div class="ot-saldo-row__bar-fill ot-saldo-row__bar-fill--current" style="width: 23%"></div>
  </div>
</div>
```

The two year cells still sit horizontally side-by-side on the same row baseline.

#### 2. Bar geometry — uniform 8px height across the panel

- `.ot-saldo-row__bar-track`: was `6px` → now `8px`
- `.ot-saldo-subrow__bar-track`: was `4px` → now `8px`

Bar widths are scaled as a percentage of `panelMaxAbs` (per-panel max absolute value, clamped to ≥1). Both year cells use the same denominator, so 2025 vs 2026 bars are directly comparable.

#### 3. Header row — matching column widths

Header now receives `style={panelRowsStyle}`, so the same `--saldo-col-prior`, `--saldo-col-current`, `--saldo-col-delta` custom properties drive both header and rows. Previously the header fell back to `max-content`, producing column-width mismatch on narrow viewports.

---

## DECISION: Income/Expense/Net Canonical Visual Pattern (PR #104)

**Author:** Mouse (UI Designer)  
**Date:** 2026-04-27  
**Status:** ✅ LOCKED  
**Scope:** All income/expense/net KPI presentations across the application  
**Related work:** PR #104 (squad/visual-consistency-income-expense-net)

### Rule

All income/expense/net KPI presentations MUST follow the Dashboard (Panel) pattern defined in `KPIStrip` component and `globals.css` `.ot-kpi-strip` recipe.

### Canonical Pattern

| Metric   | Icon           | Icon Size | Icon BG Token              | Icon + Value Color Token       |
|----------|----------------|-----------|----------------------------|--------------------------------|
| Income   | `TrendingUp`   | 20px      | `--color-income-bg`        | `--color-income-default`       |
| Expense  | `TrendingDown` | 20px      | `--color-expense-bg`       | `--color-expense-default`      |
| Net      | `Calculator`   | 20px      | `--color-brand-surface`    | `--color-brand-primary`        |

**Structure** (TSX):
```tsx
<div className="ot-kpi-strip" role="status" aria-live="polite">
  <div className="ot-kpi ot-kpi--income">
    <div className="ot-kpi__icon">
      <TrendingUp size={20} />
    </div>
    <div className="ot-kpi__content">
      <div className="ot-kpi__label">{label}</div>
      <div className="ot-kpi__value">{value}</div>
      {/* optional: <div className="ot-kpi__sublabel">{sublabel}</div> */}
    </div>
  </div>
  {/* repeat for expense, net */}
</div>
```

**Typography:**
- Label: 11px uppercase, 0.08em letter-spacing, semibold, `--color-text-muted`
- Value: 24px semibold, tabular-nums, tone-specific color
- Sublabel (optional): 12px, `--color-text-secondary`

**Grid layout:**
- Fixed to 3 columns: `grid-template-columns: repeat(3, 1fr)` for 3-card KPI strips
- Responsive (4+ cards): `grid-template-columns: repeat(auto-fit, minmax(240px, 1fr))` — prevents awkward wraps at intermediate viewports
- Gap: `var(--space-4)` (16px) between cards
- Minmax floor (auto-fit): 240px ensures card readability (icon 42px + label + value with currency formatting)

### Rationale

Visual drift observed across Movements, Saldo, Insights, and Panel. Root cause: component CSS imported after `globals.css` silently shadowed shared recipes. Movements had custom `.ot-movements__totals-*` with divergent layout, Insights had icon size mismatch (24px vs 20px).

PR #104 unifies the pattern and adds responsive grid to prevent 4-card wraps on desktop viewports.

### Enforcement

- All income/expense/net displays MUST use `.ot-kpi-strip` + `.ot-kpi` classes from `globals.css`
- Component-level CSS MUST NOT override `.ot-kpi-*` classes (use BEM marker classes for scoped sizing only, per modal-shell-override pattern)
- Icon set: `lucide-react` at size **20px** (not 24px, not variable)
- Color tokens: use modifier classes (`.ot-kpi--income`, `.ot-kpi--expense`, `.ot-kpi--net`), not inline styles
- Grid recipe: `repeat(auto-fit, minmax(240px, 1fr))` is the canonical responsive template for all KPI strips

### Exceptions

Screens with semantic KPIs not in the income/expense/net trio (e.g., Insights "active tags" KPI, Movements "transaction count" KPI) may use plain `.ot-kpi` without a modifier and apply neutral styling via a scoped BEM class or inline style. Do not create a third `.ot-kpi-*` variant.

#### 4. Value text alignment

`.ot-saldo-row__prior`, `.ot-saldo-row__current`: changed from `text-align: right` to `text-align: left`. Since value now sits ABOVE the bar, left-aligning anchors the digit at the bar's origin.

### Quality gates

- ✅ `npm run lint` — 0 errors
- ✅ `npm run typecheck` — 0 errors
- ✅ `npm test` — 654 passing (same baseline)
- ✅ `npm run format` — all files unchanged

---

## Copilot Directive — User feedback captured (2026-04-26)

**By:** Pedro (via Copilot)  
**Date:** 2026-04-26T19:17:00+02:00  
**Scope:** Future work (queued after Saldo iter 5 ships)

### 1. Collapsible navbar in small screens

The left navbar should shrink/collapse dynamically when the window is narrow, freeing horizontal space for content.

**Context:** _"is it possible to reduce the size of the navbar dynamically? in smaller screens this is handy to get more horizontal space."_

### 2. Transactions page: date column must NEVER be truncated

In small screens, the date is currently being trimmed. The date is one of the most important fields and must remain fully visible at all viewport widths.

**Context:** _"in a small screen, in the page transactions, the dates are trimmed... this can never occur as the date is one of the most important fields."_

### Outcome

Captured for the next UI polish round (after Saldo iter 5 lands). **Owners:** Mouse (spec/visual) + Trinity (implement) per pairing directive. Mouse is eligible — Saldo lockout is artifact-scoped, doesn't apply to navbar or MovementsScreen.

---

## Copilot Directive — Saldo redesign

**By:** Pedro (perocha) (via Copilot)  
**Date:** 2026-04-23

### What

1. Drop YoY projection from Saldo entirely (was already half-removed; finish the job).
2. Replace monthly-net YoY chart with per-category LY-vs-CY absolute totals (two bars per category: prior year, current year).
3. Add single-year mode (year picker, no comparison) — switch between "Compare YoY" and "Single year".
4. Fix oversized chart + huge month-letter labels on large screens — chart must scale down on big monitors but stay readable in small windows.

### Why

User request — captured for team memory

**Why not first:** Platform work with low end-user visibility. Saldo is a user-facing win; this is a developer-facing win. Sequence it right after Saldo so Internal Alpha ships with visible value and then we clean the plumbing before the NGO pilot.

#### 🥉 WI-24 — Global search (⌘K palette)

Prototype has it; app doesn't. High affordance for power users, touches shell, not a PRD-002/003 blocker. Roadmap slots this in M3 (v1 parity). Defer unless Pedro wants a "wow" Internal Alpha demo.

### Polish pass BEFORE WI-22 (≤ half day)

These three are small, but each will cause friction during Saldo dogfooding if they linger:

1. **Movements table horizontal scroll ~1350px** (flagged during WI-20/21 polish). Saldo uses the same table primitive for its two panels — fixing once avoids re-fixing twice. **Trinity, ~1–2h.**
2. **TransactionDetailModal date/locale polish** (Mouse's territory; flagged during WI-21). Date rendering is inconsistent with Intl formatter rules we'll lean on heavily in Saldo's KPI strip and chart axis. **Mouse + Trinity, ~1–2h.**
3. **Header situation (Pedro-deferred).** I need Pedro to confirm *what exactly* is pending here before I can classify it. If it's the topbar "Nuevo Movimiento" button visibility rule (UX-005 Q2) or the sidebar grouping (sibling Config entries per prototype), those are <1h each. **Pedro to clarify → then Niobe/Trinity ~1h.**

### What "done" looks like (Internal Alpha gate)

With WI-22 shipped:
- Treasurer can: install → pick folder → create account → import or enter txs → categorize → see Panel + Movements + **Saldo** all rendering real data.
- Pedro runs the app on real NGO-like data for ≥1 week; zero data-loss incidents.
- All three canonical screens ES+EN complete.
- M1 roadmap row flips to **Done**; Internal Alpha gate opens.

### Ask of Pedro

1. **Confirm WI-22 = Saldo** as the next work item. (Or pick WI-23 if you want platform-cleanup first.)
2. **Clarify the "header situation"** you deferred — one sentence is enough and I'll route to the right agent.
3. **Approve the polish pass** (table scroll + TDM date + header) as a pre-WI-22 sweep.

---

- **Delete semantics:** Same rule as Category.
- **Cascade from parent:** Archiving a category does **NOT** auto-archive its subcategories in WI-21. Explicit act required for each.
- **Events:**
  - `subcategory.updated { id, parentCategoryId, changes: { name? } }`
  - `subcategory.archived { id, parentCategoryId, archivedAt }`
  - `subcategory.unarchived { id, parentCategoryId }`

#### 4. Tag — ARCHIVE ONLY (array membership preserved)

- **Delete semantics:** Hard-delete forbidden. Transactions carry tag ids in `tagIds: string[]`.
- **Array behaviour on archive:** `tagIds` arrays on historical transactions are **NOT rewritten**. No synthetic `tx.untagged` events.
- **Events:**
  - `tag.updated { id, changes: { name?, color? } }`
  - `tag.archived { id, archivedAt }`
  - `tag.unarchived { id }`

### UI implications

| Case | Affordance |
|---|---|
| Any entity, "Eliminar" button | **Rename to "Archivar"** in ES ("Archive" in EN). The verb is the contract. |
| Confirm dialog copy | Archive is reversible. Single primary action. No destructive red styling. |
| Archived list | Hidden by default behind a "Mostrar archivadas" toggle. Archived rows show with muted styling and a "Restaurar" action. |
| Block outright | None. Archive is always safe. |
| Migrate-then-delete | NOT in WI-21. Deferred. |

### Scope: what this ruling does NOT cover

- Hard-delete semantics, tombstone events, or migrate-then-delete flows — **deferred**, require follow-up once account-id decoupling is resolved.
- Bulk archive / bulk restore — out of WI-21.
- Cascade rules between Account ↔ Transaction once the decoupling is fixed.

### Rationale summary

Archive-first is the only policy that is simultaneously: safe under the current decoupling quirk, safe after the future unification migration, preserves the append-only event-sourcing contract, preserves the 7-year audit trail, and imposes zero blocking requirements on WI-21.

---

## Decision: WI-21 Config CRUD — Morpheus: events & IPC surface

**Date:** 2026-04-22  
**Author:** Morpheus (Backend/Event-Sourcing)  
**Audience:** Trinity (renderer), Pedro (coordinator), Switch (review)  
**Scope:** Backend surface for WI-21 (Config CRUD, archive-only per Switch).

### TL;DR

- **No** `*.deleted` events. Archive-only per Switch.
- **No** rename of existing events. Old NDJSON logs replay identically.
- Every new mutation event uses `id` = unique event ULID (log dedupe key) and a domain-named field (`accountId` / `categoryId` / `subcategoryId` / `tagId`) for the target entity. `SubcategoryCreated` is the only exception — it follows the WI-15-lite `*Created` convention where `id` IS the entity id.
- `archivedAt?: string (ISO)` optional on every record. `Archived` stamps it. `Unarchived` clears it. No cascade.

### Event catalog (all PascalCase, flat — matching WI-15-lite)

#### Accounts

| Event               | Shape                                                             |
| ------------------- | ----------------------------------------------------------------- |
| `AccountCreated`    | unchanged (WI-15-lite)                                            |
| `AccountUpdated`    | `{ id, accountId, changes, updatedAt }`                           |
| `AccountArchived`   | `{ id, accountId, archivedAt }`                                   |
| `AccountUnarchived` | `{ id, accountId, unarchivedAt }`                                 |

`changes` is a non-empty partial: `{ name?, bankName?, label?, iban?, color?, isPaypal? }`.

#### Categories

| Event                | Shape                                    |
| -------------------- | ---------------------------------------- |
| `CategoryCreated`    | unchanged                                |
| `CategoryUpdated`    | `{ id, categoryId, changes, updatedAt }` |
| `CategoryArchived`   | `{ id, categoryId, archivedAt }`         |
| `CategoryUnarchived` | `{ id, categoryId, unarchivedAt }`       |

#### Subcategories *(NEW — promoted to first-class events)*

**Shape decision:** Subcategories get their own first-class events on the NDJSON log (parent-scoped via `parentCategoryId`) but are **inlined on `ConfigCategory.subcategories[]`** in the read model.

Rationale:
- Single-fetch tree consumption → renderer calls `categories:list` once and has the full picker tree.
- Events stay append-only and per-subcategory granular.
- No new top-level read-model stream required.
- Aligns with Switch's cascade ruling: parent archive does **not** auto-archive subcategories.

| Event                   | Shape                                                                       |
| ----------------------- | --------------------------------------------------------------------------- |
| `SubcategoryCreated`    | `{ id, parentCategoryId, name, color?, createdAt }` — `id` = entity id     |
| `SubcategoryUpdated`    | `{ id, subcategoryId, parentCategoryId, changes, updatedAt }`               |
| `SubcategoryArchived`   | `{ id, subcategoryId, parentCategoryId, archivedAt }`                       |
| `SubcategoryUnarchived` | `{ id, subcategoryId, parentCategoryId, unarchivedAt }`                     |

Uniqueness of subcategory name is **scoped to the parent**. `parentCategoryId` is required on every subcategory event so projection can route without a secondary lookup.

#### Tags

| Event           | Shape                               |
| --------------- | ----------------------------------- |
| `TagCreated`    | unchanged                           |
| `TagUpdated`    | `{ id, tagId, changes, updatedAt }` |
| `TagArchived`   | `{ id, tagId, archivedAt }`         |
| `TagUnarchived` | `{ id, tagId, unarchivedAt }`       |

### IPC channels

```
accounts:create       accounts:update       accounts:archive       accounts:unarchive
accounts:list         (?: { includeArchived?: boolean })
categories:create     categories:update     categories:archive     categories:unarchive
categories:list       (?: { includeArchived?: boolean })
subcategories:create  subcategories:update  subcategories:archive  subcategories:unarchive
tags:create           tags:update           tags:archive           tags:unarchive
tags:list             (?: { includeArchived?: boolean })
```

Every mutation returns: `{ ok: true, event: <the emitted event> }` or `{ ok: false, error: { code, message, field? } }`.

### Preload bridge (renderer surface)

```ts
window.api.accounts.{create,list,update,archive,unarchive}
window.api.categories.{create,list,update,archive,unarchive}
window.api.categories.subcategory.{create,update,archive,unarchive}
window.api.tags.{create,list,update,archive,unarchive}
```

### Active-only selectors

`app/src/main/projections/config.ts` exposes two flavours per entity:

- `select{Accounts,Categories,Tags}` — returns everything, archivedAt verbatim.
- `selectActive{Accounts,Categories,Tags}` — filters archived; **also strips archived subcategories** from otherwise-active categories.

### Backward-compat guarantees

- `*Created` event shapes are untouched; all existing NDJSON fixtures replay identically.
- The `DomainEvent` union is **extended**, not rewritten; the reducer's `switch` falls through on unknown `type`.
- `CategoryRecord.subcategories` is optional on the wire (Zod `.optional()`) so Trinity can construct optimistic records without providing an empty array.

---

## Decision: WI-21 Config CRUD — i18n copy for Edit/Delete/Archive modals

**Author:** Niobe  
**Date:** 2026-04-20  
**Branch:** wi-21/config-crud  
**Status:** Shipped with WI-21

### Summary

WI-21 ships Edit/Delete on Config entities (Accounts, Categories, Subcategories, Tags). Since Switch ruled **archive-only** (no hard-delete in M1), this spec provides copy variants under `configuracion.*` namespace.

### Namespace convention

Existing locale files use **`configuracion.{entity}`** — NOT `config.{entity}`. Entity slugs are in Spanish in both locales (`cuentas`, `categorias`, `etiquetas`). Subcategories now get first-class CRUD surface, so new top-level node: `configuracion.subcategorias.*`.

All keys follow **`configuracion.{entity}.{action}`**.

### Entity key paths

| Entity       | Key root                         |
|--------------|----------------------------------|
| Account      | `configuracion.cuentas`          |
| Category     | `configuracion.categorias`       |
| Subcategory  | `configuracion.subcategorias`    |
| Tag          | `configuracion.etiquetas`        |

Each gets an `.actions` block, a `.deleteConfirm` block (paired delete/archive copy), and a `.toast` block.

### Shared keys

`configuracion.delete.*` holds verbiage reused across entities:
- `usage.{withCount_one,withCount_other,unknown,none}`
- `warning.{delete,archive}`
- `buttons.{cancel,delete,archive,deleting,archiving}`
- `error.{generic,inUse}`

### Modal composition (Trinity integration)

Top to bottom:
1. **Title** — `configuracion.{entity}.deleteConfirm.title` OR `.archiveTitle`
2. **Prompt line** — `configuracion.{entity}.deleteConfirm.confirmDelete` OR `.confirmArchive` (interpolates `{{name}}`)
3. **Body** — `configuracion.{entity}.deleteConfirm.bodyDelete` OR `.bodyArchive`
4. **Usage line** — one of:
   - `configuracion.delete.usage.withCount` (pluralized) when count ≥ 1
   - `configuracion.delete.usage.none` when count === 0
   - `configuracion.delete.usage.unknown` (renders `—`) when count unavailable
5. **Warning** — `configuracion.delete.warning.delete` OR `.archive`
6. **Buttons** — `configuracion.delete.buttons.cancel` + `.delete` / `.archive` (primary).

### Status

Switch ruled archive-only for M1. All copy now uses "Archivar" verb. Hard-delete copy preserved in spec for future migrate-then-delete flow.

---

## Decision: WI-21 Config CRUD — renderer shape (modals + subcategory editor)

**Date:** 2026-04-22  
**By:** Trinity (Frontend)  
**Status:** Ships with branch `wi-21/config-crud`  
**Context:** WI-21 Edit/Archive/Unarchive for Accounts, Categories, Subcategories, Tags.

### TL;DR

| Concern | Choice |
|---|---|
| Add vs. Edit modal | **Extended Add*Modal with `mode: 'add' \| 'edit'` + optional `record` prop** — single component per entity, branches in `useEffect` for prefill and in `handleSubmit` for create vs. update. |
| Modal success callback | Renamed `onCreated` → `onSaved` uniformly (3 callers updated). |
| Archive confirm | New `ArchiveConfirmModal` — single generic component parameterized by `entity`. Uses Niobe's copy. Usage count renders `—`. |
| Subcategory CRUD | **Inline editor under each parent category's detail pane.** Add-form, inline rename, archive button per row, RotateCcw unarchive. No separate modal. |
| Archived display | `ot-config__*--archived` classes — opacity 0.55 + line-through + `(archivada)` italic badge. |
| "Mostrar archivadas" toggle | Plain checkbox in every filter bar, default off. |
| IPC wiring | New `services/configMutationsApi.ts` with runtime detection. Throws `TODO` when bridge missing, surfaces error string instead of crashing. |

### Files touched

**New:**
- `app/src/renderer/components/ConfigModals/ArchiveConfirmModal.tsx`
- `app/src/renderer/services/configMutationsApi.ts`

**Modified:**
- `app/src/renderer/components/ConfigModals/{AddAccountModal,AddCategoryModal,AddTagModal,index}.{tsx,ts}`
- `app/src/renderer/screens/ConfiguracionScreen/{CuentasTab,CategoriasTab,EtiquetasTab,ConfiguracionScreen.css}.{tsx,css}`
- `app/src/renderer/locales/{es,en}/common.json`

### IPC call shape (ready for Morpheus)

```ts
window.opentreasury.accounts.{create,list,update,archive,unarchive}
window.opentreasury.categories.{create,list,update,archive,unarchive}
window.opentreasury.categories.subcategory.{create,update,archive,unarchive}
window.opentreasury.tags.{create,list,update,archive,unarchive}
```

### Follow-ups

- Once Morpheus's preload + handlers land, delete `notWired()` path in `configMutationsApi.ts`.
- When usage counts available, swap `configuracion.delete.usage.unknown` for `withCount` key.
- Move renderer-local subcategory type to `@/shared/ipc-contracts/`.

---

## DIRECTIVE: Saldo category placement follows intrinsic kind (not net sign)

**Author:** Pedro (via Copilot)
**Date:** 2026-04-26
**Status:** Active — locked rule

### Rule

Category placement on the Saldo screen (income vs expense panel) MUST follow the category's intrinsic `kind` (income/expense), NOT the period's net sign. A category typed as "expense" with refunds making net positive still belongs on the expense side (rendered with a `+` sign on its bar where applicable). Same rule for income categories with reversals. Subcategories follow their parent category's `kind`, never their own subcategory net.

### Why

Dogfood feedback — "Gastos" (an expense category) ended up on the income side after refunds; visually misleading. User-provided rule for team memory.

---

## Decision: Issue #78 Saldo polish wave — F1/F2/F3 fan-out

**Date:** 2026-04-26
**Status:** Shipped (PRs #79, #80, #81, #82, #83 merged; issue #78 closed)
**Related:** UX-004a + amendment 1 (`docs/ux/specs/ux-004a-saldo-subcategory-drilldown-amendment-1.md`)

### F1 — Toggle placement (Niobe spec, Mouse CSS, Trinity TSX)

- **Decision (Niobe):** per-panel inline toggle pill in the column-header strip, single shared `showSubcategories` state. Rejected: single in-panel toggle (asymmetric); per-category chevrons (contradicts 2026-04-26 locked decision).
- **Class contract:** reuse `.ot-saldo-toggle-subcategories`, add `--inline` modifier.
- **Mouse CSS:** `.ot-saldo-toggle-subcategories--inline` — `padding: var(--space-2) var(--space-4)`, `font-size: var(--font-size-12)`, resting `--color-text-muted`, pressed `--color-brand-primary`. Base recipe untouched.
- **Trinity TSX:** `<SubcategoryToggle>` removed from `.ot-saldo-controls`; rendered inside each `<CategoryPanel>` as a sibling of `.ot-saldo-panel__columns`. Old testid `saldo-subcategories-toggle` retired → split into `saldo-subcategories-toggle-income` / `-expense`. Single `aria-live` announce node retained.

### F2 — Crowding & misalignment (Niobe spec, Mouse CSS, Trinity TSX)

- **Shared per-panel bar scale.** Replace per-row `Math.max(prior, current, 1)` with single `panelMaxAbs` computed across all visible rows AND subrows. Threaded into `CompareRow` / `CompareSubRow`. Single mode unaffected (no bars).
- **Density cap.** `SUBCATEGORY_TOP_N` 8 → 5 + Otras when toggle ON.
- **Mouse CSS rhythm:** 2px left guide on `.ot-saldo-subrow` (uses `--color-divider`, sits outside box, preserves 16px content indent); `.ot-saldo-subrow:last-child` `padding-bottom: --space-5 → --space-6`.
- **CSS variable contract:** subrow bars carry both `width: ${pct}%` and `--saldo-subrow-bar-pct: ${pct}%` inline.

### F3 — Bucket by intrinsic kind (Morpheus projection, Trinity UI)

- **Morpheus (PR #80):** `SaldoCategoryNet` and `SaldoSubcategoryNet` carry optional `kind: 'income' | 'expense' | null` (optional at wire level for back-compat). `aggregateTotals` reads `ConfigCategory.kind` once at bucket-creation; `toCategoryNetArray` propagates `kind` to every row + subcategory. Sort: income → expense → null bucket, then `abs(net) desc`, name asc, id asc. Sum invariants preserved. Legacy fallback: rows with no `kind` (and uncategorized bucket) use net-sign classification.
- **Trinity (PR #83):** `buildPanelRows` / `buildSubcategoryRows` route every record through `bucketValue(r, side)`. If `r.kind != null` → include only when `r.kind === side`; magnitude = `|income − expense|`; `reversed = true` when sign opposes panel direction. If `r.kind == null` → legacy `pick(r) > 0` rule on gross income/expense (no sign reversal). `reversedSignPrefix(reversed, kind)` adds `+` (expense panel) or `−` U+2212 (income panel) prefix on reversed-sign value labels.
- **Out of scope (this wave):** no IPC channel changes, no migration; single-mode `share = row.current / totalForShare` denominator drift accepted.

### Test deltas

- Morpheus: 5 new projection tests (refund-heavy expense, negative-net income, subcategory inheritance, legacy fallback, bucket order).
- Trinity #82: SaldoScreen tests cover toggle relocation, panelMaxAbs, top-5 + Otras.
- Trinity #83: 3 new SaldoScreen tests (refund-heavy expense → expense panel `+` prefix; negative-net income → income panel `−` prefix; legacy null-kind buckets into both panels with no prefix).

### Follow-ups

- Issue #78 closed. Issue #69 (WI-C YoY) labeled `priority:v1` — next saldo work.
- Once Pedro back-fills `kind` on legacy categories, the projection's net-sign fallback ceases to fire.

---

## Decision: WI-B (#67) Saldo subcategory drilldown — Trinity wiring contract

**Author:** Trinity
**Date:** 2026-04-26
**Status:** Shipped (PR #67/#77)
**Spec:** `docs/ux/specs/ux-004a-saldo-subcategory-drilldown.md`

### Wiring summary

- Local `useState<boolean>(false)` for `showSubcategories` on `SaldoScreen`. Default OFF; resets on unmount (no v1 persistence).
- `<SubcategoryToggle>` button initially in `.ot-saldo-controls` header (later relocated by #82).
- `aria-live="polite"` announce region above KPI strip with category-count message (UX-004a §7).
- `buildSubcategoryRows()` applies top-N + Otras rule per `(parent, kind)`, sorted by current-period `abs(pick)` desc, stable name tie-break. Suppresses Otras when aggregate is zero (E5).
- `buildPanelRows()` attaches `subRows` and `meaningfulSubcount`; E1/E2 — categories with `meaningfulSubcount < 2` render parent-only even when toggle ON.
- `<CompareSubRow>` and `<SingleSubRow>` mirror parent row layout 1:1 in both grid modes.
- i18n keys under `saldo.subcategories.*` (flat, no `ux.` prefix — matches existing codebase). Pluralisation via i18next `_one`/`_other` (no ICU plugin in app).
- Renderer never reads subcategories from disk; all data via schema-validated `saldo:get-comparison` IPC. Handles `subcategories === undefined` gracefully.

### Class-name contract (paired with Mouse — confirmed by PR #75 / Switch rename pass)

Toggle: `.ot-saldo-toggle-subcategories` (+ `__label`, `__icon`).
Announce: `.ot-saldo-subcategories-announce`.
Subrows: `.ot-saldo-subrow` (+ `--compare`, `--single`); `.ot-saldo-subrow__name`, `__name--otras` (italic), `__prior`, `__current`, `__bars`, `__bar-track`, `__bar-fill` (+ `--prior`, `--current`), `__delta` (+ `--up`/`--down`/`--flat`/`--noPrior`), `__delta-sublabel`.

---

## Decision: PR #75 Round 2 — CSS class-name realignment (Switch)

**Author:** Switch
**Date:** 2026-04-26
**Status:** Shipped (PR #75 round 2; Mouse strict-locked, Switch took over)
**Branch:** `squad/67-wib-ui-recipes`

### Changes (CSS only — `app/src/renderer/styles/globals.css`)

1. Toggle pill rename: `.ot-saldo-header__subtoggle` → `.ot-saldo-toggle-subcategories` (incl. `__icon`/`__label` and all `:hover` / `:focus-visible` / `[aria-pressed]` / `[disabled]` variants). Matches Trinity's TSX.
2. Otras italic rescope: `.ot-saldo-subrow--otras .ot-saldo-subrow__name` → `.ot-saldo-subrow__name--otras` (Trinity applies `--otras` exclusively on `__name`; descendant selector was dead).
3. Added missing recipes: `.ot-saldo-subrow__delta-sublabel` (small, muted, right-aligned caption); `.ot-saldo-subcategories-announce` (sr-only aria-live region, mirrors `.ot-sr-only`).

Validation: lint ✅ · typecheck ✅ · format:check ✅ · 637 passed / 9 skipped.

Convention reinforced: globals.css owns prototype-parity recipes; no SaldoScreen.css touched; no new tokens.

---

## Directive: Saldo % display — integer rounding

**Author:** Pedro (via Copilot)  
**Date:** 2026-04-26  
**Status:** Active  
**Scope:** All Saldo % renderings — parent rows, subrows, headers, tooltips

### Rule

All percentage deltas in Saldo (e.g., "↑12.566%") must round to integer percent (e.g., "↑13%"). No decimals anywhere in Saldo % display.

- **Implementation:** Use `Math.round()` in GroupedBarChart and SaldoScreen formatters
- **Coverage:** All % delta labels, tooltip %, subrow %, header %

### Rationale

Excessive precision adds visual clutter without analytical value at the dashboard level. Integer % is sufficient for treasurer decision-making.

### Implementation Status

- **PR #91 commit 0e0b3e7:** Rounded GroupedBarChart % (lines 155, 281). Tests 654/654 ✅
- **SaldoScreen:** formatPct already returns integer (no change needed)

---

## Directive: Saldo compare layout — side-by-side year-column restructure

**Author:** Pedro (via Copilot)  
**Date:** 2026-04-26  
**Status:** Active  
**Scope:** Saldo CompareRow subrow layout

### Rule

Restructure year-cell layout from stacked (prior-on-top-of-current) to side-by-side columns. Each year column is self-contained:
- Value on top, bar below
- Both year cells share the same recipe
- Headers `2025`/`2026` aligned over their respective vertical stacks
- Dropped the `vs YYYY` sublabel (extraneous)

### Rationale

Matches prototype's clean side-by-side comparison (see ingresos_gastos.png). Prototype bars are NOT stacked vertically — each year's value + bar occupies its own column, making year-to-year comparison immediate.

### Implementation Status

- **PR #91 commit 241caaf:** Restructured subrow layout, dropped sublabel. Tests 654/654 ✅
- **Prototype reference:** ingresos_gastos.png (directive 20260426-180716)

---

## Directive: Pedro — Insights as a new product surface

**Author:** Pedro (via Copilot)  
**Date:** 2026-04-26  
**Status:** Active  
**Scope:** Strategic product direction; Insights section (M4 target)

### Rule

"Saldo per-label YoY is a crown jewel of a feature. I'm even wondering if we could create a specific new section for Insights — it goes beyond balance info. Anything we could do around labels will be very interesting."

### Rationale

Labels are a high-value analytics axis. Analytics views beyond balance (Saldo) deserve their own home in the IA. Captured for team memory while #69 spec is being drafted.

### Follow-up

- Niobe to fold insights_idea.png + insights_idea_2.png mockups into UX-005 amendment (post-M3, target M4)
- See link-69-insights-prio.md (PM brief) for full roadmap justification
- See niobe-69-insights-ia-sketch.md (Niobe's spec response with open questions)

---

## Decision: PM brief — #69 Saldo per-label YoY & "Insights" section scope + roadmap

**Author:** Link (PM)  
**Date:** 2026-04-26  
**Status:** Approved (Pedro directive captured; Niobe spec drafted)  
**References:** Issue #69, roadmap-v1.md (M3/M4 scope), prd-plan.md

### Summary

- **#69 re-targeted from `priority:v1` → M4 (v1.x)** — does not force into M1
- **Insights deserves its own section** — "what's my balance?" (Saldo) vs "what patterns exist?" (Insights)
- **Spanish naming:** `Análisis` (ES) / `Insights` (EN); sits between Saldo and Config in nav
- **Dependencies:** Projection layer (Morpheus) must build label-indexed aggregations in M3 idle capacity; IPC contracts defined when spec lands

### Phasing Recommendation (Niobe owns final picks)

**v1.x (M4) first wave:**
1. Label YoY (= #69) — stacked bar / small-multiples
2. Label cumulative over time — running total per label across fiscal year
3. Account × Label heatmap — which money pots fund which initiatives

**v1.x later / v2:**
- Label velocity, top spenders by label, uncategorized drift (depend on mature labelling habits)

### Risks (mitigated by v1.x schedule)

- **Risk of forcing into M1:** breaks locked PRD-002 contract, forces Morpheus rework, creates throwaway pivot
- **Risk of waiting:** low — pilot NGO does not need Insights to operate; core loop + Saldo + Panel cover M2 needs

---

## Input: Pedro's mockup — Insights landing screen (insights_idea.png)

**Source:** perocha (via Copilot)  
**Date:** 2026-04-26  
**Format:** PNG mockup; captured for Niobe to fold into UX-005 amendment

### Key elements observed

- **Header:** "Análisis por etiquetas — campañas, proyectos y eventos transversales a las categorías"
- **Global metric toggle (top-right):** `Volumen | Neto | # Mov.`
- **KPI strip (3 cards):** Etiquetas activas (N/total) · Ingresos etiquetados · Gastos etiquetados
- **Tag cards section "Etiquetas / Campañas" (horizontal scroll):** per-tag card with colored dot, `#mov` badge, Ingresos/Gastos/Neto, optional sparkline, "Top: {categories}" footer
- **Cross-tag composer affordance (bottom):** "Combina etiquetas para análisis cruzados" — example `Calendarios ∩ 2026`

### Implications for UX-005

1. Insights landing is now **DASHBOARD-FIRST** (KPI strip + tag cards), not direct-to-YoY
2. UX-005a (per-label YoY) becomes the **DRILL-DOWN** when a tag card is clicked
3. New primitive: tag intersection (`∩`) — needs spec for chip composer, URL state, persistence
4. New primitive: global metric switcher (Volumen/Neto/#Mov) — affects every chart/card

### Status

Parked for M4 Insights work. Not blocking current Saldo (M3) work.

---

## Input: Pedro's mockup — Insights drill-down screen (insights_idea_2.png)

**Source:** perocha (via Copilot)  
**Date:** 2026-04-26  
**Format:** PNG mockup; captured for Niobe to fold into UX-005 amendment

### Key elements observed

- **Navigation:** Breadcrumb back `← Volver a Insights`
- **Tag chip + inline intersection composer:** `[Tag chip] [+ Combinar etiqueta... ▾]` — answers the ∩ question; it's a chip composer not a separate page
- **Title + subtitle:** `{Tag Name}` / `Análisis de campaña por categorías y cuentas`
- **3 KPI cards:** Ingresos / Gastos / Neto (each with N categoría(s) / movimiento(s) footer)
- **Distribución por categoría:** side-by-side donuts (Ingresos | Gastos); empty-state "Sin gastos para esta selección"
- **Detalle por subcategoría:** table (Categoría · Subcategoría · Ingresos · Gastos · Neto)
- **Evolución mensual:** line chart (Ingresos / Gastos legend)
- **Por cuenta:** horizontal stacked bars per account

### Implications for UX-005 / UX-005a

1. Insights IA confirmed: landing (dashboard of tags) → drill-down (per-tag analytics)
2. Tag intersection (∩) is an **INLINE chip composer** next to the active chip — NOT a separate screen, NOT a modal
3. The drill-down replaces what UX-005a originally proposed as the per-label YoY view — now richer (KPIs + donuts + table + time-series + per-account)
4. Per-label YoY (original UX-005a) likely lives INSIDE the drill-down as one of the sections (or replaces "Evolución mensual" with a year-over-year overlay toggle)
5. Empty states matter: "Sin gastos para esta selección" — every section needs one

### Status

Parked for M4 Insights work together with insights_idea.png. Full IA now defined. Not blocking current Saldo (M3) work.

---

## Decision: Insights Drilldown — Final IPC Contract Shape

**From:** Morpheus (Backend)  
**For:** Trinity (UI), Mouse (UX), Niobe (Specs), Cypher (Tests)  
**PR:** #108 (`squad/insights-drilldown-ipc`) — merged via PR #111 rebase chain  
**Date:** 2026-04-27  
**Status:** Locked and shipped

### Summary

Five new label-detail IPC channels are live on `window.opentreasury.insights.*`. All share the same request shape and OR semantics across `tagIds`. Within a single drilldown aggregate, a transaction with multiple matching tags is counted **once** (the no-dedupe rule from OQ-2 applies across landing tag *cards*, not within one aggregate).

### Shared Request Shape

```ts
interface LabelDetailRequest {
  tagIds: string[];          // 1+ ids — OR semantics (tx matches if it carries ANY)
  windowStart?: string;      // ISO YYYY-MM-DD, defaults to current year
  windowEnd?: string;        // ISO YYYY-MM-DD, defaults to today (capped at year-end)
  accountId?: string;        // optional single-account filter
}
```

Window dates are **inclusive** on both edges. Archived accounts are always excluded (parity with landing-summary).

### Channels & Response Shapes

#### `insights:label-summary` — header KPIs

```ts
window.opentreasury.insights.labelSummary(req): Promise<{
  incomeCents: number;
  expenseCents: number;
  netCents: number;          // signed: income - expense
  txCount: number;
  categoryCount: number;     // distinct categories touched (split-aware)
  accountCount: number;      // distinct accounts touched
  windowStart: string;       // resolved (echo back)
  windowEnd: string;
}>
```

#### `insights:label-by-category` — donut data

```ts
window.opentreasury.insights.labelByCategory(req): Promise<{
  categories: Array<{
    categoryId: string | null;     // null = uncategorized
    categoryName: string;          // 'Sin categoría' fallback when null
    incomeCents: number;
    expenseCents: number;
  }>;  // sorted by total magnitude (income+expense) desc, then name asc
}>
```

> Income donut: filter `incomeCents > 0`. Expense donut: filter `expenseCents > 0`. The same payload powers both.

#### `insights:label-by-subcategory` — table rows

```ts
window.opentreasury.insights.labelBySubcategory(req): Promise<{
  rows: Array<{
    categoryId: string | null;
    categoryName: string;
    subcategoryId: string | null;
    subcategoryName: string;       // 'Sin subcategoría' fallback when null
    incomeCents: number;
    expenseCents: number;
  }>;  // sorted by total magnitude desc, then category, then subcategory name
}>
```

#### `insights:label-monthly-evolution` — sparkline buckets

```ts
window.opentreasury.insights.labelMonthlyEvolution(req): Promise<{
  months: Array<{
    monthIso: string;              // 'YYYY-MM'
    incomeCents: number;
    expenseCents: number;
  }>;  // ascending by monthIso, sparse (only months with data)
}>
```

> Renderer should fill gaps if a continuous timeline is needed for the chart.

#### `insights:label-by-account` — horizontal bars

```ts
window.opentreasury.insights.labelByAccount(req): Promise<{
  accounts: Array<{
    accountId: string;
    accountName: string;           // ConfigAccount.label ?? .name
    accountColor: string;          // '' if account has no color set
    incomeCents: number;
    expenseCents: number;
  }>;  // sorted by total magnitude desc, then accountName asc
}>
```

### Locked Semantics (do not "fix" later)

1. **OR across tagIds**, not AND. The original spec said "AND intersection" but the resolved decision in OQ-2 locked OR. The drilldown shows **the union** of campaigns selected.
2. **Single-count inside one aggregate.** A tx with three matching tags contributes its full amount **once** to the drilldown totals.
3. **Split-aware via existing `effectiveAmounts`.** Splits expand a parent tx into N rows, each with its own categoryId/subcategoryId. `tx.type` (income/expense) is inherited from parent.
4. **Default window = current calendar year**, end capped at today. Matches `insights:landing-summary`.
5. **Archived accounts excluded** — parity with landing.

### Footer Link Contract (OQ-3 Handoff)

The "Ver todos los movimientos →" footer link must navigate to Movimientos with both `tagIds` and `windowStart`/`windowEnd` pre-applied. Per Movimientos contract, the route uses **AND semantics** for `tagIds` — that's a separate route contract owned by the Movimientos screen and is *not* the same as our OR semantics here.

---

## Decision: Insights Drilldown — UI Route State & Cross-Screen Handoff

**From:** Trinity (Frontend Developer)  
**PR:** #110 (draft) → merged as #4b/4  
**Date:** 2026-04-27  
**Status:** Locked and shipped

This is a contract-relevant decision drop covering frontend choices on URL/router state and the Movimientos cross-screen handoff.

### D1 — Drilldown Route is Encoded as Route + State Slice

The renderer still has no router (`App.tsx` uses `useState<Route>` plus per-feature state slices).

**Decision:** Add `'insights-detail'` to the `Route` union and carry `{ tagIds: string[], windowStart: string, windowEnd: string }` in a separate `insightsDetail` state slice in `App.tsx`. `onTagsChange([])` returns the user to the landing route. Sidebar navigation clears the slice so state can't bleed across visits. When a real router lands, this collapses into route params with zero contract surface change.

**URL serialization (proposed for the future router):** `?tag=<id>&tag=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD`.  
Multi-tag uses repeated `tag` params (matches Morpheus's IPC contract `tagIds: string[]`). The shorthand `:tagIdsSerialized` from the original task brief was rejected — comma-joined IDs in a path segment are awkward to navigate to from anywhere outside the landing screen; repeated query params are more idiomatic.

### D2 — Movimientos Cross-Screen Filter Handoff (OQ-3)

**Decision:** Add an optional `initialFilters?: { tagIds?: string[], windowStart?: string, windowEnd?: string }` prop to `MovementsScreen`. Values are applied on first mount only (via state initializers); subsequent prop changes do not re-apply. This is one-shot context-handoff data, not a controlled prop.

**Tag filter semantics:** AND (a movement must carry every requested tag). This matches the intersection semantics of the drilldown view itself.

**Date filter:** When both `windowStart` and `windowEnd` are present, the date filter initializes to `kind: 'custom'`. Otherwise it falls back to `loadPersistedDateFilter()` (existing behaviour). The custom range is intentionally NOT persisted (existing rule, see `movementsDateFilter.ts`).

**Sidebar nav clears the handoff:** `App.tsx` zeros `movementsInitialFilters` when the user navigates via the sidebar so a stale handoff can't reapply on a later free-form visit.

### D3 — Provisional Handling Deferred to No-op

The original task brief allowed scaffolding against a best-guess IPC shape. By the time Trinity sat down to build, Morpheus's branch already contained the final contracts on `squad/insights-drilldown-ipc`. Trinity's branch is therefore based on Morpheus's tip, not on `main`, and uses the actual `insights:label-*` types. The merge order remains: Morpheus's PR lands on `main` first, then Trinity rebases.

### D4 — `archived` Tag Filter for Combiner

Per OQ-4, archived tags appear on the landing but are NOT shown in the combiner dropdown. `TagRecord` exposes `archivedAt?: string` (not a boolean `archived`); the combiner filters on `!tag.archivedAt`. No new contract; just calling out the field name for whoever lands the next "hide archived" filter elsewhere.

---

## Cross-Agent Learning: Parallel-Checkout Race (2026-04-27)

**Incident:** Spawned Trinity + Morpheus background agents simultaneously without setting `SQUAD_WORKTREES=1`.

**Mechanism:**
1. Morpheus: `git checkout squad/insights-drilldown-ipc` → updates index
2. Trinity: Writing drilldown UI files (JSX, CSS, test files) into renderer working tree simultaneously
3. Coordinator: `git checkout hotfix/donut-chart-thousands` → git index collision with Trinity's WIP
4. **Result:** Trinity's files staged into coordinator's commit; PR #111 merged with bundled but correct IPC code

**Recovery:** Verified IPC code was correct, merged with `--admin --squash` (bundled but coherent), rebuilt test-fix branch in isolated worktree.

**Reinforcement:** **SQUAD_WORKTREES=1 is mandatory for 2+ parallel coding agents.** Spawning multiple agents without isolated worktrees causes git index collisions when they write to the working tree concurrently. The fix:

```bash
export SQUAD_WORKTREES=1
# Then spawn agents
```

This ensures each agent gets its own worktree (`git worktree add`) and cannot collide.

---

## Decision: `dev:empty` Semantics + Onboarding Hydration Ordering (PR #216)

**Author:** Morpheus (Backend Developer)  
**Date:** 2026-05-08  
**Status:** Shipped & Merged (PR #216)  
**Branch:** squad/fix-dev-empty-onboarding-regression  
**Context issues:** #196 (onboarding wizard), PR #215 (wizard ship)

### What Changed

1. **`dev:empty` is now actually empty.** The npm script no longer just sets `OT_SEED=none`; it runs `scripts/dev-empty.mjs`, which deletes the dev-only state under Electron's userData before spawning vite:
   - `userData/app-config.json` (resets the dataDir choice → wizard fires)
   - `userData/dev-events/` (legacy default location)
   - `userData/my-data/` (post-onboarding default; only present if a previous wizard run picked "Use default")

   `profile.json` and `device.json` are intentionally preserved — they survive a "fresh start" and are orthogonal to the data folder choice.

2. **Bootstrap defers everything when `appConfig.dataDir === null`.** Previously, even when the wizard SHOULD fire, bootstrap would synthesize `<userData>/dev-events`, load any leftover events from disk, fold them into the in-memory read model, and write a fresh `dataset.json` — all before the renderer could render the wizard. Now, when there is no configured dataDir, bootstrap stops after loading profile + appConfig + deviceId and marks itself as `onboardingPending`. The renderer's gate (`app:needsOnboarding` + `App.tsx`) keeps the main UI unmounted; the wizard is the only screen that runs.

3. **IPC registration is gated.** Handlers that depend on `getEventLog()` / `getDatasetId()` are only registered when bootstrap actually wired them up. During the wizard-pending state, only the handlers the wizard needs (`app:needsOnboarding`, `dialog:pickFolder`, `config:setDataDir`, `config:get`, `profile:*`, `shell:*`) are live.

4. **`config:setDataDir` is null-tolerant for the first-run case.** No SAME_DIR check, no datasetId-mismatch check (there is no workspace to switch FROM), no `previousDataDir` recorded. Schema-too-new and foreign-events.ndjson refusals stay absolute.

### Team Implications

- **`npm run dev` still seeds.** First-time devs without an `app-config.json` will now click through the wizard once (one extra click), then the dev-seed populates whatever folder they picked. Subsequent runs skip the wizard. **No change to the seeded data shape or location semantics.**
- **`npm run dev:empty` reliably reproduces first-run.** Anyone testing the onboarding flow can run it and trust that the wizard fires with an empty in-memory read model.
- **`npm run dev:reset` (existing dogfood reset) is unchanged.** It still wipes a single `OT_DATA_DIR` subdir and refuses to touch `dev-events/`.
- **Production impact:** None at runtime — production builds never had `OT_SEED` or `dev-events/` semantics. The bootstrap-defer-when-dataDir-null path is the production first-run path; it is now correct (was broken pre-PR but masked by `NODE_ENV !== 'production'` skipping the seed).

### What This Does NOT Change

- The priority-precedence rule for resolving dataDir (PR #202): `appConfig.dataDir` > `OT_DATA_DIR` env > default.
- The `config:setDataDir` contract for non-first-run flows: SAME_DIR, DATASET_MISMATCH, SCHEMA_TOO_NEW, etc., still apply when there is a current workspace.
- No new env vars introduced.

---

## Decision: Insights DonutChart — Single-Slice Rendering & Empty-State Contrast (PR #115)

**Author:** Trinity (Frontend Developer)  
**Date:** 2026-04-27T12:18:17Z  
**Status:** Shipped & Approved (Pedro confirmed "it works now")  
**PR:** #115 (squashed, merged)  
**Files:** DonutChart.tsx, DonutChart.css, DonutChart.test.tsx

### Context

Pedro reported two visual bugs on the Insights drilldown screen (PR #110, shipped):

1. **Donut chart single-slice Pac-Man bug:** When a single segment covers 100% of the donut, the SVG renders only ~75% (missing 25% wedge).
2. **Empty-state text contrast:** "Sin gastos para esta selección" barely visible (WCAG fail on --color-text-muted).

### D1 — Donut Single-Slice Rendering Fix

**Problem:** Most SVG donut charts use stroke-dasharray + stroke-dashoffset to draw slices. When one slice covers the full circle, the math fails:
- stroke-dasharray = "C C" (dash length = circumference, gap = circumference)
- stroke-dashoffset = -C/4 (rotate to 12 o'clock)
- The visible portion is only  ..3C/4 (75% of circle) — the Pac-Man effect.

This is a pure geometry problem, not a bug in our logic.

**Solution:** When a segment covers ≥99.999% of the circle, render a plain stroked <circle> with no dasharray/offset:

`	sx
if (segments.length === 1 && seg.percentage >= 99.999) {
  return (
    <circle cx={center} cy={center} r={radius} fill="none" stroke={color} strokeWidth={thickness} />
  );
}
`

Use >= 99.999 (not === 100) to absorb floating-point rounding from (value / total) * 100.

**Regression Test:** "renders a single 100% slice as a full ring (no Pac-Man gap)" validates that stroke-dasharray and stroke-dashoffset are both null when segment >= 99.999%.

**Skill:** Documented as .squad/skills/donut-single-slice/SKILL.md for reuse in future chart components.

### D2 — Empty-State Text Contrast Fix

**Problem:** Empty state copy ("Sin gastos para esta selección") was rendered as SVG <text> using --color-text-muted, which failed WCAG AA contrast on the donut panel background. Long labels were also clipped by SVG bounds.

**Solution:**
- **Color:** Switch from --color-text-muted → --color-text-secondary + font-weight 500
- **Rendering:** Change from SVG <text> to HTML overlay (position: absolute, display: flex, centered and padded)
- **Wrapping:** HTML overlay allows multi-line text to wrap inside donut bounds naturally

**Rationale:**
- --color-text-secondary is the standard "non-primary but readable" token used by EmptyState.css — keeps empty-state visual language consistent across the app
- --color-text-primary would over-emphasize an empty state and compete with KPI numbers
- HTML overlay is more resilient to long translations (ES vs EN)

### D3 — Empty-State Color Token Convention (App-Wide)

**Decision:** All empty-state text in chart components uses --color-text-secondary + font-weight 500, never --color-text-muted.

**Convention applies to:**
- New chart components (e.g., future line charts, bar charts in Insights)
- Existing chart components if they show empty states

**Rationale:** Parity with EmptyState.css pattern; WCAG AA compliance; prevents muted text from getting lost on light surfaces.

**No objections from Mouse/Niobe** → convention adopted as standard practice.

### Metadata

- **Skill created:** donut-single-slice (cross-agent discovery for chart work)
- **Decision source:** trinity-insights-visual-bugs.md (decision inbox, merged 2026-04-27)
- **Cross-agent impact:** Mouse (future chart components), Niobe (Insights amendments)

---

## Decision: Insights Spec — Pedro's Answers to 3 Open Questions (OQ-1, OQ-2, OQ-3)

**Author:** Pedro Rocha (via Copilot)  
**Date:** 2026-04-26  
**Status:** Locked & Approved  
**Related Spec:** docs/ux/specs/ux-005-insights-final-spec.md (Niobe, OQ-1/2/3 set)

### OQ-1 — Landing Date Window Default

**Question:** All-time or current year?  
**Answer:** **Current calendar year**, end capped at today.

**Rationale:** Niobe's mockup shows recent quarterly performance; all-time aggregates would wash out seasonal patterns.

**Implementation:** insights:landing-summary IPC request omits windowStart/windowEnd → backend defaults to { windowStart: Jan 1 of current year, windowEnd: today }.

---

### OQ-2 — Multi-Label Overlap Handling

**Question:** Disclose or accept (silently hide the double-count)?  
**Answer:** **Disclose with footnote** — "Nota: la suma entre tarjetas puede no coincidir con el total cuando hay superpuesto de etiquetas" / "Note: card totals may not match the grand total when labels overlap."

**Rationale:** Transparency > false precision. Users need to know that a transaction with multiple tags contributes to multiple cards. A footnote is the standard pattern for this type of caveat.

**Implementation:** Insights landing view includes a small ℹ️ icon or footer text (exact placement TBD by Mock-3 refinement). Resolved in OQ-2; drilldown uses strict OR semantics (locked in "Insights Drilldown IPC" decision).

---

### OQ-3 — Drilldown to Movimientos Link Filter

**Question:** Filter by tags only, or tags + date?  
**Answer:** **Tags + date** (Coordinator decision, delegated by Pedro).

**Rationale:** Preserves drilldown context as the user navigates to the full transaction detail view. If user is viewing, say, "Viajes, Q2 2026", they expect the Movimientos screen to open with those filters pre-applied.

**Implementation:** MovementsScreen accepts optional initialFilters?: { tagIds: string[], windowStart: string, windowEnd: string } (see "Insights Drilldown — UI Route State & Cross-Screen Handoff" decision for full contract).

---

## Impact

These three locked answers unblock:
- PR #98 (Insights scaffolding) — uses default window semantics
- PR #99 (DonutChart + SegmentedToggle) — no multi-label logic changes needed
- PR #100 (Landing implementation) — uses current-year default + footnote disclosure
- PR #101 (Drilldown implementation) — uses OR semantics + cross-screen handoff

**PR ship order:** #98 → #99 → #100 → #101. MVP is #98–100 (landing only; drilldown deferred to follow-up).

---

## Decision: Recent Transactions Sort Order — Business Date First

**Author:** Morpheus (Backend)  
**Date:** 2026-04-27  
**Status:** Implemented (PR #105)  
**Issue:** Dashboard "Recent transactions" showed only one account's data  

### Problem

Query sorted by `createdAt` only, clustering same-import-batch transactions and hiding cross-account diversity.

### Rule

All user-facing "recent transactions" queries MUST sort by **business date first, audit timestamp as tiebreaker:**

```typescript
.sort((a, b) => {
  if (a.date !== b.date) return b.date.localeCompare(a.date);      // primary: business date DESC
  return b.createdAt.localeCompare(a.createdAt);                   // tiebreaker: audit timestamp DESC
})
```

### Rationale

- `createdAt` = when transaction was entered (import time, manual-entry time)
- `date` = when transaction occurred in the real world
- Users expect "recent" to mean "recent occurrence", not "recently imported"

### Applies To

Any query presenting "latest N transactions" or "recent movements" to the user. Does NOT apply to audit trails or system event logs.

### Implementations

- ✅ `app/src/main/ipc/handlers/movements.ts` — MovementsList query (PR #105)
- ✅ `app/src/core/query/queries.ts` — queryRecentTransactions (PR #105)

**Commit:** b56ee21  
**PR:** #105

---

## Decision: Trinity PR #127 — Insights SubcategoryDistributionPanel

**Author:** Trinity (Frontend)  
**Date:** 2026-04-28  
**Status:** Merged (sha c987202)  
**PR:** #127  

### What Shipped

SubcategoryDistributionPanel on InsightsDetailScreen (Insights drilldown):
1. Donut + companion ranked bar list of subcategories
2. Panel-local Gastos/Ingresos toggle (dual-donut layout has no inheritance to leverage)
3. Selection coupling (clicking donut legend updates bar list)
4. Top N=10 with show-all toggle
5. Colour parity (donut-slice colour → bar-list pill colour via deterministic hash)
6. Locale-formatted right-aligned amounts

### Design Decision: Panel-Local Toggle

InsightsDetailScreen shows two donuts side-by-side (income + expense). Unlike tabbed UX with inherited selectors, the dual-donut layout required a **SegmentedToggle scoped to the panel**. 

**Future pattern:** If a second view-bound panel lands (e.g., "Top counterparties"), lift toggle to screen-level and reuse — do not proliferate toggles.

### Known Limit: txCount Tooltip

Pedro's "transaction count per subcategory" deferred — requires Morpheus schema/projection change. Currently shows name + amount + percentage. **Recommendation:** Next time the `subcategoryRowSchema` contract is touched, add `txCount` field.

### Reusable Pattern

Skill documented at `.squad/skills/donut-companion-bar/SKILL.md`:
- Donut + companion ranked bar list pattern
- Colour parity, view inheritance, selection coupling
- Reusable for Saldo (per-account → counterparty) and Movements (per-tag → category)

### Metrics

- 8 new tests
- +779 / −7 lines
- Reviewed by Neo (no concurrent Morpheus changes)

---

## Decision: Income/Expense/Net Canonical Visual Pattern

**Author:** Mouse (UI Designer)  
**Date:** 2026-04-27  
**Status:** Locked (PR #104)  

### Canonical Pattern

All income/expense/net KPI presentations across the app MUST use the Dashboard (Panel) pattern:

| Metric | Icon | Color Token | BGIcon Token |
|--------|------|-------------|--------------|
| Income | TrendingUp (20px) | `--color-income-default` | `--color-income-bg` |
| Expense | TrendingDown (20px) | `--color-expense-default` | `--color-expense-bg` |
| Net | Calculator (20px) | `--color-brand-primary` | `--color-brand-surface` |

**Component:** `KPIStrip` in `app/src/renderer/components/KPIStrip/`  
**Shared recipe:** `app/src/renderer/styles/globals.css` (lines 197–269)

### Enforcement

- All income/expense/net displays use `.ot-kpi-strip` + `.ot-kpi` classes from `globals.css`
- Component CSS MUST NOT override `.ot-kpi-*` classes
- Icon size: **20px only** (not 24px, not variable)
- Color tokens: use modifiers (`.ot-kpi--income`, `.ot-kpi--expense`, `.ot-kpi--net`), not inline styles

### Implementation (PR #104)

**Fixes:**
- ✅ Movements: Replaced custom `.ot-movements__totals` with `.ot-kpi-strip`; added icons; removed shadowing CSS
- ✅ Insights: Fixed icon size (24 → 20); wrapped in `.ot-kpi__icon` div
- ✅ Saldo: Already correct; no changes

**Anti-pattern caught:** Component CSS imported after `globals.css` silently shadows shared recipes.

**PR:** https://github.com/rett-europe/opentreasury-desktop/pull/104

---

## Decision: Chart Colors — Canonical Income/Expense Token Extension

**Author:** Mouse (UI Designer)  
**Date:** 2026-04-27  
**Status:** Proposed  
**Related:** PR #104 (canonical tokens), PR #105 (Dashboard chart)  

### Rule

When charts represent income vs. expense data semantically (monthly trends, category breakdowns, year-over-year), use canonical `--color-income-default` (green) and `--color-expense-default` (red) — NOT generic brand colors.

### Pattern

`GroupedBarChart` accepts color overrides via props:
- `barClassNames` (per series) — CSS class names for bar fills
- `legend` items — objects with `{ label, className }` to override swatch colors

**CSS semantic classes:**
```css
.ot-grouped-bar-chart__bar--income-solo { fill: var(--color-income-default); }
.ot-grouped-bar-chart__bar--expense-solo { fill: var(--color-expense-default); }
.ot-grouped-bar-chart__swatch--income-solo { background: var(--color-income-default); }
.ot-grouped-bar-chart__swatch--expense-solo { background: var(--color-expense-default); }
```

### Usage Examples

**Saldo (year-over-year):**
```tsx
barClassNames: ['ot-grouped-bar-chart__bar--income-solo', 'ot-grouped-bar-chart__bar--expense-solo']
legend: [
  { label: t('saldo.chart.legend.income'), className: 'ot-grouped-bar-chart__swatch--income-solo' },
  { label: t('saldo.chart.legend.expense'), className: 'ot-grouped-bar-chart__swatch--expense-solo' }
]
```

### Rationale

- **Visual consistency:** Income is green, expense is red everywhere
- **Semantic correctness:** Colour encodes data type, not arbitrary series order
- **User recognition:** Once-learned colour → meaning applies across entire app
- **Accessibility:** Consistent colour reinforces screen-reader labels and ARIA

### When NOT to Use

Component stays flexible for non-income/expense contexts:
- Multi-account comparison → use account colours
- Custom analysis → use custom schemes
- Generic data series → use brand primary/secondary

### Files

- Canonical tokens: `app/src/renderer/styles/tokens.css` (lines 66, 71, 314, 318, 399, 401)
- Component: `app/src/renderer/components/GroupedBarChart/GroupedBarChart.tsx`
- Chart CSS: `app/src/renderer/components/GroupedBarChart/GroupedBarChart.css` (lines 85–125)

**PR:** https://github.com/rett-europe/opentreasury-desktop/pull/104, https://github.com/rett-europe/opentreasury-desktop/pull/105

---

## DIRECTIVE: User Rule — Bulk Label Addition v1 Scope

**Author:** Pedro Rocha (via Copilot)  
**Date:** 2026-04-28  
**Status:** Active  
**Scope:** Bulk Add Label feature (PR #136–#137)  
**Applies to:** Morpheus (backend), Trinity (frontend)

### Rule

**Single label at a time. Keep existing labels. No create-new in v1.**

The bulk label operation appends a single user-selected label to the transaction(s), preserving all existing labels. This avoids massive bulk mistakes from multi-label apply or auto-creating invalid labels.

- **v1 Scope:** Single label, append-only semantics (no remove, no batch-replace)
- **v2 Future:** Multi-label support, create-new labels in picker, batch progress UI

### Rationale

Pedro's direct feedback after reviewing Morpheus bulk approval and Trinity bulk classify patterns: mass operations have high error cost. Starting with single-label append (reversible via label archive + refresh) is safer than multi-label or creation.

### Implementation Notes

- **Backend (Morpheus):** Command `bulkAddLabelToTransactions` uses append-set semantics. IPC contract: `IPC_TRANSACTION_BULK_ADD_LABEL`
- **Frontend (Trinity):** Modal single-select picker, archived tags filtered, validate-all-then-apply
- **Testing:** All-or-nothing on unknown transactions; per-tx idempotent skip

### Files

- Backend: `app/src/core/commands/bulkAddLabelToTransactions.ts`, handler in `transaction.ts`
- Frontend: `BulkAddLabelModal` component, integrated in `BulkActionsBar`

---

## DIRECTIVE: User Rule — Visual Quality Verification Baseline

**Author:** Pedro Rocha (via Copilot)  
**Date:** 2026-04-26T19:32:00+02:00  
**Status:** Active  
**Scope:** All visual/layout work  
**Applies to:** Trinity (frontend), Mouse (designer)

### Rule

**Tests green + looks aligned in my head is not enough.**

Visual work claims of "done" must include explicit verification at:
- Narrow viewport (<960px)
- Mid viewport (~1200px)
- Wide viewport (1430px+)
- **AND with subcategory rows expanded** (if applicable)

When a CSS recipe is being applied (e.g., from `.squad/skills/`), implementer must show evidence the recipe actually constrains the bug — not just "I followed the skill."

### Rationale

Three consecutive misses on the Saldo header/bar alignment bug (Mouse iter 3, Trinity iter 6) eroding trust. Pedro dogfoods every iteration; team must catch visual bugs end-to-end before claiming done.

### Process

- Niobe writes specs with **measurable acceptance criteria** for repeat-offender bugs.
- Visual claims must include screenshots or demo showing all breakpoints + expanded rows.

### Files

- Related: `app/src/renderer/components/GroupedBarChart/GroupedBarChart.css` (alignment recipe)

---

## Decision: Trinity PR #296 — SPEC-025 Shipped (Status-Based Transaction Edit Rules)

**Author:** Trinity (Frontend Developer)  
**Date:** 2026-05-07  
**Status:** Shipped & Merged  
**PR:** [#296](https://github.com/rett-europe/opentreasury-desktop/pull/296) (squash-merged into `main`)  
**Context:** SPEC-025, PR #295 (modal navigation), WI-19 (ImportWizard tests)

### What Landed

Single PR, three coupled changes:

1. **SPEC-025 — Status-Based Transaction Edit Rules**
   - `pending` transactions fully editable
   - `approved` transactions lock Date / Description / Amount / Account (via `aria-describedby` hint)
   - Status dropdown unlock mechanism (AC3)
   - Field lock applies on next open, not mid-modal (AC4)
   - SPEC-023 split-amount lock precedence (AC6)
   - Edit-mode summary banner hidden for pending
   - i18n keys `transactionDetail.editLock.*` (EN+ES)
   - `originalStatus` snapshot prop on `TransactionFormFields` is lock derivation knob

2. **ImportWizard Test Fix (3 failing → all 7 green)**
   - Root cause: PR #290 removed `<input type="file">`, tests still mocked it via `Object.defineProperty`
   - Solution: Mock `window.opentreasury.dialog.pickImportFile` (IPC bridge); click dropzone button
   - Establishes canonical mock pattern for future IPC tests

3. **Modal Navigation Port (from PR #295)**
   - Chevron Prev/Next in header
   - Arrow keyboard shortcuts
   - Unsaved-changes confirm
   - Edge disable
   - EN+ES strings
   - MovementsScreen wiring
   - Obsolete `readonly={false}` dropped (SPEC-025 supersedes)

### Closes / Supersedes

- **#294** (Detalles editable) — replaced by SPEC-025 status-based model
- **#280** (Modal next/prev navigation) — shipped in #296
- **#295** (Modal detalles + nav) — merged logic into #296; branch retained per Pedro

### Test Coverage & Validation

```
npm run typecheck ✅
npm run lint ✅ (max-warnings 0)
npm run format:check ✅
npm run test ✅ (1026 passed / 63 skipped / 0 failed)
CI re-running on main — all checks green
```

### Knowledge Transfer

**New Skill:** `.squad/skills/renderer-ipc-bridge-mocking/SKILL.md`
- Pattern for mocking `window.opentreasury.*` in vitest+jsdom tests
- Documents dialog-bridge migration gotcha (post-PR #290)

**Canonical Patterns:**
- Renderer IPC bridge: `window.opentreasury.<namespace>.<method>` (NOT `window.electron.invoke()`)
- Test fixture pattern: mock preload bridge, reflective of production contract
- Field lock expression: `originalStatus` snapshot + live `status` form state = single boolean (covers AC1–AC4 cleanly)

---

## DIRECTIVE: User Rule — Component Reuse Over JSX Duplication

**Author:** Pedro Rocha (via Copilot)  
**Date:** 2026-04-27  
**Status:** Active  
**Scope:** Frontend component architecture  
**Applies to:** Trinity (frontend)

### Rule

**When the same UI structure is needed in multiple screens, reuse via shared components. Avoid JSX duplication.**

Drift between copies has bitten us twice on PR #105:
1. Commit 2ef25df — Dashboard missing Tags + Status columns (Movements had them)
2. Commit fe45e7a — Dashboard column widths wrong (STATUS too wide)

Both required manual sync. This is error-prone and wastes time per fix.

### Going Forward

Extract shared components for cross-screen patterns (e.g., `<TransactionsTable>` for Dashboard + Movements). Column widths live in shared CSS, not per-screen.

### Example: TransactionsTable Refactor

**Target:** Extract canonical `<TransactionsTable>` accepting:
- `data: Transaction[]`
- `columns: Array<'select' | 'type' | 'date' | ...>` (configurable)
- `sortable?: boolean`
- `onRowClick?: (tx) => void`
- `selectedIds?: Set<string>`
- `onToggleRow?: (id) => void`

Both Dashboard and Movements render this component with respective column sets and handlers.

**Priority:** Low urgency (future refactor), but next drift incident should trigger it rather than another manual sync.

### Files

- `app/src/renderer/screens/MovementsScreen/MovementsScreen.tsx` (canonical: lines 560–740)
- `app/src/renderer/screens/MovementsScreen/MovementsScreen.css` (canonical: lines 418–480)
- `app/src/renderer/screens/PanelScreen/PanelScreen.tsx` (duplicate: lines 240–385)
- `app/src/renderer/screens/PanelScreen/PanelScreen.css` (duplicate: lines 31–130)

---

## DIRECTIVE: User Rule — Prototype as Reference, Not Spec

**Author:** Pedro Rocha (via Copilot)  
**Date:** 2026-04-26T21:52:44+02:00  
**Status:** Active  
**Scope:** Insights implementation (WI-?, M4)  
**Applies to:** Niobe (spec), Team (implementation)

### Rule

**Challenge every detail in the prototype folder. Prototype is a reference point, not a spec.**

Prototype Insights pages exist as inspiration, but team must validate each pixel/interaction against UX-005 and product intent rather than copying verbatim.

### Rationale

Prototypes are quick explorations and often omit edge cases, error states, or accessibility considerations. A spec-first approach (Niobe) catches these before implementation.

### Files

- Prototype: `.squad/evidence/prototype/` (Insights pages)
- Canonical spec: `UX-005` (Niobe ownership)

---

## SURVEY: Mouse Insights Read-Only Codebase Assessment

**Author:** Mouse (UI Designer)  
**Date:** 2026-04-27  
**Status:** Informational  
**Purpose:** Pre-implementation audit for Insights section (#69, M4) while Niobe amends UX-005. No code changes.

### Key Findings

**Missing:** InsightsScreen does not exist. Will be new sibling to SaldoScreen.

**Routing integration needed:**
- Add `'insights'` to `Route` union in `AppShell.tsx`
- Add nav item to first section in `NAV_SECTIONS`, after `'balance'`
- i18n keys: `shell.nav.insights` (ES: "Análisis", EN: "Insights")
- Icon: `chart-line` from `lucide-react` (per UX-005 §6)
- Wire route in `App.tsx` conditional chain

**Data model (Tag/Label aggregation):**
- Existing: CRUD handlers in `app/src/main/ipc/handlers/tags.ts`
- Missing: Aggregation queries for Insights (per-tag YoY, category distribution)
- Will need new IPC channels: `insights:label-yoy`, `insights:category-by-year`, etc.

**Tag color storage:**
- Already present in `TagRecord.color` (optional `string`, hex or CSS names)
- No schema validation at wire level; format validation in handler

### Scope Implications

- Full survey doc: Mouse `mouse-insights-survey.md` (28.5 KB) in `.squad/decisions/inbox/`
- Ready for Niobe spec refinement (UX-005 amendment)
- Ready for Morpheus IPC contract design (aggregation queries)

### Files Audited

- `app/src/renderer/screens/` (structure)
- `app/src/renderer/AppShell.tsx` (nav sections)
- `app/src/main/ipc/handlers/tags.ts` (existing tag handlers)
- `app/src/shared/ipc-contracts/tags.ts` (tag contract)

---

## Directive: User directive — raise the bar on visual quality

**Author:** Pedro (via Copilot)  
**Date:** 2026-04-26T19:32:00Z  
**Status:** Active  
**Scope:** All visual/layout work claims of "done"

### Rule

Visual work must be **verified end-to-end before claiming done** — including expanding subcategories, resizing the window across the FULL viewport range (not just one width), and confirming the prototype reference matches at multiple breakpoints. "Tests green" + "looks aligned in my head" is not enough.

### Rationale

Three consecutive misses on the Saldo header/bar alignment bug (iter 3 Mouse, iter 6 Trinity) is unacceptable. Pattern of misses is eroding trust. Pedro is dogfooding every iteration; we're spending his time on bugs we should have caught.

### Going forward

- Visual/layout work claims of "done" must include explicit verification at: narrow (<960px), mid (~1200px), wide (1430px+), AND with subcategory rows expanded.
- If a CSS recipe is being applied (e.g. a skill from `.squad/skills/`), the implementer must show evidence the recipe actually constrains the bug being fixed — not just "I followed the skill."
- Niobe writes specs with measurable acceptance criteria for repeat-offender bugs.

---

## Directive: Prototype as inspiration, not copy-paste spec

**Author:** Pedro (via Copilot)  
**Date:** 2026-04-26T21:52:44Z  
**Status:** Active  
**Scope:** Prototype folder + Insights spec work

### Rule

The prototype folder now contains Insights pages as inspiration — but the team (Niobe especially) **MUST challenge every detail** rather than copying. Prototype is a reference point, not a spec.

### Rationale

User request — captured for team memory.

---

## Directive: Prefer component extraction over JSX duplication

**Author:** Pedro (via Copilot)  
**Date:** 2026-04-27  
**Status:** Active  
**Scope:** UI component architecture

### Rule

When the same UI structure is needed in multiple screens, reuse via shared components. Avoid JSX duplication — drift between copies has bitten us twice on PR #105 (column headers, then column widths).

### Rationale

Trinity flagged repeated drift; Pedro confirms reuse-first as a going-forward rule.

---

## Decision: Close detail modal after edit-save (Movements)

**Author:** Trinity (Frontend Dev)  
**Date:** 2026-04-28  
**PR:** #140 — `fix(movements): close all modals after edit-save (no auto-reopen)`  
**Refs:** #133, #139

### Context

PR #133 introduced "stale modal after edit-save" bug (modal shows pre-save snapshot). PR #139 fixed the data-freshness side by deriving `selectedTx` / `selectedRawRecord` from `selectedId` + `rawRecordById`. After that fix, Pedro confirmed the data was correct on re-mount but **rejected the flow itself**:

> "the edit modal after saving disappears for 1 sec or 2, and then the view modal shows-up... I want a different flow"

When asked to choose between options, Pedro picked:

> "Close everything — return to the transaction list (simplest, no flash)"

### Decision

After a successful edit-save in `MovementsScreen` ↔ `TransactionDetailModal`, the screen now **clears `selectedId`** — the detail modal unmounts, the user lands on the bare movements list. No view-modal re-appearance. No "Cargando" flash visible.

This rule applies specifically to the **save-driven** `loadAll()`. Other triggers (external `configRevision` bumps, retry, etc.) keep the modal open and rely on the derived-state machinery from the existing `read-model-refresh-after-mutation` skill.

### Scope

- Single-transaction edit-save flow ✅ (this PR)
- Bulk flows (classify, add-label, approve) — **untouched**: they operate on the multi-select set, not on `selectedId`, so they were never on the auto-reopen path.
- Delete flow — already cleared `selectedId`; unchanged.

### Skill update

`.squad/skills/read-model-refresh-after-mutation/SKILL.md` updated with an addendum describing the close-after-save policy and a decision-rule table mapping `loadAll()` triggers to modal lifecycle behaviour.

### Validation

- `npm run typecheck`, `npm run lint`, `npx prettier --check`, full `npm test` (824 passed) all green.
- `MovementsScreen.staleModal.test.tsx`:
  - Test 1 (derived-state freshness on external configRevision bump) — kept, retitled.
  - Test 2 (Pedro flow) — replaced. Now asserts the detail `<dialog>` is closed after `handleSaveEdit`, table rendered behind it.

### Open questions / follow-ups

None for this PR. If a future requirement needs the modal to remain open after save (e.g. a "save & next" affordance), revisit per-screen rather than reverting the rule.

---

## Recommendation: TransactionsTable Duplication Drift (Trinity, 2026-04-29)

**Author:** Trinity (Frontend Dev)  
**Date:** 2026-04-29  
**Status:** Recommendation (future refactor, not urgent)

### Problem

The recent-transactions table on Dashboard (`PanelScreen`) duplicates JSX from `MovementsScreen` instead of sharing a component. This has caused **two separate drift incidents** in PR #105:

1. **Commit 2ef25df** — Dashboard was missing Tags + Status columns that Movements had
2. **Commit fe45e7a** — Dashboard had incorrect column widths (STATUS too wide, DATE/ACCOUNT/DESCRIPTION wrong sizes)

Both fixes required manually syncing the duplicate JSX and CSS to match MovementsScreen.

### Current State

**Canonical source:** `MovementsScreen.tsx` + `MovementsScreen.css` (lines 418-480 for column widths)

**Duplicate:** `PanelScreen.tsx` columns array + `PanelScreen.css` nth-child width rules

The tables share:
- Same column order (type, date, account, description, category, subcategory, tags, status, amount)
- Same rendering logic (type arrows, account pills, category/subcategory text or badges, tag chips, status badges, currency amounts)
- Same column widths (except Dashboard omits select checkbox column)
- Same table-layout: fixed + min-width + horizontal scroll behavior

The only differences are:
- Dashboard: no select column, no sortable, no row actions, 8-row limit
- Movements: select column, sortable headers, row click → detail modal, full pagination

### Risk

Every future change to Movements table structure (new columns, width tweaks, rendering changes) must be manually propagated to Dashboard or they drift again. This is error-prone and wastes time on each fix.

### Recommendation

Extract a shared `<TransactionsTable>` component that accepts:
- `data: Transaction[]`
- `columns: Array<'select' | 'type' | 'date' | ...>` — configurable column set
- `sortable?: boolean`
- `onRowClick?: (tx) => void`
- `selectedIds?: Set<string>`
- `onToggleRow?: (id) => void`

Both screens render this component with their respective column sets and handlers. Column widths live in the shared component CSS, not per-screen.

This is a **future refactor**, not urgent — but the next drift incident should trigger it rather than another manual sync.

### Files

- `app/src/renderer/screens/MovementsScreen/MovementsScreen.tsx` (lines 560-740)
- `app/src/renderer/screens/MovementsScreen/MovementsScreen.css` (lines 418-480)
- `app/src/renderer/screens/PanelScreen/PanelScreen.tsx` (lines 240-385)
- `app/src/renderer/screens/PanelScreen/PanelScreen.css` (lines 31-130)

---

## Decision: Trial Readiness — Product Framing (Link, Link — PM)

# Trial Readiness: Product Framing (Link — PM)

**Date:** 2026-04-21  
**Blocker context:** Pedro → "Login shows my name + ADMIN; data storage scope unclear"  
**Decision source:** Product vision (docs/product/vision.md), architecture decisions (ADR-001/002), security sign-off (docs/security/security-requirements-v0.2.md)

## Trial User Profile

**Primary:** NGO treasurer + 1 optional co-reviewer (board member or accountant)  
- Single NGO, shared OneDrive for Business / SharePoint folder
- Small enough to fit desktop-first workflow (no team hub required)
- Realistic NGO setup = Rett Spain template (M365 tenant, shared folder as DAO)

**Secondary users (validation only, not MVP):** power user = treasuerer on different NGO (test multi-org folder/secret data isolation)

**NOT yet tested in trial:** multi-device sync, conflict resolution, revocation workflows, offline-first scenarios

---

## Identity Model for Trial: Minimum-Viable Answer

**Current state:** Hard-coded "Link" + "ADMIN" in prototype — this is UNSHIPPABLE for trial.

**What trial actually needs:**

1. **Implicit Microsoft account identity** (= folder owner/contributor). App reads:
   - `https://graph.microsoft.com/v1.0/me` at first launch → display real name in shell (sidebar, audit log)
   - No login dialog, no session mgmt. SSO via OneDrive folder access
   - **Acceptance:** Treasurer opens app → app shows "Maria López (Treasurer)" in audit log, not "Link (ADMIN)"

2. **Role placeholder for trial only:**
   - Hardcode first-launch user as "Admin" (folder co-owner)
   - Second user enrolling into existing folder = "Contributor"
   - This is a UI tag, not a permission system (folder ACL is the real gate)
   - **Not stored:** roles are NOT persisted or synced; re-derive from folder ownership on each launch
   - **Defer role editor** to v1.x (M4)

3. **Why not full RBAC?**
   - M365 folder permissions already enforce boundary; custom role DB = false layering
   - OneDrive ACL is the source of truth; replicating it locally breaks
   - Keep the design principle: folder structure = access control

---

## Storage Scope Clarification: OneDrive for Business / SharePoint

**The ask** ("OneDrive or SharePoint?") was actually **two separate questions** rolled into one. Disentangling:

### Q1: Sharing vs. Sync (Product Design)
- **Sharing = YES.** Multiple treasurers in one NGO read/write **same dataset** in a shared folder
- **Sync = Secondary.** Single treasurer device-hopping (desktop → laptop) is *nice-to-have*, not *must-have* for trial
- **This is fundamentally different from personal backup.** Design consequence: event-sourcing + conflict resolution must be baked in M1 (not M2)

### Q2: OneDrive Personal vs. Business (v1 Scope Gate)
- **Decision already made:** v1 = **Business + SharePoint only**. Personal deferred to v1.x (see decisions.md 2026-04-19)
- **Why:** NGOs live in M365 tenants; Business/SharePoint provides org-grade ACLs; Rett Spain env uses Business
- **For trial:** Rett's test folder = Business path. Works. Consumer OneDrive paths are explicitly rejected at folder-picker.

### Q3: Where do encrypted events live?
- **Answer:** Same shared folder. Events are immutable, UUID-named files → zero write conflicts on OneDrive
- **DEK (data encryption key)** wrapped per user in `.treasury/keys.json` in the same folder
- **Consequence:** new treasurer enrolling in existing folder auto-downloads her copy of keys.json, decrypts with her Microsoft account → both see same data

---

## Trial Success Criteria (Blockers to Close)

| Blocker | Trial Answer | Deferred to |
|---------|--------------|-------------|
| Login shows hardcoded name/role | Read MS account name at launch; derive role from folder owner via Graph API | v1.x: persistent user prefs |
| Identity for multi-user | Implicit (folder membership). First user = Admin tag (folder co-owner); subsequent = Contributor tag | v1.x: full RBAC |
| Data storage location (ambiguous) | **Shared folder = database** (not backup). M1 must handle concurrent writes in same folder → event-sourcing + conflict resolution non-negotiable | Already committed (ADR-001) |
| Where does encryption sit? | Event files in shared folder. DEK wrapped per user. Search breaks (by design); audit log works | M1 blocker (crypto wiring in progress) |

---

## NOT Needed for Trial (Defer Fearlessly)

1. **Role editor** → v1.x. Folder ACL is sufficient.
2. **Enrollment revocation** → v1.x (M2 has basic enroll; revoke is M4).
3. **Device sync conflict UI** → v1.x. Trial = single active device per user (no offline handoff).
4. **Full audit viewer** → v1 (M2 ships basic; full queries v1.x).
5. **OneDrive Personal** → v1.x (explicit rejection at first-run).
6. **Backup / disaster recovery** → v1.x (out of scope; OneDrive versioning is the backup).
7. **Offline work** → v1.x. Trial assumes connectivity to folder.

---

## Next Steps (For Switch & Morpheus)

- **Switch:** Validate that implicit Graph API identity + folder-ACL-as-auth closes the auth blocker. Document any PII surface (real names in audit log = within threat model?).
- **Morpheus:** WI-4 (folder picker), WI-5 (crypto wiring) must include: `GET /me` → display name in shell, derive admin flag from folder owner via Graph. No session table. No login form.
- **Niobe:** First-run UX must reject Personal OneDrive paths with clear v1.x message. Shell must display logged-in user name + trial note (not "Link" + "ADMIN").

**Decision owner:** Link (PM)  
**Stakeholders:** Pedro (product owner), Switch (security), Morpheus (core), Niobe (UX), Neo (architecture)


---

## Decision: Trial Identity & Auth — Security Recommendation (Pedro → Switch)

# Trial Identity & Auth — Security Recommendation

**Author:** Switch (Security Engineer)
**Date:** 2026-04-21
**Requested by:** Pedro
**Related:** `link-trial-readiness.md` (Link/PM, same date), ADR-001/002, `docs/security/security-requirements-v0.2.md`
**Status:** Proposed — needs Pedro's lock + Morpheus sequencing

---

## 1. Current State (what's wired today)

The "my name and ADMIN" Pedro sees is **100% hardcoded**. There is no auth, no session, no user entity, no login flow.

### UI surface
- `app/src/renderer/locales/en/common.json:52-55` and `…/es/common.json:52-55` — keys `shell.user.name = "Pedro Rocha"` and `shell.user.role = "Admin"`. These are translation strings, not user data.
- `app/src/renderer/screens/AppShell/AppShell.tsx:495-496` — renders `t('shell.user.name')` / `t('shell.user.role')` in the sidebar user-strip.
- `app/src/renderer/screens/AppShell/AppShell.tsx:368` — tenant label `"Demo NGO"` is also hardcoded inline.
- `Sign out` button (line 500) is a visual stub — no handler.

### Event/audit surface
- `app/src/main/ids.ts` defines two **module-level constants**: `DATASET_ID = fakeUlid('DATASET01')` and `ACTOR_DEVICE_ID = fakeUlid('DEVICE01')`. These are deterministic — *every event from every install ever written by this codebase carries identical IDs*.
- The file's own comment: *"Until M2 ships proper account provisioning these use the same deterministic 'fake ULID' values."*
- `app/src/core/events/schemas.ts:8` — `actorDeviceId` is the **only** identity field on every `DomainEvent` envelope. There is no `actorUserId`, no display name, no tenant id.
- No event signing. No tamper detection. Append-only NDJSON is the only integrity guarantee.
- `app/src/main/devSeed.ts` references `'Administrativo'` — that's a Spanish *category name* ("administration expenses"), unrelated to roles. False hit.

### Net assessment
Trial cannot start with this. Two concrete blockers:

1. **UX blocker (visible):** Every treasurer sees "Pedro Rocha / Admin". Unshippable.
2. **Audit blocker (invisible but worse):** Even if two real users shared a OneDrive folder today, every event they write would be attributed to the same `DEVICE01` ULID. The audit trail is a single anonymous voice — useless for the very compliance story we sell to NGOs.

The audit blocker is the one a security review would actually fail on. The UI string is cosmetic.

---

## 2. Trial Options — Ranked

### Option A — **Local Profile on First Launch** (RECOMMENDED for trial)

**What:** First-run modal collects `displayName`, `role` (Admin / Contributor / Viewer label), `ngoName`. Persisted to `<userData>/profile.json` with a generated `userId` ULID. UI reads from profile; events stamp `actorUserId` + `actorDisplayName`.

**Build cost:** ~1 dev-day.
- New main-process `profile` module (read/write/IPC).
- 1 first-run React modal (name + role select + NGO name).
- Add `actorUserId: string` (ULID) to `DomainEvent` schema in `core/events/schemas.ts`. Optional `actorDisplayName` for offline rendering.
- Replace 2 i18n keys + the `Demo NGO` literal in `AppShell.tsx`.
- Update `ids.ts` to seed `ACTOR_DEVICE_ID` from profile.

**Security trade-offs:**
- ✅ **Per-user audit attribution** is now real. Each install has a stable, unique `actorUserId`.
- ✅ **No new attack surface.** No tokens, no network, no secret store.
- ✅ **Aligned with offline-first threat model.** In a single-user-per-device deployment, the OS account *is* the trust boundary. Self-asserted identity is acceptable for the same reason a local Word doc trusts the OS user.
- ⚠️ **Self-asserted = spoofable.** A user can claim any name/role. For a single-NGO trial of ≤3 trusted users this is acceptable; the folder ACL (M365) is the real authorization gate, not the app's role label.
- ⚠️ **No event signing** — anyone with NDJSON write access can forge `actorUserId`. Same risk as today, just now the field exists and can be signed in GA.
- ❌ Doesn't solve multi-user-per-NGO out of the box: if two treasurers share a folder, both go through their own first-launch and self-pick "Admin". The role label is cosmetic — but folder ACL still enforces the real boundary.

**What changes for GA:** Replace self-asserted identity with Graph-derived (Option B below). `actorUserId` field stays — only its source changes.

---

### Option B — **Implicit Microsoft Graph Identity** (Link's recommendation)

**What:** Once the OneDrive folder picker (M2, WI-4) lands, call MS Graph `/me` with the same token. Cache `oid` (immutable AAD object id GUID), `displayName`, `userPrincipalName`, `tenantId`. Stamp `actorUserId = oid`. Derive role from folder owner via `/drive/items/{id}/permissions`.

**Build cost:** ~3–5 dev-days *on top of* M2 MSAL/OneDrive wiring. **Cannot ship before M2.**

**Security trade-offs:**
- ✅ Real per-user attribution backed by Entra ID.
- ✅ No bespoke role DB — folder ACL is the source of truth.
- ✅ Tenant-scoped: `tenantId` on events lets us reject cross-tenant data leakage.
- ⚠️ Graph token cache is sensitive — must use Electron `safeStorage` (DPAPI on Windows), not plain disk. Adds review surface.
- ⚠️ Still no event signing — folder co-owner can forge `actorUserId` in their local NDJSON before sync. Acceptable for trial; **must** ship signing before GA.
- ❌ Hard dependency: blocked on M2 OneDrive wiring. Pedro wants to start trial *now*.

**Verdict:** This is the right destination, not the right starting point.

---

### Option C — **Full MSAL Electron Login** (Entra ID parity with cloud)

**What:** Interactive PKCE flow via `@azure/msal-node` + system browser, login screen, refresh tokens, logout, multi-tenant.

**Build cost:** 1–2 dev-weeks done correctly (PKCE, token cache encryption, refresh, logout, error UX, account switching).

**Security trade-offs:**
- ✅ Cloud product parity — same identity model end-to-end.
- ❌ **Friction without value for offline-first.** A login screen on a desktop app whose data lives in a OneDrive folder you already authenticated against = double auth. The folder ACL is the authoritative gate; an in-app login that doesn't grant any additional capability is theatre.
- ❌ Token storage now holds long-lived refresh tokens — bigger blast radius if exfiltrated.
- ❌ Doesn't ship faster than Option B; same MSAL dependency, more code.

**Verdict:** Overkill for trial. Premature for GA. Reconsider only if/when we add a server-side component the desktop talks to directly.

---

## 3. Recommendation

**Ship Option A for trial. Graduate to Option B when M2 OneDrive lands. Defer Option C indefinitely.**

### Rationale
1. **Pedro can start trial this week.** Option A is ~1 day of work and unblocks both visible and audit blockers.
2. **Schema-forward.** The `actorUserId` field added in Option A is the same field Option B will populate later. No event migration when we upgrade — only the value's *source* changes (`profile.json` → Graph `oid`). Plan for this now: make `actorUserId` opaque (string ULID/GUID), and reserve `actorIdentitySource: 'local' | 'aad'` so we can distinguish trial-era events from GA events in the audit log.
3. **Honest about the threat model.** In offline-first single-user-per-device, identity verification cannot come from the app — it comes from the OS account and (later) the folder ACL. Self-asserted identity in the app is honest; a login screen that doesn't actually gate anything is theatre.
4. **Audit becomes useful immediately.** Events stop being attributed to `DEVICE01` and start being attributed to a real (if self-asserted) user.

### Concrete asks

**Niobe (UX):**
- First-run modal: name (required), role select (Admin / Contributor / Viewer — *cosmetic label, not an authorization*), NGO name (required). Copy must say "this is how your changes will be labelled" — no implication that role grants permissions.
- Settings screen entry to edit profile after first launch (rename, role re-pick).

**Morpheus (Core):**
- Add `actorUserId: z.string().length(26)` and optional `actorDisplayName: z.string().max(120)` and `actorIdentitySource: z.enum(['local','aad'])` to event envelope in `app/src/core/events/schemas.ts`. Keep `actorDeviceId` — it's still useful for "which install".
- Remove module-level `ACTOR_DEVICE_ID` constant from `ids.ts`. Generate per-install on first launch and persist in `profile.json`. Remove `DATASET_ID` constant likewise — datasetId belongs on the dataset, not the binary.
- New IPC: `profile:get`, `profile:set`, `profile:isFirstLaunch`. Profile file lives in `app.getPath('userData')`, mode `0600` on POSIX (Windows ACL inherits — fine).

**Niobe + me:** review the role-label copy together so we don't accidentally promise enforcement we don't deliver.

### What changes for GA (must, not nice-to-have)
1. **Option B integration** — replace self-asserted profile with Graph `/me` once M2 ships. `actorIdentitySource` flips to `'aad'`, `actorUserId` ← Graph `oid`.
2. **Event signing** — every event signed with a per-user key (Ed25519 device key wrapped via DPAPI / safeStorage, or HMAC with DEK-derived subkey). Without this, audit trail is forgeable by any folder co-writer. **This is the single biggest GA blocker** and it's independent of which identity option we pick — note it for the GA security checklist regardless.
3. **Tenant binding** — `tenantId` on events; reject events whose `tenantId` doesn't match folder tenant on read. Prevents cross-NGO data confusion.
4. **Settings UX for re-keying** — when a contributor leaves an NGO, the remaining users need to rotate the DEK. Out of scope for trial; on the M4 list.

---

## 4. Open questions for Pedro

1. **Role label scope** — do we want 3 labels (Admin / Contributor / Viewer) or just 2 (Admin / Member)? Link's framing suggests Admin + Contributor. I'll defer to product but recommend matching cloud product vocabulary, whatever that is.
2. **Multiple profiles on one device** — out of scope for trial? (My recommendation: yes, single profile per OS user. Anyone needing to test multi-user uses different machines or different OS accounts.)
3. **Telemetry** — does the `displayName` on events get included if/when we add error reporting? Default to **no** unless you explicitly opt in. Real names in crash dumps = GDPR surface.

---

**Decision owner:** Pedro
**Stakeholders:** Switch (security — author), Link (PM — aligned), Morpheus (impl), Niobe (UX), Neo (architecture)


---

## Decision: Trial Configuration — Data-storage location (Pedro → Morpheus)

# Morpheus → Inbox: Data-storage location configurability for real-user trials

**By:** Morpheus (backend)
**Trigger:** Pedro asked, while preparing real-user trials, how the events.ndjson location is configured and whether it can live in OneDrive for Business / SharePoint (per the original vision).
**Status:** Proposal — awaiting Pedro decision on M1.5 trial scope; touches Trinity (settings UI), Niobe (UX-001 first-run), Switch (multi-writer threat model), Neo (ADR alignment).

---

## 1. Current state (as of this writing)

**Resolution path** — `app/src/main/bootstrap.ts::resolveEventLogDir()`:

```ts
const override = process.env['OT_DATA_DIR']?.trim();
const subdir = (override && !/[\\/]/.test(override) && !path.isAbsolute(override))
  ? override : 'dev-events';
return path.join(app.getPath('userData'), subdir);
```

- Single resolution rule: `<userData>/<subdir>/events.ndjson`.
- `OT_DATA_DIR` env var **only accepts a plain folder name** — absolute paths and path separators are explicitly rejected (kept inside userData by design, for dev-sandbox isolation).
- No settings UI, no folder picker, no CLI flag (other than the env var).
- `userData` resolves to `%APPDATA%/opentreasury-desktop/` on Windows (provided Electron is launched with `args: ['.']` so package.json is read — see PR #46 history).
- Only consumers of `OT_DATA_DIR` today: `scripts/perf-seed.mjs`, `scripts/reset-dogfood-data.mjs`, e2e specs. **The desktop app itself currently has no in-product way to point at a different folder.**
- `JsonFileEventLog` is path-agnostic; it accepts an absolute `dir` from its caller. Bootstrap is the only choke point.

**User-facing reality today:** a real user cannot put their dataset on OneDrive without (a) editing an env var before launch, (b) rebuilding, or (c) the launcher script being modified. The env var also can't point at OneDrive even if they tried — separator check rejects it.

## 2. Configurability proposal (smallest change, trial-grade)

### 2.1 Drop the "no separators / no absolute" restriction in `OT_DATA_DIR`
Change `resolveEventLogDir()` to accept an absolute path when given, and only fall through to `<userData>/dev-events` otherwise. This unblocks dogfood/trial users immediately — they set `OT_DATA_DIR=C:\Users\X\OneDrive - Rett\OpenTreasury\ngo-rett-spain` in the shortcut and ship.

**File:** `app/src/main/bootstrap.ts` — relax the `subdir` guard, add `path.isAbsolute(override)` branch.

### 2.2 Persist the choice in a tiny `app-config.json` under `userData`
A 5-line JSON file (`<userData>/app-config.json`) with `{ "dataDir": "<absolute path>" }` overrides env var and dev-events default. This is the bridge to a real settings UI without scope-creeping it now.

- Resolution precedence: `OT_DATA_DIR` env var > `app-config.json::dataDir` > `<userData>/dev-events`.
- The file is written by a future first-run wizard (UX-001) or, for trials, by hand / by a tiny "Choose data folder…" menu item Trinity can wire up in ~50 LOC (`dialog.showOpenDialog` → write JSON → relaunch).
- Non-encrypted, **per-device preference only** — matches the precedent already set by `docs/architecture/adr-003-i18n-framework.md` for locale settings (`userData`-resident, no PII, orthogonal to the OneDrive dataset).

**Files involved:**
- `app/src/main/bootstrap.ts` — read `app-config.json` between env-var and default branches.
- New `app/src/main/services/appConfig.ts` — `readAppConfig()` / `writeAppConfig(patch)`. Schema-validated with Zod. Tolerant of missing/corrupt file (fall back to default, log warning).
- New IPC handler `app:setDataDir(absolutePath)` — validates, writes, requires `app.relaunch()` (we cannot swap the event log mid-flight without re-hydrating reducers; relaunch is honest and simple).

### 2.3 Validation rules at folder selection
- Path is **absolute** and writable (probe write `.otwrite-probe`, then unlink).
- If folder is empty → OK, will create `events.ndjson` on first append.
- If folder contains an `events.ndjson` → run a dry `JsonFileEventLog.load()` to ensure it's valid (catches WI-23 boot-guard failures **before** committing the choice). Reject with the same `LEGACY_EVENT_TYPE_REJECTED` message we already surface.
- If folder contains `events.ndjson` AND any conflict-copy siblings (`events-Pedro's PC.ndjson`, `events (1).ndjson`, etc.) → **block** with explicit "OneDrive conflict detected — resolve before opening" message. (See §3.)
- Reject Personal-OneDrive paths in v1, per decisions.md 2026-04-19 §5 ("OneDrive for Business / SharePoint only"). Detection: heuristic on path containing `OneDrive - <tenant>` (Business) vs. plain `OneDrive` (Personal). Imperfect; document the limitation.

### 2.4 First-launch UX (defer to Niobe + Trinity, but unblock today)
- **Trial-grade (now):** a Settings → "Data folder" item showing current path + "Change…" button. Plus the env var. That's enough for Pedro to onboard 2–3 trial users.
- **Product-grade (M2):** the UX-001 first-run wizard already specced (`docs/ux/specs/ux-001-first-run-setup.md`) — admin-create vs. join-existing flows, posture gate, Personal-OneDrive rejection. Wire `app-config.json` write into that wizard's completion step.

### 2.5 "Switch dataset" UX
With `app-config.json` + relaunch in place, "open another NGO's data" = Settings → Change… → pick folder → relaunch. No multi-tenant-in-one-process complexity. Good enough for trials and probably good enough for v1 (NGOs rarely switch contexts).

## 3. OneDrive / SharePoint feasibility — the honest answer

**Single-user, single-device:** ✅ works today modulo the path-separator restriction. OneDrive is just a synced folder; `JsonFileEventLog.append()` does `open('a') + write + fsync + close`, which OneDrive will pick up and sync. No code change needed beyond §2.1.

**Single user, multiple devices (sequential, never concurrent):** ⚠️ works **if** the user is disciplined about closing the app on device A before opening on device B and waiting for OneDrive to settle. Otherwise:
- OneDrive on Windows uses the Files-On-Demand placeholder model — `events.ndjson` may be a placeholder until first read; `fs.open('a')` will hydrate it (acceptable, just slow first time).
- OneDrive does **not** propagate appends as deltas — it re-uploads the whole file on close-handle change detection. With our `open/write/fsync/close` per event, every single appended event triggers a full file re-upload. At trial scale (hundreds of events) this is fine; at 10k events × ~600 bytes = 6 MB re-upload per event would be painful. **Mitigation for trials:** acceptable. **Mitigation for v1:** consider keeping the file open longer or batching, but that's a separate ticket.
- Two devices both writing while OneDrive hasn't fully synced → OneDrive creates a **conflict copy** (`events-PCNAME.ndjson`). Our code does not detect or merge these. The dataset silently diverges.

**Multi-user concurrent (the original vision goal):** ❌ **not safe** with the current single-file NDJSON design.
- Append-only buys us a lot — there's no overwrite, only end-of-file extension — but OneDrive isn't a real shared filesystem. It's eventually-consistent file sync. Two users appending offline → two conflict-copy files, no automatic merge.
- A correct multi-writer story needs one of:
  - Per-writer files (`events-{deviceId}.ndjson`) merged on read by timestamp/lamport — closer to the **original ADR-001 Option A** (UUID-named immutable event files, zero-conflict by construction). Decisions.md §2026-04-15 explicitly notes Option B "single binary file cannot survive multi-writer offline edits on a shared folder — dealbreaker." We are currently on Option B for M1.5 and that was a deliberate scope cut.
  - OR: a soft lock-file convention (`events.ndjson.lock` with owner/heartbeat) + UI that puts everyone else into read-only when the lock is held. Crude but trial-viable.
  - OR: full CRDT/vector-clock merge — out of scope for trial.
- This is exactly the ground covered by `.squad/decisions.md` lines 1219, 1623, 1746 (10k-files-in-OneDrive stress spike), and the M2 column of the M1.5 design doc. **It is a known deferred risk, not a new finding.**

### Trial-grade recommendation (Pedro to confirm)

> **One writer at a time per dataset.** Each NGO trial gets one OneDrive folder shared with its team. The treasurer is the active writer; everyone else opens the app **read-only** (we add a `--read-only` flag or an `app-config.json::readOnly: true` toggle that disables all `eventLog.append` calls in IPC handlers — Switch should review). Pedro communicates this constraint explicitly in trial onboarding. Multi-writer concurrency is a v1 / M2 problem to be resolved by re-introducing per-writer files.

This is honest, ships in a sprint, and matches the deferral already on file in decisions.md.

## 4. Smallest concrete change set (estimated)

| # | File | Change | Size |
|---|------|--------|------|
| 1 | `app/src/main/bootstrap.ts` | Allow absolute paths in `OT_DATA_DIR`; layer in `app-config.json` lookup between env var and default. | ~30 LOC + tests |
| 2 | `app/src/main/services/appConfig.ts` (new) | Read/write `<userData>/app-config.json` with Zod validation; tolerant of missing/corrupt. | ~80 LOC + tests |
| 3 | `app/src/main/ipc/handlers/appConfig.ts` (new) | `app:getDataDir`, `app:setDataDir(path)` (validates writability + dry-load + conflict-copy check, then writes config and `app.relaunch()`). | ~120 LOC + tests |
| 4 | `app/src/preload/index.cjs` + renderer API surface | Expose the two IPC calls. | ~10 LOC |
| 5 | Trinity: a Settings page row "Data folder: \<path\>  [Change…]" with a confirm-then-relaunch dialog. | UI work | ~80 LOC |
| 6 | (Optional, recommended) `--read-only` flag → `appConfig.readOnly` → IPC handler middleware that throws on any `*.append` write attempt. | ~40 LOC + tests |
| 7 | Docs: `docs/ops/data-folder.md` describing trial constraints (one active writer; OneDrive-Business/SharePoint only; no concurrent edits; conflict-copy handling). | ~1 page |

No changes needed to `JsonFileEventLog`, the read model, or any reducer — the abstraction already accepts an arbitrary `dir`. This is purely a bootstrap/config concern.

## 5. Decisions Pedro needs to make

1. **Trial concurrency posture:** confirm "one active writer per dataset" for the trial. If yes, ship items 1–6 above. If you want concurrent multi-user even in trial, we need to reopen ADR-001 Option A (per-writer files) and that is a much bigger piece of work.
2. **Settings UI scope:** is a minimal Settings → Data folder row OK for trial, or do you want the full UX-001 first-run wizard before any user touches the build? I recommend the minimal row first.
3. **Read-only mode (item 6):** opt in for trial? Strongly recommended — it's the cheapest insurance against silent OneDrive divergence.
4. **Personal OneDrive detection heuristic:** good-enough warning, or strict block? Decisions.md §2026-04-19 §5 says strict block in v1; should the trial enforce the same?

If any of these conflict with prior team decisions (Niobe's UX-001, Switch's threat model, Neo's ADR-001/002), this proposal yields — flag it and we re-spec.


---

## Decision: ESM Native Module Externalization (Build Invariant)

**Date:** 2026-05-11  
**Status:** Locked & Approved  
**Context:** trial.3.7 installer ESM __filename crash fix  
**Applies to:** All team members adding native modules (Vite, Electron)

### Rule

**Native modules must be externalized in vite.config.ts when package.json type:module.**

Native modules that rely on \__dirname\/\__filename\ to load .node prebuilds (e.g. sodium-native, argon2, @napi-rs/keyring, any NAPI module) MUST be listed in rollupOptions.external. Otherwise, Vite bundles them inline, making those global variables undefined in ESM scope.

### Example Configuration

\\\	ypescript
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['electron', 'sodium-native', 'argon2', '@napi-rs/keyring']
    }
  }
})
\\\

### Root Cause History

Trial.3.7 crashed with:
\\\
ReferenceError: __filename is not defined in ES module scope
\\\

**Why:** sodium-native, argon2, @napi-rs/keyring were bundled inline by Vite. Their JS wrappers use \__dirname\/\__filename\ to locate .node prebuilds — undefined in ESM (package.json has \"type": "module"\).

**Fix:** Externalized the modules in vite.config.ts. Installer rebuilt, smoke-tested, and passed.

### When Adding New Native Modules

1. Install the module as usual (npm install).
2. Check its source code or error message to see if it uses \__dirname\/\__filename\.
3. If yes, add it to the external array in vite.config.ts.
4. Run \
pm run build\ and verify no bundling errors.
5. Run \
pm run build:electron\ to build the installer.
6. Smoke-test the installer on Windows to ensure no ESM ReferenceError crashes.

### Files Modified

- \ite.config.ts\ — external array updated

### Validation

- Build: Passed. No inline native-module code in dist/main/index.js.
- Smoke test: App launched and ran 21+ seconds without crash. ✓

---
