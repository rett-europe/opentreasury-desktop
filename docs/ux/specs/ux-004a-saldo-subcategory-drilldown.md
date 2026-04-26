# UX-004a — Saldo Subcategory Drill-Down

> **Status:** Draft v0.1 · **Owner:** Niobe (Spec / UX Analyst) · **Date:** 2026-04-26  
> **Parent spec:** [`ux-004-saldo-screen.md`](./ux-004-saldo-screen.md)  
> **Issue:** [#67 WI-B](https://github.com/rett-europe/opentreasury-desktop/issues/67)  
> **Paired PRD:** [`docs/product/prds/prd-002-saldo.md`](../../product/prds/prd-002-saldo.md)

**Traceability:** UX-004 (parent spec) · PRD-002 (subcategory drill-down deferred to v1.x, now promoted) · issue #67 WI-B · decisions 2026-04-26 (interaction model Option A locked) · [UX-003](./ux-003-movements-screen.md) (subcategory taxonomy) · [UX-007](./ux-007-split-transactions.md) (split-category patterns).

---

## 1. Summary

Extends the Saldo screen (UX-004) with an optional **subcategory drill-down mode** that reveals per-subcategory YoY comparison within each category. Activated via a global toggle in the screen header, this mode recursively applies the same "top-N + Otras" aggregation pattern to subcategories, maintaining cognitive consistency with the existing category-level view.

**Locked decision (Pedro, 2026-04-26):** **Option (a) — Global toggle "Show subcategories" in the Saldo screen header**. This is the lowest-friction model: mirrors the existing top-8 + "Otras" pattern, avoids per-row state management, and keeps the interaction predictable. No per-category expand/collapse affordances.

## 2. User problem

The base Saldo screen (UX-004) aggregates by **category only**, collapsing all subcategories into their parent totals. For treasurers who use subcategories to distinguish funding sources (e.g., "Donaciones" → "Socios" / "Empresas" / "Eventos") or expense types (e.g., "Personal" → "Salarios" / "Seguridad Social" / "Formación"), the current view obscures important detail.

**Pain:** A treasurer sees "Donaciones +15% YoY" but doesn't know whether the growth is driven by corporate donations, membership fees, or event income — each has different sustainability implications for board planning.

**Evidence:** Issue #67 (user request); web-app reference shows subcategory drill-down in the Balance view; Pedro's confirmation: "let's go with A) for now" pattern.

## 3. Actors & preconditions

- **Treasurer / board-facing user** (Juan) — enrolled, DEK unwrapped, viewing Saldo screen.
- **App renderer** — mounts Saldo; toggle state managed client-side (non-persistent in v1).
- **Main process** — fulfills aggregation query with **extended per-subcategory breakdowns** (requires projection extension — see §11).

**Preconditions:** Same as UX-004 § 3 (first-run complete, ≥1 confirmed transaction).

## 4. Happy path — subcategory drill-down

Extends UX-004 §4 happy path. User has already loaded Saldo with default period (Año, 2026 vs 2025).

| # | User sees | User does | System does |
|---|---|---|---|
| 1 | Saldo screen loaded (UX-004 §4 step 3): two panels with category rows, KPI strip, chart | Scans header controls; notices **"Mostrar subcategorías"** toggle (off by default) next to the period selector | — |
| 2 | Toggle label: *"Mostrar subcategorías"* with `⌄` icon (closed state) | Click toggle | Toggle flips to ON; icon rotates to `⌃` (open state); panels re-render with expanded subcategory rows **client-side** (no new IPC — data already fetched in initial response per §11) |
| 3 | **Each category bar** in both panels now shows: <br>• Parent category row (unchanged visual; total still aggregates all subcategories)<br>• **Indented nested group** below with subcategory rows (top-8 by current-period absolute value + "Otras subcategorías" row if >8)<br>• Each subcategory row has the same 4-column structure: name, prior-period mini-bar, current-period mini-bar, delta pill | Scans "Donaciones" (Income panel): sees "Socios" (+22% YoY), "Empresas" (−5%), "Eventos" (+40%), etc. | Subcategory rows sorted by `current-period abs(income or expense)` descending within each category; top-8 displayed + remainder collapsed into "Otras subcategorías" |
| 4 | "Otras subcategorías" row (when >8 subcategories exist under a category): shows aggregated prior/current/delta for subcategories ranked 9+ | Hovers "Otras subcategorías" | Tooltip: *"{count} subcategorías: {list of first 3 names}, ..."* (§8 i18n key `saldo.subcategories.otras.tooltip`) |
| 5 | Categories with **0 or 1 subcategories** render parent-only (no degenerate nested row) | Scans panel | Clean; no visual clutter for categories without meaningful subcategory breakdown |
| 6 | **Compare mode ON** (period selector = Trimestre; prior-year data exists): subcategory rows show prior-year values + delta | Reviews Q1-2026 vs Q1-2025 with subcategories expanded | Delta classification (↑/↓/·) applies per-subcategory using same ±3% threshold as categories |
| 7 | **Compare mode with missing LY data**: a subcategory exists in CY but not LY (new subcategory added mid-year) | Sees delta column render `—` with tooltip *"Sin datos en periodo previo"* | Same E2 pattern from UX-004 §6, applied to subcategory rows |
| 8 | Satisfied; wants to share with board | Screenshots expanded view; toggle off to return to category-level summary | Toggle off → nested rows collapse; parent totals remain (they were never removed) |

### 4.1 Subcategory row structure (nested under each category)

| Col | Field | Notes |
|---|---|---|
| 1 | **Indented** subcategory name | 16px left-indent (or 1 level of CSS nesting); body-size font (same as category name); no bold |
| 2 | Prior-period total | Same mini-bar treatment as category rows (muted colour, opacity 0.4); **half-height bar** (8px vs 16px for category bars) to visually distinguish hierarchy |
| 3 | Current-period total | Same accent colour as category rows; **half-height bar** |
| 4 | Delta pill | Same `↑ / ↓ / ·` logic; ±3% flat threshold; tooltip includes projection when partial period (same as category rows) |

**Visual hierarchy cues:**
- **Indentation** (16px) signals nesting.
- **Half-height bars** (8px vs 16px) reduce visual weight of subcategories.
- **No colour changes** — subcategory bars inherit the panel's income/expense accent (green/red per Mouse's existing tokens).
- **Parent row unchanged** — category total remains bold, full-height bar, same position; subcategories render *below* it.

### 4.2 Top-N behaviour when expanded

When the toggle is ON, **each category independently applies the "top-8 + Otras" rule** to its subcategories:

1. Sort the category's subcategories by `current-period abs(amount)` descending.
2. Display the top 8 subcategories as individual rows.
3. If the category has ≥9 subcategories, aggregate subcategories 9–N into a single **"Otras subcategorías"** row with:
   - Name: localized via `saldo.subcategories.otras.label` (ES: *"Otras subcategorías"*, EN: *"Other subcategories"*).
   - Prior/current/delta: sum of the aggregated subcategories' values.
   - Tooltip on hover: `saldo.subcategories.otras.tooltip` → *"{count} subcategorías: {name1}, {name2}, {name3}, ..."* (first 3 names, ellipsis if >3).

**Rationale:** Mirrors the existing category-level "Otras" pattern (UX-004 top-8 categories + "Otras categorías"). Users already understand this affordance; recursive application reduces cognitive load.

### 4.3 Categories with 0 or 1 subcategories

**Edge case:** A category has:
- **0 subcategories** — all transactions under this category have `subcategoryId: null`.
- **1 subcategory** — only one distinct subcategory under this category.

**Behaviour when toggle is ON:** Render the **parent row only**. Do NOT render a degenerate nested row (it would show the same total as the parent, adding no information).

**Implementation note:** The projection MUST still include the subcategory breakdown in the response (even if 0 or 1 subcategories exist) so the renderer can decide whether to render nested rows. A null check on the response is insufficient — the renderer needs the count.

## 5. States

Extends UX-004 §5. No new top-level states; toggle affects rendering within the existing `loaded` / `loaded-partial-period` states.

| State | What's shown | Interactive? | Copy key root |
|---|---|---|---|
| `loaded` + toggle OFF | Same as UX-004 §5 `loaded` (category-level aggregation only) | Yes | `ux.saldo.loaded` |
| `loaded` + toggle ON | Category rows + nested subcategory rows (per §4.1) | Yes | `ux.saldo.loaded` + `ux.saldo.subcategories.*` |
| `loaded-partial-period` + toggle ON | Same as above + projection tooltips on **both** category and subcategory delta pills | Yes | `ux.saldo.partial.annotation` (shared) |
| `empty-db` | Toggle hidden (no data to drill into) | No | n/a |
| `empty-only-current` / `empty-only-prior` | Toggle visible but disabled (single-period data insufficient for meaningful subcategory comparison) | Disabled | `ux.saldo.subcategories.toggle.disabled.tooltip` |

**Global states** (offline, syncing, locked, error-banner) stack above via UX-006 shell slot; subcategory toggle state is independent.

## 6. Edge cases & errors

Extends UX-004 §6.

| Trigger | User sees | Recovery |
|---|---|---|
| **E1.** Category has 0 subcategories | Parent row only when toggle ON; no nested rows | — |
| **E2.** Category has 1 subcategory | Parent row only when toggle ON (degenerate case suppressed) | — |
| **E3.** Subcategory exists in current period but not prior (new subcategory added mid-year) | Subcategory row shows current-period bar + delta column renders `—` with tooltip *"Sin datos en periodo previo"* | Same as category-level E2 (UX-004 §6) |
| **E4.** All subcategories under a category are zero-zero (both periods) | When toggle ON, category row shows zero bars; no nested rows (subcategories suppressed per top-N rule) | — |
| **E5.** Category has >8 subcategories; "Otras subcategorías" row has zero total | "Otras subcategorías" row hidden (zero-total suppression applies recursively) | — |
| **E6.** Toggle ON + Compare mode ON + partial period + decrypt failures | Projection tooltip suppressed on affected subcategories (same UX-004 §11 Q10 rule: projection on incomplete actuals is misleading); decrypt-partial banner remains at screen level | User sees banner; knows totals incomplete |
| **E7.** Subcategory deleted/archived (historical tx still reference it) | Subcategory name resolves to `null` (same as category resolution); renderer shows locale-appropriate label via `saldo.subcategories.uncategorized` | — |
| **E8.** User toggles ON → period selector change → toggle state | Toggle state **persists across period changes** (client-side state; no server round-trip) | User expectation: toggle is a view-mode preference, not tied to the query |
| **E9.** Toggle ON → account filter change → toggle state | Same as E8: toggle state persists | Consistent behaviour |

## 7. Accessibility

Extends UX-004 §7.

- **Tab order:** Toggle control appears after period selector, before account filter (same header row). Toggle is a single focusable button with `aria-pressed` state (true/false).
- **Toggle affordance:**
  - Label: *"Mostrar subcategorías"* / *"Show subcategories"* (localized).
  - `aria-label`: *"Mostrar subcategorías. Estado: {cerrado|abierto}"* (dynamic based on toggle state).
  - Icon-only variant (if space-constrained): ensure `aria-label` is complete ("Mostrar subcategorías").
  - Keyboard: `Space` or `Enter` toggles state.
- **Nested row structure:**
  - Parent category row: `role="row"`, `aria-expanded="false"` when toggle OFF, `aria-expanded="true"` when toggle ON.
  - Subcategory rows: `role="row"`, `aria-level="2"` to signal nesting depth.
  - Each subcategory row's `aria-label` MUST include both subcategory name AND parent category name for context:
    - Example: `aria-label="Socios, subcategoría de Donaciones. Año actual: 12.340 EUR. Año anterior: 10.100 EUR. Delta: +22%."` (ES)
    - Example: `aria-label="Members, subcategory of Donations. Current year: €12,340. Prior year: €10,100. Delta: +22%."` (EN)
  - "Otras subcategorías" row: `aria-label="Otras subcategorías de {parentCategoryName}. {count} subcategorías agregadas. Año actual: ... Delta: ..."`.
- **Screen-reader announcement on toggle:**
  - When toggle flips ON: `aria-live="polite"` region announces *"{N} categorías expandidas con subcategorías"* (count of categories that have ≥2 subcategories and therefore render nested rows).
  - When toggle flips OFF: announces *"Vista resumida por categorías"*.
- **Colour not sole channel:** Same as UX-004 §7 — delta arrows (↑/↓/·) + bar position + aria-label carry the information; colour is supplementary.
- **Reduced motion:** Nested rows fade in (no slide animation); same as parent spec.

## 8. i18n notes (day-0 ES + EN)

Extends UX-004 §8. New keys under `ux.saldo.subcategories.*`.

| Key | ES | EN |
|---|---|---|
| `ux.saldo.subcategories.toggle` | "Mostrar subcategorías" | "Show subcategories" |
| `ux.saldo.subcategories.toggle.aria.closed` | "Mostrar subcategorías. Estado: cerrado" | "Show subcategories. State: closed" |
| `ux.saldo.subcategories.toggle.aria.open` | "Mostrar subcategorías. Estado: abierto" | "Show subcategories. State: open" |
| `ux.saldo.subcategories.toggle.disabled.tooltip` | "Insuficientes datos para comparar subcategorías" | "Insufficient data to compare subcategories" |
| `ux.saldo.subcategories.expanded.announce` | "{count} categorías expandidas con subcategorías" | "{count} categories expanded with subcategories" |
| `ux.saldo.subcategories.collapsed.announce` | "Vista resumida por categorías" | "Summary view by categories" |
| `ux.saldo.subcategories.uncategorized` | "Sin subcategoría" | "Uncategorized" |
| `ux.saldo.subcategories.otras.label` | "Otras subcategorías" | "Other subcategories" |
| `ux.saldo.subcategories.otras.tooltip` | "{count, plural, one {# subcategoría} other {# subcategorías}}: {names}" | "{count, plural, one {# subcategory} other {# subcategories}}: {names}" |
| `ux.saldo.subcategories.row.aria` | "{subcategoryName}, subcategoría de {categoryName}. Año actual: {current}. Año anterior: {prior}. Delta: {delta}." | "{subcategoryName}, subcategory of {categoryName}. Current year: {current}. Prior year: {prior}. Delta: {delta}." |

**Locale-aware formatters:** Same as UX-004 §8 — currency (`Intl.NumberFormat` with `style: 'currency', currency: 'EUR'`), percentages, month labels — no changes needed.

**Pluralization (ICU):** `otras.tooltip` key uses ICU plural syntax for `{count}`.

**No hardcoded strings.** CI missing-key lint passes.

## 9. Copy guidance

Extends UX-004 §9. Same tone: analytical, neutral, never alarmist. A subcategory with –30% delta is a fact to investigate, not a problem.

**Additional guidance for subcategory rows:**
- **"Otras subcategorías"** is neutral; avoid *"Resto"* (implies unimportant) or *"Miscelánea"* (implies unrelated).
- **Tooltip for "Otras"** lists first 3 names to give the user a sense of what's aggregated, without overwhelming them with a 20-name list.
- **Uncategorized subcategory** (tx has `categoryId` but `subcategoryId: null`): label as *"Sin subcategoría"* / *"Uncategorized"* — mirrors the category-level *"Sin categoría"* pattern.

## 10. Out of scope

- **Per-category expand/collapse affordances** (Option B/C from issue #67 discussion) → Rejected; global toggle (Option A) chosen.
- **Persistent toggle state** (saved to user preferences across sessions) → v1.x. In v1, toggle resets to OFF on screen unmount.
- **Drill-through from subcategory row to Movements** → v1.x (same as category drill-through, UX-004 §10).
- **User-reorderable subcategories** → v1.x.
- **Subcategory colour overrides in drill-down** → v1.x. All subcategories inherit the panel accent (income green, expense red); subcategory.color field exists in the schema but is NOT rendered in Saldo v1.
- **Export subcategory breakdown to CSV/PDF** → M3/M4 (extends UX-017 / PRD-008). Base export in M3 will include subcategory columns if toggle is ON when user exports.
- **Visual treatment details** (exact indentation px, bar heights, toggle icon SVG) → **Mouse**.
- **Projection extension implementation** (backend work) → **Morpheus** (see §11).

## 11. Projection extension required (prerequisite)

**Finding:** The current `SaldoCategoryNet` schema ([`app/src/shared/ipc-contracts/saldo.ts` lines 51–60](../../../app/src/shared/ipc-contracts/saldo.ts)) does NOT expose per-subcategory aggregates. The schema has:

```typescript
export const saldoCategoryNetSchema = z.object({
  categoryId: z.string().nullable(),
  categoryName: z.string().nullable(),
  income: z.number().nonnegative(),
  expense: z.number().nonnegative(),
});
```

**Gap:** No `subcategories` field. To support drill-down, the projection MUST return per-subcategory breakdowns.

**Solution:** Extend the schema to include an **optional** `subcategories` array on each `SaldoCategoryNet` record. Optional to preserve backwards compatibility (existing consumers ignore the new field).

### 11.1 Proposed contract extension (for Morpheus)

**File:** `app/src/shared/ipc-contracts/saldo.ts`

**New schema:**

```typescript
// Subcategory-level net for one period. Structure mirrors SaldoCategoryNet.
export const saldoSubcategoryNetSchema = z.object({
  subcategoryId: z.string().nullable(),
  // `null` when the transaction's subcategory is missing (deleted/archived) 
  // or the bucket is the explicit uncategorized bucket (subcategoryId === null).
  subcategoryName: z.string().nullable(),
  income: z.number().nonnegative(),
  expense: z.number().nonnegative(),
});
export type SaldoSubcategoryNet = z.infer<typeof saldoSubcategoryNetSchema>;

// Extend existing SaldoCategoryNet with optional subcategories breakdown.
export const saldoCategoryNetSchema = z.object({
  categoryId: z.string().nullable(),
  categoryName: z.string().nullable(),
  income: z.number().nonnegative(),
  expense: z.number().nonnegative(),
  // NEW: per-subcategory breakdown for this category. Optional at the wire
  // level for backwards compat; renderer expects it to be populated when 
  // requesting WI-B-aware data. Sorted by current-period abs(amount) desc.
  subcategories: z.array(saldoSubcategoryNetSchema).optional(),
});
export type SaldoCategoryNet = z.infer<typeof saldoCategoryNetSchema>;
```

**Projection logic (core/query/saldo.ts):**

1. In `aggregatePeriod`, extend the `categoryMap` to track a nested `subcategoryMap` per category.
2. When iterating `effectiveAmounts(tx, model)`, accumulate income/expense not only by `categoryId` but also by `(categoryId, subcategoryId)` pair.
3. Resolve subcategory names via `model.configCategories[].subcategories[]` (subcategories are inlined on the category record per WI-21).
4. Sort each category's subcategories by `abs(income - expense)` descending (or `abs(income)` for income panel, `abs(expense)` for expense panel — spec ambiguity; recommend **current-period total absolute value** to match category-level sort).
5. Populate `SaldoCategoryNet.subcategories` array in the response.

**No new IPC channel.** The existing `saldo:get-comparison` channel response schema is extended; renderer can optionally consume the new field.

**Backwards compatibility:** Existing renderer code (pre-WI-B) ignores `subcategories` field (TypeScript treats optional fields as `| undefined`). No migration needed.

### 11.2 Prerequisite work item for Morpheus

**Title:** Extend Saldo projection with per-subcategory aggregates  
**Owner:** Morpheus  
**Blocker for:** WI-B renderer implementation (Mouse + Trinity)  
**Files to modify:**
- `app/src/shared/ipc-contracts/saldo.ts` (schema extension per §11.1)
- `app/src/core/query/saldo.ts` (aggregation logic)
- `app/src/core/query/saldo.test.ts` (unit tests for subcategory aggregation)
- `app/src/core/query/saldo.property.test.ts` (property test: sum of subcategory nets === category net)

**Acceptance criteria:**
1. `SaldoComparisonResponse.currentPeriod.netByCategory[i].subcategories` is populated with sorted subcategory breakdowns.
2. Same for `priorPeriod.netByCategory[i].subcategories`.
3. Property test: `sum(category.subcategories[].income) === category.income` (within ε for floating-point rounding).
4. Property test: `sum(category.subcategories[].expense) === category.expense`.
5. Subcategories sorted by `current-period abs(income or expense)` descending (match panel type).
6. Archived subcategories still resolve (name field populated if archived).
7. Deleted/null subcategories resolve to `subcategoryName: null`.
8. Categories with 0 subcategories have `subcategories: []` (not `undefined` — always populated for renderer simplicity).

**Hand-off to Mouse:** Once Morpheus ships the projection extension, Mouse can implement the visual treatment (indented rows, half-height bars, toggle control) and Trinity can wire the toggle state + rendering logic.

## 12. Open questions

**All resolved.** Locked decisions documented below:

1. **Interaction model** — **LOCKED (Pedro, 2026-04-26):** Option (a) — Global toggle "Show subcategories". Rationale: Lowest cognitive load, mirrors existing top-8 + "Otras" pattern, no per-row state management.
2. **Aggregation source** — **ANSWERED (Niobe, 2026-04-26):** Subcategory data is NOT currently aggregated in the projection. Requires extension per §11. Morpheus prerequisite work item defined.
3. **Top-N behaviour when expanded** — **LOCKED:** Each category applies "top-8 + Otras subcategorías" rule recursively (§4.2).
4. **Visual treatment** — **RECOMMENDED:** Indented nested rows (16px indent) + half-height bars (8px vs 16px) to signal hierarchy. No new colour primitives; inherit panel accent. Mouse owns final CSS recipe.
5. **Sort order** — **LOCKED:** Subcategories sorted by `current-period abs(income or expense)` descending (matches category-level sort rule).
6. **Compare mode interaction** — **LOCKED:** When both Compare-Year mode AND Show-Subcategories are ON, render full 2×2 (CY/LY × cat/subcat). LY subcategory delta shows `—` when LY had no data for that subcategory. Same delta-classification helper (±3% threshold).
7. **Empty / single-subcategory categories** — **LOCKED:** Render parent row only; no degenerate nested row (§4.3 + E1/E2).
8. **Accessibility** — **LOCKED:** aria-labels include both subcategory name AND parent name for context (§7). `aria-level="2"` for nested rows. `aria-live="polite"` announces expansion count.
9. **Test plan** — **DEFINED (§13):** Unit tests for top-N aggregation, property tests for sum invariants, integration tests for toggle state, a11y tests for aria-label patterns.

## 13. Test plan (for Trinity)

### 13.1 Unit tests (renderer logic)

**File:** `app/src/renderer/screens/SaldoScreen/SaldoScreen.subcategories.test.tsx` (new)

1. **Toggle state management:**
   - `it('defaults toggle to OFF on mount')`
   - `it('toggles ON when user clicks toggle')`
   - `it('persists toggle state across period selector changes')`
   - `it('persists toggle state across account filter changes')`
   - `it('resets toggle to OFF on screen unmount → remount')` (v1 behaviour; non-persistent)

2. **Top-N rendering:**
   - `it('renders top-8 subcategories when category has 10 subcategories')`
   - `it('renders "Otras subcategorías" row aggregating subcategories 9–10')`
   - `it('sorts subcategories by current-period abs(amount) desc')`
   - `it('does NOT render "Otras subcategorías" when category has ≤8 subcategories')`

3. **Edge cases:**
   - `it('renders parent row only when category has 0 subcategories')`
   - `it('renders parent row only when category has 1 subcategory')`
   - `it('renders delta "—" for subcategory with prior-period = 0')`
   - `it('hides "Otras subcategorías" row when aggregated total is zero')`

4. **Accessibility:**
   - `it('renders toggle with aria-pressed="false" when OFF')`
   - `it('renders toggle with aria-pressed="true" when ON')`
   - `it('renders subcategory rows with aria-level="2"')`
   - `it('renders subcategory aria-label with parent category name included')`
   - `it('announces expansion count via aria-live when toggled ON')`

### 13.2 Integration tests (IPC + projection)

**File:** `app/src/main/ipc/handlers/saldo.subcategories.test.ts` (new)

1. **Projection extension:**
   - `it('returns subcategories array on each SaldoCategoryNet')`
   - `it('sorts subcategories by current-period abs(amount) desc')`
   - `it('resolves subcategory names from model.configCategories[].subcategories[]')`
   - `it('resolves archived subcategory names (historical tx)')`
   - `it('resolves deleted subcategory name to null')`
   - `it('returns empty array when category has no subcategories')`

2. **Sum invariants (property tests):**
   - `it('sum(subcategories[].income) === category.income (within ε)')`
   - `it('sum(subcategories[].expense) === category.expense (within ε)')`

### 13.3 E2E tests

**File:** `tests/e2e/saldo-subcategories.spec.ts` (new)

1. **Smoke test:**
   - User loads Saldo → toggle ON → sees nested subcategory rows → toggle OFF → nested rows collapse.
2. **Keyboard nav:**
   - Tab to toggle → press Space → expanded → Tab through subcategory rows → each row focusable for tooltip.
3. **Screen-reader:**
   - Toggle ON → aria-live region announces count → subcategory row aria-label includes parent name.

**Coverage target:** Same as UX-004 base spec — all E2E gates must pass before WI-B ships.

## 14. Acceptance criteria

- **AC1** — Toggle control renders in Saldo header after period selector, before account filter. Default state: OFF.
- **AC2** — When toggle is ON, each category with ≥2 subcategories renders nested subcategory rows (indented, half-height bars).
- **AC3** — Subcategory rows sorted by current-period absolute value descending; top-8 displayed + "Otras subcategorías" if >8.
- **AC4** — "Otras subcategorías" row aggregates subcategories 9–N; tooltip lists first 3 names + count.
- **AC5** — Categories with 0 or 1 subcategories render parent row only (no degenerate nested rows).
- **AC6** — Delta pill on subcategory rows uses same ±3% flat threshold as category rows.
- **AC7** — Subcategory rows in Compare mode show prior-year values + delta; `—` when prior-year data missing.
- **AC8** — Partial-period projection tooltip appears on subcategory delta pills when period is partial.
- **AC9** — Toggle state persists across period selector changes and account filter changes (client-side state management).
- **AC10** — Toggle state resets to OFF on screen unmount (non-persistent in v1).
- **AC11** — All user-visible strings resolve through i18n layer in `es` and `en`. CI missing-key lint passes.
- **AC12** — Subcategory row `aria-label` includes both subcategory name AND parent category name for screen-reader context.
- **AC13** — `aria-live="polite"` region announces expansion count when toggle flips ON.
- **AC14** — **Projection extension prerequisite (Morpheus):** `SaldoComparisonResponse` includes `subcategories` array on each `SaldoCategoryNet` record, sorted by current-period abs(amount) desc. Property tests confirm sum invariants (§11.2 AC3/AC4).
- **AC15** — **Renderer never reads filesystem or computes aggregations locally** — all subcategory data via schema-validated IPC (same C13/R12 contract as UX-004).
- **AC16** — No plaintext PII in logs or console (R15).

## 15. Traceability matrix

| Requirement | Source | Where in this spec |
|---|---|---|
| Global toggle interaction model (Option A) | Issue #67, Pedro decision | §1, §2, §4 |
| Top-8 + "Otras subcategorías" recursive pattern | UX-004 top-N pattern | §4.2 |
| Subcategory rows sorted by current-period abs(amount) desc | UX-004 PR8 (category sort) | §4.2, §11.2 |
| Delta classification (±3% threshold) | UX-004 §4.1 delta rule | §6 E6, AC6 |
| Compare mode with missing LY data shows `—` | UX-004 §6 E2 | §6 E3, AC7 |
| Partial-period projection on subcategory deltas | UX-004 PR3 | §6 E6, AC8 |
| Renderer isolation (no local aggregation) | UX-004 AC8 (C13, R12) | AC15 |
| i18n day-0 ES + EN | UX-004 AC4 (PRD-002 PR18) | §8, AC11 |
| Accessibility (WCAG 2.1 AA) | UX-004 §7 (PRD-002 PR16) | §7, AC12/AC13 |
| Projection extension prerequisite | This spec §11 | §11, AC14 |

## 16. Visual intent (for Mouse)

**DO NOT pre-empt CSS class names or exact px values.** This section documents **visual intent** only; Mouse translates to CSS recipes.

### 16.1 Toggle control

- **Position:** Saldo screen header, same row as period selector. Order: `Period selector | Period pill | Toggle | Account filter`.
- **Appearance:** Button with label *"Mostrar subcategorías"* + chevron icon (`⌄` when OFF, `⌃` when ON).
- **State:** OFF by default. Pressed state via `aria-pressed` (no separate ON/OFF styles beyond the icon rotation).
- **Responsive:** On narrow viewports (<768px), consider icon-only variant with full `aria-label`.

### 16.2 Nested subcategory rows

- **Indentation:** 16px left-indent (or 1 CSS nesting level) relative to parent category row.
- **Bar height:** Half-height (8px) vs category bars (16px). Same colours (income green, expense red per existing tokens).
- **Font:** Body size (same as category name), no bold (parent is bold), same colour as category text.
- **Spacing:** 4px vertical gap between subcategory rows; 8px gap between last subcategory row and next category row (to visually close the nested group).

### 16.3 "Otras subcategorías" row

- **Label:** Italic font-style to distinguish from explicit subcategories.
- **Tooltip trigger:** Entire row is hoverable; tooltip appears on hover with 200ms delay.
- **Tooltip content:** *"{count} subcategorías: {name1}, {name2}, {name3}, ..."* (first 3 names, ellipsis if >3).

### 16.4 Existing CSS tokens — no new primitives

- **Colours:** Use existing `--color-income-accent` (green), `--color-expense-accent` (red), `--color-text-muted` (prior-year bars).
- **Bar fills:** Same mini-bar treatment as category rows (gradient or flat fill per existing SaldoScreen CSS).
- **No new colour variables** for subcategory-specific styling.

## 17. Status history

| Date | Status | By | Notes |
|---|---|---|---|
| 2026-04-26 | Draft v0.1 | Niobe | WI-B spec for issue #67. Interaction model Option A locked (global toggle). Projection extension prerequisite documented for Morpheus. Hand-off plan: Morpheus (projection) → Mouse (CSS) → Trinity (wiring + tests). |

---

*End of UX-004a Draft — next: Pedro reviews, Morpheus implements projection extension (§11), Mouse implements visual treatment (§16), Trinity wires toggle + tests (§13).*
