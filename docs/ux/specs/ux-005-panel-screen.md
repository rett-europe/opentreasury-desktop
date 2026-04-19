# UX-005 — Panel Screen (Dashboard)

> **Status:** Draft v0.1 · **Owner:** Niobe (Spec / UX Analyst) · **Date:** 2026-04-19
> **Paired PRD:** [`docs/product/prds/prd-003-panel.md`](../../product/prds/prd-003-panel.md)
> **Paired flow:** none (landing surface; no user gate)

**Traceability:** PRD-003 PR1–PR18 · vision §5, §7 P5 (offline) · ADR-001 C6/C7/C13 · security-requirements v0.2 R11/R12/R15 · prototype-analysis **G6** (empty-DB) · decisions 2026-04-19 (no pending; day-0 i18n) · [UX-001](./ux-001-first-run-setup.md) (first-run lands here) · [UX-003](./ux-003-movements-screen.md) ("Ver todos" hand-off) · [UX-006](./ux-006-app-shell-and-navigation.md) (global banners).

---

## 1. Summary

Panel is the **default landing** screen — a read-only overview answering *"is everything OK?"* in under five seconds: per-account balance cards with 12-month sparklines, current-month KPIs, a 12-month income-vs-expense bar chart, and the latest 8 confirmed transactions. No filters. No inline edits. No status badges. All data is live from the read model; all mutations happen on Movements.

## 2. User problem

Treasurers and board members need a one-glance health check. The cloud app split "balances", "month totals", "trend", and "recent activity" across multiple pages. Panel integrates them. First-run users land here (UX-001 hand-off) expecting immediate orientation — even when the database is empty.

## 3. Actors & preconditions

- **Treasurer / board viewer** — enrolled; DEK unwrapped.
- **App renderer** — mounts Panel on app start (default route, PR1) OR after first-run success.
- **Main process** — serves five read-model queries on mount: accounts list, per-account balances, per-account sparkline buckets, current-month KPIs, last-8 confirmed transactions.

**Preconditions:** first-run complete (UX-001) OR enrollment approved (UX-002). Panel is reachable with zero transactions (E1 empty-DB branch) and with zero accounts (first-run minimal state).

## 4. Happy path — morning health check

| # | User sees | User does | System does |
|---|---|---|---|
| 1 | App cold-starts; splash ≤100ms; Panel skeleton appears | wait | Renderer mounts Panel; issues 5 read-model queries in parallel |
| 2 | **Skeleton phase** ≤100ms: header shell, account-card grid shells, KPI strip shells, chart shell, recent-tx table shell | wait | Queries resolve |
| 3 | **Loaded state** ≤500ms @ 1,000 events (PR12): header *"Panel — {today}, vista general del mes"* + account cards + KPI strip + 12-month chart + recent-tx table | scans | — |
| 4 | Account cards: icon (colour), short name, `N movimientos`, balance (signed colour), 12-point sparkline | hovers a card | Sparkline tooltip shows last month's net |
| 5 | KPI strip: `Ingresos` · `Gastos` · `Neto` — each captioned *"Mes actual · {month} {year}"* | reads | — |
| 6 | 12-month bars chart: adjacent income (green) + expense (red) bars per month; legend below; tooltip per bar | arrow-keys into chart, bars focusable | Tooltip shows exact amount |
| 7 | Recent-tx table: latest 8 confirmed transactions, columns per §4.1; `Ver todos los movimientos →` link at footer | Click the link | Navigate to Movements. Per flow-003 Q7 (recommendation: treat click as range selection = `This month`), Movements lands in `range-loaded` directly on `This month`. §11 Q4 — confirm. |
| 8 | Satisfied (≤10s total if nothing's wrong) | Close window | — |

### 4.1 Surfaces

**Account card** (PR2, PR3):

| Element | Source | Notes |
|---|---|---|
| Icon / colour | account metadata | Colour from `account.color` (PRD-010) |
| Short name | `account.short` | — |
| Transaction count | derived: events targeting account | — |
| Balance | derived: sum of `tx.amount` for account | Signed; negative uses expense colour AND minus prefix (PR3, PR16) |
| Sparkline | derived: last 12 months of monthly-net per account | Line + soft fill; partial when <12 months of data (§11 Q1) |

**KPI strip** (PR4):

| Card | Value | Sublabel |
|---|---|---|
| Ingresos | sum(`tx.amount` where `type=income` ∧ date ∈ current calendar month) | *"Mes actual · {month} {year}"* |
| Gastos | sum(`abs(tx.amount)` where `type=expense` ∧ same month) | same |
| Neto | Ingresos − Gastos | same |

Monthly period = **calendar month** (PRD-003 Q1, recommendation adopted).

**12-month bars chart** (PR5):

- X = last 12 months (inclusive of current).
- Per month: income bar (green) + expense bar (red), adjacent.
- Tooltip: *"Ingresos {month}: {EUR}"* / *"Gastos {month}: {EUR}"*.
- Legend below: *"Ingresos"* / *"Gastos"*.
- Missing-data months render zero-height.

**Recent-tx table** (PR6):

| Col | Field | Notes |
|---|---|---|
| 1 | Type arrow (↑ / ↓) | Redundant with sign |
| 2 | Date | `Intl.DateTimeFormat(locale, { dateStyle: 'medium' })` |
| 3 | Account pill | Same pattern as Movements |
| 4 | Observations | Truncate at ~320px |
| 5 | Category | `Sin categorizar` badge when null |
| 6 | Subcategory | `—` when null |
| 7 | Amount | Right-aligned, coloured, `Intl.NumberFormat` EUR |

**Read-only contract (PR7):** no row click-through to edit; no checkbox; no row-level action menu. Footer row contains only *"Ver todos los movimientos →"*. This is load-bearing — Panel NEVER mutates.

**Removed from prototype:** the `Estado` column (no pending badge anywhere, PR11).

### 4.2 Quick-new transaction CTA

The prototype header shows a "Nuevo Movimiento" button on Panel. PRD-003 §5 "Out" defers quick-add-on-Panel to v1.x. Recommendation: **hide** the button in M1 Panel to keep PR7 read-only contract clean; the sidebar / `Ctrl+N` shortcut remains the universal path (UX-006 Q1). §11 Q2 — ratify.

## 5. States

| State | What's shown | Interactive? | Copy key root |
|---|---|---|---|
| `skeleton` | All four regions as shells ≤100ms | No | `ux.panel.loading` |
| `loaded` | All four regions populated | Yes | `ux.panel.loaded` |
| `empty-no-accounts` | Header + single card: *"Aún no tienes cuentas. Configúralas en Cuentas."* + link | Link | `ux.panel.empty.no-accounts` |
| `empty-accounts-no-tx` | Account cards show balance = 0, sparklines hidden; KPI strip all zeros; chart blank with *"Sin datos todavía"*; recent-tx table empty with *"Aún no hay movimientos. Registrar primer movimiento →"* | Link to Movements | `ux.panel.empty.no-tx` |
| `empty-no-tx-this-month` | Account cards + sparklines fine; KPI strip all zeros with *"Sin movimientos en {mes}"*; chart fine (may show bars for prior months); recent-tx table shows latest-8 **regardless of date** (PR6) | — | `ux.panel.empty.current-month` |
| `partial-sparkline` | Accounts with <3 months of data: hide sparkline; show *"Tendencia disponible cuando haya 3 meses de datos"* tooltip (§11 Q1) | — | `ux.panel.sparkline.partial` |
| `negative-balance-card` | Account card with negative balance: expense colour + minus prefix + neutral warning icon (not alarmist) — visual treatment owned by Mouse | Read | `ux.panel.card.negative` |
| `query-error` | Failed region renders inline error + Retry; other regions remain | Retry | `ux.panel.error.region` |
| `partial-decrypt-failed` | Loaded view + banner *"{N} movimientos no pudieron leerse — balances y KPIs pueden ser incompletos. Ver detalles."* → UX-009 | Banner action | `ux.panel.decrypt-partial` |

**Global states** (offline / syncing / locked / error / revoked) render in the UX-006 shell banner slot, stacked above Panel content.

## 6. Edge cases & errors

| Trigger | User sees | Recovery |
|---|---|---|
| **E1.** Brand-new NGO, zero accounts | `empty-no-accounts` with CTA to Accounts (UX-015) | Create first account |
| **E2.** Accounts exist, zero transactions | `empty-accounts-no-tx`; balance cards show €0; CTA to Movements' new-tx | Record first tx |
| **E3.** Current month has zero transactions but prior months exist | `empty-no-tx-this-month`: KPIs zero with month name; chart still shows prior months; recent-tx still shows latest-8 from prior months | — |
| **E4.** <3 months of data (sparkline meaningless) | `partial-sparkline` — hide line, show tooltip (§11 Q1 recommendation) | wait |
| **E5.** Sub-query fails (e.g., sparkline bucketing error) | Affected region shows inline *"No se pudo cargar"* + Retry; other regions remain loaded | Retry |
| **E6.** Decrypt failures on some events | `partial-decrypt-failed` banner; balances exclude unreadable events; footnote in KPI card if it affected totals | UX-009 |
| **E7.** Event log has tx with unknown `account_id` (deleted account, reference not yet cleaned) | Skip the tx from balance calc; log dev-only warning; no user-visible error | — |
| **E8.** Clock skew / future-dated tx in event log | Include in balance calc regardless of date (all confirmed, PR11); may or may not appear in chart's last-12-months window | — |
| **E9.** Device revoked | UX-006 banner; Panel remains viewable from cache; no re-query on retry until re-enrolled | Out-of-scope |
| **E10.** OneDrive offline / syncing | UX-006 banner; Panel data is already local, unaffected; `Last synced` indicator surfaces freshness | — |
| **E11.** Window resize to narrow width | Account-card grid reflows (Mouse owns breakpoints); KPI strip may collapse to stacked; chart maintains aspect ratio — details are Mouse's call (§10) | — |
| **E12.** Very many accounts (>12) | Grid paginates or scrolls horizontally — §11 Q3 (Mouse) | — |
| **E13.** Navigate from first-run success (UX-001 step 8 *"Go to dashboard"*) | Panel mounts directly into `empty-accounts-no-tx` or `empty-no-accounts` (more likely the latter right after first-run) | CTA guides to Accounts or Movements |
| **E14.** DEK rotation boundary in last-12-months window | Invisible; main-proc handles decryption per event's `dek_version` | — |

## 7. Accessibility

- **Tab order:** `<h1>` → first account card (cards form a grid; arrow keys + `role="grid"` traverse; each card focusable as a single cell even though not clickable in M1) → KPI strip (non-focusable, `aria-live` on content) → chart (focusable; bars traversed via arrow keys) → chart data-table toggle → recent-tx table (first row → last row) → *"Ver todos"* link.
- **Chart equivalence** (PR15): collapsible data table under the chart — identical a11y pattern to UX-004 Saldo. Columns: Month, Ingresos, Gastos, Net.
- **Colour not sole channel** (PR16): amount sign, arrow, balance minus-prefix, AND colour all carry the same income/expense signal. Negative balance card pairs colour with a neutral warning icon.
- **ARIA:**
  - Account cards: `role="gridcell"` inside `role="grid"` with `aria-label` combining account name, balance (spoken as currency), and `"{N} transactions"`.
  - Sparkline: `role="img"` with `aria-label="Tendencia últimos 12 meses: {summary}"`.
  - Chart bars: focusable `<button>` or `role="graphics-symbol"` with per-bar `aria-label`.
  - KPIs: wrapped in `role="status"`, `aria-live="polite"` so re-query updates are announced.
  - `partial-decrypt-failed` banner: `role="alert"` on first mount.
- **Reduced motion:** skeleton → content transition fades only (no slide); chart bar-grow animation disabled; sparkline draws instantly.
- **Focus visibility** AA on all cards, chart bars, table rows, and the "Ver todos" link.

## 8. i18n notes (day-0 ES + EN)

- **String-key root:** `ux.panel.*`. Sub-domains: `header.*`, `card.*`, `kpi.*`, `chart.*`, `recent.*`, `empty.*`, `error.*`.
- **ES vs EN layout risk (flag for Mouse):**
  - Card: *"N movimientos"* (varies) vs *"N transactions"* — ES shorter in plural, but count prefix similar.
  - Header subtitle *"19 de abril, 2026 · Vista general del mes"* (~37 chars) vs *"April 19, 2026 · Monthly overview"* (~32) — single-line fit OK at typical widths; Mouse breakpoints ensure no truncation below ~900px.
  - KPI sublabel *"Mes actual · Abril 2026"* vs *"Current month · April 2026"* — parity.
- **Pluralization (ICU):** `card.count` (`{count, plural, one {# movimiento} other {# movimientos}}`), decrypt-failed banner.
- **Locale-aware formatters:**
  - Header date → `Intl.DateTimeFormat(locale, { dateStyle: 'long' })` (ES: *"19 de abril de 2026"*; EN: *"April 19, 2026"*).
  - Balance + KPI amounts + recent-tx amounts → `Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' })`.
  - Chart + sparkline month labels → `Intl.DateTimeFormat(locale, { month: 'short' })`.
  - Recent-tx date → `Intl.DateTimeFormat(locale, { dateStyle: 'medium' })`.
- **Current month label** (KPI sublabel) → `Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })`.
- No hardcoded strings. CI missing-key lint passes.

## 9. Copy guidance

**Tone:** welcoming, neutral, terse. Never congratulatory (*"¡Gran trabajo!"*) — treasurers want facts. Never alarmist on negative balance — *"Saldo negativo"* is enough; no emoji, no *"¡Atención!"*.

| Key | ES | EN |
|---|---|---|
| `ux.panel.title` | "Panel" | "Dashboard" |
| `ux.panel.subtitle.today` | "{date} · Vista general del mes" | "{date} · Monthly overview" |
| `ux.panel.section.accounts` | "Saldos por cuenta" | "Account balances" |
| `ux.panel.section.month` | "Resumen del mes" | "Month summary" |
| `ux.panel.section.trend` | "Ingresos vs. Gastos · Últimos 12 meses" | "Income vs. Expense · Last 12 months" |
| `ux.panel.section.recent` | "Últimos movimientos" | "Recent transactions" |
| `ux.panel.card.count` | "{count, plural, one {# movimiento} other {# movimientos}}" | "{count, plural, one {# transaction} other {# transactions}}" |
| `ux.panel.kpi.income` | "Ingresos" | "Income" |
| `ux.panel.kpi.expense` | "Gastos" | "Expense" |
| `ux.panel.kpi.net` | "Neto" | "Net" |
| `ux.panel.kpi.sublabel` | "Mes actual · {month} {year}" | "Current month · {month} {year}" |
| `ux.panel.chart.legend.income` | "Ingresos" | "Income" |
| `ux.panel.chart.legend.expense` | "Gastos" | "Expense" |
| `ux.panel.chart.datatable.toggle` | "Ver tabla de datos" | "Show data table" |
| `ux.panel.recent.cta` | "Ver todos los movimientos →" | "See all transactions →" |
| `ux.panel.empty.no-accounts.title` | "Aún no tienes cuentas" | "No accounts yet" |
| `ux.panel.empty.no-accounts.cta` | "Configurar cuentas" | "Set up accounts" |
| `ux.panel.empty.no-tx.title` | "Aún no hay movimientos" | "No transactions yet" |
| `ux.panel.empty.no-tx.cta` | "Registrar primer movimiento" | "Record your first transaction" |
| `ux.panel.empty.current-month` | "Sin movimientos en {mes}" | "No transactions in {month}" |
| `ux.panel.sparkline.partial` | "Tendencia disponible cuando haya 3 meses de datos" | "Trend available once you have 3 months of data" |
| `ux.panel.decrypt-partial` | "{count} movimientos no pudieron leerse — los balances pueden ser incompletos. Ver detalles." | "{count} transactions couldn't be read — balances may be incomplete. See details." |

## 10. Out of scope

- **Visual treatment** (card chrome, sparkline colour / line thickness, chart styling, skeleton pattern, responsive breakpoints, negative-balance icon) → **Mouse**.
- **Drill-in** from cards / chart / KPIs to pre-filtered Movements → **v1.x** (PRD-003 Q3).
- **Configurable Panel** (add/remove widgets) → Later.
- **Quick-add-transaction CTA on Panel** → **v1.x** (PRD-003 §5 "Out"; §11 Q2 ratifies hiding in M1).
- **Account-card click-through** → v1.x.
- **Inactive-account display** → deferred until archival lands (v1.x).
- **CSV/PDF export of Panel** → never (PRD-003 §5).
- **Tag-cloud widget** → Later.
- **Shell chrome / sync indicator / locale switcher / global banners** → **UX-006**.
- **Crypto-error recovery copy** → **UX-009** (cross-referenced in §6 E6).
- **Admin-only affordances** (approve enrollment, revoke device) → **UX-012**. None surface on Panel.

## 11. Open questions

1. **Sparkline partial-data threshold** — show partial line with padding, or hide until ≥3 months? Recommendation: **hide until ≥3 months** + inline tooltip (§5 `partial-sparkline`). Cleaner, avoids misleading trend. → **Mouse** / **Link**.
2. **"Nuevo Movimiento" header button on Panel** — keep (prototype) or hide in M1 (preserves PR7 read-only)? Recommendation: **hide** in M1; sidebar + `Ctrl+N` covers the path. → **Pedro** (product feel) / **Link**.
3. **Too-many-accounts layout** (>12 accounts) — horizontal scroll, paginated, or collapse to list view? Recommendation: Mouse decides; default to responsive grid with vertical wrap + subtle "Ver todas" link. → **Mouse**.
4. **Panel → Movements hand-off range** — flow-003 Q7: does Movements land in `range-loaded` on `This month`, or in `range-not-selected`? Recommendation: **`This month` pre-loaded** (click is the intent). → **Pedro** ratify.
5. **"Recent" count = 8** vs configurable — PRD-003 Q5 recommends fix at 8 in M1. Closed. → Closed.
6. **Panel's Recent respects Movements' last-used range?** — prototype-analysis open question. Recommendation: **NO** — always latest-8 absolute; Movements' range state is screen-local. → **Link** ratify.
7. **Header subtitle date format** — verbose (*"19 de abril de 2026"*) or terse (*"19 abr 2026"*)? Recommendation: verbose on Panel (orientation context), terse in tables. → **Mouse**.
8. **Decrypt-partial banner exact copy** (§6 E6) — security-sensitive. → **Switch** (UX-009 catalog). **RATIFIED 2026-04-19 by Switch — see [crypto-error-copy-catalog.md CE-005](../../security/crypto-error-copy-catalog.md#ce-005--panel-view-some-events-failed-to-decrypt).** ADJUSTED from Niobe's proposal: "KPIs" swapped for "resúmenes" (ES) / "summaries" (EN) — volunteer treasurers are not data analysts, jargon violates P5. Ratified ES: *"{count} movimientos no pudieron leerse — balances y resúmenes pueden ser incompletos. Ver detalles."* Ratified EN: *"{count} transactions couldn't be read — balances and summaries may be incomplete. See details."* Existing key `ux.panel.decrypt-partial` retained as alias. Affected-account cards MUST render a card-level footnote (`ux.errors.crypto.ce-005.card-footnote`); banner copy does not name affected accounts.
9. **Chart data-table default** — collapsed (Saldo's choice) or always visible? Recommendation: **collapsed** for visual parity with Saldo; a11y path identical. → **Mouse**.
10. **Landing route after first-run Success-Admin** — UX-001 step 8 offers two CTAs (*"Record first transaction"* → Movements; *"Go to dashboard"* → Panel). Document that Panel MUST handle the empty-DB branch cleanly (§6 E1/E13 covered). Recommendation: keep dual CTA; Panel handles empty state well enough to be a safe default. → **Link** confirm.

## 12. Acceptance criteria

- **AC1** — On app cold start, skeleton paints ≤100ms; loaded state reaches screen ≤500ms p95 at 1,000 events (PRD-003 PR12).
- **AC2** — The screen MUST NOT render any status / approval / pending column, badge, toggle, or filter. Grep-verifiable.
- **AC3** — Every user-visible string on every state resolves through the i18n layer in `es` and `en`. CI missing-key lint passes.
- **AC4** — Currency, date, and month labels use `Intl.*` formatters honouring the active locale.
- **AC5** — Chart has a screen-reader-accessible data table (collapsible) containing all 12 × (income, expense, net) values (PR15).
- **AC6** — Account-card balance equals sum of `tx.amount` for the account (PR10). Property-test target against Movements / Saldo.
- **AC7** — Monthly KPI cards equal sum of the current calendar month's events (PR10). Property test.
- **AC8** — Recent-tx list equals the first 8 rows of a Movements query with no filters and range = all (PR10).
- **AC9** — Panel produces ZERO events of any kind. Verifiable via event-log inspection during any Panel interaction. (PR9 read-only contract.)
- **AC10** — `empty-no-accounts`, `empty-accounts-no-tx`, and `empty-no-tx-this-month` all render without errors and with working CTA links.
- **AC11** — Renderer never reads filesystem; all queries via schema-validated IPC (C13, R12, R11).
- **AC12** — No plaintext PII in logs or console (R15).
- **AC13** — Decrypt-partial banner (§6 E6) surfaces counted failures, annotates affected totals, and routes to UX-009.
- **AC14** — Negative balance uses minus prefix AND expense colour AND a warning icon — never colour alone (PR16).

## 13. Traceability matrix

| Requirement | Source | Where in this spec |
|---|---|---|
| Default landing | PRD-003 PR1 | §4 step 1, §3 |
| Account cards | PRD-003 PR2 | §4.1 account-card table |
| Negative-balance treatment | PRD-003 PR3, PR16 | §5 `negative-balance-card`, AC14 |
| Monthly KPI strip | PRD-003 PR4 | §4.1 KPI strip |
| 12-month bars chart | PRD-003 PR5 | §4.1 chart block |
| Recent-tx preview (latest 8) | PRD-003 PR6 | §4.1 recent-tx table |
| Read-only contract | PRD-003 PR7 | §4.1 read-only note, §4.2, AC9 |
| No filters | PRD-003 PR8 | §3, §10 |
| Read-only from read model | PRD-003 PR9 | AC9, AC11 |
| Consistency with Movements / Saldo | PRD-003 PR10 | AC6–AC8 |
| No pending concept | PRD-003 PR11, decisions 2026-04-19 | §4.1 removed column note, AC2 |
| Cold open ≤500ms | PRD-003 PR12 | AC1 |
| Offline | PRD-003 PR13, vision P5 | §6 E10 |
| Keyboard | PRD-003 PR14 | §7 |
| Chart screen-reader equivalence | PRD-003 PR15 | §7, AC5 |
| Colour not sole channel | PRD-003 PR16 | §7, AC14 |
| i18n day-0 | PRD-003 PR17, decisions 2026-04-19 | §8, §9, AC3 |
| Locale-aware formatting | PRD-003 PR17.1 | §8, AC4 |
| Renderer isolation | C6, C13, R11, R12 | AC11 |
| PII in logs | R15 | AC12 |
| Decrypt failures → UX-009 | crypto-spec §2.1, G4 | §6 E6, §11 Q8, AC13 |
| Empty-DB branch coverage | G6 | §5 empty states, §6 E1/E2/E3 |
| First-run hand-off | UX-001 step 8 | §3 preconditions, §6 E13 |
| Movements hand-off | flow-003 Q7 | §4 step 7, §11 Q4 |

## 14. Status history

| Date | Status | By | Notes |
|---|---|---|---|
| 2026-04-19 | Draft v0.1 | Niobe | Batch 2 of Wave-1 UX specs. Removes `Estado` column from Recent-tx. Hides prototype's "Nuevo Movimiento" header button in M1 (preserves PR7 read-only). Empty-DB branch (G6) specified across three empty states. |
