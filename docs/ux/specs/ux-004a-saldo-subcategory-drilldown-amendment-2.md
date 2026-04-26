# UX-004a — Amendment 2: Compare-mode bars pivot to per-year side-by-side layout

> **Status:** Draft v0.1 · **Owner:** Mouse (Visual / CSS) · **Date:** 2026-04-26
> **Parent spec:** [`ux-004a-saldo-subcategory-drilldown.md`](./ux-004a-saldo-subcategory-drilldown.md)
> **Supersedes (visual only):** Amendment 1 §3.1 bar geometry (the panel-shared scale and `panelMaxAbs` denominator are unchanged; only the in-row arrangement of the two bars changes).
> **Trigger:** Pedro dogfood feedback 2026-04-26 — directive `.squad/decisions/inbox/copilot-directive-20260426-180716-saldo-compare-layout.md` (verbatim: *"Looking again into the original prototype, can you also take a look at image ingresos_gastos.png? It shows a very clean comparison 2025 vs 2026… the bars are not piled on each other, but rather side by side (smaller on 2025 than on 2026)."*).
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

Each year cell is itself a 2-column inner grid:

- **Prior cell** — `[ value-text | bar-track (flex remainder) ]`. Value sits on the left of the cell (right-aligned within its sub-column, against the bar). Pale bar (`color-mix 45%`) grows from the left edge of the bar area rightward. Bar's right edge approaches the column gutter, "facing" the current bar.
- **Current cell** — `[ bar-track (flex remainder) | value-text ]`. Saturated bar grows from the cell's left edge (the gutter shared with prior) rightward. Value sits on the right of the cell.

Both cells use the same panel-shared text width (`--saldo-col-prior` / `--saldo-col-current`) for their value sub-column, so values stay vertically aligned across all rows + subrows in the panel — preserving the §3.1 alignment guarantee.

## 3. Column-width derivation

`CategoryPanel`'s width measurer is unchanged in spirit but extended in interpretation:

- `--saldo-col-prior` / `--saldo-col-current` continue to expose the **widest formatted text width** in the panel (in `ch`, computed across rows + subrows as in Amendment 1).
- Each year cell's outer width is composed in CSS as `text-width + var(--saldo-bar-min, 8rem) + var(--space-3)` so the bar always has a visually meaningful minimum track regardless of the longest formatted value.
- `--saldo-col-delta` is unchanged.

## 4. What stays the same

- Bar fill % is still `(value / panelMaxAbs) * 100` (Amendment 1 §3.1 panel-shared scale).
- Tokens: hue from `--color-income-default` / `--color-expense-default`; prior keeps the 45% color-mix pale treatment; current keeps full saturation; bar tracks keep `--radius-pill`; row vertical rhythm unchanged.
- Δ column treatment (arrow + sublabel `vs {{year}}`) unchanged.
- Single-mode rows (no comparison) unchanged.
- Top-N, +/− prefix on sign-reversed values, intrinsic-kind bucketing — unchanged.
- Subrow geometry (4px track height, indent, last-child padding) unchanged.

## 5. Header row

`.ot-saldo-panel__columns--compare` collapses to `1fr auto auto auto` (was `1fr auto auto auto auto`). Labels: `CATEGORÍA | {{priorYear}} | {{currentYear}} | Δ`. The `(ene–abr)` suffix on the current-year label is left out of this amendment — it's a YTD-aware affordance that requires data wiring beyond the visual pivot and will be tracked separately.

## 6. Test impact

`SaldoScreen.test.tsx` still selects on `.ot-saldo-row__bar-fill--current` / `.ot-saldo-subrow__bar-fill--current` and on the panel-level CSS custom properties `--saldo-col-*` (each `^\d+ch$`). The new layout preserves both contracts, so the existing assertions continue to pass without modification.
