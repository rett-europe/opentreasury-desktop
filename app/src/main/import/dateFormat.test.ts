// dateFormat.test.ts — WI-17 unit tests for date format auto-detection.

import { describe, it, expect } from 'vitest';
import { detectDateFormat } from './dateFormat';

describe('detectDateFormat', () => {
  it('detects DD/MM/YYYY when day >12 in first position', () => {
    const samples = ['15/03/2024', '20/04/2024', '25/12/2024'];
    const result = detectDateFormat(samples);
    expect(result.format).toBe('DD/MM/YYYY');
    expect(result.ambiguous).toBe(false);
  });

  it('detects MM/DD/YYYY when day >12 in second position', () => {
    const samples = ['03/15/2024', '04/20/2024', '12/25/2024'];
    const result = detectDateFormat(samples);
    expect(result.format).toBe('MM/DD/YYYY');
    expect(result.ambiguous).toBe(false);
  });

  it('detects YYYY-MM-DD unambiguously', () => {
    const samples = ['2024-03-15', '2024-04-20', '2024-12-25'];
    const result = detectDateFormat(samples);
    expect(result.format).toBe('YYYY-MM-DD');
    expect(result.ambiguous).toBe(false);
  });

  it('defaults to DD/MM/YYYY when ambiguous (all components ≤12)', () => {
    const samples = ['05/03/2024', '10/11/2024', '12/01/2024'];
    const result = detectDateFormat(samples);
    expect(result.format).toBe('DD/MM/YYYY');
    expect(result.ambiguous).toBe(true);
  });

  it('handles empty sample array (returns DD/MM, ambiguous)', () => {
    const result = detectDateFormat([]);
    expect(result.format).toBe('DD/MM/YYYY');
    expect(result.ambiguous).toBe(true);
  });

  it('handles mixed separators (-, /, .)', () => {
    const samples = ['15-03-2024', '20/04/2024', '25.12.2024'];
    const result = detectDateFormat(samples);
    expect(result.format).toBe('DD/MM/YYYY');
    expect(result.ambiguous).toBe(false);
  });

  it('ignores malformed dates in sample', () => {
    const samples = ['not a date', '15/03/2024', 'abc', '20/04/2024'];
    const result = detectDateFormat(samples);
    expect(result.format).toBe('DD/MM/YYYY');
    expect(result.ambiguous).toBe(false);
  });

  it('handles whitespace in samples', () => {
    const samples = ['  15/03/2024  ', ' 20/04/2024', '25/12/2024 '];
    const result = detectDateFormat(samples);
    expect(result.format).toBe('DD/MM/YYYY');
    expect(result.ambiguous).toBe(false);
  });

  it('prioritizes ISO format even if other patterns present', () => {
    const samples = ['2024-03-15', '15/03/2024', '03/15/2024'];
    const result = detectDateFormat(samples);
    expect(result.format).toBe('YYYY-MM-DD');
    expect(result.ambiguous).toBe(false);
  });
});
