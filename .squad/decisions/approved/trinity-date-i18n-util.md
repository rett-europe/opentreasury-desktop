# Decision: Centralized Date Formatting Utility

**Date:** 2026-04-21  
**By:** Trinity (Frontend Developer)  
**Status:** ✅ APPROVED — enforced as the standard date formatting pattern  
**Context:** WI-20 polish round 2 (fix(tx): round 2 polish — real table overflow, symmetric modal, date i18n)

## Problem

Dates were displayed in the UI without proper localization. Multiple components used `Intl.DateTimeFormat(navigator.language, ...)` directly, which caused two issues:

1. **Locale drift** — `navigator.language` doesn't track the app's active i18n language. User could switch app language (ES ↔ EN) but dates would stay in browser locale.
2. **Duplication** — Each component reimplemented date formatting inline (5 different sites: MovementsScreen, PanelScreen, TransactionDetailModal, NotesThread, ImportWizard).

Example (buggy):

```tsx
// PanelScreen.tsx — WRONG: uses navigator.language, not i18n.language
render: (row) =>
  new Intl.DateTimeFormat(navigator.language, { dateStyle: 'medium' }).format(
    new Date(`${row.date}T00:00:00Z`),
  ),
```

When user switched app language from Spanish to English, dates still appeared in Spanish (or whatever `navigator.language` returned).

## Decision

Created **`renderer/utils/dateFormat.ts`** as the single source of truth for all date display. Three exported helpers:

### 1. `formatDate(iso: string, locale: string): string`

Formats ISO date (YYYY-MM-DD) to medium date style.

```ts
formatDate('2026-04-21', 'es-ES'); // → "21 abr 2026"
formatDate('2026-04-21', 'en-US'); // → "Apr 21, 2026"
```

Use for: transaction dates, movement table dates, panel recent transactions.

### 2. `formatDateTime(iso: string, locale: string): string`

Formats ISO 8601 timestamp to medium date + short time.

```ts
formatDateTime('2026-04-21T15:30:00Z', 'es-ES'); // → "21 abr 2026, 15:30"
formatDateTime('2026-04-21T15:30:00Z', 'en-US'); // → "Apr 21, 2026, 3:30 PM"
```

Use for: transaction note timestamps, audit logs, any datetime display.

### 3. `formatMonth(monthStr: string, locale: string): string`

Formats YYYY-MM to long month + year.

```ts
formatMonth('2026-04', 'es-ES'); // → "abril de 2026"
formatMonth('2026-04', 'en-US'); // → "April 2026"
```

Use for: KPI month labels, report month headers, month selectors.

## Implementation Pattern

Each component derives `locale` from `i18n.language` and passes it to the helpers:

```tsx
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../utils/dateFormat.js';

export function MovementsScreen(): JSX.Element {
  const { t, i18n } = useTranslation('common');
  const locale = i18n.language.startsWith('es') ? 'es-ES' : 'en-US';

  const columns = [
    {
      id: 'date',
      render: (row) => formatDate(row.date, locale),
    },
  ];
  // ...
}
```

**Why derive locale from i18n.language?**

- `i18n.language` tracks the **active app language** (user can toggle ES ↔ EN).
- `navigator.language` is the **browser locale** (doesn't change when user switches app language).
- The app only supports ES + EN, so we map `i18n.language` to BCP 47 locales (`es-ES` / `en-US`).

## Alternatives Considered

### (a) Keep inline `Intl.DateTimeFormat` calls, but use `i18n.language`

**Rejected:** Still duplicates formatting logic across 5+ components. No single source of truth. Harder to change date format globally (e.g., if we want to switch from medium to long date style).

### (b) Use `i18n.format()` or `react-i18next` date formatting

**Rejected:** `i18next` doesn't have built-in date formatting. Would require additional plugin or custom formatter. Simpler to use browser-native `Intl.DateTimeFormat` with locale param.

### (c) Create a `useFormattedDate` hook instead of plain functions

**Rejected:** Over-engineered. Date formatting is a pure function (no React state/effects needed). Plain functions are simpler to test and use. Hooks would force components to memoize the formatters even when locale rarely changes.

## Benefits

1. **Locale consistency** — All dates follow app language (ES ↔ EN) instead of browser locale.
2. **Single source of truth** — One file to update if date format changes (e.g., switch from medium to long style).
3. **Reusability** — Any component can import and use these helpers without reimplementing.
4. **Testability** — Pure functions are trivial to test (input ISO + locale → output string).
5. **Type safety** — TypeScript ensures all callers provide locale param.

## Migration

All existing date display sites were updated:

- **MovementsScreen** — transaction table date column
- **PanelScreen** — recent transactions date column + KPI month labels
- **TransactionDetailModal** — header date display
- **NotesThread** — note timestamp display
- **ImportWizard** — (already correct, no change needed)

Before:

```tsx
new Intl.DateTimeFormat(navigator.language, { dateStyle: 'medium' }).format(
  new Date(`${row.date}T00:00:00Z`),
);
```

After:

```tsx
formatDate(row.date, locale);
```

## Future Considerations

- If we add more languages (e.g., French, German), extend the locale mapping logic:
  ```ts
  const locale = i18n.language.startsWith('es')
    ? 'es-ES'
    : i18n.language.startsWith('fr')
      ? 'fr-FR'
      : 'en-US';
  ```
- If we need custom date formats (e.g., "dd/MM/yyyy" for Spanish vs "MM/dd/yyyy" for English), add a fourth helper `formatDateCustom(iso, locale, options)` that accepts `Intl.DateTimeFormat` options.

## Testing

No new component tests added (pure functions, trivial to verify manually). Existing tests pass. Gates: typecheck ✅, lint ✅, prettier ✅, tests ✅ (370 passed), build ✅.

## Related Decisions

- **WI-20 polish round 1** — unified 760px modal width (`.squad/decisions/inbox/trinity-tx-modal-unified-width.md`)
- **WI-20 edit in-place swap** — modal body swap pattern (`.squad/decisions/inbox/trinity-edit-inplace-swap.md`)

---

**Next steps:** Monitor for any missed date display sites. If found, update to use `formatDate` / `formatDateTime` / `formatMonth` helpers.
