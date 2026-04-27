/**
 * Number formatting utilities — locale-aware currency display.
 * Mirrors the pattern in `dateFormat.ts`: the caller supplies the BCP 47
 * locale (typically derived from `i18n.language`), never `navigator.language`,
 * so formatting stays in lockstep with the UI language.
 */

/**
 * Format a numeric amount as localized currency.
 *
 * Uses `Intl.NumberFormat` with `style: 'currency'`. The default `signDisplay`
 * (`'auto'`) is used, which renders negative values with a leading minus and
 * positive values without a sign — matching the pre-existing call sites.
 *
 * `useGrouping: 'always'` is set so 4-digit amounts in Spanish locales also
 * render the thousands separator (`1.500,50 €` instead of `1500,50 €`). The
 * Spanish CLDR default of `minimumGroupingDigits: 2` would otherwise suppress
 * grouping for sub-10.000 amounts, producing inconsistency with English.
 *
 * @param amount - Numeric amount (may be negative).
 * @param locale - BCP 47 language tag (e.g. `'es-ES'`, `'en-US'`).
 * @param currency - ISO 4217 currency code. Defaults to `'EUR'`.
 * @returns Localized currency string (e.g. `"1.500,50 €"` in es-ES, `"€1,500.50"` in en-US).
 */
export function formatCurrency(amount: number, locale: string, currency: string = 'EUR'): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      // `useGrouping: 'always'` requires the modern Intl typings; the cast keeps
      // us compatible with older TS lib targets while preserving runtime behavior.
      useGrouping: 'always',
    } as unknown as Intl.NumberFormatOptions).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/**
 * Parse a user-entered amount string that may use either `.` or `,` as the
 * decimal separator (and the other character as the thousands separator).
 *
 * The Spanish UI displays amounts with `,` decimal (e.g. `300,50`), but
 * `parseFloat("300,50")` returns `300` — silently truncating the cents and
 * making the splits sum impossible to balance. This helper accepts both
 * styles and strips thousands separators so it's safe to call on any
 * locale-formatted amount the user types.
 *
 * Decimal separator detection: whichever of `.` or `,` appears LAST in the
 * string is treated as the decimal separator; the other is stripped as a
 * thousands separator. If only one of the two characters is present it is
 * treated as the decimal separator. This handles `1.234,56` (es), `1,234.56`
 * (en), `300,50` (es), `300.50` (en), and bare integers like `1234`.
 *
 * @param input - User-typed amount string. May be empty or invalid.
 * @returns Parsed number, or `NaN` when the input is empty/invalid.
 */
export function parseLocaleAmount(input: string): number {
  if (typeof input !== 'string') return NaN;
  const trimmed = input.trim();
  if (trimmed === '') return NaN;

  const lastDot = trimmed.lastIndexOf('.');
  const lastComma = trimmed.lastIndexOf(',');

  let normalized: string;
  if (lastDot === -1 && lastComma === -1) {
    normalized = trimmed;
  } else if (lastDot > lastComma) {
    normalized = trimmed.replace(/,/g, '');
  } else if (lastComma > lastDot) {
    normalized = trimmed.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = trimmed;
  }

  return parseFloat(normalized);
}
