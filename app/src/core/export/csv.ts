// SPEC-027 — CSV formatting (FR10/FR11).
//
// UTF-8 BOM, `;` delimiter, RFC4180-style quoting, CRLF line endings. Text
// cells are hardened against spreadsheet formula injection (a leading `= + - @`,
// tab, CR, or LF is neutralized with a leading apostrophe). The numeric amount
// column is exempt so a legitimate negative value (e.g. `-300.00`) is preserved.

import { EXPORT_COLUMN_KEYS, exportRowCells, type ExportRow } from './types.js';

export const CSV_BOM = '\ufeff';
const DELIMITER = ';';
const CRLF = '\r\n';

const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r', '\n']);

/** Columns that hold numeric data and must NOT be formula-neutralized. */
const NUMERIC_COLUMNS = new Set<string>(['amount']);

function neutralizeFormula(value: string): string {
  if (value.length === 0) return value;
  return FORMULA_TRIGGERS.has(value[0]!) ? `'${value}` : value;
}

function quoteIfNeeded(value: string): string {
  if (/[";\r\n]/u.test(value)) {
    return `"${value.replace(/"/gu, '""')}"`;
  }
  return value;
}

/** Encode one cell. `neutralize` is false for numeric columns. */
export function encodeCsvCell(value: string, neutralize: boolean): string {
  const hardened = neutralize ? neutralizeFormula(value) : value;
  return quoteIfNeeded(hardened);
}

/** Neutralize mask aligned to EXPORT_COLUMN_KEYS order. */
const NEUTRALIZE_MASK = EXPORT_COLUMN_KEYS.map((k) => !NUMERIC_COLUMNS.has(k));

/** Encode a header row (headers are fixed safe strings — quoted only if needed). */
export function encodeCsvHeader(headers: readonly string[]): string {
  return headers.map((h) => quoteIfNeeded(h)).join(DELIMITER) + CRLF;
}

/** Encode one data row (cells already projected via exportRowCells order). */
export function encodeCsvCells(cells: readonly string[]): string {
  return cells.map((c, i) => encodeCsvCell(c, NEUTRALIZE_MASK[i] ?? true)).join(DELIMITER) + CRLF;
}

/** Encode a single ExportRow to a CSV line (incl. trailing CRLF). */
export function encodeCsvRow(row: ExportRow): string {
  return encodeCsvCells(exportRowCells(row));
}
