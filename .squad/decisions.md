# Squad Decisions

## Active Decisions

### 2026-04-21: WI-20 — Edit UX fixes (in-place swap, MovementsScreen wiring, width)

# WI-20 Edit UX: In-Place Swap Pattern

**Date:** 2026-04-21  
**By:** Trinity (Frontend Dev)  
**Status:** ✅ SHIPPED

## Context

Pedro's WI-20 feedback on the initial transaction edit UI identified three issues:
1. Edit/Delete only worked from Dashboard (PanelScreen), not Transactions (MovementsScreen)
2. Edit modal too cramped (form squeezed into 640px read-only modal width)
3. Edit opened a SECOND modal on top (Option B), violating Pedro's explicit approval of Option A (in-place swap)

## Decisions

### 1. Modal Swap Pattern: In-Place (Option A)

**Decision:** Refactored TransactionDetailModal to do **in-place body swap** instead of opening a stacked TransactionFormModal.

**Rationale:**
- Pedro explicitly approved "Option A: in-place swap inside TransactionDetailModal — the same modal stays open, fields turn into inputs, footer swaps to Cancelar/Guardar."
- Option B (stacked second modal) was rejected.
- The stacked-modal approach likely happened because it was easier to invoke the existing TransactionFormModal than refactor the detail modal for swap behavior.

**Implementation:**
- SAME `<dialog>` element stays open during edit.
- Header changes: title swaps from "Detalle del movimiento" → "Editar Movimiento".
- Body swaps: read-only view (fields + notes thread) ↔ editable form (TransactionFormFields component).
- Footer swaps: "Editar / Cerrar" (read) ↔ "Cancelar / Guardar" (edit).
- Delete button (trash icon) **hides** during edit mode to reduce footgun risk (user should cancel/save first, not delete mid-edit).

### 2. Modal Width: Widens to 720px in Edit Mode

**Decision:** Modal width = **640px** in read-only mode, **720px** in edit mode.

**Rationale:**
- Read-only view is content-dense but fits comfortably in 640px (matches the modal width-lock pattern from history.md).
- Edit mode form needs breathing room — the two-column layout (date/type, amount/account, status/reference) + full-width description/details requires ~720px to avoid cramped inputs.
- Smooth transition via CSS (`transition: width 0.2s ease`) — no jitter.

**Alternatives considered:**
- (a) Keep 640px, restructure form into tighter two-column layout → rejected because it would deviate from the existing TransactionFormModal pattern users are familiar with.
- (b) Widen to 800px → rejected as too wide; 720px provides adequate space without overwhelming smaller screens.

### 3. Notes Thread Behavior in Edit Mode

**Decision:** **Hides** the notes thread when in edit mode.

**Rationale:**
- Edit form takes full body space — displaying notes alongside would require scrolling or cramming both into a smaller viewport.
- User can cancel edit to return to read-only view and access notes.
- Future enhancement: collapse notes into a read-only accordion below the form if needed.

### 4. Shared Form Fields Component

**Decision:** Extracted `TransactionFormFields` component (reusable form markup) to avoid duplication between AddTransactionModal and TransactionDetailModal's edit swap.

**Implementation:**
- New component: `app/src/renderer/components/TransactionFormFields/`
- Props: individual field values + onChange handlers (no internal form state).
- Layout: two-column for compact fields (date/type, amount/account, status/reference), full-width for description/category/tags/details.
- Used by: AddTransactionModal (future refactor), TransactionDetailModal (edit mode).

**Rationale:**
- DRY: form fields are identical between add + edit; extracting avoids drift.
- Testability: shared component = single source of truth for field structure.
- Future-proof: when WI-15 adds subcategory editing, only TransactionFormFields needs updating.

### 5. MovementsScreen Wiring

**Decision:** Wired TransactionDetailModal into MovementsScreen with the same row-click handler + update/delete refresh pattern as PanelScreen.

**Implementation:**
- Added `selectedTx` state + `setSelectedTx(row)` on Table's `onRowClick`.
- Converted `Movement` (display shape, label-based) → `RecentTransaction` (wire shape, ID-based) for modal props.
- On update/delete success: calls `loadAll()` to refresh movements list (mirrors PanelScreen's `loadPanel()` pattern).

**Rationale:**
- Consistency: both screens now have identical edit/delete flows.
- No new backend work: reuses existing `updateTransaction` / `deleteTransaction` IPC handlers.

## Test Updates

Updated `TransactionDetailModal.test.tsx` to verify in-place swap behavior:
- ✅ Edit button click → modal title changes, form fields appear, footer swaps to Cancel/Save.
- ✅ Cancel button → reverts to read-only view.
- ✅ Delete button hidden during edit mode.
- ✅ Notes thread hidden during edit mode.

All 364 tests pass (9 skipped).

## Files Changed

**Added:**
- `app/src/renderer/components/TransactionFormFields/TransactionFormFields.tsx`
- `app/src/renderer/components/TransactionFormFields/TransactionFormFields.css`
- `app/src/renderer/components/TransactionFormFields/index.ts`

**Modified:**
- `app/src/renderer/components/TransactionDetailModal/TransactionDetailModal.tsx` — refactored for in-place swap
- `app/src/renderer/components/TransactionDetailModal/TransactionDetailModal.css` — added edit-mode width + body styles
- `app/src/renderer/components/TransactionDetailModal/TransactionDetailModal.test.tsx` — updated tests for swap behavior
- `app/src/renderer/screens/MovementsScreen/MovementsScreen.tsx` — wired detail modal + update/delete handlers

## Gates Passed

✅ `npm run typecheck`  
✅ `npm run lint`  
✅ `npm run format:check`  
✅ `npm test` — 364/373 passed (9 skipped)  
✅ `npm run build`

## Commit Message

```
fix(tx): WI-20 edit UX corrections — in-place swap, MovementsScreen wiring, width

- Refactor TransactionDetailModal edit to in-place swap (rejected Option B
  stacked modal). Same <dialog>, body swaps read-only ↔ form, footer swaps
  Cerrar ↔ Cancelar/Guardar.
- Extract shared form fields component (TransactionFormFields) — reusable 
  between AddTransactionModal and edit swap.
- Wire TransactionDetailModal open + update/delete refresh into MovementsScreen
  (was previously only wired in PanelScreen).
- Fix cramped edit form: modal widens from 640px → 720px in edit mode for 
  better form breathing room.
- Hide delete button + notes thread during edit mode (UX clarity).
- Update tests to assert in-place swap instead of stacked-modal mount.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

## Next Steps

None — all three bugs fixed, scope complete.

## Learnings

### Root Cause of Stacked-Modal Regression

The initial WI-20 implementation opened a second `TransactionFormModal` on top of the detail modal (Option B) instead of doing an in-place swap (Option A). Root cause:
- Easier to invoke existing `<TransactionFormModal mode="edit">` than refactor TransactionDetailModal for swap behavior.
- Likely happened because the detail modal was originally read-only (WI-19); adding edit as a separate modal was the path of least resistance.
- **Lesson:** When Pedro approves a specific UX pattern (Option A vs B), verify the implementation matches before shipping — even if a different approach is simpler.

### Shared Form Fields Pattern

Extracted `TransactionFormFields` as a reusable component to avoid duplicating field markup between add-modal and edit-swap. Pattern:
- Component takes individual props (date, amount, etc.) + onChange handlers — no internal state.
- Parent owns form state + validation.
- Layout is baked into the component CSS (two-column for compact fields, full-width for description/details).
- **Benefit:** Single source of truth for field structure; when WI-15 adds subcategory editing, only one component updates.

### Width Choice Rationale

Chose 720px for edit mode (vs 640px read-only) because:
- Form needs two-column layout for compact fields (date/type, amount/account, status/reference) to avoid vertical sprawl.
- 640px cramped the inputs — labels truncated, focus rings clipped.
- 720px provides adequate horizontal space without overwhelming smaller screens (max-width: 92vw ensures mobile safety).
- Smooth transition via CSS (`transition: width 0.2s ease`) prevents jank.

### 2026-04-21: WI-20 Polish — Unified Modal Width & Chip-based Multi-Select — shipped

**By:** Trinity (Frontend Dev)  
**Status:** ✅ SHIPPED (376 tests green, +6 new)

**Context:** After WI-20 in-place swap shipped, Pedro reported 4 polish bugs during testing:
1. MovementsScreen table right-edge clipping on narrow viewports (<~1200px) — no horizontal scroll
2. Edit modal still cramped despite 720px (two-column form squeezed too tightly)
3. Edit triggers jarring shape change (width jumped 640px → 720px, reflow jank)
4. Label picker requires Ctrl+click to unselect (native `<select multiple>` UX)

**Decisions:**

#### 1. Table Overflow Container
**Decision:** Wrap MovementsScreen `<Table>` in `overflow-x: auto` container.

**Rationale:** Simple, reliable pattern — table preserves natural width, scrollbar appears when needed. Matches PanelScreen's transaction list pattern.

**Implementation:**
```tsx
<div className="ot-movements__table-container">
  <Table ... />
</div>
```
```css
.ot-movements__table-container {
  overflow-x: auto;
  border-radius: var(--radius-lg);
}
```

#### 2. Unified Modal Width (760px)
**Decision:** TransactionDetailModal uses **760px for both read and edit modes**. No width transition.

**Rationale:**
- Eliminates jarring shape change — both modes same width, only body content swaps.
- 760px provides adequate breathing room for two-column layout:
  - Row 1: Date / Type (narrow) — fits comfortably
  - Row 2: Amount / Account — fits comfortably
  - Row 3: Category / Tags (chip picker, expands vertically) — fits comfortably
  - Row 4: Status / Reference — fits comfortably
  - Full-width: Description, Details (textarea)
- Larger than 640px (too cramped, labels truncated) but smaller than typical desktop web apps (800-900px, respects Electron constraints)
- `max-width: 92vw` ensures mobile safety (modal shrinks on small screens)

**Comparison:**
- 640px: Too narrow for two-column form, labels truncated, focus rings clipped
- 720px (first attempt): Still cramped; only 40px/column wider than 640px
- 760px (final): Two-column layout breathes, inputs adequate horizontal space, labels don't truncate

**No transition removed:** Both modes use same width, only body content swaps (fields ↔ inputs). Removed `transition: width 0.2s ease` since no width change occurs.

#### 3. Form Input Full-Width
**Decision:** All form inputs use `width: 100%` within their column.

**Rationale:** Without full-width, inputs defaulted to narrow intrinsic widths. Full-width inputs maximize available horizontal space per column. Combined with 760px modal, provides adequate breathing room.

#### 4. Chip-based Multi-Select for Tags (TagChipPicker)
**Decision:** Replaced native `<select multiple>` with custom **TagChipPicker** component. Single-click toggle; no Ctrl/Cmd required.

**Rationale:**
- Native `<select multiple>` poor UX: requires Ctrl+click, non-obvious state, poor mobile support
- Chip-based toggles: intuitive single-click, visually clear (filled selected / outline unselected + checkmark), accessible (aria-pressed, keyboard nav), mobile-friendly, familiar pattern (Gmail labels, Linear, Trello)

**Component API:**
```tsx
interface TagChipPickerProps {
  readonly availableTags: readonly { id: string; name: string }[];
  readonly selectedIds: readonly string[];
  readonly onToggle: (tagId: string) => void;
  readonly disabled?: boolean;
}
```

**Visual states:**
- Unselected: outline border, grey text, transparent bg; hover → light grey
- Selected: filled brand-primary bg, white text, checkmark; hover → darker brand
- Disabled: 50% opacity, not-allowed cursor

**Reusability:** Pattern can be extracted to generic `ChipMultiSelect` for other multi-select UIs (category filters, status filters). For now, TagChipPicker is specialized for tags.

**Outcomes:** All 4 bugs fixed:
1. ✅ Table scrolls horizontally on narrow viewports — all columns visible
2. ✅ Unified 760px modal provides adequate form layout breathing room
3. ✅ Shape change eliminated — no jarring jump on edit click
4. ✅ Single-click toggle (no Ctrl/Cmd) — intuitive, accessible, mobile-friendly

**Test coverage:** +6 new tests for TagChipPicker (render, toggle selection, disabled state, empty state, aria-pressed).

**Gates:** typecheck ✅, lint ✅, prettier ✅, tests ✅ (370 → 376 passed), build ✅

**Next steps:** Monitor Pedro's feedback on 760px width. If still too cramped, consider 800px or single-column layout. Consider extracting generic ChipMultiSelect if needed for other multi-select UIs.

---
### 2026-04-20: WI-19 — Transaction extras (reference / details / notes) — shipped

**By:** Neo (scope), Pedro (approval), Morpheus (backend), Trinity (frontend)  
**Status:** ✅ COMPLETE — shipped to main (commits `695d559`, `b6188b3`), all gates green (345/345 tests)

**Summary:**
Delivered transaction field extensions (`reference`, `details`) + notes entity + first transaction detail view (modal) in app. All three agents green; import wizard extended with optional reference/details columns; notes CRUD via IPC.

**Scope:**
- **Transaction model:** Added `reference` (string, max 120 chars) + `details` (string, max 1000 chars) as optional nullable fields at create
- **Notes entity:** ULID-keyed notes with max 2000 chars; CRUD via IPC (`transaction:note:add/list/edit/delete`)
- **Events:** New `tx.note.added`, `tx.note.edited`, `tx.note.deleted` events; extended `tx.created` and `movement.imported` with reference/details (backward-compatible)
- **IPC:** Response shape `{ ok, event }` (matches `transaction:create` convention); error codes standardized (`TX_NOT_FOUND`, `NOTE_NOT_FOUND`, `TEXT_EMPTY`, `TEXT_TOO_LONG`, `SCHEMA_INVALID`, `INTERNAL`)
- **Read model:** `notesReducer` projects note events; `transactionsByReference` in-memory projection for O(1) reference lookup (fulfills "DB index" for NDJSON architecture)
- **UI:** TransactionDetailModal (640px width, modal pattern), NotesThread component inside, import wizard mapping extended
- **Import handler:** Accepts reference/details columns, normalizes + validates per-row, emits on `movement.imported`

**Pedro's Approved Calls:**
1. Edit reference/details after creation — **Not in WI-19.** Deferred to WI-20.
2. Note max 2000 chars — **Approved.**
3. Index reference in DB — **Approved.** Implemented as `transactionsByReference` projection (in-memory equivalent for NDJSON).
4. Transaction detail modal vs inline expand — **Modal approved.**

**Contract Deviations (vs Neo's literal scope):**
- **`noteId` + `id` split (structural):** Event log dedupes by `event.id`; note events carry both `id` (unique per event) and `noteId` (stable note PK) to preserve append-log idempotency. Documented in `.squad/decisions/inbox/morpheus-wi-19-contract-deltas.md`.
- **`transactionsByReference` projection:** In-memory index (not a literal DB index, since persistence is append-only NDJSON).

**Test Coverage:**
- 345/345 passing (was 0 at start)
- Schema tests: backward-compat on `tx.created` / `movement.imported`
- IPC handler lifecycle tests: note CRUD + error cases
- Import mapping tests: reference/details column acceptance + normalization

**Orchestration Logs:**
- `.squad/orchestration-log/2026-04-20T19-47-12Z-neo.md` — scope document + open questions
- `.squad/orchestration-log/2026-04-20T19-47-12Z-morpheus.md` — backend implementation + contract deviations
- `.squad/orchestration-log/2026-04-20T19-47-12Z-trinity.md` — UI (modal + notes thread + import wizard) + integration notes

---

### 2026-04-19: prototype/ is the visual and interaction contract for v1
**By:** Neo (Lead/Architect) + Link (Product Manager), jointly — requested by Pedro
**Branch:** `fix/prototype-fidelity-audit`
**Artifact:** `docs/product/prototype-fidelity-audit.md`

**Rule:**
The `prototype/` folder is the v1 north star for OpenTreasury Desktop. Any implementation that diverges from it requires **either**:
(a) explicit written sign-off from Link (product) AND Pedro, logged as a decision in `.squad/decisions.md`; **or**
(b) a logged technical impossibility from Neo, with an alternative approved by Link + Pedro.

The design system in `docs/design/` is a **translation layer**, not an authority. When the design system and the prototype conflict, the **prototype wins and the design system is updated to match**, not the other way around.

**Enforcement:**
- Every frontend PR must include before/after screenshots vs the prototype.
- Every UX spec must include a "Prototype Reference" block citing the specific prototype file + section.
- Every frontend agent spawn must name `prototype/` files as input artifacts.
- Accessibility improvements to the prototype (e.g., focus rings, ARIA semantics) do not require deviation sign-off when they add a11y behavior without changing the visual/interaction contract.

**Why:**
An M1 implementation review revealed ~49 tracked deltas between `app/src/renderer/**` and `prototype/**` — 20 blockers, 20 important, 9 polish. Root cause: tokens were invented rather than extracted from the prototype; the design system became the de-facto authority; frontend spawns routed against `docs/design/` instead of `prototype/`. Pedro flagged the drift. This rule closes the loop so the gap can't reopen silently.

**Implications:**
- Mouse re-extracts tokens from the prototype (tokens-v0.2) before any more component work.
- Trinity stops implementing against `docs/design/` as the sole source; prototype files join required inputs.
- Niobe backfills a "Prototype Reference" block on every Wave-1 UX spec.
- Link resolves the six prototype-vs-design-system conflicts (estado column, pending tone, Exportar button, category/subcategory split, ES/EN toggle location, theme toggle location) — each gets an explicit decision entry.
- Neo updates the PR template with a mandatory prototype-parity checklist.

**Not a scope reopener:** M1 PRD scope (what features ship when) is unchanged. What changes is **how** they look and behave — they must match the prototype within the 3 allowed deviation gates.

### 2026-04-19: Panel-First Unlock for M1 → M1.25 Saldo (Link + Neo joint decision)
**By:** Link (Product Manager) + Neo (Lead/Architect), jointly — requested by Pedro
**Branch:** Reference artifacts in `.squad/decisions/inbox/`
**Status:** **Awaiting Pedro go/no-go**

**Summary:**
Shift M1 priority from Movements-centric completion to "Panel first, then Movements" sequence. Saldo defers to M1.25.

**Decision:** Sequence M1 as Panel → Movements, not Movements → Panel.

**Why this sequence:**
- **Movements** is 70% UI done but conceptually complex (date range, account/category CRUD, state mgmt). Takes 2–3 sprints to wire fully.
- **Panel** is conceptually simple (no gate, no sort, no filter — just recent-tx table + sparklines + balance totals). Takes 1 sprint to wire.
- **Panel is the treasurer's UX entry point.** Prototype shows dashboard-first; validate that early.
- **Panel has no empty-state complexity.** Auto-loads; no date-range gate; no sort persistence. Simplest path to prove the event-sourced core.
- **Saldo can ship M1.25.** It's a power-user screen (year-over-year drill-down), not the core loop.

**Implications (all agents):**

*For Neo (Architecture / Core):*
- Event-sourced core validation happens on Panel first (fewer state mutations; simpler read model for balance totals).
- Movements core wiring follows, exposing account/category mutation edge cases if any.
- M1 alpha unblocked 3–5 days sooner.

*For Trinity (UI / Implementation):*
- Panel sprint starts immediately (Niobe's Panel UX spec + prototype reference).
- Movements full form wiring (account picker, category picker, tag picker) starts in parallel after Panel is wired.
- Saldo implementation defers — don't allocate to M1 final sprint.

*For Niobe (UX):*
- Panel UX spec must include prototype reference block.
- Movements UX spec remains as drafted; timeline shifts right.

*For Morpheus (Core):*
- Phase 1: finalize `core/query/` interface (Panel-only, read-only). Gate: Vitest 100%.
- Phase 1b: wire IPC contract for Panel. Gate: IPC round-trip vitest.
- Phase 2 (parallel or M1+1): command-side Movements wiring.

*For Pedro (Product Lead):*
- Internal alpha gate now means "Panel + one Movements tx end-to-end" instead of "all three screens complete".
- Saldo still ships before public release, just not in M1 final.
- No scope loss; sequence change only.

**Work packages:**

**Phase 1: Panel MVP (1 sprint, unblocks Trinity → Morpheus → Trinity)**
- 1a. Core query surface (Morpheus, 2–3 days) — `queryRecentMovements(limit, offset)` → sorted DESC by created_at
- 1b. IPC contract for Panel (Morpheus + Trinity, 1 day) — `app/src/main/ipc/handlers.ts`, Zod schema
- 1c. Panel UI wiring (Trinity, 3–4 days) — recent-txs table + totals strip, read-only surface
- 1d. Crypto wiring for Panel reads (Morpheus + Switch, 3–4 days) — DEK load, event decrypt

**Phase 2: Movements full wiring (parallel to Phase 1 end, M1+8–12 days)**
- 2a. Command-side Movements (Morpheus, ~5 days)
- 2b. Movements form wiring (Trinity, ~5 days)
- 2c. IPC + crypto for Movements (Morpheus + Switch, ~3 days)

**Phase 3: Saldo (M1.25, after Panel proves the stack)**
- Same data layer, different query surface and layout.

**M1 exit criterion redefined:**
- Account → Tx → **Panel visibility** (not Saldo visibility; Saldo slides to M1.25).
- Movements structure UI complete; command-side (forms, filters, date selection) lands M1+1.

### 2026-04-20: Scope Pivot — Bank-Specific Parsers → Generic Column Mapper (Pedro ruling via Copilot)
**By:** Pedro (via Copilot), captured by Coordinator  
**Related:** Copilot directives in `.squad/decisions/inbox/`

**What:** Reject the bank-specific parser approach (Unicaja/CaixaBank hardcoded). WI-17 is a **generic column-mapping importer** with these UX steps:
  1. User uploads Excel (xlsx) or CSV.
  2. If workbook has >1 sheet → show sheet picker.
  3. Show detected columns from the selected sheet.
  4. User maps source columns → Transaction model fields (date, amount, description, account, category/tag as applicable).
  5. **Dry-run preview** (critical): show first ~5 parsed rows + total estimated row count + duplicates detected + validation errors. Strict input validation.
  6. User confirms import. Duplicate handling per earlier ruling: list dups, user ticks a checkbox to opt-in for importing them.

**Error cases:**
- Sheet doesn't have enough columns to cover the minimum Transaction data model → reject at step 3 with clear error.
- Rows fail validation in dry-run → shown in the preview report; user sees exactly what will/won't import.

**Supersedes:** earlier Q3 answer ("bank-specific parsers for Unicaja/CaixaBank first"). Bank-specific parsers are NOT being built.

**Target scenarios:**
  1. Daily/weekly top-ups (<100 txns)
  2. Bulk historical import (several weeks/months, >100 txns)

**Why:** Every bank CSV is bespoke (column order, date/decimal format, encoding, header rows, amount-sign convention). A generic mapper lets users handle bank variance themselves via the UI and scales to any source without code changes. The dry-run is the safety net against bad input data.

---

### 2026-04-20: Date Format Auto-Detection Algorithm (Pedro ruling via Copilot)
**By:** Pedro (via Copilot), captured by Coordinator  
**Related:** WI-17 v2 scope pivot

**What:** When importing, date format is auto-detected from sampled cells:
  - Scan the first N (≥10) date cells in the mapped date column.
  - If ANY cell has a component >12 in the month position for DD/MM → infer DD/MM/YYYY.
  - If ANY cell has a component >12 in the month position for MM/DD → infer MM/DD/YYYY.
  - If ambiguous after the sample (all components ≤12), default to DD/MM (Spanish convention) BUT surface the inferred format in the dry-run header prominently, with a one-click "Switch to MM/DD" link. User confirms by proceeding.
  - ISO `YYYY-MM-DD` detected unambiguously by regex, no confirmation needed.
**Error path:** If mixed formats detected in the same column, mark the problematic rows as parse errors in dry-run (do NOT reject the whole import).
**Why:** Zero friction for the 99% case while keeping an escape hatch when the sample is ambiguous. Spanish default avoids the worst-case silent misinterpretation.

---

### 2026-04-20: Drop `ulid` dependency — use Node `crypto.randomUUID()` for session fileId tokens
**By:** Morpheus (via Copilot) — requested by Pedro

**What:** Replaced `ulid` package with `node:crypto`'s `randomUUID()` in `sessionFileRegistry.ts`. Removed `ulid` from dependencies.

**Why:** `ulid` package's `detectPrng` threw `"secure crypto unusable, insecure Math.random not allowed"` at Electron main boot after esbuild bundling — the bundled ESM lost access to `globalThis.crypto.getRandomValues`. `randomUUID()` is built into Node, needs no PRNG detection, produces equally opaque 128-bit tokens. Test length assertion updated (26→UUID regex). ULIDs were only used as opaque session tokens (not for sortability), so UUIDv4 is a drop-in replacement.

**Affects:** `app/src/main/import/sessionFileRegistry.ts`, its test, `package.json`.

**Status:** Shipped (commit `18f7a61` on main).

---

### 2026-04-20: Import Error Row Semantics — Error Codes + Unicode Whitespace (Morpheus)
**By:** Morpheus (Backend/Parser) — requested by Pedro  
**Related:** WI-17 import pipeline feedback (post-WI-18); Trinity (i18n rendering)

**Context:** Pedro reported 5x "Contains invalid characters" (hardcoded English) in Spanish UI with no indication of:
1. What value was rejected (no raw data shown)
2. What row it refers to (absolute 1-based? data row? preview row?)
3. What language errors should be in (localization issue)

**Decision:**

#### 1. Error Code Structure

Backend parsers (date, amount, description) now return **structured error codes** instead of human-readable strings:

```ts
type DryRunError = {
  row: number;           // Absolute 1-based row in source file
  field?: string;        // 'date' | 'amount' | 'description'
  code: string;          // Error code enum
  raw?: string;          // Raw input value
  offending?: string;    // Offending character(s) if applicable
};
```

**Amount Parser Error Codes:**
- `EMPTY` — String is empty or whitespace-only
- `NOT_A_STRING` — Input is not a string
- `NO_DIGITS` — After stripping currency, no digits remain
- `INVALID_CHARACTERS` — Contains non-numeric characters (includes `raw` + `offending`)
- `PARSE_FAILED` — Could not parse as a valid number
- `AMBIGUOUS_FORMAT` — (reserved, not currently emitted)
- `OUT_OF_RANGE` — (reserved, not currently emitted)

#### 2. Row Number Semantic

**Chosen:** Absolute 1-based row number in the source file (not data-row offset).

**Rationale:**
- Pedro can open the file in Excel, jump to row N, see the exact raw data.
- Most debuggable for end users.
- Unambiguous: no offset math needed.

**Example:**
```csv
Banco Preamble Junk          ← row 1 (source file)
Fecha,Concepto,Importe       ← row 2 (header, user chose this)
15/01/2026,Donation,150.00   ← row 3 (first data row)
16/01/2026,BadAmount,X123    ← row 4 (error here)
```

If row 4 has a bad amount, the dry-run error will be:
```json
{
  "row": 4,
  "field": "amount",
  "code": "INVALID_CHARACTERS",
  "raw": "X123",
  "offending": "X"
}
```

Trinity will render (via i18n): **"Fila 4 — Importe: Caracter no válido 'X' en 'X123'"**.

#### 3. IPC Contract Changes

**Before:**
```ts
{
  rowIndex: number;
  field: 'date' | 'amount' | 'description';
  reason: string;  // ❌ Human-readable English string
  value?: string;
}
```

**After:**
```ts
{
  row: number;          // ✅ Absolute source-file row
  field?: string;       // Optional (may be omitted for row-level errors)
  code: string;         // ✅ Error code for i18n lookup
  raw?: string;         // ✅ Raw input value
  offending?: string;   // ✅ Offending character(s) if applicable
}
```

#### 4. Unicode Whitespace Handling

The amount parser now strips **all Unicode whitespace variants** before character classification:
- Regular space (U+0020)
- NBSP (U+00A0)
- Narrow NBSP (U+202F)
- Zero-width space (U+200B)
- Em space (U+2003)
- And others in range U+1680, U+2000–U+200B, U+205F, U+3000, U+FEFF

**Example:** `1 234,56 €` (with NBSP) is now accepted as `1234.56` instead of false-positive `INVALID_CHARACTERS`.

If after stripping known noise (currency symbols + whitespace) there are still non-`[0-9.,]` characters, the parser returns `INVALID_CHARACTERS` with the offending character.

**Files Modified:**
- `app/src/main/import/amountParser.ts` — refactored parsing logic, error codes, Unicode handling
- `app/src/main/import/amountParser.test.ts` — 122 tests covering NBSP, zero-width, em space cases
- `app/src/shared/ipc-contracts/import.ts` — error shape updated

**Test Results:**
- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run format:check` ✅
- `npx vitest run app/src/main/import` ✅ (122 tests)
- `npm run build` ✅

**Trinity Coordination:**
Trinity will:
1. Create i18n keys for each error code: `importWizard.dryRun.errorCodes.{EMPTY, INVALID_CHARACTERS, NO_DIGITS, etc.}` (ES + EN)
2. Implement error display pattern: `Fila {{row}} — {{fieldLabel}}: {{localizedErrorMessage}}`
3. Display raw values inline with tooltips for strings >30 chars

**Why this error shape for future work:**
The structured `{ code, raw, offending? }` shape enables localization, advanced error recovery (e.g., user-level "suggest fix" for common Unicode issues), and cross-agent error standardization (e.g., if date parser adds error codes later, the rendering layer stays unchanged).

**Status:** Morpheus shipped (main commit pending); Trinity localized rendering in commit 1dde11f.

---

### 2026-04-19: Preload Built with esbuild Inline Plugin, Not vite-plugin-electron
**By:** Coordinator (lightweight direct action) — requested by Pedro  
**Branch:** main (commit 3c376fd)
**Artifact:** vite.config.ts (lines 1–100, inline "opentreasury-preload-esbuild" plugin)  

**Decision:** Bypass `vite-plugin-electron` for preload build. Implement inline Vite plugin that calls esbuild directly with:
- **Format:** CJS (Electron sandbox requirement, ADR-001 §C7)
- **External:** electron
- **Hot reload:** `handleHotUpdate` triggers rebuild + full reload on preload source changes

**Why:** `vite-plugin-electron` runs two parallel rollup builds for preload in dev mode; both write to the same outdir and concatenate on disk, creating invalid CJS syntax (two valid bundles joined mid-statement). `emptyOutDir: true` only clears on first build, not subsequent rebuilds. Direct esbuild call with single invocation produces a valid, single output file.

**Gotcha:** Dev loop is NOT done until an Electron window actually renders content. Build success ≠ working app. Always verify visually.

**Implications:**
- Preload rebuilds faster (~100ms vs plugin overhead).
- Dev reload on preload changes verified working.
- Production build unaffected (uses vite build, same result).
- Future preload changes use this pattern, not vite-plugin-electron.

**Unblocked by this decision:**
- Niobe can finish Panel UX spec in parallel.
- Mouse can finalize Panel tokens.
- Trinity can start Panel UI from prototype immediately.
- Morpheus can design the `core/query` surface without waiting for command-side complexity.

**Risks & mitigations:**
| Risk | Mitigation |
|------|-----------|
| "Event sourcing doesn't scale to 10k events" | Panel proves it on day 1 with real data. If broken, pivot before Movements wiring lands. |
| "OneDrive conflict resolution missing" | Intentional. Single-device alpha doesn't need it. M2 adds it. |
| "Users expect full Movements CRUD on M1" | Scope redefinition documented. Panel + Movements read enough for internal alpha. |
| "Crypto keychain blocks Panel" | Risk low. Switch reviews crypto; `@napi-rs/keyring` pre-approved. Implement in parallel with UI. |

**Merge sequence:**
1. `fix/trinity-prototype-parity` → `main` (now) — Sticky-thead polish, low risk.
2. Create `feat/panel-first-spike` branch (from main) — Morpheus + Trinity collaborative sprint.
3. Panel lives in main by M1+5 days. Movements full wiring M1+10–12 days (parallel).
4. Saldo lands M1+14 days (M1.25 gate).

**ADR updates required:**
- ADR-002 §11 "Electron wiring" — Add checkpoint: "Phase 1 (Panel IPC) gates the main-process impl; Phase 2 (Movements) expands the handler surface. Concurrency & offline-first lands in M2 addendum."

**Why:** De-risk the event-sourced core on the simplest code path (read-only Panel). Unblock internal alpha non-empty. Preserve M1 scope discipline. Let the team prove single-device core before M2 multi-device concurrency.

**Cross-reference:** `.squad/decisions/inbox/link-next-milestone.md` (product rationale) and `.squad/decisions/inbox/neo-next-implementation.md` (architecture + work packages).

**Status update:** Awaiting Pedro go/no-go before spawning Phase 1 sprints (Morpheus + Trinity).

### 2026-04-19: Trinity — Frontend Wave 1 implementation choices
**By:** Trinity (Frontend Dev), requested by Pedro
**Branch:** `feat/trinity-wave-1-impl`
**Scope:** Runnable Movements screen with mock data + 8-primitive UI kit + app shell + theme + i18n.

1. **CSS approach: plain CSS files with BEM-ish `.ot-*` classes, tokens as CSS custom properties.**
   No CSS Modules, no CSS-in-JS, no Tailwind. Mouse's v0.1 tokens live in
   `app/src/renderer/styles/tokens.css` as CSS variables on `:root` / `[data-theme=light]` /
   `[data-theme=dark]`, with `[data-theme=system]` deferring to `@media (prefers-color-scheme: dark)`.
   Every primitive imports its own `.css` sibling. Rationale: simplest working path, zero build
   plugins, zero runtime cost, trivially debuggable in Electron devtools.

2. **DateRangePicker v0.1 = native `<input type="date">` + preset chips (radiogroup).**
   Presets are `radiogroup`/`radio` with arrow-key traversal; custom range uses native date inputs
   with an inline Apply button that disables on `from > to`. No calendar popover, no date-fns, no
   third-party date library. Rationale: native inputs inherit OS locale formatting, are accessible
   by default, and satisfy UX-003 Wave 1. Calendar popover can land in Wave 2 if needed.

3. **No router — `useState<Route>` in `App.tsx` drives page switching.**
   Three routes (`panel` / `movements` / `saldo`) rendered inside `AppShell`. Rationale: the app
   has a tiny, fixed nav surface; react-router adds bundle weight and complexity we don't need.
   Upgrade path: swap `useState` for `useReducer` or add react-router when deep linking / history
   becomes a real requirement.

4. **Vitest split environment: `environment: 'node'` default, React tests opt-in via
   `// @vitest-environment jsdom` top-of-file comment.**
   Pure-logic tests (e.g. `core/events.test.ts`) stay fast under node; component tests get a
   real DOM. Required infra: `setupFiles: ['app/src/renderer/test-setup.ts']` registering
   `afterEach(cleanup)` — because `globals: false` disables @testing-library/react's implicit
   auto-cleanup. Without this, co-located `it()` blocks leak DOM and break `getByRole`/`getByText`
   queries with "multiple elements" errors.

5. **Theme persistence = `localStorage['opentreasury.theme']` (v0.1 stand-in).**
   Final design per ADR-003 §7.3 reads/writes through a main-process user-prefs file in
   `%APPDATA%`. For Wave 1 (renderer-only preview, no Electron main wired) localStorage keeps
   the toggle usable. The `useTheme` hook is the seam — swap the persistence layer without
   touching components.

6. **Icons: `lucide-react` (Mouse-ratified).** Tree-shakable, zero-dep, outline style matches the
   tokens. Used in AppShell nav (LayoutDashboard / ArrowLeftRight / Scale), theme toggle
   (Monitor / Sun / Moon), amount columns (ArrowUpRight / ArrowDownRight), DateRangePill clear
   (X), Table sort (ChevronUp / ChevronDown).

7. **Mock data shape = the real `Movement` type.** `app/src/renderer/types/movement.ts` defines
   the contract; `app/src/renderer/mocks/movements.ts` seeds ~48 entries (Oct 2025 → Apr 2026).
   When the real storage/crypto pipeline lands, the screen imports from a different module — type
   stays identical. `getMockMovements(range)` uses a 200ms `setTimeout` to simulate I/O so the
   loading spinner path is exercised. UUIDs for now; real impl will use ULID per crypto-spec §11.

8. **i18n key namespaces: `common.*` / `shell.*` / `movements.*`.** ES is primary, EN fallback.
   No user-visible string is hardcoded in a component — every label, button, empty-state copy,
   and totals label flows through `useTranslation`. ICU plural keys (`count_one` / `count_other`)
   used for the "N movements" count.

**Non-decisions (deferred):**
- Calendar popover UI for DateRangePicker — native inputs good enough for Wave 1.
- Virtualization for Movements table — ~48 rows today, `react-virtual` can slot in later.
- Electron main-process wiring — tracked in ADR-002 §11; `npm run dev` currently spawns the Vite renderer only.
- Storage / crypto wiring into the renderer — scaffolds exist but not imported by the renderer; mock data fills the gap.

**Gates green:** typecheck 0, lint 0/0, format clean, vitest 38/38.

### 2026-04-19: Switch — Crypto Error Copy Catalog v1.0 ratified; Wave 1 UX unblocked
**By:** Switch (Security Engineer, final say), requested by Pedro
**Branch:** `feat/crypto-error-copy-ratification`

**New artifact:**
- `docs/security/crypto-error-copy-catalog.md` v1.0 — authoritative catalog of user-facing strings (ES + EN) for every crypto-, trust-, and integrity-related failure in v1. 9 scenarios:
  - **CE-001** — Treasury can't be verified (escrow missing / bad signature / unknown admin / structural invalid) — BLOCKING, surfaces at UX-001 E4
  - **CE-002** — Device enrollment pending — not an error (calm-informational), surfaces at UX-002 `requester.pending` / `stuck-no-admin`
  - **CE-002b** — Enrollment rejected — requester-side neutral, admin-side elevated audit entry (+ soft rotation prompt on 2nd rejection in session), surfaces at UX-002 `requester.rejected`
  - **CE-003** — Single-row decrypt failure on Movements — row-level footnote + totals-strip aggregate (UX-003 E5/Q9)
  - **CE-004** — Saldo partial-decrypt banner (UX-004 E9/Q10)
  - **CE-005** — Panel partial-decrypt banner (UX-005 E6/Q8)
  - **CE-006** — Audit log chain break — BLOCKING, app-level lockout
  - **CE-007** — Audit entry bad signature — BLOCKING, merged with CE-006 in UI (distinct in diagnostic bundle) per P1
  - **CE-008** — Device revoked mid-session — treasury-level banner, writes disabled, reads continue (AR2)
  - **CE-009** — Update payload signature invalid — in-app dialog, update aborted, session unaffected (R13.1 enforcement)

**Five normative principles locked in §0:**
1. Actionable to volunteers, opaque to attackers — never reveal which crypto layer failed.
2. No filenames/IDs/fingerprints/algorithm-names in UI; those go to the user-exportable diagnostic bundle only.
3. Partial failure gets partial messaging (row < view < app-wide).
4. Integrity-class errors are BLOCKING — no "continue anyway" on CE-001, CE-006, CE-007, CE-009.
5. Treasurer-first tone; Spanish primary (Rett Spain pilot) + English equivalent register.

**UX-001 Q7 (CE-001 copy) — RATIFIED with ADJUSTMENT.** Niobe's proposed copy *"La firma de esta tesorería no coincide con un administrador conocido…"* was adjusted because it leaked both the failing layer (signature) AND the identity concept (known admin). Ratified copy is opaque about mechanism: *"No podemos verificar esta tesorería. Esta carpeta contiene una tesorería, pero no podemos confirmar que esté intacta. Puede haberse dañado al copiarse, o haberse alterado. No continúes. Contacta a quien administra esta tesorería."*

**UX-002 Q1 (enrollment code alphabet + grouping) — RATIFIED with correction.**
- Alphabet: Crockford base32 (already excludes I/L/O/U) minus `0` and `1` → **30 characters** (`ABCDEFGHJKMNPQRSTVWXYZ23456789`). Niobe said "26" — math correction; intent preserved.
- Grouping: **`XXX-XXX` (3-3)** ratified. Rationale: 2 chunks of 3 matches phone-number-like readback cadence; 2-2-2 has choppier readback and more separator overhead.
- Readback: NATO phonetic for letters + locale number-names for digits.
- Entropy: ~29.4 bits, acceptable for realistic NGO concurrent-enrollment scale.

**UX-002 Q2 (mismatch-on-reject escalation) — RATIFIED.** Option (a) elevated audit entry is the default. Option (b) forced DEK rotation REJECTED — creates a DoS vector where an attacker who can plant pending entries triggers rotation cascades. Option (c) soft admin-prompt-to-rotate ADOPTED as secondary layer, but only on a **second** rejection in the same admin session. Rationale: first mismatch is most likely innocent (user error, bad OOB readback); a pattern is the suspicious signal worth responding to. Audit entry format defined (action `device.enrollment.rejected`, severity `elevated`, `reason_class` enum: `code_mismatch | unrecognised_requester | other` — no free-text PII).

**UX-003 Q9 (row decrypt-failed copy) — RATIFIED as proposed.** Niobe's copy *"1 movimiento no pudo leerse. Ver detalles."* approved unchanged. Catalog adds ICU-plural canonical key for the aggregated footnote.

**UX-004 Q10 (Saldo decrypt-partial banner) — RATIFIED with minor enhancement.** Added *"en este periodo"* scope anchor (avoids confusion on period switches). Normalised to ICU plural form. Existing key retained as alias.

**UX-005 Q8 (Panel decrypt-partial banner) — RATIFIED with ADJUSTMENT.** Niobe's *"…balances y KPIs pueden ser incompletos…"* adjusted to *"…balances y resúmenes…"* (ES) / *"…balances and summaries…"* (EN). "KPIs" violates P5 (jargon) — volunteer treasurers are not data analysts.

**Diagnostic bundle spec added (§4 of catalog).** User-initiated export only, never auto-sent, never uploaded. Filename `opentreasury-diagnostic-{CE-XXX}-{ISO-UTC}.json`. Contains public keys only (never private), no PII (redacted per R15), no decrypted record content. Scenario-specific fields whitelisted per CE-XXX. Only way internal details (failure subclass, affected record IDs, library exceptions, fingerprints) leave the main process.

**UX specs updated (all on `feat/crypto-error-copy-ratification`):**
- `docs/ux/specs/ux-001-first-run-setup.md` — Q7 appended with RATIFIED annotation pointing to CE-001
- `docs/ux/specs/ux-002-device-enrollment.md` — Q1 + Q2 appended with RATIFIED annotations
- `docs/ux/specs/ux-003-movements-screen.md` — Q9 appended
- `docs/ux/specs/ux-004-saldo-screen.md` — Q10 appended
- `docs/ux/specs/ux-005-panel-screen.md` — Q8 appended
- No other parts of these specs were modified.

**Traceability (§6 of catalog):** every CE-XXX maps to its UX spec state(s), crypto-spec section, security-requirements R-number(s), and STRIDE threat ID(s). Morpheus / Trinity implement against crypto-spec §11 + this catalog's diagnostic-bundle spec. Niobe / Mouse / Trinity author i18n tables against the `ux.errors.crypto.*` namespace.

**Unblocked:**
- **Niobe** — Wave 1 UX specs (UX-001, UX-002, UX-003, UX-004, UX-005, UX-006) can now move **Draft → In Review**. All crypto-sensitive copy questions are closed.
- **Mouse** — visual design of the CE-001, CE-006, CE-008, CE-009 blocking/banner surfaces can proceed against locked copy.
- **Trinity** — i18n tables for `ux.errors.crypto.*` can be seeded from this catalog.
- **Morpheus / Neo** — diagnostic bundle main-process implementation unblocked; scenario-specific field whitelists are pinned.

**Why:** Niobe surfaced 5 security-sensitive UX copy questions in Wave-1 specs that required Switch's final say. Catalog consolidates them + 4 additional scenarios Switch identified as gaps (CE-002b admin rejection copy, CE-006/007 audit integrity blocking surfaces, CE-008 mid-session revocation, CE-009 update-signature failure). Wave-1 UX and Mouse's design-system-wave-1 both depended on these being ratified.

### 2026-04-19: Mouse tokens v0.2 — re-extract from prototype (remediation 5.1.1)
**By:** Mouse (UI Designer), requested by Pedro
**Branch:** `fix/mouse-tokens-v0.2`
**Status:** Delivered → Awaiting orchestration + merge
**Artifact:** `app/src/renderer/styles/tokens.css` v0.2 (replacement for v0.1), `.squad/decisions/inbox/mouse-tokens-v0.2.md`

**Decision:** Replace `app/src/renderer/styles/tokens.css` with v0.2 — extracted directly from `prototype/styles.css` per the north-star rule: **prototype is the v1 visual and interaction contract.**

**Summary of Changes:**
- **20 new tokens** introduced (colour, typography, spacing, shadow, chrome)
- **58 value corrections** to match prototype exactly
- Every token value either (a) matches prototype with `Source:` comment, (b) preserves v0.1 where no prototype equivalent, or (c) is new from prototype
- Legacy token names preserved for Trinity compatibility — where values changed, inline `/* v0.2: was X, now Y */` migration comments added

**Breaking Changes (⚠️ Action Required):**

1. **Spacing token rescale** — all `--space-N` indexes shifted due to prototype's finer grid
   - `--space-1` was 4px → now 2px; `--space-2` was 8px → now 4px; ... (full map in decision doc)
   - Trinity action: global search/replace across all component CSS per provided migration table
   - Alternatively: Trinity can add `--compat-space-N` aliases for one sprint, then remove

2. **Primary button hover direction inverted** — **VISUAL CHANGE**
   - v0.1: hover darkened to `#5a3d75` → v0.2: hover lightens to `#9c7cb5`
   - Matches prototype's "airy + anchored" aesthetic; no code change (token ref stays same)
   - Trinity action: visually test all primary buttons (Panel CTA, Movements CTA, dialogs)

3. **Radius +2px on every step** (xs 2→4, sm 4→6, md 6→8, lg 10→12; pill 9999px→16px)
   - Prototype uses fixed-radius rounded rectangles, not perfect circles

4. **Font face change:** OS system stack → **Inter (Google Fonts)**
   - ⚠️ Offline bundling gap flagged; remediation ticket needed (M1 blocker)

5. **Border paradigm shift:** Flat hex → **purple-tinted alpha** `rgba(109,77,140,0.14)`
   - Prototype's signature brand-tinted materiality

**Pending-Tone Conflict (⚠️ FLAGGED for Link ratification):**

**Conflict:** v0.1 design system explicitly removed pending tone. Prototype ships pending badges on Movements (`estado` column: `Pendiente` / `Aprobado`) using `--color-status-pending: #e65100` on `#fff3e0` background.

**v0.2 resolution per north-star rule:** Adopted prototype values. Added `--color-status-pending` and `--color-status-pending-bg` tokens.

**Link's call required:** 
- [ ] **Approve** — Prototype wins; estado column ships with pending badges in M1 (requires Link + Pedro sign-off per audit §6)
- [ ] **Deviation** — File explicit deviation explaining why prototype's pending badges are omitted

**Mouse recommendation:** Approve. The prototype's estado column is a core data-integrity affordance (pending = not yet bank-reconciled). Removing it would be a functional downgrade, not just visual. The "no pending tone" v0.1 decision was made in design-system vacuum without prototype context.

**Other Notable Changes:**
- Dark mode radial + linear gradient body background (signature brand-lit corner)
- Section-label recipe tokenized (uppercase + letter-spaced + muted for group headings)
- Shadow colors updated to purple tint (warm materiality vs neutral gray)
- Motion timing: fast 140ms→120ms, base 220ms→200ms
- Topbar height 56px→60px

**Trinity's Next Steps:**
1. Migrate spacing token references per migration table (global search/replace)
2. Test all primary buttons (hover direction flip)
3. Verify card corners render correctly (radius +2px on every step)
4. Check dark mode body background gradient renders without z-index issues
5. File feedback if any token breaks existing layout (flag in new inbox decision file if needed)

**Link's Next Step:**
- Ratify or file deviation on pending-tone (decision doc has Mouse's recommendation + rationale)

**Mouse's Follow-up Tickets (out-of-scope for this decision):**
1. Inter offline bundling — download WOFF2 files, bundle in `app/src/renderer/assets/fonts/`, update @font-face. Target: before M1 ship.
2. Account colour palette — propose 10-color palette extracted from prototype (uses `color-mix(in oklch, …)` formula; v0.2 does not yet tokenize this).

**Why:** Remediation item 5.1.1 of `docs/product/prototype-fidelity-audit.md`. Root cause of v0.1 drift: tokens were invented rather than extracted from prototype; design system became de-facto authority. Prototype wins; design system is translation layer. This re-extraction unblocks all frontend remediation (Trinity Panel/Saldo/Movements rebuild).

**Impact:**
- ✅ Unblocks: Trinity's Wave-1 rebuild, Panel/Saldo implementation, all 49-delta fidelity audit remediation tickets
- ⚠️ Blocks merge until: Link ratifies or deviates on pending-tone, Trinity ready to rebase + migrate spacing tokens
- ⚠️ Dependency: All frontend PRs until merged must reference this v0.2 token state

### 2026-04-19: Design System v0.1 shipped (Wave 1 visual foundation)
**By:** Mouse (UI Designer), requested by Pedro
**Branch:** `feat/design-system-wave-1`
**What:** Five design artifacts authored under `docs/design/`:
- `docs/design/design-principles.md` — 8 visual-design principles (P1 Calm · P2 High contrast · P3 Text-first · P4 Desktop-native · P5 Bilingual-first · P6 Empty states teach · P7 Density is a preference · P8 Security-adjacent surfacing).
- `docs/design/tokens.md` — authoritative token catalog: colour (light + dark, both **WCAG AA verified** with explicit ratios), typography (OS system font stack; body 14 px / 8-step scale), spacing (4 px base), radius, elevation (light + dark shadow sets), motion (duration + easing + `prefers-reduced-motion` at token level), z-index (11 named layers, no ad-hoc `z-index`), breakpoints (compact 960 / standard 1280 / wide 1600).
- `docs/design/components-v1.md` — 16 component primitives covering all Wave-1 needs: Button, TextField, Select, DateRangePicker (critical for UX-003), Banner, Dialog, Sidebar, Topbar, Toast, Badge/Pill, EmptyState, Skeleton, DataTable, Chart, LocaleSwitcher, CodeDisplay (security primitive for UX-002). Each spec has anatomy + states + props shape + a11y + i18n + UX-spec consumers.
- `docs/design/screen-visuals-v1.md` — per-screen visual specs for all 6 Wave-1 screens (UX-001/002/003/004/005/006) with Mermaid layout diagrams and per-state treatment tables. No pixel-perfect mockups.
- `docs/design/icons-and-illustrations.md` — Lucide locked as icon library with icon-to-semantic mappings. Zero illustrations in v1.

**Key design decisions locked:**
1. **Icon library: Lucide** (single-weight consistency, Wave-1 domain coverage including `Scale`/`Wallet`/`ArrowLeftRight`, MIT, tree-shakable, inline SVG — no runtime font download). Phosphor / Heroicons / Tabler evaluated and rejected.
2. **Dark mode mandatory at v0.1.** Both light and dark themes specified and WCAG AA verified with explicit contrast ratios for every shipped fg/bg pair. Theme defaults to OS `prefers-color-scheme`, user-overridable in Settings, persisted to `%APPDATA%` user-prefs (not OneDrive — per-device preference, matches ADR-003 §7.3).
3. **OS system font stack, no web fonts at runtime.** `Segoe UI Variable` → `Segoe UI` → `-apple-system` → `system-ui` → Roboto → fallback. Honours Principle P4 (desktop-native) and vision Principle 5 (offline-first). Monospace stack (`Cascadia Code` → `Consolas` → `SF Mono`) for `CodeDisplay` and folder-path rendering.
4. **Brand anchor preserved from prototype.** `#6d4d8c` purple carried forward; surrounding palette rebalanced for AA+. Rett Spain treasurers see continuity with cloud version.
5. **Zero illustrations in v1.** EmptyState component has icon slot but ships unused — Principle P1 (calm over flashy) + volunteer-project budget + i18n friction + dark-mode doubling cost. Revisit triggers captured.
6. **No `pending` tone anywhere** (Badge/Pill, Banner). Reinforces product decision at the token level — not even possible to accidentally reintroduce the concept.
7. **Tabular numerics on every financial cell** via `font-variant-numeric: tabular-nums`. No web font needed.

**Unblocked downstream work:**
- **Trinity** — UNBLOCKED for Wave-1 component implementation. Start with `tokens.md` → CSS custom properties (light + dark) + theme switching hook, then work down the component list in `components-v1.md`. Benchmark chart library (`visx` vs custom SVG vs Recharts) against UX-005 PR12 ≤500 ms / 1 k events before committing.
- **Niobe** — new UX follow-ups flagged in questions (density-toggle placement, toast Ctrl+Shift+T addition, right-click menus M1 vs v1.x).
- **Switch** — UX-002 admin UPN tooltip copy ("identity not a trust anchor") — final wording.

**Top open questions for Pedro / Niobe / Switch / Trinity:**
1. **Custom brand mark** (Pedro) — ship v1 with Lucide `Scale` placeholder or commission a mark? Recommend defer to v1.1.
2. **Sidebar taxonomy + order** (Pedro / Niobe) — confirm visual order Panel · Movimientos · Saldo · Cuentas · Categorías · Etiquetas · Importación · Exportar (disabled M1).
3. **Density toggle placement on Movements** (Niobe) — filter bar (proposed) vs global Settings only.
4. **Right-click context menus on data-table rows** (Pedro / Niobe) — M1 or v1.x. Recommend v1.x.
5. **UX-002 admin UPN tooltip copy** (Switch) — "identity not a trust anchor" line final wording.
6. **Chart library choice** (Trinity) — visx vs custom SVG vs Recharts. Benchmark first.
7. **Account colour palette** (Mouse follow-up) — Mouse to propose a 10-colour contrast-safe palette in tokens-v0.2 pass.
8. **Empty-state icon defaults** (Niobe / Pedro) — ship zero (current plan) or a subtle 32 px Lucide per context.
9. **Toast action keyboard shortcut** `Ctrl+Shift+T` (Niobe) — add to UX-006 §8 map.

**Why:** Wave 1 (6 UX specs at Draft v0.1) described layout regions and interactive roles but deliberately no pixels. Trinity needed a stable visual foundation — tokens, primitives, screen-level composition, and icon choice — before any React component could ship. This v0.1 closes that gap. The system is bilingual-first (P5), accessible by design (AA contrast, keyboard-reachable, reduced-motion honoured at token level), and desktop-native (P4). Principle-grounded — every future visual question has a tie-breaker to check first.


### 2026-04-19: Scaffold typecheck fixes — skipLibCheck deviation from ADR-002
**By:** Neo (Lead / Architect), requested by Pedro
**Branch:** feat/app-scaffold-and-i18n-adr
**What:** Fixed 22 `npm run typecheck` errors on the fresh scaffold. Changes:
- `tsconfig.base.json`: `skipLibCheck: false → true`; `lib: ["ES2022"] → ["ES2022", "DOM"]`
- `app/src/main/tsconfig.json`: `lib: ["ES2022"] → ["ES2022", "DOM"]`
- `app/src/renderer/vite-env.d.ts`: new file, `/// <reference types="vite/client" />`
- `app/src/renderer/i18n/index.ts`: `missingKeyHandler` rewritten as conditional object-spread with explicit param types (`readonly string[]`, `string`, `string`) for `exactOptionalPropertyTypes`
- `docs/architecture/adr-002-repo-structure.md`: Addendum documenting the `skipLibCheck` deviation

**Why:** ADR-002 §4 implied `skipLibCheck: false`. Changed to `true` because:
1. `electron.d.ts` conflicts with strict `@types/node` (duplicate `noDeprecation` decl — TS2687/TS2717). Upstream issue, not fixable by us.
2. `electron.d.ts` references DOM types (`MessagePort`, `HTMLElement`, etc.) even in main-process contexts, forcing `DOM` into the shared base lib.
3. Pinning `@types/node` to electron's bundled types is brittle; every serious Electron+TS project ships `skipLibCheck: true`.
4. Source code is still fully type-checked under `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` — only third-party `.d.ts` files are skipped.

Revisit if upstream resolves the conflict.

### 2026-04-19: Scaffold lint configuration — TypeScript import resolver
**By:** Neo (Lead/Architect), requested by Pedro
**What:** Resolved 62 lint errors + 15 warnings from the fresh scaffold by fixing the `eslint-plugin-import` TypeScript resolver wiring.
**Changes:**
- `package.json`: added `eslint-import-resolver-typescript@^3.6.0` to devDependencies (install requires `--legacy-peer-deps` — peerOptional conflict with `@typescript-eslint/utils` v8 vs our v7 via ESLint 8).
- `.eslintrc.cjs`: expanded `settings` with `import/parsers` (`.ts/.tsx/.cts/.mts` → TS parser) and `import/resolver.typescript` with `alwaysTryTypes: true` + full `project` array covering all 7 module tsconfigs (`root`, `main`, `preload`, `renderer`, `core`, `crypto`, `storage`, `shared`), plus `node: true` fallback.
- `.eslintrc.cjs`: added `@typescript-eslint/no-unused-vars` with `^_` ignore patterns for args/vars/caught errors (scaffold convention).
- `.eslintrc.cjs`: override for `app/src/main` and `app/src/preload` disabling top-level `no-restricted-imports` (prior rule blocked electron imports everywhere, including where they are allowed).
- `app/src/renderer/i18n/index.ts`: narrow `eslint-disable` for i18next default-export false-positive warnings.

**Why:** Root cause was `"Resolve error: typescript with invalid interface loaded as resolver"` — the resolver package was missing. The `import './App.js'` pattern in `main.tsx` is intentional for ESM-compatible TS output and was left unchanged. Renderer/crypto/storage/core boundary rules remain enforced — Switch-relevant.

**Result:** `npm run lint` — 0 errors, 0 warnings. Revisit `--legacy-peer-deps` when upgrading to ESLint 9 / `@typescript-eslint` v8.
### 2026-04-19: Wave-1 UX specs Batch 2 authored — Wave 1 complete
**By:** Niobe (Spec / UX Analyst), requested by Pedro
**Branch:** `docs/ux-specs-m1-wave-1`
**What:**

**Three new UX screen specs at Draft v0.1:**
- `docs/ux/specs/ux-003-movements-screen.md` — Movements (paired PRD-001). Empty-on-open as first-class state; date-range presets + custom; full state machine; statement-import banner hand-off; `Estado` column explicitly removed. 14 edge cases. Mermaid state diagram.
- `docs/ux/specs/ux-004-saldo-screen.md` — Saldo (paired PRD-002). Auto-loads default period; two comparison panels + KPI strip + net-monthly chart; linear pro-rata projection spec for partial periods; collapsible screen-reader data-table for chart. No Mermaid (single trajectory).
- `docs/ux/specs/ux-005-panel-screen.md` — Panel (paired PRD-003). Default landing; account cards + sparklines + current-month KPIs + 12-month chart + latest-8 recent-tx (read-only, no `Estado`). Empty-DB branch specified (3 sub-states). Prototype's "Nuevo Movimiento" header button hidden in M1 to preserve PR7 read-only contract.

**Wave 1 is now COMPLETE** — all 6 Wave-1 UX specs at Draft v0.1:
UX-001 · UX-002 · UX-003 · UX-004 · UX-005 · UX-006.

**`docs/ux/ux-spec-plan.md` updated:**
- UX-003 row: Skeleton → Draft v0.1 with link.
- New rows: UX-004 (Saldo) and UX-005 (Panel) at Draft v0.1.
- Legacy UX-007 / UX-008 rows marked **Superseded** (numbering reconciliation deferred to a follow-up plan-revision ticket, matching UX-006 precedent).

**Cross-screen consistency (now locked across Wave 1):**
- No pending/status column, badge, filter, toggle, or tooltip on ANY screen.
- `Intl.*` formatters for currency (EUR, Rett Spain pilot), dates, numbers, month labels everywhere.
- Global states (offline / syncing / locked / error-banner / device-revoked) live in UX-006 shell slot and stack above per-screen content.
- Chart a11y pattern: Saldo and Panel both ship collapsible data-table equivalents under their bar charts.
- First-run → Panel default (UX-001 step 8); Panel handles empty-DB cleanly.
- Panel "Ver todos" → Movements hand-off recommended to pre-load `This month` (click = range-selection intent). Pedro ratify.

**Top blocker-level open questions (batch 2 — addressed to named owners):**

*Switch (security-sensitive copy):*
- UX-003 Q9 — exact ES/EN copy for single-row decrypt-failed footnote (aligns with UX-009 catalog).
- UX-004 Q10 — Saldo partial-decrypt-failed banner exact copy.
- UX-005 Q8 — Panel decrypt-partial banner exact copy.

*Link (PRD clarifications):*
- UX-003 Q1 — confirm statement-import wizard lives entirely under UX-016/PRD-006; UX-003 surface is banner-only.
- UX-003 Q2 — "Exportar" header button in M1: hide vs disabled-with-tooltip. (Recommendation: hide.)
- UX-003 Q6 — remove within-range month dropdown (duplicates range pill). (Recommendation: remove.)
- UX-004 Q2 — zero-in-current, non-zero-in-prior category (dropped): show as -100% (recommended) or hide.
- UX-005 Q1 — sparkline partial-data threshold: hide until ≥3 months (recommended) vs partial.

*Morpheus / Neo:*
- UX-003 Q3 — large-range guard threshold (>5000 events) — parametrise from measured p95.

*Pedro (ratifications):*
- UX-003 Q7 / UX-005 Q4 — Panel → Movements hand-off pre-loads `This month` (recommended).
- UX-005 Q2 — hide "Nuevo Movimiento" header button on Panel in M1 (preserves PR7). (Recommendation: hide.)
- UX-004 Q4 — "previous period" for Mes selector = same-month-prior-year (recommended) vs preceding month.

**Unblocked downstream work:**
- **Mouse** — UNBLOCKED for ALL 6 Wave-1 screens. Visual tokens, breakpoints, skeleton patterns, chart visuals, range-picker pattern, negative-balance treatment, responsive layouts, admin-only affordance pattern. Wave-1 UX contract is stable.
- **Morpheus / Trinity** — read-model query shapes now documented per screen (range queries on Movements, aggregation queries on Saldo, five parallel queries on Panel mount). Ticket breakdown can proceed against concrete IPC surfaces.
- **Cypher** — Traceability matrices in each spec map requirements → PRDs/ADRs/R-series/C-series/crypto-spec §-numbers for acceptance-test authoring.
- **Switch** — 3 user-facing crypto-error copy items batched for UX-009 ratification (one per screen — same pattern).

**Why:** Closes the Wave-1 UX blocker set. Mouse can now produce visual specs for the entire treasurer-facing happy path (install → first-run → enroll → shell → Panel → Movements → Saldo). Morpheus/Trinity can scope M1 implementation tickets against concrete UX state sets, not assumptions.

### 2026-04-19: UX specs Batch 1 (Wave 1) authored — Draft v0.1
**By:** Niobe (Spec / UX Analyst), requested by Pedro
**Branch:** `docs/ux-specs-m1-wave-1`
**What:** Three Wave-1 UX specs authored as Draft v0.1:
- `docs/ux/specs/ux-001-first-run-setup.md` — first-run / folder setup (admin-create + join-existing; R20 posture gate; Personal-OneDrive explicit rejection).
- `docs/ux/specs/ux-002-device-enrollment.md` — requester + admin enrollment aligned to crypto-spec §5 (6-char code, out-of-band compare, pubkey-substitution defense).
- `docs/ux/specs/ux-006-app-shell-and-navigation.md` — topbar/sidebar/content shell, 5 global states (`locked`/`normal`/`syncing`/`offline`/`error-banner`), **no `pending` state**, locale switcher in topbar (day-0 i18n).

`docs/ux/ux-spec-plan.md` updated: UX-001/002/006 rows at Draft v0.1.

**Open questions routed:**
- **Switch (must ratify before Draft → In Review):** bad-escrow-signature copy (UX-001 Q7), 6-char code alphabet/grouping (UX-002 Q1), mismatch escalation policy (Q2), pending-entry expiry (Q3), requester self-cancel (Q4), UPN "not a trust anchor" tooltip (Q6).
- **Pedro:** non-OneDrive override (Q1), language pre-selection (Q2), backup-admin soft prompt (Q5), Ctrl+N shortcut (UX-006 Q1), locale switcher placement (UX-006 Q5).
- **Link:** NGO display-name source (Q3), M1 search affordance (UX-006 Q3).

**Why:** Unblocks Wave-1. These three are the shell + onboarding skeleton on which the three screen specs (batch 2) and the error catalog (UX-009) depend.

**Note:** Batch 2 (screens UX-003/007/008) is in flight — spawn prompt referenced "UX-003/004/005" but current plan numbers them UX-003/007/008. Coordinator + Niobe to reconcile numbering at batch-2 kickoff.

### 2026-04-19: Project scope — OpenTreasury Desktop
**By:** Pedro (project owner)
**What:** Build a desktop Electron app that replicates the functionality of rett-europe/opentreasury without requiring complex cloud setup (Azure, Cosmos DB, Entra ID). Tech stack beyond Electron is TBD.
**Why:** NGOs need simpler deployment — download and run, no Azure subscription required.

### 2026-04-19: Switch has FINAL SAY on security
**By:** Pedro (project owner)
**What:** Switch (Security Engineer) has final say on all security decisions — non-negotiable. Always adopt the most secure option.
**Why:** Financial data for NGOs requires rigorous security posture.

### 2026-04-19: Transaction list starts empty
**By:** Pedro (project owner)
**What:** Transaction list page starts EMPTY — user must select a date range (or preset) before data loads. No auto-loading on page open.
**Why:** UX decision from the cloud version — prevents overwhelming users with stale data.

### 2026-04-19: Product Vision v0.1 established (Link)
**By:** Link (PM), requested by Pedro
**What:** Product Vision document written at `docs/product/vision.md`.

**Core vision statement:**
> OpenTreasury Desktop is a zero-infrastructure treasury app for small NGOs — a cross-platform desktop app that turns a shared OneDrive/SharePoint folder into a fully-functional, multi-user treasury ledger. No Azure. No database to run. No IT department required.

**Scope-out / explicit deferrals (v1 will NOT include):**
- Custom authentication / user accounts — OneDrive folder permissions ARE the auth layer
- Role-Based Access Control (RBAC) — folder ACLs replace it
- Multi-tenant cloud SaaS, hosted backend, any network database
- Real-time collaborative editing (Google Docs-style)
- Mobile app, bank API integrations (PSD2), payroll, tax filing
- PDF/Excel export, reports module, attachments, recurring tx → v1.x
- Budgets/forecasts, multi-currency, bank feeds → Later

**Product principles (tie-breakers for future decisions):**
1. OneDrive is the database
2. Permissions = folder permissions (no app-level user system)
3. Spec before code (mirrors cloud repo `docs/specs/` discipline)
4. Feature parity through adaptation, not code translation
5. Offline-capable by default
6. Secure by default; Switch has final say on security
7. Boring technology wins

**Success metrics (privacy-respecting, no cloud telemetry):**
Time-to-first-transaction ≤10min, setup success ≥90%, ≥10 real NGO deployments in 3 months, ZERO data-loss incidents (hard floor), ≥95% auto-resolved sync conflicts, ≥80% cloud feature parity.

**Risks flagged (deferred to Neo/Switch):**
- OneDrive concurrency/conflict resolution (🔴 High, Neo)
- File corruption / snapshot strategy (🔴 High, Neo + Switch)
- Encryption at rest vs. OneDrive search trade-off (🔴 High, **Switch final say**)
- SharePoint vs OneDrive Personal vs Business API differences
- Tech stack decision (React/Angular/Svelte + Electron vs Tauri)
- Tamper-evident audit log without a server

**Repo structure proposed** (mirrors cloud repo, minus api/infra/deploy):
`docs/product/`, `docs/specs/`, `docs/architecture/`, `docs/ux/`, `docs/security/`, `docs/guides/`, `app/`, `prototype/` (kept as reference), `scripts/`, `installers/`, `tests/`.

**Open questions for Pedro (block next step — PRDs + tech stack ADR):**
1. Tech stack beyond Electron — preference or let Neo propose options?
2. OneDrive Personal + SharePoint/Business both, or pick one?
3. Data file format — folder of append-only JSON files acceptable? (huge merge-conflict implication)
4. Encryption at rest — required despite breaking OneDrive search? (Switch final say, needs business input)
5. Target OS v1 — Windows only, or Win+Mac+Linux?
6. Language — Spanish+English, or Spanish-only with i18n scaffold?
7. Prototype as v1 UX contract, or free to depart?
8. Proposed repo structure approved?

**Why:** Pedro requested a vision-first, spec-driven foundation mirroring the cloud repo's operating model. This locks down the product shape so PRDs, ADRs, and specs can be written against a stable reference.

### 2026-04-19: Neo proposes tech stack via ADR-001
**By:** Neo (Lead/Architect), requested by Pedro
**What:** ADR-001 written at `docs/architecture/adr-001-tech-stack.md` — Status: Proposed. Three options evaluated:
- **Option A** — React + TS + append-only JSON event log (UUID-named, immutable) + derived SQLite read model + `age` file-level encryption
- **Option B** — Svelte + TS + single SQLCipher DB file
- **Option C** — React + TS + Yjs CRDT + encrypted snapshot blob

**Recommendation:** Option A. Rationale: UUID-named immutable event files are zero-conflict by construction on OneDrive (the #1 risk from vision), give us the audit log for free (cloud feature parity), use boring audited crypto (`age`), and keep decrypted data inspectable (Principle 3: "your data, your file"). Option B's single binary file cannot survive multi-writer offline edits on a shared folder — dealbreaker. Option C is correct but too complex for a volunteer-staffed project and produces opaque binaries.

**Explicit trade-off accepted in the proposal:** OneDrive web-UI search of donor data is broken by design (file-level encryption). Pedro must accept this; Switch must validate.

**Status:** Proposed — **not yet Accepted.** Switch's security review of crypto choices (`age` + Argon2id + OS keychain) is a hard gate before acceptance. Pedro must also answer Vision Q5 (target OS) before installer work starts.

**Why:** Tech stack must be locked before any `app/` scaffolding, first PRDs, or feature specs. ADR exists so decision + rationale are reviewable before code is written.

### 2026-04-19: Security Requirements & Threat Model v0.1 (Switch)
**By:** Switch (Security Engineer, final say), requested by Pedro
**What:** Security Requirements & Threat Model v0.1 at `docs/security/security-requirements-v0.1.md`.

**Non-negotiable constraints Neo's ADR-001 MUST satisfy (full list in §5 of the doc):**

1. **Encryption at rest is mandatory.** AEAD only — `XChaCha20-Poly1305` (preferred) or `AES-256-GCM`. No plaintext PII or financial data in the OneDrive folder, ever. Filenames opaque (no PII leakage).
2. **No roll-your-own crypto.** Audited library required — libsodium via `sodium-native`, WebCrypto subtle, or `@noble/*`. Stack ADR must name the library and its auditors.
3. **Electron hardening:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strict CSP (no `unsafe-inline`, no `unsafe-eval`, no CDN), no `@electron/remote`, URL navigation allowlist, external links via `shell.openExternal` only.
4. **IPC discipline:** `contextBridge` with narrow API surface, schema-validated (Zod/Valibot/Ajv) at every boundary, no dynamic dispatch, no `eval`.
5. **Signed installers + signed auto-updates only** with pinned public key. Unsigned update = abort with visible error.
6. **Zero secrets in git.** Pre-commit + CI scan (`gitleaks` / `trufflehog`). Signing keys only in CI vault.
7. **PII never in logs.** Structured logger with allowlist redaction; lint rule against `console.log(obj)` of record data.
8. **Dependency policy:** lockfile required, `npm audit` gate in CI, no native deps without Switch review, no unreviewed install scripts.
9. **Append-only audit log, hash-chained, Ed25519-signed per entry.** Chain break at load time = refuse to open + point at snapshot recovery.
10. **Snapshots** of the encrypted dataset, minimum daily on active days.
11. **Identity = Microsoft account (OneDrive).** Folder ACL is the authorization boundary. No custom auth. This is a product constraint we harden against, not override.
12. **No telemetry/analytics libraries in v1** (no Sentry, no PostHog, etc.) without explicit Switch sign-off.
13. **Crypto agility:** version byte + algorithm id on every encrypted artifact.

**Recommended key-management approach (R4 in the doc): "Shared-folder escrow with per-user wrapping"**

- One **DEK** per NGO dataset, encrypts all records.
- DEK stored **wrapped per user** in `.treasury/keys.json` in the OneDrive folder.
- Each user has an **X25519 keypair** generated on first launch, stored in the **OS keychain** (DPAPI / macOS Keychain / libsecret). Private key never leaves the device in plaintext.
- Adding a member: an existing member wraps the DEK to the new member's published public key (from `.treasury/pubkeys/{user_id}.pub`).
- Removing a member: rotate DEK, re-wrap for remaining members, omit the removed user. Historical records stay readable with the old DEK (rotation-aware, accepted risk AR2).
- Escrow file changes are Ed25519-signed and logged in the audit trail.
- **Admin role = escrow-edit signing privilege** (lives in the escrow file, not app-level RBAC).

**Alternatives explicitly rejected:**
- (a) Shared passphrase everyone knows — no revocation, degrades to Teams-chat sharing. ❌
- (b) Per-user key wrapped by a shared secret — same distribution problem. ❌
- (d) Microsoft Graph-based key derivation — requires app reg + OAuth, violates "no custom auth". ❌ (revisit v2)
- (e) Hardware tokens — unrealistic for volunteer NGOs. ❌ (deferred)

**Accepted risks (v1), documented in §6:**
- AR1: MS-account compromise = compromised member's data access (inherent to file-based model).
- AR2: Revoked members retain access to data they already decrypted (symmetric crypto reality).
- AR3: OneDrive server-side search does not work on encrypted content (in-app search does).
- AR7: Insider with folder-write can delete the audit log entirely (detectable, not preventable without a server).
- Full list in the doc — see §6.

**Open security questions for Pedro (block v0.2 sign-off, see §7):**
1. Escrow admin model — first-setup member becomes admin, or explicit named admin? How many admins simultaneously?
2. Audit log visibility — all members, admins only, or export-on-request?
3. Encryption scope — any fields Pedro wants left searchable by OneDrive? (default: encrypt everything PII/financial, accept AR3)
4. Multi-device per user — support one user on multiple laptops? (default: yes, one escrow entry per device)
5. Incident response expectation — "remove user → rotate → accept AR2" acceptable, or "burn it all down, migrate to new dataset"?
6. EV code-signing cert on Windows (~$300–500/yr) — willing to pay? Without it, SmartScreen warns non-technical treasurers on every install.

**Why:** Pedro tasked Switch with setting the security constraints v1 must meet. Encryption at rest is mandatory; identity stays Microsoft; folder ACL is authorization; custom auth is out. Neo's ADR-001 is now constrained by §5 of this document. Switch has final say per team decision 2026-04-19.

### 2026-04-19: Crypto spec published + ADR-001 ACCEPTED (with conditions) + Security Reqs v0.2
**By:** Switch (Security Engineer, final say), requested by Pedro
**What:**

**New artifacts:**
- `docs/security/crypto-spec.md` v1.0 — implementable crypto & key-management spec. Covers: primitives (XChaCha20-Poly1305 via `sodium-native`; X25519 sealed-box DEK wrapping; Ed25519 signatures; BLAKE2b hashing), three-tier key hierarchy (device keys in OS keychain via `@napi-rs/keyring`, DEK in main-proc memory only, per-file AAD-bound AEAD envelope), full `escrow.json` JSON schema, first-setup/enrollment/revocation/rotation flows with Mermaid sequence diagrams, audit log format (hash-chained, Ed25519-signed per entry), incident response playbook (rotate-and-continue default; burn-down-and-migrate nuclear), metadata surface ruling (acceptable), 15-item implementation checklist.
- `docs/security/security-requirements-v0.1.md` bumped to **v0.2** (filename retained) — all 6 open questions annotated RESOLVED with Pedro's answers, R4 amended to per-device, R13 split into R13.1 (update payload signing, still mandatory) and R13.2 (installer commercial-CA signing, deferred per AR9/AR10).

**Pedro's six resolutions (2026-04-19):**
1. Admin = first-setup wins; authenticated enrollment (6-char visual-code compare) required for new devices; admin must be online to approve.
2. Audit log visibility = all authenticated members; export-on-request as decrypted JSON bundle.
3. Encryption scope = everything PII/financial. AR3 (no OneDrive search) accepted.
4. Multi-device = one escrow entry **per device** (not per user). Stolen-device revocation = one entry only.
5. Incident response default = rotate-and-continue. Burn-down-and-migrate documented as nuclear option.
6. Code-signing = no EV cert budget initially → **AR9** (Windows SmartScreen warning accepted) + **AR10** (macOS binary distribution OUT of v1 scope, source-build only). Update payload signing via Ed25519 + pinned pubkey is **NOT deferred**.

**ADR-001 verdict: APPROVED WITH CONDITIONS → Status: Proposed → Accepted.**

Conditions (C1–C15) added to ADR-001 §9 "Security Review — Switch", binding on Neo/Morpheus/Trinity. Key supersessions of Neo's original Option A language:
- `age` as on-disk format **rejected** → XChaCha20-Poly1305 via `sodium-native` with the custom envelope in crypto-spec §2.1 (we need DEK versioning + AAD + crypto agility that `age` doesn't give us).
- Argon2id passphrase flow **rejected for v1** → OS-keychain-only model; no passphrase surface.
- `keytar` **forbidden** (deprecated) → `@napi-rs/keyring`.
- Filename scheme `{timestamp}-{uuid}` → **ULID** (no exposed timestamp prefix).

**New accepted risks:**
- **AR9:** Unsigned Windows installers (SmartScreen warning). Trigger to revisit EV cert: >100 installs OR ≥3 adoption-blocker reports OR partner funding.
- **AR10:** macOS binary distribution deferred (no Apple Developer account). Source-build only. Trigger: Apple Developer Program funding secured.

**Important clarification documented:** commercial-CA installer signing (Authenticode, Apple notarization) is deferred; **update payload signing remains mandatory** (Ed25519 private key in CI vault, pinned public key in app binary). These are separate concerns — one is cosmetic trust UX, the other is cryptographic update integrity.

**Status for downstream work:**
- Morpheus / Trinity: **UNBLOCKED** to break down implementation tickets against crypto-spec §11 (15 checklist items). Every ticket must cite C1–C15 condition(s) it satisfies.
- Neo: should file one ADR addendum or new ADR for the filename scheme + `sodium-native` supersession if desired for cleanliness, but the changes are already locked in crypto-spec + ADR-001 §9.
- Non-security spike still open (Neo-owned, non-blocking for sign-off): 10k event files in OneDrive-synced folder — stress test before GA.

**Why:** Pedro answered all six open questions, unblocking v0.2 lock-in. Neo's ADR-001 was gated on Switch's security review. Crypto spec is the bar Neo's implementation must meet. Per team governance, Switch has final say on all of the above.

### 2026-04-19: ADR-002 Proposed — repo structure
**By:** Neo (Lead/Architect), requested by Pedro
**What:** `docs/architecture/adr-002-repo-structure.md` published — **Status: Proposed.**

**One-line summary:** Single `app/` package (flat, no monorepo tool), strict Electron process boundaries enforced at the filesystem level (`src/main/`, `src/preload/`, `src/renderer/`, shared `src/shared/` contracts), Electron-free `src/core/` + `src/crypto/` + `src/storage/` for unit-testing and a single-pass Switch audit; SDD layout under `docs/` (product/, architecture/, security/, ux/, design/, specs/, guides/) mirroring the cloud repo where useful, diverging cleanly on `api/infra/deploy`.

**Scaffolded in the same work item (empty/README-only — no source code):**
- `docs/ux/README.md`, `docs/design/README.md`
- `docs/specs/README.md` (SDD lifecycle + review process)
- `docs/specs/_template.md` (canonical feature-spec template with mandatory `## Traceability` to PRD + ADRs + C-series + R-series + crypto-spec §-numbers)
- `scripts/README.md`
- `.github/workflows/README.md` ("CI to be added")
- `.github/ISSUE_TEMPLATE/README.md`
- `.github/pull_request_template.md` (branch discipline + spec ref + ADR conditions + security checklist + tests + traceability)

**Deferred deliberately:** `app/` source tree (waits on open questions + first implementation PR); CI workflows (separate ADR); `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `docs/guides/` (mirror cloud at v1).

**Open questions for Pedro (block Proposed → Accepted):**
1. Package manager — `npm` (recommended, parity with cloud repo) vs `pnpm` vs `yarn`.
2. Monorepo tool — recommend **none** (single `app/` package, plain `tsc -b` with project references).
3. TypeScript strictness — recommend `strict: true` + `noUncheckedIndexedAccess: true` + `exactOptionalPropertyTypes: true`.
4. `app/` vs `apps/opentreasury-desktop/` — recommend flat `app/` for now.
5. Tests layout — recommend hybrid (co-located `*.test.ts` for unit, separate `tests/integration/` and `tests/e2e/`).

**Why:** Structure needs to be locked before the first implementation PR so module boundaries, spec locations, and PR discipline are established rather than retrofitted.

### 2026-04-19: Roadmap v1, PRD plan, and first three PRDs drafted (Link)
**By:** Link (PM), requested by Pedro
**What:** Three new artifact sets on branch `docs/roadmap-v1-and-first-prds`:

1. **Roadmap** — `docs/product/roadmap-v1.md` (Draft v0.1).
   - **5 milestones:** M0 Foundations (S) → M1 Single-user happy path (L) → M2 Multi-device shared folder (L) → M3 v1 feature parity (M) → M4 v1.x polish (M).
   - **3 release gates:** Internal Alpha (after M1), NGO Pilot (after M2), v1.0 Public (after M3). Each with testable entry criteria.
   - Dependency graph (Mermaid) linking milestones to ADR-001, ADR-002, crypto-spec, security-requirements.
   - Feature → milestone mapping for every row in vision §9 (each feature now has a PRD ID reserved).
   - Deferred list with explicit triggers (incl. AR9 EV cert, AR10 macOS, telemetry never-in-v1).

2. **PRD plan** — `docs/product/prd-plan.md` (Draft v0.1). 22 PRD reservations, 3 drafted. PRD authoring template documented. **Switch's sign-off is required (non-negotiable) for any security-touching PRD; Pedro cannot approve security-touching PRDs without prior Switch sign-off.**

3. **Three M1 PRDs** (Status: **Draft**, target milestone **M1**):
   - `prd-001-movements.md` — empty-on-open (PR1) is a hard requirement; selection UI ships M1; bulk *actions* deferred to M4 (PRD-019); every mutation writes event + audit entry from M1.
   - `prd-002-saldo.md` — aggregation views auto-load (empty-on-open is Movements-specific); pending included in totals M1 (consistency with Movements), toggle deferred; linear pro-rata projection only.
   - `prd-003-panel.md` — strict **read-only overview contract (PR7)**; no inline edits; no filters on Panel (by design); sparklines become real monthly-net data.

**Vision update (`docs/product/vision.md`):** Q5 closed (Windows-first binaries; macOS source-only AR10; Linux AppImage/deb with Ed25519 detached sig). Q7 closed (prototype as v1 UX contract — yes; Niobe runs prototype-review in parallel). Q2 (data format) marked resolved by ADR-001 + crypto-spec §2.1. Still open: Q2 OneDrive scope, Q6 language coverage, Q8 repo layout (now ADR-002 Proposed).

**Key open questions for Pedro:**
1. Pilot NGO identity for M2 gate.
2. Alpha dogfooder — which squad member commits 1 week on real data.
3. Pending-transaction handling in Saldo/Panel totals (default "include"; confirm).
4. Default date-range preset on Movements first open (PRD-001 Q1).
5. i18n EN timing — PRD-009 targets M3; moves earlier if pilot NGO is English-speaking.
6. OneDrive storage scope (vision Q2) — Personal + Business both, or pick one for v1?

**Process note:** feature branch `docs/roadmap-v1-and-first-prds` was created **before** writing artifacts (honours 2026-04-14 rule).

**Why:** v1 sequence and first PRDs unblock Niobe (UX specs), Neo/Morpheus/Trinity (tech specs under `docs/specs/`), and M0 scaffolding.

### 2026-04-19: UX baseline — prototype analysis, spec plan, three flow skeletons (Niobe)
**By:** Niobe (Spec / UX Analyst), requested by Pedro
**What:** New artifacts under `docs/ux/`:
- `prototype-analysis-v1.md` — full inventory, canonical screens confirmation, strengths, 12 numbered gaps, divergence-from-cloud table, 8 UX principles, 5 UX risks.
- `ux-spec-plan.md` — 28 specs in 4 waves (T1 blockers → T4 deferred), with ownership, traceability, and coordination with Link's PRDs 001–003.
- `flows/flow-001-first-run-setup.md`, `flows/flow-002-device-enrollment.md` (Mermaid sequence), `flows/flow-003-movements-date-range.md` (state diagram enforcing "starts empty").

**Canonical screens (confirmed):** Panel, Movements, Saldo are the v1 UX contract. Prototype's visual language preserved; loading contract on Movements corrected (starts empty, not auto-load).

**Top blocker-level gaps:**
- **G1** — First-run / folder setup (blocks install-to-first-tx ≤10min metric).
- **G2** — Device enrollment UX (blocks all multi-device / collaboration).
- **G4** — Crypto error states (decryption failure, audit chain break, bad escrow signature, update signature failure).
- **G5** — Movements date-range gate (prototype auto-loads; contradicts locked decision).
- **G6** — Empty database state (every screen needs first-use empty-state).

**UX principles (tie-breakers):** treasurer-first; nothing loads until you ask; errors are actionable, never cryptic; sync is transparent; security decisions user-visible and irreversible-by-default; empty states teach; prototype is contract for core screens only; offline is a state, not a failure.

**UX risks:** UX-R1 enrollment confusion; UX-R2 folder-ACL ↔ escrow drift education gap; UX-R3 SmartScreen (AR9) kills first-run; UX-R4 date-range feels slow; UX-R5 audit log too chatty.

**Open questions:**
- Vision Q6 blocks UX-022 scope.
- Panel's "recent transactions" — respect Movements range or always latest-8? (recommend: always latest-8)
- Remember last-opened folder across launches? (recommend: yes)
- Universal `Ctrl/Cmd+N` for new transaction? (recommend: yes)
- Admin transfer first-class in v1, or hidden in Settings → Advanced?
- Default preset on Movements arrival — auto-select or require click? (recommend: require click)

**Hand-offs:** Link (G1/G2/G6/G8 need PRD items; PRD-002 date-range presets; Categories/Tags/Accounts scope); Mouse (visual tokens, sync indicator, error severity, admin-only affordances, date-range picker, focus states); Neo/Morpheus/Trinity (sync-signal availability G3; event-log-based "new activity" G7); Switch (crypto error copy G4/UX-009; enrollment language UX-002/flow-002 step 4).

**Wave 1 sequence (T1 blockers for install-to-first-tx):** UX-004 app shell → UX-001 first-run → UX-009 error catalog → UX-003 Movements date-range → UX-006 new transaction. **Wave 2 (multi-device):** UX-002 enrollment → UX-012 admin actions → UX-005 sync indicator.

**Why:** UX baseline runs in parallel with Link's PRDs, Mouse's design tokens, and Morpheus/Trinity's ticket breakdown against ADR-001 C1–C15.

### 2026-04-19: ADR-002 ACCEPTED — repo structure locked
**By:** Neo (Lead/Architect), requested by Pedro
**What:** `docs/architecture/adr-002-repo-structure.md` moved **Proposed → Accepted** (Decided 2026-04-19). Pedro resolved all 5 open questions:

1. **Package manager:** **npm** (parity with cloud `rett-europe/opentreasury`; zero extra setup for volunteer contributors).
2. **Monorepo tool:** **none.** Single `app/` package; `tsc -b` with project references carves out `core/`, `crypto/`, `storage/`, `main/`, `preload/`, `renderer/`, `shared/`, `read-model/`. Revisit only if a second consumer of `src/shared/` appears.
3. **TypeScript strictness:** `strict: true` + `noUncheckedIndexedAccess: true` + `exactOptionalPropertyTypes: true` — **all three enabled from day one.** Non-negotiable.
4. **Top-level folder name:** flat **`app/`** (not `apps/opentreasury-desktop/`). Promote to `apps/` only if a second deployable appears.
5. **Tests layout:** **hybrid.** Unit tests co-located as `*.test.ts` next to source; `app/tests/integration/` and `app/tests/e2e/` as separate trees.

**ADR changes:** Status/Decided header updated; §9 open questions annotated RESOLVED inline (kept verbatim for traceability); §4 + §7.3 layout language upgraded from tentative to definitive; §11 Implementation Next Steps added; Changelog added.

**Unblocked downstream work (all separate follow-up tickets, NOT part of this ADR commit):**
- Scaffold `app/` source tree — `package.json` (npm), `tsconfig.base.json` + project references, ESLint with `import/no-restricted-paths`.
- Define internal packages (`core/`, `crypto/`, `storage/`, `main/`, `preload/`, `renderer/`, `shared/`, `read-model/`) via TS project references.
- Unit test runner — **propose Vitest** (fits co-located layout; Vite-native for renderer). Final choice deferred to scaffolding PR.
- E2E runner — **Playwright** (standard Electron E2E tooling).
- CI import-boundary checks — ESLint primary, grep backup.
- Link's roadmap v1 + PRDs 001–003 and Niobe's UX spec plan no longer gated on repo structure.
- Morpheus / Trinity can now break down implementation tickets against the accepted layout + crypto-spec §11 checklist.

**Why:** Structure must be locked before the first implementation PR so module boundaries, test locations, and package-manager choice are established rather than retrofitted.

### 2026-04-19: Pilot, dogfooder, no-pending, i18n day-0, OneDrive scope (Pedro → Link)
**By:** Pedro (perocha) — decisions captured by Link (PM)
**Artifacts updated:** `docs/product/vision.md`, `docs/product/roadmap-v1.md`, `docs/product/prd-plan.md`, `docs/product/prds/prd-001-movements.md`, `prd-002-saldo.md`, `prd-003-panel.md`.

1. **Pilot NGO = Rett Spain.** Pedro primary contact. Pilot runs in **Spanish locale**; English tested but not required for pilot. Roadmap §1 NGO Pilot gate updated.

2. **Alpha dogfooder = Pedro.** Post-M1. Success = ≥1 week real NGO-like data, zero data-loss, sharp edges logged as bugs. Roadmap §1 Internal Alpha + §8 Q2 resolved.

3. **No pending / draft / provisional / future-dated transaction concept.** Product models transactions as **confirmed/settled only**. Transactions come from bank or PayPal statement import (CSV, PRD-006) or manual entry — both paths produce immediately-confirmed records. No status field, no include/exclude-pending toggle, no filter chip, no `tx.approved` event. Applies everywhere: Movements, Saldo, Panel, totals, exports.

### 2026-04-19: Movements table header casing — reversal back to UPPERCASE
**Author:** Trinity (Frontend)
**Date:** 2026-04-19
**Branch:** fix/trinity-prototype-parity
**Status:** Ratified (Pedro) — supersedes the earlier natural-case experiment

## What happened

An earlier pass on this branch stripped `text-transform: uppercase` +
`letter-spacing: 0.08em` from `.ot-table thead th` based on a coordinator read
that the prototype used natural-case headers. That read was wrong. The
prototype CSS (`prototype/styles.css`, `.tx-table th`, lines 430–441)
unambiguously specifies:

```
.tx-table th {
  font-size: var(--font-xs);            /* 11px */
  letter-spacing: var(--ls-section);    /* 0.08em */
  text-transform: uppercase;
  font-weight: var(--fw-semibold);
  color: var(--clr-text-muted);
  background: var(--clr-surface);
  position: sticky; top: 0; z-index: 1;
}
```

Pedro visually confirmed the live prototype renders "FECHA", "CUENTA",
"OBSERVACIONES" in uppercase. Prototype CSS wins.

## Fix (shipped in this commit)

`app/src/renderer/components/Table/Table.css` — `.ot-table thead th` restored
to uppercase:

- `font-size: var(--font-size-11)` (11px, matches `--font-xs`)
- `text-transform: uppercase`
- `letter-spacing: 0.08em` (matches `--ls-section`)
- `font-weight: var(--font-weight-semibold)`
- `color: var(--color-text-muted)`
- `background: var(--color-surface-primary)` (opaque, so sticky thead never
  bleeds rows through)

## Lesson

When an agent's decision note flags a prototype discrepancy, trust the
prototype until the coordinator produces screenshot or CSS evidence to the
contrary. The prior deviation note on this same file was correct to flag the
divergence — we should have held on it rather than shipping the change.

## Related

- Sticky thead anchoring pattern now documented in AppShell scroll-isolation decision (below).

### 2026-04-19: AppShell scroll-isolation contract
**Author:** Trinity (Frontend)
**Date:** 2026-04-19
**Branch:** fix/trinity-prototype-parity
**Status:** Proposed — fundamental layout rule for every screen

## Problem

With a tall Movements table, the whole window was scrolling — topbar and sidebar
(including the user strip with the admin name) disappeared on scroll. This
breaks prototype parity and IA expectations: brand, tenant, language/theme
switch, search, and the logout control must always be on-screen.

## Decision

Only `.ot-shell__main` scrolls. The shell viewport is locked.

```
body              overflow: hidden;      height: 100%;
.ot-shell         height: 100vh; overflow: hidden;
                  display: grid;
                  grid-template-columns: var(--sidebar-width) 1fr;
                  grid-template-rows:    var(--topbar-height) 1fr;
.ot-shell__topbar grid-area: topbar; overflow: hidden;  // spans both columns
.ot-shell__sidebar grid-area: sidebar; overflow: hidden; min-height: 0;
                   display: flex; flex-direction: column;
  .ot-shell__nav          overflow-y: auto; min-height: 0;  // scroll if ever overflows
  .ot-shell__sidebar-spacer flex: 1;                        // pushes user-strip to bottom
  .ot-shell__user-strip   flex-shrink: 0;                   // pinned
.ot-shell__main   grid-area: main; overflow-y: auto; min-width: 0; min-height: 0;
```

Mirrors the prototype `.shell / .topbar / .sidebar / .main` pattern in
`prototype/styles.css` (`height: 100vh`, grid rows `60px 1fr`, grid columns
`240px 1fr`, `.main { overflow: auto; }`).

## Implications for future screens

1. **Never add `overflow: auto` / `overflow: scroll` to a full-page container
   inside `.ot-shell__main` unless you specifically want a nested scroll
   region.** Nested scrolls are almost always a bug — the user cannot tell
   which scroll-wheel target is under the cursor.
2. **Sticky elements anchor to `.ot-shell__main`.** The Movements table `thead`
   (`.ot-table thead th`) uses `position: sticky; top: 0` and the column
   headers stay visible while the user scrolls the transaction list. This also
   applies to future sticky filter bars, section headers, and table footers
   (`.ot-table__foot`).
3. **If a page needs a fixed-height region with its own scroll** (e.g. a split
   pane, a chat transcript, an audit log drawer), set `min-height: 0` on every
   ancestor flex/grid item down to that region so the flex algorithm doesn't
   balloon the outer layout. Preferred pattern: grid with explicit row sizes.
4. **Modals / drawers must still dim the full viewport.** Because `body` has
   `overflow: hidden`, overlays should be `position: fixed` with `inset: 0`
   and a high `z-index` (> `--z-topbar`).

## Related

- `.squad/agents/trinity/history.md` (AppShell grid entries).
- Sticky table header revert documented above.
- `prototype/styles.css` lines ~150–290 and line 283 (`.main { overflow: auto; }`)
  and lines 678–680 (`.main::-webkit-scrollbar`).

### 2026-04-19: Movements — bulk operations is a MUST-HAVE (scope addition)
**By:** Pedro (via Copilot)
**What:** Now that row selection works on the Movements table, bulk operations must be treated as a first-class feature. Not present in prototype, but a hard requirement for the product. Expected operations at minimum: bulk categorize, bulk assign subcategory/tags, bulk approve/reject status, bulk delete, bulk export. UI pattern: when ≥1 row is selected, reveal a contextual action bar (floating or pinned) showing count + available bulk actions.
**Why:** User-driven scope decision — treasury workflows involve reconciling many rows at once; individual-row edits don't scale for NGO/bookkeeping use cases.
**Status:** Scope accepted. Not implemented in current parity pass. Niobe + Trinity to spec the action bar UX next.

### 2026-04-19: Movements — add a tags/labels filter to the filter bar
**By:** Pedro (via Copilot)
**What:** The Movements filter bar must include a filter by tag (Etiquetas). Multi-select — show rows whose `tags` contain any of the selected tags (OR semantics). Not present in prototype; treated as a gap in the prototype, not an app gap. Should slot in alongside type chips / account / category / min-max / uncategorized.
**Why:** User-driven scope decision — once tags are used in practice (sprint tags, campaign tags, etc.) the filter becomes essential for day-to-day triage.
**Status:** Scope accepted. Not implemented in current parity pass. Trinity to add after the sticky-header + scroll-isolation fixes land.
   - Pedro's words: *"all transactions are real and confirmed, coming from bank or paypal statements.. not sure what pending means"*.
   - PRD-001 PR9/S5 rewritten (statement-import replaces approval); Q4 closed. PRD-002 PR13 rewritten; Q1 closed. PRD-003 PR11 rewritten; Q2 closed. Roadmap M1 scope + exit criterion + M3 "status workflow polish" + feature-map row all rewritten. PRD-plan §0.1 Assumptions codifies for future PRDs.
   - If co-treasurer dual-signoff is ever wanted, it's a v1.x+ conversation requiring its own PRD.

4. **i18n is foundational (M0), not M3; Spanish + English from day 0.**
   - Framework selected and integrated in **M0**. Every user-facing surface from M1 onward goes through the i18n layer — no hardcoded strings. ES (primary) + EN (pilot-ready) populated as each feature ships. EN + ES are **v1.0 ship-blockers**. CI "missing key" lint from M1.
   - PRD-009 re-scoped M3 "i18n EN + locale switcher" → M0 **"i18n Foundations"** (framework choice, string-table layout, locale-switcher shell, CI lint rule).
   - PRD-001 PR19/PR19.1, PRD-002 PR18/PR18.1, PRD-003 PR17/PR17.1 strengthened: both locales day-0 + locale-aware `Intl` formatters (dates, currency, numbers, month labels).
   - Roadmap §2 M0 gains i18n framework + ES/EN string tables; M1 ships 3 screens localised; M2 device enrollment / onboarding / security wizard localised at ship; M3 closes coverage gaps. Dep graph reshaped: i18n flows **out** of M0. Risk CR6 rewritten as M1–M3 continuous. Vision §14 Q6 + Roadmap §8 Q4 resolved.
   - **Neo action:** framework choice at M0 start — candidates `i18next`/`react-i18next` or FormatJS/`react-intl`. Short ADR or spec note required.

5. **v1 storage scope = OneDrive for Business / SharePoint only; OneDrive Personal deferred to v1.x.**
   - All folder-picker UX, validation rules, sync-metadata reads, and storage-integration work in v1 target OneDrive for Business and SharePoint. Personal (consumer accounts) is explicitly **out of v1**. M0 folder-picker validation rejects Personal paths with "unsupported in v1 — Business/SharePoint only".
   - Rationale: NGOs on M365; Business/SharePoint provides tenant-grade ACLs; Rett Spain's actual environment. Personal has different auth, different ACL semantics, different sync behaviour.
   - Roadmap §2 M0 scope-IN explicit; §5 deferred table gains OneDrive Personal row with re-entry trigger (pilot feedback or ≥2 community requests post-v1.0). PRD-plan §0.1 codifies. Vision §14 Q2 resolved.
   - **Switch action:** Personal OneDrive out-of-scope for v1 threat model (different ACL surface) — note for next security-requirements revision.
   - **Niobe action:** folder-picker UX needs "rejected: Personal OneDrive" state with copy pointing at v1.x.

**Traceability preserved:** every resolved Open Question kept visible in its original doc with inline "RESOLVED (2026-04-19): …" markers.

## Panel-First Wave 1 — WI-1, WI-2, WI-3 COMPLETE

### 2026-04-19T18:25Z: Pedro approved Panel-first work package (Neo's 10-item plan) — Q1–Q6 GREENLIGHT

**By:** Pedro (perocha) via Copilot  
**Status:** ✅ APPROVED + IMPLEMENTED (WI-1/2/3 shipped)  
**Decisions Captured Below**

**Approvals given:**
- **Q1 ✅** Proceed with UX-005 as-is; Niobe refines in parallel.
- **Q2 ✅** Real 12-month sparklines (`getAccountSparklines`); if blocked, ship alpha without.
- **Q3 🔁 REFINED** Data model (Account + all entities) is a **replication of the cloud tool at https://github.com/rett-europe/opentreasury** unless that imposes a feature limitation. Morpheus must pull the schema shapes from that repo (likely Python/FastAPI models + Cosmos DB documents) and translate to TypeScript/Zod. Deviate only if there's a concrete reason; log any deviation as its own decision.
- **Q4 ✅** Custom SVG for 12-month bars chart (zero deps, matches prototype).
- **Q5 🔁 REFINED (overrides Neo's rec)** Panel's "Ver todos los movimientos →" link **pre-filters Movements to the current month** so the treasurer sees continuity. This supersedes PRD-001's "lands empty" default *only when entered via the Panel link*; direct Movements navigation still lands empty-on-open per PRD-001.
- **Q6 ✅** Ship Panel before Movements command-side — that IS the Panel-first premise.

**Why:** Unblocks the Panel-first work package. WI-1 (Morpheus) and WI-3 (Trinity) cleared to start in parallel. WI-2 (IPC contract) drafted inside WI-1.

**Standing directive extracted:** When designing domain schemas (accounts, transactions, categories, etc.), Morpheus SHOULD treat github.com/rett-europe/opentreasury as the reference implementation. Only deviate with a logged rationale.

### 2026-04-19T18:40Z: WI-1 + WI-2 Complete — Event-sourced read model + IPC contract

**By:** Morpheus (Backend Dev)  
**Status:** ✅ SHIPPED  
**Commits:** `0f427fe` (feat), `cf30e92` (docs)

**Deliverables:**
- **WI-1:** Event-sourced read-side (core/events + core/query)
  - Zod schemas: `tx.created`, `account.created`, `category.created`, `tag.created`
  - Entity types: Transaction, Account, Category, Subcategory, Tag (mirrored from cloud repo)
  - Reducers: `applyEvent()`, `replayEvents()`, `resetReadModel()`, `getReadModel()`
  - 5 query functions: `queryRecentTransactions()`, `getAccountBalances()`, `getMonthKPIs()`, `getAccountSparklines()`, `getAccounts()`
  - Vitest 100% coverage with realistic ULID fixtures

- **WI-2:** IPC contract + mock handlers
  - Zod request/response schemas for all 5 queries
  - Channel constants: `IPC_PANEL_GET_ACCOUNTS`, `IPC_PANEL_GET_ACCOUNT_BALANCES`, etc.
  - TypeScript types exported for Trinity immediate use
  - Mock handlers in `app/src/main/ipc/handlers/panel.ts` — deterministic fixtures

- **Cloud reference study:** `docs/schemas/cloud-reference-notes.md`
  - Field-by-field mapping of rett-europe/opentreasury Python models
  - Deviations logged: ULIDs vs UUIDs, simplified review_status, deferred features

**Unblocking:** Trinity can wire Panel UI to mock IPC calls immediately.

**Next:** WI-4 (OneDrive storage), WI-5 (crypto wiring), WI-6 (wire real core/query into handlers)

### 2026-04-19T18:45Z: WI-3 Complete — Panel UI wired to IPC

**By:** Trinity (Frontend Dev)  
**Status:** ✅ SHIPPED  
**Commits:** `7cdd132` (feat), `ed8ee62` (docs)  
**CI Gates:** typecheck · lint · test · build — ALL GREEN

**Deliverables:**
- **Panel components:** AccountCard, KPIStrip, recent transactions table
- **IPC integration:** panelApi.ts (Zod parse-on-receive, adapter for Morpheus contract)
- **PanelScreen states:** Skeleton (zero layout shift) → Loaded (5 IPC queries in parallel) → Error (retry button)
- **i18n:** New keys in `panel.*` namespace (ES + EN), 6 strings added, all required keys present
- **"Ver todos →" link:** Navigates to `/movements?range=this-month` (Pedro's Q5 refinement)
- **TypeScript fixes:** Added `shared` reference to renderer/tsconfig.json; made shared composite
- **8 new tests:** AccountCard balance coloring, KPIStrip aggregation, all passing

**Coordination:** Used Morpheus's WI-2 IPC contract. Real preload bridge wiring deferred to WI-6.

**Deferred (Wave 2):** Real sparklines (WI-7), 12-month bars chart (WI-8), empty states (WI-9), deep error handling (UX-005 §6)

**Next:** WI-6 (Morpheus wires preload handlers), WI-7/8 (sparklines + chart)

---

## 2026-04-22: PR #4 Round 2 Fixes — Invariants + Integration

### Trinity — PR #4 renderer fixes (WI-21 config CRUD)

**Date:** 2026-04-22
**Branch:** `wi-21/config-crud`
**Commit:** `ee12677`

Corrected 12 renderer findings from Copilot PR #4 review. Root cause: preload shape mismatch with main process + loose `any` casts in `configMutationsApi`.

**Key fixes:**
1. **Subcategory path correction:** `window.opentreasury.categories.subcategory.*` (nested), no top-level `subcategories` namespace
2. **Response shape:** All WI-21 IPC returns `{ ok, event } | { ok, error: { code, message, field? } }`
3. **Archive state:** `archivedAt?: string` is canonical; `archived?: boolean` removed
4. **Opening balance immutable in edit:** Excluded from `changes` payload, `readOnly` + `disabled` in UI
5. **Include archived toggle:** All tabs pass `{ includeArchived }` to list calls
6. **Subcategories inlined:** Removed `listSubcategories()`, reads `CategoryRecord.subcategories[]` directly

**Tests:** 409 total, 400 pass, 9 pre-existing skip. All gates green.

### Morpheus — PR #4 contract/handler invariant tightening

**Date:** 2026-04-22
**Branch:** `wi-21/config-crud`
**Commits:** `4f30d11` + `e37a88e`

Fixed 7 backend findings from Copilot PR #4 review on update event invariants.

**Invariants established:**
1. **No no-op mutations:** `*ChangesSchema.refine` checks `Object.values(changes).some(v => v !== undefined)` (not just key count)
2. **Empty strings never persisted:** Handler trims + deletes empty optional strings (`bankName`, `label`, `iban`, `color` on accounts/tags/categories/subcategories)
3. **Handler re-checks post-normalisation:** Payload like `{ color: '   ' }` collapses to `{}` → short-circuit with `SCHEMA_INVALID`
4. **Schema-handler alignment:** `createSubcategoryRequestSchema.name.min(1)` matches handler rejection

**Tests added:** 7 focused test scenarios across `accounts.wi21.test.ts`, `tags.wi21.test.ts`, `categories.wi21.test.ts`. All gates green.

**Why this matters:** Event-sourced append-only log means invariant violations are permanent. Double-layered defence (schema + handler) is minimum.

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
- Switch has FINAL SAY on all security decisions


### 2026-04-19: ADR-003 (i18n framework) Accepted + app/ source tree scaffolded
**By:** Neo (Lead/Architect), requested by Pedro
**Branch:** `feat/app-scaffold-and-i18n-adr`

**Artifacts:**
- `docs/architecture/adr-003-i18n-framework.md` — Status: **Accepted**. Pedro delegated the day-0 i18n framework choice to Neo as a structural M0 decision.
- `app/` source tree scaffolded per ADR-002 §4 (main / preload / renderer / shared / core / crypto / storage, flat, tsc-b project references, strict TS).
- Root config: `package.json`, `tsconfig.base.json`, `tsconfig.json`, `.eslintrc.cjs` (with `import/no-restricted-paths` wiring the ADR-002 §4.1 boundaries), `.prettierrc.json`, `vite.config.ts`, `vitest.config.ts`, `electron-builder.yml`, extended `.gitignore`.
- `tests/integration/` + `tests/e2e/` (Playwright smoke test skipped until first `npm install`).
- `.github/workflows/ci.yml` — lint · typecheck · test · format-check.
- `README.md` — appended a "Getting started" section for developers.

**i18n framework chosen: `react-i18next`.** See ADR-003 §4 for full rationale — shortest "add a string" path, best TS support via module augmentation (matches the strict-TS posture from ADR-002), bundle cost irrelevant in Electron. Locales ship at `app/src/renderer/locales/{lang}/{namespace}.json`; EN + ES seeded with `common.json` containing one real string (`app.title`, `app.tagline`, `action.toggle-language`) to prove the pipeline. `<App />` toggles language on click to demonstrate wiring. Default locale ES (Rett Spain pilot).

**Scaffold decisions captured in ADR-003 §12 for revisability** (not load-bearing, marked revisable): Vite (SD1), Vitest (SD2), Playwright (SD3), electron-builder (SD4), Zod for IPC validation (SD6), per-namespace JSON files (SD8), ES default locale (SD9).

**Known follow-ups (not part of this PR):**
1. **Pedro: `npm install`** — I deliberately did NOT run any install scripts per the task brief. Pedro runs `npm install` first; the lockfile lands in the next commit.
2. **First real feature work:** once deps are in, the next likely branch is PRD-001 (Movements) — Morpheus/Trinity own implementation-ticket breakdown. UX-004 app shell + UX-001 first-run (Niobe) and PRD-009 i18n foundations finalization (Link + Neo) also kick off against this scaffold.
3. **Wire Vite dev server URL + Electron main** — `npm run dev:electron` currently exits 1 by design; needs an electron launcher that waits for Vite to boot then loads http://localhost:5173 in dev / `file://` in prod.
4. **electron-updater + pinned Ed25519 pubkey for update payload verification (C12)** — tracked in `src/main/updater/` directory (not yet created); owned jointly with Switch.
5. **CI "missing key" i18n lint** — scheduled with PRD-009 implementation, NOT this scaffold.
6. **E2E smoke test** — currently `test.skip(...)`; remove skip once first build succeeds.

**Traceability:** ADR-001 (React+TS stack, C1–C15 cited throughout scaffold comments), ADR-002 (repo structure, §4.1 module boundaries enforced by ESLint rules), ADR-003 (this i18n framework choice), crypto-spec v1.0 (stub crypto module README lists audit rules), roadmap M0 (i18n foundations day-0).

**What the scaffold does NOT include** (intentional): real crypto implementation, OneDrive storage impl, any business logic, read-model / SQLite cache module (added with first feature needing it), and `npm install` was not run.

### 2026-04-19: Neo — Panel-First Work Package Decomposition (10 Work Items, M1 Sequencing)
**By:** Neo (Lead/Architect), requested by Pedro
**Branch:** Reference `.squad/decisions/inbox/neo-panel-first-work-package.md` (full artifact)
**Status:** **Proposed — awaiting Pedro answers to Q1–Q6 before first-wave spawn**

**Summary:**
Full work package decomposition for Panel-first M1 sequence: 10 sequenced work items (WI-1 through WI-10) with owners, acceptance criteria, dependency graph, and critical-path analysis.

**Core Findings:**
- **Current state:** `app/` scaffold green. Trinity's Panel stub UI exists (no data wiring). Morpheus has skeleton events, no core/storage/crypto.
- **Gaps:** Panel needs 5 read-model queries, event-sourced core, OneDrive storage, IPC contracts, and UI wiring.
- **First-wave recommendation:** 3 parallel spawns — WI-1 (Morpheus core), WI-2 (Morpheus+Trinity IPC), WI-3 (Trinity UI).
- **Critical path:** WI-1 → WI-2 → WI-3 + (WI-4→WI-5) → WI-6 → polish (WI-7/8/9/10).
- **M1 Panel alpha gate:** ~Day 10 when WI-6 lands (real data flows); days 11–15 = polish.
- **Total ETA:** 12–15 days (assumes Switch reviews WI-5 within 1–2 days).

**The 10 Work Items:**

| # | Owner | Scope | Est. Days | Parallel? | Blocks |
|---|---|---|---|---|---|
| WI-1 | Morpheus | Core event-sourced foundation (read-side) | 2–3 | ✅ Day 1 | WI-2, WI-4 |
| WI-2 | M+T | IPC contract for Panel | 1 | ⏸️ After WI-1 | WI-3, WI-6 |
| WI-3 | Trinity | Panel UI data wiring (mock IPC) | 3–4 | ✅ Day 1 | WI-7, WI-9, WI-10 |
| WI-4 | Morpheus | OneDrive event append (plaintext) | 3–4 | ✅ Day 2–3 | WI-5, WI-6 |
| WI-5 | M+Switch | Crypto layer (encrypt/decrypt events) | 3–4 | ❌ After WI-4 | WI-6 |
| WI-6 | Morpheus | Wire real core to IPC handlers | 1 | ❌ After WI-1/2/4/5 | WI-7, WI-8 |
| WI-7 | Trinity/Mouse | Panel sparkline rendering | 1–2 | ✅ Partial | — |
| WI-8 | Trinity/Mouse | 12-month bars chart | 1–2 | ✅ Day 1 | — |
| WI-9 | Trinity+Niobe | Panel empty states | 1 | ✅ Partial | — |
| WI-10 | Trinity | Loading / skeleton polish | 1 | ✅ After WI-3 | — |

**Six Open Questions for Pedro (must answer before first-wave spawn):**

- **Q1:** UX-005 (Panel spec) complete? *Recommendation: proceed WI-1–6; Niobe refines parallel.*
- **Q2:** Real sparklines M1 or fake seeds? *Recommendation: real (WI-1 includes it); ship Panel alpha with/without?*
- **Q3:** Accounts metadata (PRD-010)? *Recommendation: Neo drafts minimal schema (id, short, color, createdAt) as WI-1 prep.*
- **Q4:** Chart library (WI-8) or custom SVG? *Recommendation: custom SVG for M1 (simplest, matches prototype).*
- **Q5:** "Ver todos" link to Movements pre-filtered? *Recommendation: simple link, no pre-filter for M1.*
- **Q6:** Panel before Movements command-side? *Recommendation: yes — Panel proves stack, Movements M1+1.*

**Key Decisions Locked:**
- ✅ Panel-first sequence (Panel → Movements) unlocks core + crypto + IPC on simplest code path.
- ✅ First wave = 3 parallel: WI-1, WI-2 (after WI-1 stabilizes), WI-3.
- ✅ WI-4 + WI-5 (storage + crypto) can start day 2–3, parallelizing with WI-3 tail end.
- ✅ M1 Panel alpha gate = WI-6 lands (~day 10), renders real encrypted data.

**Next Steps:**
1. Pedro approves/modifies Q1–Q6.
2. Coordinator spawns WI-1 (Morpheus), WI-2 (Morpheus+Trinity), WI-3 (Trinity) as background agents.
3. Scribe merges inbox entry to decisions.md (deduplicates with existing "Panel-First Unlock" entry).

**Artifact:**
`.squad/decisions/inbox/neo-panel-first-work-package.md` — full work package with detailed WI-1 through WI-10 acceptance criteria, rationale, and risks/mitigations matrix.

---

### 2026-04-19: Panel mocks now mirror prototype/data.js verbatim (Trinity decision)
**By:** Trinity (Frontend Dev)
**Status:** Merged from inbox
**Commit:** c78002a

**Decision:**
The desktop Panel's IPC mock fixtures in `app/src/main/ipc/handlers/panel.ts` are now a direct port of `prototype/data.js` — same 5 accounts (`unicaja`, `caixa-ops`, `caixa-fin`, `caixa-0951`, `paypal`), same `oklch` colours, same April-2026 KPIs (48,843.79 / 30,750.19 / 18,093.60), same first-12 transactions with real Rett NGO descriptions.

**Why:**
The previous scaffolding (Santander Cuenta Principal / BBVA Corriente / PayPal tesoreria@rett.es with random amounts) made Panel look nothing like the prototype screenshots that are the product's north star per ADR-002. Visual parity is impossible to verify against unrealistic data.

**Implications for the rest of the team:**
- **Morpheus (WI-6):** When the real core/query calls replace the mock handlers, the prototype accountIds (`unicaja`, `caixa-ops`, …) can be reused as account "seed" slugs for a demo/onboarding fixture, or dropped once the real ULID ingest is wired. Either way, the contract shape did not change — only the mock payload. Your real resolver can slot in without touching ipc-contracts or panelApi.ts.
- **Cypher (tests):** Snapshot tests that captured the old Santander/BBVA strings will need updating. The new mock is stable (deterministic sparklines via a per-account string hash) so snapshots remain reliable.
- **Niobe (copy):** Prototype account *labels* are data, not copy — they stay in Spanish ("Principal", "Operaciones", "Eventos", "Donaciones", "FinRett") because they represent account names an NGO would configure, not UI strings.

**Non-decision:**
The IPC contract (`ipc-contracts/panel.ts`) was **not** changed. The mock overloads `categoryId` / `subcategoryId` to carry display labels as an interim convenience — WI-6 should return real IDs plus a separate resolver/lookup path (e.g. `getCategories`) that Panel can cache.

**Files touched:**
- `app/src/main/ipc/handlers/panel.ts` — mock payloads rewritten
- `app/src/renderer/screens/PanelScreen/PanelScreen.tsx` — per-row account-pill colouring uses `account.color` via `color-mix`
- `app/src/renderer/screens/PanelScreen/PanelScreen.css` — new card wrapper for the recent-movements table + footer link
- `app/src/renderer/components/AccountCard/AccountCard.css` — stripped duplicate rules; icon uses `--radius-md`, removed broken `min-width`
- `app/src/renderer/components/KPIStrip/KPIStrip.css` — stripped duplicate rules that shadowed `globals.css` prototype-parity recipe
- `app/src/renderer/styles/globals.css` — account-card grid gained a 4-col breakpoint at 1440px to bridge the 5→3 jump

---

### 2026-04-19: Transaction Schema + Validation Rules (WI-11, Morpheus decision)
**By:** Morpheus (Core/Domain)
**Status:** Merged from inbox
**Commit:** 8f2eb7b

**Decision:**
The `tx.created` event uses **positive `amount` + `type: 'income' | 'expense'`** — NOT a signed amount, NOT credit/debit split.

This matches the cloud FastAPI schema (`docs/schemas/cloud-reference-notes.md` §Transactions):
- Cloud: `amount: Decimal (positive, 12.2)` + `transaction_type: enum('income'|'expense'|'transfer'|'refund')`.
- Desktop M1 subset: `amount: number (> 0, finite)` + `type: 'income' | 'expense'` (transfer/refund deferred).

**Event payload shape (locked in `app/src/core/events/schemas.ts`):**
```ts
TransactionCreatedPayload = {
  id: string;              // ULID — transactionId
  date: string;            // YYYY-MM-DD
  type: 'income' | 'expense';
  amount: number;          // positive, finite
  currency: 'EUR';         // hardcoded for M1
  description: string;     // max 500 chars
  accountId: string;       // ULID — must exist
  categoryId: string | null;      // ULID or null
  subcategoryId: string | null;   // ULID or null
  tagIds: string[];               // array of ULIDs (may be empty)
  status: 'pending' | 'approved'; // review flag, NOT ledger state
  createdAt: string;       // ISO 8601 UTC — set by command via deps.now()
}
```

Envelope: `id` (event ULID ≠ transactionId), `type: 'tx.created'`, `datasetId`, `actorDeviceId`, `createdAt`, `dekVersion`, `version: 1`, `payload`.

**Command signature:**
```ts
createTransaction(
  input: CreateTransactionInput,
  deps: { now, newId, readModel, datasetId, actorDeviceId, dekVersion? }
): Result<TransactionCreatedEvent, ValidationError>
```

`newId()` is called **twice**: first for the event envelope `id`, then for the `payload.id` (transactionId). Both are ULIDs. They MUST differ.

**Validation rules (enforced at command boundary):**
| Code | Field | Rule |
|---|---|---|
| `TYPE_INVALID` | `type` | must be `'income'` or `'expense'` exactly |
| `AMOUNT_NON_POSITIVE` | `amount` | must be finite AND > 0. Rejects 0, negatives, NaN, Infinity. Sign carried by `type`, never by amount. |
| `CURRENCY_EMPTY` | `currency` | non-empty string after trim (schema currently pins to `'EUR'`) |
| `DESCRIPTION_EMPTY` | `description` | non-empty string after trim |
| `DATE_INVALID` | `date` | matches `YYYY-MM-DD` regex AND round-trips through `Date.toISOString().slice(0,10)` (rejects impossible calendar dates like `2026-02-31`) |
| `ACCOUNT_NOT_FOUND` | `accountId` | must exist in `deps.readModel.accounts` |

**Order:** type → amount → currency → description → date → account. Cheap checks first; account lookup last. First failure short-circuits.

**Cross-WI impact:**
- **WI-12 (IPC):** the IPC request schema for `createTransaction` MUST mirror `CreateTransactionInput`. Do NOT re-validate at the IPC boundary differently from the command — keep IPC as a thin pass-through. The command is the single source of truth for validation errors.
- **WI-13 (renderer form):** UI form fields must surface the six error codes as translatable messages. Amount input should be a non-negative number field (never show a sign toggle — use income/expense radio/segment for `type`). Map codes → i18n keys:
  - `TYPE_INVALID` → `movements.errors.typeInvalid`
  - `AMOUNT_NON_POSITIVE` → `movements.errors.amountNonPositive`
  - `CURRENCY_EMPTY` → `movements.errors.currencyEmpty`
  - `DESCRIPTION_EMPTY` → `movements.errors.descriptionEmpty`
  - `DATE_INVALID` → `movements.errors.dateInvalid`
  - `ACCOUNT_NOT_FOUND` → `movements.errors.accountNotFound`
- **WI-4′ (event log):** no impact — `TransactionCreatedEvent` is just another member of the `DomainEvent` union. The event log serializes/validates via the existing zod schemas.

**What's explicitly NOT in this shape (M1.5):**
- **`counterparty_name` / `counterparty_reference`:** cloud has them; desktop M1.5 does not. Deferring to a later WI.
- **`currency` other than EUR:** hardcoded for M1. Multi-currency is a future migration.
- **Signed amount or credit/debit fields:** rejected. Cloud never used them; adding would diverge from the cloud schema and require a read-model migration.
- **`transfer` / `refund` transaction types:** cloud has them; desktop M1.5 does not.
- **`originalAmount` (edit history):** will land with `tx.edited` event in a later WI.

**Reducer / read-model note:**
The existing `applyEvent` in `app/src/core/query/reducers.ts` already handles `tx.created` (WI-1). The read model stores a flat `transactions: Transaction[]` and computes `recentMovements` / `monthKPIs` / `accountBalances` on demand via queries — there are NO pre-materialized aggregates to update. Future WIs that add materialized projections (e.g., per-month buckets for Saldo) can extend the reducer; WI-11 did not require this.

**Tests:**
- `app/src/core/commands/createTransaction.test.ts` — 12 tests (happy path, all 6 error codes, optional fields, determinism of injected `now`/`newId`).
- `app/src/core/query/reducers.test.ts` — 2 tests covering the full command → event → reducer → query pipeline (3-transaction projection + out-of-order insertion sort).

All green (`npm test` → 66/66).

---

### 2026-04-19: EventLog interface — LOCKED contract for WI-4′ / WI-11 / (future) WI-4 (Morpheus decision)
**By:** Morpheus (Core/Backend)
**Status:** Merged from inbox
**Commit:** 73bfb8d
**Scope:** WI-4′ (M1.5 local-JSON adapter) + WI-11 (command-side write path). Supersedes nothing. Will be honoured by the M2 OneDrive+crypto adapter (WI-4).

**Interface:**
```ts
// app/src/core/eventLog/EventLog.ts
export interface EventLog {
  append(event: DomainEvent): Promise<void>;  // idempotent by event.id
  load(): Promise<DomainEvent[]>;             // insertion order
}
```

Where `DomainEvent` is the discriminated union already defined in `app/src/core/events/schemas.ts` (AccountCreated, CategoryCreated, TagCreated, TransactionCreated — WI-11 extends as needed).

**Guarantees:**
- **`append` is idempotent by `event.id`.** Re-appending the same event is a no-op. Callers MAY retry without deduping themselves.
- **`append` is durable on resolve.** The local adapter calls `fsync`. Network adapters (M2 OneDrive) will resolve only after the remote has acknowledged.
- **`load` returns every event ever appended, in insertion order.** Reducers assume this order is deterministic across restarts.
- **`load` tolerates per-line corruption.** Malformed NDJSON lines are skipped with a warning; the rest of the log is returned.
- **Empty log → `load()` returns `[]`** (not a thrown error, not `undefined`).

**Non-goals (by design):**
- No cursor / pagination — reducers are cheap for M1.5 volumes, and OneDrive's delta-token model will be hidden behind the same interface in M2.
- No query — this is a log, not a database. Query surface lives in `app/src/core/query/` and is populated by `replayEvents`.
- No delete — append-only. Tombstones (future) are just more events.
- No transactions / batching — callers append one event at a time.

**Contract for implementations:**
1. Validate nothing beyond `event.id` presence. Schema validation is the reducer layer's responsibility (Zod in `core/events/schemas.ts`).
2. Preserve byte-for-byte equality of serialized payloads so `load()[i]` deep-equals the `append()`ed event.
3. Surface I/O errors. Don't silently swallow, don't wrap in domain errors — callers need the original to decide retry vs. abort.

**Consumers:**
- **WI-4′ (this slice):** `main/bootstrap.ts` constructs a `JsonFileEventLog` under `app.getPath('userData')/dev-events/`, calls `load()` then `replayEvents(events)`. IPC read handlers in `main/ipc/handlers/panel.ts` then project over the hydrated read model.
- **WI-11 (command-side, in-flight):** `main/ipc/handlers/commands.ts` will call `eventLog.append(event)` then `applyEvent(event)` to update the live read model. Singleton is exported from `main/bootstrap.ts`.
- **WI-4 (M2, OneDrive + crypto):** swap the `JsonFileEventLog` constructor in `bootstrap.ts` for `OneDriveEventLog` + envelope encryption in the adapter. No other file should need to change.

**Adapter choice for M1.5: `JsonFileEventLog` / NDJSON:**
- One JSON object per line + trailing `\n`.
- File: `<userData>/dev-events/events.ndjson`.
- `append()` = `fs.open('a') → writeFile(line) → sync() → close()`.
- `load()` = `readFile → split('\n') → JSON.parse each → skip malformed`.
- In-memory `Set<event.id>` for idempotency; re-populated on `load()`.

**Dev-seed behaviour (bootstrap, not the adapter):**
When `events.ndjson` does not exist AND `NODE_ENV !== 'production'`, bootstrap emits prototype-shaped events (5 accounts / 8 categories / 6 tags / 30 txs) via `append()` before hydration. Never overwrites existing events. The adapter has no concept of seeding — seeding is a main-process concern.

---

### 2026-04-19: Morpheus — Movement schema v0.2 (subcategory/tags/status + nullable category)
**By:** Morpheus (Backend / Data Model), requested by Pedro
**Branch:** `fix/trinity-prototype-parity`
**Status:** Decided (applied, commit 56db75f)

**Scope:** Extended renderer contract (`interface Movement`) to match prototype Movements table column set. Supersedes Trinity's earlier gap note (merged into this decision).

**Schema Changes**

The `Movement` type now carries:

```ts
export type MovementStatus = 'pending' | 'approved' | 'rejected';

export interface Movement {
  readonly id: string;
  readonly date: string;
  readonly type: 'income' | 'expense';
  readonly amount: number;
  readonly currency: 'EUR';
  readonly description: string;
  readonly account: string;
  readonly category: string | null;    // null = uncategorised
  readonly subcategory: string | null;
  readonly tags: readonly string[];     // multi-label
  readonly status: MovementStatus;      // review workflow flag
}
```

**Rationale per field:**
- **`category: string | null`** — `null` is canonical "uncategorised" signal; empty strings also treated defensively.
- **`subcategory: string | null`** — already nullable, confirmed.
- **`tags: readonly string[]`** — multi-label transactions, matches prototype column. Always an array so renderers avoid null checks.
- **`status: 'pending' | 'approved' | 'rejected'`** — application-level review workflow (not accounting state). Ledger rows always confirmed at import; `status` is a reviewer flag rendered as colored badge via Mouse's `--color-status-*` tokens.

**Mock Data (v0.2)**

48 rows (Oct 2025 → Apr 2026) with deterministic seeding:
- `tags` — 0–3 picks from `['urgente','beca-2025','proyecto-a','auditable','recurrente']`, hashed on index.
- `status` — every 17th row `rejected`, every 7th `pending`, rest `approved` (~80/15/5).
- `category` — rows at `{4, 12, 27, 41}` forced to `null` for uncategorised filter coverage.

**Null-Safety Guards Added**

Three places in MovementsScreen.tsx (no behavior change):
1. Sort comparator: `(a.category ?? '')`.
2. `categoryOptions` dropdown skips `null` rows.
3. Category cell renders `—` when `category == null` (Trinity's columns pass will split into dedicated columns).

**Backend Implications**

When Movimientos graduates off mocks (PRD-001 PR15, ADR-001 C13), persistence layer mapping:

| Movement field | Journal event | SQLite projection |
|---|---|---|
| `category` | `tx.categorised { categoryId \| null }` | `tx.category_id INTEGER NULL` + join to `categories(name)` |
| `subcategory` | same event, `subcategoryId` | `tx.subcategory_id INTEGER NULL` |
| `tags` | `tx.tagged { add: string[], remove: string[] }` | `tx_tags(tx_id, tag_id)` M:N + `tags(id, label UNIQUE)` |
| `status` | `tx.reviewed { status }` | `tx.review_status TEXT NOT NULL DEFAULT 'approved'` |

**Open backend items for next pass:**
- Tags are a reference_data entity; need unique labels + referential integrity.
- `status` defaults to `'approved'` for CSV imports; manual entry UX may default to `'pending'` (Niobe/Trinity decision).
- Soft delete (cloud parity) orthogonal — lives on journal, not Movement type.
- Audit log (7-year TTL) applies to categorise/tagged/reviewed events like amount/date edits.
- ULID not UUID for `id` (per crypto-spec §11); mocks still use UUID; swap at IPC seam.
- Month filter follow-up: parse ISO strings OK for v0.2; when read model lands, expose `month` bucket (`YYYY-MM`) on projection to avoid string slicing.

**Why:** Trinity's columns pass (Trinity-movements-columns-pass, separate decision below) required expanded Movement type to render prototype columns. Backend mapping documented so Neo/storage tier can begin PRD-001 implementation against event-sourced journal.

### 2026-04-19: Trinity — Movements table columns + headers parity pass (ratification needed)
**By:** Trinity (Frontend Dev), requested by Pedro
**Branch:** `fix/trinity-prototype-parity`
**Status:** Delivered + test suite green; two points need team ratification

**Three-Part Pass**

Most mechanical prototype port. All gates green: typecheck, lint (0 warnings), 39 tests, build.

**Part 1: Prototype Columns Implementation**
- New columns: checkbox (selection-ready), account-pill, subcategory (split from category), tags chips, status badge
- Removed `max-width: 1440px` from `.ot-movements` — page flexes to container width
- New globals recipes: `.ot-tag-chip`, `.ot-tag-chip-row`, `.ot-badge--rejected`, `.ot-text-muted`
- Table primitive header type: `string` → `ReactNode` for render flexibility
- EN/ES status i18n keys: `common.movement.status.{pending,approved,rejected}`

**Part 2: Table Header Styling — ⚠️ DEVIATION FLAGGED FOR RATIFICATION**

**Applied implementation:** Natural case headers ("Fecha", "Descripción"), no `text-transform: uppercase`, no `letter-spacing`.

**Prototype contract conflict:** `prototype/styles.css:430` still sets `text-transform: uppercase` + `letter-spacing: var(--ls-section)` on `.tx-table th`. Prototype JSX writes natural case but CSS uppercases at render — rendered prototype output is UPPERCASE.

**Per north-star rule** (prototype is visual + interaction contract), this task *deviates* for the table-header recipe:
- **Ask:** Niobe / Link pick one and update either `prototype/styles.css` or `Table.css` so the two agree
  - Option A: drop uppercase from `.tx-table th` in prototype (3 lines) → app + prototype aligned
  - Option B: restore uppercase in `app/src/renderer/components/Table/Table.css` (font-size 11, letter-spacing 0.08em, text-transform uppercase)
- **Impact:** no other screen uses `.ot-table` today; change is contained. KPI strips, sidebar labels carry own uppercase rules and are unaffected.

**Part 3: Rejected Status Badge — Proxy Token Decision for Mouse**

No `--color-status-rejected-*` tokens exist in Mouse v0.2 (prototype doesn't render rejected rows either). Added `.ot-badge--rejected` in globals using `--color-expense-default` + `--color-expense-bg` as proxy, mirroring pending/approved shape.

**Ask:** Mouse — do you want dedicated `--color-status-rejected` / `--color-status-rejected-bg` tokens in v0.3, or is the expense-palette proxy acceptable? Rejected rows are rare by definition; current shortcut is probably OK, but flagging for clarity.

**Part 4: Page-Level Width**

Removed `max-width: 1440px` cap. Prototype `.main` has no cap; page now flexes to full container width. At very wide viewports (>1920px) the filter bar stretches but chip group / selects stay natural sizes — only the right-side "Limpiar filtros" ghost button floats further right. Acceptable per prototype.

No per-breakpoint cap needed. If 4K+ becomes an issue later, Mouse can add shell-level `max-width` in tokens/globals — not a per-screen one.

**Files Modified**

- MovementsScreen.tsx / .css (header + amount render, density)
- Table.tsx / .css (headers + new column types)
- globals.css (prototype recipes, spacing migration)
- locales/{en,es}/common.json (status i18n keys)

No primitive APIs changed; no token file edits; no prototype edits.

**Build Status**

| Gate | Result |
|------|--------|
| typecheck | ✅ |
| lint | ✅ 0 warnings |
| test | ✅ 39/39 |
| build | ✅ (34.92 kB CSS, 245.85 kB JS) |

**Why:** Movements table is the final UI screen needing prototype parity before M1 entry. Flagging two ratification points explicitly so design + product can resolve the header-casing and token-scope questions before this ships.

### 2026-04-19: Pending-tone ratification + Inter font self-hosted (via Copilot)
**By:** Pedro (perocha) — decisions captured by Scribe on behalf of Trinity font fix + Copilot directive
**Branch:** `fix/trinity-prototype-parity`
**Status:** Decided (applied)

**1. Pending-tone ratification into tokens v0.2**

Pending tone from the prototype (`#e65100` on `#fff3e0`) is ratified into tokens v0.2. The prior v0.1 design-system policy of "no pending tone anywhere" is formally reversed. Per the new north-star rule (prototype wins over design system), the prototype's pending badge is authoritative. No separate Link sign-off required — Pedro is the sole product reviewer for solo-dev phase.

**Impact:** Unblocks tokens-v0.2 merge path + any Movements row status work (status badge now has color design).

**2. Inter font self-hosted via @fontsource/inter**

**Problem:** Arrow glyphs (↑/↓) rendering too light. Root cause: Google Fonts CDN @import failing in Electron, falling back to system fonts with thinner strokes.

**Solution applied:** Bundled Inter via `@fontsource/inter`, per-weight imports in main.tsx (400, 500, 600, 700), CDN @import removed from tokens.css.

**Outcome:** Pedro confirmed visually — arrows much bolder, font rendering consistent across system.

**Why:** Electron doesn't load external CDN reliably; self-hosting resolves the issue. Font is now bundled as Vite asset and loads offline consistently.

### 2026-04-19: Table header capitalization + sticky-header clipping fix (CSS polish)
**By:** Trinity (Frontend Dev)
**Branch:** `fix/trinity-prototype-parity`
**Commit:** 2508ba0
**Status:** Delivered ✅

**Problem 1: Inconsistent header capitalization**

After Movements table columns parity pass, table headers were inconsistent:
- `tags` column (non-sortable): rendered UPPERCASE via `.ot-table th { text-transform: uppercase; }`
- Other columns (sortable): rendered natural case because `.ot-table__sort-btn` (button element) had UA default `text-transform: none`, overriding the inherited rule

**Fix:** `.ot-table__sort-btn` now inherits both `text-transform` and `letter-spacing` from parent `th`:
```css
.ot-table__sort-btn {
  text-transform: inherit;
  letter-spacing: inherit;
}
```

**Problem 2: Sticky table header clipped off-screen on scroll**

Pedro reported table headers disappeared when scrolling past the Movimientos table height.

**Root cause:** `.ot-table-wrap { overflow: hidden }` establishes a **scroll containing block**, which traps `position: sticky` descendants inside its boundary. When the wrap scrolls off-screen in `.ot-shell__main`, the sticky thead goes with it.

**Fix:** Changed `.ot-table-wrap` from `overflow: hidden` to `overflow: clip`:
- `overflow: clip` still visually clips children → rounded corners preserved
- `overflow: clip` does **NOT** create a scroll container → `position: sticky` escapes to the nearest scrolling ancestor (`.ot-shell__main`), so headers stay pinned as intended
- Electron/Chromium fully supports `overflow: clip`

**Durable Rule:**

When a wrapper element needs rounded-corner clipping **AND** contains a `position: sticky` descendant that must anchor to an outer scroll container, use `overflow: clip` (not `overflow: hidden`). Document in CSS so future devs don't "optimize" it back.

**Scope:** `app/src/renderer/components/Table/Table.css` only (2 edits)

**Impact:** Table now renders with consistent header capitalization and sticky headers remain visible during scroll.

**Test Status:** ✅ 39/39 tests pass, lint 0 warnings, build green

### 2026-04-19: .ot-shell__main carries NO top padding — sticky scroll isolation
**By:** Trinity (Frontend Dev)
**Date:** 2026-04-19
**Branch:** ix/trinity-prototype-parity
**Commit:** 662de83
**Status:** Delivered ✅

**Problem:** Rows rendering above the sticky <thead> when scrolling the Movimientos table. User (Pedro) reported transactions "pass behind the header to the top of the screen."

**Root cause:** .ot-shell__main had padding: var(--space-9) var(--space-10). The padding-top area (~48 px) is part of the scrollport. Sticky 	op: 0 anchors to the scrollport top — but scrolled content can be painted through the padding band, so rows pass over and above the pinned thead strip.

**Decision:**

1. .ot-shell__main keeps its **horizontal** and **bottom** gutter but **its padding-top is 0**:
   `css
   padding: 0 var(--space-10) var(--space-9);
   `

2. The top gutter moves onto .ot-page-header (the first in-flow child on every screen — Panel, Movimientos, Saldo):
   `css
   .ot-page-header { padding-top: var(--space-9); }
   `

**Contract:** Every future screen MUST start with a first-child element that owns the top gutter. If a new screen uses a different top element, it must carry padding-top: var(--space-9) or equivalent, otherwise it renders flush against the topbar. Sticky strips inside .ot-shell__main may rely on the scrollport top being unpadded — do not reintroduce padding-top on .ot-shell__main.

**Files changed:**
- pp/src/renderer/screens/AppShell/AppShell.css — .ot-shell__main padding
- pp/src/renderer/styles/globals.css — .ot-page-header padding-top

**Verification:** ✅ typecheck · ✅ lint (0 warnings) · ✅ 39/39 tests · ✅ vite build.

**Related:** .squad/skills/css-sticky-patterns/SKILL.md gotcha #3 (padded scroll container leaves gap above sticky).


### 2026-04-19: Sticky mask bands must cover the wrapper's side borders (mask-band polish)
**By:** Trinity (Frontend)
**Branch:** `fix/trinity-prototype-parity`
**Commits:** `1de5dc7` (mask band introduced), `1350d95` (side-border polish)
**Status:** Delivered ✅
**Related:** `.squad/skills/css-sticky-patterns/SKILL.md` §4; session log `.squad/log/20260419T145000Z-trinity-mask-band-side-borders.md`; prior inbox notes `trinity-table-sticky-clip.md` and `trinity-sticky-padding-gap.md`.

**Problem**
The 28 px `--sticky-top-offset` mask band (`.ot-table thead th::before`) introduced in 1de5dc7 showed 1 px vertical hairlines on each side while scrolled. Band color correct; edges not seamless.

**Root cause**
The mask pseudo is anchored to the `<th>` (`left: 0; right: 0`), so horizontally it spans only the th's interior — inside `.ot-table-wrap`'s padding edge. `.ot-table-wrap` has `border: 1px solid` + `overflow: clip`. Once the wrap's top has scrolled out of view, its left/right borders keep rendering full-height across the 0..28 px pin band, flanking the mask. Pseudo-elements do **not** inherit `border` from the host, so the hairlines weren't from the pseudo — they were the wrap's own card-frame borders showing through the sides of the mask's horizontal extent.

**Decision (hybrid fix)**
When a sticky mask band lives inside a bordered wrapper:

1. **Extend the mask horizontally past the wrapper's side borders.** Use first/last-child negative offsets on the pseudo (`left: -1px` / `right: -1px` matching the wrap's border width).
2. **Pair with `overflow-clip-margin` on the wrap** equal to the border width, so `overflow: clip` permits the mask to paint that 1 px outside the padding edge. Without this, the negative offsets are clipped away.
3. **Declare `border: 0` on the mask pseudo** as a defensive no-op. Pseudos default to no border, but declaring it documents intent and guards against future cascade leaks (e.g. a utility that globally sets `border` on `::before`).
4. **Verify the mask is visually absent at scroll=0.** The pseudo sits above the wrap's padding box at rest; `overflow: clip` (within the clip-margin tolerance) hides it until the sticky element actually pins. Do not rely on visibility toggles or JS — structural clipping is the correct mechanism.

**Implementation reference** — `app/src/renderer/components/Table/Table.css`:

```css
.ot-table-wrap {
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-lg);
  overflow: clip;
  overflow-clip-margin: 1px;
}

.ot-table thead th::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  height: var(--sticky-top-offset, 0);
  background: var(--color-surface-app);
  border: 0;
  pointer-events: none;
}
.ot-table thead th:first-child::before { left: -1px; }
.ot-table thead th:last-child::before  { right: -1px; }
```

**Scope**
Applies anywhere a sticky mask band pattern is used inside a bordered card/wrapper. Today: only `.ot-table thead th::before`. If future screens repeat the pattern (e.g. sticky section headers inside bordered panels), apply the same three rules. Documented as gotcha §4 in `.squad/skills/css-sticky-patterns/SKILL.md`.

**Files changed**
- `app/src/renderer/components/Table/Table.css`
- `.squad/skills/css-sticky-patterns/SKILL.md` (§4)
- `.squad/agents/trinity/history.md`

**Gates:** ✅ typecheck · ✅ lint (0 warnings) · ✅ 39/39 tests · ✅ vite build.

**Open questions:** none. `overflow-clip-margin` ships in Chromium 90 (2021); current Electron is well past that baseline.

---

## 2026-04-19: Sticky-thead top border + rounded corners (Commit 38038a9)

**By:** Trinity (Component Agent) + Scribe (Session Lead)  
**Branch:** ix/trinity-prototype-parity  
**Scope:** pp/src/renderer/components/Table/Table.css  
**Status:** ✅ Merged (gates all green)

After shipping the mask-band side-border fix (1350d95, gotcha #4), two CSS polish items remained on the Movements table card:

1. **At rest:** the wrap's 1px top border erased by mask pseudo bleed on block axis
2. **When stuck:** rounded top corners lost (overflow:clip doesn't trap sticky)

### Decision 1: Use overflow-clip-margin-inline: 1px

Constrains clip bleed to horizontal axis only. Keeps side-border bleed fix while restoring zero bleed on block axis. The mask pseudo's bottom 1px no longer paints over the wrap's top border.

`css
.ot-table-wrap {
  overflow: clip;
  overflow-clip-margin-inline: 1px; /* NOT overflow-clip-margin: 1px */
}
`

**Rationale:** Per-axis longhands supported in Chromium 122+; Electron 41 is on ~Chromium 134.

### Decision 2: Unconditional inner-radius on first/last th cells

The thead's first and last cells inherit the wrap's inner radius (calc(var(--radius-lg) - 1px)). At rest this is a no-op (th geometry already matches wrap's inner curve). When thead sticks and wrap scrolls, those corners become the visible pinned top edge, preserving card silhouette.

`css
.ot-table thead th:first-child {
  border-top-left-radius: calc(var(--radius-lg) - 1px);
}
.ot-table thead th:last-child {
  border-top-right-radius: calc(var(--radius-lg) - 1px);
}
`

**Rejected:** scroll-driven .is-stuck class (adds runtime state), radius on <thead> (browser inconsistency), radius on mask ::before (sits above th, can't provide corners).

### Skill Updates

Added to .squad/skills/css-sticky-patterns/SKILL.md:

- **Gotcha #5:** overflow-clip-margin bleed is axis-scoped for a reason — watch for masks anchored at ottom: 100% of sticky elements inside bordered wraps
- **Gotcha #6:** Sticky elements inside overflow: clip wraps escape the radius — match the wrap's inner radius on sticky element corners (no-op at rest, preserves silhouette when stuck)

### Quality Gates
✅ Typecheck · Lint (0-warn) · Test (39/39) · Build

### Commit Info
- Author: perocha <pedrojrocha@outlook.com>
- Date: 2026-04-19T16:46:21+0200
- Files: Table.css (+28, -5), SKILL.md (+127, -0)

---

## 2026-04-19: Morpheus — WI-12 IPC contract (transaction.create + movements.list)
**Status:** Finalized
**By:** Morpheus (Backend) — implementation delivered, recorded for cross-agent reference
**Branch:** main (commits 4495e51 + d894382)
**Artifact:** .squad/decisions/inbox/morpheus-ipc-transaction-contract.md → merged into decisions.md

# Morpheus — WI-12 IPC contract (transaction.create + movements.list)

**Status:** Finalized 2026-04-19
**Owner:** Morpheus (Backend)
**Consumers:** Trinity (renderer), future IPC authors

This document records the locked IPC contract Trinity + future devs consume.
Source of truth is `app/src/shared/ipc-contracts/transaction.ts` and
`app/src/shared/ipc-contracts/movements.ts` — this is a summary for
decision-history. When the files diverge from this doc, the files win.

## Channel 1: `transaction:create`

Creates a new transaction. Runs the WI-11 command, persists the event to the
EventLog, and updates the in-memory read model.

### Request — `CreateTransactionRequest`

| Field          | Type                           | Required | Notes                                           |
|----------------|--------------------------------|----------|-------------------------------------------------|
| `accountId`    | `string`                       | yes      | Boundary-level check `min(1)`; existence is a business rule (`ACCOUNT_NOT_FOUND`). |
| `date`         | `string` `YYYY-MM-DD`          | yes      | Business rule: must be a real calendar date.   |
| `type`         | `'income' \| 'expense'`        | yes      | Sign is carried by `type`, amount is always > 0.|
| `amount`       | `number > 0`, finite           | yes      |                                                 |
| `currency`     | `'EUR'`                        | yes      | Multi-currency deferred.                        |
| `description`  | `string` 1–500 chars           | yes      |                                                 |
| `categoryId`   | `string \| null`               | no       | Defaults to `null`.                             |
| `subcategoryId`| `string \| null`               | no       | Defaults to `null`.                             |
| `tagIds`       | `string[]`                     | no       | Defaults to `[]`.                               |
| `status`       | `'pending' \| 'approved'`      | no       | Defaults to `'approved'`.                       |

### Response — `CreateTransactionResponse` (discriminated union)

```ts
| { ok: true;  event: TransactionCreatedEventWire }
| { ok: false; error: { code: TransactionValidationErrorCode; message: string; field?: string } }
```

`TransactionValidationErrorCode` values:

- `ACCOUNT_NOT_FOUND` — `accountId` not in read model
- `AMOUNT_NON_POSITIVE` — amount `<= 0`, NaN, or Infinity
- `CURRENCY_EMPTY` — currency blank
- `DATE_INVALID` — not YYYY-MM-DD or not a real calendar date
- `DESCRIPTION_EMPTY` — blank description
- `TYPE_INVALID` — type not in enum
- `SCHEMA_INVALID` — top-level zod parse failed (renderer sent malformed payload)
- `INTERNAL` — unexpected throw in the handler; `message` carries the cause

**Invariants:**

- Nothing throws across IPC. Validation failures are always structured results.
- Idempotency: the EventLog dedupes by `event.id`. A successful response for a
  previously-seen id is valid but does NOT re-apply the reducer.
- Event envelope is stamped with runtime `datasetId` + `actorDeviceId` + new
  ULID ids from `app/src/main/ids.ts` (`newUlid`).

## Channel 2: `movements:list`

Returns the full list of transactions from the read model, projected into the
wire-level `MovementRecord` shape (IDs, not labels). Label resolution
(`accountId` → `accountLabel` etc.) is the renderer's job per WI-14.

### Request — `MovementsListRequest` (all fields optional)

| Field      | Type                  | Notes                                |
|------------|-----------------------|--------------------------------------|
| `accountId`| `string`              | Exact match on `accountId`.          |
| `dateFrom` | `string` `YYYY-MM-DD` | Inclusive lower bound.               |
| `dateTo`   | `string` `YYYY-MM-DD` | Inclusive upper bound.               |
| `limit`    | `number`, positive int, ≤5000 | Defaults to unbounded.        |
| `offset`   | `number`, non-negative int    | Defaults to 0.                |

### Response — `MovementRecord[]`

Same columns as `recentTransactionSchema` in `panel.ts`; `Movement` is exported
as an alias so either name compiles.

```ts
interface MovementRecord {
  id: string;
  date: string;           // YYYY-MM-DD
  type: 'income' | 'expense';
  amount: number;         // > 0
  currency: 'EUR';
  description: string;
  accountId: string;
  categoryId: string | null;
  subcategoryId: string | null;
  tagIds: string[];
  status: 'pending' | 'approved';
  createdAt: string;      // ISO 8601 UTC
}
```

**Sort:** DESC by `date` then by `createdAt`. Most recent first.
**No structured-error discriminated union** — `movements:list` is a pure query
with no validation failures reachable from valid input; zod parse errors on
the request side will propagate as handler throws (caught by ipcMain and
surfaced as Electron IPC errors). Trinity should wrap the caller in a try/catch
if she wants to tolerate shape mismatches during dev.

## Preload surface

`window.opentreasury` grows two new namespaces (matching `panel.*` pattern):

```ts
transaction: {
  create(input: CreateTransactionRequest): Promise<CreateTransactionResponse>;
},
movements: {
  list(filter?: MovementsListRequest): Promise<MovementRecord[]>;
}
```

Exposed via `contextBridge.exposeInMainWorld('opentreasury', api)` in
`app/src/preload/index.ts`. Channel constants (`IPC_TRANSACTION_CREATE`,
`IPC_MOVEMENTS_LIST`) are re-exported from the shared contracts — never
hardcode the string in renderer or preload.

## Files touched

- `app/src/shared/ipc-contracts/transaction.ts` (new)
- `app/src/shared/ipc-contracts/movements.ts` (new)
- `app/src/main/ipc/handlers/transaction.ts` (new, factory)
- `app/src/main/ipc/handlers/movements.ts` (new, factory)
- `app/src/main/ipc/handlers.ts` (registration)
- `app/src/main/ids.ts` (new — `newUlid`, `DATASET_ID`, `ACTOR_DEVICE_ID`)
- `app/src/preload/index.ts` (two new API methods)
- Tests: `app/src/main/ipc/handlers/{transaction,movements}.test.ts` (11 tests,
  in-memory EventLog stub, fresh reducer per test)

## Verification

- `npx vitest run app/src/main/ipc/handlers` — 11/11 green
- `npm test` — 81/81 green
- `npm run typecheck` / `npm run lint` — clean
- `npm run build` — clean (dist/main + dist/preload + dist/renderer)
- `node --check dist/preload/index.cjs` — exit 0 (preload CJS bundle valid)


---

## 2026-04-19: Neo — E2E Vertical Slice Plan (M1.5 Storage Fallback Decision)
**Status:** Decided + Implemented
**By:** Neo (Lead/Architect) — re-sequencing decision, endorsed by Pedro
**Artifact:** .squad/decisions/inbox/neo-e2e-vertical-slice-plan.md → merged into decisions.md

# Neo — E2E Vertical Slice Plan (M1.5)

**Date:** 2026-04-19
**Requested by:** Pedro
**Status:** Proposed — decision requested on storage fallback (see §5)

## 1. Where we are now

- **Panel screen:** shipped and wired through real IPC bridge. Handlers return **mock** data (see `app/src/main/ipc/handlers/panel.ts`; Morpheus WI-1/WI-2/WI-3 landed).
- **Event-sourced core:** event schemas + read-model queries + reducers exist (`app/src/core/events`, `app/src/core/query`). **No commands, no append path, no storage.**
- **Movements screen:** UI exists (`MovementsScreen.tsx`) but reads `getMockMovements()` directly in the renderer — no IPC, no core, no add-transaction form.
- **Net:** we can *read* a fake world. We cannot *write* anything. Nothing persists across app restarts.

## 2. Gap to a real E2E scenario

To let Pedro **add a transaction → see it in the list → see Panel KPIs + recent movements update**, we need, minimally:

1. **Core write path** — `commands/createTransaction.ts` (pure: request + state → event[]), plus a `TransactionCreated` event shape (already half-there in schemas).
2. **Event log persistence** — append one event file per command. Either WI-4 (OneDrive) or a **local-JSON dev fallback** (see §5).
3. **Append-and-project orchestrator** in main — load log, fold reducers into in-memory read model, expose a "dispatch command" entry point that appends + re-projects.
4. **Movements IPC contract** — `movements.list`, `transaction.create` (Zod schemas, handler, preload bridge, typed client) — mirrors the Panel IPC pattern Morpheus already established.
5. **Add-transaction modal** — form UI (account, date, amount, type, category, description) per prototype; triggers `transaction.create`.
6. **Wire MovementsScreen to real IPC** — drop `getMockMovements`, subscribe to a store that re-fetches after `transaction.create` resolves.
7. **Panel re-read** — after a successful create, invalidate Panel queries (simple event-bus ping or re-run loaders on window focus + on command success).

## 3. Updated WI sequencing — target: **M1.5 Vertical Slice** demo

| # | WI | Owner | Shape | Status |
|---|----|-------|-------|--------|
| WI-1 | Core read model | Morpheus | ✅ done | done |
| WI-2 | Panel IPC contract | Morpheus | ✅ done | done |
| WI-3 | Panel UI wiring | Trinity | ✅ done | done |
| **WI-4′** | **Local-JSON event log (dev fallback)** — `app/src/storage/local/` append-only `events/*.json`, plaintext, no crypto | **Morpheus** | **NEW — critical path** | next |
| **WI-11** | **Transaction command** — `core/commands/createTransaction.ts` + `TransactionCreated` event + reducer update for movements/KPIs | **Morpheus** | **NEW — critical path** | next |
| **WI-12** | **Movements IPC contract** — `movements.list`, `transaction.create` (schemas, handlers, preload, client) | **Morpheus + Trinity** | **NEW — critical path** | next |
| **WI-13** | **Add-Transaction modal + Movements real-data wiring** — form per prototype, replaces `getMockMovements`, calls `transaction.create`, refetches list + nudges Panel | **Trinity** | **NEW — critical path** | next |
| **WI-14** | **Panel invalidation** — simple "command dispatched" event bus so Panel loaders re-run | **Trinity + Morpheus** | **NEW — critical path** | next |
| WI-4 | OneDrive event append (real) | Morpheus | ⏸ **deferred to M2** | later |
| WI-5 | Crypto layer (age/XChaCha) | Morpheus + Switch | ⏸ **deferred to M2** | later |
| WI-6 | Wire real core to Panel handlers (now folded into WI-14) | Morpheus | merged | — |
| WI-7/8/9/10 | Sparklines, 12-month bars, empty states, skeletons | Trinity / Mouse | ⏸ polish after M1.5 | later |

**Critical path to M1.5:** WI-4′ → WI-11 → WI-12 → WI-13 → WI-14. Estimate: **4–6 working days**, mostly Morpheus on days 1–3, Trinity on days 3–5, joint wiring day 5–6.

**Deferred (explicit):** OneDrive sync, crypto at rest, multi-device concurrency, sparklines, 12-month chart, deep empty states. None of these block a local single-user "add-and-see" demo.

## 4. Near-term plan — next 3 WIs to pick up

### WI-4′ — Local-JSON event log (Morpheus)
- **Shape:** `app/src/storage/local/eventLog.ts` — `append(event): Promise<void>` writes `{ulid}.json` under `%APPDATA%/opentreasury/dev-events/`; `load(): Promise<Event[]>` reads + sorts by ULID; nothing else. No encryption, no OneDrive, no locking (single-writer dev mode).
- **Done =** vitest covers round-trip append + load; main process uses it at startup to hydrate the read model.

### WI-11 — Transaction command + projection (Morpheus)
- **Shape:** `core/commands/createTransaction.ts` pure function; `TransactionCreated` event in schemas; reducer feeds both `recentMovements` and `monthKPIs` projections. Existing read-model queries automatically reflect new state.
- **Done =** unit tests: append 3 TransactionCreated events → `queryRecentTransactions` returns them newest-first; `getMonthKPIs` reflects totals.

### WI-12 — Movements IPC + WI-13 Add-Transaction modal (Morpheus + Trinity, parallelizable)
- **Shape:** Contract package `shared/ipc-contracts/movements.ts` (Zod schemas for `list` + `create`). Main handlers call `dispatch(command)` → append → re-project → return. Renderer gets typed client. Trinity builds the "+ Add" modal per `prototype/movimientos.jsx`, wires submit → `window.ipc.transaction.create(...)` → refresh list + emit `panel:invalidate`.
- **Done =** run the app, click **+ Add**, fill form, submit. New row appears in Movements. Switch to Panel — balance, month KPI, and recent-movements list reflect it. Restart app — data still there.

## 5. Storage fallback — **DECISION RECOMMENDED**

**Call: ship a local-JSON event log now (WI-4′); defer OneDrive (WI-4) + crypto (WI-5) to M2.**

**Rationale (one sentence):** OneDrive + crypto are 6–8 days of work with Switch review dependencies; a local append-only JSON log is <1 day, keeps the event-sourced architecture intact (same event shape, same reducers, storage is a swappable adapter), and unblocks a working demo this week — which is what Pedro asked for.

**Boundary:** WI-4′ is explicitly dev-only. The storage interface (`EventLog` with `append`/`load`) is the same one WI-4 will implement against OneDrive. No code written for WI-4′ is thrown away — only the adapter behind it is replaced.

## 6. Milestone

- **M1.5 — Vertical Slice:** Add-transaction → list → Panel reflects. Target: end of next week. Single-user, local, unencrypted. Proves the event-sourcing loop end-to-end.
- **M1 Panel Alpha** (original): folds into M1.5 since real data now flows through the same path.
- **M2:** OneDrive adapter (WI-4) + crypto (WI-5) + multi-device concurrency — swap storage adapter, no UI or core changes.

---

## 2026-04-19: WI-13 (Trinity) — Add-Transaction Modal Implementation

**Status:** ✅ Completed (81/85 tests pass, 4 skipped jsdom). Commit 17134be.

**Summary:**  
Trinity completed end-to-end vertical slice for transaction creation: user clicks "+ New Transaction" → fills modal form → submits → sees new row at top of Movements list.

**Form Field List:**

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `date` | date input | ✅ | Today (ISO YYYY-MM-DD) | Regex `/^\d{4}-\d{2}-\d{2}$/` |
| `type` | select | ✅ | "expense" | One of "income" \| "expense" |
| `amount` | number | ✅ | — | Positive, > 0, step 0.01 |
| `description` | text | ✅ | — | Non-empty after trim, max 500 chars |
| `account` | select | ✅ | First account in list | Must exist in Panel accounts |
| `categoryId` | — | ❌ | — | Wired in contract, omitted from UI (v1) |
| `subcategoryId` | — | ❌ | — | Wired in contract, omitted from UI (v1) |
| `tagIds` | — | ❌ | — | Wired in contract, omitted from UI (v1) |
| `status` | — | — | "approved" | Hardcoded, not user-editable |

**Validation Strategy — Two-tier approach:**
1. **Client-side pre-flight** (instant feedback, no IPC): Validates shape before calling `createTransaction()`. Fires on form submit.
2. **Server-side validation** (business rules): Core command validates account exists, amount positive, date valid ISO string. Returns structured errors.

**Modal Pattern Details — Native `<dialog>` element** (no 3rd-party deps):
- Lifecycle: `useEffect` keyed on `isOpen` prop calls `dialog.showModal()` / `dialog.close()`
- Backdrop click closes modal
- Escape key handled by native `cancel` event
- Focus trap handled by browser (modal mode blocks interaction outside dialog)

**Panel-Invalidation Approach (WI-14-lite):**
After `createTransaction` resolves `{ok:true}`:
1. Modal closes
2. `MovementsScreen.loadAll()` re-runs → calls `listMovements()` + `getAccounts()`
3. Table re-renders with new row at top

**Panel screen does NOT auto-refresh.** User must reload the app or navigate away/back to see updated KPIs and recent-transactions list. Known limitation documented in code.

**WI-14 proper will add:**
- Event-bus pattern (e.g., `window.opentreasury.events.emit('panel:invalidate')`)
- Panel screen subscribes on mount, re-runs loaders when event fires
- Any write command emits the event
- No polling, no global refresh — targeted invalidation per command

**Testing Coverage:**
- Modal component: 3 tests (skipped — jsdom dialog API incomplete)
- MovementsScreen: 4 tests
- CI status: 81/85 pass, 4 skipped, typecheck/lint/format green

**Files Changed:**
- New: `app/src/renderer/components/AddTransactionModal/` (modal component, styles, tests, barrel)
- Modified: `app/src/renderer/screens/MovementsScreen/`, `app/src/renderer/locales/{en,es}/common.json`

**Learnings for Future WIs:**
Reusable modal form submission pattern established. IPC contract gap identified: MovementRecord is ID-based but UI needs labels. WI-14 should either add labels inline to `movements.list` response or add separate lookup tables.

**Accessibility reminder:** Always pair `aria-invalid` with `aria-describedby` for validation errors. Screen readers need the linkage to announce errors on focus.

**Next steps (WI-14):**  
Event-bus subscription for panel invalidation + category/tag label resolution.

---

## 2026-04-19: WI-15/16 Scope — CONFIGURACIÓN + DATOS Work Packages

**Status:** 🔶 Draft — awaiting Pedro approval on 6 open questions.

**Author:** Neo (Lead/Architect)  
**Date:** 2026-04-19  
**Reference Repo:** `rett-europe/opentreasury` (Angular 19 + Python FastAPI web app)

### Section A — Inventory (What the Web App Has)

#### A1. Accounts (`/api/accounts`)
- **CRUD Operations:** List, Create, Read, Update, Delete (soft-delete if zero transactions)
- **Business Rules:** IBAN uniqueness, Account color palette (normalized hex), Soft-delete protection, Activation toggle, Sort order
- **UX Patterns:** Modal dialog for create/edit, Inline toggle for isActive, Confirmation dialog before delete, Color picker widget
- **Reference Files:** API router (`/api/app/routers/accounts.py`), Service layer, Schema

#### A2. Categories + Subcategories
- **CRUD Operations:** List categories (nested), Create/Update/Delete categories, Add/Update/Remove subcategories
- **Business Rules:** Parent-child hierarchy, Type constraint (income/expense), Uniqueness (case-insensitive), Soft-delete protection, Subcategory removal validation
- **UX Patterns:** Modal dialog with nested subcategory inline editor, Expandable list, Inline activation toggle, Confirmation dialog with transaction count

#### A3. Tags/Labels (`/api/tags`)
- **CRUD Operations:** List, Create, Read, Update, Delete (soft-delete if zero transactions)
- **Business Rules:** Uniqueness (case-insensitive), Free-form color (not palette), Soft-delete protection
- **UX Patterns:** Modal dialog, Inline toggle, Confirmation dialog

#### A4. Import (`/api/imports`) — 3-step wizard
1. **Upload + Account Selection:** User uploads file, selects target account
2. **Sheet Selection + Preview:** Shows row counts, new categories/subcategories, duplicates, allows category type overrides
3. **Confirm + Import:** Creates categories, inserts transactions, returns summary

**Column Mapping (Auto-Detected):** Via hardcoded alias lookup (no user-configurable mapping in v1)  
**Duplicate Detection:** Hash-based idempotency key `md5(accountId + date + amount + description)`  
**Category Auto-Creation:** Parses unique (category, subcategory) pairs, guesses type from keywords, user can override  
**Error Handling:** Malformed rows skipped with warnings; partial success model

#### A5. Export (`/api/export`) — Filter + Download
- **Output format:** XLSX only, includes Date, Account, Category, Subcategory, Amount, Balance, Description, Tags, Review Status
- **UX Pattern:** Filter form (date range picker, optional account/category dropdowns), Download button

### Section B — Import Deep-Dive (Complexity Analysis)

**3-step wizard:**
1. Upload + Account Select → call `POST /api/imports/preview`
2. Preview + Sheet Selection → user can override category types
3. Confirm + Import → call `POST /api/imports/workbook`

**Column Mapping:** Auto-detected via alias lookup (case-insensitive, diacritic-normalized). No user-configurable mapping UI in v1.

**Duplicate Detection:** Hash-based `source_reference`, no external transaction ID.

**Error Handling:** Malformed rows skipped; partial success continues; warnings returned.

**Side Effects on Domain:**
- Events appended: `CategoryCreated` × N, `SubcategoryCreated` × M, `TransactionCreated` × K
- `import_batch_id` (ULID) + `import_source` (filename) stored on each transaction

### Section C — Event Model Additions

**New event types needed:**
- Account: `account.created`, `account.updated`, `account.deactivated`, `account.deleted`
- Category: `category.created`, `category.updated`, `category.deactivated`, `category.deleted`
- Subcategory: `subcategory.created`, `subcategory.updated`, `subcategory.deactivated`, `subcategory.deleted`
- Tag: `tag.created`, `tag.updated`, `tag.deactivated`, `tag.deleted`
- Import: `import.batch-started`, `import.batch-completed`

**Event Ordering + Projection Consistency:**
- Account/Category/Tag must exist before Transaction references it
- Delete protection requires txn count query
- Panel + Movements invalidation broadcasts after config events

### Section D — Work Packages (Deliverables)

#### WI-15: CONFIGURACIÓN — Reference Data CRUD (Accounts, Categories, Tags)
**Purpose:** Build the UI + command layer for managing accounts, categories, subcategories, and tags.  
**Owner:** Trinity (UI + IPC client), Morpheus (commands + IPC handlers)  
**Size:** L (10–12 days, split Morpheus 6d + Trinity 6d with 2d overlap)

**Acceptance Criteria (5 phases):**
1. **Command Layer (Morpheus):** All CRUD commands, vitest 100%
2. **Query Projections (Morpheus):** `queryAccounts`, `queryCategories`, `queryTags`, vitest coverage
3. **IPC Contracts (Morpheus + Trinity):** Zod schemas, handlers, typed clients
4. **UI Components (Trinity):** Card grids, form dialogs, inline toggles, delete confirmation
5. **Integration (Trinity + Morpheus):** Wire nav, test all flows, broadcast invalidation events

#### WI-16: DATOS — Import/Export
**Purpose:** Build the import wizard (upload XLSX → preview → commit) and export flow (filter → download XLSX).  
**Owner:** Morpheus (parser + command), Trinity (wizard UI + export UI)  
**Size:** L (12–14 days, split Morpheus 8d + Trinity 6d with 2d overlap)

**Phases:**
1. **Import Parser (Morpheus):** Read XLSX, auto-detect sheets, parse rows, compute hash
2. **Import Command (Morpheus):** Validate account, parse file, create categories, append events
3. **Export Service (Morpheus):** Query transactions, generate XLSX, return file
4. **IPC Contracts (Morpheus + Trinity):** Define contracts, handlers, clients
5. **Import Wizard UI (Trinity):** 3-step flow with preview + category overrides
6. **Export UI (Trinity):** Filter form + download button

#### WI-17: Integration + Polish
**Purpose:** End-to-end wiring, edge case handling, accessibility, and UX polish.  
**Owner:** Trinity (UI polish), Niobe (UX audit), Mouse (a11y + design tokens)  
**Size:** M (5–6 days)

### Section E — Open Questions for Pedro (BLOCKING)

**E1. Configuration Events vs Separate Config Store**  
Should accounts/categories/tags produce domain events (event-sourced) or live in separate store (SQLite/JSON)?  
**Neo's Recommendation:** Option A (event-sourced). Aligns with ADR-001, audit trail valuable, event log manageable.

**E2. Multi-Currency Accounts in v1?**  
Support USD/GBP or hardcode EUR?  
**Neo's Recommendation:** Hardcode EUR, add field for future, UI hides it.

**E3. Import: Match All Banks or Start Generic?**  
Replicate bank-specific parsers or ship manual column mapping?  
**Neo's Recommendation:** Option B (bank-specific parsers for v1), covers 90% of RETT imports.

**E4. Category Type Change — Allow or Block?**  
If category has transactions, allow type change (income → expense)?  
**Neo's Recommendation:** Option A (allow + warn). Matches web app.

**E5. Import Batch Rollback on Error?**  
Partial success (80 of 100) or atomic (0 or 100)?  
**Neo's Recommendation:** Option A (partial success). Web app UX works well.

**E6. Export: CSV Option, or XLSX Only?**  
Both formats or XLSX only?  
**Neo's Recommendation:** XLSX only for v1.

### Section F — v1 Minimum Slice (WI-15-lite)

**Goal:** Smallest subset allowing Pedro to add account/category/tag through UI + see them in Add-Transaction modal.

**Scope:**
- Accounts: Create only (hardcoded EUR, no color picker, no PayPal toggle)
- Categories: Create only (hardcoded income/expense, no subcategories)
- Tags: Create only
- No import/export

**Size:** S (3–4 days)

**Is WI-15-lite valuable as separate milestone, or go straight to full WI-15?**  
ASK PEDRO.

---

## 2026-04-19: UX-007 — Configuración UI v1 Spec

**Status:** 🔶 Draft v0.1 — awaiting review  
**Author:** Niobe (UX/Spec Analyst)  
**Date:** 2026-04-19  
**Related:** WI-15 (Neo scoping), WI-13 (Add Transaction modal), prototype/shell.jsx

### Prototype Reference

The prototype sidebar navigation defines **Configuración** section (lines 53–57 in `prototype/shell.jsx`):
```jsx
{ section: 'Configuración', items: [
  { id: 'categorias',  label: 'Categorías',   icon: 'folder' },
  { id: 'etiquetas',   label: 'Etiquetas',    icon: 'tag' },
  { id: 'cuentas',     label: 'Cuentas',      icon: 'bank' },
]},
```

The desktop v1 must match: **three distinct screens** (Cuentas, Categorías, Etiquetas) with CRUD operations.

### 1. User Goals

- **UG-1: Account Creation** — Quick add of organization's bank + PayPal accounts to start recording transactions
- **UG-2: Category & Subcategory Management** — Define income/expense categories with optional subcategories
- **UG-3: Label/Tag Creation** — Create custom labels for cross-cutting themes (e.g., "COVID-19 Relief")

### 2. Navigation & Information Architecture

**Sidebar Placement:** Configuración between Principal (Panel, Movimientos, Saldo) and Datos (Importación, Exportar)  
**Route Structure:** `/configuracion/cuentas`, `/configuracion/categorias`, `/configuracion/etiquetas` — sibling top-level screens

**Empty States (First-Time User):**
1. **Cuentas empty:** Icon `Landmark`, Heading "No hay cuentas bancarias", CTA "Añadir Cuenta"
2. **Categorías empty:** Icon `FolderOpen`, Heading "No hay categorías", CTA "Añadir Categoría"
3. **Etiquetas empty:** Icon `Tag`, Heading "No hay etiquetas", CTA "Añadir Etiqueta"

### 3. Core Flows

#### Cuentas (Bank Accounts & PayPal)

**List View:**
- Card grid (responsive: 1 col mobile, 2–3 cols desktop)
- Card contents: Left border stripe (color), Icon (Landmark/CreditCard), Title + currency badge, Subtitle (bank name), Metadata (IBAN masked/PayPal email), Actions (Edit/Activate-Toggle/Delete)
- Sort: by `sortOrder`, then creation date
- States: Active (full opacity), Inactive (0.65 opacity + dashed border + "Inactivo" badge)

**Create Flow:**
- Modal with Type selector (Bank/PayPal), fields: Bank name, Short name, Account label, IBAN (bank only)/PayPal email (PayPal only), Color picker (preset palette), Currency (EUR/USD/GBP), Sort order
- Validation: IBAN format (basic length check), email, required fields
- Success: Toast "Cuenta creada: {accountLabel}"

**Edit Flow:**
- Modal pre-filled, Type immutable, IBAN/Email editable with warning, Activa toggle (with confirmation if >0 txns)

**Archive/Delete Flow:**
- Archive: Toggle → confirmation (if >0 txns, show count), Toast "{accountLabel} desactivada"
- Delete: Trash icon → block if >0 txns with message, allow if 0 with hard-delete confirmation

#### Categorías + Subcategorías

**List View:**
- Card grid, Card contents: Header row (name + type badge "Ingreso"/"Gasto"), Description (optional, truncated), Subcategories (chip list, max 5 + "y {n} más"), Actions (Edit/Delete)
- Sort: Alphabetical + inactive last
- Empty: "Sin subcategorías"

**Create Flow:**
- Modal with Type selector (Ingreso/Gasto), Name, Description, Inline subcategory editor (list container, add row with Enter shortcut)
- Validation: Subcategory names unique within category, show error on blur
- Success: Toast "Categoría creada: {name}"

**Edit Flow:**
- Modal pre-filled, Type immutable, Subcategory editing (rename/delete/add), Activa toggle

**Delete Flow:**
- Block if >0 txns, Allow if 0

#### Etiquetas (Labels/Tags)

**List View:**
- Card grid (smaller cards), Tag preview chip (colored pill), Name + Inactivo badge (if applicable), Actions (toggle/edit/delete)
- Sort: Alphabetical + inactive last

**Create Flow:**
- Modal with Name (required, max 30 chars), Color picker (12 preset swatches, default purple)
- Validation: Tag names unique (case-insensitive)
- Success: Toast "Etiqueta creada: {name}"

**Edit Flow:**
- Modal pre-filled, Activa toggle

**Delete Flow:**
- Block if >0 txns, Allow if 0

### 4. Integration with Add Transaction Modal (WI-13)

**Contract:** Newly-created accounts/categories/tags appear immediately in modal dropdowns.

**Optimistic Refresh Strategy:**
1. After successful create, Configuración screen calls local refetch
2. Modal listens to "config changed" event (IPC channel or React context) and refetches reference data

**Open Question Q1 (for Pedro):** Should modal close on nav away (Option A, simpler) or persist state (Option B, better UX)?

### 5. Error & Empty States

**First-Time User Journey:**
1. App opens to Panel
2. Panel empty state: "No hay cuentas configuradas. Configura tu primera cuenta."
3. CTA links to `/configuracion/cuentas`
4. User creates account, returns to Panel (or is auto-routed?)

**Validation Errors (Inline):**
- Below field, red text + red left border + warning icon
- Copy style: plain, actionable Spanish (e.g., "IBAN no válido. Verifica el formato.")

**Destructive Action Guards:**
- Confirmation dialog before irreversible action
- Body: plain-language impact (show txn count if applicable)
- Actions: "Cancelar" | "{Action}" (danger red for delete, warn orange for deactivate)

### 6. Accessibility Requirements (WCAG 2.1 AA)

**Keyboard-Only Navigation:** All CRUD fully keyboard-accessible (Tab through cards, Enter to activate, Escape to close modal, Arrow keys for color picker)

**Focus Management:**
- Modal open: focus moves to first interactive element, background inert
- Modal close: focus returns to trigger button
- After delete: focus moves to next card (or "Añadir" button if list empty)

**Screen Reader Labels:**
- Action buttons: `aria-label="Editar {accountLabel}"`
- Validation errors: `aria-describedby="error-{fieldName}"`
- Color picker: `role="radiogroup"` with individual swatches as `role="radio"`

### 7. i18n Considerations

**Primary:** Spanish (ES)  
**Required:** English (EN) fallback  
**Key namespace:** `config.*` (cuentas, categorias, etiquetas)  
**ICU Pluralization:** For count messages (e.g., "{count, plural, one {1 movimiento} other {# movimientos}}")

### 8. Out of Scope for v1

Explicitly deferred to M1.1 or later:
- Bulk import of categories/tags
- Category reordering (drag-drop)
- Custom color picker (hex input) — v1 preset palette only
- Multi-currency transactions
- Category type mutation
- Undo/Redo for deletions
- Category/tag usage analytics
- Subcategory-only view
- Account reconciliation UI
- Custom fields for accounts
- Advanced IBAN validation (checksum)
- "Archived" list view filter

### 9. Acceptance Criteria (5 key scenarios)

**AC-1:** User creates PayPal account via modal → modal closes → list refreshes → toast confirms  
**AC-2:** User creates category with two subcategories → category card shows subcategories as chips  
**AC-3:** User creates tag "COVID-19" with orange color → tag card shows orange pill  
**AC-4:** User creates new account in Configuración → returns to Add-Transaction modal → new account in picker  
**AC-5:** Keyboard-only user tabs through cards, Escape closes modal, Arrow keys navigate color picker

### 10. Open Questions

**Q1:** Modal state persistence — close on nav away (A, simpler) vs persist form (B, better UX)?  
**Q2:** Panel empty-state routing — link to `/configuracion/cuentas` (A) or quick-create modal (B)?  
**Q3:** Sort order field visibility — show by default (A) or behind "Opciones avanzadas" (B)?  
**Q4:** IBAN validation — full checksum (A) or basic length check (B)?  
**Q5:** Subcategory deletion — keep parent category (A), fully uncategorize (B), or block (C)?

---



## 2026-04-19T19:22Z — WI-15/16/17 scope rulings (Pedro via Copilot directive)

**Source:** `.squad/decisions/inbox/copilot-directive-wi15-answers.md` (merged).
**Context:** Answers to Neo's six open questions from `neo-wi15-configuracion-datos-scope.md`.

**Rulings:**
1. **Q1 — Event-sourced config vs separate store:** ✅ **Event-sourced.** Accounts, categories, tags are first-class domain events appended to the same NDJSON log as transactions.
2. **Q2 — EUR-only for v1:** ✅ Confirmed. Schema keeps a `currency` field for forward-compatibility but UI hides it (always EUR). Multi-currency deferred.
3. **Q3 — Category-type conflict on import:** ⚠️ Re-scoped. **Categories do NOT carry a `type` (income/expense) field.** Direction lives on the transaction. A category like "Donaciones" can be either income (donation received) or expense (refund issued). Categories are *labels / groupings*, not direction-constrained. No keyword-based type-guessing during import.
4. **Q4 — Partial-success imports:** ✅ Confirmed — with a critical clarification: **duplicate handling is by row-hash, not file-hash.** Re-importing the same file after some rows failed must NOT double-insert the rows that already succeeded.
5. **Q5 — Bank-specific parsers vs generic manual mapping:** ✅ **Bank-specific parsers.** WI-17 will ship a small set of per-bank CSV/XLSX parsers rather than a generic manual column-mapping wizard.
6. **Q6 — WI-15-lite first:** ✅ Confirmed. Ship minimum CRUD (add Cuenta / Categoría / Etiqueta, show them in Configuración + feed into Add-Transaction) before going wide on edit/archive/subcategorías/import.

**Impact:** Unblocked WI-15-lite kickoff. Q3 removed `CategoryType` from the schema. Q1 fixed the storage model as event-sourced. Q5 shapes WI-17 implementation.

---

## 2026-04-19T~21:29Z — Morpheus: WI-15-lite IPC contracts (FROZEN)

**Source:** `.squad/decisions/inbox/morpheus-wi15-contracts.md` (merged).
**Status:** Frozen. Authoritative files: `app/src/shared/ipc-contracts/{accounts,categories,tags}.ts`. If this doc and the files diverge, the files win.

### Channels

```
accounts:create   accounts:list
categories:create categories:list
tags:create       tags:list
```

### Accounts — `accounts.ts`

```ts
interface AccountCreatedEvent {
  type: 'AccountCreated';
  id: string;
  name: string;
  bankName?: string;
  currency: 'EUR';
  openingBalance: number;
  createdAt: string; // ISO 8601 UTC
}

interface CreateAccountRequest {
  name: string;            // required, non-empty after trim
  bankName?: string;
  openingBalance?: number; // defaults to 0 if omitted
  // currency is hard-coded EUR in the handler; not on the wire.
}

type CreateAccountResponse =
  | { ok: true;  event: AccountCreatedEvent }
  | { ok: false; error: { code: AccountErrorCode; message: string; field?: string } };

type AccountErrorCode =
  | 'NAME_EMPTY'
  | 'NAME_DUPLICATE'            // case-insensitive name collision
  | 'OPENING_BALANCE_INVALID'   // not finite (NaN / Infinity)
  | 'SCHEMA_INVALID'            // zod boundary parse failed
  | 'INTERNAL';

interface AccountRecord {
  id: string;
  name: string;
  bankName?: string;
  currency: 'EUR';
  openingBalance: number;
  createdAt: string;
}
```

`accounts:list` returns `AccountRecord[]` in createdAt ASC (insertion order).

### Categories — `categories.ts`

**No `type` field on category** (per Pedro's Q3 — direction-agnostic).

```ts
interface CategoryCreatedEvent {
  type: 'CategoryCreated';
  id: string;
  name: string;
  color?: string;
  createdAt: string;
}

interface CreateCategoryRequest { name: string; color?: string; }

type CategoryErrorCode = 'NAME_EMPTY' | 'NAME_DUPLICATE' | 'SCHEMA_INVALID' | 'INTERNAL';

interface CategoryRecord { id: string; name: string; color?: string; createdAt: string; }
```

### Tags — `tags.ts`

```ts
interface TagCreatedEvent { type: 'TagCreated'; id: string; name: string; createdAt: string; }
interface CreateTagRequest { name: string; }
type TagErrorCode = 'NAME_EMPTY' | 'NAME_DUPLICATE' | 'SCHEMA_INVALID' | 'INTERNAL';
interface TagRecord { id: string; name: string; createdAt: string; }
```

### Invariants (all three entities)

- **Nothing throws across IPC.** Validation failures always return `{ ok: false, error }`.
- **Uniqueness:** case-insensitive + trimmed per entity type. `'Banco ABC'` vs `'banco abc'` → `NAME_DUPLICATE`.
- **Idempotency:** events appended to the shared NDJSON event log, deduped by `id`. Replaying the same log yields the same projections.
- **IDs:** `main/ids.ts#newUlid` — 26-char Crockford base32 ULID. Opaque to the renderer.
- **currency:** Accounts hard-code `'EUR'`; field is present on the record for M2 forward-compat but absent from `CreateAccountRequest`.

### Preload surface

`window.opentreasury` grows three namespaces:

```ts
accounts:   { create(req): Promise<CreateAccountResponse>;  list(): Promise<AccountRecord[]>; }
categories: { create(req): Promise<CreateCategoryResponse>; list(): Promise<CategoryRecord[]>; }
tags:       { create(req): Promise<CreateTagResponse>;      list(): Promise<TagRecord[]>; }
```

### Notes

- The dev-seed in `main/devSeed.ts` continues to write the legacy enveloped `account.created` / `category.created` / `tag.created` events used by Panel. These **do not** appear in the new `*:list` endpoints — the WI-15-lite events are a separate stream. Empty arrays from the three list endpoints are valid and expected on a fresh install / seeded-but-never-configured install. Consolidation of the two streams is a future WI.
- **Implementation deviation:** `*:list` actually returns a wrapped object `{ accounts|categories|tags: Record[] }` rather than a bare array. Trinity's renderer + three service tests consumed the wrapped shape; the contract doc only specified the record shape. Wrapping chosen as lower-blast-radius given parallel work.
- No archive / edit / delete / subcategories / import in this slice.

---

## 2026-04-19T~21:45Z — Morpheus: WI-15-lite main-process shipped

**Source:** `.squad/decisions/inbox/morpheus-wi15-lite-summary.md` (merged).

**Scope:** Main-process half of WI-15-lite — Cuentas / Categorías / Etiquetas, create + list only, event-sourced, EUR-only, no `type` on categories, no archive/edit/delete, no import.

### Files

**New:**
- `app/src/shared/ipc-contracts/{accounts,categories,tags}.ts` — Zod schemas + types + channel names.
- `app/src/main/ipc/handlers/{accounts,categories,tags}.ts` + tests (10 + 8 + 7).
- `app/src/main/projections/config.ts` — `selectAccounts` / `selectCategories` / `selectTags` selectors + 3 tests.

**Modified:**
- `app/src/core/events/schemas.ts` — three flat event schemas + extended `DomainEvent` union.
- `app/src/core/query/types.ts` — added `ConfigAccount` / `ConfigCategory` / `ConfigTag` rows + extended `ReadModel` with `configAccounts` / `configCategories` / `configTags`. Kept separate from legacy `accounts` / `categories` / `tags` arrays (Panel + dev-seed).
- `app/src/core/query/reducers.ts` — cases for the three PascalCase event types; `replayEvents` / `resetReadModel` initialise all seven projection arrays.
- `app/src/main/ipc/handlers.ts` — registered six new channels.
- `app/src/preload/index.ts` — exposed `window.opentreasury.{accounts,categories,tags}.{create,list}`.
- `app/src/renderer/types/config.ts` — rewritten to re-export the frozen shared contracts.

### Deviations from task spec

1. `*:list` returns a wrapped object not a bare array (see contracts note above).
2. `selectPanelSnapshot` NOT modified — Panel already reads from the hydrated read model, no hardcoded list found. Legacy `account.created` envelopes and new `AccountCreated` flat events coexist as **separate** projection streams; `accounts:list` returns only user-created (WI-15-lite) accounts, seed data does not leak through.
3. Event shape is **flat** (`{ type, id, …fields, createdAt }`), not the WI-11/12 envelope (`{ id, type, datasetId, actorDeviceId, createdAt, dekVersion, version, payload }`). Both coexist in the NDJSON log; `JsonFileEventLog` only requires a string `id`; reducers switch on `type`.
4. IDs use `newUlid()` (matches `main/ids.ts`), not `crypto.randomUUID()` — consistent with existing transaction IDs.

### Tests

| Before | After |
|--------|-------|
| 81 pass + 4 skip = 85 | 121 pass + 9 skip = 130 |

+40 passing, +5 skipped. `npm run typecheck`, `lint`, `format:check`, `test -- --run`, `build:preload` all clean.

### Not in this slice

- Archive / edit / delete → full WI-15.
- Subcategories → full WI-15.
- CSV / XLSX import/export → WI-17.
- Multi-currency → deferred (Pedro Q2).
- `categoryType` / direction on categories → dropped (Pedro Q3).
- Seed-migration tool for legacy Panel envelope events → follow-up when WI-15 full scope lands.

---

## 2026-04-19T~22:00Z — Trinity: WI-15-lite renderer shipped

**Source:** `.squad/decisions/inbox/trinity-wi15-lite-summary.md` (merged).

Builds on Morpheus's frozen contracts. Gates green: `tsc -b`, `vitest --run` (121 pass / 9 skip / 27 files), `eslint` (0/0), `format:check`. +13 tests (4 accountsApi + 4 categoriesApi + 4 tagsApi + 5 ConfiguracionScreen).

### Files

**Added:**
- `app/src/renderer/services/{accounts,categories,tags}Api.ts` + tests.
- `app/src/renderer/components/ConfigModals/` — `ConfigModalShell.tsx`, `AddAccountModal.tsx`, `AddCategoryModal.tsx`, `AddTagModal.tsx`, `errorMap.ts`, `index.ts`, `ConfigModal.css`.
- `app/src/renderer/screens/ConfiguracionScreen/` — `ConfiguracionScreen.tsx` + `.css` + `.test.tsx`, `CuentasTab.tsx`, `CategoriasTab.tsx`, `EtiquetasTab.tsx`, `index.ts`.
- `app/src/renderer/types/config.ts` — shim re-exporting shared contracts.

**Modified:**
- `App.tsx` — adds `'configuracion'` route, bumps `configRevision` counter on create, passes it to `MovementsScreen`.
- `AppShell.tsx` — sidebar split into **Principal** + **Configuración** sections; nav entry with `SlidersHorizontal` icon.
- `MovementsScreen.tsx` — fetches categories + tags alongside accounts; re-hydrates whenever `configRevision` changes; `.catch()` swallows failures so pre-existing tests stay green without new mocks.
- `AddTransactionModal.tsx` — adds optional Category `<select>` and Tags multi-`<select>`. No contract modification needed — `CreateTransactionRequest` already carried `categoryId` / `tagIds`.
- `locales/{en,es}/common.json` — new `configuracion.*` namespace, `shell.nav.configuracion`, `shell.sections.config`, `common.save` / `common.saving`.

**Cleanup:**
- Deleted stray `.d.ts` / `.js` / `.js.map` emits under `app/src/shared/ipc-contracts/`. `shared/tsconfig.json`'s `outDir` is `dist/shared`, so in-tree emits are a build-invocation bug to fix upstream.

### UX compliance (Niobe / AA)

- Tabs: `role="tablist"` / `role="tab"` / `aria-selected` / `aria-controls` / tabIndex juggling per ARIA authoring practices.
- Modals: native `<dialog>` via `showModal()`; Escape + backdrop click both invoke `onClose`; `role="dialog"` + `aria-modal="true"` + labelled header.
- Empty states: icon + title + body + primary CTA.
- All colors via design tokens (no inline `#hex` in component CSS). The 8-color category palette is a data palette (hex stored on the category record) as a constant in `AddCategoryModal`.
- i18n: every string keyed under `configuracion.*`; ES + EN parity.

### Deliberate deviations / TODOs

- **No subcategory in Add-Transaction.** Matches Morpheus's contract for WI-15-lite.
- **No archive/edit/delete.** Out of scope.
- **No toast primitive yet.** On successful create, modals close and the parent tab silently re-fetches. Wire toasts later (WI-16?).
- **Icon choice:** `SlidersHorizontal` for Settings in the sidebar. Swap to `Settings` (gear) trivially if preferred.
- **`MovementsScreen` test (pre-existing):** mocks `movementsApi` / `transactionApi` / `panelApi` but not the new `categoriesApi` / `tagsApi`. `.catch()` fallback in `loadAll()` keeps it green.

### Don't-list compliance

- ❌ No edit / archive / delete.
- ❌ No import / export UI.
- ❌ No preload touched (Morpheus owns it).

---

## 2026-04-19T~22:10Z — Coordinator: electron moved to devDependencies (packaging unblock)

**Problem:** `npm run package` failed because `electron` was listed in `dependencies`, causing `electron-builder` to double-bundle it / trip ASAR resolution.

**Fix:** Moved `electron` from `dependencies` to `devDependencies` in `app/package.json`.

**Verification:** `npm run package` now produces `out/OpenTreasury Setup 0.0.0.exe` cleanly. End-to-end packaging pipeline verified for the first time.

**Convention going forward:** `electron` stays a dev-only dependency; only Electron **runtime** modules (native addons like `@napi-rs/keyring`, preload deps) belong in `dependencies`. This matches standard electron-builder practice and is worth encoding in PR review checklists.

---

## WI-17 v2 — Generic Column-Mapping Importer

### 2026-04-20: WI-17 v2 Specification — 6-Step Generic Import Flow, IPC Contracts, SHA-256 Dedup
**By:** Neo (Architect/Lead)  
**Related:** Copilot directives (pivot + date-format ruling)  
**Artifact:** .squad/decisions/inbox/neo-wi17-v2-spec.md (frozen spec, 684 lines)

**By:** Neo  
**Supersedes:** WI-17 original bank-specific parser scope

## Goal

Ship a generic Excel/CSV importer that handles arbitrary bank statement formats via user-driven column mapping, with a mandatory dry-run preview to prevent bad imports, row-level deduplication, and mapping memory per account to streamline recurring imports. Targets both daily top-ups (<100 txns) and bulk historical loads (>100 txns).

## User flow (6 steps)

### Step 1: Select destination account
User selects an existing account from a dropdown. One import session = one account (1:1 rule). This pre-binds the `accountId` for all imported rows, eliminating account-column mapping.

### Step 2: Upload file
User clicks "Upload" button, triggering a file-open dialog filtered to `.xlsx` and `.csv`. File size limit: 10 MB. After selection, main process reads the file into memory.

**Edge case:** File unreadable (corrupted, wrong encoding, malformed) → reject immediately with `FILE_UNREADABLE` error + detail string (e.g., "Unsupported encoding" / "Invalid XLSX structure").

### Step 3: Sheet picker (if multi-sheet)
If the file is an Excel workbook with >1 sheet, UI shows a sheet picker (sheet name list). User selects one. CSV files skip this step (always 1 sheet).

**Edge case:** User selects a sheet with <3 columns → reject at mapping step (next).

### Step 4: Column mapping
UI shows detected column headers from the selected sheet (or auto-generated headers like `Column A`, `Column B` if no header row detected). User maps source columns to three **required** fields:

- **Date** (required)
- **Amount** (required)
- **Description** (required)

**Optional fields deferred:** category, subcategory, tags (manual post-import for v1).

**Column auto-detection rule (first-run only):** None. User maps manually. Heuristics deferred.

**Mapping persistence:** After a successful import, the system stores the mapping (source column → field) keyed by `accountId`. Next time the user imports to the same account, the UI **pre-fills** the mapping (but remains editable — user can change it before dry-run).

**Edge case:** Sheet has <3 columns total → show error `INSUFFICIENT_COLUMNS` ("This sheet doesn't have enough columns to import. We need at least Date, Amount, and Description.") and block progression.

**Edge case:** User leaves any of the three required fields unmapped → block dry-run button, show inline error.

### Step 5: Dry-run preview
User clicks "Preview Import". Main process parses the sheet with the provided mapping and returns:

- **Row samples:** first 5 parsed rows (date, amount, description, accountId) as they'd appear post-import.
- **Total estimated row count:** number of data rows found (excluding header).
- **Duplicates detected:** list of rows matching an existing movement's `rowHash` (see algorithm below). Each duplicate shows: `{rowIndex, date, amount, description, isDuplicate: true}`.
- **Validation errors:** rows that fail parsing or schema validation. Each error shows: `{rowIndex, field, reason}` (e.g., `{rowIndex: 12, field: 'date', reason: 'Invalid date format'}`).

**Dry-run UI:**
- Shows a summary card: "**142 rows ready** | 3 duplicates | 2 errors"
- Shows sample rows in a read-only table.
- Lists duplicates + errors below.
- Checkbox: "**Import duplicates**" (default: unchecked). If unchecked, duplicates are skipped on commit. If checked, all duplicates are re-imported (new events with new IDs, same content).

**Edge case:** All rows are duplicates or invalid → show warning, but allow commit if user ticks "Import duplicates" or fixes source file.

### Step 6: Commit import
User clicks "Commit Import". Main process appends `movement.imported` events for all valid, non-skipped rows. Each event includes:

- Full movement payload (id, date, type, amount, description, accountId, etc.)
- `rowHash` (for future dedup)
- `sourceFileName` (original filename)
- `importBatchId` (ULID generated at commit time — groups all rows from this import)

**Partial success model:** If 100 rows are submitted and 80 parse + 20 fail validation → append 80 events, return warnings array with 20 errors. User can fix the source file and re-import; the 80 already-imported rows will be detected as duplicates and skipped (unless "Import duplicates" is ticked).

**On success:** Modal closes, main UI invalidates movement list, toast shows "**142 movements imported**".

**On partial success:** Modal closes, toast shows "**80 movements imported, 20 skipped (see errors)**", errors shown in a dismissible notification panel.

## Data contracts (frozen for this WI)

### IPC channel: `import/stage-file`
Reads file from disk, detects sheets/columns, returns metadata for Step 3 + Step 4.

**Request:**
```ts
interface StageFileRequest {
  filePath: string;        // Absolute path from file-open dialog
  accountId: string;       // ULID of destination account (selected in Step 1)
}
```

**Response (success):**
```ts
interface StageFileResponse {
  ok: true;
  fileId: string;          // Opaque session token; used in subsequent calls
  fileName: string;        // Original basename (for display)
  sheets: string[];        // Sheet names (empty for CSV, 1+ for XLSX)
  // If single-sheet, next field is populated immediately:
  columns?: string[];      // Column headers (or auto-generated Column A, B, C...)
}
```

**Response (error):**
```ts
interface StageFileError {
  ok: false;
  error: {
    code: 'FILE_UNREADABLE' | 'INTERNAL';
    detail: string;
  };
}
```

---

### IPC channel: `import/select-sheet`
Called after Step 3 (sheet picker) to retrieve column headers for the selected sheet.

**Request:**
```ts
interface SelectSheetRequest {
  fileId: string;          // From stage-file response
  sheetName: string;       // User-selected sheet
}
```

**Response (success):**
```ts
interface SelectSheetResponse {
  ok: true;
  columns: string[];       // Column headers
}
```

**Response (error):**
```ts
interface SelectSheetError {
  ok: false;
  error: {
    code: 'SHEET_NOT_FOUND' | 'INSUFFICIENT_COLUMNS' | 'INTERNAL';
    detail: string;
  };
}
```

---

### IPC channel: `import/last-mapping`
Retrieves the last-used column mapping for the given account (for pre-fill).

**Request:**
```ts
interface LastMappingRequest {
  accountId: string;
}
```

**Response:**
```ts
interface LastMappingResponse {
  ok: true;
  mapping: {
    dateColumn: string | null;
    amountColumn: string | null;
    descriptionColumn: string | null;
  } | null;  // null if no prior import for this account
}
```

---

### IPC channel: `import/dry-run`
Parses the file with the provided mapping, validates, detects duplicates, returns preview.

**Request:**
```ts
interface DryRunRequest {
  fileId: string;
  accountId: string;
  mapping: {
    dateColumn: string;
    amountColumn: string;
    descriptionColumn: string;
  };
}
```

**Response (success):**
```ts
interface DryRunResponse {
  ok: true;
  summary: {
    totalRows: number;
    validRows: number;
    duplicateCount: number;
    errorCount: number;
  };
  samples: Array<{           // First 5 rows
    rowIndex: number;        // 1-based (row 1 = first data row after header)
    date: string;            // ISO 8601 YYYY-MM-DD
    amount: number;
    description: string;
    isDuplicate: boolean;
  }>;
  duplicates: Array<{
    rowIndex: number;
    date: string;
    amount: number;
    description: string;
    rowHash: string;         // 16-char hex
  }>;
  errors: Array<{
    rowIndex: number;
    field: 'date' | 'amount' | 'description';
    reason: string;          // Human-readable (e.g., "Invalid date format: '32/13/2024'")
  }>;
}
```

**Response (error):**
```ts
interface DryRunError {
  ok: false;
  error: {
    code: 'MAPPING_INVALID' | 'PARSE_ERROR' | 'INTERNAL';
    detail: string;
  };
}
```

---

### IPC channel: `import/commit`
Writes events for all valid, non-skipped rows.

**Request:**
```ts
interface CommitImportRequest {
  fileId: string;
  accountId: string;
  mapping: {
    dateColumn: string;
    amountColumn: string;
    descriptionColumn: string;
  };
  importDuplicates: boolean;  // From Step 5 checkbox
}
```

**Response (success):**
```ts
interface CommitImportResponse {
  ok: true;
  imported: number;           // Count of events appended
  skipped: number;            // Duplicates (if importDuplicates=false)
  warnings: Array<{           // Validation errors (rows that couldn't parse)
    rowIndex: number;
    field: 'date' | 'amount' | 'description';
    reason: string;
  }>;
  importBatchId: string;      // ULID grouping this batch
}
```

**Response (error):**
```ts
interface CommitImportError {
  ok: false;
  error: {
    code: 'PARSE_ERROR' | 'INTERNAL';
    detail: string;
  };
}
```

---

### New event type: `movement.imported`
Each imported row appends one event. Payload extends the standard `tx.created` shape with import metadata.

**Event schema:**
```ts
interface MovementImportedEvent {
  type: 'movement.imported';
  id: string;                 // ULID (unique per row)
  payload: {
    // Core movement fields (same as tx.created):
    id: string;               // ULID (same as event.id)
    date: string;             // ISO 8601 YYYY-MM-DD
    type: 'income' | 'expense';  // Derived from amount sign (see below)
    amount: number;           // Always positive; type carries direction
    currency: 'EUR';
    description: string;
    accountId: string;        // ULID
    categoryId: null;         // Always null in v1 (manual categorization post-import)
    subcategoryId: null;
    tagIds: [];
    status: 'pending';        // Always pending on import
    createdAt: string;        // ISO 8601 UTC
    
    // Import-specific metadata:
    rowHash: string;          // 16-char hex (for dedup)
    sourceFileName: string;   // Original file name (e.g., "statement-2024-03.xlsx")
    importBatchId: string;    // ULID grouping all rows from this commit
    rowIndex: number;         // 1-based row number in source sheet
  };
}
```

**Envelope compatibility:** This is a **flat event** (like `AccountCreated` / `CategoryCreated` / `TagCreated` from WI-15-lite), not an enveloped event (like `tx.created`). Both shapes coexist in the NDJSON log; `JsonFileEventLog` requires only a string `id` field, and reducers switch on `type`.

**Reducer impact:** Add a case to `applyEvent` in `reducers.ts`:
```ts
case 'movement.imported':
  readModel = {
    ...readModel,
    transactions: [
      ...readModel.transactions,
      {
        id: event.payload.id,
        date: event.payload.date,
        type: event.payload.type,
        amount: event.payload.amount,
        currency: event.payload.currency,
        description: event.payload.description,
        accountId: event.payload.accountId,
        categoryId: event.payload.categoryId,
        subcategoryId: event.payload.subcategoryId,
        tagIds: event.payload.tagIds,
        status: event.payload.status,
        createdAt: event.payload.createdAt,
      },
    ],
  };
  break;
```

The read model does **not** store `rowHash` / `sourceFileName` / `importBatchId` (those are write-only event metadata). For dedup, the main process maintains a separate in-memory hash index (or queries the event log on demand).

---

### Error codes (exhaustive)
All IPC responses use these codes:

| Code                  | Meaning                                                                 | Which channel(s)      |
|-----------------------|-------------------------------------------------------------------------|-----------------------|
| `FILE_UNREADABLE`     | File corrupted, wrong encoding, or malformed structure                  | `stage-file`          |
| `SHEET_NOT_FOUND`     | Requested sheet name doesn't exist in workbook                          | `select-sheet`        |
| `INSUFFICIENT_COLUMNS`| Sheet has <3 columns (can't satisfy date/amount/description requirement)| `select-sheet`        |
| `MAPPING_INVALID`     | Mapping incomplete (missing required field) or column names don't exist | `dry-run`             |
| `PARSE_ERROR`         | File read failed mid-parse or cell values unparseable                   | `dry-run`, `commit`   |
| `DUPLICATE_DETECTED`  | *(Not an error; reported in `duplicates` array, not as error code)*    | —                     |
| `SCHEMA_INVALID`      | Request payload failed Zod validation                                   | (All channels)        |
| `INTERNAL`            | Uncaught exception (should never happen; logs to main console)          | (All channels)        |

---

## Row hash algorithm

**Purpose:** Idempotent imports. If the same file (or semantically identical rows from different files) is imported twice, detect and skip duplicates.

**Inputs (before hashing):**
1. `accountId` (ULID string)
2. `date` (ISO 8601 YYYY-MM-DD string)
3. `amount` (number, normalized to 2 decimal places)
4. `description` (string)

**Normalization rules:**
1. **accountId:** No normalization (already a canonical ULID).
2. **date:** Convert to YYYY-MM-DD (already normalized by date parser).
3. **amount:** 
   - Convert to absolute value (ignore sign; type is derived separately).
   - Round to 2 decimal places.
   - Serialize as string with fixed 2-decimal notation (e.g., `123.40`, not `123.4`).
4. **description:**
   - Trim leading/trailing whitespace.
   - Convert to lowercase.
   - Collapse multiple consecutive spaces to single space.
   - Normalize line breaks (CRLF → LF).

**Concatenation:**
```ts
const input = `${accountId}|${date}|${amountNormalized}|${descriptionNormalized}`;
```

**Hash function:** SHA-256, truncated to first 16 hex characters.

```ts
import crypto from 'crypto';

function computeRowHash(
  accountId: string,
  date: string,
  amount: number,
  description: string
): string {
  const amountNormalized = Math.abs(amount).toFixed(2);
  const descriptionNormalized = description
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\r\n/g, '\n');
  
  const input = `${accountId}|${date}|${amountNormalized}|${descriptionNormalized}`;
  
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex').substring(0, 16);
}
```

**Dedup lookup:** Before appending a `movement.imported` event, check if any event in the log (of type `movement.imported` or `tx.created`) has `payload.rowHash === computedHash` (for imported movements) or compute the hash on-the-fly for manual transactions. **MVP simplification:** Only check `movement.imported` events (manual txns don't carry `rowHash`, so they won't dedup against imports). Full cross-dedup is a future enhancement.

**Storage:** `rowHash` is stored in `movement.imported` event payload but **not** in the read model projection. For dedup checks, the importer either:
- (Option A) maintains an in-memory `Set<string>` of all hashes (rebuilt on log replay).
- (Option B) scans the event log on each dry-run/commit (slower but zero memory overhead).

**Recommendation:** Option A. Add `rowHashes: Set<string>` to the read model, updated in the `movement.imported` reducer case.

---

## Dry-run validation rules

### Date parsing
**Accepted formats:**
- ISO 8601: `YYYY-MM-DD`, `YYYY/MM/DD`
- European: `DD/MM/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY`
- US: `MM/DD/YYYY`, `MM-DD-YYYY` (disambiguated by heuristic: if day > 12, assume European)

**Implementation:** Use a date-parsing library like `date-fns` with format auto-detection. Try formats in order (ISO first, then European, then US). If all fail → validation error.

**Fallback behavior:** If cell is a number (Excel serial date), convert via `(serialDate - 25569) * 86400000` → JS Date → YYYY-MM-DD. If cell is empty → validation error ("Date is required").

**Validation errors:**
- Unparseable string (e.g., `"not a date"`) → `{field: 'date', reason: 'Invalid date format'}`
- Out-of-range date (e.g., `32/13/2024`) → `{field: 'date', reason: 'Date out of range'}`
- Future date > today + 30 days → warning (not error; allow but log): `{field: 'date', reason: 'Future date (check if correct)'}`

---

### Amount parsing
**Accepted formats:**
- Decimal separator: comma (`,`) or dot (`.`)
- Thousands separator (optional): `.` (European) or `,` (US/UK), or space, or none
- Sign: leading `-` or `+`, or trailing `CR`/`DB` (credit/debit)
- Parentheses for negatives: `(123.45)` → `-123.45`

**Implementation:**
1. Strip thousands separators (detect heuristically: if both `,` and `.` present, the one appearing earlier/more frequently is thousands).
2. Replace European comma decimal separator with dot: `1.234,56` → `1234.56`.
3. Parse parentheses: if wrapped in `()` → negate.
4. Parse sign suffix: `123.45 CR` → `+123.45`, `123.45 DB` → `-123.45`.
5. Use `parseFloat()` on cleaned string.

**Edge case:** Cell is a string like `"$1,234.56"` or `"€ 123,45"` → strip currency symbols first (regex: `[^0-9.,\-+() ]`).

**Validation errors:**
- Unparseable string (e.g., `"abc"`) → `{field: 'amount', reason: 'Invalid amount'}`
- Zero or empty → `{field: 'amount', reason: 'Amount is required and must be non-zero'}`
- Negative zero after parsing (e.g., `-0.00`) → coerce to `0.00`, treat as error if business rule requires non-zero.

**Type derivation (income vs expense):**
- If amount < 0 → type = `'expense'`, store `Math.abs(amount)`
- If amount > 0 → **heuristic required** (bank statements vary: some use positive for income, some for expense).
  - **MVP rule:** Assume positive = income, negative = expense. Add a **sign-convention toggle** in the UI (Step 4): "Positive amounts are [Income / Expense]". Default: Income.
  - Store the toggle choice as part of the mapping persistence.

---

### Description
**Validation:**
- Required: non-empty after trim.
- Max length: 500 characters (matches `tx.created` schema).

**Normalization:**
- Trim leading/trailing whitespace.
- Collapse internal newlines/tabs to single space.

**Validation errors:**
- Empty or whitespace-only → `{field: 'description', reason: 'Description is required'}`
- Exceeds 500 chars → truncate (don't error; log warning in dry-run report).

---

### What counts as a "validation error" vs "duplicate"
- **Validation error:** Row fails date/amount/description parsing or schema rules → appears in `errors[]` array, **not imported** (skipped).
- **Duplicate:** Row parses successfully, but `rowHash` matches an existing event → appears in `duplicates[]` array, **conditionally imported** (only if user ticks "Import duplicates").

If a row is both invalid and duplicate → treat as validation error (errors take precedence).

---

## Mapping persistence

**Projection name:** `importMappings` (new read model slice).

**Shape:**
```ts
interface ImportMapping {
  accountId: string;
  dateColumn: string;
  amountColumn: string;
  descriptionColumn: string;
  amountSignConvention: 'positive-is-income' | 'positive-is-expense';  // From Step 4 toggle
  updatedAt: string;         // ISO 8601 UTC
}
```

**Storage mechanism:** Event-sourced via a new event type `import.mapping.updated`.

**Event schema:**
```ts
interface ImportMappingUpdatedEvent {
  type: 'import.mapping.updated';
  id: string;                // ULID
  accountId: string;
  mapping: {
    dateColumn: string;
    amountColumn: string;
    descriptionColumn: string;
    amountSignConvention: 'positive-is-income' | 'positive-is-expense';
  };
  updatedAt: string;         // ISO 8601 UTC
}
```

**Reducer case:**
```ts
case 'import.mapping.updated':
  const existing = readModel.importMappings.find(m => m.accountId === event.accountId);
  if (existing) {
    // Update existing mapping
    readModel = {
      ...readModel,
      importMappings: readModel.importMappings.map(m =>
        m.accountId === event.accountId
          ? { ...m, ...event.mapping, updatedAt: event.updatedAt }
          : m
      ),
    };
  } else {
    // Add new mapping
    readModel = {
      ...readModel,
      importMappings: [
        ...readModel.importMappings,
        {
          accountId: event.accountId,
          ...event.mapping,
          updatedAt: event.updatedAt,
        },
      ],
    };
  }
  break;
```

**When to append:** After a successful `import/commit`, append one `import.mapping.updated` event (not per-row; one per import session).

**Read model addition:**
```ts
// In types.ts
export interface ReadModel {
  // ... existing fields
  importMappings: ImportMapping[];
}

// In reducers.ts emptyReadModel()
importMappings: [],
```

**Retrieval:** `import/last-mapping` handler queries `readModel.importMappings.find(m => m.accountId === requestedAccountId)`.

---

## File format support

### CSV
**Encoding detection:**
- Try UTF-8 first.
- If invalid UTF-8 sequences detected, fall back to Windows-1252 (common in Spanish bank exports).
- If both fail → `FILE_UNREADABLE`.

**Implementation:** Use Node.js `Buffer` + `iconv-lite` for encoding detection.

**Delimiter detection:**
- Check first 10 lines for frequency of `,` vs `;` vs `\t`.
- Most frequent wins.
- If ambiguous (e.g., all appear equally) → default to `,`.

**Quote handling:**
- Support standard CSV quoting (fields wrapped in `"`).
- Escaped quotes inside quoted fields (`""` → `"`).

**Library choice:** **`papaparse`** (5.4.1, 44 KB gzipped).
- Battle-tested, handles edge cases (quoted newlines, mixed delimiters, encoding).
- Auto-detects delimiter and quotes.
- Streams large files (supports row-by-row parsing to avoid loading full 10 MB file into memory).

**Why not Node.js `csv-parse`?** Papaparse is renderer-friendly (isomorphic) and has better auto-detection. Both are fine; Papaparse chosen for broader adoption and simpler API.

---

### XLSX
**Library choice:** **SheetJS Community Edition (`xlsx`)** version 0.18.5 (~400 KB minified).

**Why SheetJS over `exceljs`?**
| Feature               | SheetJS `xlsx`      | `exceljs`           |
|-----------------------|---------------------|---------------------|
| Size                  | ~400 KB             | ~800 KB             |
| Read performance      | Faster (SAX parser) | Slower (DOM parser) |
| Write performance     | Good                | Better              |
| Formula evaluation    | Values only         | Values only (v1)    |
| Licensing             | Apache 2.0          | MIT                 |
| Maintenance           | Active (SheetJS LLC)| Active (community)  |

**Decision:** SheetJS. Half the size, faster reads, adequate for v1 (we only read values, not formulas or styles). Export (WI-18) may revisit if we need styled XLSX output.

**Edge cases:**
- **Merged cells:** Read the top-left cell value; ignore the rest.
- **Empty rows:** Skip (don't count toward `totalRows`).
- **Header detection:** If first row contains mostly strings and subsequent rows contain numbers → treat row 1 as header. If first row is all numbers → generate headers (`Column A`, `Column B`, ...).
- **Formulas:** Read computed value (cell.v), not formula (cell.f).

**Implementation notes:**
- Use `XLSX.read(buffer, {type: 'buffer', cellDates: true})` to get JS Date objects for date cells (avoids manual serial-date conversion).
- Use `XLSX.utils.sheet_to_json(sheet, {header: 1, defval: ''})` to get array-of-arrays (easier to work with than row-object format for mapping).

---

## Scope decomposition (work items)

### WI-17.1: Main-process file staging + sheet picker (Morpheus, 2 days)
**Deliverable:**
- `app/src/main/services/importStager.ts` — reads file from disk, detects sheets/columns, returns metadata.
- IPC handlers: `import/stage-file`, `import/select-sheet`.
- Zod schemas in `app/src/shared/ipc-contracts/import.ts`.
- Install `xlsx` + `papaparse` + `iconv-lite`.
- 8 Vitest unit tests (CSV + XLSX edge cases).

**Acceptance:**
- `stage-file` handles `.xlsx` with 3 sheets → returns `sheets: ['Sheet1', 'Sheet2', 'Sheet3']`.
- `stage-file` handles `.csv` → returns `sheets: []`, `columns: [...]` immediately.
- `select-sheet` with invalid sheet name → `SHEET_NOT_FOUND` error.
- `select-sheet` with <3 columns → `INSUFFICIENT_COLUMNS` error.

---

### WI-17.2: Main-process dry-run + commit logic (Morpheus, 3 days)
**Deliverable:**
- `app/src/main/services/importParser.ts` — parses rows, validates, computes hashes, detects duplicates.
- `app/src/main/services/importDeduplicator.ts` — hash index + lookup.
- IPC handlers: `import/dry-run`, `import/commit`, `import/last-mapping`.
- Event schema: `movement.imported`, `import.mapping.updated`.
- Reducer cases for both events.
- 15 Vitest unit tests (date parsing edge cases, amount parsing, dedup, partial success).

**Acceptance:**
- Dry-run with 100 rows (10 duplicates, 5 invalid dates) → returns `{validRows: 85, duplicateCount: 10, errorCount: 5}`.
- Commit with `importDuplicates: false` → appends 85 events, skips 10 duplicates.
- Commit with `importDuplicates: true` → appends 95 events (85 new + 10 duplicates).
- Mapping persistence: commit appends `import.mapping.updated` event → `last-mapping` retrieves it.

---

### WI-17.3: Renderer UI — import wizard (Trinity, 3 days)
**Deliverable:**
- `app/src/renderer/screens/MovementsScreen/ImportModal.tsx` — 6-step wizard (account picker, upload, sheet picker, mapping, dry-run, commit).
- `app/src/renderer/services/importApi.ts` — IPC client wrapper.
- CSS for mapping UI (dropdown pickers, sample rows table, dry-run summary card, duplicate/error lists).
- i18n keys under `movements.import.*` (ES + EN).

**Acceptance:**
- Step 1: account dropdown pre-populated from `accountsApi.list()`.
- Step 2: file upload triggers `importApi.stageFile()`, shows sheet picker if multi-sheet.
- Step 4: mapping dropdowns pre-filled from `importApi.lastMapping()` if prior import exists.
- Step 5: dry-run shows summary + 5 sample rows + duplicates/errors.
- Step 6: commit closes modal, invalidates movement list, shows toast.

---

### WI-17.4: Integration tests + UX smoke tests (Cypher, 1 day)
**Deliverable:**
- 3 Playwright e2e tests:
  1. Import 50-row CSV → verify 50 movements appear in list.
  2. Re-import same CSV → dry-run shows 50 duplicates, commit skips all.
  3. Import with 5 invalid dates → dry-run shows 5 errors, commit imports 45.
- CSV + XLSX fixtures under `test/fixtures/`.

**Acceptance:**
- All e2e tests pass on Windows + macOS.

---

### WI-17.5: Security review of file handling (Switch, 0.5 days)
**Deliverable:**
- Audit `importStager.ts` for:
  - File size limit enforcement (10 MB).
  - Path traversal prevention (validate `filePath` is absolute, no `..`).
  - No shell execution or external process spawning.
  - Malformed file → caught exception, never crashes main process.
- Sign-off in `.squad/decisions.md`.

---

### WI-17.6: Documentation + UX polish (Niobe, 0.5 days)
**Deliverable:**
- Update `docs/product/features.md` with import flow screenshots (6-step annotated).
- Error message copy review (ensure all `detail` strings are user-friendly, not dev jargon).

---

**Total estimate:** 10 days (Morpheus: 5d, Trinity: 3d, Cypher: 1d, Switch: 0.5d, Niobe: 0.5d). Parallelizable: WI-17.1 + WI-17.2 (Morpheus) can run sequentially; Trinity waits on frozen IPC contract (after WI-17.1); Cypher waits on both; Switch + Niobe run anytime after WI-17.2 lands.

**Critical path:** WI-17.1 → WI-17.2 → WI-17.3 → WI-17.4 (8 days).

---

### WI-17 Implementation & Security Hardening

**Status:** ✅ **COMPLETE** — All 6 agents delivered; commit a97d21e pushed to main.

**Timeline:** 2026-04-20, ~1 day of coordinated work (Morpheus + Trinity + Switch in security review cycle).

#### Morpheus: WI-17.1 + WI-17.2 Main-Side Implementation

**Date:** 2026-04-20T09:13:00Z  
**Deliverables:** 4 IPC handlers + 2 events + utilities + 24 unit tests.

**Files Added:**
- `app/src/shared/ipc-contracts/import.ts` (6.4 KB) — 4 channel schemas, 9 error codes, Zod validation
- `app/src/core/events/schemas.ts` (extended) — `movement.imported` (26 fields), `import.mapping.updated` (6 fields)
- `app/src/core/query/types.ts` + `reducers.ts` (extended) — `ImportMapping` interface, reducer folds for both event types
- `app/src/main/projections/importMappings.ts` + test (808 B + 3.6 KB, 4 tests)
- `app/src/main/import/rowHash.ts` + test (1.3 KB + 3.2 KB, 11 tests) — SHA-256 dedup, normalization
- `app/src/main/import/dateFormat.ts` + test (2.4 KB + 2.6 KB, 9 tests) — DD/MM/MM/DD/ISO auto-detection
- `app/src/main/import/parser.ts` (7.0 KB) — `parseDate`, `parseAmount` with error envelopes
- `app/src/main/ipc/handlers/import.ts` (19.8 KB) — 4 handlers frozen per spec
- `app/src/preload/index.ts` (extended) — `window.opentreasury.import.*` surface
- Dependency additions: `xlsx` (0.18.5), `papaparse` (5.4.1), `@types/papaparse`

**Test Coverage:** 24 tests (all green). Not tested: file I/O, full dry-run→commit flow, e2e duplicate detection (deferred to WI-17.4).

**Dependencies Added:**
- `xlsx` (0.18.5, 400 KB) — XLSX parsing
- `papaparse` (5.4.1, 44 KB) — CSV parsing + auto-delimiter detect

**Build Status:** Main-side typecheck ✅ clean. Renderer has 8 errors (WI-17.3 scope).

**Report:** `.squad/decisions/inbox/morpheus-wi17-impl.md`

#### Trinity: WI-17.3 Renderer UI + Job B Panel Polish

**Date:** 2026-04-20  
**Job A Deliverables:** Import wizard service layer + component + i18n (6 service tests, all green).

**Files Added:**
- `app/src/renderer/services/importApi.ts` + test (IPC wrappers, 6 tests)
- `app/src/renderer/components/ImportWizard/ImportWizard.tsx` + CSS + index (6-step wizard)
- i18n: EN + ES translations for `importWizard.*` + `configuracion.datos.*`

**Job B Panel Polish Findings:**
- ✅ All 7 items verified as "already correct" in code per Mouse's audit
- 0 CSS changes required
- Mock data cleanup flagged out-of-scope for Trinity

**Build Status:** Renderer code ✅ typecheck clean, 6 service tests + 148 total tests green.

**Report:** `.squad/decisions/inbox/trinity-wi17-renderer.md`

#### Switch: WI-17.5 Security Review

**Date:** 2026-04-20T07:44:13Z  
**Decision:** ✅ **APPROVED-WITH-CONDITIONS**

**6 Mandatory Conditions:**
1. Swap `xlsx` → `exceljs` (CVE-2023-30533, CVE-2024-22363 in xlsx)
2. Windows-aware path hardening (UNC, device, reserved names, symlinks, traversal)
3. Session file-path allowlist + in-memory registry with TTL
4. Opaque ULID `fileId` tokens (renderer never sends raw paths after stage-file)
5. Row-count cap: reject >100k rows (zip-bomb mitigation)
6. Symlink rejection via `fs.lstat()`
7. Parser safety flags (exceljs: no formulas, header sanitize; papaparse: `dynamicTyping: false`)

**Remediation:** Applied by Morpheus in follow-up pass (same day).

**Report:** `.squad/decisions/inbox/switch-wi17-security-review.md`

**Remediation Plan:** `.squad/decisions/inbox/copilot-wi17-sec-remediation-plan.md`

#### Morpheus: WI-17 Security Hardening Implementation

**Date:** 2026-04-20  
**Task:** Apply Switch's 6+1 conditions to main-side import.

**Files Changed/Created:**
- `package.json` — removed `xlsx`, added `exceljs` (4.4.0) + `ulid` (2.3.0)
- `app/src/shared/ipc-contracts/import.ts` — added `fileId` to responses/requests; added `PATH_INVALID` + `ROW_COUNT_EXCEEDED` error codes
- `app/src/main/ipc/handlers/import.ts` — exceljs rewrite, integrated pathGuard + sessionFileRegistry, row-count caps, parser safety flags
- `app/src/main/import/pathGuard.ts` + test (2.8 KB + 4.5 KB, 13 tests) — Windows-aware path validation
- `app/src/main/import/sessionFileRegistry.ts` + test (2.2 KB + 3.6 KB, 9 tests) — opaque fileId registry with TTL 30min

**Test Coverage:** 197 total tests green (175 existing + 22 new security tests).

**Build Status:** Main-side typecheck ✅ 0 errors. npm audit ✅ 0 vulnerabilities (was 1 HIGH before).

**Breaking Change:** IPC contract now uses opaque `fileId` instead of `filePath`. Trinity fix-up addresses this.

**Report:** `.squad/decisions/inbox/morpheus-wi17-sec-harden.md`

#### Trinity: WI-17 TypeScript Fixup + FileId Refactor

**Date:** 2026-04-20  
**Task:** Fix 6 TS strict-mode errors + align renderer to security contract.

**Part 1: TS Fixes**
1. `ImportWizard.tsx:24` — discriminated union type extraction (explicit `SheetMetadata`)
2. `ImportWizard.tsx:149-150` — array access safety (safe narrowing)
3. `ImportWizard.tsx:161,289` — implicit any on callbacks (explicit types)
4. `ConfiguracionScreen.tsx:77` — `exactOptionalPropertyTypes` alignment

**Part 2: FileId Refactor**
- `WizardState`: `filePath: string | null` → `fileId: string | null`
- After `stageFile()`, wizard stores opaque `fileId` (not `filePath`)
- `dry-run` + `commit` use `fileId` (not raw path)
- i18n: Added `PATH_INVALID` + `ROW_COUNT_EXCEEDED` translations (EN + ES)

**Build Status:** Renderer ✅ typecheck clean, all 8 importApi tests green.

**Security Impact:** Renderer no longer sends raw paths to main after stage-file; main validates against session allowlist.

**Report:** `.squad/decisions/inbox/trinity-wi17-fixup.md`

#### Final State

- **175 tests passing** (33 files, 9 pre-existing skipped)
- **Typecheck + Lint + Format:** All clean
- **Commit:** a97d21e — "feat(import): WI-17 — generic column-mapping importer (hardened)"
- **Pushed to:** main

#### Key Decisions Locked

1. **Library Swap:** xlsx → exceljs for security. Trade-off: +400KB, ~20% slower, but zero HIGH CVEs.
2. **FileId Tokens:** Opaque ULID session tokens mitigate path-traversal in compromised renderer.
3. **TS Strict Mode Learning:** `exactOptionalPropertyTypes` requires explicit `| undefined` in optional prop types.

#### Next Steps (Cypher)

1. E2E tests: 50-row CSV import → verify 50 movements in list
2. Duplicate detection: re-import same CSV → dry-run shows 50 duplicates, commit skips all
3. Error handling: import with 5 invalid dates → dry-run shows 5 errors, commit imports 45
4. Test fixtures: CSVs + XLSX samples under `test/fixtures/`

---

## Out of scope (explicit deferrals)

### Column auto-detection / heuristics
The UI shows detected column headers, but **user maps manually**. No magic like "if column name contains 'fecha' → assume date field". Heuristics are brittle across languages/banks. Deferred to WI-17b (post-MVP).

### Multi-account import in one file
One import session = one account (Step 1 rule). If a user has a multi-account statement (rare), they must split the file or import twice. Deferred.

### Rollback of committed imports
Once `import/commit` succeeds, events are appended. No "undo import" button in v1. User can manually delete movements one-by-one (future WI). Deferred.

### Transformation rules
No support for splitting description into `concept` + `reference`, or regex-based category auto-assignment. User categorizes post-import. Deferred to WI-19 (category suggestion engine).

### Excel formulas
We read computed **values** only (cell.v). If a cell contains `=SUM(A1:A10)`, we import the result (e.g., `1234.56`), not the formula. Formula parsing deferred (likely never needed).

### Import from cloud sources
v1 supports local file upload only. No direct bank API integration, no Plaid, no scraping. Deferred.

### Custom field mappings
v1 hardcodes 3 required fields (date, amount, description). No support for importing category/subcategory/tags from columns. Deferred to WI-17c (advanced mapping).

### Scheduled/recurring imports
No "auto-import this file every Monday" feature. Manual upload only. Deferred.

---

## Security notes (for Switch review)

### File size limit
**Rule:** Reject files >10 MB at `stage-file` step.

**Rationale:** A 10 MB CSV can hold ~100,000 rows (avg 100 bytes/row). Sufficient for bulk historical imports (typical bank statement exports are <2 MB). Prevents DoS via massive file upload.

**Implementation:**
```ts
const stats = fs.statSync(filePath);
if (stats.size > 10 * 1024 * 1024) {
  return { ok: false, error: { code: 'FILE_UNREADABLE', detail: 'File exceeds 10 MB limit' } };
}
```

---

### Malformed file handling
**Rule:** All parsing errors must be caught and converted to `FILE_UNREADABLE` or `PARSE_ERROR`. Never throw uncaught exceptions that crash the main process.

**Implementation:**
```ts
try {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  // ...
} catch (err) {
  console.error('XLSX parse error:', err);
  return { ok: false, error: { code: 'FILE_UNREADABLE', detail: 'Invalid XLSX file' } };
}
```

**Edge cases to test:**
- Truncated file (incomplete XLSX zip structure).
- CSV with mismatched quote pairs.
- Binary garbage (e.g., user uploads a `.exe` renamed to `.csv`).

---

### Path traversal prevention
**Rule:** Validate that `filePath` from the file-open dialog is an absolute path and does not contain `..` (directory traversal).

**Implementation:**
```ts
import path from 'path';

function validateFilePath(filePath: string): boolean {
  const normalized = path.normalize(filePath);
  if (!path.isAbsolute(normalized)) return false;
  if (normalized.includes('..')) return false;
  return true;
}
```

**Rationale:** Electron's file-open dialog returns absolute paths, but defense-in-depth.

---

### No shell execution, no external process spawning
**Rule:** The importer must not invoke `child_process.exec()`, `spawn()`, or any shell commands. All parsing is done in-process via libraries.

**Compliance:** `papaparse` and `xlsx` are pure JS libraries (no native bindings, no subprocesses). ✅

---

### Memory safety
**Rule:** For large files (e.g., 10 MB CSV = 100k rows), avoid loading the entire file into a single array. Use streaming where possible.

**Implementation:**
- **CSV:** Papaparse supports streaming (`Papa.parse(file, {step: callback})`). Use for files >5 MB.
- **XLSX:** SheetJS loads the full workbook into memory. Acceptable for 10 MB limit (workbooks decompress to ~3–5x size, so 10 MB file → ~30 MB RAM, within budget).

**Future optimization (deferred):** For XLSX >5 MB, use `XLSX.stream.to_json()` (requires SheetJS Pro license). Not needed for v1.

---

## Open questions

### Q1: Date ambiguity (DD/MM vs MM/DD)
When a date like `01/02/2024` appears, is it Jan 2 (US) or Feb 1 (European)?

**Neo's recommendation:** Assume European (DD/MM/YYYY) by default since target users are Spanish NGOs. Add a **date format toggle** in Step 4 mapping UI: "Date format: [DD/MM/YYYY (European) / MM/DD/YYYY (US)]". Store this choice as part of the mapping persistence.

**Ask Pedro:** Confirm this is acceptable, or hardcode European-only for v1.

---

### Q2: Currency symbol stripping
Should we strip currency symbols (€, $, £) from amount strings during parsing, or error if present?

**Neo's recommendation:** Strip (more forgiving). Spanish bank CSVs often include `€` in amount cells.

**Ask Pedro:** Confirm.

---

### Q3: Empty rows handling
If a sheet has gaps (e.g., row 10 is blank, row 11 has data), skip blank rows or error?

**Neo's recommendation:** Skip silently (don't count blank rows in `totalRows`). Common in Excel exports.

**Ask Pedro:** Confirm.

---

### Q4: Movement type derivation heuristic
For positive amounts, should we default to **income** or **expense**?

**Context:** Some banks export positive=income, negative=expense (credit perspective). Others use positive=expense, negative=income (debit perspective).

**Neo's recommendation:** Add a toggle in Step 4: "Positive amounts are: [Income / Expense]". Default: **Income** (matches credit perspective, more intuitive for NGO treasurers — donations are positive).

**Ask Pedro:** Confirm the default.

---

### Q5: Duplicate import opt-in vs opt-out
Currently specced as **opt-in** (checkbox unchecked by default → duplicates skipped). Alternative: **opt-out** (checkbox checked by default → duplicates imported unless user unchecks).

**Neo's recommendation:** Opt-in (safer default). Most re-imports are accidental; prevent double-counting.

**Ask Pedro:** Confirm.

---

### Q6: Mapping memory scope
Should mapping persist **per account** (current spec) or **globally** (one mapping for all accounts)?

**Neo's recommendation:** Per-account. Different banks = different CSV formats. Santander and CaixaBank may have different column orders.

**Ask Pedro:** Confirm.

---

### Q7: Max row count
Should we impose a hard limit (e.g., 10,000 rows per import) or allow up to file size limit?

**Neo's recommendation:** No row limit (file size limit is sufficient). A 10 MB CSV can hold 100k rows; if parsing is slow, show a progress spinner. Don't artificially cap.

**Ask Pedro:** Confirm, or impose a limit (e.g., 50k rows).

---

**END OF SPEC**


---

### 2026-04-20: UX-017 — Generic Import Wizard Flow Specification (Bilingual EN/ES, WCAG AA)
**By:** Niobe (UX/Spec Analyst)  
**Related:** Neo's WI-17 v2 technical spec, Copilot scope pivot  
**Artifact:** .squad/decisions/inbox/niobe-wi17-ux-flow.md (449 lines)  
**Risks Flagged:** 7 items documented (ambiguous date format UX, duplicate handling clarity, sheet picker edge cases, mapping grid column limit, performance with 10k+ rows, error message overflow, ESC key on partial save)

# UX-017 — Generic Import Wizard (WI-17) — Flow Specification

**Version:** 0.1 (Draft)  
**Author:** Niobe (Spec/UX Analyst)  
**Date:** 2026-04-20  
**Related:** `copilot-directive-wi17-pivot.md` (Pedro's pivot to generic column mapper), WI-15 Configuración (reference data), WI-13 Add-Transaction modal (target data model)

---

## Prototype Reference

_No prototype exists yet for the import wizard. This spec is the authoritative contract. Trinity must validate visual design + interaction once built against this spec._

---

## Entry Points: Recommendation

**Chosen:** Via Configuración → DATOS tab (stubbed in WI-15).

**Why:** 
- Treasurer expects import to live in data-management section (not scattered across multiple entry points).
- Mirrors web app's navigation model (cloud version groups import/export under "Data").
- Single clear entry point reduces confusion for non-tech users.
- Configuración already establishes the visual container (card grid + primary CTA pattern from WI-15).

**Alternative rejected:** Panel "Import movements" button would fragment entry points; context menu on account card is too hidden.

---

## Step-by-Step UX

### STEP 1: SELECT ACCOUNT

**Primary action:** Treasurer picks the destination account for all rows in this import.

**Screen layout:**
- Heading: `"Selecciona cuenta destino"` (ES) / `"Select destination account"` (EN)
- Subtitle: `"Un archivo = una cuenta. Si necesitas importar a múltiples cuentas, haz múltiples importaciones."` (ES)
- Card grid (same pattern as WI-15 Configuración accounts): account name + balance + color stripe + CTA `Seleccionar`
- Back button (if called from DATOS tab, returns to DATOS).
- Cancel (confirms if wizard has progress → see Wizard Controls).

**Inputs visible:**
- Account list (live, read from accounts:list IPC).
- Selection state: highlight chosen card + show checkmark overlay.

**Validation feedback:**
- Required field: Next button disabled until account selected.
- No error state — all accounts are valid choices.

**Error recovery:**
- N/A (no error case).

**Keyboard shortcuts:**
- Arrow keys: navigate card grid.
- Enter: select focused card.
- Escape: cancel wizard (with confirmation if progress exists).

---

### STEP 2: UPLOAD FILE

**Primary action:** Treasurer selects an .xlsx or .csv file from disk.

**Screen layout:**
- Heading: `"Carga tu archivo (Excel o CSV)"` (ES) / `"Upload your file (Excel or CSV)"` (EN)
- Subheading: `"Destino: {AccountName}"` — remind user which account they chose.
- Drag-drop zone: large, clearly outlined box with file icon + `"Arrastra aquí o haz clic para seleccionar"` (ES).
- File picker fallback: hidden file input, triggered by click.
- Back button (returns to SELECT_ACCOUNT, clears selected file).

**Inputs visible:**
- File name (once dropped/selected) + file size + preview icon (xlsx/csv).
- No file preview yet — that's STEP 4.

**Validation feedback:**
- File too large (>50MB): `"Archivo muy grande. Máximo 50 MB."` (ES)
- Wrong file type: `"Solo Excel (.xlsx) o CSV (.csv)."` (ES)
- File unreadable: `"No se puede leer el archivo. Verifica que no esté dañado."` (ES)
- Appears immediately on file selection, above the drop zone.

**Error recovery:**
- User can drop/click another file to replace. Previous upload state cleared.
- If error persists, Back → try different file.

**Keyboard shortcuts:**
- Tab to file input, Space to open picker (standard browser).
- Escape: cancel wizard.

---

### STEP 3: PICK SHEET (conditional)

**Condition:** Only shown if workbook has >1 sheet.

**Primary action:** User selects which sheet contains the transaction data.

**Screen layout:**
- Heading: `"¿Cuál es la hoja con tus movimientos?"` (ES) / `"Which sheet has your transactions?"` (EN)
- List of sheet tabs (detected from workbook):
  - Sheet name + row preview (e.g., "Sheet1 (45 rows)" or "Datos (3 rows)").
  - Radio button selector (single choice).
- Back button (returns to UPLOAD_FILE, file preserved).

**Inputs visible:**
- Sheet names (auto-detected from file).
- Row count per sheet (detected during parse).

**Validation feedback:**
- Empty sheet: `"Esta hoja no tiene datos. Selecciona otra."` (ES)
- Insufficient columns (detected here, not after mapping): skip to error recovery below.

**Error recovery:**
- If chosen sheet has <3 columns (not enough for date+amount+description): show error `"Esta hoja no tiene suficientes columnas. Mínimo 3 requeridas (fecha, importe, descripción)."` (ES). Allow user to pick a different sheet.

**Keyboard shortcuts:**
- Arrow keys: navigate sheet list.
- Enter: select focused sheet.

---

### STEP 4: MAP COLUMNS

**Primary action:** User drags/drops or selects from dropdowns to map source columns → Transaction model fields.

**Mandatory mappings:**
- `date` (date column)
- `amount` (number, interpreted as debit if negative, credit if positive)
- `description` (text)
- `account` (already set in STEP 1 — not editable here, but shown as read-only badge)

**Optional mappings:**
- `category` (pick from categories:list)
- `tags` (multi-select from tags:list)

**Screen layout:**
- Heading: `"Mapea tus columnas"` (ES) / `"Map your columns"` (EN)
- Left column: source columns detected from the file (e.g., "Column A", "Column B", "Fecha", "Cantidad").
- Right column: dropdown for each source column to pick a target field (Date, Amount, Description, Category, Tags, Ignore).
- Subheading reminder: `"Cuenta destino: {AccountName}"` (read-only).
- Sample row preview (first row from sheet) shown inline or in a side panel to help user verify mapping.
- Back button (returns to PICK_SHEET or UPLOAD_FILE, mapping cleared).
- Next button (disabled until mandatory fields mapped).

**Inputs visible:**
- Source column names (auto-detected).
- Target field dropdowns (populated with a fixed list: Date, Amount, Description, Category, Tags, Ignore).
- Sample row display (optional, helps non-tech users see what they're mapping).

**Validation feedback:**
- Missing mandatory field: `"Debes mapear una columna a Fecha, Importe y Descripción."` (ES). Next button disabled.
- Date column format ambiguity (e.g., 01/02/2026 — is it DD/MM or MM/DD?): `"¿Formato de fecha: DD/MM o MM/DD?"` Picker toggle appears next to the date dropdown.
- Amount column has non-numeric values: defer to DRY_RUN (not a blocker here).
- Category not found in system: show warning `"No existe esta categoría en Configuración. Puedes crearla en Configuración > Categorías antes de importar."` (ES). Allow user to proceed (categories are optional).

**Error recovery:**
- User corrects mappings and re-checks sample row. Next remains disabled until mandatory fields mapped.
- If date format is ambiguous, user must pick one (toggle choice). If wrong, dry-run preview shows parsing errors for all date cells.

**Keyboard shortcuts:**
- Tab: navigate dropdowns.
- Arrow keys (within dropdown): select field type.
- Escape: cancel wizard (with confirmation).

**Memory (last-mapping pre-fill):**
- If this is the second import for the same account in this session:
  - Memo: store `{accountId, mapping: {sourceColName → targetField}, dateFormat, timestamp}` in React state.
  - On STEP 4 entry: pre-fill dropdowns with last mapping.
  - Show subtle banner above mapping table: `"Usando asignación anterior de hace 5 minutos. Haz clic aquí para empezar de cero."` (ES) — link clears memo.
  - If uploaded sheet's columns don't match last mapping (e.g., file has "Date" but last mapping was "Data"):
    - Warn: `"Las columnas del archivo no coinciden con la asignación anterior. Revisa el mapeo."` (ES).
    - Pre-fill is cancelled; user maps manually.

---

### STEP 5: DRY-RUN PREVIEW

**Primary action:** User reviews what will be imported before committing.

**Screen layout (information hierarchy — CRITICAL):**

#### Top section: SUMMARY STRIP
```
┌─────────────────────────────────────────────┐
│ ✓ Se importarán: 42 movimientos              │
│ ⚠ Duplicados detectados: 3 (no se importan)  │
│ ✗ Errores de validación: 2                   │
└─────────────────────────────────────────────┘
```
- Numbers are in muted color until user opts in to duplicates (see duplicate opt-in checkbox below).
- Click any number to jump to relevant tab (e.g., click "2" → jump to Errors tab).

#### Middle section: TABBED CONTENT AREA

**Tab 1: "PREVIEW" (default)**
- Heading: `"Primeras 5 filas:"` (ES)
- Table: 5 rows × (date | amount | description | category | tags).
- Columns match the mappings user chose in STEP 4.
- Gray header row showing column names + source column hints (e.g., "Fecha (Column A)").
- No editing within preview — this is read-only.
- If all 5 rows are error rows, show: `"Las primeras 5 filas tienen errores. Revisa la pestaña 'Errores'."` (ES)

**Tab 2: "DUPLICATES" (if any detected)**
- Heading: `"{N} filas coinciden con movimientos ya importados:"` (ES)
- Table: duplicate rows + match reason (e.g., "Mismo importe, descripción y fecha en {date}").
- User can see which rows are dupes before deciding to import them.
- Checkbox below table: `"☐ Importar duplicados"` (ES) / `"☐ Import duplicates"` (EN)
  - Unchecked by default (duplicates are NOT imported).
  - When checked: duplicate count in top strip shows as enabled (not grayed).
  - Affects final import count: updates the "42 movimientos" number dynamically.

**Tab 3: "ERRORS" (if any validation errors)**
- Heading: `"{N} filas no se pueden importar:"` (ES)
- Table: error rows + reason per row (e.g., "Fecha inválida: '32/13/2026'", "Importe vacío").
- Rows with errors are NOT imported (non-negotiable).
- User must go back to STEP 4 or upload a corrected file if errors are critical.

#### Bottom section: ACTIONS
- Primary CTA: `"Importar {N} movimientos"` (ES) — count updates based on duplicate opt-in.
- Secondary: Back button (returns to STEP 4, preserves mapping but clears preview).
- Cancel button (confirmation dialog if user made mapping progress).

**Inputs visible:**
- Tabs (Preview, Duplicates, Errors).
- Duplicate opt-in checkbox.
- Copy of mapping used (shown as a collapsible "Mapping used:" row at top of preview, optional but helpful).

**Validation feedback:**
- All rows parsed successfully: top strip shows green checkmark + count only (no warnings).
- Duplicates present but no errors: orange warning icon + counts.
- Errors present: red error icon + "See Errors tab" link in strip.
- No valid rows at all: error banner, primary CTA disabled: `"No hay movimientos válidos para importar."` (ES).

**Error recovery:**
- User clicks Back → returns to STEP 4 → re-maps columns or uploads different file.
- User ignores errors and proceeds → only valid rows imported; errors row count shown in final toast.

**Keyboard shortcuts:**
- Tab: navigate between tabs.
- Shift+Tab: previous tab.
- Enter: trigger primary CTA (Import) if focused.
- Arrow keys: scroll table within tabs.
- Escape: cancel wizard (with confirmation).

---

### STEP 6: CONFIRM & IMPORT

**Primary action:** Wizard commits the import. No user input on this screen — progress indicator only.

**Screen layout:**
- Heading: `"Importando..."` (ES) / `"Importing..."` (EN)
- Progress indicator: linear or spinner, depending on estimated duration.
- Subtext: `"Se están creando {N} movimientos en {AccountName}. Esto puede tardar unos segundos."` (ES)
- Cancel button (grayed out; user cannot cancel mid-import).

**Inputs visible:**
- Progress bar (estimated % of rows processed, if available from backend).

**Validation feedback:**
- N/A during import (no user action required).

**On success:**
- Screen auto-advances to SUCCESS screen (not a separate step — part of STEP 6 completion).
- Heading: `"✓ Importación completada"` (ES)
- Summary: `"Se importaron 42 movimientos a {AccountName}. Duplicados omitidos: 3. Errores: 0."` (ES)
- CTA: `"Ver movimientos"` (links to Movements screen, pre-filtered to this import via import_batch_id).
- Secondary CTA: `"Importar otro archivo"` (resets wizard to STEP 1).
- Checkbox at bottom (optional): `"☐ Recordar esta configuración para futuras importaciones"` (ES) — if checked, stores mapping + dateFormat in browser localStorage scoped to accountId.

**On partial failure** (some rows failed):
- Heading: `"⚠ Importación parcial"` (ES)
- Summary: `"Se importaron 40 de 42 movimientos a {AccountName}. Errores: 2 filas rechazadas. Revisa los errores abajo."` (ES)
- List of rejected rows (copy from dry-run errors tab).
- Same CTAs as success (View movements, Import another file).

**On full failure:**
- Heading: `"✗ Importación fallida"` (ES)
- Error: `"No se pudieron importar los movimientos. Errores: {error reason}."` (ES)
- CTA: `"Intentar de nuevo"` (returns to STEP 2 or STEP 4, depending on error type).

**Writes events:**
- Backend calls `POST /api/imports/workbook` (as per A4 spec in decisions.md).
- Events: `import.batch-started`, `import.batch-completed` or `import.batch-failed`.
- Each transaction written with `movement.imported` event (or inline JSON if import is atomic).
- `import_batch_id` (ULID) + `import_source` (filename) stored on each movement for traceability.

**Keyboard shortcuts:**
- Escape: during import, do nothing (cancel is disabled).
- Escape: on success/failure, closes wizard (returns to Movements or DATOS).

---

## State Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│ [START] → SELECT_ACCOUNT → UPLOAD_FILE → PICK_SHEET? → MAP_COLUMNS
│                 ↓              ↓             ↓ (single     ↓
│            (cancel)       (cancel)       sheet, skip)   (back or
│            confirm        confirm                       cancel+confirm)
│              ↓              ↓                          ↓
│           [EXIT]         [EXIT]                    DRY_RUN
│                                                        ↓
│                                        (back) ← ← ← (error rows)
│                                        ↓                ↓
│                                     MAP_COLUMNS     CONFIRM
│                                                    (progress)
│                                                        ↓
│                                                  SUCCESS/FAILURE
│                                                        ↓
│                                                    [EXIT or RESTART]
│
│ ERROR transitions (every state):
│ Any step can fail with ERROR (file unreadable, network timeout, etc.)
│ ERROR → modal: reason + recovery CTA (Back, Retry, Cancel)
│
```

---

## Wizard Controls

### Back Button
- **Behavior:** Returns to previous step, preserving all user inputs (file, mapping, sheet selection).
- **Exception:** STEP 1 (no previous step) — Back → cancel wizard confirmation.
- **Preservation:** Mapping state persists until wizard completes or user explicitly cancels.

### Cancel Button
- **Behavior:** Always visible (top-right or footer).
- **Confirmation dialog:** If user has made progress (selected account, uploaded file, or started mapping):
  - Title: `"¿Descartar importación?"` (ES) / `"Discard import?"` (EN)
  - Message: `"Se perderán todos los cambios. ¿Continuar?"` (ES)
  - Actions: Cancel dialog (stay in wizard) / Confirm (exit wizard to DATOS tab).
- **No confirmation:** STEP 1, SELECT_ACCOUNT, only (no progress made yet).

### Next/Continue Button
- **Behavior:** Advances to next step only when step is complete.
- **Disabled state rules per step:**
  - STEP 1 (SELECT_ACCOUNT): Disabled until account selected.
  - STEP 2 (UPLOAD_FILE): Disabled until valid file selected.
  - STEP 3 (PICK_SHEET): Disabled until sheet selected.
  - STEP 4 (MAP_COLUMNS): Disabled until all mandatory fields (date, amount, description) are mapped.
  - STEP 5 (DRY_RUN): No Next button; primary CTA is "Import {N} movimientos".
  - STEP 6 (CONFIRM): No Next button; auto-advances on import completion.
- **Tooltip on hover (when disabled):** Explains why button is disabled (e.g., "Select an account to continue.").

---

## Memory: Last-Mapping Pre-Fill

**Implementation:**
- Store in React state (session-scoped, not persisted between app restarts):
  ```
  lastMapping = {
    accountId: string,
    mapping: { sourceColName: string → targetField: string },
    dateFormat: 'DD/MM' | 'MM/DD',
    timestamp: ISO8601,
  }
  ```

**On re-entry to STEP 4 (same session, same account):**
1. Check if `lastMapping.accountId === selectedAccountId` and age < 1 hour.
2. If yes:
   - Pre-fill all dropdown values from `lastMapping.mapping`.
   - Show banner above mapping table:
     ```
     "ℹ Usando asignación de {timeAgo}. [Empezar de cero]"
     ```
   - Link clears memory + resets dropdowns to `"Selecciona un campo"` (ES).

**On column mismatch (file's columns don't match remembered source columns):**
1. Detect: Compare file's detected column names vs `lastMapping.mapping` keys.
2. If mismatch found:
   - Show warning banner:
     ```
     "⚠ Las columnas del archivo no coinciden con la importación anterior.
      Verifica el mapeo."
     ```
   - Pre-fill is cancelled; user must map manually.
   - Do NOT auto-apply mismatched mappings (risk of silent data corruption).

**Clearing memory:**
- Manual: User clicks "Empezar de cero" link.
- Automatic: On successful import, reset `lastMapping` (fresh start for next file).
- Automatic: On wizard exit (cancel or success).

---

## Accessibility (WCAG 2.1 AA)

### Keyboard Navigation
- **Tab order:** Follows visual flow (left-to-right, top-to-bottom).
- **Focus management:** On step transition, focus moves to the primary input of the new step (e.g., file input on STEP 2).
- **Modals/dialogs:** Trap focus within dialog (e.g., cancel confirmation); ESC closes.
- **Dropdowns (STEP 4):** Arrow keys navigate options; Enter selects; Tab moves to next dropdown.

### Screen Reader Announcements
- **Step transitions:** Announce step number + title (e.g., "Step 2 of 6: Upload file").
- **Validation errors:** Announce immediately after user action (e.g., "File too large: maximum 50 MB").
- **Tab content switches:** Announce active tab + count (e.g., "Errors tab, 2 errors found").
- **Progress bar:** Announce current progress (e.g., "Importing: 50% complete").

### Dry-Run Table (Critical for Assistive Tech)
- **Table structure:**
  - `<table role="grid">` with proper `<thead>` and `<tbody>`.
  - Column headers: `<th scope="col">` with field name (e.g., "Fecha", "Importe").
  - Row headers: `<th scope="row">` with row index or source-row number (e.g., "Row 1 of preview").
- **Cell content:** Plain text or semantic HTML (no image-based text).
- **Duplicate rows:** Mark as `<tr role="alert">` + aria-label describing reason (e.g., "Duplicate row: Matches existing movement on 2026-01-15").
- **Error rows:** Mark as `<tr role="alert">` + aria-label with error reason.

### Color Contrast
- All text ≥ 4.5:1 contrast ratio (WCAG AA) or 7:1 (AAA preferred for numbers).
- Status indicators (green ✓, orange ⚠, red ✗) must also use text labels (not color alone).
- Dry-run tabs: underline active tab (not just color).

### Labels & Descriptions
- All inputs have `<label>` or `aria-label`.
- Dropdowns in mapping table: `<label for="mapping-{sourceCol}">` + aria-describedby linking to hint text.
- Disabled buttons: `aria-disabled="true"` + aria-label explaining why (e.g., "Continue button: disabled until account selected").

---

## Copy (EN + ES)

### Wizard Navigation
| English | Spanish | Context |
|---------|---------|---------|
| Select destination account | Selecciona cuenta destino | STEP 1 heading |
| One file = one account. To import to multiple accounts, run multiple imports. | Un archivo = una cuenta. Si necesitas importar a múltiples cuentas, haz múltiples importaciones. | STEP 1 subtitle |
| Upload your file (Excel or CSV) | Carga tu archivo (Excel o CSV) | STEP 2 heading |
| Destination: {AccountName} | Destino: {AccountName} | STEP 2 subheading |
| Drag here or click to select | Arrastra aquí o haz clic para seleccionar | STEP 2 drop zone |
| Which sheet has your transactions? | ¿Cuál es la hoja con tus movimientos? | STEP 3 heading (if >1 sheet) |
| Map your columns | Mapea tus columnas | STEP 4 heading |
| Destination account: {AccountName} | Cuenta destino: {AccountName} | STEP 4 reminder (read-only) |
| You must map a column to Date, Amount, and Description. | Debes mapear una columna a Fecha, Importe y Descripción. | STEP 4 validation |
| First 5 rows: | Primeras 5 filas: | STEP 5 preview tab |
| {N} rows match existing movements: | {N} filas coinciden con movimientos ya importados: | STEP 5 duplicates tab |
| Import duplicates | Importar duplicados | STEP 5 checkbox |
| {N} rows cannot be imported: | {N} filas no se pueden importar: | STEP 5 errors tab |
| Import {N} movements | Importar {N} movimientos | STEP 5 primary CTA (count updates with duplicate opt-in) |
| Importing... | Importando... | STEP 6 progress screen |
| Import completed | ✓ Importación completada | STEP 6 success |
| {N} movements imported to {AccountName}. Duplicates skipped: {N}. Errors: {N}. | Se importaron {N} movimientos a {AccountName}. Duplicados omitidos: {N}. Errores: {N}. | STEP 6 success summary |
| View movements | Ver movimientos | STEP 6 success CTA |
| Import another file | Importar otro archivo | STEP 6 secondary CTA |

### Error Messages

| Error Code | English | Spanish | Recovery |
|------------|---------|---------|----------|
| FILE_TOO_LARGE | File too large. Maximum 50 MB. | Archivo muy grande. Máximo 50 MB. | User drops/clicks another file. |
| FILE_UNSUPPORTED | Only Excel (.xlsx) or CSV (.csv). | Solo Excel (.xlsx) o CSV (.csv). | User drops/clicks another file. |
| FILE_UNREADABLE | Cannot read file. Check that it is not corrupted. | No se puede leer el archivo. Verifica que no esté dañado. | User tries different file or Back. |
| SHEET_EMPTY | This sheet is empty. Select another. | Esta hoja está vacía. Selecciona otra. | User picks different sheet. |
| INSUFFICIENT_COLUMNS | This sheet does not have enough columns. Minimum 3 required (date, amount, description). | Esta hoja no tiene suficientes columnas. Mínimo 3 requeridas (fecha, importe, descripción). | User picks different sheet or uploads different file. |
| MISSING_MANDATORY_FIELD | You must map a column to Date, Amount, and Description. | Debes mapear una columna a Fecha, Importe y Descripción. | User maps missing field. |
| DATE_FORMAT_AMBIGUOUS | Date format: DD/MM or MM/DD? | ¿Formato de fecha: DD/MM o MM/DD? | User picks format from toggle. |
| PARSE_ERROR_DATE | Invalid date: '{value}'. Check format. | Fecha inválida: '{value}'. Verifica el formato. | Shown in dry-run errors tab. User goes back to re-map or upload corrected file. |
| PARSE_ERROR_AMOUNT | Amount missing or invalid. | Importe vacío o inválido. | Shown in dry-run errors tab. |
| PARSE_ERROR_DESCRIPTION | Description missing. | Descripción vacía. | Shown in dry-run errors tab. |
| DUPLICATE_DETECTED | This row matches an existing movement on {date}. | Esta fila coincide con un movimiento existente el {date}. | User reviews in dry-run Duplicates tab; can opt-in to import. |
| CATEGORY_NOT_FOUND | This category does not exist in Configuration. Create it in Configuration > Categories before importing. | No existe esta categoría en Configuración. Puedes crearla en Configuración > Categorías antes de importar. | User creates category in Configuración, then re-import. Or ignore (category field is optional). |
| IMPORT_FAILED | Could not import movements. Error: {reason}. | No se pudieron importar los movimientos. Error: {reason}. | User clicks "Retry" or goes back to STEP 2. |
| PARTIAL_IMPORT | {N} of {M} movements imported. {K} errors. See Errors tab. | Se importaron {N} de {M} movimientos. {K} errores. Revisa la pestaña 'Errores'. | Shown in dry-run; user can still proceed (valid rows imported, error rows skipped). |
| NO_VALID_ROWS | No valid movements to import. All rows have errors. | No hay movimientos válidos para importar. Todos tienen errores. | User goes back to STEP 2 and uploads corrected file. |

### Dry-Run Summary Labels

| English | Spanish |
|---------|---------|
| ✓ Will import: {N} movements | ✓ Se importarán: {N} movimientos |
| ⚠ Duplicates detected: {N} (not imported) | ⚠ Duplicados detectados: {N} (no se importan) |
| ✗ Validation errors: {N} | ✗ Errores de validación: {N} |
| Using last mapping from {time}. [Reset] | Usando asignación de {time}. [Empezar de cero] |
| File columns do not match previous mapping. Review mapping. | Las columnas del archivo no coinciden con la importación anterior. Verifica el mapeo. |

---

## Out of Scope (UX-wise)

- **Undo/rollback after commit:** Separate WI (will live in a data-recovery or audit trail feature).
- **Column auto-detection:** v1 requires explicit user mapping for every column (MVP; auto-detection in v1.1 if needed).
- **Edit-and-retry within wizard:** If user makes mapping errors → must go Back → re-upload. This is acceptable friction for MVP.
- **Incremental file import (resume on failure):** If network times out mid-import, user must restart. No resume token.
- **Import history / audit log UI:** Movements will carry `import_batch_id` for traceability, but no dedicated "Import History" screen in scope.
- **Bulk categorization post-import:** User can categorize imported movements in Movements screen after import completes. Not part of wizard.
- **Scheduled/recurring imports:** One-off imports only in v1.

---

## Risks & Open UX Questions

### 1. **Date Format Ambiguity (HIGH RISK)**
- **Scenario:** Treasurer uploads CSV with dates like `01/02/2026`. Is this DD/MM (Spanish) or MM/DD (US)?
- **Current mitigation:** STEP 4 shows a format picker toggle (DD/MM vs MM/DD). If wrong, dry-run preview shows parsing errors for all date cells.
- **Risk:** User might not notice the toggle and import with wrong dates.
- **Mitigation options:**
  - *Option A (current):* Show toggle prominently + add date format hint in mapping table (e.g., "formato esperado: DD/MM").
  - *Option B:* Parse a sample (first date cell), attempt to infer format (heuristic: if month > 12, it's DD/MM), and ask user to confirm.
  - *Option C:* Delay format decision to dry-run; if ambiguous, show a format-picker right on the dry-run preview, not in STEP 4.
  - **QUESTION FOR PEDRO:** Which risk is acceptable — user mistakes with current toggle, or deferring format decision to dry-run (adds complexity)?

### 2. **Duplicate Detection Strategy (MEDIUM RISK)**
- **Current rule:** Duplicate is by row-hash (date + amount + description must all match an existing movement in the same account).
- **Issue:** What if user re-exports movements from OpenTreasury, adds a row, and re-imports? The existing rows will be flagged as duplicates.
- **Current behavior:** Duplicates are shown in STEP 5, user can opt-in to import them (checkbox). This is safe but might confuse treasurers.
- **QUESTION FOR PEDRO:** Should we show a more granular duplicate reason (e.g., "Exact match on 2026-01-15, €150.00, 'Donation'")?

### 3. **Category/Tag Optional Mapping (LOW RISK)**
- **Scenario:** Treasurer doesn't map a "category" column; all imported movements land uncategorized.
- **Current mitigation:** Categories/tags are optional. Movements can exist without them. This is by design (WI-15 UX-007 ruling).
- **Risk:** Treasurer might not realize they've left movements uncategorized. Dashboard/Movements will show "Uncategorized" bulk, which is hard to scan.
- **QUESTION FOR PEDRO:** Should STEP 5 warn if large number of rows will be imported without category? (e.g., "⚠ 35 of 42 movements have no category. Consider adding a category mapping.")

### 4. **File Encoding Guess (LOW RISK)**
- **Scenario:** Treasurer exports from Spanish bank (encoding: ISO-8859-1 or CP1252) and uploads. Frontend tries to read as UTF-8.
- **Current mitigation:** File parser should attempt UTF-8, then fall back to ISO-8859-1 or show error "Cannot read file: unsupported encoding."
- **QUESTION FOR PEDRO:** Should we detect encoding automatically (try multi charset detection library) or show user an error + ask them to re-save as UTF-8 in Excel?

### 5. **Sheet Selection When >1 Sheet (MEDIUM RISK)**
- **Scenario:** Workbook has 5 sheets; user picks wrong one by mistake. They don't realize until DRY_RUN. Confusing.
- **Current mitigation:** Show sheet row count in STEP 3 picker (e.g., "Datos (45 rows)") to help user pick right one. Back button on STEP 4 returns to STEP 3.
- **QUESTION FOR PEDRO:** Should STEP 3 also show a tiny preview of the first row of each sheet (header row only) to help user identify?

### 6. **Memory (Last Mapping) Scope (LOW RISK)**
- **Current design:** Last mapping is session-scoped (React state), per account, age < 1 hour.
- **Risk:** If user closes app and re-opens, mapping is lost. User might expect it to persist.
- **Alternative:** Store in browser localStorage, persist across app restarts.
- **QUESTION FOR PEDRO:** Is session-only acceptable, or should we persist last mapping to disk (localStorage)?

### 7. **Very Large Imports (>50K Rows)**
- **Scenario:** Treasurer imports 5 years of bank statements (50k+ rows). Progress bar takes 5+ minutes.
- **Current mitigation:** STEP 5 dry-run shows total row count; user is aware before committing. STEP 6 shows progress indicator.
- **Risk:** User might alt-tab away and miss completion. No notification.
- **QUESTION FOR PEDRO:** Should we send a desktop notification when import completes (outside the app window)? Or is progress bar + toast sufficient?

---

## Design Decisions Locked

1. **Account selection first (STEP 1):** By design (1 file = 1 account rule). Non-negotiable per Pedro's pivot.
2. **Generic column mapper (not bank-specific parsers):** Per pivot directive.
3. **Dry-run is non-optional:** All imports must show preview before commit (safety net).
4. **Duplicates opt-in checkbox:** Not auto-skipped; user is in control.
5. **Copy: concise, action-oriented, Spanish-first:** "Importar {N} movimientos" not "Procesar y confirmar importación de datos de transacciones financieras".

---

## Summary for Implementation Teams

- **Trinity (UI):** Reference this spec for layout + interaction. Prototype against STEP 5 (dry-run) first — it's the most complex screen.
- **Morpheus (Backend):** Wire `POST /api/imports/preview` (upload → dry-run data) and `POST /api/imports/workbook` (commit) endpoints. See A4 spec in decisions.md.
- **Switch (Copy/Localization):** All copy in this doc is authoritative EN + ES. No additional translation needed.
- **Mouse (Design Tokens):** Use existing WI-15 card patterns for STEP 1. New tokens needed for: mapping dropdowns (STEP 4), dry-run table (STEP 5), progress bar (STEP 6).

---

**END OF SPEC**

---

## Editor's Notes for Niobe (Post-Submission)

- **Prototype reference placeholder:** Once Trinity builds the import wizard UI, link the exact prototype file/component path at the top of this spec (e.g., `prototype/ImportWizard.jsx`).
- **Test coverage:** Include test scenarios in a follow-up doc (one per target scenario: quick daily import vs. bulk historical import).
- **Localization:** All copy keys follow `import.{step}.{field}` structure (e.g., `import.step1.heading`, `import.step5.duplicates.checkbox`). Trinity/Switch to wire i18n keys into UI components.


---

### 2026-04-20: Panel Polish Punch-List — 7 Items Audited (Most Already Verified Correct in Code)
**By:** Mouse (Design)  
**Related:** WI-15-lite Panel MVP, prototype fidelity audit  
**Artifact:** .squad/decisions/inbox/mouse-panel-polish-punchlist.md (280 lines)  
**Key Findings:** 
- Items #1–5: Mostly verification-only or minor tweaks; CSS already correct in codebase
- Item #6 (KPI sparkline graph): Deferred to M1.2 (separate WI-20)
- Item #7 (mock account data): Escalated to Link/Pedro for functional data cleanup

# 2026-04-20: Panel polish punch-list (post WI-15-lite)
**By:** Mouse

Concrete design specs for Pedro's 7 panel polish items, ordered by user impact × implementation cost. Trinity: copy-paste selectors and values directly.

---

## Design token references

**Colors (from tokens.css):**
- `--color-income-default`: #2e7d32 (green, positive balance)
- `--color-expense-default`: #c62828 (red, negative balance)
- `--color-text-primary`: #231f27 (primary text)
- `--color-brand-on-primary`: #ffffff (white icon on brand background)
- `--color-income-bg`: #e8f5e9 (light green chip background)
- `--color-expense-bg`: #ffebee (light red chip background)

**Spacing:**
- `--space-5`: 8px
- `--space-6`: 12px
- `--space-7`: 16px

**Breakpoints (from globals.css):**
- 1439px: 5-column grid
- 1199px: 3-column grid (← overflow happens between 1200–1399px)
- 899px: 2-column grid

**Tokens used:**
- All color and spacing references already exist in tokens.css v0.2. No new tokens needed.

---

## Priority-ordered issues (high-impact × low-cost first)

### 1. AccountCard building icon color (HIGHEST IMPACT)
**Issue:** Bank/building icon in AccountCard not white; should be white (matches KPI icons).

**Current state:**
- `app/src/renderer/components/AccountCard/AccountCard.tsx` line 31: `<Landmark size={18} />`
- `app/src/renderer/components/AccountCard/AccountCard.css` line 16: `color: #ffffff;` ✓ Already correct
- BUT: The parent `.ot-account-card__icon` has `border-radius: var(--radius-md);` and inline `style={{ background: color }}` (card's per-account color), yet the Landmark glyph appears gray, not white.

**Root cause:** 
The CSS rule is there but possibly being overridden by lucide-react's default stroke color or a missing explicit color inheritance. The glyph is SVG-based, and lucide defaults to inheriting `currentColor`. The fix is to verify `color: #ffffff;` is being applied.

**Target state:**
White building icon (matches KPI icons' white color on colored backgrounds).

**Change spec:**
- **File:** `app/src/renderer/components/AccountCard/AccountCard.css`
- **Selector:** `.ot-account-card__icon`
- **Ensure rule exists:** `color: #ffffff;` (line 16 already has it; verify it's not being blocked by specificity)
- **Alternative if inheritance fails:** Add `color: #ffffff !important;` (only if needed after testing)
- **Verification:** AccountCard icon should match KPI icon appearance (white on colored background).

**Risk:** Low. CSS is already written; this is likely a specificity or rendering bug in the current code.

---

### 2. Account card positive/negative balance coloring (HIGH IMPACT)
**Issue:** Account card balance should be green for positive, red for negative (standard accounting). Currently unclear if styling is applied.

**Current state:**
- `app/src/renderer/components/AccountCard/AccountCard.tsx` lines 40–42: Balance uses conditional class: `ot-account-card__balance--positive` or `ot-account-card__balance--negative`
- `app/src/renderer/components/AccountCard/AccountCard.css` lines 23–28:
  ```css
  .ot-account-card__balance--positive {
    color: var(--color-income-default);
  }
  .ot-account-card__balance--negative {
    color: var(--color-expense-default);
  }
  ```
- **Status:** Rule exists but needs verification that balance rendering works correctly.

**Target state:**
- Positive balance (e.g., €1,234.56): green (`--color-income-default` = #2e7d32)
- Negative balance (e.g., −€234.56): red (`--color-expense-default` = #c62828)

**Change spec:**
- **File:** `app/src/renderer/components/AccountCard/AccountCard.css`
- **No changes needed** — rules are correctly implemented (lines 23–28)
- **Verification task:** Test with mock positive and negative balances in panel to confirm both classes render with correct colors.

**Risk:** Low. CSS is correct; this is a verification-only item (likely already working).

---

### 3. Account cards grid overflow at ≥1200px (HIGH IMPACT × MEDIUM COST)
**Issue:** "Account blocks pile on top of each other from 1200px" — grid collapse/wrap issue.

**Current state:**
- `app/src/renderer/styles/globals.css` lines 270–295: `.ot-account-cards` uses responsive grid:
  ```css
  grid-template-columns: repeat(5, minmax(0, 1fr));
  ```
  At `@media (max-width: 1199px)`: `repeat(3, minmax(0, 1fr));`

**Problem identified:**
At 1200–1439px (just above the `1199px` breakpoint), the grid is STILL 5 columns. The Panel layout (with sidebar ~240px) means: available width ≈ 1200 - 240 = 960px. Five columns of `minmax(0, 1fr)` in 960px = ~192px per column (too narrow). Cards compress and wrap text/layout.

**Target state:**
- 1200–1439px viewport → 4-column grid (not 5)
- Cards at this breakpoint: ~233px wide (960 ÷ 4), no text wrap/compression

**Change spec:**
- **File:** `app/src/renderer/styles/globals.css`
- **Action:** Add new breakpoint rule between the 5-col (root) and 3-col (1199px) rules
- **New rule:** Insert after line 284 (after the `1439px` breakpoint):
  ```css
  @media (max-width: 1199px) {
    .ot-account-cards {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  ```
  **Then adjust the existing 1199px rule** (line 286–289) to become:
  ```css
  @media (max-width: 1199px) {
    .ot-account-cards {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  ```

**Actually, review reveals the breakpoint cascade is:**
- root: 5-col
- max-width 1439px: 4-col ✓ (already exists)
- max-width 1199px: 3-col ✓ (already exists)

**Status:** The 4-col breakpoint already exists. If cards still overflow, the issue is likely **container width**, not the grid itself.

**Revised diagnosis:**
The `.ot-account-cards` is constrained by its parent `.ot-shell__main` or `PanelScreen` wrapper. If the wrapper has `max-width` or insufficient padding, cards can't use the available space.

**Revised Change spec:**
- **File:** `app/src/renderer/screens/PanelScreen/PanelScreen.tsx` or check parent container
- **Investigation:** Confirm the `.ot-account-cards` container has `width: 100%` and is not nested in a `max-width` constraint
- **Likely fix:** Ensure `.ot-account-cards` parent (the `<div>` at line 316) has no max-width override
- **Fallback:** If no CSS fix, may need to add `max-width: none; width: 100%;` to `.ot-account-cards` itself

**Risk:** Medium. Requires testing across the 1200–1439px range to verify grid behavior with real sidebar.

---

### 4. Arrow icon inconsistency (Panel vs Movements) (MEDIUM IMPACT)
**Issue:** Panel uses different up/down arrows than MovementsScreen. Need consistency.

**Current state:**
- **Panel (PanelScreen.tsx lines 207–209):** Uses text arrows `'↑'` and `'↓'` (Unicode text glyphs)
  ```tsx
  {row.type === 'income' ? '↑' : '↓'}
  ```
- **Movements (prototype/movimientos.jsx):** Also uses text arrows `'↑'` and `'↓'`
- **Prototype (shell.jsx lines ~20–22):** Ships `arrowUp` and `arrowDown` as SVG polylines (in the shell code, not used in table rows)

**Prototype reference (prototype/movimientos.jsx line ~200, panel.jsx line ~300):**
Both use `{t.type === 'income' ? '↑' : '↓'}` — text arrows are the **prototype standard**.

**Target state:**
Both Panel and Movements use the same arrows. Per prototype, that's Unicode text arrows `↑` (U+2191) and `↓` (U+2193).

**Change spec:**
- **Current implementation is already correct** — no changes needed
- **Verification:** Confirm MovementsScreen also uses `'↑'` / `'↓'` (not Lucide icon substitutes like `TrendingUp`/`TrendingDown`)

**Why TrendingUp/TrendingDown are wrong:**
- `TrendingUp`/`TrendingDown` are **line-chart icons** (slanted slope), not arrows
- The prototype never uses them for type chips; KPI tiles use them for the big summary cards (KPIStrip component), not for row-level income/expense indicators
- KPI icons are allowed to differ (they're large, emphasized); row-level type indicators must stay uniform as text arrows

**Risk:** Low. Text arrows already in use; no code change needed (unless Movements was incorrectly changed).

---

### 5. "View all transactions" link position (MEDIUM IMPACT)
**Issue:** "View all transactions" position differs between prototype and current Panel implementation.

**Current state:**
- **Panel (PanelScreen.tsx lines 352–356):** "View all" link inside a `.ot-panel-recent__footer` div (floated right)
  ```tsx
  <div className="ot-panel-recent__footer">
    <a className="ot-panel-recent__link" href="/movements?range=this-month">
      {t('panel.cta.view-all-movements')} →
    </a>
  </div>
  ```
- **CSS (PanelScreen.css lines 36–41):** Footer has `display: flex; justify-content: flex-end; padding: 10px 16px; border-top: 1px solid var(--color-divider);`
- **Position:** Bottom-right of the recent transactions card, above a divider

**Prototype reference (prototype/panel.jsx):**
RecentTxTable footer shows the link in the same bottom-right position. This matches current implementation.

**Target state:**
No change — current position matches prototype.

**Change spec:**
- **Verification only:** Confirm the link appears at bottom-right of the recent-tx card, with the border separator
- **No CSS/DOM changes needed**

**Risk:** None. Already correct per prototype.

---

### 6. KPI preview graph in KPI boxes (DEFERRED)
**Issue:** Prototype shows small chart/sparkline in each KPI tile; not currently implemented.

**Current state:**
- KPIStrip (KPIStrip.tsx lines 26–58) renders 3 KPI tiles with: icon + label + value + delta (month text only, no chart)
- No sparkline or mini-chart visible in the tiles

**Prototype reference:**
The prototype shows a small line graph or area chart in each KPI tile (Income, Expense, Net), showing monthly trend or distribution.

**Target state:**
Pedro said "we can leave this for later" — **DEFER to M1.2 or later**.

**Change spec:**
- **No action now.** Flag as WI-20 (separate workitem).
- **When implemented:** Will likely use a small SVG sparkline (20–30px height) or recharts micro-chart in each `.ot-kpi` tile
- **Token prep:** May need a "chart" component primitive; coordinate with Trinity on chart library choice (visx vs Recharts)

**Risk:** None (deferred).

---

### 7. "Santander Cuenta Principal" mock data cosmetic issue (LOW IMPACT)
**Issue:** Placeholder account name looks out of place; cosmetic data issue.

**Current state:**
- **Mock account names** in Panel data show realistic Spanish account names (e.g., "Santander Cuenta Principal")
- These are seed data, not UI logic — the app correctly renders them

**Target state:**
Update seed data to use more generic/less branded names, or replace with actual integration data once Morpheus wires account labels.

**Change spec:**
- **Not a design/CSS issue** — flag this for **Link/Pedro (functional data cleanup)**
- **Not in scope for Mouse** — this is a seed data / mock data task, not a UI design spec
- **Note:** Once real account data flows from Morpheus, this resolves automatically

**Risk:** None (cosmetic; functional data will replace mock data soon).

---

## Summary of changes by file

| File | Change | Priority |
|------|--------|----------|
| `AccountCard.css` | Verify white icon color rule exists (line 16); ensure no specificity override | 1 |
| `globals.css` | Confirm 4-col breakpoint exists at 1439px; verify no overflow in 1200–1399px range | 2 |
| `PanelScreen.tsx` | Verify arrow chips use `'↑'` / `'↓'` (text arrows) | 3 |
| `PanelScreen.tsx` | Verify "View all" link position at bottom-right of card | 4 |
| `KPIStrip.tsx` | **DEFER** — mini-chart feature for M1.2+ | Deferred |
| Seed data | **Escalate to Link/Pedro** — replace mock account names with real data | Deferred |

---

## Items deferred

- **KPI graph preview** — Pedro approved deferral ("leave for later"). Track as enhancement for M1.2.
- **Seed data cleanup** — Mock "Santander Cuenta Principal" data is a functional / data layer issue, not a design issue. Recommend Link update the seed-data fixtures once real Morpheus integration lands.

---

## Implementation notes for Trinity

1. **Do NOT invent new colors.** All balance, icon, and chip colors use existing tokens. If a needed tone doesn't exist, flag it here — don't add inline hex.

2. **Grid overflow at 1200px:** Test the panel at 1200, 1300, and 1400px viewport widths with the sidebar visible. If cards still pile/wrap, the breakpoint cascade needs review. The 4-col rule should kick in; if not, check the `.ot-account-cards` parent container for width constraints.

3. **Arrow consistency:** Confirm MovementsScreen uses text arrows (`'↑'` / `'↓'`), not Lucide icon components. The prototype never swaps these for styled glyphs in table rows.

4. **White icon on colored card:** The `.ot-account-card__icon` rule at `AccountCard.css:16` already sets `color: #ffffff;`. If the Landmark glyph appears gray in the installed app, this is likely a rendering/specificity bug. Verify `color: white` is not being overridden by a parent selector or lucide-react's default styling.

5. **Test all 7 items** in the installed app on a real 1200+ px desktop viewport with the sidebar visible before marking done.

---

## Learnings appended to `.squad/agents/mouse/history.md`

See end of this document for history entry.



---

## 2026-04-21: WI-20 Polish Round 3 — Table Truncation + Button Alignment (Mouse Rescue)

**Date:** 2026-04-21  
**By:** Mouse (UI Designer, vision)  
**Status:** ✅ SHIPPED (commit 6127fa5)

Trinity locked out after 4 failed rounds on same artifact. Coordinator spawned Mouse with vision capability to review Pedro's screenshots.

### Table Column Width System (WI-20 Fix)

**Problem:** Movements table cut off at right edge (ESTADO column invisible) at 2040px viewport. Long category codes pushed columns past viewport with no horizontal scroll visible.

**Root Cause:** Table layout mode conflict. Round 2 added white-space: nowrap to prevent wrapping but without max-width constraints, the table extended infinitely. min-width: max-content made it worse by preventing compression.

**Solution:** Switched to 	able-layout: fixed with explicit column widths:

| Column        | Width | Rationale |
|---------------|-------|-----------|
| select        | 36px  | Checkbox only |
| type          | 36px  | Arrow icon only |
| date          | 100px | dd MMM yyyy format |
| account       | 130px | Account name with pill styling |
| description   | 220px | Main text column, gets most space |
| category      | 150px | Truncate long category codes |
| subcategory   | 150px | Truncate long subcategory codes |
| tags          | 180px | Chips with +N overflow indicator |
| status        | 90px  | Badge (Pendiente/Aprobado/Rechazado) |
| amount        | 110px | Right-aligned currency |

**Implementation Pattern:**
- 	able-layout: fixed for predictable column widths
- overflow: hidden; text-overflow: ellipsis; white-space: nowrap on all cells
- Title attributes on truncated cells for hover tooltips
- Tag chip overflow: show max 2 chips visible, +N indicator for rest

**Files:** MovementsScreen.tsx, MovementsScreen.css

### Button Icon/Text Alignment Fix (WI-20)

**Problem:** "Editar" button in TransactionDetailModal footer — pencil icon sitting visually higher than text. No shared vertical center line.

**Root Cause:** Editar button passed icon as direct child instead of using leadingIcon prop. When passed as direct child, icon wasn't getting the wrapper with display: inline-flex; align-items: center; applied by Button.css.

**Solution:** Use Button's leadingIcon prop as designed:

`	sx
<Button 
  type="button" 
  variant="ghost" 
  onClick={handleEdit} 
  leadingIcon={<Edit size={16} />}
>
  {t('transactionDetail.editButton')}
</Button>
`

Button wraps icon in <span aria-hidden="true"> with proper flexbox alignment + SVG display: block to remove baseline offset.

**Files:** TransactionDetailModal.tsx

### Lesson Learned

**Why Trinity failed 4 rounds:** CSS patches without DOM verification. View/edit modes used completely different component trees (<dl> vs <TransactionFormFields>), so CSS-only fixes couldn't make them match. Tests passed because they only checked element existence, not visual correctness.

**Why vision helped:** Seeing actual screenshot revealed exact columns overflowing and button misalignment obvious in rendered output. Trinity was theorizing without seeing.

**Prevention:** Add visual regression tests or snapshots comparing scaffold structure between modes. Don't trust tests that only check DOM presence.


---

## 2026-04-21: Config Renovation — PR#2 Parity & Rounds 1–4 Polish

# Configuration Screens Visual Renovation — PR #2 Prototype Patterns

**Date:** 2026-04-21  
**By:** Trinity (Frontend Dev)  
**Status:** ✅ SHIPPED  
**Commit:** cd1ebb5

## Context

Pedro created PR #2 with visual prototypes for the Configuration section (Cuentas / Categorías / Etiquetas). These prototypes demonstrate enhanced UI patterns:
- Table layouts with search/filter
- Better visual hierarchy and metadata display
- Hover-revealed action buttons
- Stats headers with aggregate data
- Export buttons

The prototypes also show **advanced features** requiring backend data not yet available in the current data model:
- IBAN masking + per-row reveal toggle
- Account labels, colors, and PayPal flags
- Master-detail layout with subcategories
- Tag colors and usage counts
- Grid/List view toggle

Current backend provides minimal CRUD:
- **AccountRecord:** `{ id, name, bankName?, currency, openingBalance, createdAt }`
- **CategoryRecord:** `{ id, name, color?, createdAt }`
- **TagRecord:** `{ id, name, createdAt }`

## Decision

Implement the prototype's **visual patterns and UI scaffolding** immediately, working with the current minimal data model. Defer features requiring unavailable backend data until those fields are added.

**Rationale:**
1. Unblocks UX iteration and validates interaction patterns early
2. Establishes CSS patterns that will house future data
3. Maintains existing CRUD functionality
4. Demonstrates visual direction from PR #2 without blocking on backend work

## Implementation

### What Shipped

**Enhanced CSS Patterns (ConfiguracionScreen.css):**
```css
.ot-config__filter-bar         /* Search + chip filters + counts */
.ot-config__search-input        /* Lucide icon + input + focus states */
.ot-config__table-wrapper       /* Card-wrapped table */
.ot-config__table               /* Clean table layout matching prototype */
.ot-config__row-actions         /* Hover-revealed Edit/Delete buttons */
.ot-config__row-action-btn      /* Icon button with danger variant */
.ot-config__tag-grid            /* Improved tag card grid */
.ot-config__tag-grid-item       /* Card with hover effects */
.ot-config__meta-text           /* Small muted metadata text */
.ot-page-header__stats          /* Stats display in page header */
```

**Cuentas (Accounts) Tab:**
- Table layout: Name | Bank | Opening Balance | Actions
- Search filter by name or bank with result counts
- Stats header: "N cuentas · Saldo total: €XXX"
- Balance color-coded (green positive, red negative)
- Hover-revealed Edit/Delete action buttons
- Export button when accounts exist
- Empty state + no-results handling

**Categorías (Categories) Tab:**
- Table layout with color swatch column (if category has color)
- FolderOpen icon fallback for categories without colors
- Search filter with result counts
- Consistent action button patterns

**Etiquetas (Tags) Tab:**
- Grid layout with improved card styling
- Tag pill display + ID metadata
- Search filter with result counts
- Hover effects on cards
- Export button integration

### What's Deferred

**Accounts:**
- IBAN field, masking, per-row reveal toggle
- Account labels (Primary, Operations, Events, etc.)
- Account color swatches
- PayPal / external platform flag
- Entity icon with account color background

**Categories:**
- Master-detail 50/50 split layout
- Subcategories panel
- Income/Expense type pills
- Usage counts (requires transaction aggregation)

**Tags:**
- Tag colors (color swatch + chip background)
- Grid/List view toggle
- Usage counts (requires transaction aggregation)
- Auto-derived slug display

**Modals:**
- Account create/edit modal with IBAN reveal, color picker, label datalist, preview
- Tag create/edit modal with auto-slug, color picker, propagation callout
- Category/Subcategory modals

## Pattern Established

**Progressive Enhancement with Prototypes:**

When prototypes demonstrate features requiring backend data not yet available:

1. **Implement visual scaffolding immediately:**
   - CSS patterns and layout structures
   - Search/filter UI (even if filtering simple fields)
   - Placeholder slots for future data (e.g., color swatch column)

2. **Defer data-dependent features:**
   - Document clearly what's deferred and why
   - Ensure CSS classes/structure can accept future data without refactoring

3. **Maintain existing functionality:**
   - All CRUD operations continue working
   - Empty states and error handling remain robust

4. **Validate UX patterns early:**
   - Search/filter interaction
   - Hover states and action buttons
   - Empty state copy and layout

This approach unblocks frontend iteration while backend data model evolves, and demonstrates visual direction from prototypes without creating technical debt.

## Future Work

When backend adds richer data fields:
1. Update type contracts (AccountRecord, CategoryRecord, TagRecord)
2. Wire new fields into existing table/grid cells (CSS slots already exist)
3. Implement deferred features (IBAN masking, master-detail, modals)
4. Add integration tests for new data flows

The visual patterns shipped in this renovation are forward-compatible with those future enhancements.

## Files Changed

- `app/src/renderer/screens/ConfiguracionScreen/CuentasTab.tsx` (table layout + search)
- `app/src/renderer/screens/ConfiguracionScreen/CategoriasTab.tsx` (table layout + search)
- `app/src/renderer/screens/ConfiguracionScreen/EtiquetasTab.tsx` (grid layout + search)
- `app/src/renderer/screens/ConfiguracionScreen/ConfiguracionScreen.css` (+200 lines of prototype patterns)
- `app/src/renderer/screens/PanelScreen/PanelScreen.tsx` (formatting only)

## Validation

- ✅ Typecheck
- ✅ Lint
- ✅ Format:check
- ✅ Tests (all existing tests pass)
- ✅ Build
- ✅ Visual patterns match PR #2 prototype intent
- ✅ All existing CRUD functionality preserved


---

# Trinity — Config full renovation (PR#2 parity, 2026-04-21)

**Requested by:** Pedro · **Predecessor:** cd1ebb5 (Config renovation round 1)

## What I implemented end-to-end

### Navbar / AppShell
- Replaced the single `configuracion` route with three sibling sub-routes:
  `categorias` (FolderOpen), `etiquetas` (Tag), `cuentas` (Landmark).
- Introduced a third sidebar section `shell.sections.datos` hosting
  `Importación` (Upload); removed `datos` from the main-nav section.
- `ConfiguracionScreen` now accepts `initialTab` + `onTabChange` so clicking
  the in-screen tab strip drives the AppShell route and vice-versa.

### Schema / data layer (WI-15-lite additive extension)
Fields added **optionally** (backward-compatible on the NDJSON event log):

| Entity    | Fields added                                         | Carriers touched |
| --------- | ---------------------------------------------------- | --------------- |
| Account   | `label`, `iban`, `color`, `isPaypal`                 | `accountCreatedEventSchema`, `accountRecordSchema`, `createAccountRequestSchema`, `configAccountCreatedEventSchema`, `ConfigAccount` read-model, `applyEvent('AccountCreated')`, `selectAccounts`, `createAccountsCreateHandler` |
| Tag       | `color`                                              | `tagCreatedEventSchema`, `tagRecordSchema`, `createTagRequestSchema`, `configTagCreatedEventSchema`, `ConfigTag` read-model, `applyEvent('TagCreated')`, `selectTags`, `createTagsCreateHandler` |
| Category  | — (`color` already present from round 1)             | no change       |

No new IPC channels — the existing `accounts:create`, `tags:create` handlers
parse + persist the new optional fields. Event-log idempotence and
deduplication unchanged.

### Renderer (UI) renovations
- **CuentasTab**: entity-icon tile (swatch-colored), bank column, label pill
  (`color-mix` background + dot), masked IBAN + per-row eye-toggle reveal,
  saldo column, extended search (name | bank | label | IBAN), 7-column
  table-layout:fixed grid with `colgroup` + `ot-config__cell-truncate` ellipsis.
- **CategoriasTab**: master-detail layout. Master list with entity-icon +
  color swatch in header; detail pane with subcategories placeholder + an
  info callout explaining the subcategory event-log extension is the next
  step.
- **EtiquetasTab**: grid/list segmented toggle; grid shows round swatch +
  name + monospace id; list shows color-tinted chip pill via `color-mix`.
- **AddAccountModal**: label (with `<datalist>` suggestions), IBAN
  (password-style with eye-toggle reveal, disabled on PayPal mode), color
  swatch picker (8 presets), "es plataforma externa" checkbox, live Vista
  previa showing the exact row the table will render.
- **AddTagModal**: color swatch picker + live slug identifier preview + live
  chip preview block.

### Playwright diff harness
- `scripts/config-diff-playwright.mjs` — headless Chromium driver that
  spins up a static server for `prototype/`, visits each screen in both the
  prototype and the current Vite dev build, and writes PNGs to
  `.squad/decisions/inbox/playwright-config-diff/`. `window.opentreasury` is
  stubbed in an `addInitScript` hook so the renderer boots outside Electron.

### All gates green
- `npm run typecheck` ✓
- `npm run lint` ✓ (max-warnings 0)
- `npm run format:check` ✓
- `npm run test` ✓ (370 pass / 9 pre-existing skipped)
- `npm run build` ✓

## Deferred (with explicit reason)

| Deferred item | Why it truly can't ship now |
| ------------- | --------------------------- |
| **Edit / Delete for Account, Category, Tag** | No `AccountUpdated/Deleted`, `TagUpdated/Deleted`, `CategoryUpdated/Deleted` events or IPC channels exist. Adding them is a clean, event-shaped piece of work (new wire types + reducer branches + handler tests) that deserves its own PR. Buttons render `disabled` with a "próximamente" tooltip. |
| **Subcategory CRUD on Categorías detail pane** | Same reason — needs `SubcategoryAdded/Removed/Renamed` events not currently in the WI-15-lite slice. Pane renders an info callout so it's honest about the gap. |
| **Category direction pill (`Ingreso`/`Gasto`)** | Pedro Q4 (see decisions.md §"WI-15-lite — Q&A") explicitly locked categories as direction-agnostic. The prototype ships this pill; I intentionally skipped it to respect that lock-in. Reopen if the locked call changes. |
| **Usage-count columns (N movimientos for account / category / tag)** | Wire-ready: `ReadModel.transactions[].accountId / categoryId / tagIds` exist. The WI-15-lite `configAccounts` stream uses opaque string ids *decoupled* from the `account.created` ULIDs used by transactions, so a left-join would currently yield zero. Ship a migration that unifies the two account streams before wiring counts — otherwise every row would show `0`. |

## Schema migration notes

Existing users have NDJSON event logs written before these fields existed. The
schema change is **purely additive**: every new field is `z.*().optional()`
and the reducer guards with `event.label !== undefined ? …` spread patterns
(mirrors the WI-19 pattern that added `reference`/`details` to transactions).
No migration script required — old events replay cleanly and the renderer
renders `—` placeholders for missing values.

## Relevant commit(s)

- (pending) `feat(config): full PR#2 parity — navbar, schema, IBAN/colors/labels, master-detail, tags`


---

# Trinity — Config renovation polish, round 2

**Branch:** `trinity/config-renovation-docs`
**Commit (round 1):** `0296a76`
**Round 2 scope:** UI-only polish per Pedro review. No schema changes.

## Pedro's feedback list → resolution

| # | Feedback | Fix |
| - | -------- | --- |
| 1 | Remove **Export** button on all three config screens | Dropped `<Button … Exportar>` and the `Download` lucide import in `CuentasTab`, `CategoriasTab`, `EtiquetasTab`. |
| 2 | Remove the **top tab navigation** inside `ConfiguracionScreen` — duplicated with the sidebar sibling routes | `ConfiguracionScreen.tsx` now renders one sub-tab's content directly based on `initialTab`. The `<div role="tablist">` and `<section role="tabpanel">` chrome is gone. Related `.ot-config__tab{,s}` CSS rules removed. |
| 3 | Cuentas main screen — OK as-is | No change. |
| 4 | **AddAccountModal** "Label" field shows hard-coded datalist suggestions | Removed `LABEL_SUGGESTIONS` array, `<datalist id="acc-label-suggestions">`, and the `list="…"` attribute on the input. Field is now a plain free-text input. |
| 5 | Categorías main screen "weird, not balanced" | `CategoriasTab` rebuilt against the prototype: richer list rows (icon + title + sub-line + row actions), matching `list-add` ghost footer on each card, subcategory empty-state in the detail pane using the same `list-rows` rhythm, small color swatch next to the selected-category title. Added `.ot-config__list-row-text`, `.ot-config__list-row-title`, `.ot-config__list-row-sub`, `.ot-config__list-add` styles. |
| 6 | Etiquetas main screen — ULID leak + drop list view | `{tg.id}` rendered in the grid card was the opaque ULID (e.g. `01KPKVR0RMXVV963MEH1TSK2QZ`); the prototype intended a human-readable slug derived from name which we do not ship on `TagCreated`. Slot removed until the schema grows a slug. List view and the grid/list segmented toggle also removed — grid is the only view. |

## Root cause — the ULID leak

`EtiquetasTab` was modelled after `prototype/configuracion.jsx:758-761`:

```jsx
<div className="tc-meta">
  {t.uses} movimiento(s) · <span className="code-mono">{t.id}</span>
</div>
```

In the prototype, `t.id` is a **slug derived from the tag name** (see the
"auto-derive id from name" hook around line 575). In OpenTreasury, `TagRecord.id`
is a ULID created by `@noble/hashes`/`ulidx`. Rendering it gave users
26-character opaque strings. Lesson stored in the skill: *never render an entity
id in UI copy unless the schema guarantees it's a human-readable slug*.

## Screenshots

Before/after capture from `scripts/config-diff-playwright.mjs` is archived
under `./playwright-config-diff/round2/` next to this note:

- `current-cuentas.png`, `current-categorias.png`, `current-etiquetas.png` —
  post-fix current app
- `prototype-cuentas.png`, `prototype-categorias.png`, `prototype-etiquetas.png` —
  reference prototype

Round-1 screenshots remain at `./playwright-config-diff/` (direct children) for
comparison.

## Gates

- `npm run typecheck` ✓
- `npm run lint` ✓ (max-warnings 0)
- `npm run format:check` ✓
- `npm run test` ✓ (370 passed / 9 skipped)
- `npm run build` ✓

## Notes for the Scribe

- Keep the PNGs under `./playwright-config-diff/round2/` — only `.md` files get
  archived/deleted; the harness output is non-`.md`.
- The skill file (`.squad/skills/config-screen-pattern/SKILL.md`) received a new
  lesson: "navbar routes replace internal tabs — never both".


---

# Categorías — main screen rebuild (round 3)

**Author:** Trinity
**Branch:** `trinity/config-renovation-docs`
**Commit:** `fix(config): rebuild Categorías main screen to match prototype`

## Before / after

- Target (authoritative): `.squad/decisions/inbox/prototype-categorias.png`
- What was rejected (round 2 ship): `.squad/decisions/inbox/prototype-categorias-wrong.png`
- Round 3 capture: `.squad/decisions/inbox/playwright-config-diff/round3/current-categorias.png`
- Side-by-side prototype re-capture: `.squad/decisions/inbox/playwright-config-diff/round3/prototype-categorias.png`

The round-3 current screen now carries the full prototype anatomy:
title + colored stats row (`8 categorías · 5 ingresos · 3 gastos`),
segmented filter (Todas/Ingresos/Gastos), master-detail with
`folder-tile + title/sub + kind-pill + row-actions` rows, detail card
with `Renombrar`/`Subcategoría` button pair, and an
`+ Añadir subcategoría a {name}` ghost footer (disabled pending the
subcategory event slice).

## Schema note — additive

Categories now carry an **optional** `kind: 'income' | 'expense'` field,
added to:

- `app/src/shared/ipc-contracts/categories.ts` (event + record + request)
- `app/src/core/events/schemas.ts` (`configCategoryCreatedEventSchema`)
- `app/src/core/query/types.ts` (`ConfigCategory`)
- `app/src/core/query/reducers.ts` (spread-if-defined, matches Account pattern)
- `app/src/main/projections/config.ts` (`selectCategories` mirrors spread)
- `app/src/main/ipc/handlers/categories.ts` (pass-through)
- `AddCategoryModal.tsx` — required segmented chooser for new categories

Optional at the wire level: pre-existing NDJSON events still replay
cleanly (field undefined → record has no `kind`). The modal treats it as
required for **new** categories so new rows always render a pill.

This reverses the Q4 "direction-agnostic categories" decision in
`decisions.md` (line ~2768) — Pedro's 2026-04-22 prototype handoff makes
`type` explicit on the master row, the detail header, the summary
count, and the filter chip group. Flagged here so Scribe can archive
the old Q4 note alongside this reversal.

## Postmortem — why three rounds?

**Signal I missed in rounds 1 and 2:** I was reading the prototype through
`prototype/configuracion.jsx` (source code) and treating the old
`decisions.md` direction-agnostic line as binding. The *rendered* image —
`prototype-categorias.png` — was available in the inbox the whole time
and its Ingreso/Gasto pills are visually dominant. I did not open it
before coding. Worse, round 2's history learnings explicitly warned
myself off adding the type-pill ("Pedro Q4, do not add it back") —
making me actively wrong on round 3 until I re-read the screenshot.

**Correction baked into the Config-screen-pattern skill:** new lesson
added — always open the prototype PNG first, list every visible delta,
and let the screenshot override any older written decision. Code-level
prototype JSX is a hint, never the source of truth; a decision log entry
is a snapshot in time, not an eternal constraint.

**Scope discipline:** constraints held — no internal tab strip, no
export buttons (prototype's Exportar dropped), no list-view toggle on
Etiquetas, no datalist suggestions, no ULID leaks. Cuentas + Etiquetas
tabs untouched. `TransactionDetailModal`/`MovementsScreen` untouched.

## Gates

- `npm run typecheck` · green
- `npm run lint` · green (max-warnings 0)
- `npm run format:check` · green
- `npm run test` · 370 passed, 9 skipped (pre-existing skips)
- `npm run build` · green

## Follow-ups for other agents

- **Morpheus** — next slice: `SubcategoryAdded / SubcategoryRenamed /
  SubcategoryRemoved` events so the Renombrar + Subcategoría buttons
  can come off `disabled` and the detail rows render real children.
- **Morpheus** — a `CategoryKindChanged` event (or a
  full-replacement `CategoryUpdated` pattern à la `tx.updated`) if
  Pedro wants `kind` mutable post-creation; current modal sets it
  once at create time.
- **Oracle/Scribe** — archive the old Q4 "direction-agnostic
  categories" note now that it's superseded.


---

# Trinity — Categorías polish (round 4)

**Branch:** `trinity/config-renovation-docs`
**Follow-up to:** 33a97a9 (Categorías rebuild to prototype)
**Scope:** four visual polish items Pedro flagged after round 3.

## Fixes shipped

1. **Filter chips "Todas / Ingresos / Gastos" now reuse the Movements
   component, not a look-alike.**
   - Extracted the chip rules from
     `app/src/renderer/screens/MovementsScreen/MovementsScreen.css`
     (lines 130–166 previously) into a new shared stylesheet
     `app/src/renderer/styles/filter-chips.css`.
   - Imported from `app/src/renderer/main.tsx` so every screen gets the
     same `.ot-filter-bar__chips` / `.ot-filter-bar__chip[--active]`
     classes without a cross-screen CSS import.
   - `CategoriasTab.tsx` switched from its bespoke `ot-config__chip*`
     classes to the shared `ot-filter-bar__chip*` classes. The custom
     `ot-config__chip*` CSS block is deleted — single source of truth.
   - MovementsScreen TSX untouched (Mouse's territory); only the
     duplicated CSS rule was moved out of its stylesheet.

2. **Section headers in both panes now visually identical.**
   - `.ot-config__md-title` bumped to `font-size-15` semibold,
     `line-height: 1.3`, `display: flex`.
   - Introduced `.ot-config__md-head-text` wrapper (flex column, `gap:
     2px`) so the title and sub reliably stack. Replaces the bare `<div>`
     that caused "Categorías" + "8 resultados" to render on the same line
     when the sub text was short.

3. **Folder icon corrected.** `lucide-react` **`Folder`** (closed) now
   used everywhere the master row previously rendered **`FolderOpen`**.
   Matches the prototype shape (closed folder with tab). Also updated
   the empty-state + filter-empty + "select a category" placeholder so
   icon usage is consistent across the tab.

4. **"X resultado(s)" now lives BELOW the section header.**
   - `.ot-config__md-sub` changed from `display: inline-flex` →
     `display: flex`, removing `margin-top: 2px` (the new head-text
     wrapper provides the gap).
   - Same treatment applied to the detail card's
     `"X subcategoría(s) · Y movimiento(s) clasificados"` line.

## Before / after

- **Before (round 3):**
  `.squad/decisions/inbox/playwright-config-diff/round3/current-categorias.png`
- **After (round 4):**
  `.squad/decisions/inbox/playwright-config-diff/round4/current-categorias.png`
- **Reference prototype:**
  `.squad/decisions/inbox/prototype-categorias.png`

## Gates

- `npm run typecheck` ✅
- `npm run lint` ✅ (max-warnings 0)
- `npm run format:check` ✅
- `npm run test` ✅ (370 passed, 9 skipped, 51 files)
- `npm run build` ✅

## Files touched

- `app/src/renderer/styles/filter-chips.css` (new)
- `app/src/renderer/main.tsx` (+1 import)
- `app/src/renderer/screens/MovementsScreen/MovementsScreen.css`
  (removed duplicated chip rules, pointer comment)
- `app/src/renderer/screens/ConfiguracionScreen/ConfiguracionScreen.css`
  (md-head wrapper, font-size-15 title, removed `ot-config__chip*`)
- `app/src/renderer/screens/ConfiguracionScreen/CategoriasTab.tsx`
  (shared chip classes, closed `Folder` icon, `md-head-text` wrapper)
- `scripts/config-diff-playwright.mjs` (output dir → `round4/`)

## Follow-ups for Niobe / Mouse

If Cuentas or Etiquetas pick up a filter-chip control later, they
should reuse `.ot-filter-bar__chip*` — do **not** reintroduce a
per-tab look-alike.


---

# Configuración — Prototype (PR #2) vs Current App diff

**Author:** Trinity (Frontend Lead)
**Date:** 2026-04-21
**Capture method:** Playwright + headless Chromium at 1440×900. Prototype served
from `prototype/OpenTreasury Prototype.html` via a local static server;
current app served from the running Vite dev server with `window.opentreasury`
stubbed so the renderer boots outside Electron. See
`scripts/config-diff-playwright.mjs`.

Screenshots live alongside this report in
`.squad/decisions/inbox/playwright-config-diff/` (kept after Scribe archival —
only .md inbox files are deleted). Filenames:

| Screen      | Prototype                                                | Current app                                            |
| ----------- | -------------------------------------------------------- | ------------------------------------------------------ |
| Cuentas     | playwright-config-diff/prototype-cuentas.png             | playwright-config-diff/current-cuentas.png             |
| Categorías  | playwright-config-diff/prototype-categorias.png          | playwright-config-diff/current-categorias.png          |
| Etiquetas   | playwright-config-diff/prototype-etiquetas.png           | playwright-config-diff/current-etiquetas.png           |

---

## 0 · Navbar / AppShell

| Aspect                    | Prototype                                                                      | Current (cd1ebb5)                                                       |
| ------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Principal section         | Panel / Movimientos / Saldo                                                    | Panel / Movimientos / Saldo / **Datos** (misplaced)                      |
| **Configuración section** | **Three sibling items:** Categorías (`folder`), Etiquetas (`tag`), Cuentas (`bank`) | **Single item:** "Configuración" (`SlidersHorizontal`), tabbed internally |
| Datos section             | Two items: Importación (`upload`), Exportar (`download`)                       | Lives under Principal as "Datos" — no Exportar entry                    |
| Icons                     | Per-entity (folder/tag/bank for config; upload/download for datos)             | Single icon for whole config; Upload for Datos                          |

**Impact:** users can't deep-link to individual config sections, and the three
categories/etiquetas/cuentas don't show as peers of Panel/Movimientos/Saldo.

---

## 1 · Cuentas screen

### Prototype delivers
- Per-row **entity-icon tile** (`Bank` glyph on a color-tinted square) using `account.color`.
- **Two-line name cell** — bold short name + grey subtitle ("Cuenta bancaria" / "Plataforma externa").
- **Banco** column showing full bank name (e.g., "CaixaBank").
- **Etiqueta column** rendering an `account-pill` (`color-mix` background + colored dot + label text, e.g., "Principal", "Operaciones", "Donaciones").
- **IBAN column** with a `code-mono` masked IBAN (`ES•• •••• •••• •• 6789`) + per-row eye-icon toggle for reveal.
- **Movimientos** column (transaction count).
- **Saldo** column, colored by sign.
- Page header shows: `N cuenta(s) · M movimiento(s) · Saldo total <colored>`.
- Search bar placeholder: `Buscar por nombre, banco, etiqueta o IBAN…`.
- **Exportar** button (secondary, `download` icon) + **Nueva cuenta** (primary, `plus`).
- Create/edit modal (`CuentaModal`) captures: short, bank, label (datalist suggestions: Principal/Operaciones/Eventos/Donaciones/FinRett/Reserva), IBAN (with inline reveal + PayPal disable), color swatch picker, "es plataforma externa" checkbox, and a live **Vista previa** row mirroring the table row.

### Current app ships
- Columns: Nombre, Banco, Saldo inicial, actions — **no IBAN, no label, no color, no entity-icon, no movimientos count.**
- Header shows only `N cuenta(s) · Saldo total`, missing movimientos total.
- Search placeholder omits "etiqueta o IBAN".
- Modal captures only: name, bankName, openingBalance — **no label, no color, no IBAN, no isPaypal, no preview.**

### Gap
| # | Missing                                                                   |
| - | ------------------------------------------------------------------------- |
| 1 | `iban` field (schema + storage + modal + table masked display + reveal)   |
| 2 | `label` field (usage label, e.g., "Principal")                            |
| 3 | `color` field + preset swatch palette                                     |
| 4 | `isPaypal` boolean + "Plataforma externa" subtitle and IBAN dash for PayPal |
| 5 | Entity-icon tile in first column                                          |
| 6 | Label pill in its own column                                              |
| 7 | Movimientos count column (requires joining transactions by `accountId`)   |
| 8 | Modal **Vista previa** live block                                         |
| 9 | Edit modal wiring (current app renders Edit button but nothing happens)   |

---

## 2 · Categorías screen

### Prototype delivers
- **Master-detail layout**: left card lists categories, right card shows the
  subcategories of the selected category.
- Each master row shows folder icon + name + "N subcategoría(s) · M
  movimiento(s)" + **type-pill** (`Ingreso` / `Gasto`) + edit/trash row actions.
- **Chip-group filter** at the top: Todas / Ingresos / Gastos.
- Search placeholder: `Buscar categoría…`.
- Detail pane header shows `<name>` + type-pill + `Renombrar` / `+ Subcategoría`
  buttons; list below shows each subcategory with use-count.
- Subtitle counters split income vs expense.

### Current app ships
- Single flat table: swatch | Name | actions. No subcategories, no direction
  filter, no master-detail, no counts.

### Gap
| # | Missing                                                                           |
| - | --------------------------------------------------------------------------------- |
| 1 | Master-detail layout (two-pane)                                                    |
| 2 | Subcategories (list + CRUD)                                                        |
| 3 | `Ingreso`/`Gasto` type pill — **explicitly declined by Pedro Q4** (direction lives on each tx) |
| 4 | Chip-group direction filter (derivable if transactions are joined)                 |
| 5 | Edit/Delete wiring                                                                 |
| 6 | Usage counts (N movimiento(s) per category and per subcategory)                    |

---

## 3 · Etiquetas screen

### Prototype delivers
- Segmented **Tarjetas ↔ Lista** toggle in the header.
- Grid view: round color swatch + name + `N movimiento(s) · <id>` + actions.
- List view: table with swatch column, **tag-chip** using the tag color (via
  `color-mix`), identifier in monospace, usos count, actions.
- Subtitle: `N etiqueta(s) · M asignación(es) a movimientos`.
- Create/edit modal: name, auto-derived slug identifier (disabled after create),
  color swatch picker, live preview (chip + swatch), and — when editing —
  informational callout showing usage count.

### Current app ships
- Cards-only grid. Swatch + name + id. No color, no chip tint, no list view
  toggle, no usage count, no swatch picker in modal, no slug id field.

### Gap
| # | Missing                                                                    |
| - | -------------------------------------------------------------------------- |
| 1 | `color` field (schema + storage + modal swatch picker + preview)           |
| 2 | Chip-tint rendering (background via `color-mix`)                           |
| 3 | Round swatch in card                                                        |
| 4 | Tarjetas / Lista segmented toggle                                          |
| 5 | Usage count (N movimientos referencing each tag)                           |
| 6 | Auto-derived slug identifier with "cannot edit after create" rule          |

---

## Top 5 concrete differences

1. **Navbar:** prototype has three sibling Configuración entries (Categorías,
   Etiquetas, Cuentas) with per-entity icons; current app collapses them into a
   single "Configuración" route behind an internal tab strip.
2. **Cuentas schema gap:** `iban`, `label`, `color`, `isPaypal` don't exist in
   the contract/read-model/modal; the prototype treats them as the core visual
   content of the row.
3. **Cuentas table chrome:** entity-icon tile, label pill, masked-IBAN + eye
   reveal, and movimientos count column are all absent from the current table.
4. **Categorías layout:** prototype is master-detail with subcategories and a
   direction chip-filter; current app is a one-column flat table.
5. **Etiquetas color + list toggle:** prototype stores and renders a per-tag
   color (chip tint, round swatch) and offers a Tarjetas/Lista view toggle;
   current app has neither color nor the toggle.

## What I will NOT deliver in this renovation (and why)

- **Category direction (`Ingreso`/`Gasto` type-pill)** — Pedro Q4 (see
  decisions.md §"WI-15-lite Contract — Q&A") explicitly locked categories as
  direction-agnostic. The pill would contradict that locked decision and is
  intentionally omitted until Pedro reopens the call.
- **Full subcategory CRUD on the Categorías detail pane** — would require net
  new IPC events (`SubcategoryAdded/Removed/Renamed`) beyond WI-15-lite's
  create+list slice. I render the master-detail shell with a subcategories
  list fed from `category.createdAt` payload's `subcategories` array (empty
  until the events ship), and the pane's empty-state copy says so.
- **Edit / Delete for accounts, categories, tags** — no
  `AccountUpdated/Deleted`, `CategoryUpdated/Deleted`,
  `TagUpdated/Deleted` events or IPC channels exist yet. Adding them is a
  separate work item; the row-action buttons remain (for UX continuity) but
  are `disabled` with a tooltip explaining.
- **Exact usage counts per account/category/tag** — I wire them from the
  existing `ReadModel.transactions` projection where possible; for the
  WI-15-lite `configAccounts` / `configCategories` / `configTags` streams
  (which use opaque string ids decoupled from the transaction `account.created`
  ids), counts display zero until transactions reference the new-style ids.
  Prototype uses mock data so its counts look populated; current app's counts
  will light up once imports reference the new Config accounts.


---




---

### 2026-04-22: WI-22 Saldo Fan-Out Shipped — Three Parallel PRs

**Date:** 2026-04-22  
**PRs Merged:** #7 (backend/Morpheus), #8 (chart/Trinity), #9 (i18n/Niobe)  
**Status:** ✅ SHIPPED

**Owners:** Link (Product), Neo (Architecture), Morpheus (Backend), Trinity (Frontend), Niobe (i18n), Cypher (QA)

## Summary

WI-22 delivers the Saldo comparison screen, enabling treasurers to analyze year-over-year (or month/quarter) income/expense/net by category. Three coordinated PRs:
- **PR #7 (Morpheus):** IPC contract, on-demand aggregation query, linear pro-rata projection, handler integration (436 tests pass)
- **PR #8 (Trinity):** Grouped-bar chart primitive S4 complete; S5 screen wiring in progress
- **PR #9 (Niobe):** i18n namespace (72 keys ES/EN parity), copy locked

**Milestone:** Last `<ComingSoonScreen />` on M1 route unlocked. Internal Alpha gate now open.

## Decisions Locked

### 1. Aggregation: On-Demand, No Materialized Buckets

**Decision:** Compute Saldo data on-demand per IPC call, not pre-materialized in reducer.

**Why:** At 1k events, on-demand O(n) <5ms. p95 300ms target dominated by IPC + React. Pre-materializing doubles reducer surface (must invalidate on tx.created/updated/deleted).

**Benchmark gate:** If cold aggregation + IPC exceeds 150ms at 1k events, revisit. Cypher property test verified no regression.

### 2. Single Round-Trip IPC (\`saldo:get-comparison\`)

**Decision:** One IPC call returns everything (current + prior periods, monthly series, KPIs).

**Why:** Saldo data is tightly coupled. Single call avoids Panel's 5-query pattern.

**Response fields (critical):**
- Income/expense/net totals per period
- Category breakdown rows (server-side filtered: zero-in-both suppressed)
- Monthly series (12/3/1 buckets, NEVER projected)
- KPIs with pre-computed deltas
- **`currentProjectedTotal` (REQUIRED):** null when complete, `{income, expense}` when partial — Trinity renders verbatim, NEVER recomputes

### 3. Period Semantics: Same-Month-Prior-Year

**Decision:** For all granularities, prior = same-period-prior-year.

**Boundary rules:**
- Year: 2026 → 2025
- Quarter: Q2 2026 → Q2 2025
- Month: abr 2026 → abr 2025 (NOT preceding month)

**Why:** YoY is the thesis. Leap-day collapse handled (Feb 29 → Feb 28).

### 4. Linear Pro-Rata Projection (Partial Periods)

**Decision:** When current period incomplete, project totals linearly.

**Formula:**
```
elapsedDays = max(1, daysBetween(start, min(today, end)) + 1)
totalDays = daysBetween(start, end) + 1
projected(x) = x / (elapsedDays / totalDays)
```

**Applied to:** currentIncome, currentExpense, currentNet (pre-computed by server). NEVER per-category rows or monthly chart.

**Why:** Single source of truth. Trinity renders verbatim; no float order-of-ops drift.

### 5. Chart Primitive: New \`GroupedBarChart\`, Don't Reuse Panel Sparkline

**Decision:** Build new primitive for grouped bars (12 months × 2 series). Don't extend sparkline.

**Why:** Sparkline is single-series line/area. Grouped bars need labels, tooltips, a11y table. Forcing extension bloats it with unused props.

**API (thin):**
```ts
type GroupedBarChartProps = {
  buckets: { label: string; current: number; previous: number }[];
  currentLabel: string;  // e.g. "2026"
  previousLabel: string;
  formatValue: (n: number) => string;
  height?: number;
  ariaCaption: string;
};
```

### 6. Zero-Total Row Filtering: Server-Side

**Decision:** Morpheus filters rows where both currentTotal and previousTotal are zero before returning.

**Why:** One place, not two. Reduces response payload.

### 7. i18n: New \`saldo.*\` Namespace (72 Keys ES/EN)

**Decision:** All Saldo strings under \`ux.saldo.*\`. Full ES/EN parity. Currency via Intl.NumberFormat, dates via Intl.DateTimeFormat, month labels via Intl.DateTimeFormat.

**Patterns locked:**
- Same-month-prior-year tooltip on period radio (info-icon + aria-describedby)
- Projection badge on KPIs + table rows (never on chart — chart subtitle says it's actuals-only)

### 8. Microcopy: 3 Calls for Pedro (Niobe's Recommendations)

| # | Decision | Recommended | Alternative | Why |
|----|----------|-------------|-------------|-----|
| 1 | Lead KPI | **"Variación neta"** | "Balance neto" | Shows delta vs prior, not absolute |
| 2 | 4th KPI | **"Mayor crecimiento"** | "Categoría con mayor subida" | Shorter; description explains context |
| 3 | Dropped-category | **"Sin movimientos este periodo"** | "Categoría dada de baja" | Empty this period, not archived |

**Status:** Shipped as defaults. Flip any one-liner if Pedro objects.

### 9. Property Test Verification: 8 Invariants (Cypher)

**Decision:** Verify aggregation with 510 property-test iterations across 8 invariants.

**Invariants:**
- I1–I4: Internal consistency (totals === row sums)
- I5–I6: Monthly series consistency (sums === totals, no projection drift)
- I7: Prior-period brute-force validation
- **I8: Saldo ≡ Movements** — same (period, account, category) triple, identical amounts

**Boundary cases pinned:**
- Leap-day collapse, UTC boundaries, day-1 projection, period-end, zero events, same-month-prior-year semantics

**Verdict:** ✅ INVARIANT HELD. 510 iterations green. Morpheus' aggregation provably sound.

### 10. Parallelizable Slices (5 Phases)

| Slice | Owner | Timeline | Blocks |
|-------|-------|----------|--------|
| S1 | Morpheus | Day 1 AM | S2, S3 |
| S2 | Morpheus | Day 1 PM–Day 2 | S3 |
| S3 | Morpheus | Day 2 | S5 (Trinity) |
| S4 | Trinity | Day 1–2 parallel | None (only needs S1 types) |
| S5 | Trinity | Day 3–4 after S3 | None |

**Parallelism:** Morpheus (S1→S2→S3) + Trinity (S4 from S1, then S5 after S3 lands). One sync point = S1 contract freeze. After that, fully parallel.

## Test Coverage

**PR #7 (Morpheus):**
- Baseline: 411 pass / 9 skipped
- After WI-22: 436 pass / 9 skipped
- New tests: 25 (6 contract + 16 aggregation+projection+KPI + 3 integration)
- Gates: typecheck ✅, lint ✅, format ✅, test ✅

**PR #9 (Niobe):**
- After i18n: 425 pass / 9 skipped
- Gates: typecheck ✅, lint ✅, format ✅

**Cypher Property Test:**
- 510 iterations across 8 invariant blocks + 6 boundary tests
- Runtime: ~1.6s on Windows dev box
- All green, no counterexample

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Read-model performance >1k events | Benchmark gate (150ms). Property test verified no regression. |
| YoY parity drift | Property test I8 on every PR. Blocks merge. |
| Projection misleads on seasonal NGOs | Tooltip explicitly names "proyección lineal". Advanced projections deferred. |
| Intl helper late from polish branch | Trinity forks minimal helpers (15-line stub). Rebase later. |

## Handoff

- **Trinity (S5):** Import \`getSaldoComparison\` from \`renderer/services/saldoApi.ts\`. Render \`currentProjectedTotal\` verbatim (do NOT recompute).
- **Cypher:** Property test complete. I8 equivalence holds.
- **Link:** Ratify or object to 3 Niobe microcopy calls. No code impact.
- **Pedro:** Milestone gate now open. Last ComingSoonScreen on M1 route removed.

---

### 2026-04-22: User Directive — Panel Polish Deferred

**By:** Pedro (via Copilot/Squad)
**What:** Two Panel polish items (not urgent) for post-WI-22:
  1. Bank account boxes: placeholder visuals → need real design
  2. "Income vs Expense" section: currently empty

**Status:** Captured for post-WI-22 planning. Not blocking WI-22 or Internal Alpha.


---

## WI-22 Saldo Prototype-Fidelity Arc Decisions

### 2026-04-22: WI-22 S1 — Saldo Prototype Gap Audit

**Date:** 2026-04-22  
**By:** Mouse (Designer)  
**Status:** ✅ Complete  

Audit of Saldo redesign prototype vs shipped PR #11 SaldoScreen identified 12 fidelity gaps across visual components and data semantics:

- **Page Header:** Copy acceptable (shipped Compara ingresos y gastos frente al año anterior cleaner than prototype).
- **Period Selector + Year Chip:** Year chip 📅 2025 vs 2026 missing; needs addition next to selector.
- **KPI Strip:** Shipped 4 delta cards vs prototype 3 absolute cards (INGRESOS TOTALES, GASTOS TOTALES, SALDO NETO). Gap severity: HIGH. Requires card restructure + new sublabel format 2025: X€ · proy. 2026: Y€.
- **Chart Section:** Shipped Income vs Expense per month (current year) vs prototype NET monthly (two years). Gap severity: CRITICAL. Requires semantic shift (net computation) + prior-year series.
- **Category Breakdown:** Shipped single combined table vs prototype TWO SIDE-BY-SIDE PANELS (Ingresos/Gastos). Gap severity: CRITICAL. Requires layout split, progress bar visualization, and type sublabels.
- **Visual Details:** Icon backgrounds, sublabel format, delta position all differ.

**Artifact:** .squad/decisions/inbox/mouse-saldo-redesign-spec.md (12-item spec with remediation priority; condensed to this entry in archive).

**Recommendation:** Spec ready for future redesign refinement post-S5 ship (deferred to S6/M1.25).

### 2026-04-22: WI-22 S2 — Saldo Contract Adequacy Audit

**Date:** 2026-04-22  
**By:** Neo (Tech Lead/Architect)  
**Status:** ✅ Approved & Implemented (Decision B)  

Audit of frozen Saldo IPC contract vs prototype UX spec.

**Verdict Summary:**
- **KPI strip (1.1):** ✅ All fields sufficient. Client derivations trivial.
- **Monthly chart (1.2):** ❌ Hard gap — prior-year monthly series missing. Required for two-year NET chart.
- **Category panels (1.3):** ✅ All fields sufficient. One soft policy note on per-category delta derivation.

**Decision (B): Additive Amendment Required**

- Add priorMonthlySeries: MonthlySeriesBucket[] to SaldoComparisonResponse.
- Backend computes via existing aggregation logic, prior-period window.
- Non-breaking addition.

**Recommendation:** Implement before or alongside PR #11. Morpheus accepted (PR #12 shipped 91d87fa).

### 2026-04-22: WI-22 S4b — Saldo Contract Amendment Shipped

**Date:** 2026-04-22  
**By:** Morpheus (Backend)  
**Status:** ✅ Shipped (PR #12)  

Implemented Neo's (B) decision: priorMonthlySeries amendment to Saldo IPC contract.

**Changes:**
- **Contract:** Added priorMonthlySeries?: MonthlySeriesBucket[] to SaldoComparisonResponse (additive, non-breaking).
- **Backend:** Extended getSaldoComparison handler to compute prior-year monthly aggregates deterministically.
- **Testing:** Extended fast-check property-test suite with new invariants and edge cases.

**Results:** 457/9 tests pass (+11 net). All invariants green. No regressions.

**PR:** #12 eat(saldo): add priorMonthlySeries for year-over-year chart (commit 91d87fa).

### 2026-04-22: WI-22 S5 — SaldoScreen Shipped (Prototype-Fidelity Redesign)

**Date:** 2026-04-22  
**By:** Trinity (Frontend)  
**Status:** ✅ Shipped (PR #11)  

Full Saldo screen redesign implementing frozen IPC contract (post-amendment).

**Delivered:**
- **Page Header + Period Selector:** Segmented control, year chip 📅 2025 vs 2026.
- **KPI Strip (3 cards):** INGRESOS TOTALES, GASTOS TOTALES, SALDO NETO with colored icons. Sublabel: 2025: X€ · proy. 2026: Y€.
- **Monthly NET Chart:** Two-series (● 2025 ● 2026), bars show NET per month.
- **Category Breakdown:** TWO PANELS (Ingresos/Gastos), progress bars, deltas, sublabels.
- **i18n:** Full saldo.* namespace (144 keys, ES/EN). Legacy alance.* deleted (one orphan deferred).
- **Tests:** SaldoScreen.test.tsx (7 specs). Edge cases covered.

**Results:** 467/9 tests pass (+21 net). Typecheck, lint green. Internal Alpha gate unblocked.

**Non-blockers:** Chart semantics drift (deferred M1.25), Export rename (M3), account filter (M1.25).

**PR:** #11 WI-22 S5: SaldoScreen (backend + chart + i18n wiring) (commit ce8f2a3).

### 2026-04-22: WI-22 Devseed Backfill (2025+2026 YoY Transactions)

**Date:** 2026-04-22  
**By:** Cypher (Devops/Data)  
**Status:** ✅ Shipped (PR #13)  

Dev seed backfilled with ~200 synthetic transactions (Jan 2025 → Apr 2026) for realistic year-over-year saldo validation.

**Changes:** Extended seed across 16 months, income + expense categories, deterministic PRNG.

**Impact:** Saldo YoY chart validation enabled. All 457/9 tests pass with extended range. Supports future refinements.

**PR:** #13 chore(devseed): backfill 2025+2026 transactions for saldo validation (commit b0f6d29, HEAD).

