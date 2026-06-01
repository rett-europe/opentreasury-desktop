// SPEC-027 — Export file writer (main process).
//
// Streams the already-resolved ExportRows to disk in the chosen format and
// writes atomically (temp file in the SAME directory as the destination, then
// rename — never os.tmpdir, which would cross volumes and defeat atomicity and
// the dest-guard). CSV uses the shared `core/export/csv` encoder; XLSX uses the
// exceljs streaming workbook writer so we never materialise the whole sheet.
//
// The amount column is written as a real number in XLSX and as a dot-decimal
// string in CSV. The date column is a real (timezone-safe) Excel date in XLSX
// and ISO text in CSV. All other columns are strings; text cells are protected
// from spreadsheet formula injection (CSV via the encoder, XLSX via explicit
// string cells + the same neutralization for leading formula triggers).
//
// SPEC-027 §14 — the XLSX path applies deterministic, streaming-safe
// presentation polish (frozen styled header, fixed column widths/alignment/wrap,
// amount + date number formats, a metadata allowlist). All styling is
// column-level and configured once before the first row commit, so the per-row
// loop stays allocation-light at the 100k-row cap (NFR6). CSV is unchanged.

import { createWriteStream, promises as fs } from 'node:fs';
import * as nodePath from 'node:path';
import { once } from 'node:events';
import * as ExcelJS from 'exceljs';
import { CSV_BOM, encodeCsvCells, encodeCsvHeader } from '../../core/export/csv.js';
import {
  EXPORT_COLUMN_KEYS,
  exportHeaders,
  exportRowCells,
  formatAmount,
  type ExportColumnKey,
  type ExportLocale,
  type ExportRow,
} from '../../core/export/types.js';
import type { ExportFormat } from '../../shared/ipc-contracts/export.js';

const SHEET_NAME = 'Movimientos';

/** Fixed, non-sensitive workbook metadata (FR30 allowlist). */
const WORKBOOK_CREATOR = 'OpenTreasury';
const WORKBOOK_TITLE = 'OpenTreasury export';

/** Header presentation (FR26). */
const HEADER_FILL_ARGB = 'FF6D4D8C';
const HEADER_FONT_ARGB = 'FFFFFFFF';

/**
 * Per-locale display formats for the XLSX number/date columns (FR28/FR29).
 *
 * This is the single seam through which issue #353 (user-configurable date and
 * decimal/thousands preference) will later inject the user's choice WITHOUT
 * touching the row-writing loop. Until then it supplies the locale-driven
 * defaults. The CSV path stays locale-independent (dot decimal) per FR22 and is
 * unaffected by this map.
 */
export interface XlsxFormat {
  /** Excel number format for the Date column (column-level numFmt). */
  readonly dateNumFmt: string;
  /** Excel number format for the Amount column (column-level numFmt). */
  readonly amountNumFmt: string;
}

export const DEFAULT_XLSX_FORMAT: Record<ExportLocale, XlsxFormat> = {
  es: { dateNumFmt: 'dd/mm/yyyy', amountNumFmt: '#,##0.00' },
  en: { dateNumFmt: 'yyyy-mm-dd', amountNumFmt: '#,##0.00' },
};

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
  readonly format: ExportFormat;
  readonly destPath: string;
  readonly locale: ExportLocale;
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
  try {
    const write = (chunk: string): Promise<void> | void => {
      if (!stream.write(chunk)) return once(stream, 'drain').then(() => undefined);
    };
    await write(CSV_BOM + encodeCsvHeader(exportHeaders(params.locale)));
    let done = 0;
    for (const row of params.rows) {
      await write(encodeCsvCells(exportRowCells(row)));
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

  const fmt = DEFAULT_XLSX_FORMAT[params.locale];
  const amountIdx = EXPORT_COLUMN_KEYS.indexOf('amount');
  const dateIdx = EXPORT_COLUMN_KEYS.indexOf('date');

  // FR27/FR28/FR29 — all styling is configured ONCE, column-level, before the
  // first row is committed (NFR6). The per-row loop adds no per-cell styles.
  sheet.columns = EXPORT_COLUMN_KEYS.map((key) => {
    const p = COLUMN_PRESENTATION[key];
    const column: Partial<ExcelJS.Column> = {
      width: p.width,
      style: { alignment: { horizontal: p.align, wrapText: p.wrap } },
    };
    if (key === 'amount') column.style!.numFmt = fmt.amountNumFmt;
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
  headerRow.commit();

  const total = params.rows.length;
  let done = 0;
  for (const row of params.rows) {
    const cells = exportRowCells(row).map((c, i) => (i === amountIdx ? c : neutralizeText(c)));
    // Amount as a real number, Date as a real (TZ-safe) date cell, the rest as
    // neutralized string cells. No per-cell styling here (NFR6).
    const values = cells.map((c, i) => {
      if (i === amountIdx) return Number(formatAmount(row.amount));
      if (i === dateIdx) return excelDateFromIso(row.date);
      return c;
    });
    sheet.addRow(values).commit();
    done += 1;
    params.onProgress?.(done, total);
  }

  sheet.commit();
  await workbook.commit();
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
