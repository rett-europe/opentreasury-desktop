# PRD-002 — Saldo / Balance View

> **Status:** Draft · **Owner:** Link (PM) · **Last updated:** 2026-04-19
> **Target milestone:** [M1 — Single-user happy path](../roadmap-v1.md#m1--single-user-happy-path)
> **Depends on:** [vision §5](../vision.md#5--scope--in-v1), [ADR-001](../../architecture/adr-001-tech-stack.md), [PRD-001 Movements](./prd-001-movements.md), **[PRD-009 i18n Foundations (M0)](../prd-plan.md#m0--foundations)**, [PRD-010 Accounts](#), [PRD-011 Categories](#)
> **Prototype reference:** [`prototype/saldo.jsx`](../../../prototype/saldo.jsx)

---

## 1. Summary

Saldo is the treasurer's **year-over-year comparison view** — income and expense broken down by category, with a net-monthly chart that puts 2025 and 2026 side by side. Where Movements is the transactional surface, Saldo is the *stepping-back* surface: "are we ahead or behind vs last year, and in which categories?"

## 2. User Problem

**Who.** The NGO treasurer preparing for a board meeting; the board member / auditor looking for direction without reading individual transactions.

**Pain.**
- The cloud "Balance" page shows current-year category totals but makes YoY comparison a multi-click, multi-page chore.
- Projections (annualised from partial-year data) are not shown — boards routinely ask "what does this trend extrapolate to by December?" and treasurers recompute manually.
- Monthly net trend is visible only in the Dashboard, not alongside category totals — forcing context-switching.

**Evidence.** Inherits from vision §9 row "Balance (Saldo / YoY)". Prototype already encodes the pattern the treasurer wants (compare rows + net trend chart) — PRD codifies the product contract.

## 3. User Scenarios

**S1 — Board-meeting prep.** Juan opens Saldo the morning of the quarterly board. He picks "Año — 2026 vs 2025". He sees income up 11% YoY in Donaciones but down 20% in Eventos. He takes a screenshot and writes three sentences.

**S2 — Seasonality check.** In April, María wants to know if April's partial-year numbers are trending ahead or behind the prior full year. The projected-to-full-year annotation on each category row gives her that at a glance.

**S3 — Quarterly vs yearly view.** The treasurer switches the period selector from Año to Trimestre to see Q1-2026 vs Q1-2025.

**S4 — Export.** After the board meeting, the treasurer wants to hand the same view to the auditor. CSV export of the visible breakdown ships in M3 (PRD-008) — **Saldo export is deferred to M3**.

## 4. Product Requirements

### Core behaviour

- **PR1 — Two panels side by side.** The page MUST render two comparison panels: **Income by category** and **Expense by category**, each rendered as a list of rows comparing the selected period (current) vs the same period last year (previous).
- **PR2 — Comparison row content.** Each row MUST show: category name, optional subcategory/type sublabel, previous-period total, current-period total, delta indicator (↑/↓/flat with percentage).
- **PR3 — Normalisation for partial-period comparison.** If the current period is a partial year/quarter (e.g., Jan–Apr 2026), the delta MUST explicitly compare **projected full-period current** vs **full prior period**, with a small-text annotation ("proy. vs 2025" / "projected vs 2025"). The projection is a linear pro-rata. More sophisticated projection is out of scope.
- **PR4 — Net-monthly comparison chart.** Below the two panels, a chart MUST render monthly net (income − expense) per month, with current-year and prior-year bars side by side for all 12 months. Months with no data render flat.
- **PR5 — KPI strip.** Above the panels, a KPI strip MUST show: total income (current + projected), total expense (current + projected), net. Each KPI cites the prior-year value alongside.
- **PR6 — Period selector.** The user MUST be able to pick the granularity of comparison: **Mes**, **Trimestre**, **Año**. Default = Año. A secondary date-range affordance specifies *which* year/quarter/month — default is the current (e.g., 2026 vs 2025).
- **PR7 — No empty-on-open constraint.** Unlike PRD-001, Saldo MAY load with the default selection (current year vs prior year) on open. The Movements empty-on-open rule is specific to transaction listings; aggregation views are acceptable to auto-render.
- **PR8 — Category ordering.** Within each panel, categories MUST be sorted by current-period total descending. Ties broken alphabetically. (Reordering by user is out of scope for M1.)
- **PR9 — Zero-total suppression.** Categories with zero in both periods MUST be hidden from the panels (they clutter the view without signal).
- **PR10 — Account filter (secondary).** An account filter MUST be available (default: all accounts). When active, the breakdown reflects only the chosen account. Not a primary affordance — top-bar filter, same pattern as Movements.

### Data integrity

- **PR11 — Read-only derivation.** Saldo MUST read from the derived SQLite read model only; it never writes events. Any aggregation logic is a reducer on the existing event stream (ADR-001 Option A).
- **PR12 — Consistent with Movements.** Totals shown on Saldo for a given (period, account, category) MUST equal the totals the same filter set would produce in Movements. This is a property-test target in the paired spec.
- **PR13 — All transactions are confirmed.** Per PRD-001 PR9, the product has **no pending/draft/provisional transaction concept**. Saldo totals therefore reflect **all confirmed transactions** in the selected period/account/category scope — there is no "pending vs approved" distinction, no include/exclude toggle, no filter affordance around status. (Resolved 2026-04-19.)

### Performance / NFR

- **PR14 — Render latency.** Saldo MUST render in ≤300ms (p95) on 1,000 events, cold. ≤100ms on period-selector change after warm-up.
- **PR15 — Offline.** All aggregations computed locally; no network.

### Accessibility

- **PR16 — Keyboard.** Period selector, account filter, every comparison row (selectable for drill-through in v1.x — not yet clickable in M1), chart tooltip focus — keyboard reachable.
- **PR17 — Chart is not the only signal.** The net-monthly chart MUST be accompanied by a compact data table (visually discoverable but collapsible) so screen-reader users have an equivalent representation (WCAG 1.1.1).

### Localisation

- **PR18 — i18n-ready (day-0).** All user-visible strings MUST be sourced from the M0 i18n framework (PRD-009). **Both ES and EN string tables populated in M1** for every label, KPI caption, panel title, delta-direction annotation, projection annotation, and empty-state copy this PRD introduces. No hardcoded strings.
- **PR18.1 — Locale-aware formatting.** Currency amounts, percentages, and month labels on the chart MUST be rendered through locale-aware formatters (`Intl.NumberFormat`, `Intl.DateTimeFormat` with `month: 'short'`). Percentage delta signs and decimal conventions follow the active locale.

### Security-adjacent

- **PR19 — No new data types.** Saldo introduces no new encrypted record types; it reads existing events. No new crypto surface.

## 5. Scope

### In (v1 / M1)

- Two side-by-side comparison panels (income/expense).
- KPI strip.
- Net-monthly comparison chart with accompanying data table.
- Period selector (Mes / Trimestre / Año).
- Account filter.
- Linear pro-rata projection for partial periods.

### Out

| Out of scope | Target | Why |
|---|---|---|
| CSV export of Saldo view | M3 (PRD-008 extends to cover Saldo) | Part of v1 export batch. |
| PDF export | M4 (PRD-016) | — |
| Drill-through from a category row to a pre-filtered Movements view | v1.x | Requires UX spec for the navigation contract. |
| User-reorderable categories | v1.x | Saved-preference infrastructure not yet. |
| Budget line overlay (budget vs actual) | Later (vision §9 "Budgets / forecasts → Later") | Out of v1 entirely. |
| Multi-currency grouping | Later | Out of v1. |
| Advanced projection models (seasonality, YoY-weighted) | Later | Linear pro-rata is enough for v1. |
| Pivot by tag instead of category | v1.x | Tag-centric views are their own PRD. |

## 6. Success Metrics

| Metric | Target | Ties to | Source |
|---|---|---|---|
| Board-meeting prep time | Pilot NGO: ≤5 min from open to copy-to-clipboard YoY summary | PR1–PR6 | Pilot interview |
| Saldo totals === Movements totals | 100% consistency on property tests | PR12 | Automated tests |
| Render latency p95 | ≤300ms cold @ 1,000 events | PR14 | Local instrumentation |
| Screen-reader data-table equivalence | 100% of chart data accessible in table form | PR17 | Manual audit |

## 7. Dependencies

- **Vision** — [`vision.md`](../vision.md) §5 (Balance (Saldo / YoY) is v1-Must), §7 Principles 4 (adaptation not translation) and 5 (offline).
- **ADRs** — [ADR-001](../../architecture/adr-001-tech-stack.md) Option A. No new conditions beyond what PRD-001 already engages — Saldo is a read-model consumer.
- **ADR-001 conditions touched (by paired spec)** — **C6** (renderer isolation), **C7** (Electron hardening), **C13** (schema-validated IPC for any aggregation RPCs).
- **Security requirements** — **R1** (no PII exposed in export until PRD-008 extends it), **R11**, **R12**, **R15**.
- **Crypto-spec** — No direct dependency beyond inherited envelope from PRD-001's event production.
- **Other PRDs** — **PRD-009 i18n Foundations (M0)** — PR18/PR18.1 depend on its framework; PRD-001 Movements (Saldo reads the same events), PRD-010 Accounts (account filter), PRD-011 Categories (breakdown key).
- **Prototype** — [`prototype/saldo.jsx`](../../../prototype/saldo.jsx) is the UX baseline: the two-panel compare layout, the KPI strip pattern, the net-monthly side-by-side bars.

## 8. UX Handoff Notes (for Niobe)

Niobe owns `docs/ux/specs/ux-004-saldo-screen.md`. Areas needing her spec:

- **Projection annotation copy.** "proy. vs 2025" is prototype shorthand. Niobe specs the full tooltip explaining the linear pro-rata method so a treasurer isn't surprised. This is a user-literacy question, not a visual one.
- **Empty states.** (a) No transactions at all ("aún no hay datos"), (b) only current-period has data (no prior-year bars), (c) only prior-year has data. Niobe specs each.
- **Period-selector + account-filter affordance.** Segmented control vs dropdown — Niobe picks. The contract is: changes apply immediately, no "Apply" button.
- **Chart accessibility pattern** (PR17). Niobe specs the collapse/expand pattern and whether the data table is always visible or on-demand.
- **Zero-total suppression boundary.** A category that was non-zero last year but zero this year — should it show (signalling a drop) or hide? PR9 says hide if *both* zero; the one-sided case needs Niobe's call.
- **Delta thresholds for up/down/flat arrows.** Prototype uses ±3%. Niobe confirms.
- **Subcategory drill-down** (issue #67 WI-B) → **Separate spec:** `docs/ux/specs/ux-004a-saldo-subcategory-drilldown.md`. Extends the base Saldo screen with optional per-subcategory YoY comparison via global toggle.

Niobe: DO NOT change the two-panel layout or the KPI strip pattern from the prototype. DO spec the micro-copy, empty states, and a11y details.

## 9. Open Questions (for Pedro)

1. ~~**Pending transactions in Saldo totals.**~~ **RESOLVED (2026-04-19):** there is **no pending concept** in this product — all transactions are confirmed (bank/PayPal statements + manual entry). PR13 rewritten accordingly. No toggle, no distinction, no open design question.
2. **Default period on first open.** Current year vs previous year (my default) — or current month vs same month last year, which is faster but less board-relevant? *Recommendation: year.*
3. **Projection method.** Linear pro-rata (months-elapsed × 12 / months-elapsed) is simple. If you expect seasonal donation patterns (e.g., gala in December), a linear projection will mislead. *Recommendation: linear in M1; add a "projection disabled for this category" opt-in in v1.x.*
4. **Drill-through to Movements.** Clicking a category row → Movements page pre-filtered to that category + period — powerful but triggers a navigation contract (back button? new view?). *Recommendation: defer to v1.x.*
5. **What counts as "previous period" for Mes selector.** If the user picks Mes = April 2026, is the comparison April 2025, or March 2026? Convention differs by country. *Recommendation: same-month-prior-year (April 2025). Revisit if pilot NGO disagrees.*

## 10. Status History

| Date | Status | By | Notes |
|---|---|---|---|
| 2026-04-19 | Draft v0.1 | Link | Initial PRD for Saldo (YoY comparison view) in M1. |
| 2026-04-19 | Draft v0.2 | Link | **Removed pending-transaction distinction** per Pedro resolution — totals reflect all confirmed transactions in scope. PR13 rewritten; Q1 closed. **Strengthened i18n (PR18, PR18.1)** for day-0 ES+EN + locale-aware formatting. Added PRD-009 to Dependencies. |

---

*End of PRD-002 Draft — next: Pedro reviews, Niobe drafts `docs/ux/002-saldo.md` in parallel.*
