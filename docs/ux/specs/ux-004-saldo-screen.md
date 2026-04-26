# UX-004 — Saldo Screen

> **Status:** Draft v0.1 · **Owner:** Niobe (Spec / UX Analyst) · **Date:** 2026-04-19
> **Paired PRD:** [`docs/product/prds/prd-002-saldo.md`](../../product/prds/prd-002-saldo.md)
> **Paired flow:** none (aggregation view; auto-loads with defaults — PRD-002 PR7)

**Traceability:** PRD-002 PR1–PR19 · vision §5, §7 P4 (adaptation) & P5 (offline) · ADR-001 C6/C7/C13 · security-requirements v0.2 R1/R11/R12/R15 · prototype-analysis **G6** · decisions 2026-04-19 (no pending; day-0 i18n) · [UX-003](./ux-003-movements-screen.md) (consistency contract) · [UX-006](./ux-006-app-shell-and-navigation.md) (global banners).

---

## 1. Summary

Saldo is the *stepping-back* surface: two side-by-side comparison panels (income / expense by category), a KPI strip, and a 12-month net-comparison chart — all current-period vs same-period-prior-year. Unlike Movements, Saldo auto-loads the default period (current year vs prior year) on open (PRD-002 PR7). Partial periods show a linear pro-rata projection for YoY delta.

## 2. User problem

Board prep today requires treasurers to export, pivot in Excel, and eyeball YoY by hand. Saldo answers *"are we ahead or behind vs last year, and in which categories?"* at a glance. It is also a read-only surface: all mutations happen on Movements.

## 3. Actors & preconditions

- **Treasurer / board-facing user** (Juan) — enrolled, DEK unwrapped.
- **App renderer** — mounts Saldo; issues aggregation query on mount.
- **Main process** — fulfills aggregation from the SQLite read model (PRD-002 PR11).

**Preconditions:** first-run complete (UX-001) OR enrollment approved (UX-002); at least one confirmed transaction exists for a non-empty view — otherwise E1 empty-DB branch.

## 4. Happy path — board-meeting prep

| # | User sees | User does | System does |
|---|---|---|---|
| 1 | Sidebar highlights "Saldo" | Click "Saldo" | Navigate. Issue default aggregation query `{granularity: Año, current: 2026, prior: 2025}` immediately (PR7). |
| 2 | **Loading skeleton** ≤300ms: KPI strip shells, two panel shells, chart shell | wait | Aggregation completes from read model |
| 3 | **Loaded state** (§5 `loaded`): KPI strip with 3 cards (Ingresos totales, Gastos totales, Neto) each showing current + prior · panel `Ingresos` with category rows · panel `Gastos` with category rows · `Saldo neto mensual` chart with 12 months × 2 bars | scans KPIs, panels, chart tooltips | — |
| 4 | Period selector: segmented `Mes / Trimestre / Año` (default `Año`, PRD-002 PR6); secondary date affordance pill (*"2025 vs 2026"*) | Click `Trimestre` | Re-query with `{granularity: Trimestre, current: 2026-Q2, prior: 2025-Q2}` → flip to `loading` → `loaded` |
| 5 | Account filter (top-right, default `Todas las cuentas`) | Change to Unicaja | Re-query scoped to that account (PRD-002 PR10); panels and chart re-render live |
| 6 | Category rows sorted by current-period total desc; zero-zero rows suppressed (PR9) | hovers a row / a chart bar | Tooltip shows exact figures; chart tooltip focusable |
| 7 | Chart is accompanied by a **collapsible data table** (PR17, §7) with 12 months × (current income, current expense, prior income, prior expense, net delta) | Expand | Data table appears below chart, screen-reader-accessible |
| 8 | Satisfied; no export yet (M3, §10) | Screenshots, navigates away | Screen unmounts; state not persisted |

### 4.1 Comparison row structure (per panel)

| Col | Field | Notes |
|---|---|---|
| 1 | Category name + optional `sub` sublabel | from `tx.category_id` / `tx.subcategory` |
| 2 | Prior-period total | muted colour, mini-bar fill (opacity 0.4) |
| 3 | Current-period total | accent colour, mini-bar fill |
| 4 | Delta pill | ↑ / ↓ / · with percentage; full-tooltip explains projection when partial period |

**Delta rule** (PR3):
- Full period → delta = `(current − prior) / prior`.
- Partial period → delta = `(projected_current − prior) / prior`, where `projected_current = current × (months_in_period / months_elapsed)`.
- Tooltip copy: *"Proyección lineal: abril es {4} de {12} meses del año. Proyectado = actual × 3."*
- `|delta| < 3%` → flat arrow (`·`). §11 Q3 — threshold ratify.
- `prior == 0` → special treatment: show `—` and tooltip *"Sin datos en periodo previo"*.

### 4.2 KPI strip (PR5)

Three cards:
- **Ingresos totales** — current value (projected + actual split when partial); sublabel cites prior-year value and projected full-year if partial.
- **Gastos totales** — same pattern.
- **Neto** — current − current; sublabel cites prior net.

### 4.3 Net-monthly comparison chart (PR4)

- 12 columns, one per month of the current period.
- Two adjacent bars per month: prior-year net (muted), current-year net (accent).
- Missing-data months render flat / zero-height (§6 E5).
- Legend below.
- Tooltip on bar focus: *"abril 2026 — neto {EUR}"*.
- `Intl.DateTimeFormat(locale, { month: 'short' })` for labels.

## 5. States

| State | What's shown | Interactive? | Copy key root |
|---|---|---|---|
| `loading` | Skeleton KPIs + panels + chart | No | `ux.saldo.loading` |
| `loaded` | All surfaces populated (§4 happy path) | Yes | `ux.saldo.loaded` |
| `loaded-partial-period` | Same as `loaded` + "(ene–abr)" suffix on current column + projection tooltip on each delta | Yes | `ux.saldo.partial.annotation` |
| `empty-db` | *"Aún no hay datos para comparar"* + "Registrar primer movimiento" → Movements | Yes | `ux.saldo.empty.db` |
| `empty-only-current` | Current-period bars only; prior-period columns marked "Sin datos en 2025" + suppressed delta | Read | `ux.saldo.empty.only-current` |
| `empty-only-prior` | Prior-period bars only; current columns blank (no fabricated zero bars) + annotation | Read | `ux.saldo.empty.only-prior` |
| `query-error` | Inline error on the relevant panel/chart + Retry; other loaded panels remain | Retry | `ux.saldo.error.query` |
| `partial-decrypt-failed` | Loaded view + banner *"{N} movimientos en este periodo no pudieron leerse — los totales pueden ser incompletos. Ver detalles."* → UX-009 | Banner action | `ux.saldo.decrypt-partial` |
| `consistency-drift-detected` | Internal-only state (dev builds): warns if Saldo totals ≠ Movements totals for the same filter set (PR12 property test surfaces in dev) | — | n/a |

**Global states** (offline, syncing, locked, error-banner) stack above via UX-006 shell slot.

## 6. Edge cases & errors

| Trigger | User sees | Recovery |
|---|---|---|
| **E1.** Zero transactions globally | `empty-db` with CTA to Movements | Create / import |
| **E2.** No transactions in prior period (new NGO, only current) | `empty-only-current` + per-row annotation *"Sin datos en 2025"* + suppressed delta | Widen period |
| **E3.** No transactions in current period (app opens early in year with only prior) | `empty-only-prior` | Widen / wait |
| **E4.** Zero-total category both periods | Hidden (PR9) | — |
| **E5.** Zero-total category only in current (dropped category) — PR9 ambiguity | Show with current=0, prior≠0, delta = -100% (signals the drop); tooltip: *"Sin movimientos en este periodo"* — §11 Q2 | — |
| **E6.** Partial period (current period still in progress) | Annotation *"(ene–abr)"* on current column header; per-row projection tooltip; KPI "proy. 2026" sublabel | — |
| **E7.** Month selector with no same-month-prior-year data | Show current-month bars; prior-month annotated "Sin datos en abr 2025" | — |
| **E8.** Account filter narrows result to zero | Loaded shell with per-panel empty *"No hay datos en {cuenta} para este periodo"* | Clear filter |
| **E9.** Decrypt failures on some events in range | `partial-decrypt-failed` banner; totals exclude unreadable events; UX-009 route | UX-009 |
| **E10.** Query error | `query-error` inline; other panels remain; retry | Retry |
| **E11.** Large range (5 years custom) | No special guard in v1 — aggregation is fast on read model; revisit if p95 exceeds 300ms | — |
| **E12.** Period selector change while previous query in flight | Cancel previous, run new | Automatic |
| **E13.** Device revoked | UX-006 banner; Saldo remains viewable from cache; account filter may stale | None in-screen |
| **E14.** DEK rotation boundary inside period | Invisible — main-proc handles (crypto-spec §2.1) | — |

## 7. Accessibility

- **Tab order:** `<h1>` → period selector (segmented, arrow-key traversal) → account filter → KPI strip (non-focusable, aria-live) → panel `Ingresos` (list; each row focusable for tooltip reveal) → panel `Gastos` → chart (focusable; arrow keys traverse bars) → chart data-table toggle → (expanded) data table.
- **Chart equivalence** (PR17): the data table under the chart is a full-fidelity `<table>` with months as rows, series as columns, and totals row. Collapsed by default; toggle button *"Ver tabla de datos"* ↔ *"Ocultar tabla"*.
- **Colour not sole channel:** income/expense carry direction via arrow (↑/↓) in delta pill + mini-bar position; chart uses pattern + colour pair for b/w printing.
- **ARIA:**
  - Segmented period selector: `role="radiogroup"`, each option `role="radio"` with `aria-checked`.
  - Comparison rows: `role="row"` inside a `role="grid"` structure; delta pill has `aria-label` spelling out direction + percentage + projection tooltip text.
  - Chart bars: `role="img"` with `aria-label` per bar; data table is the primary screen-reader path.
  - Banner (`partial-decrypt-failed`): `role="alert"` on first mount, demote to `role="status"` thereafter.
- **Reduced motion:** disable bar animation; panels fade in only.
- **Contrast AA** on muted (prior-year) bars — PR16 mirrors Panel's PR16 rule, enforced in Mouse design tokens.

## 8. i18n notes (day-0 ES + EN)

- **String-key root:** `ux.saldo.*`. Sub-domains: `kpi.*`, `panel.*`, `row.*`, `chart.*`, `period.*`, `projection.*`, `empty.*`, `error.*`.
- **ES vs EN layout risk:** "Saldo neto mensual" (20 chars) vs "Monthly net balance" (19 chars) — near-parity; panel title "Ingresos" vs "Income" fine. However "Comparación por categoría" (25) vs "Comparison by category" (22) — single-line fit OK. Flag to Mouse: delta tooltip ES *"Proyección lineal: abril es 4 de 12 meses del año"* is noticeably longer than EN.
- **Pluralization (ICU):** month-count in projection tooltip (`{elapsed, plural, one {# mes} other {# meses}}`), delta suffixes, decrypt-failed banner count.
- **Locale-aware formatters:**
  - Currency → `Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' })`; `eur0` short form (no decimals) for compact panel values.
  - Percentages → `Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 })`.
  - Month labels in chart → `Intl.DateTimeFormat(locale, { month: 'short' })` (`ene` vs `Jan`).
  - Quarter labels → synthesize (`Q1 2026`) with locale-aware quarter abbreviation from key table.
- **Period-pill label** derived from current/prior identifiers (*"2025 vs 2026"* / *"Q1 2025 vs Q1 2026"* / *"abr 2025 vs abr 2026"*).
- **Delta direction** uses Unicode arrows (↑/↓/·), not localised words — safe across ES/EN.
- No hardcoded strings. CI missing-key lint passes.

## 9. Copy guidance

**Tone:** analytical, neutral, never alarmist. Deltas state facts; a –20% is not "a problem", just a difference. Avoid *"caída"*, *"desplome"*, etc.

| Key | ES | EN |
|---|---|---|
| `ux.saldo.title` | "Saldo" | "Balance" |
| `ux.saldo.subtitle` | "Comparación año a año por categoría" | "Year-over-year comparison by category" |
| `ux.saldo.period.month` | "Mes" | "Month" |
| `ux.saldo.period.quarter` | "Trimestre" | "Quarter" |
| `ux.saldo.period.year` | "Año" | "Year" |
| `ux.saldo.kpi.income` | "Ingresos totales" | "Total income" |
| `ux.saldo.kpi.expense` | "Gastos totales" | "Total expense" |
| `ux.saldo.kpi.net` | "Saldo neto" | "Net balance" |
| `ux.saldo.panel.income` | "Ingresos" | "Income" |
| `ux.saldo.panel.expense` | "Gastos" | "Expense" |
| `ux.saldo.panel.caption` | "Comparación por categoría" | "Comparison by category" |
| `ux.saldo.chart.title` | "Saldo neto mensual" | "Monthly net balance" |
| `ux.saldo.chart.subtitle` | "Diferencia ingresos − gastos · {prior} vs {current}" | "Income minus expense · {prior} vs {current}" |
| `ux.saldo.chart.datatable.toggle` | "Ver tabla de datos" | "Show data table" |
| `ux.saldo.projection.tooltip` | "Proyección lineal: {elapsed} de {total} meses. Proyectado = actual × {factor}." | "Linear projection: {elapsed} of {total} months. Projected = current × {factor}." |
| `ux.saldo.empty.db` | "Aún no hay datos para comparar" | "No data to compare yet" |
| `ux.saldo.empty.only-current` | "Sin datos en {priorYear}" | "No data in {priorYear}" |
| `ux.saldo.row.no-prior` | "Sin movimientos en el periodo previo" | "No transactions in the prior period" |
| `ux.saldo.decrypt-partial` | "{count} movimientos no pudieron leerse — los totales pueden ser incompletos. Ver detalles." | "{count} transactions couldn't be read — totals may be incomplete. See details." |

## 10. Out of scope

- **Visual treatment** (colours, panel cards, chart styling, segmented control visuals, delta-pill chrome) → **Mouse**.
- **CSV / Excel / PDF export of Saldo** → **UX-017 / PRD-008, M3 / PRD-016, M4**. The "Exportar" button in the prototype header is hidden in M1 (§11 Q1).
- **Drill-through** from a category row → pre-filtered Movements → **v1.x** (PRD-002 Q4).
- **Subcategory drill-down** → **[UX-004a](./ux-004a-saldo-subcategory-drilldown.md)** (issue #67 WI-B; extends this spec with optional per-subcategory YoY comparison).
- **User-reorderable categories** → v1.x.
- **Advanced projections** (seasonality, YoY-weighted, budget overlay) → Later.
- **Multi-currency** → Later.
- **Pivot by tag instead of category** → v1.x.
- **Shell chrome / global banners / locale switcher** → **UX-006**.
- **Crypto-error recovery copy** → **UX-009** (cross-referenced in §6 E9).

## 11. Open questions

1. **"Exportar" header button in M1** — hide entirely or show disabled with *"Exportación en v1.1"*? Recommendation: hide. → **Link**.
2. **Zero-in-current, non-zero-in-prior (dropped category)** — §6 E5: show as -100% signal, or hide (PR9 says hide both-zero only)? Recommendation: SHOW — dropping a category is signal. → **Link / Mouse** (visual severity).
3. **Delta flat threshold** — prototype uses ±3%. Keep or tune? Recommendation: keep ±3% for v1; surface as a constant for future tuning. → **Link**.
4. **What counts as "previous period" for Mes selector** — PRD-002 Q5: same-month-prior-year (abr 2025) or preceding-month (mar 2026)? Recommendation: **same-month-prior-year** (matches PR1's YoY premise). → **Pedro**.
5. **Default period on open** — PRD-002 Q2: current year vs prior year. Recommendation: keep. → **Pedro** (ratify).
6. **Chart data table visibility default** — always visible vs. collapsed-by-default. Recommendation: collapsed-by-default with a single-click toggle, to keep visual cleanliness; a11y path remains fast (Tab → Toggle → Enter). → **Mouse**.
7. **Account filter scope** — PR10 says top-right. Prototype puts date pill first. Recommendation: `Período selector | Período pill | Account filter | Export`. → **Mouse**.
8. **Partial-period annotation copy** — prototype shows "(ene–abr)". Recommendation: keep for ES; English render "(Jan–Apr)". Format via `Intl.DateTimeFormat`-derived helper. → **Link / Mouse**.
9. **Projection disable per-category opt-in** — PRD-002 Q3 defers to v1.x. Confirmed deferred. → Closed.
10. **Decrypt-partial banner exact copy** (§6 E9) — security-sensitive. → **Switch** (UX-009 catalog). **RATIFIED 2026-04-19 by Switch — see [crypto-error-copy-catalog.md CE-004](../../security/crypto-error-copy-catalog.md#ce-004--saldo-view-some-events-in-range-failed-to-decrypt).** Niobe's proposed copy approved with a minor enhancement: added *"en este periodo"* anchoring, and normalised to ICU plural form. Existing key `ux.saldo.decrypt-partial` retained as alias. Additional rule: when `loaded-partial-period` AND `partial-decrypt-failed` are simultaneous, projection tooltip MUST be suppressed for affected categories (a projection computed on incomplete actuals is misleading).

## 12. Acceptance criteria

- **AC1** — On navigation to Saldo with ≥1 confirmed tx, default-period aggregation query fires within 50ms of mount; first paint ≤100ms; loaded state ≤300ms p95 at 1,000 events (PRD-002 PR14).
- **AC2** — Period selector change triggers a new aggregation query; cancellation of any in-flight query happens within the same IPC channel (E12).
- **AC3** — The screen MUST NOT render any status/approval/pending column, toggle, filter, or badge (AC4 in UX-003's pattern).
- **AC4** — Every user-visible string on every state resolves through the i18n layer in `es` and `en`. CI missing-key lint passes.
- **AC5** — Currency, percentage, and month labels use `Intl.*` formatters honouring the active locale.
- **AC6** — Chart has a screen-reader-accessible data table containing all 12 × 2 month values (PR17). Collapsible, not omitted.
- **AC7** — Saldo totals for a given `(period, account, category)` MUST equal Movements totals under the same filter set (PR12). Property-test target.
- **AC8** — Renderer never reads filesystem; all aggregation via schema-validated IPC (C13, R12).
- **AC9** — No plaintext PII in logs or console (R15).
- **AC10** — Partial-period projection tooltip is keyboard-reachable on every delta pill.
- **AC11** — `empty-db` state links to Movements' new-transaction flow; no direct create CTA on Saldo (read-only surface).
- **AC12** — Decrypt-partial banner (§6 E9) surfaces counted failures and routes to UX-009 without blocking the rest of the view.

## 13. Traceability matrix

| Requirement | Source | Where in this spec |
|---|---|---|
| Two side-by-side comparison panels | PRD-002 PR1 | §4 step 3, §4.1 |
| Comparison row fields | PRD-002 PR2 | §4.1 |
| Partial-period projection (linear pro-rata) | PRD-002 PR3 | §4.1 delta rule, §9 `projection.tooltip` |
| Net-monthly chart | PRD-002 PR4 | §4.3 |
| KPI strip | PRD-002 PR5 | §4.2 |
| Period selector | PRD-002 PR6 | §4 step 4 |
| Auto-load on open | PRD-002 PR7 | §4 step 1, AC1 |
| Category sort by current desc | PRD-002 PR8 | §4.1 |
| Zero-total suppression | PRD-002 PR9 | §6 E4, §11 Q2 |
| Account filter | PRD-002 PR10 | §4 step 5 |
| Read-only from read model | PRD-002 PR11 | §3 preconditions, AC8 |
| Totals consistent with Movements | PRD-002 PR12 | AC7, §5 `consistency-drift-detected` |
| No pending concept | PRD-002 PR13, decisions 2026-04-19 | §10, AC3 |
| Render latency | PRD-002 PR14 | AC1 |
| Offline | PRD-002 PR15, vision P5 | §5 global states |
| Keyboard + screen-reader chart equivalence | PRD-002 PR16, PR17 | §7, AC6 |
| i18n day-0 | PRD-002 PR18, decisions 2026-04-19 | §8, §9, AC4 |
| Locale-aware formatting | PRD-002 PR18.1 | §8, AC5 |
| Renderer isolation | C6, C13, R11, R12 | AC8 |
| PII in logs | R15 | AC9 |
| Decrypt failures → UX-009 | crypto-spec §2.1, G4 | §6 E9, §11 Q10 |
| Export / drill-through deferred | PRD-002 §5 "Out" | §10, §11 Q1 |

## 14. Status history

| Date | Status | By | Notes |
|---|---|---|---|
| 2026-04-19 | Draft v0.1 | Niobe | Batch 2 of Wave-1 UX specs. Read-only aggregation surface, auto-loads (unlike Movements). No state diagram (single primary trajectory + empty branches). |
