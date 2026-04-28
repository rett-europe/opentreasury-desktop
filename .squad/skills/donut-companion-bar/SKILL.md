# SKILL: Donut + Companion Ranked Bar List

**Owner:** Trinity (Frontend) · **Established:** 2026-05-04 (PR #127)

A reusable two-part visualisation pattern for hierarchical, signed-amount data
(category → subcategory, account → counterparty, etc.) on dashboard / drilldown
screens. The **donut** gives a stable, glanceable share-of-total view at the
parent level; the **companion ranked bar list** gives detail at the child level
with selection coupling back to the donut.

## When to use

- You have a parent → child amount distribution where the parent has ≤ ~8
  visible buckets and each parent has 0–N children.
- You want users to glance at parent shares AND drill into a chosen parent's
  children without leaving the screen.
- You want "show me top-N children overall" as the default and "show me the
  children of THIS parent" as an opt-in via slice/legend click.

Past instances: Insights drilldown (category donut + subcategory bar list,
PR #127). Candidates: Saldo per-account → counterparty, Movements per-tag →
category.

## Anatomy

```
┌─ Donut row ──────────────────────────────────────────────┐
│  [donut svg]   [legend]                                  │
│                ● Cat A  €1,234   45%   ← clickable row   │
│                ● Cat B    €567   22%                     │
│                ● Cat C    €234    8%                     │
└──────────────────────────────────────────────────────────┘
┌─ Ranked bar list panel ──────────────────────────────────┐
│  Title                            [Gastos | Ingresos]    │
│  [Filtered by: Cat A ×]  ← chip when selection active    │
│  ● Sub A1  ▓▓▓▓▓▓▓▓▓░░  €800                             │
│  ● Sub A2  ▓▓▓▓░░░░░░░  €234                             │
│  ● Sub A3  ▓░░░░░░░░░░  €120                             │
│  Mostrar todo  ← if more than N=10                       │
└──────────────────────────────────────────────────────────┘
```

## Core rules

1. **Single source of data.** Both surfaces consume the same aggregation
   payload. If the read model already exposes child-level rows
   (e.g. `SubcategoryRow[]`), filter/sort in the renderer; don't add a new
   reducer just for the bar list.

2. **Colour parity.** Donut slices use `var(--color-donut-${idx % 8})` based on
   slice ORDER. Bar list pills must match: build a `Map<parentId, cssVar>`
   from the donut's slice array and pass it as `categoryColorMap` to the bar
   list. Each "view" (income / expense / etc.) maintains its own ordering and
   therefore its own map.

3. **Selection coupling.** Click on a donut slice OR its legend row sets
   `selectedParentId`. The bar list filters to that parent and percentages
   re-base within the selected parent's total. Click again or click the chip
   `×` to clear. Selection MUST reset on data-window changes (date range, tags,
   etc.).

4. **View inheritance, not duplication.** If the screen has a Gastos / Ingresos
   (or similar) selector, the bar list inherits it — never add a duplicate
   toggle. If the screen genuinely has no selector to inherit from (e.g. it
   shows two donuts in parallel), add the toggle at panel scope and document
   the deviation in the PR body. View change resets the active selection.

5. **Top-N with show-all.** Default to top **N=10** by absolute amount desc.
   Show a footer link `Mostrar todo / Mostrar menos` if there are more rows.
   Empty state when the active view has no data: muted "Sin datos para esta
   vista" — match the donut's empty-state copy.

6. **Saldo grid for amounts.** Use
   `grid-template-columns: minmax(0, 1.4fr) minmax(0, 2fr) minmax(min-content, auto)`
   so the child name ellipsis-clips, the bar flexes, and the locale-formatted
   amount (Spanish thousands separator!) is **never** truncated.

7. **Semantic amount colour.** Income amounts → `--color-status-approved`,
   expense amounts → `--color-expense-default`. Reuse the splits-delta /
   KPI colour treatment, not one-off colours.

8. **A11y.** Each bar row is `role="progressbar"` with `aria-valuemin/max/now`
   and an `aria-label` containing name + amount + percentage. Selection state
   on the donut legend uses `<button aria-pressed>`. Tooltip via `title`
   attribute on the row for hover detail.

9. **Responsive collapse.** Below ~600px, the row collapses to a 2-line
   layout: label + amount on top, bar beneath. Bar list panel and donut
   stack vertically below the existing breakpoint (≤1023px in the Insights
   case).

10. **No new chart deps.** Plain HTML/CSS bars only. Bundle stays lean.

## Component contract (recommended)

```ts
type DonutCompanionPanelProps = {
  rows: ReadonlyArray<ChildRow>;             // server-aggregated
  view: 'gastos' | 'ingresos';               // or whatever the screen uses
  categoryColorMap: ReadonlyMap<string, string>; // parentId → CSS color var
  selectedCategoryId: string | null;
  selectedCategoryName?: string | null;
  onClearSelection: () => void;
  locale: string;
  // i18n strings injected by parent — no useTranslation in the panel itself,
  // keeps it locale-agnostic and trivially testable.
  title: string;
  emptyLabel: string;
  showAllLabel: string;
  showLessLabel: string;
  chipPrefixLabel: string;
  chipClearAriaLabel: string;
  topN?: number; // default 10
};
```

## Anti-patterns

- ❌ Adding a separate "Subcategory donut" alongside the bar list — defeats
  the share-of-total purpose. The bar list IS the detail surface.
- ❌ Wiring slice clicks in the SVG `DonutChart` itself when the legend already
  works — modifying the chart primitive adds risk for marginal UX gain. Make
  the legend row a `<button>` instead.
- ❌ Hardcoded colours per row. Always inherit from the donut's deterministic
  cycle so the two surfaces visually link.
- ❌ Truncating amounts. The amount column is sacred — see Rule 6.
- ❌ Persisting selection across view changes or data-window changes.

## Reference

- `app/src/renderer/components/SubcategoryDistributionPanel/` — canonical impl
- `app/src/renderer/screens/InsightsDetailScreen/InsightsDetailScreen.tsx` —
  composition (clickable legend, view+selection state, color map builder)
- PR #127 · `feat(insights): distribution by subcategory panel`
