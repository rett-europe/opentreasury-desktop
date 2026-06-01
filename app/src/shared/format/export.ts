// Issue #353 — Export-content formatting helpers.
//
// These produce the STRINGS written into exported files (CSV cells, XLSX date
// cells, filenames). They reuse the exact same on-screen layout decisions so a
// value looks identical in the app and in the file the user opens afterwards.
//
// NOTE: numeric XLSX cells keep a real `number` (see exportService) — these
// helpers are for the localized STRING representations only. The dot-decimal
// `formatAmount` in `core/export/types.ts` is retained for the XLSX numeric path.

import { formatDateNumeric } from './dates.js';
import { decimalSeparatorFor } from './numbers.js';
import type { DateFormat, NumberFormat } from './types.js';

/** Format an ISO date for export contents using the chosen layout. */
export function formatExportDate(iso: string, df: DateFormat): string {
  return formatDateNumeric(iso, df);
}

/**
 * Format an amount for export CONTENTS (CSV) as a fixed 2-decimal string using
 * the preference's decimal separator. Deliberately WITHOUT thousands grouping so
 * the exported value stays unambiguous and re-import-friendly: `"1234,56"` for
 * `eu`, `"1234.56"` for `us`.
 */
export function formatExportAmount(amount: number, nf: NumberFormat): string {
  const fixed = amount.toFixed(2);
  return decimalSeparatorFor(nf) === ',' ? fixed.replace('.', ',') : fixed;
}
