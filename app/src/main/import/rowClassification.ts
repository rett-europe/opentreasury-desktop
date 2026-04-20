// Row classification — WI-18 "2-of-3 junk rule".
//
// For each raw data row we count how many of the three required fields
// (date, amount, description) are parseable. Golden rule: never silently
// drop legitimately-broken rows; only silently drop rows that look like
// trailing junk (0 or 1 parseable field).
//
// - 0 or 1 parseable → "skip"   (silent; trailing summaries, blanks, …)
// - 2 parseable      → "error"  (real row, one cell broken — surface it)
// - 3 parseable      → "import" (good row)

import { parseDate, parseAmount } from './parser.js';
import type { ColumnMapping } from '../../shared/ipc-contracts/import.js';

export type RowClassification = 'skip' | 'error' | 'import';

export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

/**
 * Classify a single raw row by counting parseable mapped fields.
 *
 * `row` is a record keyed by the column header name (as found in the
 * sheet's header row). `mapping` supplies the header names used for the
 * three required fields. Description is considered parseable when it is
 * non-empty after trimming.
 */
export function classifyRow(
  row: Record<string, unknown>,
  mapping: Pick<ColumnMapping, 'date' | 'amount' | 'description'>,
  dateFormat: DateFormat,
): RowClassification {
  let parseable = 0;

  const dateVal = row[mapping.date];
  if (parseDate(dateVal, dateFormat).success) parseable++;

  const amountVal = row[mapping.amount];
  if (parseAmount(amountVal).success) parseable++;

  const descVal = row[mapping.description];
  const descStr = descVal === null || descVal === undefined ? '' : String(descVal).trim();
  if (descStr.length > 0) parseable++;

  if (parseable <= 1) return 'skip';
  if (parseable === 2) return 'error';
  return 'import';
}
