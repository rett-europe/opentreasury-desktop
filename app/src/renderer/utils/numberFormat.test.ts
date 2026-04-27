import { describe, expect, it } from 'vitest';
import { formatCurrency, parseLocaleAmount } from './numberFormat.js';

describe('formatCurrency', () => {
  it('formats EUR in es-ES with comma decimal and trailing euro symbol', () => {
    const out = formatCurrency(1500.5, 'es-ES');
    expect(out).toContain('1.500,50');
    expect(out).toContain('€');
    // Symbol trails the amount in es-ES formatting.
    expect(out.indexOf('€')).toBeGreaterThan(out.indexOf('1.500,50'));
  });

  it('groups thousands in es-ES even for 4-digit amounts (useGrouping: always)', () => {
    // Without `useGrouping: 'always'`, Spanish CLDR suppresses grouping below
    // 10.000 — producing "1500,50 €" instead of the expected "1.500,50 €".
    expect(formatCurrency(1500.5, 'es-ES')).toContain('1.500,50');
    expect(formatCurrency(27549.56, 'es-ES')).toContain('27.549,56');
  });

  it('formats EUR in en-US with leading symbol and period decimal', () => {
    const out = formatCurrency(1500.5, 'en-US');
    expect(out).toContain('€');
    expect(out).toContain('1,500.50');
  });

  it('formats negative values with a leading minus sign', () => {
    const out = formatCurrency(-250.75, 'en-US');
    expect(out.startsWith('-')).toBe(true);
    expect(out).toContain('250.75');
  });
});

describe('parseLocaleAmount', () => {
  it('parses Spanish-style decimals (comma)', () => {
    expect(parseLocaleAmount('300,50')).toBe(300.5);
  });

  it('parses English-style decimals (period)', () => {
    expect(parseLocaleAmount('300.50')).toBe(300.5);
  });

  it('parses Spanish thousands separator with comma decimal', () => {
    expect(parseLocaleAmount('1.234,56')).toBe(1234.56);
  });

  it('parses English thousands separator with period decimal', () => {
    expect(parseLocaleAmount('1,234.56')).toBe(1234.56);
  });

  it('parses bare integers', () => {
    expect(parseLocaleAmount('1234')).toBe(1234);
  });

  it('returns NaN for non-numeric input', () => {
    expect(parseLocaleAmount('abc')).toBeNaN();
  });

  it('returns NaN for empty string', () => {
    expect(parseLocaleAmount('')).toBeNaN();
  });

  it('returns NaN for whitespace-only input', () => {
    expect(parseLocaleAmount('   ')).toBeNaN();
  });

  it('handles negative values with comma decimal', () => {
    expect(parseLocaleAmount('-300,50')).toBe(-300.5);
  });

  it('trims surrounding whitespace', () => {
    expect(parseLocaleAmount('  42,5  ')).toBe(42.5);
  });
});
