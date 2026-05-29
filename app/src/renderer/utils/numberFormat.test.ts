import { describe, expect, it } from 'vitest';
import {
  decimalSeparatorForLocale,
  formatCurrency,
  isValidAmountInput,
  parseLocaleAmount,
} from './numberFormat.js';

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

describe('isValidAmountInput (ES — decimalSep = ",")', () => {
  // Valid intermediate / fully-formed states under the Spanish rule.
  it.each([
    '',
    '-',
    '0',
    '1',
    '1234',
    '1331,85',
    '1331,',
    ',85',
    '-1331,85',
    '0,5',
    '999999999999', // 12-digit integer at the cap
    '999999999999,99', // integer at cap + 2 decimals
  ])('accepts %j', (v) => {
    expect(isValidAmountInput(v, ',')).toBe(true);
  });

  // Reject everything that isn't a single comma-decimal number.
  it.each([
    'a',
    '1abc',
    // Period is the wrong separator in ES — no longer accepted at input.
    '1.85',
    '1.331,85',
    '1,331.85',
    '999.999,99',
    // Multiple commas (incl. the previous "looks like thousands" forms).
    '1,,2',
    '1,2,3',
    '1,2,3,4,5',
    // More than 2 decimal digits.
    '1,234',
    '1,999',
    // Integer too long (13 digits, one past the cap).
    '1234567890123',
    // Pedro's degenerate input.
    '1.331123123213123123,85555555',
    // Stray sign.
    '1-2',
    '-1-',
  ])('rejects %j', (v) => {
    expect(isValidAmountInput(v, ',')).toBe(false);
  });
});

describe('isValidAmountInput (EN — decimalSep = ".")', () => {
  // Valid under the English rule (period decimal, no thousands grouping).
  it.each([
    '',
    '-',
    '0',
    '1',
    '1234',
    '1331.85',
    '1331.',
    '.85',
    '-1331.85',
    '0.5',
    '999999999999',
    '999999999999.99',
  ])('accepts %j', (v) => {
    expect(isValidAmountInput(v, '.')).toBe(true);
  });

  // Reject the wrong separator and any grouping / garbage.
  it.each([
    'a',
    '1abc',
    // Comma is the wrong separator in EN — no longer accepted at input.
    '1,85',
    '1,331.85',
    '1.331,85',
    '1,234,567.89',
    // Multiple dots.
    '1..2',
    '1.2.3',
    '1.2.3.4',
    // More than 2 decimal digits.
    '1.234',
    '1.999',
    // Integer too long.
    '1234567890123',
    // Pedro's degenerate input.
    '1.331123123213123123,85555555',
    // Stray sign.
    '1-2',
    '-1-',
  ])('rejects %j', (v) => {
    expect(isValidAmountInput(v, '.')).toBe(false);
  });
});

describe('decimalSeparatorForLocale', () => {
  it.each(['en', 'en-US', 'en-GB'])('returns "." for %j', (locale) => {
    expect(decimalSeparatorForLocale(locale)).toBe('.');
  });

  it.each(['es', 'es-ES', 'es-MX', 'fr', 'de', 'it', 'pt-BR'])(
    'returns "," for %j (non-English)',
    (locale) => {
      expect(decimalSeparatorForLocale(locale)).toBe(',');
    },
  );
});
