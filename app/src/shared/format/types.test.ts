// Issue #353 — Unit tests for format types, schemas, and language defaults.
import { describe, it, expect } from 'vitest';
import {
  DATE_FORMATS,
  NUMBER_FORMATS,
  dateFormatSchema,
  numberFormatSchema,
  formatPreferencesSchema,
  defaultsFromLanguage,
} from './types.js';

describe('schemas', () => {
  it('accepts every supported value', () => {
    for (const df of DATE_FORMATS) expect(dateFormatSchema.parse(df)).toBe(df);
    for (const nf of NUMBER_FORMATS) expect(numberFormatSchema.parse(nf)).toBe(nf);
  });

  it('rejects unknown values', () => {
    expect(dateFormatSchema.safeParse('YMD').success).toBe(false);
    expect(numberFormatSchema.safeParse('uk').success).toBe(false);
    expect(dateFormatSchema.safeParse(123).success).toBe(false);
  });

  it('formatPreferencesSchema is strict (no extra keys)', () => {
    expect(
      formatPreferencesSchema.safeParse({ dateFormat: 'DMY', numberFormat: 'eu' }).success,
    ).toBe(true);
    expect(
      formatPreferencesSchema.safeParse({ dateFormat: 'DMY', numberFormat: 'eu', extra: 1 })
        .success,
    ).toBe(false);
    expect(formatPreferencesSchema.safeParse({ dateFormat: 'DMY' }).success).toBe(false);
  });
});

describe('defaultsFromLanguage', () => {
  it('derives European defaults for Spanish', () => {
    expect(defaultsFromLanguage('es')).toEqual({ dateFormat: 'DMY', numberFormat: 'eu' });
    expect(defaultsFromLanguage('es-ES')).toEqual({ dateFormat: 'DMY', numberFormat: 'eu' });
    expect(defaultsFromLanguage('ES')).toEqual({ dateFormat: 'DMY', numberFormat: 'eu' });
  });

  it('derives US defaults for English and everything else', () => {
    expect(defaultsFromLanguage('en')).toEqual({ dateFormat: 'MDY', numberFormat: 'us' });
    expect(defaultsFromLanguage('en-GB')).toEqual({ dateFormat: 'MDY', numberFormat: 'us' });
    expect(defaultsFromLanguage('fr')).toEqual({ dateFormat: 'MDY', numberFormat: 'us' });
  });

  it('handles null/undefined/empty gracefully', () => {
    expect(defaultsFromLanguage(null)).toEqual({ dateFormat: 'MDY', numberFormat: 'us' });
    expect(defaultsFromLanguage(undefined)).toEqual({ dateFormat: 'MDY', numberFormat: 'us' });
    expect(defaultsFromLanguage('')).toEqual({ dateFormat: 'MDY', numberFormat: 'us' });
  });
});
