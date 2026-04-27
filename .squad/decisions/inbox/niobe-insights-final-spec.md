### 20260502 — Insights Final Spec (UX-005)
**By:** Niobe (Spec / UX Analyst)  
**What:** Final implementation-ready spec for Insights section, consolidating UX-005 IA + Amendment A1 + prototype critique.

**Summary:** Pedro's prototype (`insights.jsx`) provided the foundation, but I made 10 specific calls: KEEP the LabelOverviewCard structure and SVG donut approach; REJECT the YoY small-multiples grid (retired — mockup #1 defines a different pattern) and inline transaction table (duplicates Movimientos); MODIFY the segmented toggle to change display mode not sort order, fix donut empty state copy, make tag combiner a proper dropdown not native select, and add responsive breakpoints for account bars.

**Critique highlights:**
1. **YoY view retired** — mockup defines campaign-performance cards, not yearly comparison tiles. VerticalBarTile component NOT needed for M4.
2. **Toggle semantics corrected** — it's a display mode selector (what metrics to show), not a sort selector. Sorting stays by volume.
3. **Transaction table removed** — drilldown shows aggregates only; "Ver todos los movimientos →" link for detail.
4. **Donut palette** — reject hardcoded colors; use deterministic hash from category ID for consistency.
5. **Tag combiner** — must be searchable dropdown, not native select, with dismissible chips.

**M4 ship order:** PR #98 (scaffolding) → #99 (DonutChart + SegmentedToggle) → #100 (landing) → #101 (drilldown). MVP is #98–100.

**3 open questions for Pedro:** (1) Landing date window — all-time or current year? (2) Multi-label overlap — disclose or accept? (3) Drilldown link — filter by tags only?

**Spec location:** `docs/ux/specs/ux-005-insights-final-spec.md`
