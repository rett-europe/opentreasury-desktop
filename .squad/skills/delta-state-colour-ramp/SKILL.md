# Skill: Delta State Colour Ramp

**Pattern:** 3-state balance indicator (over / under / balanced)  
**Origin:** SPEC-023 split transactions, PR #66  
**Author:** Mouse

## When to Use

Any UI element that shows whether a numeric sum is over, under, or exactly matching a target. Examples:
- Split transaction allocation (children vs parent)
- Budget utilisation bars
- Reconciliation indicators
- Payment allocation status

## Token Mapping

| State | Semantic | Foreground | Background |
|---|---|---|---|
| Over (positive delta) | Error / recoverable | `--color-expense-default` | `--color-expense-bg` |
| Under (negative delta) | Warning / advisory | `--color-warning-default` | `--color-warning-bg` |
| Balanced (zero delta) | Success / complete | `--color-status-approved` | `--color-status-approved-bg` |

## CSS Pattern

```css
.my-delta {
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
}
.my-delta--over {
  color: var(--color-expense-default);
  background: var(--color-expense-bg);
}
.my-delta--under {
  color: var(--color-warning-default);
  background: var(--color-warning-bg);
}
.my-delta--balanced {
  color: var(--color-status-approved);
  background: var(--color-status-approved-bg);
}
```

## Design Rationale

- Over-allocation = concrete error (sum exceeds target) → expense/danger tone
- Under-allocation = incomplete (user still working) → warning/amber tone
- Balanced = done → approved/green tone
- All pairs pass WCAG AA contrast in both light and dark themes
- No new colour primitives needed — reuses existing semantic tokens
