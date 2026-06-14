// SPEC-030 FR10 — European currency formatting unit tests.

import { describe, it, expect } from 'vitest';
import { formatEuroAmount } from './format.js';

const NBSP = '\u00A0';
const MINUS = '\u2212';
const THIN = '\u2009';

describe('formatEuroAmount', () => {
  it('formats with `.` thousands, `,` decimal and a NBSP before €', () => {
    expect(formatEuroAmount(9506.21)).toBe(`9.506,21${NBSP}€`);
  });

  it('pads to two decimals', () => {
    expect(formatEuroAmount(8647.5)).toBe(`8.647,50${NBSP}€`);
    expect(formatEuroAmount(32162.93)).toBe(`32.162,93${NBSP}€`);
  });

  it('groups millions', () => {
    expect(formatEuroAmount(1234567.89)).toBe(`1.234.567,89${NBSP}€`);
  });

  it('renders a real MINUS SIGN + thin space for negative sign mode', () => {
    expect(formatEuroAmount(8647.5, { sign: 'minus' })).toBe(`${MINUS}${THIN}8.647,50${NBSP}€`);
    // never a hyphen-minus
    expect(formatEuroAmount(8647.5, { sign: 'minus' })).not.toContain('-');
  });

  it('renders a plus prefix for the reconciliation credits line', () => {
    expect(formatEuroAmount(9506.21, { sign: 'plus' })).toBe(`+9.506,21${NBSP}€`);
  });

  it('uses the magnitude regardless of the value sign', () => {
    expect(formatEuroAmount(-50)).toBe(`50,00${NBSP}€`);
  });

  it('handles zero and non-finite input defensively', () => {
    expect(formatEuroAmount(0)).toBe(`0,00${NBSP}€`);
    expect(formatEuroAmount(Number.NaN)).toBe(`0,00${NBSP}€`);
  });
});
