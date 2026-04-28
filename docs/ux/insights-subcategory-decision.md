# Insights Subcategory Panel — Decision

**Author:** Neo (Lead / Architect)
**Date:** 2026-05-04
**Status:** 🟡 Awaiting Pedro approval
**Inputs:** Trinity's snapshot evidence (`docs/ux/insights-current-state/`), Niobe's UX concept (`docs/ux/insights-subcategory-concept.md`)

---

## 1. The problem

The subcategory panel below the donuts on the Insights detail page answers one question: *"Within this label, which specific line-items drove the totals — and is anything unexpectedly large?"* This is a **rank-and-scan** task: the user skims the biggest items per side (gastos / ingresos), checks they look right, and moves on. The diverging-bar chart shipped in PR #141 optimised instead for a **paired comparison** that doesn't exist — gastos and ingresos subcategories share no keys, so row-1 left sitting next to row-1 right implies a relationship ("What does Alquiler have to do with Donaciones?") that is pure coincidence. Pedro's verdict — "very confusing… not well resolved at all" — is the predictable result of choosing a chart metaphor that contradicts the data shape.

---

## 2. Snapshot evidence

Trinity captured 12 screenshots across three dataset shapes (normal / skewed / sparse) at two viewport widths (1600 px / 900 px). The three most damning:

| Screenshot | What it shows |
|---|---|
| [`docs/ux/insights-current-state/skewed-wide-bars.png`](insights-current-state/skewed-wide-bars.png) | One €12 000 expense dominates. The shared `maxAbs` scale crushes every income row to identical stubs — ranking on the smaller side is destroyed. |
| [`docs/ux/insights-current-state/normal-narrow-bars.png`](insights-current-state/normal-narrow-bars.png) | At 900 px, breadcrumb labels truncate mid-word (`Cuota Socio A…`, `Donaciones › Individual…`). The labels' only purpose — disambiguating subcategories — is lost. |
| [`docs/ux/insights-current-state/sparse-wide-bars.png`](insights-current-state/sparse-wide-bars.png) | With only 2 rows per side, the diverging layout wastes most of its horizontal real-estate. The chart looks "important" when the data isn't. |

Full index and 8 additional observations in [`docs/ux/insights-current-state/README.md`](insights-current-state/README.md).

---

## 3. Alternatives comparison

| | **A — Ranked tables + inline bars** | **B — Donut drill-down** | **C — Category-stacked bars** |
|---|---|---|---|
| **Best for** | Top-N scan per side (primary task) | Drill from a specific donut slice | Anomaly hunting within categories |
| **Implementation cost** | **Low** (~½ day). Refactor existing component: drop central axis, mirror gastos cell to standard LTR, render two independent ranked lists. | **Medium** (~1.5–2 days). Donut needs controlled-state drill mode, back affordance, breadcrumb chip, client-side sub-slice computation. | **Medium** (~2 days). New component; segment label placement is the fiddly part. Existing `DivergingSubcategoryChart` doesn't generalise. |
| **Risk** | Minimal. Two independent lists can't have cross-side scaling bugs. Viewport stacking is trivial (single column). | Loses "see all subcategories at once." Categories with 10+ subcategories overflow the donut. | Tiny segments (<5% of category) are unreadable. Falls apart at high cardinality (>6 categories or >4 subcategories per category). |
| **Reusability** | High. Ranked-list-with-inline-bar is a general pattern reusable on any future breakdown panel (accounts, tags, periods). | Medium. Drill-down donut could serve category breakdowns elsewhere, but it's a specialised interaction. | Low. Stacked-bar-per-category is narrow; unlikely to appear in other Insights panels. |

---

## 4. Recommendation

**Ship Concept A — two stacked ranked tables with inline magnitude bars.**

The user's job here is rank-and-scan, not compare. Concept A is the most honest visualisation of two disjoint distributions: each side gets its own column, its own scale, its own sort — no false adjacency. It costs half a day, preserves the existing `selectedCategoryId` donut-drill flow without touching the donut component, and degrades cleanly from 1600 px to 900 px to mobile (single-column stack, same metaphor). The inline-bar pattern is reusable across future Insights panels, giving us a design primitive rather than a one-off.

---

## 5. Open questions — blocking

These must be answered before implementation begins:

1. **Which task dominates your real use?** Top-N scan across all categories (confirms A) or drill-from-a-specific-category (might upgrade A to A+single-column-collapse-on-click, +1 day). This is the one answer that could flip the recommendation.

2. **% display preference.** Each row can show % of side total ("Alquiler is 44% of all label gastos") or % of parent category ("Alquiler is 60% of Casa gastos"). Which is more useful for your audit workflow?

3. **Top-N cutoff.** Current chart shows top 10 per side with show-all toggle. Keep 10, reduce to 5, or show all by default?

The remaining 4 questions from Niobe's concept (anomaly highlighting, visual symmetry preference, A vs. A+drill variant, wait-for-snapshots) are real but non-blocking — they can be resolved during the implementation PR review.

---

## 6. Path to ship

Assuming Pedro approves Concept A:

| Step | Owner | Scope |
|---|---|---|
| **1. Revert the diverging chart** | Trinity | Remove `DivergingSubcategoryChart/` component and its CSS. Keep everything else from PR #141 (pac-man donut fix, breadcrumb labels on detail screen). One PR. |
| **2. Implement ranked tables** | Trinity | New `SubcategoryRankedTable` component: two side-by-side ranked lists, inline magnitude bars, colour pill linked to donut category, % column, "Ver todas" toggle. Wire into `InsightsDetailScreen` in place of diverging chart. Same PR as the revert, or a fast-follow — Trinity's call on atomicity. |
| **3. Test coverage** | Trinity | Playwright visual snapshot (reuse the harness Trinity already built at `tests/e2e/insights-snapshots.spec.ts`) for normal/skewed/sparse datasets. Unit tests for row sorting, % calculation, and `selectedCategoryId` filtering. |
| **4. Pedro review** | Pedro | Screenshots in the PR per the new directive. No merge without Pedro's explicit approval on the visual. |

**PR scope:** Prefer a single PR (revert + new component) to avoid a broken intermediate state on main. If the diff is too large for comfortable review, split into revert-first (PR A) then implement (PR B), merging A only after B is ready.

---

## 7. What we're NOT doing in v1

- **Donut drill-down interaction** (Concept B). Worth revisiting if Pedro's dominant task turns out to be slice-level drill, but not in this fix.
- **Cross-month comparison.** "How did Alquiler trend over the year?" is served by the monthly evolution panel, not here.
- **Anomaly highlighting.** Flagging subcategories that diverge from the label's historical mix is interesting but adds complexity; defer to a follow-up.
- **Transaction-level links from rows.** Clicking a subcategory row to jump to filtered Movimientos is specified in UX-005 but is a separate work item.
- **New design tokens or visual-styling decisions.** Mouse owns spacing, type scale, colour token application, and hover states — those land during implementation, not in this decision.
