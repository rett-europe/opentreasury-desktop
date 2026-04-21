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

## ⚠️ Lesson Learned (WI-20 Round 3): Scroll Fallback Requires Unobstructed Ancestor Chain

**The overflow-x: auto scroll fallback pattern ONLY works if the ancestor chain is properly configured.**

### The Problem

Even with `overflow-x: auto` on a table wrapper and proper `table-layout: fixed` column widths, horizontal scroll may NOT appear if:

1. **Any ancestor has `overflow-x: hidden` or `overflow: hidden`** — this traps the scroll before it reaches the wrapper
2. **The wrapper is a flex child without `min-width: 0`** — flex items default to `min-width: auto` (= content width), preventing the wrapper from shrinking below the table's intrinsic width, so no scrollbar triggers
3. **Parent containers prevent width contraction** — if ancestors can't get narrower than the table, the wrapper never becomes smaller than its content

### The Solution: Audit the Full DOM Chain

When adding `overflow-x: auto` scroll fallback, trace from the wrapper UP to the viewport root:

```html
<main class="ot-shell__main">          <!-- ✅ overflow-x: auto (allow pass-through) -->
  <div class="ot-screen">               <!-- ✅ min-width: 0 if flex item -->
    <div class="ot-table-container">    <!-- ✅ overflow-x: auto (scroll wrapper) -->
      <table class="ot-table">          <!-- table-layout: fixed, explicit widths -->
```

**Required fixes:**
1. **Remove `overflow-x: hidden` from ALL ancestors** — change to `overflow-x: auto` or remove entirely
2. **Add `min-width: 0` to flex containers** that wrap the scroll wrapper
3. **Verify width contraction path** — the wrapper's parent chain must be ABLE to shrink below table width

### Example Fix (OpenTreasury Desktop)

**Before (broken):**
```css
.ot-shell__main {
  overflow-x: hidden;  /* ❌ traps scroll from children */
}

.ot-movements {
  display: flex;
  flex-direction: column;
  /* ❌ missing min-width: 0, prevents shrink */
}

.ot-panel-recent {
  overflow: hidden;  /* ❌ blocks horizontal scroll */
}
```

**After (working):**
```css
.ot-shell__main {
  overflow-x: auto;  /* ✅ allow scroll pass-through */
}

.ot-movements {
  display: flex;
  flex-direction: column;
  min-width: 0;  /* ✅ allow flex child to shrink */
}

.ot-panel-recent {
  overflow-x: auto;  /* ✅ enable horizontal scroll */
  overflow-y: hidden;
}
```

**Why `min-width: 0` matters:**
Flex items default to `min-width: auto`, which means "don't shrink below content width". When the content is a 1012px table, the flex container refuses to become narrower than 1012px, so the child wrapper with `overflow-x: auto` never gets small enough to trigger the scrollbar. Setting `min-width: 0` removes that floor, allowing the container to contract below content width.

### Debugging Checklist

If `overflow-x: auto` doesn't work:
- [ ] Inspect each ancestor from wrapper → viewport for `overflow-x: hidden` or `overflow: clip`
- [ ] Check if wrapper or its parents are flex/grid items — add `min-width: 0` to allow shrink
- [ ] Verify table has `table-layout: fixed` + explicit column widths (intrinsic width > wrapper width)
- [ ] Test at narrow viewport (<1350px) — scrollbar should appear and allow horizontal scroll
- [ ] Verify no `width: 100%` on table WITHOUT width cap on wrapper

**Commit reference:** `f21de3f` — fix(ui): enable horizontal scroll fallback on narrow viewports
