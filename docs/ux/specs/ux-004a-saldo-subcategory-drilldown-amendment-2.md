# UX-004a — Amendment 2: Compare-mode bars pivot to per-year side-by-side layout

> **Status:** Draft v0.2 · **Owner:** Mouse (Visual / CSS) · **Date:** 2026-04-26 (v0.1) · **Updated:** 2026-04-27 (v0.2)
> **Parent spec:** [`ux-004a-saldo-subcategory-drilldown.md`](./ux-004a-saldo-subcategory-drilldown.md)
> **Supersedes (visual only):** Amendment 1 §3.1 bar geometry (the panel-shared scale and `panelMaxAbs` denominator are unchanged; only the in-row arrangement of the two bars changes).
> **Trigger:** Pedro dogfood feedback 2026-04-26 — directive `.squad/decisions/inbox/copilot-directive-20260426-180716-saldo-compare-layout.md` (verbatim: *"Looking again into the original prototype, can you also take a look at image ingresos_gastos.png? It shows a very clean comparison 2025 vs 2026… the bars are not piled on each other, but rather side by side (smaller on 2025 than on 2026)."*).
> **v0.2 trigger:** Second Pedro dogfood pass 2026-04-27 — *"there's a lot of 'vs 2024' below each sub-category, that gets super confusing. And the text '2024 2025 ↑' on the top is not aligned with the bars. The example I showed was much cleaner — on the left, small bars (with the date 2025 on the top) and on the right, bigger bars (with the date 2026 on the top)."*
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

Each year cell is itself a **vertical stack** (v0.2 — supersedes v0.1's horizontal mirror):

- **Prior cell** — `[ value-text ]` on top, `[ bar-track ]` below. Both anchored to the cell's left edge. Pale bar (`color-mix 45%`) grows from left → right.
- **Current cell** — same recipe: `[ value-text ]` on top, `[ bar-track ]` below, both left-anchored. Saturated bar grows from left → right.

Both cells share the same internal layout (no mirror). Because both bars start at the same x-anchor inside their respective cells, a smaller-year bar reads as visibly shorter than the bigger-year bar on the same row, matching the prototype's "small bars left / big bars right" silhouette.

The bar-track has a fixed `--saldo-bar-min` width so percentages remain visually comparable across rows. Value text aligns to each cell's left edge, which sits directly under the year header label (see §5).

> **v0.1 (superseded):** the cells used a horizontal mirror — prior cell `[ value | bar ]`, current cell `[ bar | value ]`, with the two bars facing each other across the column gutter. Pedro found the mirror visually confusing in dogfood (2026-04-27): the year header labels in the column header row did not visually anchor over either the value or the bar, since each cell was itself two-column. The vertical-stack layout fixes this by giving each cell a single x-anchor (left edge) that the header label can sit cleanly above.

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
