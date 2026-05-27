// WI-19 — unit tests for the transaction IPC request schema extensions.
//
// Covers `createTransactionRequestSchema`'s new optional `reference` and
// `details` fields: trim, empty→null, max-length enforcement, type-safety.
// These assertions pin the IPC boundary contract Trinity depends on.

import { describe, expect, it } from 'vitest';
import {
  createTransactionRequestSchema,
  updateTransactionRequestSchema,
  bulkUpdateTransactionRequestSchema,
} from './transaction';

const ACCOUNT_ID = '01HZACC0000000000000000000';
const TX_ID = '01HZTX00000000000000000000';
const CAT_ID = '01HZCAT0000000000000000000';
const SUBCAT_ID = '01HZSUB0000000000000000000';
const CORR_ID = '01HZCOR0000000000000000000';

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

// ----------------------------------------------------------------------------
// Regression — empty-string category/subcategory IDs must normalize to null.
//
// Original bug: `categoryId: z.string().nullable().optional()` accepted '',
// the IPC handler did `?? null` (passed '' through), and the core command
// embedded '' into the tx.updated event payload — which then failed the strict
// `z.string().length(26).nullable()` event schema with a too_small error.
// The schema must accept '' (some renderer code paths emit it) AND normalize
// it to null so downstream layers never observe the empty string.
// ----------------------------------------------------------------------------

describe('createTransactionRequestSchema — nullable ID normalization', () => {
  it('accepts and normalizes empty-string categoryId/subcategoryId to null', () => {
    const parsed = createTransactionRequestSchema.safeParse({
      ...baseInput(),
      categoryId: '',
      subcategoryId: '',
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.categoryId).toBeNull();
    expect(parsed.data.subcategoryId).toBeNull();
  });

  it('accepts a valid 26-char ULID for categoryId and subcategoryId', () => {
    const parsed = createTransactionRequestSchema.safeParse({
      ...baseInput(),
      categoryId: CAT_ID,
      subcategoryId: SUBCAT_ID,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.categoryId).toBe(CAT_ID);
    expect(parsed.data.subcategoryId).toBe(SUBCAT_ID);
  });

  it('accepts explicit null and undefined for categoryId/subcategoryId', () => {
    const parsedNull = createTransactionRequestSchema.safeParse({
      ...baseInput(),
      categoryId: null,
      subcategoryId: null,
    });
    expect(parsedNull.success).toBe(true);
    if (!parsedNull.success) return;
    expect(parsedNull.data.categoryId).toBeNull();
    expect(parsedNull.data.subcategoryId).toBeNull();

    const parsedUndef = createTransactionRequestSchema.safeParse(baseInput());
    expect(parsedUndef.success).toBe(true);
    if (!parsedUndef.success) return;
    expect(parsedUndef.data.categoryId).toBeUndefined();
    expect(parsedUndef.data.subcategoryId).toBeUndefined();
  });

  it('rejects non-empty non-ULID strings for categoryId/subcategoryId', () => {
    const parsedShort = createTransactionRequestSchema.safeParse({
      ...baseInput(),
      categoryId: 'abc',
    });
    expect(parsedShort.success).toBe(false);

    const parsedLong = createTransactionRequestSchema.safeParse({
      ...baseInput(),
      subcategoryId: '0'.repeat(27),
    });
    expect(parsedLong.success).toBe(false);
  });
});

describe('updateTransactionRequestSchema — nullable ID normalization', () => {
  const baseUpdate = () => ({
    id: TX_ID,
    date: '2026-04-20',
    type: 'expense' as const,
    amount: 50,
    description: 'Coffee',
  });

  it('accepts and normalizes empty-string categoryId/subcategoryId to null (regression: label removal)', () => {
    const parsed = updateTransactionRequestSchema.safeParse({
      ...baseUpdate(),
      categoryId: '',
      subcategoryId: '',
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.categoryId).toBeNull();
    expect(parsed.data.subcategoryId).toBeNull();
  });

  it('accepts a valid 26-char ULID for categoryId and subcategoryId', () => {
    const parsed = updateTransactionRequestSchema.safeParse({
      ...baseUpdate(),
      categoryId: CAT_ID,
      subcategoryId: SUBCAT_ID,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.categoryId).toBe(CAT_ID);
    expect(parsed.data.subcategoryId).toBe(SUBCAT_ID);
  });

  it('rejects non-empty non-ULID strings for categoryId', () => {
    const parsed = updateTransactionRequestSchema.safeParse({
      ...baseUpdate(),
      categoryId: 'cat1',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('bulkUpdateTransactionRequestSchema — nullable ID normalization', () => {
  const baseBulk = () => ({
    ids: [TX_ID],
    correlationId: CORR_ID,
  });

  it('accepts and normalizes empty-string categoryId/subcategoryId to null', () => {
    const parsed = bulkUpdateTransactionRequestSchema.safeParse({
      ...baseBulk(),
      categoryId: '',
      subcategoryId: '',
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.categoryId).toBeNull();
    expect(parsed.data.subcategoryId).toBeNull();
  });

  it('keeps undefined as undefined (bulk semantics: "do not change")', () => {
    const parsed = bulkUpdateTransactionRequestSchema.safeParse(baseBulk());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.categoryId).toBeUndefined();
    expect(parsed.data.subcategoryId).toBeUndefined();
  });

  it('rejects non-empty non-ULID strings for categoryId', () => {
    const parsed = bulkUpdateTransactionRequestSchema.safeParse({
      ...baseBulk(),
      categoryId: 'not-a-ulid',
    });
    expect(parsed.success).toBe(false);
  });
});
