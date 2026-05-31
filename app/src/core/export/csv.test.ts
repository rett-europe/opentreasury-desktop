// SPEC-027 — CSV formatting unit tests (Cypher).
//
// Locks the FR10/FR11 wire format: UTF-8 BOM, `;` delimiter, RFC4180 quoting,
// CRLF line endings, 13-column order, and spreadsheet formula-injection
// hardening (with the numeric amount column exempt).

import { describe, it, expect } from 'vitest';
import { CSV_BOM, encodeCsvCell, encodeCsvCells, encodeCsvHeader, encodeCsvRow } from './csv.js';
import { EXPORT_COLUMN_KEYS, exportHeaders, exportRowCells, type ExportRow } from './types.js';

function sampleRow(over: Partial<ExportRow> = {}): ExportRow {
  return {
    date: '2025-01-15',
    account: 'Caja',
    category: 'Donaciones',
    subcategory: '',
    description: 'Aporte mensual',
    amount: -300,
    currency: 'EUR',
    labels: '',
    reference: '',
    comment: '',
    id: '01HZZZZZZZZZZZZZZZZZZZZZZA',
    isSplit: false,
    parentId: '',
    ...over,
  };
}

describe('encodeCsvHeader', () => {
  it('joins with `;` and ends with CRLF', () => {
    const line = encodeCsvHeader(['a', 'b', 'c']);
    expect(line).toBe('a;b;c\r\n');
  });

  it('emits exactly 13 columns for the FR11 header set', () => {
    const headers = exportHeaders('es');
    expect(headers).toHaveLength(13);
    expect(EXPORT_COLUMN_KEYS).toHaveLength(13);
    const line = encodeCsvHeader(headers);
    expect(line.trimEnd().split(';')).toHaveLength(13);
  });
});

describe('encodeCsvCell quoting (RFC4180)', () => {
  it('quotes a value containing the `;` delimiter', () => {
    expect(encodeCsvCell('a;b', false)).toBe('"a;b"');
  });

  it('quotes and doubles embedded double-quotes', () => {
    expect(encodeCsvCell('she said "hi"', false)).toBe('"she said ""hi"""');
  });

  it('quotes a value containing CR or LF', () => {
    expect(encodeCsvCell('line1\r\nline2', false)).toBe('"line1\r\nline2"');
    expect(encodeCsvCell('a\nb', false)).toBe('"a\nb"');
  });

  it('leaves a plain value and an empty value unquoted', () => {
    expect(encodeCsvCell('plain', false)).toBe('plain');
    expect(encodeCsvCell('', false)).toBe('');
  });
});

describe('encodeCsvCell formula-injection hardening', () => {
  it.each(['=HYPERLINK("http://x")', '+cmd', '@SUM(A1)', '\tlead', '\rlead', '\nlead'])(
    'neutralizes a text cell starting with a formula trigger: %j',
    (raw) => {
      const out = encodeCsvCell(raw, true);
      // A leading apostrophe is prepended (then the cell may be quoted if it
      // also contains CR/LF/`;`/quote).
      const unquoted = out.startsWith('"') ? out.slice(1, -1).replace(/""/gu, '"') : out;
      expect(unquoted.startsWith("'")).toBe(true);
    },
  );

  it('does NOT neutralize when neutralize=false (numeric amount column)', () => {
    expect(encodeCsvCell('-300.00', false)).toBe('-300.00');
  });

  it('keeps a legitimate negative amount intact through encodeCsvCells', () => {
    const cells = exportRowCells(sampleRow({ amount: -300 }));
    const line = encodeCsvCells(cells);
    // amount is the 6th column (index 5); must remain a bare negative number.
    expect(line.split(';')[5]).toBe('-300.00');
  });
});

describe('encodeCsvRow', () => {
  it('produces 13 `;`-separated fields ending in CRLF', () => {
    const line = encodeCsvRow(sampleRow());
    expect(line.endsWith('\r\n')).toBe(true);
    expect(line.trimEnd().split(';')).toHaveLength(13);
  });

  it('renders isSplit as the literal true/false', () => {
    expect(encodeCsvRow(sampleRow({ isSplit: true })).split(';')[11]).toBe('true');
    expect(encodeCsvRow(sampleRow({ isSplit: false })).split(';')[11]).toBe('false');
  });
});

describe('CSV_BOM', () => {
  it('is the UTF-8 BOM code point', () => {
    expect(CSV_BOM).toBe('\ufeff');
  });
});
