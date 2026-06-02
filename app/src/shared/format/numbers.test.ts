// Issue #353 — Unit tests for preference-driven number formatting/parsing.
import { describe, it, expect } from 'vitest';
import {
  decimalSeparatorFor,
  thousandsSeparatorFor,
  formatNumber,
  parseAmount,
  isValidAmountInput,
  formatAmountForInput,
} from './numbers.js';

describe('separator glyphs', () => {
  it('maps eu/us to the correct decimal and thousands glyphs', () => {
    expect(decimalSeparatorFor('eu')).toBe(',');
    expect(decimalSeparatorFor('us')).toBe('.');
    expect(thousandsSeparatorFor('eu')).toBe('.');
    expect(thousandsSeparatorFor('us')).toBe(',');
  });
});

describe('formatNumber (decimal style)', () => {
  it('applies preference separators regardless of UI locale', () => {
    const opts = {
      uiLocale: 'en-US',
      useGrouping: 'always' as const,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    };
    expect(formatNumber(1234.56, { nf: 'eu', ...opts })).toBe('1.234,56');
    expect(formatNumber(1234.56, { nf: 'us', ...opts })).toBe('1,234.56');
  });

  it('is independent of the UI language for separators (es UI + us format)', () => {
    const eu = formatNumber(1234.56, {
      nf: 'eu',
      uiLocale: 'es-ES',
      useGrouping: 'always',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const us = formatNumber(1234.56, {
      nf: 'us',
      uiLocale: 'es-ES',
      useGrouping: 'always',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    expect(eu).toBe('1.234,56');
    expect(us).toBe('1,234.56');
  });

  it('formats currency with preference separators and keeps the symbol', () => {
    const out = formatNumber(1234.5, {
      nf: 'eu',
      uiLocale: 'es-ES',
      style: 'currency',
      currency: 'EUR',
      useGrouping: 'always',
    });
    expect(out).toContain('€');
    expect(out).toContain('1.234,50');
  });

  it('formats percent values with preference separators', () => {
    const out = formatNumber(0.1234, {
      nf: 'eu',
      uiLocale: 'en-US',
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    expect(out).toContain('12,34');
    expect(out).toContain('%');
  });
});

describe('parseAmount (strict, preference-bound)', () => {
  it('parses eu-formatted strings', () => {
    expect(parseAmount('1.234,56', 'eu')).toBe(1234.56);
    expect(parseAmount('0,99', 'eu')).toBe(0.99);
    expect(parseAmount('-42,5', 'eu')).toBe(-42.5);
  });

  it('parses us-formatted strings', () => {
    expect(parseAmount('1,234.56', 'us')).toBe(1234.56);
    expect(parseAmount('0.99', 'us')).toBe(0.99);
    expect(parseAmount('-42.5', 'us')).toBe(-42.5);
  });

  it('round-trips formatAmountForInput → parseAmount', () => {
    for (const nf of ['eu', 'us'] as const) {
      const s = formatAmountForInput(1234.56, nf);
      expect(parseAmount(s, nf)).toBe(1234.56);
    }
  });

  it('rejects junk and ambiguous separators (NaN, not a silent truncation)', () => {
    expect(parseAmount('12abc', 'us')).toBeNaN();
    expect(parseAmount('1.2.3', 'us')).toBeNaN(); // two decimal points
    expect(parseAmount('1,23,45', 'eu')).toBeNaN(); // two decimal commas
    expect(parseAmount('', 'eu')).toBeNaN();
    expect(parseAmount('   ', 'us')).toBeNaN();
  });

  it('treats the non-decimal glyph strictly as a thousands separator', () => {
    // In eu, '.' is the thousands separator → stripped.
    expect(parseAmount('1.234', 'eu')).toBe(1234);
    // In us, ',' is the thousands separator → stripped.
    expect(parseAmount('1,234', 'us')).toBe(1234);
  });
});

describe('isValidAmountInput (per preference)', () => {
  it('accepts intermediate states', () => {
    expect(isValidAmountInput('', 'eu')).toBe(true);
    expect(isValidAmountInput('-', 'us')).toBe(true);
  });

  it('accepts the preference decimal separator only', () => {
    expect(isValidAmountInput('12,5', 'eu')).toBe(true);
    expect(isValidAmountInput('12.5', 'eu')).toBe(false);
    expect(isValidAmountInput('12.5', 'us')).toBe(true);
    expect(isValidAmountInput('12,5', 'us')).toBe(false);
  });

  it('rejects thousands separators at input time', () => {
    expect(isValidAmountInput('1.234', 'eu')).toBe(false);
    expect(isValidAmountInput('1,234', 'us')).toBe(false);
  });

  it('caps decimals at 2', () => {
    expect(isValidAmountInput('12,55', 'eu')).toBe(true);
    expect(isValidAmountInput('12,555', 'eu')).toBe(false);
  });
});

describe('formatAmountForInput', () => {
  it('uses the preference decimal separator and no grouping', () => {
    expect(formatAmountForInput(423.89, 'eu')).toBe('423,89');
    expect(formatAmountForInput(423.89, 'us')).toBe('423.89');
    expect(formatAmountForInput(1234.5, 'eu')).toBe('1234,5');
  });

  it('returns empty string for non-finite input', () => {
    expect(formatAmountForInput(Number.NaN, 'eu')).toBe('');
    expect(formatAmountForInput(Number.POSITIVE_INFINITY, 'us')).toBe('');
  });
});
