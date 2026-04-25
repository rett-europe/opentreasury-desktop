/**
 * Date formatting utilities — locale-aware date display.
 * Uses i18n language for consistent localization across the app.
 */

/**
 * Format ISO date string (YYYY-MM-DD) to locale-aware display format.
 * @param iso - ISO date string in YYYY-MM-DD format
 * @param locale - BCP 47 language tag (e.g., 'es-ES', 'en-US')
 * @returns Localized date string (e.g., "21 abr 2026" in Spanish, "Apr 21, 2026" in English)
 */
export function formatDate(iso: string, locale: string): string {
  try {
    const date = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
  } catch {
    return iso;
  }
}

/**
 * Format ISO datetime string to locale-aware date + time display.
 * @param iso - ISO 8601 datetime string
 * @param locale - BCP 47 language tag (e.g., 'es-ES', 'en-US')
 * @returns Localized datetime string with medium date and short time
 */
export function formatDateTime(iso: string, locale: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return iso;
  }
}

/**
 * Format an ISO date range (YYYY-MM-DD ... YYYY-MM-DD) to a single locale-
 * aware string used by the Movements date-filter pill, e.g. "1 abr – 25 abr 2026".
 *
 * If the formatToParts API is unavailable or the inputs are malformed,
 * falls back to "{from} – {to}".
 */
export function formatDateRange(from: string, to: string, locale: string): string {
  try {
    const fromDate = new Date(`${from}T00:00:00Z`);
    const toDate = new Date(`${to}T00:00:00Z`);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return `${from} – ${to}`;
    }
    const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
    return `${fmt.format(fromDate)} – ${fmt.format(toDate)}`;
  } catch {
    return `${from} – ${to}`;
  }
}

/**
 * Format YYYY-MM month string to locale-aware month + year display.
 * @param monthStr - Month string in YYYY-MM format
 * @param locale - BCP 47 language tag (e.g., 'es-ES', 'en-US')
 * @returns Localized month + year (e.g., "abril de 2026" in Spanish, "April 2026" in English)
 */
export function formatMonth(monthStr: string, locale: string): string {
  try {
    const parts = monthStr.split('-');
    if (parts.length !== 2) return monthStr;
    const [year, month] = parts;
    const date = new Date(parseInt(year!), parseInt(month!) - 1, 1);
    if (Number.isNaN(date.getTime())) return monthStr;
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date);
  } catch {
    return monthStr;
  }
}
