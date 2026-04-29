# Insights drilldown — current-state snapshots (PR #141)

Visual evidence of what we shipped in PR #141 (`f6a092b8` — _"fix(insights):
pacman donut + unified diverging bar chart + breadcrumb labels"_), captured to
support the redesign conversation around the diverging subcategory chart.

> **Scope:** documentation only. No production code was modified to produce
> these images. The donuts above the chart (also part of PR #141) are kept in
> frame so the redesign can preserve their colour vocabulary.

## How these were captured

- Harness: `tests/e2e/insights-snapshots.spec.ts` (Playwright + Electron).
- The spec is **skipped by default** so `npm run e2e` is unaffected. To
  re-capture:

  ```powershell
  npm run build
  $env:OT_SNAPSHOTS = '1'
  npx playwright test tests/e2e/insights-snapshots.spec.ts
  ```

- Each test seeds a deterministic NDJSON event log (one tag, controlled
  category/subcategory mix, all transactions in the current `thisYear()`
  window) into a unique `OT_DATA_DIR` under `%APPDATA%/opentreasury-desktop/`,
  then launches Electron with `args: ['.']` so userData resolves correctly.
- After load, the spec navigates **Insights → tag card "Snapshot"**, sets the
  Playwright viewport, scrolls to the donut row, and screenshots:
  - `*-full.png` — clipped to the donut row + diverging bar chart together.
  - `*-bars.png` — focused close-up of `.ot-diverging-chart`.

Three dataset shapes × two viewports × two views = **12 PNGs**.

## Index

| File                       | Caption                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `normal-wide-full.png`     | Typical month at 1600 px — donut pair + diverging chart together. Reasonable spread on both sides.     |
| `normal-wide-bars.png`     | Same dataset, bars-only close-up. Top-rank rows on each side feel paired by index even though they aren't related. |
| `normal-narrow-full.png`   | Typical month at 900 px — diverging metaphor is _kept_ (not stacked) and breadcrumb labels truncate.   |
| `normal-narrow-bars.png`   | Same dataset, narrow close-up. Note `Cuota Socio A…`, `Donaciones › Individual…` — breadcrumbs cut.    |
| `skewed-wide-full.png`     | One €12 000 expense dominates. Income side becomes flat stubs because bars share a single `maxAbs`.    |
| `skewed-wide-bars.png`     | Skewed close-up. Sub-€100 rows render as a 0.5%-min dot; ranking is unreadable without the numbers.    |
| `skewed-narrow-full.png`   | Skewed at 900 px. Same problems plus aggressive label truncation.                                      |
| `skewed-narrow-bars.png`   | Skewed bars-only at 900 px.                                                                            |
| `sparse-wide-full.png`     | 2-on-2 dataset. Donuts read fine; the diverging chart looks oversized for so little data.              |
| `sparse-wide-bars.png`     | Sparse close-up — most of the chart's horizontal real-estate is empty.                                 |
| `sparse-narrow-full.png`   | Sparse at 900 px.                                                                                      |
| `sparse-narrow-bars.png`   | Sparse bars-only at 900 px.                                                                            |

## Observations — what makes the chart confusing

These are surface-level signals from the snapshots, intended as raw input for
Niobe's redesign concept. **Not** prescriptive.

1. **Cross-side scaling crushes the smaller side.** Both sides share one
   `maxAbs` (the larger of `expenseRows[0]` and `incomeRows[0]`). When the two
   sides differ in magnitude — like the skewed dataset (12 000 € vs 720 €) —
   every row on the smaller side becomes a near-identical stub. Users can no
   longer compare _within_ the smaller side, which is the whole point of the
   chart.

2. **Tiny values collapse to the 0.5 %-minimum dot.** `width: max(pct, 0.5)%`
   keeps the bar visible but renders a meaningless lozenge for €12 next to a
   €12 000 bar. The visual ranking is wrong (a €60 row looks the same as a
   €12 row); only the number column carries truth.

3. **Pairing-by-index implies a relationship that doesn't exist.** Row 1 of
   gastos sits next to row 1 of ingresos. Because each side is independently
   sorted by magnitude, the visual pairing is "rank-1 vs rank-1" which has no
   semantic meaning. A user scanning across rows asks "what does Alquiler have
   to do with Donaciones?" — nothing.

4. **No drawn zero baseline.** The legend strip says `EXPENSE | INCOME` at the
   top, but the axis is implied by alignment, not by a continuous line.
   Without a baseline running down the chart, the diverging metaphor doesn't
   land — it reads as two adjacent right-/left-aligned tables.

5. **Asymmetric label/number reading direction.** On the expense side the
   number trails the bar inward (toward the centre); on the income side the
   number trails the bar outward (toward the right margin). Eyes scan left
   side and right side with opposite rules.

6. **Donut↔bar colour link is too subtle.** The donut categories carry strong
   colour identity (Gastos = blue, Administrativo = teal, etc.). Each bar row
   uses a small coloured pill _before_ the label; the bar fill itself is the
   same hue, but it's so washed-out next to the white background that the
   colour-coded link to the donut above is easy to miss.

7. **Narrow-viewport collapse never fires.** History notes the spec collapses
   to stacked at <720 px. At 900 px (a realistic split-window width on a
   laptop) the diverging layout is preserved and breadcrumb labels truncate
   aggressively (`Cuota Socio A…`, `Donaciones › Individual…`). The
   breadcrumb's whole value — disambiguating recurring subcategory names —
   evaporates.

8. **Sparse data wastes the layout.** With 2 rows per side, the chart still
   reserves the full diverging width; the top row's bar fills ~80 % of half
   the canvas regardless of whether €480 is a meaningful figure for the user.
   Density looks "important" when the data isn't.

## Files not committed

The seed event-logs (`%APPDATA%/opentreasury-desktop/ux-snapshot-{normal,
skewed,sparse}/events.ndjson`) live outside the repo. The harness re-seeds
deterministically on every run.
