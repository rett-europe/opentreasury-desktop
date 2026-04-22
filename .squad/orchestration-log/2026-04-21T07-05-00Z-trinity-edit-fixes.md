# Trinity: WI-20 Edit UX Fixes

**Date:** 2026-04-21  
**Agent:** Trinity (Frontend Dev)  
**Duration:** ~1122s  
**Status:** ✅ SHIPPED to main

## Summary

Fixed three UX bugs reported by Pedro for WI-20 transaction edit feature:

1. **Bug 1:** Edit/Delete only worked from PanelScreen (Dashboard), not MovementsScreen (Transactions). Fixed by wiring TransactionDetailModal into MovementsScreen with row-click handler + update/delete refresh.

2. **Bug 2:** Edit modal too cramped (640px → 720px). Refactored to two-column layout for compact fields (date/type, amount/account, status/reference).

3. **Bug 3 (Scope Regression):** Implementation opened stacked TransactionFormModal (Option B) instead of in-place swap (Option A). Refactored to same <dialog> with body/footer swap (read-only ↔ edit). Extracted reusable TransactionFormFields component.

## Key Changes

- **Modal Swap:** In-place swap in same <dialog> — title/body/footer swap
- **Width:** 640px read-only → 720px edit mode (smooth CSS transition)
- **Delete Button:** Hidden during edit (UX clarity)
- **Notes Thread:** Hidden during edit mode
- **Form Component:** New TransactionFormFields (reusable between add/edit)
- **MovementsScreen Wiring:** selectedTx state + row-click handler + loadAll() refresh

## Test Updates

- TransactionDetailModal.test.tsx: verify in-place swap behavior
- Tests: 364 tests green (9 skipped)

## Commits

- (Main commit) ix(tx): WI-20 edit UX corrections — in-place swap, MovementsScreen wiring, width
- Previous: (History + learnings)

## Gates

✅ typecheck ✅ lint ✅ format ✅ tests (364/373) ✅ build

## Decision Logged

	rinity-edit-inplace-swap.md in decisions/inbox (merged to decisions.md by Scribe).

## Notes

- Root cause: in-place swap refactor was harder than adding stacked modal; easier path taken initially.
- Lesson: verify Option A/B approval is implemented before shipping.
- TransactionFormFields pattern: individual props + onChange handlers, no internal state. Parent owns form state + validation.
