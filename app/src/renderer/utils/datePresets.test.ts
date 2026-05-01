import { describe, expect, it } from 'vitest';
import {
  DATE_PRESET_IDS,
  getPresetRange,
  last12Months,
  last3Months,
  last30Days,
  lastMonth,
  lastYear,
  thisMonth,
  thisYear,
} from './datePresets.js';

// Pinned reference date: Saturday, 25 April 2026.
const REF = new Date('2026-04-25T12:00:00Z');

describe('datePresets', () => {
  it('thisMonth: from 1st of current month → today', () => {
    expect(thisMonth(REF)).toEqual({ from: '2026-04-01', to: '2026-04-25' });
  });

  it('lastMonth: full previous calendar month', () => {
    expect(lastMonth(REF)).toEqual({ from: '2026-03-01', to: '2026-03-31' });
  });

  it('lastMonth: handles January → previous December', () => {
    const jan = new Date('2026-01-15T00:00:00Z');
    expect(lastMonth(jan)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('lastMonth: handles March 1st (Feb leap year boundary)', () => {
    const mar = new Date('2024-03-01T00:00:00Z');
    expect(lastMonth(mar)).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  });

  it('last3Months: rolling 90 days ending today (inclusive)', () => {
    // 2026-04-25 minus 89 days = 2026-01-26
    expect(last3Months(REF)).toEqual({ from: '2026-01-26', to: '2026-04-25' });
  });

  it('thisYear: Jan 1 of calendar year → today', () => {
    expect(thisYear(REF)).toEqual({ from: '2026-01-01', to: '2026-04-25' });
  });

  it('lastYear: full previous calendar year', () => {
    expect(lastYear(REF)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });

  it('last12Months: trailing 12 months ending today', () => {
    // From 2025-04-26 (one year ago + 1 day) through 2026-04-25.
    expect(last12Months(REF)).toEqual({ from: '2025-04-26', to: '2026-04-25' });
  });

  it('last12Months: handles Feb 29 → non-leap-year rollover', () => {
    const feb29 = new Date('2024-02-29T00:00:00Z');
    // setUTCFullYear collapses Feb 29 → Mar 1 in 2023, then +1 day = Mar 2.
    // Acceptable convention; the trailing 12 months still ends today.
    expect(last12Months(feb29)).toEqual({ from: '2023-03-02', to: '2024-02-29' });
  });

  it('last30Days: rolling 30 days ending today (inclusive)', () => {
    // 2026-04-25 minus 29 days = 2026-03-27 (30 days total: Mar 27 through Apr 25)
    expect(last30Days(REF)).toEqual({ from: '2026-03-27', to: '2026-04-25' });
  });

  it('last30Days: handles month boundaries correctly', () => {
    const may1 = new Date('2026-05-01T00:00:00Z');
    // May 1 minus 29 days = Apr 2 (30 days: Apr 2 through May 1)
    expect(last30Days(may1)).toEqual({ from: '2026-04-02', to: '2026-05-01' });
  });

  it('getPresetRange dispatches by id', () => {
    expect(getPresetRange('this-month', REF)).toEqual({ from: '2026-04-01', to: '2026-04-25' });
    expect(getPresetRange('last-year', REF)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(getPresetRange('last-30-days', REF)).toEqual({ from: '2026-03-27', to: '2026-04-25' });
  });

  it('exposes all preset ids in declaration order', () => {
    expect(DATE_PRESET_IDS).toEqual([
      'this-month',
      'last-month',
      'last-3-months',
      'this-year',
      'last-year',
      'last-12-months',
      'last-30-days',
    ]);
  });
});
