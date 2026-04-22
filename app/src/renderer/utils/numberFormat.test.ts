import { describe, expect, it } from 'vitest';
import { formatCurrency } from './numberFormat.js';

describe('formatCurrency', () => {
  it('formats EUR in es-ES with comma decimal and trailing euro symbol', () => {
    const out = formatCurrency(1500.5, 'es-ES');
    expect(out).toContain('500,50');
    expect(out).toContain('€');
    // Symbol trails the amount in es-ES formatting.
    expect(out.indexOf('€')).toBeGreaterThan(out.indexOf('500,50'));
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
