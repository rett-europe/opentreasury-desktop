# PRD-003 — Panel / Dashboard

> **Status:** Draft · **Owner:** Link (PM) · **Last updated:** 2026-04-19
> **Target milestone:** [M1 — Single-user happy path](../roadmap-v1.md#m1--single-user-happy-path)
> **Depends on:** [vision §5](../vision.md#5--scope--in-v1), [ADR-001](../../architecture/adr-001-tech-stack.md), [PRD-001 Movements](./prd-001-movements.md), [PRD-002 Saldo](./prd-002-saldo.md), [PRD-010 Accounts](#)
> **Prototype reference:** [`prototype/panel.jsx`](../../../prototype/panel.jsx)

---

## 1. Summary

The Panel is the treasurer's **at-a-glance dashboard** — the default landing page showing per-account balances, the current month's income/expense/net KPIs, a 12-month bars chart, and a recent-transactions preview. Its job is to answer "is everything OK?" in under five seconds.

## 2. User Problem

**Who.** The NGO treasurer opening the app on a weekday. The board member glancing at the shared laptop during a meeting. The auditor checking recent activity.

**Pain.**
- The cloud "Dashboard" is fine but requires a login round-trip and loads account balances sequentially, making the "at-a-glance" promise feel slow.
- Sparkline trends per account aren't present in the cloud version; treasurers get balance-without-direction.
- Recent transactions exist as a separate tab; users have to click into it and wait.
- No single place integrates "balances + month totals + trend + recent activity" without scrolling across pages.

**Evidence.** Prototype's Panel screen is already the mental model Pedro wants. Inherits from vision §9 row "Dashboard (Panel)".

## 3. User Scenarios

**S1 — Morning health-check.** María opens the app. Panel is the landing page. She sees Unicaja at €18k, PayPal at €281, one account slightly negative (highlighted). Monthly KPIs show income > expense. She closes the laptop — 10 seconds total.

**S2 — Board meeting walk-through.** During a board meeting, the treasurer shares their screen on Panel. Balances and the 12-month bar chart answer 80% of board questions without any clicks.

**S3 — Drill-in.** Juan notices the expense bar for March looks tall. He clicks the 12-month chart's March column and is taken to Movements pre-filtered to March 2026 (drill-through is v1.x — M1 ships chart tooltips only). **Drill-in is out of scope for M1.**

**S4 — Recent activity glance.** The "Ver todos los movimientos →" link on the recent-transactions table takes the user to Movements (no pre-filter — Movements applies its own empty-on-open rule per PRD-001 PR1).

## 4. Product Requirements

### Core behaviour

- **PR1 — Default landing.** Panel MUST be the default route after app startup (once a folder + dataset is chosen — first-setup and enrollment are different flows).
- **PR2 — Account cards.** The page MUST render one card per active account, each showing: account icon/colour, short name, transaction count, current balance (right-colour by sign), and a 12-point sparkline (monthly net trend for the last 12 months).
- **PR3 — Negative-balance highlight.** Account cards with negative balance MUST be visually distinct (design tokens owned by Mouse). Balance number rendered in `expense` colour.
- **PR4 — KPI strip for the current month.** Three KPI cards: total income this month, total expense this month, net this month. Each displays the absolute value with appropriate colour and a sublabel naming the month.
- **PR5 — 12-month bars chart.** A chart MUST show the last 12 months' income (green) and expense (red) as adjacent bars per month. Tooltip per bar reveals exact amount. Legend below.
- **PR6 — Recent transactions preview.** The page MUST render the latest 8 transactions (by date, descending) in a compact table with: type arrow, date, account pill, observations, category, subcategory, amount. A "Ver todos los movimientos →" action navigates to Movements.
- **PR7 — Recent table is read-only.** No inline edit/delete/approve on Panel's recent table. Those actions live on Movements. Keeps Panel a **read-only overview**.
- **PR8 — No filters.** Panel has no filter controls. The KPI period is "current month"; bars are "last 12 months"; recent table is "latest 8". If users want flexibility they go to Movements/Saldo.

### Data integrity

- **PR9 — Read-only from the derived read model.** Panel produces zero events. It is a pure aggregation of the read model (ADR-001 Option A), same as Saldo.
- **PR10 — Consistency.** Account-card balance MUST equal the sum of the account's event amounts through today (accounts PRD-010 defines the reducer). Monthly KPIs MUST equal the sum of the month's events. The recent-transactions list MUST match the first 8 rows of a Movements query with no filter and date range = all.
- **PR11 — Pending inclusion.** Balances and monthly KPIs MUST include **pending and approved** transactions (same rule as Saldo PR13). Consistency with Movements is paramount. *See Open Question Q2.*

### Performance / NFR

- **PR12 — Cold open → Panel visible.** ≤500ms at 1,000 events on typical hardware. First paint shows skeleton within 100ms; full data swap ≤500ms.
- **PR13 — Offline.** All data local; no network.

### Accessibility

- **PR14 — Keyboard.** Every actionable element (account cards if they become clickable in v1.x; the "Ver todos..." link; chart tooltip focus) is keyboard reachable.
- **PR15 — Chart equivalence.** The 12-month bars chart MUST have a screen-reader-accessible data summary (same pattern as Saldo PR17). Can be a data table collapsible below the chart.
- **PR16 — Colour not sole channel.** Income/expense colour is redundant with direction arrow (↑/↓) in recent-tx, and with sign (− prefix) in balances. No information is colour-only.

### Localisation

- **PR17 — i18n-ready.** All strings via i18n layer. Month labels use locale-aware short names.

### Security-adjacent

- **PR18 — No new data types.** Pure read. Inherits renderer-isolation requirements from PRD-001. No new crypto surface.

## 5. Scope

### In (v1 / M1)

- Account cards with balances + sparklines + count.
- Current-month KPI strip (income, expense, net).
- 12-month income-vs-expense bars chart.
- Latest-8 recent-transactions preview (read-only).
- "Ver todos los movimientos →" navigation.

### Out

| Out of scope | Target | Why |
|---|---|---|
| Drill-in from chart/KPI/card to a pre-filtered Movements | v1.x | Requires navigation-contract UX spec. |
| Configurable Panel ("add/remove widgets") | Later | Not a priority; NGOs use it as-is. |
| Balance projection / "end of month" forecasting | Later (vision §9 Budgets/forecasts → Later) | Out of v1. |
| Per-account sparklines driven by real monthly buckets (prototype uses fake seeds) | M1 (clarification) | The prototype's fake-seeded sparklines must become real monthly-net per account by M1 ship. PR2 implies real data; the paired spec states it explicitly. |
| Tag-cloud widget | Later | Not a requested surface. |
| Quick-add-transaction from Panel | v1.x | Keeps Panel read-only (PR7). |
| Status-workflow counters (X pending, Y approved) | v1.x | Nice-to-have, not blocking. |
| CSV/PDF export of Panel | Never (use Saldo/Movements for export) | — |

## 6. Success Metrics

| Metric | Target | Ties to | Source |
|---|---|---|---|
| Cold open → Panel visible | ≤500ms @ 1,000 events | PR12 | Local instrumentation |
| Treasurer "health-check" session time | ≤10s from open to close when nothing's wrong | PR1–PR6 | Pilot interview |
| Balance-card accuracy | 100% match with Movements-derived totals | PR10 | Automated property test |
| Screen-reader chart equivalence | 100% of bars accessible via data table | PR15 | Manual audit |
| Board-meeting walkthrough suitability | Pilot NGO: Panel answers ≥80% of ad-hoc board questions without navigating away | PR2–PR6 | Pilot interview |

## 7. Dependencies

- **Vision** — [`vision.md`](../vision.md) §5 (Dashboard is v1-Must), §7 Principle 5 (offline).
- **ADRs** — [ADR-001](../../architecture/adr-001-tech-stack.md) Option A (read-model consumer).
- **ADR-001 conditions touched** — **C6** (renderer isolation), **C7** (Electron hardening), **C13** (schema-validated IPC for Panel aggregation queries).
- **Security requirements** — **R11**, **R12**, **R15**. No direct crypto or audit-log interaction (read-only, no mutations).
- **Crypto-spec** — None direct; Panel consumes already-decrypted read model.
- **Other PRDs** — PRD-001 (same event source), PRD-002 (same read model, overlapping aggregations — consistency tests shared), PRD-010 Accounts (account colours, metadata).
- **Prototype** — [`prototype/panel.jsx`](../../../prototype/panel.jsx) is the UX baseline: the account-card grid, the KPI strip, the 12-month bars chart, and the recent-tx preview table.

## 8. UX Handoff Notes (for Niobe)

Niobe owns `docs/ux/003-panel.md`. Areas needing spec:

- **Empty states.** (a) No accounts yet (post-first-setup, pre-first-tx), (b) accounts but zero transactions, (c) transactions but none in current month. Niobe specs copy + affordances (e.g., "Crea tu primer movimiento" with link).
- **Skeleton loading pattern** (PR12). Specify the skeleton for account cards, KPI strip, chart, recent table — so the first 100ms isn't empty.
- **Sparkline when <12 months of data available.** The prototype has fake seeds; real implementation will have 1–2 months at first. Niobe: decide between "partial sparkline with pad" vs "no sparkline until ≥3 months".
- **Negative-balance treatment** beyond colour (PR3, PR16). Icon? Warning pill? Niobe's call.
- **Responsive layout.** Electron window can be resized. Spec the breakpoints: account card grid reflow, chart width, KPI-strip collapse.
- **"Ver todos →" destination** (PR6). This links to Movements; confirm no pre-filtering is passed (lands on the empty-on-open state, per PRD-001 PR1).

Niobe: DO NOT respec the overall composition (cards + KPIs + chart + recent). DO spec the loading, empty, error, and edge-case states.

## 9. Open Questions (for Pedro)

1. **Monthly KPI period definition.** "Current month" = calendar month (Apr 1 – Apr 30)? Or rolling-30-days? Prototype says calendar month. *Recommendation: keep calendar month.*
2. **Pending inclusion in Panel totals** (echoes PRD-002 Q1). Include pending? *Recommendation: yes, consistent with PRD-002.*
3. **Account-card click behaviour.** M1 says not clickable (read-only overview). Should clicking navigate to Movements filtered by account? *Recommendation: defer to v1.x to keep M1 contract clean.*
4. **Inactive-account display.** If an account has zero transactions or was archived (archival is v1.x), should it still appear as a card? *Recommendation: v1.x when archival ships. M1 shows all accounts that exist.*
5. **Recent-tx count — 8, 10, or configurable.** Prototype says 8. Board screens might want more. *Recommendation: fix at 8 in M1; make configurable only if pilot feedback demands.*

## 10. Status History

| Date | Status | By | Notes |
|---|---|---|---|
| 2026-04-19 | Draft v0.1 | Link | Initial PRD for Panel dashboard in M1. Read-only contract (PR7) is the load-bearing shape decision. |

---

*End of PRD-003 Draft — next: Pedro reviews, Niobe drafts `docs/ux/003-panel.md` in parallel.*
