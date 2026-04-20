// rowClassification.test.ts — WI-18 unit tests for 2-of-3 junk rule.

import { describe, it, expect } from 'vitest';
import { classifyRow } from './rowClassification';

const mapping = { date: 'Date', amount: 'Amount', description: 'Description' };

describe('classifyRow', () => {
  it('returns "skip" when zero fields are parseable', () => {
    const row = { Date: '', Amount: '', Description: '' };
    expect(classifyRow(row, mapping, 'DD/MM/YYYY')).toBe('skip');
  });

  it('returns "skip" when only one field is parseable (description only)', () => {
    const row = { Date: 'not-a-date', Amount: 'xxx', Description: 'Trailing summary' };
    expect(classifyRow(row, mapping, 'DD/MM/YYYY')).toBe('skip');
  });

  it('returns "skip" when only date is parseable', () => {
    const row = { Date: '15/03/2024', Amount: 'n/a', Description: '' };
    expect(classifyRow(row, mapping, 'DD/MM/YYYY')).toBe('skip');
  });

  it('returns "error" when exactly two fields are parseable', () => {
    const row = { Date: '15/03/2024', Amount: '100,00', Description: '' };
    expect(classifyRow(row, mapping, 'DD/MM/YYYY')).toBe('error');
  });

  it('returns "error" when date broken but amount+description ok', () => {
    const row = { Date: 'bad', Amount: '100.00', Description: 'Coffee' };
    expect(classifyRow(row, mapping, 'DD/MM/YYYY')).toBe('error');
  });

  it('returns "import" when all three fields are parseable', () => {
    const row = { Date: '15/03/2024', Amount: '100,00', Description: 'Salary' };
    expect(classifyRow(row, mapping, 'DD/MM/YYYY')).toBe('import');
  });

  it('respects the date format preference', () => {
    const row = { Date: '03/15/2024', Amount: '100', Description: 'x' };
    expect(classifyRow(row, mapping, 'MM/DD/YYYY')).toBe('import');
    // With DD/MM preference the same string is invalid (month 15).
    expect(classifyRow(row, mapping, 'DD/MM/YYYY')).toBe('error');
  });

  it('treats whitespace-only description as not parseable', () => {
    const row = { Date: '15/03/2024', Amount: '100', Description: '   ' };
    expect(classifyRow(row, mapping, 'DD/MM/YYYY')).toBe('error');
  });

  it('handles missing keys as empty', () => {
    const row: Record<string, unknown> = {};
    expect(classifyRow(row, mapping, 'DD/MM/YYYY')).toBe('skip');
  });
});
