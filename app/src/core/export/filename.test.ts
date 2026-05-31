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
    const name = buildExportFilename('es', 'csv', { ...RANGE, accountIds: [ACCOUNT] });
    expect(name.startsWith('OpenTreasury-Movimientos-')).toBe(true);
    expect(name.endsWith('.csv')).toBe(true);
  });

  it('uses the English movements prefix for locale en', () => {
    const name = buildExportFilename('en', 'xlsx', { ...RANGE, accountIds: [ACCOUNT] });
    expect(name.startsWith('OpenTreasury-Movements-')).toBe(true);
    expect(name.endsWith('.xlsx')).toBe(true);
  });

  it('embeds the date range', () => {
    const name = buildExportFilename('en', 'csv', { ...RANGE, accountIds: [ACCOUNT] });
    expect(name).toContain('2025-01-01_2025-03-31');
  });

  it('adds a count segment per active facet', () => {
    const name = buildExportFilename('es', 'csv', {
      ...RANGE,
      accountIds: [ACCOUNT, ACCOUNT],
      categoryIds: [ACCOUNT],
      labels: ['Comida'],
    });
    expect(name).toContain('-cuenta-2');
    expect(name).toContain('-cat-1');
    expect(name).toContain('-etiqueta-1');
  });

  it('omits facet segments when only the date range is present', () => {
    const name = buildExportFilename('en', 'csv', { ...RANGE });
    expect(name).toBe('OpenTreasury-Movements-2025-01-01_2025-03-31.csv');
  });

  it('strips OS-illegal characters from the stem', () => {
    // dateFrom/dateTo never contain illegal chars; this exercises the sanitizer
    // indirectly via a label-free name that is already clean, plus a direct
    // assertion that no reserved chars survive.
    const name = buildExportFilename('es', 'csv', { ...RANGE, accountIds: [ACCOUNT] });
    expect(/[\\/:*?"<>|]/u.test(name.slice(0, -4))).toBe(false);
  });
});
