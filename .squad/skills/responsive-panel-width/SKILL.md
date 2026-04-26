# Responsive panel width (Saldo recipe)

**Confidence:** high — validated through iter 9 (Bug B fix).

## Problem

Category breakdown panels have a header row + many data rows that all
share a CSS Grid template. They must:

1. Adapt to viewport width (panel shrinks/grows with the window),
   matching the Balance page's responsive behaviour.
2. Preserve a fixed visual ratio between the prior-year and current-
   year columns (1:3, per `ingresos_gastos.png`), so that prior-year
   bars look ~⅓ the width of current-year bars at the same value.
3. **Never overflow the panel container** — row content must shrink with
   the panel, not clip or push out at narrow viewports.

Naïve fixes break one or more of the above:

- `grid-template-columns: auto auto …` — collapses to content widths,
  doesn't shrink with viewport.
- `grid-template-columns: calc(text + 8rem) …` — fixed-pixel tracks
  that don't shrink with viewport.
- `1fr 1fr 1fr 1fr` — equal columns, kills the 1:3 prior:current
  ratio.
- `minmax(var(--col-*, 0), Nfr)` — JS-computed `ch` minimums become
  hard floors; when the panel shrinks below their sum, the row grid
  overflows (Bug B).

## Recipe

```css
/* All four tracks have min = 0, so the grid can always fit its
 * container.  Name and delta use definite maximums (content-based);
 * prior and current use fr-proportional maximums (bar tracks). */
grid-template-columns:
  minmax(0, calc(var(--col-name, max-content) + var(--indent)))
  minmax(0, 1fr)
  minmax(0, 3fr)
  minmax(0, var(--col-delta, max-content));
```

Key points:

- **All track minimums are 0** — the grid is guaranteed to fit its
  container at any width. No hard content-based floors that overflow.
- **Name and delta columns** use definite maximums (`calc(...)` and
  `var(...)`) — they claim their content-based width *first* (as CSS
  Grid sizes definite-max tracks before flexible ones), but can shrink
  to 0 if the container is extremely narrow.
- **Prior (1fr) and current (3fr) columns** are flex tracks that
  distribute *remaining* free space after name/delta are sized. The
  1:3 ratio keeps bar proportions invariant across breakpoints.
- **Bars use `width: 100%; min-width: 0`** so they fill their cell and
  shrink with it. No fixed `min-width` on the bar track.
- **Text overflow handling** — value text elements (name, prior,
  current, delta) use `overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap` as a graceful degradation path at extreme
  narrowness.
- **`min-width: 0`** on the row grid containers (`.ot-saldo-row`,
  `.ot-saldo-subrow`, `.ot-saldo-panel__columns`) allows them to
  shrink below min-content in flex/grid parent layouts.

## Constraints

- The header MUST use the same template (see
  `.squad/skills/grid-header-row-alignment/SKILL.md`) or the column
  labels drift away from the bars.
- The panel container itself should be a flex/grid item that can
  shrink (`min-width: 0`); otherwise its parent will pin it wide and
  the `fr` tracks won't actually shrink.
- The outer panel grid (`ot-saldo-panels`) must use `minmax(0, 1fr)`
  so the panels themselves can shrink below min-content.

## Shrink order

1. **Bars shrink first** — the 1fr/3fr flex tracks absorb the squeeze.
2. **Name and delta hold** at content width while bars still have room.
3. **Name and delta shrink** once all flex space is consumed.
4. **Text truncation** (ellipsis) kicks in at extreme narrowness.

## History

- **PR #91 iter 5 (2026-04-26):** Pedro requested switching from the
  iter-4 `calc(text + 8rem)` intrinsic tracks to flexible `fr` tracks
  with text-width minimums, plus the explicit 1:3 prior:current ratio.
  Approved.
- **PR #91 iter 8 (2026-05-01):** Added `minmax(0, 1fr)` to the outer
  panel grid and `min-width: 0` to panels. Fixed Bug A (header
  alignment). Bug B (row content overflow) persisted because row-level
  track minimums were still content-based.
- **PR #91 iter 9 (2026-05-01):** Replaced all content-based track
  minimums with 0. Added `min-width: 0` to row/subrow/header grid
  containers. Added text overflow handling on value cells. Bug B
  resolved — panels and rows shrink together at all viewports.