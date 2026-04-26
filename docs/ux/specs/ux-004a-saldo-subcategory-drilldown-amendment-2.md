# UX-004a — Amendment 2: Compare-mode bars pivot to per-year side-by-side layout

> **Status:** Draft v0.3 · **Owner:** Mouse (Visual / CSS) · **Date:** 2026-04-26 (v0.1) · **Updated:** 2026-04-27 (v0.3)
> **Parent spec:** [`ux-004a-saldo-subcategory-drilldown.md`](./ux-004a-saldo-subcategory-drilldown.md)
> **Supersedes (visual only):** Amendment 1 §3.1 bar geometry (the panel-shared scale and `panelMaxAbs` denominator are unchanged; only the in-row arrangement of the two bars changes).
> **Trigger:** Pedro dogfood feedback 2026-04-26 — directive `.squad/decisions/inbox/copilot-directive-20260426-180716-saldo-compare-layout.md` (verbatim: *"Looking again into the original prototype, can you also take a look at image ingresos_gastos.png? It shows a very clean comparison 2025 vs 2026… the bars are not piled on each other, but rather side by side (smaller on 2025 than on 2026)."*).
> **v0.2 trigger:** Second Pedro dogfood pass 2026-04-27 — *"there's a lot of 'vs 2024' below each sub-category, that gets super confusing. And the text '2024 2025 ↑' on the top is not aligned with the bars. The example I showed was much cleaner — on the left, small bars (with the date 2025 on the top) and on the right, bigger bars (with the date 2026 on the top)."*
> **v0.3 trigger:** Third Pedro dogfood pass 2026-04-27 — *"I don't see any difference on the bars... still messy, bars are now showing up on top, not side by side..."* The v0.2 vertical stack inside each cell read as bars stacked between rows; reverted to a horizontal `[ bar | value-text ]` cell so the two year bars in a row sit on the SAME baseline and clearly read as side-by-side.
> **Reference prototype:** `.squad/decisions/inbox/ingresos_gastos.png`.

---

## 1. Why this amendment

The previous render (UX-004 §6 + UX-004a Amendment 1 §3.1) places both bars inside a single `.ot-saldo-row__bars` cell, **stacked vertically** — prior pale bar on top of current saturated bar. The original prototype `ingresos_gastos.png` instead places each year's value-text + bar **together in its own column**, side by side across the row. With prior on the left and current on the right, the two bars "face" each other across the column gutter, producing a much cleaner mirror silhouette and unambiguously associating each bar with its year header (`2025` / `2026 (ene–abr)`).

Pedro reviewed both renders and prefers the prototype layout.

## 2. Layout decision

Compare-mode rows (`.ot-saldo-row--compare`) and subrows (`.ot-saldo-subrow--compare`) collapse from a 5-column grid to a **4-column** grid:

```
| name (1fr) | prior-cell | current-cell | Δ |
```

Each year cell is a **horizontal layout** (v0.3 — supersedes v0.2's vertical stack):

- **Prior cell** — `[ bar-track | value-text ]`. The pale bar fills the left (1fr) portion of the cell and grows left → right. The value-text sits as a small `auto`-width label on the right, subordinate to the bar.
- **Current cell** — same recipe: `[ bar-track | value-text ]`. Saturated bar on the left, value-text label on the right.

Both cells share the same internal layout (no mirror). Because both bars start at the same x-anchor (cell's left edge) and sit on the same baseline within the row, a smaller-year bar reads as visibly shorter than the bigger-year bar **side by side** on the same row, matching the prototype's "small bars left / big bars right" silhouette. Critically, the two bars within a single row sit on **the same horizontal baseline** — they are never visually stacked.

The bar-track has `width: 100%` with `min-width: --saldo-bar-min`, so the bar fills its grid column while still guaranteeing comparable visual lengths across rows. The year header label in the panel column-row sits above each cell's left edge, directly above the bar's anchor (see §5).

> **v0.2 (superseded):** cells were a vertical stack — value-text on top, bar below. Pedro found this read as bars being *stacked* (one above the other) between the two year columns rather than as two bars side by side. The v0.3 horizontal layout restores a single shared baseline per row.
>
> **v0.1 (superseded):** the cells used a horizontal mirror — prior cell `[ value | bar ]`, current cell `[ bar | value ]`, with the two bars facing each other across the column gutter. Rejected because the year header labels did not visually anchor over a single x-position inside the cell.

## 3. Column-width derivation

`CategoryPanel`'s width measurer is unchanged in spirit but extended in interpretation:

- `--saldo-col-prior` / `--saldo-col-current` continue to expose the **widest formatted text width** in the panel (in `ch`, computed across rows + subrows as in Amendment 1).
- Each year cell's outer width is composed in CSS as `text-width + var(--saldo-bar-min, 8rem) + var(--space-3)` so the bar always has a visually meaningful minimum track regardless of the longest formatted value.
- `--saldo-col-delta` is unchanged.

## 4. What stays the same

- Bar fill % is still `(value / panelMaxAbs) * 100` (Amendment 1 §3.1 panel-shared scale).
- Tokens: hue from `--color-income-default` / `--color-expense-default`; prior keeps the 45% color-mix pale treatment; current keeps full saturation; bar tracks keep `--radius-pill`; row vertical rhythm unchanged.
- Δ column treatment (arrow + sublabel `vs {{year}}` on **parent rows only** — see §6 v0.2) unchanged.
- Single-mode rows (no comparison) unchanged.
- Top-N, +/− prefix on sign-reversed values, intrinsic-kind bucketing — unchanged.
- Subrow geometry (4px track height, indent, last-child padding) unchanged.

## 5. Header row

`.ot-saldo-panel__columns--compare` reuses the **same `grid-template-columns`** as `.ot-saldo-row--compare` (v0.2 — was `1fr auto auto auto` in v0.1). This guarantees that the header labels `CATEGORÍA | {{priorYear}} | {{currentYear}} | Δ` sit directly above the corresponding row cells. With both year cells using a left-anchored vertical stack (§2), the year labels are left-aligned within their header column so each year label sits over the value-text + bar of its cell.

The `(ene–abr)` suffix on the current-year label is left out of this amendment — it's a YTD-aware affordance that requires data wiring beyond the visual pivot and will be tracked separately.

## 6. Δ sublabel scoping (v0.2)

The `vs {{priorYear}}` micro-caption rendered under the numeric Δ value is scoped to **parent category rows only**. It was previously rendered under every subrow Δ as well, which Pedro flagged as visually noisy when subcategories are expanded ("there's a lot of 'vs 2024' below each sub-category, that gets super confusing"). The CSS class `.ot-saldo-subrow__delta-sublabel` and its TSX render site were removed in v0.2; the i18n key `saldo.panel.row.vs` remains in use by the parent row.

## 7. Test impact

`SaldoScreen.test.tsx` still selects on `.ot-saldo-row__bar-fill--current` / `.ot-saldo-subrow__bar-fill--current` and on the panel-level CSS custom properties `--saldo-col-*` (each `^\d+ch$`). The new layout preserves both contracts, so the existing assertions continue to pass without modification.
