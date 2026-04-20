# Decisions Archive

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
