// SPEC-030 — default report filename unit tests.

import { describe, it, expect } from 'vitest';
import { buildDefaultReportFilename } from './filename.js';

describe('buildDefaultReportFilename', () => {
  it('uses an ASCII slug + year for a calendar-year report (es)', () => {
    expect(
      buildDefaultReportFilename({
        periodKind: 'calendar-year',
        periodStart: '2024-01-01',
        periodEnd: '2024-12-31',
        locale: 'es',
      }),
    ).toBe('Informe-financiero-2024.pdf');
  });

  it('uses the English title for en', () => {
    expect(
      buildDefaultReportFilename({
        periodKind: 'calendar-year',
        periodStart: '2024-01-01',
        periodEnd: '2024-12-31',
        locale: 'en',
      }),
    ).toBe('Financial-Report-2024.pdf');
  });

  it('encodes the full range for a custom range', () => {
    expect(
      buildDefaultReportFilename({
        periodKind: 'custom-range',
        periodStart: '2024-03-01',
        periodEnd: '2024-05-31',
        locale: 'en',
      }),
    ).toBe('Financial-Report-2024-03-01_2024-05-31.pdf');
  });

  it('never emits spaces or accents', () => {
    const name = buildDefaultReportFilename({
      periodKind: 'calendar-year',
      periodStart: '2024-01-01',
      periodEnd: '2024-12-31',
      locale: 'es',
    });
    expect(name).toMatch(/^[A-Za-z0-9._-]+$/u);
  });
});
