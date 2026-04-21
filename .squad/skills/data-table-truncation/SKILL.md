# Data Table Truncation

**When to use:** HTML tables with potentially long text content (codes, descriptions, names) that might overflow the viewport.

## The Problem

Tables with `table-layout: auto` (default) let columns grow to fit content. Combined with `white-space: nowrap`, this pushes columns off-screen without triggering horizontal scroll.

## ⚠️ Lesson Learned (WI-20 Round 2)

**Measure ACTUAL available width before choosing column budgets.**

Viewport width ≠ table content area. Always subtract layout chrome:

```
At 1366px viewport (Surface laptop):
  Viewport:       1366px
  Sidebar:        -240px   (--sidebar-width)
  Main padding:   -64px    (--space-10 × 2 = 32px left + 32px right)
  Table border:   -2px
  ─────────────────────────
  AVAILABLE:      1060px   ← This is your table budget, NOT 1366px
```

Different viewports:
- 1366px → 1060px available
- 1440px → 1134px available
- 1920px → 1614px available

## The Solution: Fixed Layout + Ellipsis

### 1. Enable Fixed Table Layout

```css
.my-table-container .ot-table {
  table-layout: fixed;
  width: 100%;
}
```

### 2. Set Column Widths via nth-child

```css
/* Column 1: checkbox */
.my-table-container .ot-table th:nth-child(1),
.my-table-container .ot-table td:nth-child(1) {
  width: 36px;
  max-width: 36px;
}

/* Column 2: description (text content) */
.my-table-container .ot-table th:nth-child(2),
.my-table-container .ot-table td:nth-child(2) {
  width: 200px;
  max-width: 200px;
}
```

### 3. Apply Truncation to Text Cells

```css
.my-table-container .ot-table td {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

### 4. Add Title Attributes for Hover Access

```tsx
render: (row) => <span title={row.description}>{row.description}</span>
```

## Chip/Tag Overflow Pattern

When a column contains inline chips/tags, use a visible + overflow indicator:

```tsx
const MAX_VISIBLE = 2;
const visibleTags = tags.slice(0, MAX_VISIBLE);
const overflowTags = tags.slice(MAX_VISIBLE);

return (
  <span className="chip-cell" title={tags.join(', ')}>
    <span className="chip-cell__chips">
      {visibleTags.map((t) => <Chip key={t}>{t}</Chip>)}
    </span>
    {overflowTags.length > 0 && (
      <span className="chip-cell__overflow" title={overflowTags.join(', ')}>
        +{overflowTags.length}
      </span>
    )}
  </span>
);
```

```css
.chip-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  overflow: hidden;
}

.chip-cell__chips {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
  overflow: hidden;
}

.chip-cell__overflow {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 9999px;
  font-size: 11px;
  background: var(--color-surface-secondary);
  color: var(--color-text-muted);
  cursor: help;
}
```

## Column Width Guidelines

| Content Type | Suggested Width |
|--------------|-----------------|
| Checkbox     | 36px           |
| Icon only    | 36px           |
| Date (short) | 100px          |
| Badge/status | 90px           |
| Currency     | 110px          |
| Short name   | 130px          |
| Code/ID      | 150px          |
| Chips/tags   | 180px          |
| Description  | 200-240px      |

**Total width rule:** Sum of all columns should fit smallest target viewport (e.g., 1366px) minus sidebar (~250px) minus gutters (~50px) ≈ **1060px max table width**.

## Anti-patterns

❌ `min-width: max-content` on table — table grows infinitely
❌ `white-space: nowrap` without `max-width` — same problem
❌ `table-layout: auto` with long content — columns resize unpredictably
❌ Horizontal scroll container only — forces user to scroll to see status/actions columns
