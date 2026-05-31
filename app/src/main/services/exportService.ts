// SPEC-027 — Export file writer (main process).
//
// Streams the already-resolved ExportRows to disk in the chosen format and
// writes atomically (temp file in the SAME directory as the destination, then
// rename — never os.tmpdir, which would cross volumes and defeat atomicity and
// the dest-guard). CSV uses the shared `core/export/csv` encoder; XLSX uses the
// exceljs streaming workbook writer so we never materialise the whole sheet.
//
// The amount column is written as a real number in XLSX and as a dot-decimal
// string in CSV. All other columns are strings; text cells are protected from
// spreadsheet formula injection (CSV via the encoder, XLSX via explicit string
// cells + the same neutralization for leading formula triggers).

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
  type ExportLocale,
  type ExportRow,
} from '../../core/export/types.js';
import type { ExportFormat } from '../../shared/ipc-contracts/export.js';

const SHEET_NAME = 'Movimientos';

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
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: tmpPath, useStyles: false });
  const sheet = workbook.addWorksheet(SHEET_NAME);
  const total = params.rows.length;
  const amountIdx = EXPORT_COLUMN_KEYS.indexOf('amount');

  sheet.addRow(exportHeaders(params.locale)).commit();

  let done = 0;
  for (const row of params.rows) {
    const cells = exportRowCells(row).map((c, i) => (i === amountIdx ? c : neutralizeText(c)));
    // Amount as a real number; everything else as a string cell.
    const values = cells.map((c, i) => (i === amountIdx ? Number(formatAmount(row.amount)) : c));
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
