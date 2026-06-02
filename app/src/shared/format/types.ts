// Issue #353 — Configurable date format & decimal separator.
//
// Shared, language-INDEPENDENT formatting preferences. This module is PURE and
// import-safe from renderer, preload, core, and main (it lives in the `shared`
// zone and imports nothing but `zod`). It is the single source of
// truth for how dates and numbers render on-screen AND in exported files, so the
// two never drift apart. Reusable by the upcoming xlsx-number/date-format spec.

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Date format
// ---------------------------------------------------------------------------

/**
 * The three supported numeric date layouts. These are deliberately decoupled
 * from the UI language — a Spanish UI can render ISO dates and an English UI can
 * render DD/MM/YYYY.
 *   - `DMY` → DD/MM/YYYY (European)
 *   - `MDY` → MM/DD/YYYY (US)
 *   - `ISO` → YYYY-MM-DD (ISO 8601)
 */
export const DATE_FORMATS = ['DMY', 'MDY', 'ISO'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];
export const dateFormatSchema = z.enum(DATE_FORMATS);

// ---------------------------------------------------------------------------
// Number format (decimal + thousands separator pair)
// ---------------------------------------------------------------------------

/**
 * The decimal/thousands separator pair, again decoupled from UI language.
 *   - `eu` → `,` decimal / `.` thousands  → `1.234,56`
 *   - `us` → `.` decimal / `,` thousands  → `1,234.56`
 */
export const NUMBER_FORMATS = ['eu', 'us'] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number];
export const numberFormatSchema = z.enum(NUMBER_FORMATS);

// ---------------------------------------------------------------------------
// Combined preference object
// ---------------------------------------------------------------------------

export interface FormatPreferences {
  readonly dateFormat: DateFormat;
  readonly numberFormat: NumberFormat;
}

export const formatPreferencesSchema = z
  .object({
    dateFormat: dateFormatSchema,
    numberFormat: numberFormatSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// First-run defaults derived from the resolved UI language
// ---------------------------------------------------------------------------

/**
 * Derive a sensible first-run default from the active UI language. Spanish (and
 * European languages generally) default to DD/MM/YYYY + `,` decimal; everything
 * else defaults to the US layout. The result is OVERRIDABLE by the user and must
 * be persisted only on explicit change (never eagerly), so language switches
 * before the user has expressed a preference still re-derive cleanly.
 *
 * @param language - A BCP 47 tag or bare language subtag (e.g. `es`, `es-ES`, `en`).
 */
export function defaultsFromLanguage(language: string | null | undefined): FormatPreferences {
  const lang = (language ?? '').toLowerCase();
  const isEuropean = lang.startsWith('es');
  return isEuropean
    ? { dateFormat: 'DMY', numberFormat: 'eu' }
    : { dateFormat: 'MDY', numberFormat: 'us' };
}
