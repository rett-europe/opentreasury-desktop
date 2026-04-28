# Insights drilldown — "after" snapshots (Concept A ranked tables)

Visual evidence of the new `SubcategoryRankedTable` component shipped in
`squad/trinity-subcategory-ranked-tables`, captured to support the
before/after diff for Pedro's review.

> **Scope:** documentation only. No production code is modified to produce
> these images. The donuts above the tables are kept in frame so the
> redesign can be compared apples-to-apples with the diverging-chart "before"
> snapshots in [`../insights-current-state/`](../insights-current-state/).

## How these were captured

Same harness as the "before" set:

```powershell
npm run build
$env:OT_SNAPSHOTS = '1'
npx playwright test tests/e2e/insights-snapshots.spec.ts
```

Three dataset shapes (normal / skewed / sparse) × two viewports
(1600 px / 900 px) × two views (full row / bars-only close-up) = **12 PNGs**.

## Index

| File                     | Caption                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `normal-wide-full.png`   | Typical month at 1600 px — donut pair + ranked tables together. Each side ranks independently with its own scale.    |
| `normal-wide-bars.png`   | Same dataset, tables-only close-up. Top-N rows scan cleanly per side without any false cross-side pairing.           |
| `normal-narrow-full.png` | Typical month at 900 px — the two columns stack into a single column. Same row metaphor, no truncation.              |
| `normal-narrow-bars.png` | Same dataset, narrow close-up.                                                                                       |
| `skewed-wide-full.png`   | One €12 000 expense dominates. Income side keeps its own scale — sub-€100 ranking is preserved within the income column. |
| `skewed-wide-bars.png`   | Skewed close-up. Bar lengths within a side reflect that side's distribution.                                         |
| `skewed-narrow-full.png` | Skewed at 900 px. Stacked layout, same independent scaling.                                                          |
| `skewed-narrow-bars.png` | Skewed close-up at 900 px.                                                                                           |
| `sparse-wide-full.png`   | 2-on-2 dataset. No "Ver todas" toggle since each side is below topN. Layout doesn't pretend the data is denser than it is. |
| `sparse-wide-bars.png`   | Sparse close-up.                                                                                                     |
| `sparse-narrow-full.png` | Sparse at 900 px.                                                                                                    |
| `sparse-narrow-bars.png` | Sparse close-up at 900 px.                                                                                           |

## What changed vs. "before"

1. **Two independent tables, no central axis.** Each side ranks on its own
   scale, so a €12 000 outlier on one side no longer crushes the other side's
   ranking into stubs.
2. **Reading direction is consistent across both sides** (rank → label →
   amount → percent), matching every other table in the app.
3. **Narrow viewport stacks cleanly** to a single column — same metaphor, not
   a different chart.
4. **Each row carries its own "% of side total"** column for direct audit
   reading ("Alquiler is 44 % of all gastos this month").
5. **Sparse data looks sparse.** No more wasted half-canvas; the table is
   simply short.

## Files not committed

The seed event-logs (`%APPDATA%/opentreasury-desktop/ux-snapshot-{normal,
skewed,sparse}/events.ndjson`) live outside the repo. The harness re-seeds
deterministically on every run.
