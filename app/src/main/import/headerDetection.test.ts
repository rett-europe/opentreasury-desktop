// headerDetection.test.ts — WI-18 unit tests for header-row auto-detection.

import { describe, it, expect } from 'vitest';
import { detectHeaderRow } from './headerDetection';

describe('detectHeaderRow', () => {
  it('returns 1 when the first row is already the header', () => {
    const rows = [
      ['Date', 'Amount', 'Description'],
      ['2024-01-15', '100.00', 'Coffee'],
      ['2024-01-16', '-25.50', 'Refund'],
      ['2024-01-17', '42', 'Lunch'],
    ];
    expect(detectHeaderRow(rows)).toBe(1);
  });

  it('skips a preamble and picks the real header row', () => {
    const rows = [
      ['Bank Export Report', '', ''],
      ['Account: 1234-5678', '', ''],
      ['Generated: 2024-03-01', '', ''],
      ['Date', 'Amount', 'Description'],
      ['15/03/2024', '100,00', 'Salary'],
      ['16/03/2024', '-20,50', 'Groceries'],
      ['17/03/2024', '5,00', 'Coffee'],
    ];
    expect(detectHeaderRow(rows)).toBe(4);
  });

  it('treats an all-digits first row as data, not header', () => {
    const rows = [
      ['123456', '2024-01-01', '-100'],
      ['Account', 'Date', 'Amount'],
      ['1', '2024-01-02', '50'],
      ['2', '2024-01-03', '-25'],
    ];
    expect(detectHeaderRow(rows)).toBe(2);
  });

  it('does not pick a single-cell title row', () => {
    const rows = [
      ['My Bank Statement', '', ''],
      ['', '', ''],
      ['Date', 'Amount', 'Description'],
      ['2024-01-01', '100', 'Groceries'],
      ['2024-01-02', '-25', 'Refund'],
    ];
    expect(detectHeaderRow(rows)).toBe(3);
  });

  it('handles merged metadata rows above the header', () => {
    const rows = [
      ['Customer Report', '', '', ''],
      ['Period: 01/01/2024 - 31/03/2024', '', '', ''],
      ['', '', '', ''],
      ['Trans Date', 'Value Date', 'Amount', 'Narrative'],
      ['01/01/2024', '02/01/2024', '100.00', 'Opening'],
      ['02/01/2024', '03/01/2024', '-25.00', 'ATM'],
      ['03/01/2024', '04/01/2024', '50.00', 'Transfer'],
    ];
    expect(detectHeaderRow(rows)).toBe(4);
  });

  it('falls back to row 1 when no row scores high enough', () => {
    // No row has a good follow-up of data-looking cells.
    const rows = [
      ['one', 'two', 'three'],
      ['four', 'five', 'six'],
      ['seven', 'eight', 'nine'],
    ];
    expect(detectHeaderRow(rows)).toBe(1);
  });

  it('returns 1 for an empty preview', () => {
    expect(detectHeaderRow([])).toBe(1);
  });

  it('ties go to the earliest row', () => {
    const rows = [
      ['Col A', 'Col B', 'Col C'],
      ['2024-01-01', '100', 'x'],
      ['Col A', 'Col B', 'Col C'],
      ['2024-01-02', '200', 'y'],
    ];
    expect(detectHeaderRow(rows)).toBe(1);
  });

  it('only scans up to row 20', () => {
    // Build 25 junk rows followed by an obvious header at row 21 (should be
    // ignored because we only scan rows 1..20).
    const junk: string[][] = [];
    for (let i = 0; i < 20; i++) junk.push(['x', '', '']);
    junk.push(['Date', 'Amount', 'Description']);
    junk.push(['2024-01-01', '10', 'a']);
    expect(detectHeaderRow(junk)).toBe(1);
  });
});
