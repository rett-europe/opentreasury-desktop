# Skill — Responsive panel width for bar-visualisation grids

**Owner:** Trinity (Frontend)
**First applied:** PR #91 iter 5 (commit `1d3fcb7`), Saldo compare-mode panels.
**Pairs with:** `grid-header-row-alignment` (sister skill from iter 4).

## Problem

A panel renders rows with text + horizontal-bar visualisations inside CSS
grid cells. The panel must:

1. **Shrink and grow with the viewport** (parent uses `1fr 1fr` or
   similar fluid layout) — so bars adapt to the available width like the
   Balance page chart.
2. Keep **rows vertically aligned** with each other (bars start at the
   same x across rows).
3. Optionally apply a **fixed visual ratio** between two bar columns
   (e.g. prior-year cell ~1/3 of current-year cell).

## Anti-pattern (what locks the panel at a fixed width)

```css
.row {
  grid-template-columns:
    1fr
    calc(var(--col-text-width) + 8rem)   /* intrinsic — won't shrink */
    calc(var(--col-text-width) + 8rem);
}
.bar-track {
  min-width: 8rem;                       /* hard floor — won't shrink */
}
```

The `calc()` tracks are intrinsic-sized — grid never shrinks them
below their computed value. The bar-track `min-width` keeps the cell
from collapsing further. Result: the panel has a hard minimum width
and stops responding to the viewport.

## Recipe

### 1. Use `minmax(intrinsic-min, Nfr)` for bar columns

```css
.row {
  grid-template-columns:
    minmax(var(--col-name, max-content), 1fr)
    minmax(var(--col-a, 0),              1fr)   /* shrinks to text width */
    minmax(var(--col-b, 0),              3fr)   /* 3× the share of col-a */
    var(--col-c, max-content);
}
```

- `fr` tracks distribute leftover space → panel shrinks freely.
- `minmax(intrinsic-min, fr)` floors the column at the widest text in the
  panel, so digits never get truncated even at narrow widths.
- The fr ratio (`1fr` vs `3fr`) gives a stable visual size relationship
  between bar cells regardless of viewport.

### 2. Drop `min-width` on the bar track

```css
.bar-track {
  width: 100%;
  min-width: 0;          /* let the cell decide the size */
  /* ...visual styling... */
}
```

The bar fills its grid cell. The cell shrinks with the panel. The bar
shrinks with the cell. All bar percentages (`width: X%`) remain
meaningful relative to the cell.

### 3. Compute shared minimums in JS, expose as CSS vars

To keep rows aligned, every row must use the same column minimums.
Measure the widest formatted text in the panel for each column and
expose as CSS custom properties on the rows-wrapper element:

```ts
const panelColWidths = useMemo(() => {
  let maxName = 1, maxA = 1, maxB = 1, maxC = 1;
  for (const row of rows) {
    maxName = Math.max(maxName, row.name.length);
    maxA = Math.max(maxA, formatA(row).length);
    maxB = Math.max(maxB, formatB(row).length);
    maxC = Math.max(maxC, formatC(row).length);
  }
  // +1ch breathing room for non-tabular glyphs (€, separators).
  return {
    name: `${maxName + 1}ch`,
    a:    `${maxA + 1}ch`,
    b:    `${maxB + 1}ch`,
    c:    `${maxC + 1}ch`,
  };
}, [rows, locale, /* ...inputs that affect formatting... */]);

const style = {
  '--col-name': panelColWidths.name,
  '--col-a':    panelColWidths.a,
  '--col-b':    panelColWidths.b,
  '--col-c':    panelColWidths.c,
} as React.CSSProperties;
```

Pair with `font-variant-numeric: tabular-nums` on numeric cells so `ch`
units are reliable.

### 4. Apply the same template to the header row

So column labels stay anchored above their cells at every viewport
width — see the `grid-header-row-alignment` skill for the full recipe.

## Why it works

- **Same panel width** for every row + **same shared minimums** = same
  fr distribution = identical computed column widths = bars aligned
  across rows.
- **Bar fill % is preserved**: `width: X%` of the cell = X% of whatever
  width the cell has. Visual magnitude scales naturally with the cell.
- **Two-bar ratios are stable**: `1fr` vs `3fr` always gives a 1:3
  visual relationship regardless of viewport.

## When NOT to use this

- If every row has wildly different text lengths and you don't want
  the longest one to dictate the minimum — use `minmax(0, fr)` (drop
  the text floor) and accept ellipsis truncation.
- If the bar must have a meaningful absolute width (e.g. a ruler with
  fixed pixel ticks) — keep the intrinsic `calc()` track.

## Reference

- Saldo screen: `app/src/renderer/screens/SaldoScreen/SaldoScreen.{css,tsx}`,
  `app/src/renderer/styles/globals.css` (`.ot-saldo-row--compare`,
  `.ot-saldo-subrow--compare`, `.ot-saldo-panel__columns--compare`).
- Sister skill: `.squad/skills/grid-header-row-alignment/SKILL.md`.
