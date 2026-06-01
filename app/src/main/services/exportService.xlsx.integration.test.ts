// SPEC-027 §14 — Golden XLSX formatting integration test (§14.7 AC20–AC24, §14.8).
//
// Writes a real workbook through `writeExport` over a temp filesystem, reads it
// back with ExcelJS, and asserts the full presentation contract: frozen styled
// header (FR26), per-column width/alignment/wrap (FR27), amount number format
// (FR28), date cell TYPE + format with no ±1 drift (FR29), the `Movimientos`
// sheet name, and the workbook metadata allowlist with no PII leak (FR30). The
// metadata allowlist is checked against the raw `docProps/core.xml`.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs, readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import * as os from 'node:os';
import * as path from 'node:path';
import * as ExcelJS from 'exceljs';
import { writeExport } from './exportService.js';
import { EXPORT_COLUMN_KEYS, type ExportLocale, type ExportRow } from '../../core/export/types.js';

const DATASET_PATH = 'C:\\Users\\someone\\OneDrive\\Treasury\\dataset-01HZZZ';
const SECRET_LABEL = 'ProyectoConfidencial';
const ROW_ID = '01HTX00000000000000000001A';
const PARENT_ID = '01HTX00000000000000000009Z';

function fixtureRows(): ExportRow[] {
  return [
    {
      date: '2025-01-01',
      account: 'Cuenta corriente',
      category: 'Ingresos',
      subcategory: '',
      description: 'Nómina mensual con un texto largo que debería envolverse',
      amount: 1234.5,
      currency: 'EUR',
      labels: `${SECRET_LABEL};otra`,
      reference: 'REF-001',
      comment: 'Comentario de la transacción',
      id: ROW_ID,
      isSplit: false,
      parentId: '',
    },
    {
      date: '2024-02-29',
      account: 'Tarjeta',
      category: 'Gastos',
      subcategory: 'Comida',
      description: 'Compra',
      amount: -42.99,
      currency: 'EUR',
      labels: '',
      reference: '',
      comment: '',
      id: '01HTX00000000000000000002B',
      isSplit: true,
      parentId: PARENT_ID,
    },
  ];
}

/** Minimal central-directory zip-entry reader (avoids adding a test dep). */
function readZipEntry(buf: Buffer, name: string): string | null {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < count; k++) {
    const fnLen = buf.readUInt16LE(p + 28);
    const exLen = buf.readUInt16LE(p + 30);
    const cmLen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const fname = buf.toString('utf8', p + 46, p + 46 + fnLen);
    if (fname === name) {
      const lfn = buf.readUInt16LE(lho + 26);
      const lex = buf.readUInt16LE(lho + 28);
      const start = lho + 30 + lfn + lex;
      const csize = buf.readUInt32LE(p + 20);
      const raw = buf.subarray(start, start + csize);
      return buf.readUInt16LE(lho + 8) === 8
        ? inflateRawSync(raw).toString('utf8')
        : raw.toString('utf8');
    }
    p += 46 + fnLen + exLen + cmLen;
  }
  return null;
}

let dir: string;
let destPath: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'spec027-xlsx-'));
  destPath = path.join(dir, 'export.xlsx');
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function writeAndRead(locale: ExportLocale): Promise<ExcelJS.Workbook> {
  await writeExport({ rows: fixtureRows(), format: 'xlsx', destPath, locale });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(destPath);
  return wb;
}

describe('writeExport (XLSX) — SPEC-027 §14 presentation', () => {
  it('AC20: header row is bold white on FF6D4D8C and frozen', async () => {
    const wb = await writeAndRead('es');
    const ws = wb.getWorksheet('Movimientos')!;
    expect(ws.views?.[0]).toMatchObject({ state: 'frozen', ySplit: 1 });

    ws.getRow(1).eachCell((cell) => {
      expect(cell.font?.bold).toBe(true);
      expect(cell.font?.color?.argb).toBe('FFFFFFFF');
      expect(cell.fill).toMatchObject({
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF6D4D8C' },
      });
    });
  });

  it('AC21: each column has its fixed width, alignment and wrap', async () => {
    const wb = await writeAndRead('es');
    const ws = wb.getWorksheet('Movimientos')!;

    const expected: Record<string, { width: number; align: string; wrap: boolean }> = {
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

    EXPORT_COLUMN_KEYS.forEach((key, i) => {
      const col = ws.getColumn(i + 1);
      const exp = expected[key]!;
      expect(col.width).toBe(exp.width);
      expect(col.alignment?.horizontal).toBe(exp.align);
      // exceljs omits wrapText when false; treat undefined as not-wrapped.
      expect(Boolean(col.alignment?.wrapText)).toBe(exp.wrap);
    });
  });

  it('AC22: amount is a real number with #,##0.00 format and a plain minus', async () => {
    const wb = await writeAndRead('es');
    const ws = wb.getWorksheet('Movimientos')!;
    const amountCol = EXPORT_COLUMN_KEYS.indexOf('amount') + 1;

    const positive = ws.getRow(2).getCell(amountCol);
    expect(positive.type).toBe(ExcelJS.ValueType.Number);
    expect(positive.value).toBe(1234.5);
    expect(positive.numFmt).toBe('#,##0.00');

    const negative = ws.getRow(3).getCell(amountCol);
    expect(negative.type).toBe(ExcelJS.ValueType.Number);
    expect(negative.value).toBe(-42.99);
  });

  it('AC23: date is a real Excel date with the right day and locale format', async () => {
    const dateCol = EXPORT_COLUMN_KEYS.indexOf('date') + 1;

    const esWb = await writeAndRead('es');
    const esWs = esWb.getWorksheet('Movimientos')!;
    const esCell = esWs.getRow(2).getCell(dateCol);
    expect(esCell.type).toBe(ExcelJS.ValueType.Date);
    expect((esCell.value as Date).toISOString().slice(0, 10)).toBe('2025-01-01');
    expect(esCell.numFmt).toBe('dd/mm/yyyy');
    // Leap day round-trips with no ±1 drift.
    expect((esWs.getRow(3).getCell(dateCol).value as Date).toISOString().slice(0, 10)).toBe(
      '2024-02-29',
    );

    const enWb = await writeAndRead('en');
    const enCell = enWb.getWorksheet('Movimientos')!.getRow(2).getCell(dateCol);
    expect(enCell.type).toBe(ExcelJS.ValueType.Date);
    expect(enCell.numFmt).toBe('yyyy-mm-dd');
  });

  it('keeps the styled-header cells on General (no numFmt bleed)', async () => {
    const wb = await writeAndRead('es');
    const ws = wb.getWorksheet('Movimientos')!;
    const dateCol = EXPORT_COLUMN_KEYS.indexOf('date') + 1;
    const amountCol = EXPORT_COLUMN_KEYS.indexOf('amount') + 1;
    expect(ws.getRow(1).getCell(dateCol).numFmt).toBeFalsy();
    expect(ws.getRow(1).getCell(amountCol).numFmt).toBeFalsy();
  });

  it('AC24: metadata contains only the allowlist and leaks no PII', async () => {
    await writeExport({ rows: fixtureRows(), format: 'xlsx', destPath, locale: 'es' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(destPath);

    expect(wb.creator).toBe('OpenTreasury');
    expect(wb.title).toBe('OpenTreasury export');
    expect(wb.created).toBeInstanceOf(Date);
    // No user identity / machine name: lastModifiedBy is the generic constant
    // (exceljs always emits the field), modified is pinned to `created`.
    expect(wb.lastModifiedBy).toBe('OpenTreasury');
    expect(wb.modified?.getTime()).toBe(wb.created?.getTime());
    expect(wb.company ?? '').toBe('');
    expect(wb.manager ?? '').toBe('');
    expect(wb.keywords ?? '').toBe('');

    const core = readZipEntry(readFileSync(destPath), 'docProps/core.xml');
    expect(core).toBeTruthy();
    for (const pii of [
      DATASET_PATH,
      SECRET_LABEL,
      ROW_ID,
      PARENT_ID,
      'REF-001',
      os.userInfo().username,
    ]) {
      expect(core).not.toContain(pii);
    }
    // No description/category/keywords provenance blocks beyond the allowlist.
    expect(core).not.toContain('<dc:description>');
    expect(core).not.toContain('<cp:keywords>');
  });

  it('uses the single Movimientos sheet for both locales', async () => {
    for (const locale of ['es', 'en'] as const) {
      const wb = await writeAndRead(locale);
      expect(wb.worksheets.map((w) => w.name)).toEqual(['Movimientos']);
    }
  });
});
