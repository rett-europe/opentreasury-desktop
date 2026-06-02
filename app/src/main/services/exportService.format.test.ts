// SPEC-027 §14 — XLSX formatting seam unit tests (§14.8).
//
// Covers the issue #353 preference-driven `xlsxFormatFor` helper (FR28/FR29: the
// Date column numFmt follows the chosen DMY/MDY/ISO layout; the Amount column is
// a locale-neutral `#,##0.00`) and the timezone-safe `YYYY-MM-DD` → Excel-date
// helper (FR29). The date conversion must yield the same calendar day regardless
// of the host timezone — proven here by constructing at UTC and reading back in
// UTC, re-checked under several faked `TZ` values.

import { afterEach, describe, expect, it } from 'vitest';
import { xlsxFormatFor, excelDateFromIso } from './exportService.js';

describe('xlsxFormatFor (preference-driven)', () => {
  it('maps each date layout to its Excel date numFmt', () => {
    expect(xlsxFormatFor('DMY').dateNumFmt).toBe('dd/mm/yyyy');
    expect(xlsxFormatFor('MDY').dateNumFmt).toBe('mm/dd/yyyy');
    expect(xlsxFormatFor('ISO').dateNumFmt).toBe('yyyy-mm-dd');
  });

  it('always uses a locale-neutral, thousands-grouped, two-decimal amount format', () => {
    // No currency symbol, no `[$-xx-XX]` LCID modifier, no red/parentheses markup
    // (FR28): xlsx display separators are viewer-OS-driven (see exportService note).
    for (const df of ['DMY', 'MDY', 'ISO'] as const) {
      expect(xlsxFormatFor(df).amountNumFmt).toBe('#,##0.00');
    }
  });
});

describe('excelDateFromIso (timezone-safe)', () => {
  const ORIGINAL_TZ = process.env.TZ;

  afterEach(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
  });

  it('parses a YYYY-MM-DD string to a UTC-midnight Date with no ±1 drift', () => {
    const d = excelDateFromIso('2025-01-01');
    expect(d.getTime()).toBe(Date.UTC(2025, 0, 1));
    expect(d.toISOString().slice(0, 10)).toBe('2025-01-01');
  });

  it('keeps the same calendar day under faked TZ values (UTC, UTC+13, UTC−11)', () => {
    // Constructed at UTC midnight, the serial is invariant to the host TZ. We
    // both assert the UTC day is unchanged and that the underlying epoch is
    // identical across zones (the value Excel turns into a date serial).
    const cases = ['2024-02-29', '2025-12-31', '2025-06-15'];
    for (const tz of ['UTC', 'Pacific/Kiritimati' /* UTC+13 */, 'Pacific/Midway' /* UTC−11 */]) {
      process.env.TZ = tz;
      for (const iso of cases) {
        const d = excelDateFromIso(iso);
        expect(d.toISOString().slice(0, 10)).toBe(iso);
        const [y, m, day] = iso.split('-').map(Number);
        expect(d.getTime()).toBe(Date.UTC(y!, m! - 1, day!));
      }
    }
  });

  it('handles leap day and month/day boundaries', () => {
    expect(excelDateFromIso('2024-02-29').toISOString().slice(0, 10)).toBe('2024-02-29');
    expect(excelDateFromIso('2025-03-01').toISOString().slice(0, 10)).toBe('2025-03-01');
  });
});
