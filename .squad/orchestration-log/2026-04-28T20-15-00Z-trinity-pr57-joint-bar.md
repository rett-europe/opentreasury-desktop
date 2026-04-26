# Trinity — PR #57: Joint Two-Row Filter Bar (Merged)

**Date:** 2026-04-28  
**PR:** #57  
**Commit:** af82a12  
**Status:** ✅ MERGED to main  
**Agent:** Trinity (claude-sonnet-4.5)

## Manifest

PR #57 merged date scope into a dedicated two-row filter bar structure, subsuming earlier anchored-band approach (Niobe Option A → D, Mouse Anchored → Calm Scope pivot).

### Changes

- **MovementsScreen.tsx:** Restructured JSX to hoist date-chip group + active-range pill into new `.ot-scope-bar` above `.ot-filter-bar`.
- **MovementsScreen.css:** Removed `.ot-movements__date-pill-row` styles; updated `.ot-movements__date-pill` for inline scope-bar rendering.
- **globals.css:** Added `.ot-scope-bar` recipe (prototype-parity rule: reusable pattern in globals, not component CSS).

### Visual Treatment

- **Layout:** Dedicated Scope Bar (Niobe Option A) — date chips in full-width band above slicing filters
- **Styling:** Anchored Band visual spec (Mouse, initially selected) → Calm Scope pivot post-review
  - Scope bar bg: `--color-brand-surface` (tinted)
  - Divider: `--color-divider` (bottom border)
  - Slicing filters remain in secondary row below
  - Active-range pill inline (right-aligned via `margin-left: auto`)

### Testing

- All 75 test files passing (no structural changes to state/logic)
- Typecheck, lint, format all green
- Dark mode verified via token awareness (no new overrides needed)

## Decisions Subsumed

- **Niobe Option D selection:** After initial Option A sketch, confirmed dedicated scope bar is the right layout
- **Mouse Anchored Band → Calm Scope pivot:** Initially recommended Anchored Band for max hierarchy clarity; post-implementation review resulted in Calm Scope (weight contrast, no full-width tint)
- **Scope bar CSS placement:** Recipe lives in `globals.css` per prototype-parity rule (reusable across screens)

## Next Steps

- Monitor visual fidelity in Pedro's dev environment
- If additional screens (Saldo, Panel) need period pickers, reuse `.ot-scope-bar` pattern
