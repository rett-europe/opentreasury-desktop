# Grid header–row alignment

**Confidence:** MEDIUM (proven recipe landed in PR #91 iter 8 after two
rejections — needs one clean iteration to move back to HIGH).

## Problem

A panel renders a header row above a list of data rows. Bars / numeric
columns in the rows must line up vertically with their corresponding
header labels. Both header and rows are CSS Grid containers using the
same logical columns (e.g. `name | prior | current | delta`).

The bug surface: small changes to row content (longer text in one
column, indented sub-rows, different per-row tracks) cause the rows'
column widths to drift away from the header's column widths → bars no
longer sit under their labels.

## Recipe

Four rules together. Drop any one and alignment breaks.

### 1. Single shared template, exposed via CSS custom properties

Header AND every row variant (parent row, sub-row, etc.) MUST use a
**byte-identical** `grid-template-columns`. Put the per-column widths
into CSS variables exposed at the panel root, then reference them from
all three rules:

```css
.panel-header,
.panel-row,
.panel-subrow {
  grid-template-columns:
    minmax(calc(var(--col-name, max-content) + var(--space-6)), 1fr)
    minmax(var(--col-prior, 0), 1fr)
    minmax(var(--col-current, 0), 3fr)
    var(--col-delta, max-content);
}
```

Compute the `ch` widths in JS from the widest formatted string in any
visible row + sub-row. Set them on the panel container so all grids
inherit identical mins.

### 2. Identical outer width on every grid container

Each `.panel-header` / `.panel-row` / `.panel-subrow` is its own grid.
For their `1fr` tracks to resolve to the same pixel width, every grid
container in the panel MUST have the same content-box width. That
means: **no horizontal padding / margin / border on any individual grid
container that isn't applied to ALL of them**.

Subcategory indent ⚠️ — do NOT put `padding-left` on the sub-row grid
container. That shrinks the sub-row's grid by N pixels relative to
header + parent rows; `1fr` resolves smaller; bars drift left of the
header. Instead:

- Apply the indent as `padding-left` on the **name cell** only
  (`.panel-subrow__name { padding-left: var(--space-6) }`); the grid
  container itself stays full-width.
- Bake the indent budget into the shared name-column min so the
  sub-row's name+padding still fits without expanding the track:

  ```css
  /* on header + parent row + sub-row */
  grid-template-columns:
    minmax(calc(var(--col-name, max-content) + var(--space-6)), 1fr)
    /* …other tracks identical… */;
  ```

  This way every grid container reserves the same min for the name
  column whether its name has padding or not, and the `1fr`
  distribution is identical across containers.

### 3. Identical font-size context for `ch` resolution (CRITICAL — iter 8 discovery)

When `grid-template-columns` uses `ch`-based CSS variables (e.g.
`var(--col-name)` = `14ch`), the `ch` unit resolves relative to the
**grid container's own font-size**, not the cells' font-sizes.

If the header grid container has `font-size: 11px` (for small-caps
labels) while the row grid container inherits `font-size: 16px`, then
`14ch` evaluates to ~84px in the header but ~112px in the rows. The
column minimums differ → `1fr` distributes differently → **columns
drift even though the templates are byte-identical**.

**Fix:** Move any font-size / letter-spacing / text-transform
declarations from the **grid container** to its **children**:

```css
/* BAD — ch resolves at 11px in the header grid */
.panel-header {
  display: grid;
  font-size: var(--font-size-11);
  grid-template-columns: minmax(var(--col-name), 1fr) …;
}

/* GOOD — ch resolves at the inherited (same as rows) font-size */
.panel-header {
  display: grid;
  grid-template-columns: minmax(var(--col-name), 1fr) …;
}
.panel-header > * {
  font-size: var(--font-size-11);
}
```

### 4. Single source of truth for the template

Don't duplicate the template literal. If you must (different files /
BEM blocks), put a comment in EACH copy pointing to the other and
flagging that they MUST be byte-identical. A template drift is silent
and re-introduces this bug.

## When this skill applies

- Any panel with a sticky / fixed header above scrollable rows.
- Any "compare two periods" layout where header columns label
  per-period cells.
- Any drilldown where sub-rows nest under parent rows but must stay
  visually columnar with the header.

## Tells that the bug is back

- "Header is no longer aligned with the bars" — exactly Pedro's
  language both times.
- The misalignment appears only when sub-rows are visible / when one
  row's text is much longer than the header label.
- DOM inspection shows different `grid-template-columns` resolved
  widths between header and one row.
- **New tell (iter 8):** misalignment visible even in categories-only
  view (no subcategories expanded) → likely a `ch` resolution mismatch
  caused by different font-sizes on header vs row grid containers.

## History

- **PR #86 iter 4 (2026-04-30):** First confirmation. Each row was its
  own grid with `auto`-sized tracks → variable text widths shifted the
  `1fr` bars column. Fixed by introducing the panel-level `--saldo-col-*`
  custom props (rule #1).
- **PR #91 iter 6 (2026-05-01):** Second confirmation. Sub-row grid
  container had `padding-left: var(--space-6)` for the indent; this
  shrank its inner grid by 16px relative to header & parent rows, so
  `1fr` resolved narrower and bars drifted left when sub-rows were
  shown. Fixed by moving indent to the name cell and adding
  `+ var(--space-6)` to the shared name-column min (rule #2).
- **PR #91 iter 8 (2026-05-01):** Third confirmation. Header grid had
  `font-size: var(--font-size-11)` on the container; rows inherited a
  larger font-size (~16px). The `ch`-based column minimums resolved to
  different pixel widths in each grid → `1fr` distributed differently →
  headers sat LEFT of their row values. Fixed by moving font properties
  from the header grid container to its children (rule #3). Also reduced
  double `+ var(--space-6)` in name column min to single (Bug B fix),
  added `minmax(0,1fr)` to panel grid and `min-width:0` to panels for
  responsive shrinking.
