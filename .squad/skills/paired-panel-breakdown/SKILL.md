---
name: "paired-panel-breakdown"
description: "Two side-by-side panel cards for category breakdowns with comparative progress bars"
domain: "ui-patterns"
confidence: "medium"
source: "observed from Pedro's Saldo prototype (panel_saldo.png)"
---

## Context

Use this pattern when displaying category-level data that naturally splits into two groups (e.g., income vs expense, assets vs liabilities, inflows vs outflows). Each group gets its own panel card, shown side-by-side, with inline progress bars comparing two time periods.

**When to use:**
- Comparing two mutually exclusive category sets
- Year-over-year or period-over-period comparisons
- When totals per group are as important as individual category values
- When visual comparison (progress bars) aids understanding

**When NOT to use:**
- Categories don't split into two groups
- Single time period display (no comparison)
- Drill-through navigation needed (rows should be non-clickable)

## Patterns

### Layout Structure

```
┌────────────────────────────────┐  ┌────────────────────────────────┐
│  [Title]      [Total]          │  │  [Title]      [Total]          │
│  [Subtitle]                    │  │  [Subtitle]                    │
├────────────────────────────────┤  ├────────────────────────────────┤
│  COL1    COL2   COL3    COL4   │  │  COL1    COL2   COL3    COL4   │
├────────────────────────────────┤  ├────────────────────────────────┤
│  Row 1 with progress bar       │  │  Row 1 with progress bar       │
│  Row 2 with progress bar       │  │  Row 2 with progress bar       │
│  ...                           │  │  ...                           │
└────────────────────────────────┘  └────────────────────────────────┘
         LEFT PANEL                          RIGHT PANEL
```

### CSS Grid Setup

```css
.paired-panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-7); /* 16px */
}

@media (max-width: 1199px) {
  .paired-panels {
    grid-template-columns: 1fr;
  }
}
```

### Panel Card Anatomy

```tsx
<div className="paired-panel paired-panel--income">
  <header className="paired-panel__header">
    <div>
      <h3 className="paired-panel__title">Ingresos</h3>
      <p className="paired-panel__subtitle">Comparación por categoría</p>
    </div>
    <div className="paired-panel__total">
      <span className="paired-panel__total-label">Total ingresos 2026</span>
      <span className="paired-panel__total-value">48.843 €</span>
    </div>
  </header>
  <table className="paired-panel__table">
    {/* ... */}
  </table>
</div>
```

### Row with Inline Progress Bar

```tsx
<tr>
  <td>
    <div className="paired-panel__name">Donaciones</div>
    <div className="paired-panel__type">income</div>
  </td>
  <td className="paired-panel__amount">32.181 €</td>
  <td>
    <div className="paired-panel__progress">
      <div 
        className="paired-panel__bar paired-panel__bar--prior" 
        style={{ width: `${priorPct}%` }} 
      />
      <div 
        className="paired-panel__bar paired-panel__bar--current" 
        style={{ width: `${currentPct}%` }} 
      />
    </div>
    <span className="paired-panel__amount">17.520 €</span>
  </td>
  <td>
    <div className="paired-panel__delta paired-panel__delta--up">↑ 63%</div>
    <div className="paired-panel__delta-sublabel">proy. vs 2025</div>
  </td>
</tr>
```

### Progress Bar Normalization

Bars are normalized **within each row**, not against panel total:

```ts
// Per-row normalization
const maxInRow = Math.max(priorAmount, currentAmount);
const priorPct = (priorAmount / maxInRow) * 100;
const currentPct = (currentAmount / maxInRow) * 100;
```

This ensures the larger value always fills the bar, and the smaller shows proportionally less.

### Token Usage

| Element | Token |
|---------|-------|
| Panel bg | `--color-surface-primary` |
| Panel border | `1px solid var(--color-border-default)` |
| Panel radius | `--radius-md` (8px) |
| Panel padding | `--space-7` (16px) |
| Gap between panels | `--space-7` (16px) |
| Title | `--font-size-16`, `--font-weight-semibold` |
| Subtitle | `--font-size-12`, `--color-text-muted` |
| Total value | `--font-size-24`, semantic color |
| Table header | `--section-label-size`, `uppercase` |
| Category name | `--font-size-14`, `--font-weight-medium` |
| Type sublabel | `--font-size-11`, `--color-text-muted` |
| Progress track | `--color-surface-secondary` |
| Income bar | `--color-income-default` |
| Expense bar | `--color-expense-default` |
| Delta up | `--color-income-default` |
| Delta down | `--color-expense-default` |

## Examples

**Saldo screen (Ingresos / Gastos):**
- Left: Income categories with green progress bars
- Right: Expense categories with red progress bars
- Each shows 2025 vs 2026 comparison

**Potential reuse:**
- Budget vs Actual breakdowns
- Planned vs Executed expenses
- Current vs Prior quarter comparisons

## Anti-Patterns

1. **Don't mix category types in one panel.** Each panel should contain homogeneous data (all income OR all expense). Mixed confuses the totals.

2. **Don't normalize bars against panel total.** Per-row normalization shows relative change; panel-total normalization would make small categories invisible.

3. **Don't make rows clickable in M1.** Drill-through is an explicit non-goal. Rows are read-only.

4. **Don't use this for >8 rows per panel.** Beyond 8, consider pagination or collapse. Visual comparison becomes meaningless with too many rows.

5. **Don't hide the delta sublabel.** `proy. vs 2025` explains what the percentage means. Without it, deltas are ambiguous.
