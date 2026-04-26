# Responsive panel width (Saldo recipe)

**Confidence:** medium — captured during PR #91 iter 5.

## Problem

Category breakdown panels have a header row + many data rows that all
share a CSS Grid template. They must:

1. Adapt to viewport width (panel shrinks/grows with the window),
   matching the Balance page's responsive behaviour.
2. Preserve a fixed visual ratio between the prior-year and current-
   year columns (1:3, per `ingresos_gastos.png`), so that prior-year
   bars look ~⅓ the width of current-year bars at the same value.

Naïve fixes break one of the two:

- `grid-template-columns: auto auto …` — collapses to content widths,
  doesn't shrink with viewport.
- `grid-template-columns: calc(text + 8rem) …` — fixed-pixel tracks
  that don't shrink with viewport.
- `1fr 1fr 1fr 1fr` — equal columns, kills the 1:3 prior:current
  ratio.

## Recipe

```css
grid-template-columns:
  minmax(var(--col-name, max-content), 1fr)
  minmax(var(--col-prior, 0),   1fr)
  minmax(var(--col-current, 0), 3fr)
  var(--col-delta, max-content);
```

Key points:

- **`fr` units, not px or `calc`** — grid distributes leftover space
  proportionally, so the panel adapts as the viewport changes width.
- **1fr : 3fr** between prior and current keeps the visual ratio
  invariant across breakpoints.
- **`minmax(var(--col-*, …), Nfr)`** lets a JS-computed text-width
  minimum (in `ch`) prevent text from clipping while still allowing
  the track to grow with available space.
- **Bars use `width: 100%; min-width: 0`** so they fill their cell and
  shrink with it. No fixed `min-width` on the bar track.
- **Delta column stays `auto` / `max-content`** — narrow, fixed to its
  content width, sits flush right.

## Constraints

- The header MUST use the same template (see
  `.squad/skills/grid-header-row-alignment/SKILL.md`) or the column
  labels drift away from the bars.
- The panel container itself should be a flex/grid item that can
  shrink (`min-width: 0`); otherwise its parent will pin it wide and
  the `fr` tracks won't actually shrink.

## History

- **PR #91 iter 5 (2026-04-26):** Pedro requested switching from the
  iter-4 `calc(text + 8rem)` intrinsic tracks to flexible `fr` tracks
  with text-width minimums, plus the explicit 1:3 prior:current ratio.
  Approved.
