# Squad Journal

## 2026-04-24: Mouse — Modal View-Edit Parity Round 2

**Who:** Mouse (UI Designer)  
**What:** Fixed modal field data parity (resolved FK IDs to names) and aligned edit mode field order to view mode  
**Why:** Pedro reported view modal showed raw account ULID; edit modal had different field order and no labels

### Changes

View mode now resolves FK IDs (category/subcategory/tags) to display names internally. Edit mode field order realigned to match view exactly:

```
Cuenta → Categoría → Subcategoría → Etiquetas → Estado → Referencia → Detalles
```

### Output

- **Commit:** `28717f7` — fix(modal): show account name + align edit field order & labels to view

### Key Lesson

Modal pairs require parity in both presentation (labels, resolved IDs) and field sequence for consistent UX.

---

## 2026-04-23: Mouse — Modal View-Edit Parity Round

**Who:** Mouse (UI Designer)  
**What:** Aligned edit modal styling to view modal; refactored TransactionFormFields as a skin of view layout  
**Why:** Pedro reported divergent look & feel between modes; view mode was the preferred baseline  

### Root Cause

Edit mode replaced view layout with TransactionFormFields instead of inheriting it. Four visual drifts resulted:
1. Missing summary header (date/description/amount)
2. Grid gap mismatch (space-4 vs space-5)
3. Different grid template shape
4. Unintended min-height: 520px caused size jump on toggle

### The Fix

Restored summary header, unified grid structure (2 cols, space-5/space-6 gaps), removed artificial min-height. Edit mode now inherits view layout.

### Output

- **Commit:** `ff6890a` — fix(modal): align edit mode styling to view mode
- **Skill:** `.squad/skills/modal-view-edit-parity/SKILL.md` — Edit mode as skin of view mode pattern

### Key Lesson

Modal pairs (view + edit) must share primitives: grid, gaps, row rhythm, labels. Edit is a skin—only value cells morph.

---

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
