# UX-005 — Insights Section · Final Implementation Spec

> **Status:** IMPLEMENTATION-READY · **Owner:** Niobe (Spec / UX Analyst)  
> **Date:** 2026-05-02  
> **Milestone:** M4  
> **Consolidates:** [UX-005 IA v1](./ux-005-insights-section-ia.md) + [UX-005a YoY v1](./ux-005a-label-yoy-sketch.md) + [Amendment A1](./ux-005-insights-section-ia-amendment.md)  
> **Inputs:** `prototype/insights.jsx` (Pedro's reference), `insights_idea.png`, `insights_idea_2.png`, Mouse's survey

---

## §1 Executive Summary

**What Insights is:** A dedicated analytics section for tag/label-centric analysis that cuts *across* categories. While Saldo answers "Where are we vs. last year by category?", Insights answers "How is this fundraising campaign performing across all accounts and categories?"

**M4 Scope (initial ship):**
- Landing page with KPI strip + tag card grid + combiner hint
- Single-tag drilldown with category donuts, subcategory table, monthly evolution, account breakdown
- Tag combiner for intersection analysis (AND semantics)
- Segmented toggle (Volumen / Neto / # Mov.) for landing sort

**Deferred to M5+:**
- YoY small-multiples grid from UX-005a (RETIRED in favor of mockup #1 pattern — see §2.2)
- Views I-2 through I-6 from UX-005 §3 (reserved, not committed)
- Custom saved analyses
- Export integration
- Forecasting/projection

**Ship criteria:** Dogfoodable by Pedro with ≥8 labeled transactions across ≥3 months.

---

## §2 Prototype Critique (`prototype/insights.jsx`)

Pedro's prototype is directionally correct but requires several adjustments. I'm calling out 10 specific items:

### 2.1 **KEEP — LabelOverviewCard structure** (lines 98–131)

The card anatomy is excellent: color dot + name + badge + 3-metric row + sparkline + top categories. Keep the visual hierarchy exactly as prototyped. The sparkline-only-when-≥3-months rule is correct.

**Minor copy fix:** "Top:" prefix should be "Top categorías:" for clarity.

### 2.2 **REJECT — YoY small-multiples grid from UX-005a**

The mockups define a fundamentally different pattern: horizontal tag cards showing current-period totals, NOT yearly stacked bars. The YoY view (UX-005a §2.1) is **retired for M4** — the mockup supersedes it. Pedro's mockup is a campaign performance view, not a YoY comparison view.

**Decision:** The `VerticalBarTile` component from Mouse's survey §4.2 is NOT needed for M4. Retire it. If Pedro wants YoY per-label analysis, it becomes view I-7 (future).

### 2.3 **MODIFY — Segmented toggle semantics** (lines 394–398)

The prototype treats the toggle as a *sort* selector (lines 358–369: `sort === 'volume' | 'net' | 'count'`). The mockup shows it as a *display mode* selector that changes what metrics appear on cards.

**Correct behavior per mockup:**
- **Volumen:** Show INGRESOS + GASTOS + NETO (all three)
- **Neto:** Show NETO only as large hero value, collapse others
- **# Mov.:** Show movement count as hero, collapse € values

Sorting should remain by volume (total magnitude) regardless of display mode. The toggle changes *presentation*, not ranking.

### 2.4 **MODIFY — Donut chart empty state** (line 211)

Prototype shows `"Sin {panel.title.toLowerCase()} para esta selección."` — this is grammatically awkward in Spanish.

**Correct copy:**
- Income panel: "Sin ingresos para esta selección"
- Expense panel: "Sin gastos para esta selección"

Use separate keys, not interpolation.

### 2.5 **REJECT — Movimientos table in drilldown** (lines 314–350)

The prototype includes a full transaction list at the bottom of the drilldown. This creates a massive scroll depth and duplicates Movimientos functionality.

**Decision:** Remove the inline transaction table. The drilldown shows aggregates only. Users click through to Movimientos for transaction detail. Add a footer link: "Ver todos los movimientos →" that navigates to Movimientos pre-filtered by the selected tag(s).

### 2.6 **MODIFY — Tag combiner dropdown** (lines 165–178)

The prototype uses a raw `<select>` element with `onChange`. This is functionally correct but visually inconsistent with the rest of the app. The dropdown should be:
- A button styled as a dashed-border pill ("+ Combinar etiqueta...")
- Click opens a searchable dropdown panel (not native select)
- Selected tags appear as dismissible chips

The mockup shows this exact pattern. Use `TagCombinerDropdown` component spec (§5.4).

### 2.7 **KEEP — Donut SVG implementation** (lines 24–56)

The pure-SVG donut is lightweight, accessible (with the center text), and requires no external library. Keep this implementation approach.

**Add:** Wrap with `<g role="list">` and add `role="listitem"` to segments for screen readers. The center text should have `aria-label="Total: ${value}"`.

### 2.8 **MODIFY — Account bars grid template** (line 299)

Prototype uses `grid-template-columns: 180px 1fr 120px 120px`. This breaks on narrow viewports.

**Fix:** Change to responsive layout:
```css
@media (max-width: 768px) {
  .ot-account-row { grid-template-columns: 1fr; }
  /* Stack: pill, bar, values row */
}
```

### 2.9 **REJECT — Color palette for donut slices** (line 141)

The hardcoded palette (`['#6d4d8c', '#9c7cb5', ...]`) will clash with tags that already have assigned colors. The donut should use the *category's* semantic color if defined, falling back to a neutral palette only for categories without colors.

**Decision:** Categories don't have colors in the current data model. Use a deterministic palette derived from category ID hash (consistent across sessions). Don't use tag colors for category slices — that's semantically wrong.

### 2.10 **MODIFY — Missing empty state for landing** (lines 361–364)

The prototype filters out tags with 0 transactions (`filter(x => x.agg.count > 0)`) but shows no message when ALL tags are empty. The landing needs a section-level empty state.

**Add:** When `labelStats.length === 0`, render:
```
"No hay etiquetas con movimientos en este período.
Asigna etiquetas a tus movimientos para ver análisis aquí."
```

---

## §3 Final Landing Page Spec (Mockup #1)

### 3.1 URL & Route

- **Route:** `'insights'` (add to `Route` union)
- **URL:** `/` with `route='insights'` state
- **i18n nav label:** ES: "Análisis", EN: "Insights"
- **Nav icon:** `ChartLine` from lucide-react

### 3.2 Component Tree

```
InsightsScreen
├── PageHeader
│   ├── Title: "Insights"
│   ├── Subtitle: "Análisis por etiquetas — campañas, proyectos y eventos transversales a las categorías"
│   ├── DateRangePicker (Saldo parity — same control, same default range)
│   └── SegmentedToggle [Volumen | Neto | # Mov.]
├── KPIStrip (3 cards)
│   ├── KPICard: ETIQUETAS ACTIVAS (icon: tag, tone: brand)
│   ├── KPICard: INGRESOS ETIQUETADOS (icon: trend-up, tone: income)
│   └── KPICard: GASTOS ETIQUETADOS (icon: trend-down, tone: expense)
├── SectionLabel: "ETIQUETAS / CAMPAÑAS"
├── TagCardGrid
│   └── TagCard[] (one per active tag, sorted by magnitude)
│       ├── ColorDot + Name + Badge ("N mov.")
│       ├── MetricRow (INGRESOS / GASTOS / NETO — varies by toggle mode)
│       ├── Sparkline (optional, ≥3 months)
│       └── TopCategories: "Top categorías: {list}"
├── CombinerHintBanner (dashed border info card)
└── EmptyState (conditional, when no tags have transactions)
```

### 3.3 Props & Data

**InsightsScreen** needs these IPC calls on mount:
1. `tags:list` — get all tags with colors
2. `insights:landing-summary` — aggregated totals per tag (see §6). MUST be called with the active `{windowStart, windowEnd}` range (server-side aggregation respects the range).

**Date range selector (locked by OQ-1, §9):**
- Reuse Saldo's `DateRangePicker` component — same control, same defaults.
- Default range = whatever Saldo uses today (single source of truth; do not fork the default).
- Range changes trigger a refetch of `insights:landing-summary` and a re-render of KPIs, tag cards (incl. sparklines + topCategories).
- Range is part of URL/router state so the view is shareable / back-button safe.

**KPIStrip props (all values respect the active date range):**
| # | label | value | sublabel | icon | tone |
|---|-------|-------|----------|------|------|
| 1 | "ETIQUETAS ACTIVAS" | `{count}` | "de {total} totales" | `Tag` | brand |
| 2 | "INGRESOS ETIQUETADOS" | `€{sum}` | "en el rango seleccionado" | `TrendingUp` | income |
| 3 | "GASTOS ETIQUETADOS" | `€{sum}` | "en el rango seleccionado" | `TrendingDown` | expense |

> **Multi-tag overlap is a feature, not a bug (locked by OQ-2, §9).** Transactions with 2+ tags credit the full amount to **each** tag card. This means `Σ(tag card incomeCents) ≥ KPI INGRESOS ETIQUETADOS` whenever any transaction has multiple tags. Do **not** dedupe, do **not** add a footnote, do **not** "fix" this in a future PR — each campaign gets full credit on its own card by design. The KPI strip totals are deduplicated (each transaction counted once); tag-card sums are not. This asymmetry is intentional.

**TagCard props:**
```ts
interface TagCardProps {
  tag: { id: string; name: string; color: string };
  metrics: {
    incomeCents: number;
    expenseCents: number;
    netCents: number;
    txCount: number;
  };
  sparklineData?: number[]; // net per month, if ≥3 months
  topCategories: string[];  // max 2 category names
  displayMode: 'volume' | 'net' | 'count';
  onClick: () => void;
}
```

### 3.4 Responsive Behavior

| Viewport | Tag card grid |
|----------|---------------|
| ≥1400px | 5 columns |
| 1200–1399px | 4 columns |
| 900–1199px | 3 columns |
| 600–899px | 2 columns |
| <600px | Horizontal scroll, snap-to-card |

**CSS (reuses `.ot-account-cards` pattern):**
```css
.ot-tag-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-5);
}
@media (max-width: 600px) {
  .ot-tag-cards {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
  }
  .ot-tag-card {
    flex: 0 0 280px;
    scroll-snap-align: start;
  }
}
```

### 3.5 Reusable vs. New Components

| Component | Status | Notes |
|-----------|--------|-------|
| `.ot-kpi-strip` | ✅ Reuse | globals.css lines 197–263 |
| `.ot-kpi` | ✅ Reuse | Modify props for tag-specific icons |
| `.ot-section-label` | ✅ Reuse | globals.css lines 167–177 |
| `.ot-page-header` | ✅ Reuse | globals.css lines 135–165 |
| `Sparkline` | ✅ Reuse | From prototype/panel.jsx |
| `SegmentedToggle` | 🆕 Create | See §5.3 |
| `TagCard` | 🆕 Create | Extends `.ot-account-card` pattern |

---

## §4 Final Drilldown Spec (Mockup #2)

### 4.1 URL & State

- **Single tag:** `?tag={tagId}` query param
- **Multiple tags:** `?tag={id1}&tag={id2}` (AND intersection)
- **No tags:** Return to landing

State is URL-driven, not React state. Browser back button returns to landing.

### 4.2 Component Tree

```
InsightsDetailView
├── BackLink: "← Volver a Insights"
├── TagCombinerBar
│   ├── TagChip[] (selected tags, dismissible if >1)
│   └── TagCombinerDropdown: "+ Combinar etiqueta..."
├── PageHeader
│   ├── Title: "{Tag Name}" or "{Tag1} ∩ {Tag2}"
│   └── Subtitle: "Análisis de campaña por categorías y cuentas"
├── KPIStrip (3 cards)
│   ├── KPICard: INGRESOS (sublabel: "{n} categoría(s)")
│   ├── KPICard: GASTOS (sublabel: "{n} categoría(s)")
│   └── KPICard: NETO (sublabel: "{n} movimiento(s)")
├── SectionLabel: "DISTRIBUCIÓN POR CATEGORÍA"
├── DonutPanelRow (2 columns)
│   ├── DonutPanel: "Ingresos" (left)
│   └── DonutPanel: "Gastos" (right)
├── SectionLabel: "DETALLE POR SUBCATEGORÍA"
├── SubcategoryTable
│   └── Columns: CATEGORÍA | SUBCATEGORÍA | INGRESOS | GASTOS | NETO
├── SectionLabel: "EVOLUCIÓN MENSUAL"
├── MonthlyChart (grouped bars: income vs. expense per month)
├── SectionLabel: "POR CUENTA"
├── AccountBarList
│   └── AccountRow[] (pill + stacked bar + values)
└── FooterLink: "Ver todos los movimientos →"
```

> **Footer link contract (locked by OQ-3, §9):** "Ver todos los movimientos →" navigates to **Movimientos with BOTH the active tag filter(s) AND the active date range pre-applied**. The user lands on a pre-filtered Movimientos view that exactly matches the aggregates they were just looking at. Same-tab navigation; browser back returns to the drilldown.
>
> **Required Movimientos route contract:** The Movimientos route MUST accept `tagIds: string[]` (1+ values, AND semantics — same as Insights drilldown) and `windowStart` / `windowEnd` ISO date strings via query params (or equivalent router state). Movimientos applies these as initial filter state on mount. If the route does not yet support these params, that work is a hard prerequisite for the drilldown PR — flag in PR #101's dependency list.

### 4.3 Breadcrumb & Tag Combiner

The **breadcrumb** is a text link, not a breadcrumb trail:
```html
<a href="/insights" class="ot-back-link">← Volver a Insights</a>
```

The **tag combiner** behavior:
1. Show selected tag(s) as chips with × (dismissible only if count > 1)
2. Show "+ Combinar etiqueta..." button
3. Click opens searchable dropdown of remaining tags
4. Select adds to URL, triggers refetch with AND semantics
5. Removing last tag returns to landing

### 4.4 DonutPanel Anatomy

```
┌─────────────────────────────────────────────────┐
│ Ingresos                                        │
│                                                 │
│  ┌──────────┐                                   │
│  │  TOTAL   │    ■ Donaciones       200 €  100% │
│  │   200 €  │    ■ Subvenciones      50 €   25% │
│  └──────────┘                                   │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Empty state:** "Sin gastos para esta selección" (muted text, no donut)

**Slice limit:** Max 5 slices + "Otras" bucket if > 5 categories.

### 4.5 Responsive Behavior

| Viewport | Donut panels | Account bars |
|----------|--------------|--------------|
| ≥1024px | 2 columns side-by-side | Grid: pill (180px) + bar (1fr) + values |
| <1024px | Stack vertically | Stack: pill, bar, values row |

---

## §5 New Components Needed

### 5.1 DonutChart

**Props:**
```ts
interface DonutChartProps {
  slices: { label: string; value: number; color: string }[];
  total: number;
  size?: number;           // Default 120
  thickness?: number;      // Default 22
  centerLabel?: string;    // Default "TOTAL"
  emptyLabel?: string;     // e.g., "Sin datos"
  ariaLabel: string;
}
```

**Implementation notes:**
- Pure SVG (no library)
- Segments use `stroke-dasharray` + `stroke-dashoffset` (prototype approach)
- Center text: uppercase label + bold value
- Animation: `transition: stroke-dasharray 200ms`
- Accessibility: `role="img"` + `aria-label` + hidden data table

**"Otras" bucket rule:** When `slices.length > 5`, aggregate tail into "Otras" with a neutral color.

### 5.2 TagCard (Landing)

**CSS class:** `.ot-tag-card` (extends `.ot-account-card` pattern)

**Slots:**
- Header: color dot + name (truncate at 24ch) + badge ("N mov.")
- Metrics: 3-column grid (INGRESOS / GASTOS / NETO) — collapses per display mode
- Sparkline: optional, 32px height
- Footer: "Top categorías: {list}"

**States:**
- Default: subtle shadow, cursor: pointer
- Hover: lift + stronger shadow
- Archived tag: 60% opacity + "(archivada)" badge

### 5.3 SegmentedToggle

**Props:**
```ts
interface SegmentedToggleProps {
  options: { value: string; label: string }[];
  selected: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}
```

**CSS:** Pill-shaped container, active segment has fill + border. Use radio button semantics under the hood (`role="radiogroup"`).

**Existing pattern:** Check if `.segmented` from prototype exists in globals.css. If not, create `.ot-segmented-toggle`.

### 5.4 TagCombinerDropdown

**Props:**
```ts
interface TagCombinerDropdownProps {
  availableTags: { id: string; name: string; color: string }[];
  selectedIds: string[];
  onAdd: (id: string) => void;
  placeholder?: string;  // Default: "+ Combinar etiqueta..."
}
```

**Behavior:**
1. Renders as dashed-border pill button
2. Click opens dropdown panel positioned below
3. Panel has search input + scrollable tag list
4. Click tag → calls `onAdd`, closes dropdown
5. Already-selected tags are hidden from list

**Accessibility:** `aria-haspopup="listbox"`, arrow key navigation, `aria-selected` on items.

### 5.5 AccountBarRow (Drilldown)

**CSS class:** `.ot-account-bar-row`

**Structure:**
```
[● Account Pill] [████████░░░░░░░░░░] [€income] [€expense]
```

**Bar:** Stacked segments (income green, expense red), width proportional to max across all accounts.

---

## §6 IPC Contract Finalization

Mouse identified 5 missing label-detail queries (survey §6.2). Here are the final type signatures:

### 6.1 Existing: `insights:label-yoy`

Defined in `arch-005a`. Returns per-label yearly breakdown for YoY analysis. **Retained for future I-7 view**, not used in M4 landing.

### 6.2 New: `insights:landing-summary`

Returns aggregates for ALL active tags in one call (landing page efficiency).

`windowStart` / `windowEnd` are **required in practice** — the landing always passes the active date range from the `DateRangePicker` (Saldo parity, see §3.3). They remain optional in the type signature for backwards compat / non-UI callers, but the renderer MUST always pass them. Server-side aggregation filters by `[windowStart, windowEnd]` inclusive before grouping by tag; `monthlyNet` and `topCategories` are also computed within the window.

```ts
interface InsightsLandingSummaryRequest {
  windowStart?: string;  // ISO date — landing always passes this (Saldo's default range)
  windowEnd?: string;    // ISO date — landing always passes this (Saldo's default range)
  accountId?: string;    // optional filter
}

interface TagSummary {
  tagId: string;
  tagName: string;
  color: string;
  archived: boolean;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  txCount: number;
  topCategories: string[];  // max 2 names
  monthlyNet: number[];     // for sparkline, last 12 months
}

interface InsightsLandingSummaryResponse {
  tags: TagSummary[];
  totalIncomeCents: number;   // sum across all tags (for KPI)
  totalExpenseCents: number;
  activeTagCount: number;     // tags with txCount > 0
  totalTagCount: number;      // all tags in system
}
```

### 6.3 New: `insights:label-summary`

Single-tag KPI data for drilldown header.

```ts
interface InsightsLabelSummaryRequest {
  tagIds: string[];           // 1+ tag IDs (AND intersection)
  windowStart?: string;
  windowEnd?: string;
  accountId?: string;
}

interface InsightsLabelSummaryResponse {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  txCount: number;
  categoryCount: number;      // distinct categories touched
  accountCount: number;       // distinct accounts touched
}
```

### 6.4 New: `insights:label-by-category`

Donut chart data.

```ts
interface CategorySlice {
  categoryId: string | null;  // null = uncategorized
  categoryName: string;
  incomeCents: number;
  expenseCents: number;
}

interface InsightsLabelByCategoryResponse {
  categories: CategorySlice[];
}
```

### 6.5 New: `insights:label-by-subcategory`

Table data.

```ts
interface SubcategoryRow {
  categoryId: string | null;
  categoryName: string;
  subcategoryId: string | null;
  subcategoryName: string;
  incomeCents: number;
  expenseCents: number;
}

interface InsightsLabelBySubcategoryResponse {
  rows: SubcategoryRow[];  // sorted by (income + expense) desc
}
```

### 6.6 New: `insights:label-monthly-evolution`

Monthly chart data.

```ts
interface MonthBucket {
  monthIso: string;  // 'YYYY-MM'
  incomeCents: number;
  expenseCents: number;
}

interface InsightsLabelMonthlyResponse {
  months: MonthBucket[];  // sorted ascending by month
}
```

### 6.7 New: `insights:label-by-account`

Horizontal bar data.

```ts
interface AccountBucket {
  accountId: string;
  accountName: string;
  accountColor: string;
  incomeCents: number;
  expenseCents: number;
}

interface InsightsLabelByAccountResponse {
  accounts: AccountBucket[];  // sorted by total magnitude desc
}
```

---

## §7 Resolved Questions

The 6 open questions from Amendment A1 §8, answered:

### Q1: Sparkline timeframe

**Answer:** Sparkline shows the **last 12 months rolling window** (or all available months if <12). This is the same window as the landing page, NOT all-time. Rationale: consistency with landing metrics, prevents outlier historical spikes from compressing recent trends.

### Q2: "Top: {categories}" logic

**Answer:** Top 2 categories by **total volume** (income + expense) within the current window. Show category names, not subcategories — subcategory detail is available in the drilldown. If only 1 category, show just that one. If 0, show "Sin categorías".

### Q3: Donut slice limit

**Answer:** Cap at **5 slices + "Otras"** bucket. The 6th+ categories are aggregated. Tooltip on "Otras" shows count: "Incluye {n} categorías más". This matches Saldo's top-N pattern (decisions.md 2026-04-23).

### Q4: Archived tags

**Answer:** Archived tags **appear on landing** if they have transactions in the window, but with muted styling (60% opacity) and "(archivada)" badge. Users need to see historical campaign data even after archiving. Archived tags are NOT shown in the combiner dropdown (can't add new analysis to archived campaigns).

### Q5: Account filter inheritance

**Answer:** Insights **does NOT inherit** a global account filter (consistent with UX-005 §4). Each view has local account filter in the future; M4 ships without per-view account filter (all accounts). When global account filter is promoted to shell (future milestone), Insights will inherit it.

### Q6: Empty tag cards

**Answer:** Tags with 0 transactions in the current window are **hidden from the landing grid** (not shown with €0). They appear in the "inactive tags" footer count if implemented. Rationale: zero-value cards are visual noise; the landing should surface actionable insights.

---

## §8 Ship Ordering for M4

Aligned with Mouse's phasing (survey §8), with PR boundaries:

### Phase 1: Scaffolding (PR #98)
**Effort:** 1 day  
**Contents:**
- Add `'insights'` to Route union
- Add nav item (ChartLine icon)
- Add i18n keys (`shell.nav.insights`)
- Create `InsightsScreen/` folder with empty-state placeholder
- Wire route in App.tsx

**Outcome:** Nav shows Insights; clicking shows "Esta sección está en desarrollo".

### Phase 2: DonutChart + SegmentedToggle (PR #99)
**Effort:** 2 days  
**Contents:**
- `DonutChart.tsx` component + tests
- `SegmentedToggle.tsx` component + tests
- CSS recipes in globals.css

**Outcome:** Reusable components for landing + drilldown.

### Phase 3: Landing Page (PR #100)
**Effort:** 3 days  
**Depends on:** `insights:landing-summary` IPC handler (Morpheus)  
**Contents:**
- `InsightsLandingView.tsx`
- `TagCard.tsx` component
- KPI strip integration
- Display mode toggle (Volumen/Neto/# Mov.)
- Empty state handling
- Combiner hint banner

**Outcome:** Landing page fully functional with tag cards.

### Phase 4: Drilldown View (PR #101)
**Effort:** 4 days  
**Depends on:** All 5 `insights:label-*` IPC handlers  
**Contents:**
- `InsightsDetailView.tsx`
- `TagCombinerDropdown.tsx`
- DonutPanel integration
- SubcategoryTable
- Monthly evolution (reuse GroupedBarChart)
- AccountBarList
- Tag combiner URL state

**Outcome:** Full drilldown with intersection analysis.

### Minimum Viable for Dogfooding

**PR #98 + #99 + #100** = MVP. Pedro can see landing page with tag cards, explore basic metrics. Drilldown can show "Próximamente" until PR #101 lands.

**Critical path blocker:** Morpheus must ship `insights:landing-summary` handler before PR #100 can integrate. Coordinate in M3 tail.

---

## §9 Resolved Decisions

The three items previously open for Pedro have been answered (2026-05-02). Recorded here for traceability; the answers are propagated into §3, §4, and §6 above.

### OQ-1 — Landing date window → **Date-range selector NOW, Saldo parity**

**Decision:** The landing ships in M4 with a date-range selector reusing Saldo's `DateRangePicker` component. Default range mirrors Saldo's current default (single source of truth — do not fork the default). The active range is passed as `windowStart` / `windowEnd` into `insights:landing-summary` so server-side aggregation respects it; KPIs, tag cards, sparklines, and `topCategories` all reflect the active range. Range lives in URL/router state.

**Rationale:** Insights and Saldo are sibling analytics views — they should have the same temporal control surface from day one. Shipping without it and adding later would change the meaning of every KPI mid-flight. Worth the scope bump now.

**Note:** This is a scope change vs. Niobe's original recommendation (which was to defer the picker to a later milestone). Pedro overrode in favor of parity now.

**Propagated to:** §3.2 component tree (DateRangePicker added to PageHeader), §3.3 KPI sublabels + IPC call note + date-range selector spec, §6.2 `insights:landing-summary` request contract.

### OQ-2 — Multi-tag overlap → **Accepted as a feature (option c)**

**Decision:** Each tag card credits the full transaction amount. No dedupe. No footnote. No tooltip. `Σ(tag card incomeCents)` will exceed the KPI `INGRESOS ETIQUETADOS` total whenever any transaction has 2+ tags — this is intentional and locked. KPI strip totals remain deduplicated (each transaction counted once).

**Rationale:** Each campaign gets full credit on its own card. Tags are non-exclusive by design; subtracting overlap would understate every campaign's true contribution. Power users (Pedro, Mouse) understand the model; adding disclaimers creates noise without information value.

**Lock note:** A one-line implementer note has been added next to the KPI definitions in §3.3 so future contributors don't "fix" this asymmetry.

**Propagated to:** §3.3 (lock note inline with KPI table).

### OQ-3 — Drilldown footer link → **Tag(s) + date range pre-applied (option b)**

**Decision:** "Ver todos los movimientos →" navigates to Movimientos with **both** the active tag filter(s) **and** the active date range pre-applied. Same tab; browser back returns to the drilldown.

**Rationale:** The user is mid-investigation looking at a specific aggregate window. Dropping them into an unfiltered (or date-unfiltered) Movimientos view forces them to re-establish context they just had. Carrying both filters preserves continuity.

**Contract requirement:** The Movimientos route MUST accept `tagIds: string[]` (AND semantics) and `windowStart` / `windowEnd` ISO date strings via query params or router state. If Movimientos does not currently support these params, adding that support is a hard prerequisite for the drilldown PR (flag in PR #101 dependencies).

**Propagated to:** §4.2 footer link block (contract note inline).

---

*Final implementation spec. Ready for Mouse/Trinity build queue. Supersedes Amendment A1. All open questions resolved 2026-05-02 by Pedro.*
