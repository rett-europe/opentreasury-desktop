# Squad Journal

## 2026-04-22: Mouse — Scroll-Fallback Round (WI-20 Finalization)

**Who:** Mouse (UI Designer)  
**What:** Fixed horizontal scroll fallback for Movements/Panel tables below ~1350px viewports  
**Why:** Pedro reported: tables trimmed with no scroll on narrower screens  

### Root Cause (3 Ancestor Traps)

1. `.ot-shell__main` had `overflow-x: hidden` — blocked all horizontal scroll
2. `.ot-movements` (flex child) missing `min-width: 0` — prevented flex shrinking
3. `.ot-panel-recent` had `overflow: hidden` — hid scroll independently

### The Fix

| File | Change |
|------|--------|
| `AppShell.css` | `.ot-shell__main` → `overflow-x: auto` |
| `MovementsScreen.css` | `.ot-movements` → `+ min-width: 0` |
| `PanelScreen.css` | `.ot-panel-recent` → `overflow-x: auto + overflow-y: hidden` |

### Commits

- `f21de3f` - fix(ui): enable horizontal scroll fallback on narrow viewports
- `742d094` - docs(squad): document overflow scroll trap fix learnings

### Key Lesson

Flexbox children need `min-width: 0` to shrink below content size. Ancestor `overflow: hidden` blocks child overflow properties — trace the full stack.

---
