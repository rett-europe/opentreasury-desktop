# Skill — i18n Formatting Helpers

**Canonical pattern (renderer):** always derive display-locale values from `i18n.language`, never `navigator.language`. Pull the mapping inline:

```ts
const { t, i18n } = useTranslation('common');
const locale = i18n.language.startsWith('es') ? 'es-ES' : 'en-US';
```

**Helpers to reuse (do not reinvent):**

- `app/src/renderer/utils/dateFormat.ts` — `formatDate`, `formatDateTime`, `formatMonth`.
- `app/src/renderer/utils/numberFormat.ts` — `formatCurrency(amount, locale, currency = 'EUR')`.

**Rules:**

1. Intl formatters belong in `utils/`, not inlined in components. Keep the component layer purely presentational.
2. Every helper takes `locale` as an explicit parameter. No module-level reads of `navigator.language`, `document.documentElement.lang`, etc.
3. When adding a new helper, mirror `dateFormat.ts`: JSDoc on every export, try/catch fallback returning a safe string, unit tests covering es-ES + en-US + one edge case.
4. If the field carries a per-record currency (e.g. transactions), pass `transaction.currency`; otherwise default `'EUR'`.

**Sweep invariant:** `rg "navigator\.language" app/src/renderer` should return zero currency/number/date formatting call sites. Any remaining hit must be deliberate (e.g. diagnostics) and documented in the PR that introduced it.

**Established by:** PR #5 (modal locale fix), PR #chore/number-format-helper (helper extraction + 3-call-site sweep).
