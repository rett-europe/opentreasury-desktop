---
name: 'disjoint-ranked-distributions'
description: 'When two distributions do not share keys, render them as two independent ranked tables — never as a diverging single chart.'
domain: 'data-visualization'
confidence: 'high'
source: 'lesson learned from PR #141 (diverging chart, rejected) → squad/trinity-subcategory-ranked-tables (Concept A, accepted)'
---

## Context

Use this pattern any time you must surface **two ranked distributions on the
same screen whose keys do not overlap** — e.g. gastos subcategories vs.
ingresos subcategories within an Insights label, debits vs. credits per
account, inflows vs. outflows per period, top buyers vs. top suppliers.

The naïve choice — a diverging-bar chart with a central zero baseline — is
**wrong** for disjoint keys. It only works when the two sides are paired
opposing values of the **same** category (survey "agree vs. disagree" per
question, net migration in/out per country, before/after per item).

## The lesson

> **If row N on the left has no semantic relationship to row N on the right,
> do not render them on a shared axis.** Diverging bars imply pairing.
> Implying a relationship that doesn't exist is the single fastest way to
> make a chart "very confusing" (Pedro, 2026-04 review of PR #141).

Symptoms of the wrong choice (diverging bars on disjoint keys):

- Users instinctively read across rows looking for paired meaning and find
  none. ("What does Alquiler have to do with Donaciones?" → nothing.)
- A shared `maxAbs` scale across the two sides crushes the smaller side
  into stubs whenever one side has an outlier — destroying the within-side
  ranking that was the user's actual task.
- Reading direction is reversed on one side (RTL on the left to "hug the
  axis"), forcing the user to learn two scan directions for the same data.
- At narrow viewports, the diverging metaphor collapses into something
  entirely different (a vertical stacked list), so the user has two distinct
  visualisations of the "same" data depending on window width.

## The pattern

**Two side-by-side ranked tables, each with its own scale, sort, and percent
column.** Identical visual language on both sides — they don't pretend to
share an axis.

```
┌─────────────────────────────────────┬─────────────────────────────────────┐
│ GASTOS                              │ INGRESOS                            │
├─────────────────────────────────────┼─────────────────────────────────────┤
│ #  ● Casa › Alquiler   2 100 €  44% │ #  ● Donaciones › Particulares 7 200€ 58%│
│      ████████████████               │      ████████████████               │
│ #  ● Casa › Suministros  1 050 € 22%│ #  ● Subvenciones › Ayto. 3 800 € 31%│
│      ██████████                     │      ███████████                    │
│ … 4 más  [Ver todas]                │ … 2 más  [Ver todas]                │
└─────────────────────────────────────┴─────────────────────────────────────┘
```

### Hard rules

1. **Independent scales.** Each table's bars are scaled to that table's top
   row. Never share a `maxAbs` across sides.
2. **Independent sorts.** Each side ranks by its own magnitude.
3. **Independent toggles.** "Ver todas" on one side does not affect the
   other.
4. **Independent empty states.** If one side has zero rows, that side shows
   a muted "Sin datos" message; the other side renders normally.
5. **Single % column per row, scoped to "% of side total".** Audit-friendly
   reading: "Alquiler is 44% of all gastos this month."
6. **Top-N + toggle.** Default to top 10 per side with "Ver todas" /
   "Ver menos" reveal.
7. **Narrow viewports stack to one column.** Same metaphor; not a different
   chart.
8. **Reading direction is identical on both sides** (rank → label → amount →
   percent). No mirrored cells.

### When you have a true paired comparison

Diverging bars are still right for Likert-scale survey results, net
migration, before/after deltas, and similar — i.e. when the same keys exist
on both sides. The rule is about disjoint keys.

## Reusability

This pattern is a general primitive for any future Insights breakdown panel
where two distributions need to coexist visually but don't share keys:

- Subcategory distribution per label (current usage)
- Account-level inflow vs. outflow rankings
- Tag-level expense vs. income rankings
- Period A vs. Period B top-mover lists where the movers differ

The component lives at
`app/src/renderer/components/SubcategoryRankedTable/`. If a second consumer
emerges, lift it to `RankedDistributionTable` and parametrise the side
labels and magnitude getter.

## See also

- Decision: [`docs/ux/insights-subcategory-decision.md`](../../../docs/ux/insights-subcategory-decision.md)
- UX concept: [`docs/ux/insights-subcategory-concept.md`](../../../docs/ux/insights-subcategory-concept.md) §3 Concept A
- Before snapshots: [`docs/ux/insights-current-state/`](../../../docs/ux/insights-current-state/)
- After snapshots: [`docs/ux/insights-after/`](../../../docs/ux/insights-after/)
- Sibling skill `paired-panel-breakdown` — different pattern, used when keys
  ARE shared and the comparison is period-over-period.
