# Evidence Files — PR #15 Bug Investigation

This directory contains evidence gathered for 3 reported bugs. See `../decisions/inbox/cypher-saldo-3bug-evidence.md` for the full summary.

## Files

### bug1-category-resolution.txt
Unit test output attempting to check category name resolution. **Empty model** (bootstrap seeds not loaded in test env). Code inspection confirms fallback logic exists.

### bug2-hardcoded-spanish.txt
Unit test output for hardcoded Spanish strings. **Empty model**. See `bug2-grep-evidence.txt` for conclusive code evidence.

### bug2-grep-evidence.txt
**CONCLUSIVE EVIDENCE** — grep context showing `const UNCATEGORIZED_LABEL = 'Sin categoría';` in `app/src/core/query/saldo.ts:38`. This string is NOT i18n'd and will appear in EN locale.

### bug3-chart-data.txt
Unit test output dumping saldo chart monthly series data. **Empty model**. Chart scaling logic looks correct on code inspection; needs E2E screenshots to diagnose.

## Status

- **Bug #2:** CONFIRMED (100%) — hardcoded Spanish string
- **Bug #1:** Code confirmed (fallback logic exists), needs runtime test
- **Bug #3:** Cannot confirm without E2E visual evidence

## Next Steps

1. Fix bug #2 by replacing `UNCATEGORIZED_LABEL` with i18n key (e.g., `t('common:uncategorized')`).
2. Run E2E test (`tests/e2e/evidence-pr15.spec.ts`) after `npm run build` to capture screenshots for bugs #1 and #3.
3. OR manually launch app with `npm run dev:electron` and inspect Panel/Movements/Saldo screens.
