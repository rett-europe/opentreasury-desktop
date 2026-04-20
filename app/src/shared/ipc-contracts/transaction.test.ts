// WI-19 — unit tests for the transaction IPC request schema extensions.
//
// Covers `createTransactionRequestSchema`'s new optional `reference` and
// `details` fields: trim, empty→null, max-length enforcement, type-safety.
// These assertions pin the IPC boundary contract Trinity depends on.

import { describe, expect, it } from 'vitest';
import { createTransactionRequestSchema } from './transaction';

const ACCOUNT_ID = '01HZACC0000000000000000000';

function baseInput() {
  return {
    accountId: ACCOUNT_ID,
    date: '2026-04-20',
    type: 'income' as const,
    amount: 100,
    currency: 'EUR' as const,
    description: 'Test donation',
  };
}

describe('createTransactionRequestSchema — reference/details (WI-19)', () => {
  it('accepts payload without reference or details (fields are optional)', () => {
    const parsed = createTransactionRequestSchema.safeParse(baseInput());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.reference).toBeUndefined();
    expect(parsed.data.details).toBeUndefined();
  });

  it('accepts explicit null for reference and details', () => {
    const parsed = createTransactionRequestSchema.safeParse({
      ...baseInput(),
      reference: null,
      details: null,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.reference).toBeNull();
    expect(parsed.data.details).toBeNull();
  });

  it('trims whitespace around reference', () => {
    const parsed = createTransactionRequestSchema.safeParse({
      ...baseInput(),
      reference: '   INV-2026-0042   ',
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.reference).toBe('INV-2026-0042');
  });

  it('trims whitespace around details', () => {
    const parsed = createTransactionRequestSchema.safeParse({
      ...baseInput(),
      details: '\n  Monthly donation  \t',
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.details).toBe('Monthly donation');
  });

  it('normalizes empty string to null for reference', () => {
    const parsed = createTransactionRequestSchema.safeParse({
      ...baseInput(),
      reference: '',
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.reference).toBeNull();
  });

  it('normalizes whitespace-only string to null for details', () => {
    const parsed = createTransactionRequestSchema.safeParse({
      ...baseInput(),
      details: '   \t\n   ',
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.details).toBeNull();
  });

  it('accepts reference at exactly 120 characters', () => {
    const parsed = createTransactionRequestSchema.safeParse({
      ...baseInput(),
      reference: 'x'.repeat(120),
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects reference longer than 120 characters (after trim)', () => {
    const parsed = createTransactionRequestSchema.safeParse({
      ...baseInput(),
      reference: 'x'.repeat(121),
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts details at exactly 1000 characters', () => {
    const parsed = createTransactionRequestSchema.safeParse({
      ...baseInput(),
      details: 'y'.repeat(1000),
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects details longer than 1000 characters (after trim)', () => {
    const parsed = createTransactionRequestSchema.safeParse({
      ...baseInput(),
      details: 'y'.repeat(1001),
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects non-string reference', () => {
    const parsed = createTransactionRequestSchema.safeParse({
      ...baseInput(),
      reference: 12345 as unknown,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects non-string details', () => {
    const parsed = createTransactionRequestSchema.safeParse({
      ...baseInput(),
      details: { foo: 'bar' } as unknown,
    });
    expect(parsed.success).toBe(false);
  });

  it('trailing whitespace does NOT push a 119-char payload over 120-char limit', () => {
    const parsed = createTransactionRequestSchema.safeParse({
      ...baseInput(),
      reference: 'x'.repeat(119) + '     ',
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.reference).toHaveLength(119);
  });
});
