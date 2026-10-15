// SPEC-027 — Export file writer (main process).
//
// Streams the already-resolved ExportRows to disk in the chosen format and
// writes atomically (temp file in the SAME directory as the destination, then
// rename — never os.tmpdir, which would cross volumes and defeat atomicity and
// the dest-guard). CSV uses the shared `core/export/csv` encoder; XLSX uses the
// exceljs streaming workbook writer so we never materialise the whole sheet.
//
// The amount and balance columns are written as real numbers in XLSX and as
// preference-formatted (eu/us) strings in CSV. The date column is a real (timezone-safe)
// Excel date in XLSX and preference-formatted (DMY/MDY/ISO) text in CSV. All
// other columns are strings; text cells are protected from spreadsheet formula
// injection (CSV via the encoder, XLSX via explicit string cells + the same
// neutralization for leading formula triggers).
//
// SPEC-027 §14 — the XLSX path applies deterministic, streaming-safe
// presentation polish (frozen styled header, fixed column widths/alignment/wrap,
// amount + date number formats, a metadata allowlist). All styling is
// column-level and configured once before the first row commit, so the per-row
// loop stays allocation-light at the 100k-row cap (NFR6).
//
// Issue #353 — the user's configurable date format (DMY/MDY/ISO) and number
// format (eu/us) drive BOTH paths via the IPC contract. CSV honors them exactly
// in the emitted text. XLSX keeps machine-readable numeric/date cells and selects
// the column-level date numFmt from the preference; the amount stays a plain
// numeric `#,##0.00` (see the cross-locale separator note below).

import { createWriteStream, promises as fs } from 'node:fs';
import * as nodePath from 'node:path';
import { once } from 'node:events';
import * as ExcelJS from 'exceljs';
import { CSV_BOM, encodeCsvCells, encodeCsvHeader } from '../../core/export/csv.js';
import {
  BALANCE_SUMMARY_COLUMN_KEYS,
  EXPORT_COLUMN_KEYS,
  balanceSummaryHeaders,
  balanceSummaryNote,
  exportHeaders,
  exportRowCells,
  formatAmount,
  type AccountBalanceSummary,
  type ExportColumnKey,
  type ExportLocale,
  type ExportRow,
} from '../../core/export/types.js';
import {
  formatExportAmount,
  formatExportDate,
  type DateFormat,
  type NumberFormat,
} from '../../shared/format/index.js';
import type { ExportFormat } from '../../shared/ipc-contracts/export.js';

const SHEET_NAME = 'Movimientos';
/** SPEC-027 §15 — per-account balance summary sheet (both locales). */
const SUMMARY_SHEET_NAME = 'Saldos';

/** Fixed, non-sensitive workbook metadata (FR30 allowlist). */
const WORKBOOK_CREATOR = 'OpenTreasury';
const WORKBOOK_TITLE = 'OpenTreasury export';

/** Header presentation (FR26). */
const HEADER_FILL_ARGB = 'FF6D4D8C';
const HEADER_FONT_ARGB = 'FFFFFFFF';

/**
 * XLSX display formats for the number/date columns (FR28/FR29), driven by the
 * user's issue #353 preferences (NOT the UI language). The preference WINS: the
 * Date column's `numFmt` follows the chosen date layout; the Amount column uses
 * a locale-neutral `#,##0.00` (see the cross-locale note below). Applied
 * column-level so the row-writing loop never adds per-cell styles (NFR6).
 */
export interface XlsxFormat {
  /** Excel number format for the Date column (column-level numFmt). */
  readonly dateNumFmt: string;
  /** Excel number format for the Amount column (column-level numFmt). */
  readonly amountNumFmt: string;
}

/** Excel Date-column `numFmt` for each configurable date layout (#353/FR29). */
const XLSX_DATE_NUM_FMT: Record<DateFormat, string> = {
  DMY: 'dd/mm/yyyy',
  MDY: 'mm/dd/yyyy',
  ISO: 'yyyy-mm-dd',
};

/** Locale-neutral two-decimal, thousands-grouped amount format (no LCID). */
const XLSX_AMOUNT_NUM_FMT = '#,##0.00';

/**
 * Resolve the XLSX column formats from the user's date/number preferences.
 *
 * The date layout maps directly to a literal Excel format code. The amount
 * format is intentionally the plain `#,##0.00` for ALL number preferences — the
 * eu/us choice cannot reliably drive xlsx display separators (see note below),
 * so it deliberately does not branch here; the preference still controls the CSV
 * text separator exactly, where it genuinely works.
 */
export function xlsxFormatFor(dateFormat: DateFormat): XlsxFormat {
  return {
    dateNumFmt: XLSX_DATE_NUM_FMT[dateFormat],
    amountNumFmt: XLSX_AMOUNT_NUM_FMT,
  };
}

// NOTE (cross-locale separators): `amountNumFmt` is a locale-NEUTRAL numeric
// format (`#,##0.00`) with no `[$-xx-XX]` LCID modifier. The `,` and `.` in the
// format code are placeholder tokens, not literal glyphs: desktop Excel renders
// the actual decimal/thousands separators from the VIEWER's OS regional
// settings, not from this format code or the export preference. So an export
// made under the EU number preference, opened on a US-locale machine, may
// display `1,234.50` rather than `1.234,50` — the stored numeric value is
// identical and exact either way; only the visual grouping/decimal glyphs follow
// the viewer. (An LCID modifier would pin the currency symbol and date
// month/day names, but NOT the numeric separators, which always defer to the
// viewer's locale.) This is a known constraint, not a bug: the CSV path honors
// the eu/us decimal separator EXACTLY in its text; the XLSX amount preserves an
// exact numeric value with viewer-driven display. Verify with a manual
// cross-locale open in Excel.

/** Per-column display geometry (FR27). Order mirrors EXPORT_COLUMN_KEYS. */
interface ColumnPresentation {
  readonly width: number;
  readonly align: 'left' | 'right' | 'center';
  readonly wrap: boolean;
}

const COLUMN_PRESENTATION: Record<ExportColumnKey, ColumnPresentation> = {
  date: { width: 12, align: 'left', wrap: false },
  account: { width: 22, align: 'left', wrap: false },
  category: { width: 18, align: 'left', wrap: false },
  subcategory: { width: 18, align: 'left', wrap: false },
  description: { width: 40, align: 'left', wrap: true },
  amount: { width: 14, align: 'right', wrap: false },
  balance: { width: 14, align: 'right', wrap: false },
  currency: { width: 8, align: 'center', wrap: false },
  labels: { width: 24, align: 'left', wrap: true },
  reference: { width: 16, align: 'left', wrap: false },
  comment: { width: 32, align: 'left', wrap: true },
  id: { width: 28, align: 'left', wrap: false },
  isSplit: { width: 9, align: 'center', wrap: false },
  parentId: { width: 28, align: 'left', wrap: false },
};

/**
 * Convert an `ExportRow.date` (`YYYY-MM-DD`) to a real, timezone-safe Excel date
 * value. The Date is constructed at UTC midnight so exceljs's getTime()-based
 * serial conversion yields exactly the integer day serial — the displayed
 * calendar day can never drift by ±1 regardless of the host timezone (FR29).
 */
export function excelDateFromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map((p) => Number(p));
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
}

/** Mirrors the CSV encoder's formula-injection neutralization for XLSX text. */
const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r', '\n']);
function neutralizeText(value: string): string {
  if (value.length === 0) return value;
  return FORMULA_TRIGGERS.has(value[0]!) ? `'${value}` : value;
}

export interface WriteExportParams {
  readonly rows: readonly ExportRow[];
  /**
   * SPEC-027 §15 — per-account balances for the exported date range. Written
   * as the `Saldos` sheet in XLSX; CSV (single table) carries only the per-row
   * `Saldo` column.
   */
  readonly summary: {
    readonly dateFrom: string;
    readonly dateTo: string;
    readonly accounts: readonly AccountBalanceSummary[];
  };
  readonly format: ExportFormat;
  readonly destPath: string;
  readonly locale: ExportLocale;
  readonly dateFormat: DateFormat;
  readonly numberFormat: NumberFormat;
  /** Called as rows are written. The caller throttles emission to the renderer. */
  readonly onProgress?: (rowsDone: number, rowsTotal: number) => void;
}

function tempPathFor(destPath: string): string {
  const dir = nodePath.dirname(destPath);
  const base = nodePath.basename(destPath);
  return nodePath.join(dir, `.${base}.${process.pid}.${Date.now()}.partial`);
}

async function writeCsv(params: WriteExportParams, tmpPath: string): Promise<void> {
  const stream = createWriteStream(tmpPath, { mode: 0o600 });
  const total = params.rows.length;
  const dateIdx = EXPORT_COLUMN_KEYS.indexOf('date');
  const amountIdx = EXPORT_COLUMN_KEYS.indexOf('amount');
  const balanceIdx = EXPORT_COLUMN_KEYS.indexOf('balance');
  try {
    const write = (chunk: string): Promise<void> | void => {
      if (!stream.write(chunk)) return once(stream, 'drain').then(() => undefined);
    };
    await write(CSV_BOM + encodeCsvHeader(exportHeaders(params.locale)));
    let done = 0;
    for (const row of params.rows) {
      const cells = exportRowCells(row);
      cells[dateIdx] = formatExportDate(row.date, params.dateFormat);
      cells[amountIdx] = formatExportAmount(row.amount, params.numberFormat);
      cells[balanceIdx] = formatExportAmount(row.balance, params.numberFormat);
      await write(encodeCsvCells(cells));
      done += 1;
      params.onProgress?.(done, total);
    }
    await new Promise<void>((resolve, reject) => {
      stream.end((err?: Error | null) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    stream.destroy();
    throw err;
  }
}

async function writeXlsx(params: WriteExportParams, tmpPath: string): Promise<void> {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: tmpPath, useStyles: true });

  // FR30 — metadata allowlist. Set only the three non-sensitive properties and
  // neutralize the defaults exceljs would otherwise emit (`lastModifiedBy` and
  // `modified` default to 'ExcelJS' / `created`). Never leak paths, ids,
  // identity, filters or labels into any workbook property.
  workbook.creator = WORKBOOK_CREATOR;
  workbook.title = WORKBOOK_TITLE;
  workbook.created = new Date();
  workbook.lastModifiedBy = WORKBOOK_CREATOR;
  workbook.modified = workbook.created;

  // FR26 — frozen header. Views are an early worksheet element under the
  // streaming writer, so they must be supplied at construction time.
  const sheet = workbook.addWorksheet(SHEET_NAME, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // Issue #353 — column formats follow the user's date preference (the amount
  // format is preference-independent for xlsx display; see XlsxFormat note).
  const fmt = xlsxFormatFor(params.dateFormat);
  const amountIdx = EXPORT_COLUMN_KEYS.indexOf('amount');
  const balanceIdx = EXPORT_COLUMN_KEYS.indexOf('balance');
  const dateIdx = EXPORT_COLUMN_KEYS.indexOf('date');

  // FR27/FR28/FR29 — all styling is configured ONCE, column-level, before the
  // first row is committed (NFR6). The per-row loop adds no per-cell styles.
  sheet.columns = EXPORT_COLUMN_KEYS.map((key) => {
    const p = COLUMN_PRESENTATION[key];
    const column: Partial<ExcelJS.Column> = {
      width: p.width,
      style: { alignment: { horizontal: p.align, wrapText: p.wrap } },
    };
    if (key === 'amount' || key === 'balance') column.style!.numFmt = fmt.amountNumFmt;
    if (key === 'date') column.style!.numFmt = fmt.dateNumFmt;
    return column;
  });

  // FR26 — styled header row (one-time). The column-level numFmt would otherwise
  // bleed onto the string header cells of the date/amount columns, so reset them.
  const headerRow = sheet.addRow(exportHeaders(params.locale));
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FONT_ARGB } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL_ARGB } };
  });
  headerRow.getCell(dateIdx + 1).numFmt = 'General';
  headerRow.getCell(amountIdx + 1).numFmt = 'General';
  headerRow.getCell(balanceIdx + 1).numFmt = 'General';
  headerRow.commit();

  const total = params.rows.length;
  let done = 0;
  for (const row of params.rows) {
    const cells = exportRowCells(row).map((c, i) =>
      i === amountIdx || i === balanceIdx ? c : neutralizeText(c),
    );
    // Amount/balance as real numbers, Date as a real (TZ-safe) date cell, the
    // rest as neutralized string cells. No per-cell styling here (NFR6) — the
    // column-level numFmt set above governs the amount/date display.
    const values = cells.map((c, i) => {
      if (i === amountIdx) return Number(formatAmount(row.amount));
      if (i === balanceIdx) return Number(formatAmount(row.balance));
      if (i === dateIdx) return excelDateFromIso(row.date);
      return c;
    });
    sheet.addRow(values).commit();
    done += 1;
    params.onProgress?.(done, total);
  }

  sheet.commit();
  writeSummarySheet(workbook, params, fmt);
  await workbook.commit();
}

/**
 * SPEC-027 §15 — `Saldos` sheet: one line per exported account with opening,
 * money in, money out and closing balance for the date range, plus a short
 * note telling the reader to tie the closing balance out against the bank.
 */
function writeSummarySheet(
  workbook: ExcelJS.stream.xlsx.WorkbookWriter,
  params: WriteExportParams,
  fmt: XlsxFormat,
): void {
  const sheet = workbook.addWorksheet(SUMMARY_SHEET_NAME, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = BALANCE_SUMMARY_COLUMN_KEYS.map((key) => {
    if (key === 'account') {
      return { width: 30, style: { alignment: { horizontal: 'left' } } };
    }
    if (key === 'movementCount') {
      return { width: 14, style: { alignment: { horizontal: 'right' } } };
    }
    return {
      width: 16,
      style: { alignment: { horizontal: 'right' }, numFmt: fmt.amountNumFmt },
    };
  });

  const headerRow = sheet.addRow(balanceSummaryHeaders(params.locale));
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FONT_ARGB } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL_ARGB } };
    cell.numFmt = 'General';
  });
  headerRow.commit();

  for (const acc of params.summary.accounts) {
    sheet
      .addRow([
        neutralizeText(acc.account),
        Number(formatAmount(acc.opening)),
        Number(formatAmount(acc.moneyIn)),
        Number(formatAmount(acc.moneyOut)),
        Number(formatAmount(acc.closing)),
        acc.movementCount,
      ])
      .commit();
  }

  sheet.addRow([]).commit();
  const note = balanceSummaryNote(
    params.locale,
    formatExportDate(params.summary.dateFrom, params.dateFormat),
    formatExportDate(params.summary.dateTo, params.dateFormat),
  );
  for (const line of note) {
    const noteRow = sheet.addRow([line]);
    noteRow.getCell(1).font = { italic: true };
    noteRow.getCell(1).alignment = { horizontal: 'left', wrapText: false };
    noteRow.commit();
  }

  sheet.commit();
}

/**
 * Write the export to `destPath` atomically. On any failure the partial temp
 * file is removed and the error is re-thrown (the caller records a `failed`
 * audit entry and maps to `EXPORT_WRITE_FAILED`).
 */
export async function writeExport(params: WriteExportParams): Promise<void> {
  const tmpPath = tempPathFor(params.destPath);
  try {
    if (params.format === 'csv') {
      await writeCsv(params, tmpPath);
    } else {
      await writeXlsx(params, tmpPath);
    }
    await fs.rename(tmpPath, params.destPath);
  } catch (err) {
    await fs.rm(tmpPath, { force: true }).catch(() => undefined);
    throw err;
  }
}
