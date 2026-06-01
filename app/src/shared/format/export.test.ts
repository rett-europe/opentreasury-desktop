// Issue #353 — Unit tests for export-content formatting helpers.
import { describe, it, expect } from 'vitest';
import { formatExportDate, formatExportAmount } from './export.js';
import { DATE_FORMATS } from './types.js';

describe('formatExportDate', () => {
  it('matches the on-screen numeric layout for each format', () => {
    expect(formatExportDate('2026-04-21', 'DMY')).toBe('21/04/2026');
    expect(formatExportDate('2026-04-21', 'MDY')).toBe('04/21/2026');
    expect(formatExportDate('2026-04-21', 'ISO')).toBe('2026-04-21');
  });

  it('is defined for every supported date format', () => {
    for (const df of DATE_FORMATS) {
      expect(typeof formatExportDate('2026-01-01', df)).toBe('string');
    }
  });
});

describe('formatExportAmount', () => {
  it('produces a fixed 2-decimal string with the preference separator and NO grouping', () => {
    expect(formatExportAmount(1234.56, 'eu')).toBe('1234,56');
    expect(formatExportAmount(1234.56, 'us')).toBe('1234.56');
  });

  it('always keeps two decimals', () => {
    expect(formatExportAmount(1234, 'eu')).toBe('1234,00');
    expect(formatExportAmount(0.5, 'us')).toBe('0.50');
    expect(formatExportAmount(-42, 'eu')).toBe('-42,00');
  });
});
