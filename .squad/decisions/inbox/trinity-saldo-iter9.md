# Trinity — Saldo iter 9: Bug B fix (row content shrinks with panel)

**Date:** 2026-05-01
**PR:** #91 iter 9
**Requested by:** Pedro Rocha

## Problem

Bug B (responsive panel width): at narrow viewports the panel
containers shrink (thanks to iter 8's `minmax(0,1fr)` + `min-width:0`
on the panels), but the rows inside the panels kept their full content
width. The grid tracks had `ch`-based minimums from the JS column-sync
mechanism (`var(--saldo-col-prior)`, `var(--saldo-col-current)`,
`var(--saldo-col-delta)`), creating hard floors that could not shrink
below the measured text widths. When the panel width dropped below the
sum of these floors + gaps, bars collapsed to 0 first, then the value
columns overflowed/clipped the panel.

## Root cause

The `--compare` grid-template-columns in header, row, and subrow grids
used content-based minimums:

```css
/* iter 8 template — Bug B overflow source */
minmax(calc(var(--saldo-col-name) + var(--space-6)), 1fr)
minmax(var(--saldo-col-prior, 0), 1fr)
minmax(var(--saldo-col-current, 0), 3fr)
var(--saldo-col-delta, max-content);
```

The `var(--saldo-col-prior)` resolved to e.g. `8ch` — an absolute
minimum the track could never shrink below. The delta column was a
bare `var(...)` with no `minmax` wrapper, making it completely fixed.

## Fix

Changed all four track minimums to `0` across header, row, and subrow
templates (3 locations in SaldoScreen.css + 2 in globals.css):

```css
/* iter 9 — all minimums 0 */
minmax(0, calc(var(--saldo-col-name, max-content) + var(--space-6)))
minmax(0, 1fr)
minmax(0, 3fr)
minmax(0, var(--saldo-col-delta, max-content));
```

Additional supporting changes:
- `min-width: 0` on `.ot-saldo-row`, `.ot-saldo-subrow`,
  `.ot-saldo-panel__columns` — flex items need this to shrink below
  content.
- `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` on
  all value text elements (name, prior, current, delta) in both rows
  and subrows — graceful truncation at extreme narrowness.
- Same treatment applied to `--single` mode templates.

## What was NOT changed

- Header font styling (Bug A fix) — untouched.
- Subcategory expansion logic — untouched.
- Outer panel grid `minmax(0,1fr)` / 900px breakpoint — untouched.
- Column-sync JS mechanism (`panelColWidths`) — untouched.

## Verification

- `npm run typecheck` ✓
- `npm run lint` ✓
- `npm test` — 654 passed, 9 skipped, 77 test files ✓
- Visual: app launched, window resized to ~1100px. Panels contain
  their content, bars are proportionally sized, values readable,
  header alignment preserved.
- Screenshot: `.squad/decisions/inbox/iter9-proof-1100.png`

## Skill updated

`.squad/skills/responsive-panel-width/SKILL.md` — updated recipe from
content-based minimums to zero-minimum tracks, added shrink order
documentation and iter 9 history entry.
