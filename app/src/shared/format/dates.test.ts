// Issue #353 — Unit tests for pure numeric date formatting/parsing.
import { describe, it, expect } from 'vitest';
import {
  formatDateNumeric,
  formatDateRangeNumeric,
  parseDateNumeric,
  placeholderFor,
  dateSeparatorFor,
} from './dates.js';
import { DATE_FORMATS, type DateFormat } from './types.js';

const ISO = '2026-04-21';

describe('formatDateNumeric', () => {
  it('renders each layout with zero-padded components', () => {
    expect(formatDateNumeric(ISO, 'DMY')).toBe('21/04/2026');
    expect(formatDateNumeric(ISO, 'MDY')).toBe('04/21/2026');
    expect(formatDateNumeric(ISO, 'ISO')).toBe('2026-04-21');
  });

  it('keeps single-digit day/month zero-padded from the ISO input', () => {
    expect(formatDateNumeric('2026-01-05', 'DMY')).toBe('05/01/2026');
    expect(formatDateNumeric('2026-01-05', 'MDY')).toBe('01/05/2026');
  });

  it('returns non-ISO input unchanged (defensive fallback)', () => {
    expect(formatDateNumeric('not-a-date', 'DMY')).toBe('not-a-date');
    expect(formatDateNumeric('', 'ISO')).toBe('');
  });
});

describe('formatDateRangeNumeric', () => {
  it('joins endpoints with an en dash in each layout', () => {
    expect(formatDateRangeNumeric('2026-04-01', '2026-04-21', 'DMY')).toBe(
      '01/04/2026 – 21/04/2026',
    );
    expect(formatDateRangeNumeric('2026-04-01', '2026-04-21', 'MDY')).toBe(
      '04/01/2026 – 04/21/2026',
    );
    expect(formatDateRangeNumeric('2026-04-01', '2026-04-21', 'ISO')).toBe(
      '2026-04-01 – 2026-04-21',
    );
  });
});

describe('parseDateNumeric', () => {
  it('round-trips format → parse for every layout', () => {
    for (const df of DATE_FORMATS) {
      const shown = formatDateNumeric(ISO, df);
      expect(parseDateNumeric(shown, df)).toBe(ISO);
    }
  });

  it('accepts non-padded day/month for DMY and MDY', () => {
    expect(parseDateNumeric('1/4/2026', 'DMY')).toBe('2026-04-01');
    expect(parseDateNumeric('4/1/2026', 'MDY')).toBe('2026-04-01');
  });

  it('rejects impossible calendar dates', () => {
    expect(parseDateNumeric('31/02/2026', 'DMY')).toBeNull();
    expect(parseDateNumeric('02/29/2025', 'MDY')).toBeNull(); // 2025 not a leap year
    expect(parseDateNumeric('2026-13-01', 'ISO')).toBeNull();
  });

  it('accepts a valid leap day', () => {
    expect(parseDateNumeric('29/02/2024', 'DMY')).toBe('2024-02-29');
  });

  it('rejects wrong-layout or malformed strings', () => {
    expect(parseDateNumeric('2026-04-21', 'DMY')).toBeNull();
    expect(parseDateNumeric('21/04/2026', 'ISO')).toBeNull();
    expect(parseDateNumeric('', 'DMY')).toBeNull();
    expect(parseDateNumeric('abc', 'MDY')).toBeNull();
  });

  it('interprets the same numeric string differently per layout', () => {
    // 04/05/2026 → April 5th (MDY) vs 4th May (DMY)
    expect(parseDateNumeric('04/05/2026', 'MDY')).toBe('2026-04-05');
    expect(parseDateNumeric('04/05/2026', 'DMY')).toBe('2026-05-04');
  });
});

describe('placeholderFor / dateSeparatorFor', () => {
  it('returns the expected placeholder', () => {
    expect(placeholderFor('DMY')).toBe('DD/MM/YYYY');
    expect(placeholderFor('MDY')).toBe('MM/DD/YYYY');
    expect(placeholderFor('ISO')).toBe('YYYY-MM-DD');
  });

  it('uses - for ISO and / otherwise', () => {
    const seps: Record<DateFormat, string> = { DMY: '/', MDY: '/', ISO: '-' };
    for (const df of DATE_FORMATS) {
      expect(dateSeparatorFor(df)).toBe(seps[df]);
    }
  });
});
