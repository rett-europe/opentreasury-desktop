// SPEC-027 — Export service format-preference tests.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildExportFilename } from '../../core/export/filename.js';
import type { ExportRow } from '../../core/export/types.js';
import { writeExport } from './exportService.js';

const OUT_DIR = path.join(process.cwd(), '.vitest-export-service');

const ROW: ExportRow = {
  date: '2025-03-31',
  account: 'Caja',
  category: 'Alimentación',
  subcategory: '',
  description: '=formula-like',
  amount: -1234.56,
  currency: 'EUR',
  labels: 'Comida',
  reference: '',
  comment: '',
  id: '01HZZZZZZZZZZZZZZZZZZZZZZA',
  isSplit: false,
  parentId: '',
};

async function readText(filename: string): Promise<string> {
  return fs.readFile(path.join(OUT_DIR, filename), 'utf8');
}

beforeEach(async () => {
  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });
});

afterEach(async () => {
  await fs.rm(OUT_DIR, { recursive: true, force: true });
});

describe('writeExport format preferences', () => {
  it('writes CSV content and a filename using EU/DMY preferences', async () => {
    const basename = buildExportFilename(
      'es',
      'csv',
      { dateFrom: '2025-03-01', dateTo: '2025-03-31', accountIds: [ROW.id] },
      'DMY',
    );

    await writeExport({
      rows: [ROW],
      format: 'csv',
      destPath: path.join(OUT_DIR, basename),
      locale: 'es',
      dateFormat: 'DMY',
      numberFormat: 'eu',
    });

    expect(basename).toContain('01-03-2025_31-03-2025');
    const written = await readText(basename);
    expect(written).toContain("31/03/2025;Caja;Alimentación;;'=formula-like;-1234,56;EUR");
  });

  it('writes CSV content and a filename using US/ISO preferences', async () => {
    const basename = buildExportFilename(
      'en',
      'csv',
      { dateFrom: '2025-03-01', dateTo: '2025-03-31', accountIds: [ROW.id] },
      'ISO',
    );

    await writeExport({
      rows: [ROW],
      format: 'csv',
      destPath: path.join(OUT_DIR, basename),
      locale: 'en',
      dateFormat: 'ISO',
      numberFormat: 'us',
    });

    expect(basename).toContain('2025-03-01_2025-03-31');
    const written = await readText(basename);
    expect(written).toContain("2025-03-31;Caja;Alimentación;;'=formula-like;-1234.56;EUR");
  });

  it('writes XLSX amounts as numbers and dates as real Excel dates (US/MDY preference)', async () => {
    const destPath = path.join(OUT_DIR, 'movements.xlsx');
    await writeExport({
      rows: [ROW],
      format: 'xlsx',
      destPath,
      locale: 'en',
      dateFormat: 'MDY',
      numberFormat: 'us',
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(destPath);
    const sheet = workbook.getWorksheet('Movimientos');
    expect(sheet).toBeDefined();
    const row = sheet!.getRow(2);

    // FR29 — date is a real (TZ-safe) Excel date cell; the column numFmt follows
    // the MDY preference. The cell value is numeric/Date, never a pre-formatted string.
    const dateCell = row.getCell(1);
    expect(dateCell.type).toBe(ExcelJS.ValueType.Date);
    expect((dateCell.value as Date).toISOString().slice(0, 10)).toBe('2025-03-31');
    expect(dateCell.numFmt).toBe('mm/dd/yyyy');

    const amount = row.getCell(6);
    expect(amount.type).toBe(ExcelJS.ValueType.Number);
    expect(amount.value).toBe(-1234.56);
    // Column-level, locale-neutral amount format (no [$-xx-XX] LCID modifier):
    // xlsx display separators are governed by the viewer's OS locale.
    expect(amount.numFmt).toBe('#,##0.00');
  });

  it('applies the EU/DMY preference (date numFmt dd/mm/yyyy, numeric amount)', async () => {
    const destPath = path.join(OUT_DIR, 'movements-eu.xlsx');
    await writeExport({
      rows: [ROW],
      format: 'xlsx',
      destPath,
      locale: 'es',
      dateFormat: 'DMY',
      numberFormat: 'eu',
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(destPath);
    const sheet = workbook.getWorksheet('Movimientos');
    const row = sheet!.getRow(2);

    const dateCell = row.getCell(1);
    expect(dateCell.type).toBe(ExcelJS.ValueType.Date);
    expect((dateCell.value as Date).toISOString().slice(0, 10)).toBe('2025-03-31');
    expect(dateCell.numFmt).toBe('dd/mm/yyyy');

    // Cell value stays an exact raw number; the eu/us preference drives the CSV
    // text separator, while xlsx display separators follow the viewer's OS.
    expect(row.getCell(6).value).toBe(-1234.56);
    expect(row.getCell(6).numFmt).toBe('#,##0.00');
  });
});
