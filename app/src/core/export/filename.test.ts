// SPEC-027 FR12 — Locale-aware filename unit tests (Cypher).

import { describe, it, expect } from 'vitest';
import { buildExportFilename } from './filename.js';
import type { ExportFilters } from '../../shared/ipc-contracts/export.js';

const RANGE: Pick<ExportFilters, 'dateFrom' | 'dateTo'> = {
  dateFrom: '2025-01-01',
  dateTo: '2025-03-31',
};

const ACCOUNT = '01HZZZZZZZZZZZZZZZZZZZZZZA';

describe('buildExportFilename', () => {
  it('uses the Spanish movements prefix for locale es', () => {
    const name = buildExportFilename('es', 'csv', { ...RANGE, accountIds: [ACCOUNT] }, 'DMY');
    expect(name.startsWith('OpenTreasury-Movimientos-')).toBe(true);
    expect(name.endsWith('.csv')).toBe(true);
  });

  it('uses the English movements prefix for locale en', () => {
    const name = buildExportFilename('en', 'xlsx', { ...RANGE, accountIds: [ACCOUNT] }, 'ISO');
    expect(name.startsWith('OpenTreasury-Movements-')).toBe(true);
    expect(name.endsWith('.xlsx')).toBe(true);
  });

  it('embeds the date range using the chosen format with filename-safe separators', () => {
    const dmy = buildExportFilename('en', 'csv', { ...RANGE, accountIds: [ACCOUNT] }, 'DMY');
    const mdy = buildExportFilename('en', 'csv', { ...RANGE, accountIds: [ACCOUNT] }, 'MDY');
    const iso = buildExportFilename('en', 'csv', { ...RANGE, accountIds: [ACCOUNT] }, 'ISO');

    expect(dmy).toContain('01-01-2025_31-03-2025');
    expect(mdy).toContain('01-01-2025_03-31-2025');
    expect(iso).toContain('2025-01-01_2025-03-31');
  });

  it('adds a count segment per active facet', () => {
    const name = buildExportFilename(
      'es',
      'csv',
      {
        ...RANGE,
        accountIds: [ACCOUNT, ACCOUNT],
        categoryIds: [ACCOUNT],
        labels: ['Comida'],
      },
      'DMY',
    );
    expect(name).toContain('-cuenta-2');
    expect(name).toContain('-cat-1');
    expect(name).toContain('-etiqueta-1');
  });

  it('omits facet segments when only the date range is present', () => {
    const name = buildExportFilename('en', 'csv', { ...RANGE }, 'ISO');
    expect(name).toBe('OpenTreasury-Movements-2025-01-01_2025-03-31.csv');
  });

  it('strips OS-illegal characters from the stem', () => {
    const name = buildExportFilename('es', 'csv', { ...RANGE, accountIds: [ACCOUNT] }, 'DMY');
    expect(/[\\/:*?"<>|]/u.test(name.slice(0, -4))).toBe(false);
  });
});
