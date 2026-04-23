import { describe, expect, it } from 'vitest';

import { parseAmount } from './parser.js';

describe('parseAmount — zero rejection', () => {
  it('rejects numeric 0 as EMPTY', () => {
    const r = parseAmount(0);
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('EMPTY');
  });

  it('rejects string "0" as EMPTY', () => {
    const r = parseAmount('0');
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('EMPTY');
    expect(r.errorRaw).toBe('0');
  });

  it('rejects Spanish-formatted "0,00" as EMPTY', () => {
    const r = parseAmount('0,00');
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('EMPTY');
  });

  it('rejects "0,00 €" with currency suffix as EMPTY', () => {
    const r = parseAmount('0,00 €');
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('EMPTY');
  });

  it('rejects accounting "(0,00)" as EMPTY', () => {
    const r = parseAmount('(0,00)');
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
