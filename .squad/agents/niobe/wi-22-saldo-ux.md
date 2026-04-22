# WI-22 Saldo — UX copy & interaction spec

> **Owner:** Niobe · **Date:** 2026-04-22 · **Scope:** S5 (`SaldoScreen`) handoff to Trinity
> **Implements:** PRD-002 · UX-004 · Link's WI-22 spec · Neo's thin spec (S1–S5)
> i18n namespace: `saldo.*` (72 leaf keys, ES primary, EN parity). Does **not** replace the
> legacy `balance.*` stub — Trinity drops `balance.*` when `SaldoScreen` lands.

This is a 1-page implementation brief. Copy lives in `locales/{es,en}/common.json`; this
file covers interaction, information architecture, and a couple of calls that need Pedro.

---

## 1. Layout (top → bottom)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Saldo                                          [Año ▸ Trimestre ▸ Mes]   │  ← header
│  Compara ingresos y gastos frente al año anterior   [Cuenta: Todas ▾]     │
├────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────────────────┐  │
│  │ Var. neta  │ │ Ingresos   │ │ Gastos     │ │ Mayor crecimiento      │  │  ← KPI strip (4 cards)
│  │ +€12.340   │ │ +€8.210    │ │ −€4.130    │ │ Donaciones · +38%      │  │
│  │ vs. 2025   │ │ vs. 2025   │ │ vs. 2025   │ │ vs. 2025               │  │
│  │ [Proyec.]  │ │ [Proyec.]  │ │ [Proyec.]  │ │                        │  │  ← projection badge (partial only)
│  └────────────┘ └────────────┘ └────────────┘ └────────────────────────┘  │
├────────────────────────────────────────────────────────────────────────────┤
│  Saldo neto mensual                       [Ver tabla de datos ▾]          │  ← chart header
│  Valores reales — sin proyección                                          │  ← subtitle (always shown)
│  ▇▇ actual   ░░ anterior                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐     │
│  │ 12 months × 2 bars (Trinity's GroupedBarChart)                   │     │
│  └──────────────────────────────────────────────────────────────────┘     │
├────────────────────────────────────────────────────────────────────────────┤
│  Ingresos por categoría                 │  Gastos por categoría            │
│  Categoría · Actual · Anterior · Δ      │  Categoría · Actual · Anterior · Δ│  ← two side-by-side tables
│  ───────────────────────────────────    │  ───────────────────────────────  │
└────────────────────────────────────────────────────────────────────────────┘
```

## 2. Period selector — interaction

- **Pattern:** Segmented control (`role="radiogroup"`), same primitive Movements uses for
  type filter (`All | Income | Expense`). Consistency win: Pedro's category-screen
  feedback (2026-04-19) explicitly called this out. Not a dropdown.
- **Default:** `Año`. Arrow-left/right traverses; Enter/Space selects. Live re-query on
  change (no Apply button). Keys: `saldo.period.options.{year|quarter|month}` (visible
  labels); `saldo.period.srOption.{year|quarter|month}` (sr-only descriptions on each
  radio explaining the comparison basis).
- **Same-month-prior-year disclosure (CRITICAL):** the *current* selected option renders
  a small info icon after the label. Tooltip + `aria-describedby` text comes from
  `saldo.period.{month|quarter|year}Tooltip`. `Mes` tooltip reads "Comparando con el
  mismo mes del año anterior" — treasurer sees this on hover/focus without drilling.
  Mouse owns the icon glyph; Niobe reserves the copy key.
- **Account filter:** plain select to the right of the segmented control. Label
  `saldo.account.label`, default option `saldo.account.all`. Live re-query on change.

## 3. KPI strip — order + visual priority

Left → right, in this fixed order (don't let Mouse reorder — it encodes reading priority):

1. **Variación neta** (primary — treasurer's headline answer)
2. **Variación de ingresos**
3. **Variación de gastos**
4. **Mayor crecimiento** (category name + delta; empty state `saldo.kpi.biggestGrowth.empty`)

Each card: label (top), value with sign + Δ pill (hero), sublabel
`saldo.comparison.vsYear` / `vsMonth` / `vsQuarter` (interpolated with `{{year}}` /
`{{month}}` / `{{quarter}}`). Numeric formatting via existing `formatCurrency` helper —
**not** in the i18n keys.

Δ semantics (consistent with PRD-002 AC4):
- Increase → `saldo.kpi.delta.up` + up-arrow glyph (Mouse).
- Decrease → `saldo.kpi.delta.down` + down-arrow.
- `|Δ| < 3%` → `saldo.kpi.delta.flat` + neutral dot.
- `prior = 0` → `—` with tooltip `saldo.kpi.delta.noPrior` (and `saldo.table.noPrior` for the row variant).

## 4. Partial-period projection — disclosure pattern

**Locked:** disclosure is **persistent**, not hover-only. Three surfaces:

1. **KPI cards (Net / Income / Expense only):** a small `[Proyección lineal]` badge
   under the sublabel when `isPartialCurrent=true`. Key: `saldo.projection.badge`.
   Tooltip/`aria-describedby` on the badge: `saldo.projection.tooltip` with
   `{{daysElapsed}}` / `{{daysInPeriod}}` interpolated. Never on the "Biggest growth" card
   (that's a derived ranking, not a projected absolute).
2. **Category table rows:** when `currentProjectedTotal !== currentTotal`, show the
   projected value as the primary number, with `saldo.projection.sublabel` ("Proyectado"
   / "Projected") directly under. Row tooltip `saldo.projection.rowTooltip`.
3. **Monthly chart:** **no disclosure needed.** Subtitle is always
   `saldo.chart.monthlyNetSubtitle` ("Valores reales — sin proyección"). This matches
   Link's spec: monthly series is actuals, never projected.

## 5. Category tables — two-column layout

- Headers from `saldo.table.columns.*`. Right-align all numeric columns.
- Uncategorized rows use `saldo.table.uncategorized` label.
- Dropped category (current=0, prior≠0) renders with `−100%` delta and sublabel
  `saldo.table.dropped`. Per Link's WI-22 Q3 recommendation (ratified pending Pedro).
- Zero-in-both rows are suppressed server-side (Morpheus — confirmed in Neo's thin spec).
- No row is clickable in M1 (drill-through is an explicit NON-goal).

## 6. States & empty paths

Wired to `saldo.states.*`:

| State | Copy key | When |
|---|---|---|
| Loading | `states.loading` | Initial query + re-query on control change |
| Empty (both periods) | `states.emptyBoth` | Treasurer has no tx in current or prior |
| Empty current only | `states.emptyCurrent` | Prior has data, current doesn't (e.g., new NGO) |
| Empty prior only | `states.emptyPrior` | Current has data, prior is 0 (first fiscal year) |
| Error | `states.error` + `.retry` | IPC failure — single Reintentar button |

Empty-prior state suppresses KPI strip + deltas (nothing to compare). Renders the
category tables showing current-period absolutes with a banner explaining why.

## 7. Locale formatting — use existing helpers

- **Currency:** `formatCurrency(amount, locale)` from `app/src/renderer/lib/intl.ts`
  (the Intl helper landing in the polish branch). Do not format inside the i18n keys.
- **Month labels:** `Intl.DateTimeFormat(locale, { month: 'long' })` for tooltip/badge
  interpolation; `{ month: 'short' }` for chart x-axis. ES gives "abril" / "abr."; EN
  gives "April" / "Apr".
- **Quarter:** component builds `T{{quarter}}` (ES) / `Q{{quarter}}` (EN) via the
  `comparison.vsQuarter` key — no separate formatter needed.
- **Percent deltas:** `Intl.NumberFormat(locale, { style: 'percent', signDisplay: 'exceptZero', maximumFractionDigits: 0 })`.
- **Days elapsed/total:** raw integers, interpolated into `projection.tooltip`.

## 8. Accessibility summary

- Period selector: `radiogroup` + arrow-key traversal (same pattern as Movements type filter).
- Projection badge: announced via `aria-describedby` pointing at `projection.ariaHint`;
  never conveyed by color alone.
- Chart: `aria-label` = `chart.monthlyNetAriaLabel`; collapsible `<details>` wraps
  `<table>` with `<caption>` = `chart.dataTableCaption`; toggle labels
  `chart.dataTableToggle.{show|hide}`.
- Δ pills: include `aria-label` from `kpi.delta.{up|down|flat|noPrior}` so screen readers
  get "aumento" / "descenso" / "sin cambios" / "sin datos previos", not just a glyph.

## 9. Style contract (carried from prior screens)

- Spanish primary; English parity. Sentence case. No "click" — use "seleccionar" /
  "select" (or action-specific verbs). Numeric values never appear inside i18n values.

---

**Open copy calls for Pedro** (mirror of `.squad/decisions/inbox/niobe-wi22-copy-locked.md`):

1. "Variación neta" vs "Balance neto" for the lead KPI — I'm going with **Variación**
   because the card shows a *change*, not an absolute. Confirm or flip.
2. "Mayor crecimiento" vs "Categoría con mayor subida" for KPI 4 — going with the
   shorter label; the long sublabel carries the explanation.
3. Dropped-category sublabel "Sin movimientos este periodo" vs "Categoría dada de baja" —
   going with the neutral "Sin movimientos" because the category isn't actually archived,
   just empty this period.
