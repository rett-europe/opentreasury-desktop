# UX-005 — "Insights" Section · Information Architecture (v1)

> **Status:** v1 (finalized) · **Owner:** Niobe (Spec / UX Analyst) · **Promoted:** 2026-04-26
> **Trigger:** Pedro directive (`.squad/decisions/inbox/copilot-directive-20260426-174833-insights-section.md`):
> > *"Saldo per-label YoY (#69) is a crown jewel of a feature. I'm even wondering if we could create a specific new section for 'Insights' — it goes beyond balance info. Anything we could do around labels will be very interesting."*
>
> **Roadmap call:** Link's PM brief (`.squad/decisions/inbox/link-69-insights-prio.md`) selected option **(b)** — *spec the Análisis/Insights section now as a v1.x deliverable; ship #69 as its first inhabitant in M4.*
>
> **Inaugural view:** issue **#69** (per-label YoY) — see [`ux-005a`](./ux-005a-label-yoy-sketch.md). Slated for **M4**.
>
> **Related:** [UX-004 Saldo](./ux-004-saldo-screen.md) · [UX-006 App Shell & Navigation](./ux-006-app-shell-and-navigation.md) · [ux-005a Per-label YoY (v1)](./ux-005a-label-yoy-sketch.md)
>
> **Out:** this is the IA contract for the section. Per-view implementation specs live in `ux-005a`, `ux-005b`, …

---

## 1. Why Insights deserves its own section

Saldo and Insights answer **different questions**, and cramming the second into the first will dilute both.

| Surface  | Mental model the user is in | Question it answers | Time horizon | Pivot axis |
|---|---|---|---|---|
| **Saldo**    | "What's the *state*?"   | *Are we ahead or behind vs last year, in which categories?* | One period vs its mirror in the prior year. | Category × kind (income/expense). |
| **Insights** | "What's the *pattern*?" | *Where is concentration / seasonality / drift happening, across which dimension?* | Multi-year, rolling, or distributional. | Label, account, time-of-month, type, donor cohort, … |

Saldo has converged on a tight contract — KPI strip + two panels + monthly chart, all CY-vs-LY. Adding an orthogonal axis (labels cut **across** categories) inside Saldo would either (a) overload the same panels with a second pivot toggle, or (b) bolt a tab strip onto Saldo that already lost its tab strip in the redesign. Both are regressions of the "stepping-back surface" framing in UX-004 §1.

A dedicated section also gives us a home for the *next* analytics features Pedro is hinting at ("anything we could do around labels will be very interesting") without re-litigating Saldo's IA each time.

## 2. Naming

**Decision: `Análisis` (ES) / `Insights` (EN).**

- `Saldo` and `Movimientos` are already domain-loaded Spanish nouns with a 1:1 in the user's vocabulary. `Análisis` sits naturally beside them and is what a Spanish-speaking treasurer would say out loud.
- `Insights` (EN) is industry-standard for this surface (Stripe, QuickBooks, Mint all use it). `Analytics` is too engineering-flavoured for an NGO admin.
- Rejected: `Estadísticas` (too school-statistics, implies tables-of-numbers), `Informes` (collides with future Export/Reports surface, M3).

## 3. View inventory (M4 v1 candidates)

Each row is a "view" — one card the user lands on inside the section. Inaugural inhabitant is **(I-1)**, shipping in M4 as the first dweller of the new section; the rest are reservations to demonstrate the section earns its keep beyond a single chart.

| #   | View                          | One-liner                                                                       | Axis revealed             | Status            |
|-----|-------------------------------|---------------------------------------------------------------------------------|---------------------------|-------------------|
| I-1 | **Per-label YoY** (issue #69) | Yearly distribution per label, multi-year comparison.                           | label × time              | **M4 — inaugural view (spec: [`ux-005a`](./ux-005a-label-yoy-sketch.md) v1)** |
| I-2 | Label co-occurrence           | Which labels travel together on the same transaction (heatmap).                 | label × label             | reserved          |
| I-3 | Account velocity              | Transactions/month and net flow per account; surface the dormant ones.          | account × time            | reserved          |
| I-4 | Category seasonality          | 12-month average net per category over N years (smoothed).                      | category × month-of-year  | reserved          |
| I-5 | Income concentration          | Top-N donor labels / accounts as % of total income (Pareto).                    | label/account × magnitude | reserved          |
| I-6 | Expense rhythm                | Day-of-month density of expenses (catches end-of-month suppliers, payroll).     | type × day-of-month       | reserved          |

M4 ships **I-1 only**. I-2…I-6 are placeholders to validate the section's IA can grow; they are *not* commitments and will each need their own spec before scheduling.

## 4. IA rules (normative)

- **Nav order:** `Panel · Movimientos · Saldo · Análisis · Config · Importación`. Sits *after* Saldo (analysis is downstream of state) and *before* Config (configuration is admin, not consumption).
- **Global filter inheritance:** Insights does **not** inherit the dataset-wide date range from Saldo. Each view defines the time window appropriate to its question (e.g. per-label YoY needs ≥2 full years; seasonality needs ≥3). The shell's account filter, if/when promoted to global, *is* inherited.
- **Per-view filters compose locally.** Account, label, category filters live on the view card, not in a section-level filter bar. Reason: views have heterogeneous shapes; a shared filter bar would be misleading on at least half of them.
- **Read-only.** Like Saldo, no mutations. Click-throughs to Movimientos for drill-down (see ux-005a §2.5).
- **Empty section:** if the dataset has < N transactions or < 2 distinct years, show an empty-state card explaining what each view will unlock once data arrives. No half-rendered charts.
- **Section gating in M4:** until I-2…I-6 land, the section renders with the I-1 card plus a footer hint listing reserved views as "Próximamente". The nav entry is *not* feature-flagged off — its presence is part of the IA contract from M4 onwards.

## 5. Out of scope for v1

- Custom user-defined views / saved analyses.
- Export of insight cards (defer to M3 export work).
- Cross-view linking ("apply this filter to all cards").
- Forecasting / projection (Saldo dropped projection; Insights inherits that decision).
- Donor-CRM-style segmentation.
- Anything requiring a new IPC contract beyond aggregation reads.

## 6. Resolved IA questions

Originally surfaced in the DRAFT; resolved at v1 promotion (2026-04-26):

1. **Naming:** `Análisis` / `Insights` — confirmed (§2).
2. **Feature-flagging the section:** no — the nav entry ships with M4 alongside I-1; reserved views are advertised as "Próximamente" rather than hidden (§4).
3. **Section icon:** `chart-line` (sparkline-style). Final icon token confirmed during M4 visual handoff with Mouse.
4. **Account filter promotion to shell:** not in scope for M4. Insights views own their account filter locally per §4. Re-evaluate when ≥2 views are live.

---

*v1 IA contract. Pair with [`ux-005a`](./ux-005a-label-yoy-sketch.md) for the inaugural view spec.*
