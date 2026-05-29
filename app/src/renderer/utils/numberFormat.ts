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

/**
 * Validate a typed amount-input candidate as the user types — STRICT per-locale.
 *
 * Returns `true` when `candidate` is a valid amount under the locale's
 * decimal separator: digits + at most one `decimalSep` + an optional leading
 * `-`. Thousands grouping is NOT accepted at input time (the UI inserts it
 * at display time via `formatCurrency`).
 *
 * Used as a guard in `onChange` handlers on currency inputs: when the user
 * types an invalid character we silently drop the keystroke, so the input
 * value reverts to the previous valid state (mirroring `type="number"` UX).
 *
 * Rules:
 *   1. Allowed characters: digits `0-9`, exactly one `decimalSep`, and an
 *      optional leading `-`. The other separator character is rejected.
 *   2. Integer part: up to 12 digits (omittable, supporting `,85` / `.85`).
 *   3. Decimal part: up to 2 digits after `decimalSep` (omittable, so a
 *      trailing separator like `1331,` is allowed as an intermediate state).
 *   4. Empty string and lone `-` are accepted (intermediate states).
 *
 * @param candidate  - The full prospective input value after the keystroke.
 * @param decimalSep - The locale's decimal separator: `.` (en) or `,` (es).
 * @returns `true` if the candidate is acceptable, `false` to reject.
 */
export function isValidAmountInput(candidate: string, decimalSep: '.' | ','): boolean {
  if (candidate === '' || candidate === '-') return true;
  const escapedSep = decimalSep === '.' ? '\\.' : ',';
  // Optional sign, up to 12 integer digits, optional `sep` + up to 2 decimal
  // digits. Integer and decimal parts may be empty (`,85`, `1331,` are mid-typing).
  const re = new RegExp(`^-?\\d{0,12}(${escapedSep}\\d{0,2})?$`);
  return re.test(candidate);
}

/**
 * Returns the decimal separator used by the given BCP 47 locale.
 *
 * Spanish (and continental European locales generally) use `,`; English
 * (US/UK) uses `.`. We default to `,` for any non-English locale because the
 * Rett Spain pilot is the active deployment and ES is the project's primary
 * UI language. Callers should derive this once from `i18n.language` and pass
 * it to `isValidAmountInput`.
 */
export function decimalSeparatorForLocale(locale: string): '.' | ',' {
  return locale.startsWith('en') ? '.' : ',';
}

/**
 * Convert a numeric amount to a locale-correct input-field string.
 *
 * The renderer holds amount inputs as `string` so the user's typed text
 * round-trips cleanly through `parseLocaleAmount`. When pre-filling such an
 * input from a stored number, `Number.prototype.toString()` always emits a
 * period as the decimal separator — which then visually clashes with the
 * locale (e.g. shows `423.89` in a Spanish modal) and, under the strict
 * per-locale validator, is rejected as an invalid character on the next
 * keystroke.
 *
 * Produces the right string for the locale: `"423,89"` for ES, `"423.89"`
 * for EN. Non-finite inputs (NaN, ±Infinity) become an empty string so the
 * field stays unset. Does NOT add thousands grouping — input fields never
 * carry thousands separators under the strict-validator rule.
 *
 * @param amount     - Stored numeric amount (e.g. `transaction.amount`).
 * @param decimalSep - The locale's decimal separator: `.` (en) or `,` (es).
 */
export function formatAmountForInput(amount: number, decimalSep: '.' | ','): string {
  if (!Number.isFinite(amount)) return '';
  const raw = amount.toString();
  return decimalSep === ',' ? raw.replace('.', ',') : raw;
}
