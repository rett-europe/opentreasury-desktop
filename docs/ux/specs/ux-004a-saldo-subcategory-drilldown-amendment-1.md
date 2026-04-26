# UX-004a — Amendment 1: Toggle placement + crowding fix

> **Status:** Draft v0.1 · **Owner:** Niobe (Spec / UX) · **Date:** 2026-04-29
> **Parent spec:** [`ux-004a-saldo-subcategory-drilldown.md`](./ux-004a-saldo-subcategory-drilldown.md)
> **Issue:** [#78](https://github.com/rett-europe/opentreasury-desktop/issues/78) (Pedro dogfood feedback, F1 + F2)
> **Out of scope:** F3 (projection / category placement by intrinsic type) — owned by Morpheus in parallel. This amendment must NOT alter category placement rules; placement follows intrinsic type, not net sign.

---

## 1. Why this amendment

Pedro tested the just-shipped Saldo subcategory drill-down (#67 WI-B) and reported:

- **F1 — Toggle invisible.** The `Mostrar subcategorías` pill in `.ot-saldo-controls` reads as just another control next to the year picker. Users do not connect it with the panels below.
- **F2 — Crowding & misalignment.** With the toggle ON across many parent categories, subbars look noisy and bars do not visually align across categories. Root cause: each row scales bars to its **own** `max(prior, current)`, so a 1.000 € subrow under a small parent looks the same width as a 50.000 € subrow under a large parent.

F1 is a placement decision; F2 is a scaling + density decision. Both stay within the existing class contracts; no token changes.

---

## 2. F1 — Toggle placement (decision)

**Decision: Option (b) — per-panel toggle pill, anchored to the panel's column-header row, with a single shared state.**

Rationale:

- Honours Pedro's "near the section divider" hint — the column-header strip with the bottom rule (`.ot-saldo-panel__columns`) IS the divider where subrows appear.
- Preserves the parent spec's "global toggle, lowest cognitive load" rationale (§1, §4): the two pills share **one** `showSubcategories` state, so clicking either flips both panels in sync. There is still one mental model, just two affordances.
- Rejects (a) — a single in-panel toggle would be asymmetric across the two panels and forces users to look across columns.
- Rejects (c) — per-category chevrons multiply state, contradict the parent spec's locked decision (Pedro 2026-04-26: "no per-category expand/collapse"), and reintroduce the cognitive load that Option A was chosen to avoid.

### 2.1 Placement & visuals

- The toggle moves **out** of `.ot-saldo-controls` (header row keeps Mode + YearPickers only).
- A `SubcategoryToggle` pill renders **inside each `.ot-saldo-panel`**, positioned on the right of the column-header row (`.ot-saldo-panel__columns`), aligned with the rightmost column. It sits on the same baseline as the column labels and shares their bottom rule, so it visually belongs to the divider.
- Existing class `.ot-saldo-toggle-subcategories` is reused unchanged. Add ONE wrapper modifier `.ot-saldo-toggle-subcategories--inline` for the new positioning context (smaller padding `var(--space-2) var(--space-4)`, `font-size-12`); the base pill stays untouched so the design system contract holds.
- Both pills are bound to the same `showSubcategories` state. Each pill keeps `aria-pressed`, both render the same label/icon. `data-testid="saldo-subcategories-toggle"` becomes `saldo-subcategories-toggle-income` and `…-expense`.

### 2.2 i18n

No new keys. Reuse `saldo.subcategories.toggle`, `saldo.subcategories.toggleAriaOpen/Closed`. The aria-live announce region (`saldo-subcategories-announce`) stays a **single** node at the top of the loaded view — one announcement per state change, regardless of which pill was clicked.

---

## 3. F2 — Crowding & misalignment (decision)

**Root cause confirmed in code:** both `CompareRow` (line ~1120) and `CompareSubRow` (line ~1228) compute `maxVal = Math.max(row.prior, row.current, 1)` **per row**. So bar widths only encode within-row prior↔current ratio; they do NOT encode magnitude across rows. With subrows expanded, this produces visually equal-length bars for very different amounts → "crowded and unaligned" perception.

### 3.1 Smallest fix: shared per-panel scale

- Compute, **once per panel render**, `panelMaxAbs = max over visible rows AND visible subrows of (row.prior, row.current)` (clamped to ≥1).
- Pass `panelMaxAbs` down to `CompareRow` / `SingleRow` / `CompareSubRow` / `SingleSubRow`. All bar widths in a panel become `value / panelMaxAbs * 100%`.
- Effect: a small subbar under a big parent now reads as small; bars across categories share a ruler. Alignment is restored without touching grid templates.
- Risk: a panel with one very large category will compress all other bars. Acceptable — that IS the truthful picture, and parent rows already communicate magnitude through their own bars at the same scale.

### 3.2 Smallest fix: density cap

- Reduce per-category visible subrows from **top-8 + Otras** to **top-5 + Otras** when the toggle is ON. Parent spec §4.2 stays the source of truth; this amendment narrows the cap. The "Otras subcategorías" rollup absorbs ranks 6+.
- Rationale: with many parents expanded simultaneously, 8 subs each is what makes the panel feel like a wall. 5 is the published "magic number" for at-a-glance comparison and matches what Pedro's screenshot shows as comfortable.
- The cap remains a single rule per category; no per-category state, no hover-to-reveal, no focus mode. (Hover/focus modes were considered and rejected: they introduce state and hide data Pedro just asked to surface.)

### 3.3 Density rhythm (no new tokens)

- Keep `.ot-saldo-subrow` padding as today.
- Add a subtle visual grouping cue: a 2px left guide rule using `var(--color-divider)` on `.ot-saldo-subrow` (via `border-left`, inset by the existing `padding-left: var(--space-6)`). This makes the indented sub-group read as one block per parent without adding background fills or new tokens.
- Increase the inter-group gap by promoting `.ot-saldo-subrow:last-child { padding-bottom: var(--space-6); }` (was `--space-5`). One-step rhythm bump; no layout change.

### 3.4 Default behavior (unchanged from parent spec)

- Toggle OFF (default): parent category rows only. Bars scale against `panelMaxAbs` computed from parent rows alone (no behavior change vs today; subrows simply don't enter the max).
- Toggle ON: parent + top-5 + Otras subrows per eligible category (§4.3 of parent: ≥2 meaningful subs). Bars scale against `panelMaxAbs` including subrows.

---

## 4. Class contract changes

| Change | Class | Notes |
|---|---|---|
| Add modifier | `.ot-saldo-toggle-subcategories--inline` | Smaller pill for in-panel placement. Composes with base. |
| Tighten | `.ot-saldo-subrow:last-child` padding-bottom | `--space-5` → `--space-6`. |
| Add | `.ot-saldo-subrow { border-left: 2px solid var(--color-divider); }` (or equivalent ::before) | Visual grouping cue. Mouse to choose final selector. |

No new CSS tokens. No grid template changes. `.ot-saldo-subrow--compare/--single` and `.ot-saldo-row*` are untouched.

---

## 5. Tests to add / update

- **Unit (SaldoScreen.test.tsx):**
  - Scaling: with toggle ON, given a panel where parent A=100 and a subrow under parent B=10, assert sub bar `width` style is `~10%` (currently it would render ~100% due to per-row max). Test via `style` regex.
  - Cap: given a parent with 9 meaningful subs, assert exactly 5 explicit subrow `data-testid`s + 1 `Otras` row (was 8 + Otras).
  - Toggle parity: clicking the income-side pill flips `aria-pressed` on BOTH `saldo-subcategories-toggle-income` and `…-expense`. Single announce node fires once.
- **Existing tests** that asserted `top-8 + Otras` need updating to `top-5 + Otras`. Existing `data-testid="saldo-subcategories-toggle"` assertions split into the two suffixed ids.
- **a11y:** `aria-pressed` synced across both pills; `aria-live` region count unchanged (one).

---

## 6. Out of scope / non-goals

- F3 (projection fix, category placement by intrinsic type) — Morpheus.
- Per-category expand/collapse — explicitly rejected; do not reintroduce.
- New tokens, new colors, hover-to-reveal, focus modes — rejected as larger than the issue warrants.
- Persisting toggle state — still client-side only (parent spec §3).

---

## 7. Implementation handoff

- **Mouse:** CSS — add `.ot-saldo-toggle-subcategories--inline`, the left guide on `.ot-saldo-subrow`, and the `padding-bottom` bump.
- **Trinity:** TSX — render `SubcategoryToggle` twice (one per panel) with the inline modifier, anchored in `.ot-saldo-panel__columns`; remove from `.ot-saldo-controls`. Lift `panelMaxAbs` computation into the panel render and thread to row + subrow components. Change `TOP_N` for subrows from 8 to 5 in the aggregation helper.
- Update tests per §5. Run existing Saldo Playwright/Vitest suites.
