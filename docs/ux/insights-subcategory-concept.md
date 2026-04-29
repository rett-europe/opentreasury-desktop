# Insights Detail — Subcategory Distribution: UX Concept

**Author:** Niobe (Spec / UX Analyst)
**Date:** 2026-05-04
**Status:** 🟡 Concept — awaiting Pedro decision before any implementation
**Scope:** The "distribution per subcategory" panel below the Gastos|Ingresos donuts on the **Insights label-detail screen** (the drilldown opened from a tag card on the Insights landing).

> Pedro tested the diverging-bar implementation shipped in PR #141 and called it "not well resolved at all… very confusing." This document defines the user need, diagnoses why the current approach fails, proposes three alternatives, and recommends one. **No code changes** are proposed here — implementation waits on Pedro's call.

Related code:
- `app/src/renderer/components/DivergingSubcategoryChart/DivergingSubcategoryChart.tsx`
- `app/src/renderer/screens/InsightsDetailScreen/InsightsDetailScreen.tsx`
- IPC contract: `app/src/shared/ipc-contracts/insights.ts` (`SubcategoryRow`, `IPC_INSIGHTS_LABEL_BY_SUBCATEGORY`)

Related decisions:
- `.squad/decisions.md` — 2026-04-28 entry "Insights Detail Page Polish — Pac-Man SVG Fix, Diverging Bars, Breadcrumb Labels (Trinity, PR #141)"
- `docs/ux/specs/ux-005-insights-final-spec.md` (overall Insights IA)

---

## 1. User need

The user reaching this panel has just clicked a **tag card** on the Insights landing (e.g. "Campaña Navidad 2026") and is now on the label-detail screen. The two donuts have already answered the **category-level** question: *"Where in my chart of accounts did the money for this label move?"*

The subcategory panel must answer the **next** question down the funnel. Talking to the data shape (`SubcategoryRow` carries one parent category and one subcategory leaf, with separate income/expense cents), the user need is:

> **"Within this label, which specific line-items (Category › Subcategory) drove the totals — and is anything unexpectedly large or small?"**

This decomposes into three concrete sub-tasks, in priority order:

1. **Top-N scan.** "Show me the biggest few subcategories on each side, in order, with their amounts." This is the primary task — NGO admins audit campaigns by skimming the largest line items and checking they look right.
2. **Drill from donut.** "I clicked a slice of the Gastos donut → I want to see *only that category's* subcategories broken out." This is the existing `selectedCategoryId` flow and must keep working.
3. **Anomaly hunting.** "Is there a subcategory I didn't expect to see at all, or one that's surprisingly small?" Secondary, but real — this is what Pedro means when he dogfoods.

Tasks NOT in scope for this panel:
- Time-series ("how did Alquiler trend over the year?") → already served by the monthly evolution panel.
- Transaction-level inspection → users go to Movimientos (per UX-005 final spec).
- Category-level overview → already served by the donuts.

**Implication:** This is a **lookup + ranking** task, not a comparison task. The user is *not* trying to compare a gastos-side subcategory to an ingresos-side subcategory — those don't share keys (per the 2026-04-28 decision rationale). The current diverging layout was optimised for a comparison the user does not perform.

---

## 2. Why the current diverging-bar layout is confusing

I haven't received Trinity's snapshots yet (`docs/ux/insights-current-state/` does not exist as of this writing), so the diagnosis below is inferred from reading `DivergingSubcategoryChart.tsx`/`.css` and from the data shape. Five concrete failure modes:

1. **The diverging metaphor implies a comparison that doesn't exist.** Diverging bars are the canonical chart for *paired* opposing values that share an axis category — e.g. survey "agree vs. disagree" per question, or net migration in/out per country. Here, the two sides have **disjoint keys**: the row labelled `Casa › Alquiler` on the left has no counterpart on the right; `Salario › Base` has no counterpart on the left. Users instinctively read across rows looking for paired meaning and find none.
2. **The zero baseline is decorative, not a reference.** Each row is the union of an arbitrary gastos subcategory and an arbitrary ingresos subcategory, paired only by *rank index*. Row 1 might be `Casa › Alquiler` 4 200 € on the left and `Donaciones › Particulares` 12 000 € on the right — the spatial adjacency is meaningless. The central axis line is a chart convention applied to non-chart data.
3. **Label legibility falls off a cliff at typical viewport widths.** The breadcrumb format `Categoría › Subcategoría` (e.g. `Programas Educativos › Material Didáctico`) is long. Each side gets ~½ of the panel width minus padding minus the bar minus the amount. On a 1280 px window with the side rail open, each label cell is ~280 px and most breadcrumbs ellipsis-clip mid-word. The breadcrumb solves disambiguation but only if it's actually *readable*.
4. **The layout reverses reading direction on the gastos side.** Per `DivergingSubcategoryChart.css` the gastos cell uses `flex-direction: row-reverse` so the colour pill hugs the central axis. Result: the user reads the amount first, then a bar growing right-to-left, then the label — opposite of every other table in the app (Saldo, Movements). This is a hidden cognitive tax.
5. **It severs from the donut above.** The donut's natural drill interaction is "click a slice → see its subcategories." In the current panel, clicking a slice filters *both sides* and the surviving rows are scattered through a layout that no longer needs two sides (one side is now empty or sparse). The layout pays the cost of being two-sided even when a single side would suffice.
6. **Responsive collapse is a different chart entirely.** Below 720 px the diverging metaphor disappears — both sides stack into vertical lists. The user has to learn two visualisations of the "same" data depending on window width.

---

## 3. Three alternative concepts

For each: name, sketch, pros/cons, cost, fit. All three reuse the existing `IPC_INSIGHTS_LABEL_BY_SUBCATEGORY` contract — no backend work implied.

### Concept A — Two stacked tables with inline magnitude bars ("Sortable list, text-first")

One column per side (Gastos | Ingresos), each rendered as a ranked list of rows. Each row: colour pill, breadcrumb label, inline magnitude bar (full width of its column, scaled to that side's max), formatted amount, and the % of side total. Identical visual language on both sides — they don't pretend to share an axis.

```
┌─────────────────────────────────────┬─────────────────────────────────────┐
│ GASTOS                       4 820 €│ INGRESOS                    12 400 €│
├─────────────────────────────────────┼─────────────────────────────────────┤
│ ● Casa › Alquiler                   │ ● Donaciones › Particulares         │
│   ████████████████████  2 100 €  44%│   ████████████████████ 7 200 €   58%│
│ ● Casa › Suministros                │ ● Subvenciones › Ayuntamiento       │
│   ██████████          1 050 €    22%│   ███████████        3 800 €     31%│
│ ● Programas › Material…             │ ● Donaciones › Empresas             │
│   ███████              720 €     15%│   ████                1 400 €    11%│
│ … 4 más  [Ver todas]                │ … 2 más  [Ver todas]                │
└─────────────────────────────────────┴─────────────────────────────────────┘
```

- **Pros:** Direct match to user task #1 (top-N scan per side). Each label has the full column width — far less truncation. Reading direction is consistent (label → bar → amount, ltr on both sides). The two columns are visually parallel but make no false comparison claim. Drill from donut (`selectedCategoryId`) collapses to single-column nicely. % of side total directly answers "how dominant is this line in the label?".
- **Cons:** Loses the "single-glance" feel the diverging chart aimed for. Two scrollable lists side-by-side use more vertical real estate when both sides have many rows. No visual link drawn between donut slice colour and table row beyond the pill (same as today).
- **Cost:** **Low.** This is essentially the existing component refactored: drop the central axis, mirror the gastos cell back to standard direction, render two independent ranked lists. ~½ day including tests.
- **Good fit when:** Most of the time. Works for any viewport ≥720 px; on narrower it stacks (single column) without changing metaphor.

### Concept B — Donut drill-down (in-place subcategory donut)

Clicking a category slice in the Gastos or Ingresos donut transforms *that* donut to show **subcategories of the clicked category only**, with a breadcrumb chip and "← Volver" affordance. The companion (other-side) donut stays at category level. The third panel below disappears entirely — the donut *is* the subcategory view.

```
┌──────────────────────────────┐  ┌──────────────────────────────┐
│ GASTOS  ‹ Casa               │  │ INGRESOS                     │
│  [chip: Casa ✕]              │  │  (unchanged, category donut) │
│                              │  │                              │
│      ╭───╮                   │  │      ╭───╮                   │
│     │ ⊙ │ ← donut now slices │  │     │ ⊙ │                    │
│      ╰───╯   = subcategories │  │      ╰───╯                   │
│                              │  │                              │
│ ● Casa › Alquiler   2 100 €  │  │ ● Donaciones      8 600 €    │
│ ● Casa › Suministros 1 050 €  │  │ ● Subvenciones    3 800 €    │
│ ● Casa › Reparaciones  300 € │  │ ● Otros             … €      │
└──────────────────────────────┘  └──────────────────────────────┘
                (no third panel)
```

- **Pros:** Strongest answer to user task #2 (drill from donut) — the drilldown happens *in* the donut, no second visualisation needed. Removes one whole panel from the page → less to scroll, less to learn. Keeps the donut's strong visual encoding (angle = share of parent).
- **Cons:** Loses "see all subcategories at once" — the user can only see one parent's children at a time. No cross-category subcategory ranking ("biggest line items overall"). Donuts with >5 slices already get crowded; some categories (e.g. `Programas`) may have 10+ subcategories which won't fit in one donut → fallback to truncated legend with "Otras". User task #1 (top-N across categories) becomes harder.
- **Cost:** **Medium.** `DonutChart` needs a controlled-state mode for the active drill, plus a back affordance and breadcrumb chip. The existing read model returns `SubcategoryRow` — fine, but the donut needs to compute per-category sub-slices client-side. ~1.5–2 days.
- **Good fit when:** The user mostly enters from a specific category click (task #2) and rarely needs cross-category subcategory ranking. Note: this is the *opposite* of the current model — verify with Pedro which mode dominates his real use.

### Concept C — Stacked bar per category ("category strip with subcategory segments")

One horizontal bar per **parent category** that has activity, length proportional to that category's total magnitude, segmented by subcategory. Two strips: Gastos on top, Ingresos below. Bars are rank-ordered by total magnitude; segments within a bar are rank-ordered left-to-right. Hover/click a segment to see breadcrumb + amount; click the category label to filter (existing `selectedCategoryId` flow).

```
GASTOS                                                            4 820 €
Casa            ████████████████████████████████          3 450 €
                │ Alquiler 2 100 │ Suministros 1 050 │ Reparac. 300 │
Programas       ██████████████                            1 050 €
                │ Material 720 │ Transporte 230 │ Otros 100 │
Otros           ████                                        320 €

INGRESOS                                                         12 400 €
Donaciones      ████████████████████████████████████████  8 600 €
                │ Particulares 7 200 │ Empresas 1 400 │
Subvenciones    ██████████████                            3 800 €
                │ Ayuntamiento 3 800 │
```

- **Pros:** Single-glance overview of *both* hierarchies (category total + within-category mix) without two charts. Strong answer to user task #3 (anomalies pop visually — a thin segment in a long bar reads as "small subcategory of a large category"). Maintains hierarchy: parent first, children inline.
- **Cons:** Tiny segments (<5 % of category) are hard to read or interact with — needs a tooltip or "Otras" rollup per category. Long subcategory labels don't fit inside narrow segments → external label list needed, which partially defeats the compactness. Comparing sub-segments *across* categories is hard (same problem stacked bars always have).
- **Cost:** **Medium.** New component; existing `DivergingSubcategoryChart` doesn't generalise (single-axis, not segmented). Segment label placement (inside vs. outside) is the fiddly part. ~2 days.
- **Good fit when:** The category list is short (≤6) and most categories have ≤4 subcategories. Falls apart at higher cardinality.

---

## 4. Recommendation

**Ship Concept A — two stacked ranked tables with inline bars.**

Rationale, in one paragraph: The user's actual job here is **rank-and-scan**, not compare. Concept A is the most honest visualisation of disjoint distributions; it costs the least to ship; it preserves the existing donut/drill flow without rewriting the donut; and it's the most resilient across viewport widths and data shapes (sparse labels, long tail, dominant single category — all degrade gracefully). The diverging chart's appeal was visual symmetry, but symmetry without shared keys is decoration. Concept B is interesting and may be worth piloting later as a *replacement for the donut+panel split*, but it's a bigger redesign than this fix warrants. Concept C is a real contender if Pedro's "anomalies" task is actually the dominant one — open question below.

If Pedro is willing to invest one extra day, the **strong second choice is Concept A + a lightweight donut drill-down**: i.e. keep the table panel but also let donut clicks update `selectedCategoryId` (already wired), making A's table collapse to a single-column "this category's subcategories" view. That blends the cheapness of A with the directness of B.

---

## 5. Open questions for Pedro

1. **Which task dominates?** Top-N scan across all categories (favours A), or drill-from-a-specific-category (favours B)? Your dogfooding instinct trumps my analysis here.
2. **How much do you care about the visual symmetry the diverging chart provided?** If "a lot" → A becomes less satisfying; if "I was indifferent, just want it readable" → A is fine.
3. **% display:** For each subcategory row, prefer **% of side total** ("Alquiler is 44 % of all label gastos"), **% of parent category** ("Alquiler is 60 % of Casa gastos"), or both? Different defaults for different concepts.
4. **Top-N cutoff:** Current diverging chart shows top 10 per side with show-all toggle. Keep, or change (5? 8? all-by-default)?
5. **Anomaly highlighting:** Should we visually flag rows that diverge from the label's "typical" mix (e.g. a subcategory that didn't appear in this label's previous windows)? This is task #3 from §1 — currently unaddressed by all three concepts. Could be a future addition.
6. **Concept A vs. Concept A + donut drill (single-column collapse on click):** The +1 day of work — is it worth it, or do you want the absolute minimum first?
7. **Trinity snapshots:** Should we wait for those before final approval, or is this concept enough to greenlight?

---

## 6. What this document does NOT decide

- Visual styling within the chosen pattern (Mouse owns: spacing, type scale, colour token application, hover states).
- The Movements-list link affordance from rows (already specified elsewhere in UX-005).
- Anything about the donuts themselves beyond preserving the `selectedCategoryId` flow.
- Backend / read-model changes — none required by any of the three concepts above.
