import { describe, expect, it } from 'vitest';

import { parseAmount } from './parser.js';

// Zero-amount handling. Real bank exports occasionally include €0,00 rows
// (fee waivers, informational entries, reversed transactions). The import
// path must accept them so users don't have to scrub source files by hand.
// Downstream event/response schemas use `z.number().nonnegative()` for
// stored/read amounts; user-initiated create/update still rejects zero.
describe('parseAmount — zero handling', () => {
  it('accepts numeric 0', () => {
    const r = parseAmount(0);
    expect(r.success).toBe(true);
    expect(r.amount).toBe(0);
    expect(r.type).toBe('income');
  });

  it('accepts string "0"', () => {
    const r = parseAmount('0');
    expect(r.success).toBe(true);
    expect(r.amount).toBe(0);
  });

  it('accepts Spanish-formatted "0,00"', () => {
    const r = parseAmount('0,00');
    expect(r.success).toBe(true);
    expect(r.amount).toBe(0);
  });

  it('accepts "0,00 €" with currency suffix', () => {
    const r = parseAmount('0,00 €');
    expect(r.success).toBe(true);
    expect(r.amount).toBe(0);
  });

  it('accepts accounting "(0,00)"', () => {
    const r = parseAmount('(0,00)');
    expect(r.success).toBe(true);
    expect(r.amount).toBe(0);
  });

  it('still rejects empty string as EMPTY', () => {
    const r = parseAmount('');
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('EMPTY');
  });

  it('still accepts non-zero positive amounts', () => {
    const r = parseAmount('1,23');
    expect(r.success).toBe(true);
    expect(r.amount).toBe(1.23);
    expect(r.type).toBe('income');
  });

  it('still accepts non-zero negative amounts', () => {
    const r = parseAmount('-1,23');
    expect(r.success).toBe(true);
    expect(r.amount).toBe(1.23);
    expect(r.type).toBe('expense');
  });
});
