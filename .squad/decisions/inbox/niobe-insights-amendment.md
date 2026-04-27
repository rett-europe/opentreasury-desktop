# Decision: Insights Section A1 Amendment

**Date:** 2026-05-02  
**Author:** Niobe  
**Status:** DRAFT (awaiting Pedro approval)

## Context

Pedro shared two mockups (`insights_idea.png`, `insights_idea_2.png`) that define the Insights section layout. These mockups supersede the v1 per-label YoY grid spec (ux-005a) with a new tag-centric design.

## Decision

The Insights section will follow the mockup-defined structure:

1. **Landing:** KPI strip (3 cards) + horizontal tag card row + combiner hint banner
2. **Drilldown:** In-section view (not navigate to Movimientos) with donut charts, subcategory table, monthly line chart, and per-account bars
3. **New controls:** Volumen/Neto/#Mov toggle, tag combiner dropdown

## Artifacts

- **Amendment spec:** `docs/ux/specs/ux-005-insights-section-ia-amendment.md`
- **Source mockups:** `.squad/decisions/inbox/insights_idea.png`, `.squad/decisions/inbox/insights_idea_2.png`

## Key Deltas from v1

| v1 | A1 (mockup) |
|----|-------------|
| Small-multiples YoY grid | Horizontal tag card row |
| Click → Movimientos | Click → in-section drilldown |
| No metric toggle | Volumen / Neto / # Mov. toggle |
| No tag combining | "+ Combinar etiqueta…" intersection filter |
| No donut charts | Category distribution donuts |

## Open Questions (for Pedro)

1. Sparkline timeframe on tag cards
2. "Top: subcategories" logic (top by volume? most recent?)
3. Donut slice limit (cap at top 5?)
4. Archived tags visibility
5. Account filter inheritance
6. Empty tag card handling

## Impact

- **Trinity:** New components needed (DonutChart, SegmentedToggle, TagCombinerDropdown)
- **Morpheus:** Aggregation IPC shape changes (tag-centric, not YoY-centric)
- **Oracle:** i18n keys for new labels

## Branch

`squad/97-insights-amendment`
