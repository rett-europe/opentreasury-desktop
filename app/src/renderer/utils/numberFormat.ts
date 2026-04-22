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
 * @param amount - Numeric amount (may be negative).
 * @param locale - BCP 47 language tag (e.g. `'es-ES'`, `'en-US'`).
 * @param currency - ISO 4217 currency code. Defaults to `'EUR'`.
 * @returns Localized currency string (e.g. `"1.500,50 €"` in es-ES, `"€1,500.50"` in en-US).
 */
export function formatCurrency(amount: number, locale: string, currency: string = 'EUR'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}
