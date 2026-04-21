# Table Column Width Budget — Final Values (WI-20 Round 2)

**Author:** Mouse (UI Designer)  
**Date:** 2026-04-22  
**Status:** Implemented

## Available Width Calculation

The key insight: **viewport width ≠ table budget**. Subtract all layout chrome first.

### At 1366px viewport (Surface laptop baseline):

```
Viewport:        1366px
Sidebar:         -240px   (--sidebar-width in tokens.css)
Main padding:    -64px    (--space-10 × 2 = 32px left + 32px right)
Table border:    -2px     (1px × 2 from .ot-table-wrap)
─────────────────────────
AVAILABLE:       1060px
```

### At 1440px viewport:
```
1440 - 240 - 64 - 2 = 1134px available
```

### At 1920px viewport:
```
1920 - 240 - 64 - 2 = 1614px available
```

## MovementsScreen Column Widths (10 columns)

| Column       | Width | Purpose                              |
|-------------|-------|--------------------------------------|
| select      | 32px  | Checkbox only                        |
| type        | 32px  | Arrow icon (↑/↓)                     |
| date        | 88px  | "dd MMM yyyy" format                 |
| account     | 100px | Account pill (truncates)             |
| description | 200px | Main content column                  |
| category    | 120px | Category code (truncates)            |
| subcategory | 120px | Subcategory code (truncates)         |
| tags        | 140px | Chips + "+N" overflow indicator      |
| status      | 80px  | Badge (Pendiente/Aprobado)           |
| amount      | 100px | Currency (right-aligned)             |
| **TOTAL**   | **1012px** | Leaves 48px buffer              |

## PanelScreen Column Widths (7 columns)

| Column       | Width | Purpose                              |
|-------------|-------|--------------------------------------|
| type        | 32px  | Arrow icon (↑/↓)                     |
| date        | 100px | "dd MMM yyyy" format                 |
| account     | 120px | Account pill (truncates)             |
| description | flex  | Auto-fills remaining space (~500px)  |
| category    | 120px | Category or uncategorized badge      |
| subcategory | 120px | Subcategory (muted text or dash)     |
| amount      | 100px | Currency (right-aligned)             |
| **FIXED**   | **592px** | Description flexes the rest     |

## Implementation Pattern

1. **CSS owns column widths** — not inline `width` props in TSX
2. **`table-layout: fixed`** — required for enforced widths
3. **`text-overflow: ellipsis`** — graceful truncation
4. **`title` attributes** — full value on hover
5. **`overflow-x: auto`** wrapper — safety fallback

## Files Changed

- `app/src/renderer/screens/MovementsScreen/MovementsScreen.css`
- `app/src/renderer/screens/PanelScreen/PanelScreen.css`
- `app/src/renderer/screens/PanelScreen/PanelScreen.tsx`

## Key Lesson

Always measure the ACTUAL available width at the target breakpoint before setting column budgets. The layout has layers (sidebar, padding, borders) that consume viewport space.
