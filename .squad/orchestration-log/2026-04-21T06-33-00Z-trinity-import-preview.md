# Trinity: Import Wizard Preview Fix

**Date:** 2026-04-21  
**Agent:** Trinity (Frontend Dev)  
**Duration:** ~407s  
**Status:** ✅ SHIPPED to main

## Summary

Fixed import wizard final preview modal to render dynamic columns from state.columnMapping instead of hardcoded <th> for Date/Desc/Amount. Empty optional cells now display "—" instead of blank.

## Key Changes

- **Root Cause:** Template had hardcoded column headers instead of reading from columnMapping state
- **Fix:** Iterate state.columnMapping in preview table header/body; render "—" for empty optional fields
- **Tests:** 361 tests green
- **Commits:** 
  - e05cc61 (preview column mapping fix)
  - 0c5027a (history update)
- **Gates:** typecheck ✅ lint ✅ format ✅ tests ✅ build ✅

## Files Modified

- pp/src/renderer/screens/ImportScreen/preview/PreviewTable.tsx
- pp/src/renderer/screens/ImportScreen/preview/PreviewTable.test.tsx

## Notes

Dynamic columns enable flexible preview for different import sources (future bank formats). No backend changes.
