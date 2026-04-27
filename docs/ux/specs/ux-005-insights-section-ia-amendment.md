# UX-005 — Insights Section · Amendment A1

> **Status:** DRAFT → awaiting Pedro approval  
> **Amends:** [UX-005 Insights Section IA (v1)](./ux-005-insights-section-ia.md) + [UX-005a Per-label YoY (v1)](./ux-005a-label-yoy-sketch.md)  
> **Owner:** Niobe (Spec / UX Analyst)  
> **Date:** 2026-05-02  
> **Trigger:** Pedro's two visual mockups: `insights_idea.png` (landing) + `insights_idea_2.png` (drilldown)

---

## 1. Amendment Summary

Pedro's mockups introduce a **Tag-centric landing + drilldown** pattern that supersedes the v1 "small-multiples YoY grid" spec (ux-005a). The mockups define a concrete layout contract with several new components not present in v1.

**Key deltas from v1:**

| Area | v1 spec | Mockup (A1) |
|------|---------|-------------|
| Landing structure | 4×N small-multiples grid of YoY bar tiles per label | KPI strip (3 cards) + horizontal tag card row + combiner hint banner |
| Drilldown entry | Click tile → navigate to Movimientos (filtered) | Click tag card → dedicated drilldown view within Insights |
| Metric toggle | Not present | Volumen \| Neto \| # Mov. segmented control (top-right) |
| Tag combiner | Not present | "+ Combinar etiqueta…" dropdown for intersection analysis |
| Category distribution | Not present | Donut charts (Ingresos / Gastos) on drilldown |
| Table view | Not present | Detalle por subcategoría table on drilldown |
| Account breakdown | Not present | Por Cuenta horizontal stacked bar on drilldown |

---

## 2. Landing Layout Specification

**URL:** `/insights` (no hash fragment)

### 2.1 Page Header

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Insights                                              [Volumen|Neto|# Mov.] │
│ Análisis por etiquetas — campañas, proyectos y                              │
│ eventos transversales a las categorías                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Title:** `h1` "Insights"
- **Subtitle:** `p.ot-subtitle` — "Análisis por etiquetas — campañas, proyectos y eventos transversales a las categorías"
- **Toggle:** Segmented control (3 options) top-right aligned with title baseline

### 2.2 KPI Strip

Reuse `.ot-kpi-strip` recipe from `prototype/panel.jsx` and `globals.css`. Three cards:

| # | Label | Value | Icon | Tone |
|---|-------|-------|------|------|
| 1 | ETIQUETAS ACTIVAS | `{count}` "de {total} totales" | `tag` | neutral (brand) |
| 2 | INGRESOS ETIQUETADOS | `€{sum}` "acumulado todas las etiquetas" | `trend-up` | income (green) |
| 3 | GASTOS ETIQUETADOS | `€{sum}` "acumulado todas las etiquetas" | `trend-down` | expense (red) |

**Grid:**
```css
.ot-insights-kpi {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-6);
}
@media (max-width: 900px) {
  .ot-insights-kpi { grid-template-columns: 1fr; }
}
```

### 2.3 Tag Cards Section

**Section heading:** `.section-label` "ETIQUETAS / CAMPAÑAS"

**Card layout:** Horizontal scrollable row (no wrap) at narrow viewports; responsive grid at ≥1200px.

```css
.ot-tag-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-5);
}
@media (max-width: 1200px) {
  .ot-tag-cards {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    gap: var(--space-5);
    padding-bottom: var(--space-3); /* scrollbar clearance */
  }
  .ot-tag-card {
    flex: 0 0 260px;
    scroll-snap-align: start;
  }
}
```

### 2.4 Tag Card Anatomy

```
┌──────────────────────────────────────────────────┐
│ ● Tag Name                              4 mov.   │
├──────────────────────────────────────────────────┤
│ INGRESOS      GASTOS        NETO                 │
│ 10.150 €      0 €           10.150 €             │
│ [~~~~~~~~~sparkline~~~~~~~~~] (optional)         │
│                                                  │
│ Top: Donaciones, Subvenciones                    │
└──────────────────────────────────────────────────┘
```

**Fields:**

| Field | Type | Notes |
|-------|------|-------|
| Color dot | `6px` circle | Uses tag's assigned color (`--ot-tag-color`) |
| Tag name | `font-weight: semibold` | Truncate with ellipsis if > 24ch |
| Movement count | `N mov.` badge | Top-right, muted text |
| INGRESOS | `€` value | Green if > 0, muted if 0 |
| GASTOS | `€` value | Red if > 0, muted if 0 |
| NETO | `€` value | Color follows sign (income/expense) |
| Sparkline | Optional SVG | Show if tag has ≥3 months of data; reuse `<Sparkline>` from `panel.jsx` |
| Top subcategories | `"Top: {list}"` | Comma-separated, max 2–3 entries |

**Sparkline visibility rule:** Render sparkline only when the tag has transactions spanning ≥3 distinct months in the current window. Otherwise, omit entirely (no placeholder).

**Click behavior:** Navigate to drilldown (`/insights?tag={tagId}`).

### 2.5 Combiner Hint Banner

Dashed-border info card at bottom of landing:

```
┌ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ┐
│ 🏷️  Combina etiquetas para análisis cruzados                               │
│     Ej: Calendarios ∩ 2026 para ver solo lo relativo a esa edición. Abre   │
│     cualquier etiqueta y añade más desde la vista de detalle.              │
└ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ┘
```

**Styling:**
```css
.ot-combiner-hint {
  border: 1px dashed var(--color-border-default);
  border-radius: var(--radius-lg);
  padding: var(--space-6) var(--space-8);
  background: var(--color-surface-secondary);
  display: flex;
  gap: var(--space-5);
  align-items: flex-start;
}
```

---

## 3. Drilldown Layout Specification

**URL:** `/insights?tag={tagId}` (single tag) or `/insights?tag={id1}&tag={id2}` (combined tags)

### 3.1 Navigation

- **Breadcrumb:** `← Volver a Insights` — navigates to `/insights`
- **Tag pill row:** Current selected tag(s) as dismissible pills + "+ Combinar etiqueta…" dropdown

### 3.2 Page Header (Drilldown)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← Volver a Insights                                                         │
│ [Reto Deportivo ×]  [+ Combinar etiqueta... ▾]                             │
│                                                                             │
│ Reto Deportivo                                                              │
│ Análisis de campaña por categorías y cuentas                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Title:** Tag name (`h1`)
- **Subtitle:** "Análisis de campaña por categorías y cuentas"

### 3.3 KPI Strip (Drilldown)

Three cards, same `.ot-kpi-strip` pattern:

| # | Label | Value | Sublabel | Icon | Tone |
|---|-------|-------|----------|------|------|
| 1 | INGRESOS | `€{sum}` | `{n} categoría(s)` | `trend-up` | income |
| 2 | GASTOS | `€{sum}` | `{n} categoría(s)` | `trend-down` | expense |
| 3 | NETO | `€{sum}` | `{n} movimiento(s)` | `calculator` | net (brand) |

### 3.4 Distribución por Categoría (Donut Charts)

**Section heading:** "DISTRIBUCIÓN POR CATEGORÍA"

**Layout:** Two panels side-by-side (50/50 split on ≥1024px, stack on narrow).

```css
.ot-donut-panels {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-6);
}
@media (max-width: 1024px) {
  .ot-donut-panels { grid-template-columns: 1fr; }
}
```

**Panel anatomy:**
```
┌─────────────────────────────────────────────────────────┐
│ Ingresos                                                │
│                                                         │
│    ┌─────────┐     ■ Donaciones        200 €    100%   │
│    │  TOTAL  │                                          │
│    │  200 €  │                                          │
│    └─────────┘                                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Donut spec:**
- **SVG dimensions:** 120×120px viewBox, stroke-based donut (no fill)
- **Center label:** "TOTAL" + `€{sum}` (font-weight: bold)
- **Legend:** Right-aligned list: color square + category name + €amount + percentage
- **Empty state:** "Sin gastos para esta selección" (muted text, no donut)

**New component required:** `<DonutChart>` (does not exist; create based on Recharts or pure SVG).

### 3.5 Detalle por Subcategoría (Table)

**Section heading:** "DETALLE POR SUBCATEGORÍA"

| Column | Alignment | Notes |
|--------|-----------|-------|
| CATEGORÍA | left | Parent category name |
| SUBCATEGORÍA | left | Subcategory name |
| INGRESOS | right | €value, green, tabular-nums |
| GASTOS | right | €value or "—", red, tabular-nums |
| NETO | right | €value, colored by sign |

**Table styling:** Reuse `.ot-table` from MovementsScreen. No pagination (assume < 50 rows typical).

### 3.6 Evolución Mensual (Line Chart)

**Section heading:** "EVOLUCIÓN MENSUAL"

- **Chart type:** Line chart (not grouped bars) — 2 series: Ingresos (green) + Gastos (red)
- **X-axis:** Months (MMM YY format, e.g., "ABR 26")
- **Y-axis:** €
- **Legend:** Below chart, inline: `● Ingresos  ● Gastos`

**Implementation:** Can adapt `GroupedBarChart` to render as line, or introduce `<LineChart>` component. The mockup shows a simple line with area fill beneath.

### 3.7 Por Cuenta (Horizontal Stacked Bar)

**Section heading:** "POR CUENTA"

One row per account that has transactions for this tag:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ● PayPal   [█████████████████████████░░░░░░░░░░░░░]   200 €         0 €    │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Account pill:** Color dot + account name
- **Stacked bar:** Income (green) + Expense (red) segments, proportional to max
- **Values:** €ingresos + €gastos right-aligned

---

## 4. Volumen / Neto / # Mov. Toggle Behavior

**Control:** Segmented toggle in page header (landing only; drilldown always shows all three).

| Mode | What changes on tag cards |
|------|---------------------------|
| **Volumen** (default) | Show INGRESOS + GASTOS + NETO (all three values) |
| **Neto** | Show only NETO (single large value), collapse INGRESOS/GASTOS labels |
| **# Mov.** | Show only movement count as the primary metric, collapse €values |

**URL state:** `?mode=volumen|neto|count` (optional query param, defaults to `volumen`).

**Drilldown impact:** Toggle mode persists when navigating to drilldown but does not filter data — it only affects what tag cards display.

---

## 5. Tag Combiner ("+ Combinar etiqueta…")

### 5.1 UX Flow

1. User clicks a tag card on landing → navigates to `/insights?tag=abc`
2. User clicks "+ Combinar etiqueta…" dropdown on drilldown
3. Dropdown shows searchable list of other tags (excluding already-selected)
4. User selects "2026" → URL becomes `/insights?tag=abc&tag=2026`
5. Drilldown data recalculates to show only transactions that have **both** tags (intersection)
6. Both pills appear; clicking × on either removes it from the filter

### 5.2 URL State

- **Single tag:** `/insights?tag={id}`
- **Multiple tags:** `/insights?tag={id1}&tag={id2}&tag={id3}` (AND semantics)
- **No tags:** `/insights` (landing)

### 5.3 Edge Cases

| Scenario | Behavior |
|----------|----------|
| Intersection yields 0 transactions | Show empty state in all panels: "Sin movimientos con esta combinación de etiquetas" |
| User removes all pills | Navigate back to landing |
| Max combined tags | No hard limit; UI gracefully wraps pills; recommend ≤ 5 for usability |

---

## 6. Components to Reuse

| Component | Source | Usage in Insights |
|-----------|--------|-------------------|
| `.ot-kpi-strip` | `globals.css`, `prototype/panel.jsx` | KPI cards on landing + drilldown |
| `<Sparkline>` | `prototype/panel.jsx` | Tag card mini-charts |
| `.ot-tag-chip` | `globals.css` | Tag pills in drilldown header |
| `.ot-table` | `MovementsScreen` | Detalle por subcategoría table |
| `GroupedBarChart` | `app/src/renderer/components/GroupedBarChart/` | Evolución Mensual (adapt to line) OR create new `<LineChart>` |
| `formatCurrency` | `utils/numberFormat.js` | All € values |

**New components required:**

1. `<DonutChart>` — SVG donut with center label + legend list
2. `<SegmentedToggle>` — 3-option segmented control (may exist; check `ui/` folder)
3. `<TagCombinerDropdown>` — Searchable multi-select for adding tags

---

## 7. Components NOT to Reuse

- **Saldo's `--saldo-col-*` grid learnings** — Saldo's compare-mode grid is optimized for category rows with year bars; Insights uses different layouts (donut, table, horizontal bar). The responsive-panel-width SKILL applies to Saldo only.

---

## 8. Open Questions for Pedro

1. **Sparkline timeframe:** Does the sparkline on tag cards show the same window as the drilldown (all-time for that tag)? Or a fixed 12-month rolling window?

2. **"Top: {subcategories}" logic:** Is this the top 2–3 subcategories by volume? Or the most recent? Should it show categories instead of subcategories?

3. **Donut slice limit:** If a tag spans 10+ categories, do we show all slices or cap at top 5 + "Otros"?

4. **Archived tags:** Should archived tags appear on the landing (with muted styling) if they have historical data? Or hidden entirely?

5. **Account filter inheritance:** Does Insights respect a global account filter (if/when promoted to shell) or always show all accounts?

6. **Empty tag cards:** If a tag has 0 transactions in the current date window, is the card hidden or shown with €0 values?

---

## 9. Spec Supersession

This amendment **supersedes** the following v1 components:

- **UX-005a §2.1 (Layout — small-multiples grid):** Replaced by tag card row
- **UX-005a §2.2 (Top-N rule):** Replaced by showing all active tags (no top-N cutoff visible in mockup)
- **UX-005a §2.5 (Drill-down → Movimientos):** Replaced by in-section drilldown view

The following v1 components **remain valid**:

- **UX-005 §2 (Naming):** `Análisis` (ES) / `Insights` (EN) ✓
- **UX-005 §4 (IA rules):** Nav order, read-only surface, empty-section handling ✓
- **UX-005 §5 (Out of scope):** Custom views, export, forecasting — still out of scope ✓

---

*Amendment A1 — pending Pedro approval. Landing + drilldown mockups are the source of truth.*
