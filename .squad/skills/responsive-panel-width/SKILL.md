# Responsive panel width (Saldo recipe)

**Confidence:** MEDIUM — validated through iters 9-10, media query refinement adds responsive bar-ratio axis.

## Problem

Category breakdown panels have a header row + many data rows that all
share a CSS Grid template. They must:

1. Adapt to viewport width (panel shrinks/grows with the window),
   matching the Balance page's responsive behaviour.
2. Preserve a fixed visual ratio between the prior-year and current-
   year columns (1:3 above 1200px, 1:1 below), so that prior-year
   bars stay legible at all widths.
3. **Never overflow the panel container** — row content must shrink with
   the panel, not clip or push out at narrow viewports.
4. **Amounts must always be readable** — bars are the responsive axis,
   €amounts must never be ellipsis-truncated.

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
- `minmax(0, Nfr)` on all tracks — grid shrinks but amounts get
  ellipsis-truncated at narrow widths (iter 9 regression).

## Recipe

```css
/* Name and delta: min=0 (can truncate with ellipsis).
 * Prior and current: min=min-content (amounts always readable).
 * Bars are the responsive axis — they shrink, amounts don't. */
grid-template-columns:
  minmax(0, calc(var(--col-name, max-content) + var(--indent)))
  minmax(min-content, 1fr)
  minmax(min-content, 3fr)
  minmax(0, var(--col-delta, max-content));

/* At narrow viewports, switch from 1:3 to 1:1 so both bars
 * stay legible. */
@media (max-width: 1200px) {
  /* Override 3fr → 1fr on the current-year track */
  grid-template-columns:
    minmax(0, calc(var(--col-name, max-content) + var(--indent)))
    minmax(min-content, 1fr)
    minmax(min-content, 1fr)
    minmax(0, var(--col-delta, max-content));
}
```

Key points:

- **Prior/current track minimums are `min-content`** — the grid track
  can never shrink below the amount text width. The compound cell
  (amount + bar stacked vertically) must NOT have `min-width: 0` so
  its min-content (the amount text) propagates to the grid track.
- **Name and delta columns** keep `minmax(0, ...)` — they can truncate
  with ellipsis at narrow widths (names can be long; delta is small).
- **Prior (1fr) and current (3fr) columns** are flex tracks that
  distribute *remaining* free space after name/delta are sized. The
  1:3 ratio keeps bar proportions invariant above 1200px.
- **1:1 ratio at ≤ 1200px** — `@media (max-width: 1200px)` overrides
  `3fr` → `1fr` so both bars get equal width at narrow viewports.
- **Bars use `width: 100%; min-width: 0`** so they fill their cell and
  shrink with it. No fixed `min-width` on the bar track.
- **Amount text** uses `white-space: nowrap` but does NOT use
  `overflow: hidden; text-overflow: ellipsis` — amounts are never
  truncated.
- **Name/delta text** keeps `overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap` — graceful truncation for long category names.
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
- Compound cells (prior-cell, current-cell) must NOT have `min-width: 0`
  — they need `min-width: auto` (default) so their content minimum
  (the amount text width) propagates to the grid track.

## Shrink order

1. **Bars shrink first** — the fr flex tracks absorb the squeeze, bars
   inside them shrink proportionally (`width: 100%; min-width: 0`).
2. **Name and delta hold** at content width while bars still have room.
3. **Name and delta shrink** once all flex space is consumed (ellipsis).
4. **Amounts hold** — `minmax(min-content, ...)` ensures amounts never
   shrink below their text width. This is the last line of defence.

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
- **PR #91 iter 10 (2026-05-01):** Changed prior/current track minimums
  from 0 to `min-content` so amounts never truncate. Removed
  `overflow: hidden; text-overflow: ellipsis` from amount text elements
  and `min-width: 0` from compound cells. Added `@media (max-width:
  1200px)` breakpoint switching 1:3 → 1:1 bar ratio.
---

## Variant: single-mode share-% column (Saldo, PR #118)

**Confidence:** LOW (one bug, one fix; not yet validated across more modes).

The minmax recipe above protects amounts in compare mode by using JS-measured `ch`-unit vars (`--saldo-col-prior`, `--saldo-col-current`, `--saldo-col-delta`). The vars are computed by `panelColWidths` from the YoY *delta* text — that is correct for the compare row template.

**Trap:** the *single*-mode row template (`.ot-saldo-row--single` / `.ot-saldo-subrow--single`) cannot reuse `--saldo-col-delta` because in single mode the third cell renders `Intl.NumberFormat({ style: 'percent' })` (share of total), NOT `formatDeltaText`. With no prior data, all deltas are `null` → `formatDeltaText` → `"—"` → var = `2ch` → share % gets clipped by the `__delta` cell's `text-overflow: ellipsis`.

**Recipe for single mode:**

\\\css
.ot-saldo-panel__columns--single,
.ot-saldo-row--single,
.ot-saldo-subrow--single {
  grid-template-columns: 1fr max-content max-content;
}
\\\

Why `max-content` is enough here: every cell in cols 2-3 is a short fixed-format string (amount in EUR, percent at 0 fraction digits). The grid sizes each track to the widest such cell — alignment across rows + header is automatic, no JS measurement needed.

**Rule of thumb:** if a CSS var's value depends on text formatted by function `A` but the variant being styled renders text formatted by function `B`, do not reuse the var. Either compute a separate var for `B`, or fall back to `max-content` if `B`'s output is short and bounded.
