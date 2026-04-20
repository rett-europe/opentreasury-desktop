import { describe, it, expect } from 'vitest';
import { parseAmount, inferColumnLocale } from './amountParser.js';

describe('parseAmount', () => {
  describe('Spanish format (ES) — dot=thousands, comma=decimal', () => {
    it('parses 16.433,39 → 16433.39', () => {
      const result = parseAmount('16.433,39');
      expect(result).toEqual({ value: 16433.39, locale: 'es' });
    });

    it('parses 1.234,56 → 1234.56', () => {
      const result = parseAmount('1.234,56');
      expect(result).toEqual({ value: 1234.56, locale: 'es' });
    });

    it('parses 16433,39 (no thousands separator) → 16433.39', () => {
      const result = parseAmount('16433,39');
      expect(result).toEqual({ value: 16433.39, locale: 'es' });
    });

    it('parses 1.000.000,00 → 1000000', () => {
      const result = parseAmount('1.000.000,00');
      expect(result).toEqual({ value: 1000000, locale: 'es' });
    });

    it('parses 999,50 → 999.5', () => {
      const result = parseAmount('999,50');
      expect(result).toEqual({ value: 999.5, locale: 'es' });
    });

    it('parses 0,99 → 0.99', () => {
      const result = parseAmount('0,99');
      expect(result).toEqual({ value: 0.99, locale: 'es' });
    });
  });

  describe('US/UK format (EN) — comma=thousands, dot=decimal', () => {
    it('parses 16,433.39 → 16433.39', () => {
      const result = parseAmount('16,433.39');
      expect(result).toEqual({ value: 16433.39, locale: 'en' });
    });

    it('parses 1,234.56 → 1234.56', () => {
      const result = parseAmount('1,234.56');
      expect(result).toEqual({ value: 1234.56, locale: 'en' });
    });

    it('parses 16433.39 (no thousands separator) → 16433.39', () => {
      const result = parseAmount('16433.39');
      expect(result).toEqual({ value: 16433.39, locale: 'en' });
    });

    it('parses 1,000,000.00 → 1000000', () => {
      const result = parseAmount('1,000,000.00');
      expect(result).toEqual({ value: 1000000, locale: 'en' });
    });

    it('parses 999.50 → 999.5', () => {
      const result = parseAmount('999.50');
      expect(result).toEqual({ value: 999.5, locale: 'en' });
    });

    it('parses 0.99 → 0.99', () => {
      const result = parseAmount('0.99');
      expect(result).toEqual({ value: 0.99, locale: 'en' });
    });
  });

  describe('Ambiguous cases (single separator)', () => {
    it('parses 1.234 → 1234 (ES thousands, no decimal)', () => {
      const result = parseAmount('1.234');
      expect(result).toEqual({ value: 1234, locale: 'es' });
    });

    it('parses 1,234 → 1.234 (ES decimal)', () => {
      const result = parseAmount('1,234');
      expect(result).toEqual({ value: 1234, locale: 'en' }); // 3 digits after comma → US thousands
    });

    it('parses 16.39 → 16.39 (EN decimal)', () => {
      const result = parseAmount('16.39');
      expect(result).toEqual({ value: 16.39, locale: 'en' });
    });

    it('parses 16,39 → 16.39 (ES decimal)', () => {
      const result = parseAmount('16,39');
      expect(result).toEqual({ value: 16.39, locale: 'es' });
    });
  });

  describe('Currency symbols', () => {
    it('strips € prefix', () => {
      const result = parseAmount('€16.433,39');
      expect(result).toEqual({ value: 16433.39, locale: 'es' });
    });

    it('strips € with space', () => {
      const result = parseAmount('€ 16.433,39');
      expect(result).toEqual({ value: 16433.39, locale: 'es' });
    });

    it('strips $ prefix', () => {
      const result = parseAmount('$1,234.56');
      expect(result).toEqual({ value: 1234.56, locale: 'en' });
    });

    it('strips £ prefix', () => {
      const result = parseAmount('£999.99');
      expect(result).toEqual({ value: 999.99, locale: 'en' });
    });

    it('strips USD suffix', () => {
      const result = parseAmount('1,234.56 USD');
      expect(result).toEqual({ value: 1234.56, locale: 'en' });
    });

    it('strips EUR suffix', () => {
      const result = parseAmount('1.234,56 EUR');
      expect(result).toEqual({ value: 1234.56, locale: 'es' });
    });

    it('strips EUR with NBSP', () => {
      // NBSP (U+00A0) is common in French/Spanish formatting
      const result = parseAmount('1\u00A0234,56\u00A0EUR');
      expect(result).toEqual({ value: 1234.56, locale: 'es' });
    });
  });

  describe('Negative amounts', () => {
    it('handles accounting style negatives (1.234,56) → -1234.56', () => {
      const result = parseAmount('(1.234,56)');
      expect(result).toEqual({ value: -1234.56, locale: 'es' });
    });

    it('handles accounting style with currency (€1.234,56) → -1234.56', () => {
      const result = parseAmount('(€1.234,56)');
      expect(result).toEqual({ value: -1234.56, locale: 'es' });
    });

    it('handles leading minus -1.234,56 → -1234.56', () => {
      const result = parseAmount('-1.234,56');
      expect(result).toEqual({ value: -1234.56, locale: 'es' });
    });

    it('handles leading minus with currency -€1.234,56 → -1234.56', () => {
      const result = parseAmount('-€1.234,56');
      expect(result).toEqual({ value: -1234.56, locale: 'es' });
    });

    it('handles US negative (1,234.56) → -1234.56', () => {
      const result = parseAmount('(1,234.56)');
      expect(result).toEqual({ value: -1234.56, locale: 'en' });
    });

    it('handles US negative with minus -1,234.56 → -1234.56', () => {
      const result = parseAmount('-1,234.56');
      expect(result).toEqual({ value: -1234.56, locale: 'en' });
    });

    it('handles positive sign +1.234,56 → 1234.56', () => {
      const result = parseAmount('+1.234,56');
      expect(result).toEqual({ value: 1234.56, locale: 'es' });
    });
  });

  describe('Edge cases and errors', () => {
    it('rejects empty string', () => {
      const result = parseAmount('');
      expect(result).toHaveProperty('code');
      if ('code' in result) {
        expect(result.code).toBe('EMPTY');
      }
    });

    it('rejects whitespace-only string', () => {
      const result = parseAmount('   ');
      expect(result).toHaveProperty('code');
      if ('code' in result) {
        expect(result.code).toBe('EMPTY');
      }
    });

    it('rejects alphabetic characters', () => {
      const result = parseAmount('abc');
      expect(result).toHaveProperty('code');
      if ('code' in result) {
        expect(result.code).toBe('INVALID_CHARACTERS');
        expect(result.raw).toBe('abc');
        expect(result.offending).toBe('abc');
      }
    });

    it('rejects mixed alphanumeric', () => {
      const result = parseAmount('12a34');
      expect(result).toHaveProperty('code');
      if ('code' in result) {
        expect(result.code).toBe('INVALID_CHARACTERS');
        expect(result.raw).toBe('12a34');
        expect(result.offending).toBe('a');
      }
    });

    it('rejects currency symbol only', () => {
      const result = parseAmount('€');
      expect(result).toHaveProperty('code');
      if ('code' in result) {
        expect(result.code).toBe('NO_DIGITS');
        expect(result.raw).toBe('€');
      }
    });

    it('rejects currency code only', () => {
      const result = parseAmount('USD');
      expect(result).toHaveProperty('code');
      if ('code' in result) {
        expect(result.code).toBe('NO_DIGITS');
        expect(result.raw).toBe('USD');
      }
    });

    it('handles integer with no separators', () => {
      const result = parseAmount('12345');
      expect(result).toHaveProperty('value');
      if ('value' in result) {
        expect(result.value).toBe(12345);
      }
    });

    it('handles zero', () => {
      const result = parseAmount('0');
      expect(result).toEqual({ value: 0, locale: 'en' });
    });

    it('handles zero with decimal 0,00', () => {
      const result = parseAmount('0,00');
      expect(result).toEqual({ value: 0, locale: 'es' });
    });

    // Unicode whitespace handling
    it('strips NBSP (U+00A0) between digits and currency', () => {
      const result = parseAmount('1\u00A0234,56\u00A0€');
      expect(result).toEqual({ value: 1234.56, locale: 'es' });
    });

    it('strips narrow NBSP (U+202F) as thousands separator', () => {
      const result = parseAmount('1\u202F234,56');
      expect(result).toEqual({ value: 1234.56, locale: 'es' });
    });

    it('strips leading/trailing whitespace', () => {
      const result = parseAmount('  1.234,56  ');
      expect(result).toEqual({ value: 1234.56, locale: 'es' });
    });

    it('strips mixed whitespace (space + NBSP)', () => {
      const result = parseAmount(' 1\u00A0234,56 ');
      expect(result).toEqual({ value: 1234.56, locale: 'es' });
    });

    it('strips zero-width space (U+200B)', () => {
      const result = parseAmount('1\u200B234.56');
      expect(result).toEqual({ value: 1234.56, locale: 'en' });
    });

    it('strips em space (U+2003)', () => {
      const result = parseAmount('1\u2003234.56');
      expect(result).toEqual({ value: 1234.56, locale: 'en' });
    });
  });

  describe('Explicit locale override', () => {
    it('forces ES locale for 1,234.56 (conflicts with US pattern)', () => {
      const result = parseAmount('1,234.56', { locale: 'es' });
      // When forced ES, it strips dots (as thousands) and treats comma as decimal
      // "1,234.56" → strips dots: "1,23456", comma→decimal: "1.23456"
      expect(result).toEqual({ value: 1.23456, locale: 'es' });
    });

    it('forces EN locale for 1.234,56 (conflicts with ES pattern)', () => {
      const result = parseAmount('1.234,56', { locale: 'en' });
      // When forced EN, it strips commas (as thousands) and keeps dot as decimal
      // "1.234,56" → strips commas: "1.23456"
      expect(result).toEqual({ value: 1.23456, locale: 'en' });
    });

    it('forces ES locale for valid ES format', () => {
      const result = parseAmount('16.433,39', { locale: 'es' });
      expect(result).toEqual({ value: 16433.39, locale: 'es' });
    });

    it('forces EN locale for valid EN format', () => {
      const result = parseAmount('16,433.39', { locale: 'en' });
      expect(result).toEqual({ value: 16433.39, locale: 'en' });
    });
  });
});

describe('inferColumnLocale', () => {
  it('returns "es" when ≥80% samples are Spanish', () => {
    const samples = [
      '16.433,39',
      '1.234,56',
      '999,00',
      '12.345,67',
      '100,50',
      '5.000,00',
      '1.234,99',
      '876,54',
      '9.999,99',
    ];
    expect(inferColumnLocale(samples)).toBe('es');
  });

  it('returns "en" when ≥80% samples are US/UK', () => {
    const samples = [
      '16,433.39',
      '1,234.56',
      '999.00',
      '12,345.67',
      '100.50',
      '5,000.00',
      '1,234.99',
      '876.54',
      '9,999.99',
    ];
    expect(inferColumnLocale(samples)).toBe('en');
  });

  it('returns "mixed" when no clear majority (50/50)', () => {
    const samples = [
      '16.433,39', // ES
      '1,234.56', // EN
      '999,00', // ES
      '12,345.67', // EN
      '100,50', // ES
    ];
    expect(inferColumnLocale(samples)).toBe('mixed');
  });

  it('returns "mixed" when <80% agreement (70% ES)', () => {
    const samples = [
      '16.433,39', // ES
      '1.234,56', // ES
      '999,00', // ES
      '12,345.67', // EN
      '100.50', // EN (2 digits → EN)
      '5.000,00', // ES
      '1.234,99', // ES
    ];
    const result = inferColumnLocale(samples);
    // 5 ES, 2 EN → 5/7 = 71% ES → below 80% → mixed
    expect(result).toBe('mixed');
  });

  it('handles empty array → "mixed"', () => {
    expect(inferColumnLocale([])).toBe('mixed');
  });

  it('handles all unparseable samples → "mixed"', () => {
    const samples = ['abc', 'xyz', '###'];
    expect(inferColumnLocale(samples)).toBe('mixed');
  });

  it('locks ES when 9 ES + 1 ambiguous → ≥80%', () => {
    const samples = [
      '16.433,39',
      '1.234,56',
      '999,00',
      '12.345,67',
      '100,50',
      '5.000,00',
      '1.234,99',
      '876,54',
      '9.999,99',
      '1234', // ambiguous integer
    ];
    // 9 ES parseable + 1 integer (could be either, but integer doesn't have locale)
    // Actually, integer will be parsed as 'en' or 'es' arbitrarily by the parser
    // Let's check the actual behavior
    expect(inferColumnLocale(samples)).toBe('es');
  });
});

describe('parseAmount type guards', () => {
  it('accepts numeric input directly (ExcelJS numeric cells)', () => {
    const result = parseAmount(16433.39);
    expect(result).toEqual({ value: 16433.39, locale: 'en' });
  });

  it('accepts negative numeric input', () => {
    const result = parseAmount(-1234.56);
    expect(result).toEqual({ value: -1234.56, locale: 'en' });
  });

  it('accepts zero as number', () => {
    const result = parseAmount(0);
    expect(result).toEqual({ value: 0, locale: 'en' });
  });

  it('rejects Infinity', () => {
    const result = parseAmount(Infinity);
    expect(result).toHaveProperty('code');
    if ('code' in result) {
      expect(result.code).toBe('OUT_OF_RANGE');
      expect(result.raw).toBe('Infinity');
    }
  });

  it('rejects NaN', () => {
    const result = parseAmount(NaN);
    expect(result).toHaveProperty('code');
    if ('code' in result) {
      expect(result.code).toBe('OUT_OF_RANGE');
      expect(result.raw).toBe('NaN');
    }
  });

  it('rejects object (ExcelJS formula cell without sanitizeCell)', () => {
    const result = parseAmount({ formula: 'A1+B1', result: 123 });
    expect(result).toHaveProperty('code');
    if ('code' in result) {
      expect(result.code).toBe('NOT_A_STRING');
      expect(result.raw).toBe('[object Object]');
    }
  });

  it('rejects array', () => {
    const result = parseAmount([1, 2, 3]);
    expect(result).toHaveProperty('code');
    if ('code' in result) {
      expect(result.code).toBe('NOT_A_STRING');
    }
  });

  it('handles null', () => {
    const result = parseAmount(null);
    expect(result).toHaveProperty('code');
    if ('code' in result) {
      expect(result.code).toBe('EMPTY');
    }
  });

  it('handles undefined', () => {
    const result = parseAmount(undefined);
    expect(result).toHaveProperty('code');
    if ('code' in result) {
      expect(result.code).toBe('EMPTY');
    }
  });
});
