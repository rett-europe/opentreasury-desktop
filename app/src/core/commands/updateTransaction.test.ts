// WI-20: updateTransaction command tests

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { updateTransaction, type UpdateTransactionInput } from './updateTransaction';
import type { ReadModel } from '../query/types';
import { createTestDeps, emptyReadModel, testUlid } from '../test-helpers';

const ACCOUNT_ID = testUlid('ACC1');
const TX_ID = testUlid('TX01');
const EVT_ID = testUlid('EVT1');

const mockReadModel = (transactions: ReadModel['transactions'] = []): ReadModel => ({
  ...emptyReadModel(),
  transactions,
  accounts: [
    {
      id: ACCOUNT_ID,
      bankName: 'Test Bank',
      bankNameShort: 'TB',
      accountLabel: 'Test Account',
      color: '#ff0000',
      sortOrder: 0,
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
    },
  ],
});

describe('updateTransaction', () => {
  it('should update a transaction successfully', () => {
    const now = new Date('2026-04-21T10:00:00Z');
    const existingTx = {
      id: TX_ID,
      date: '2026-04-01',
      type: 'expense' as const,
      amount: 100,
      currency: 'EUR' as const,
      description: 'Old description',
      accountId: ACCOUNT_ID,
      categoryId: null,
      subcategoryId: null,
      tagIds: [] as readonly string[],
      status: 'approved' as const,
      createdAt: '2026-04-01T00:00:00Z',
      reference: null,
      details: null,
    };

    const input: UpdateTransactionInput = {
      id: TX_ID,
      date: '2026-04-15',
      type: 'income',
      amount: 200,
      description: 'New description',
      status: 'pending',
      reference: 'REF-123',
      details: 'Some details',
    };

    const deps = createTestDeps({
      now: () => now,
      newId: () => EVT_ID,
      readModel: mockReadModel([existingTx]),
    });
    const result = updateTransaction(input, deps);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('tx.updated');
      expect(result.value.id).toBe(EVT_ID);
      expect(result.value.payload.id).toBe(TX_ID);
      expect(result.value.payload.date).toBe('2026-04-15');
      expect(result.value.payload.type).toBe('income');
      expect(result.value.payload.amount).toBe(200);
      expect(result.value.payload.description).toBe('New description');
      expect(result.value.payload.status).toBe('pending');
      expect(result.value.payload.reference).toBe('REF-123');
      expect(result.value.payload.details).toBe('Some details');
      // Immutables preserved
      expect(result.value.payload.accountId).toBe(ACCOUNT_ID);
      expect(result.value.payload.currency).toBe('EUR');
      expect(result.value.payload.createdAt).toBe('2026-04-01T00:00:00Z');
      expect(result.value.payload.updatedAt).toBe('2026-04-21T10:00:00.000Z');
    }
  });

  it('should return TX_NOT_FOUND if transaction does not exist', () => {
    const input: UpdateTransactionInput = {
      id: testUlid('NONEXIST'),
      date: '2026-04-15',
      type: 'income',
      amount: 200,
      description: 'Description',
    };

    const deps = createTestDeps({
      readModel: mockReadModel([]),
    });
    const result = updateTransaction(input, deps);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TX_NOT_FOUND');
      expect(result.error.field).toBe('id');
    }
  });

  it('should return AMOUNT_NON_POSITIVE if amount is zero', () => {
    const existingTx = {
      id: TX_ID,
      date: '2026-04-01',
      type: 'expense' as const,
      amount: 100,
      currency: 'EUR' as const,
      description: 'Old description',
      accountId: ACCOUNT_ID,
      categoryId: null,
      subcategoryId: null,
      tagIds: [] as readonly string[],
      status: 'approved' as const,
      createdAt: '2026-04-01T00:00:00Z',
      reference: null,
      details: null,
    };

    const input: UpdateTransactionInput = {
      id: TX_ID,
      date: '2026-04-15',
      type: 'income',
      amount: 0,
      description: 'Description',
    };

    const deps = createTestDeps({
      readModel: mockReadModel([existingTx]),
    });
    const result = updateTransaction(input, deps);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('AMOUNT_NON_POSITIVE');
    }
  });

  it('should return AMOUNT_NON_POSITIVE if amount is negative', () => {
    const existingTx = {
      id: TX_ID,
      date: '2026-04-01',
      type: 'expense' as const,
      amount: 100,
      currency: 'EUR' as const,
      description: 'Old description',
      accountId: ACCOUNT_ID,
      categoryId: null,
      subcategoryId: null,
      tagIds: [] as readonly string[],
      status: 'approved' as const,
      createdAt: '2026-04-01T00:00:00Z',
      reference: null,
      details: null,
    };

    const input: UpdateTransactionInput = {
      id: TX_ID,
      date: '2026-04-15',
      type: 'income',
      amount: -50,
      description: 'Description',
    };

    const deps = createTestDeps({
      readModel: mockReadModel([existingTx]),
    });
    const result = updateTransaction(input, deps);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('AMOUNT_NON_POSITIVE');
    }
  });

  it('should return DATE_INVALID if date is malformed', () => {
    const existingTx = {
      id: TX_ID,
      date: '2026-04-01',
      type: 'expense' as const,
      amount: 100,
      currency: 'EUR' as const,
      description: 'Old description',
      accountId: ACCOUNT_ID,
      categoryId: null,
      subcategoryId: null,
      tagIds: [] as readonly string[],
      status: 'approved' as const,
      createdAt: '2026-04-01T00:00:00Z',
      reference: null,
      details: null,
    };

    const input: UpdateTransactionInput = {
      id: TX_ID,
      date: '2026-02-31', // Invalid date
      type: 'income',
      amount: 100,
      description: 'Description',
    };

    const deps = createTestDeps({
      readModel: mockReadModel([existingTx]),
    });
    const result = updateTransaction(input, deps);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('DATE_INVALID');
    }
  });

  it('should return TYPE_INVALID if type is not income or expense', () => {
    const existingTx = {
      id: TX_ID,
      date: '2026-04-01',
      type: 'expense' as const,
      amount: 100,
      currency: 'EUR' as const,
      description: 'Old description',
      accountId: ACCOUNT_ID,
      categoryId: null,
      subcategoryId: null,
      tagIds: [] as readonly string[],
      status: 'approved' as const,
      createdAt: '2026-04-01T00:00:00Z',
      reference: null,
      details: null,
    };

    const input = {
      id: TX_ID,
      date: '2026-04-15',
      type: 'invalid',
      amount: 100,
      description: 'Description',
    } as unknown as UpdateTransactionInput;

    const deps = createTestDeps({
      readModel: mockReadModel([existingTx]),
    });
    const result = updateTransaction(input, deps);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TYPE_INVALID');
    }
  });

  it('should return DESCRIPTION_EMPTY if description is empty', () => {
    const existingTx = {
      id: TX_ID,
      date: '2026-04-01',
      type: 'expense' as const,
      amount: 100,
      currency: 'EUR' as const,
      description: 'Old description',
      accountId: ACCOUNT_ID,
      categoryId: null,
      subcategoryId: null,
      tagIds: [] as readonly string[],
      status: 'approved' as const,
      createdAt: '2026-04-01T00:00:00Z',
      reference: null,
      details: null,
    };

    const input: UpdateTransactionInput = {
      id: TX_ID,
      date: '2026-04-15',
      type: 'income',
      amount: 100,
      description: '   ', // Whitespace only
    };

    const deps = createTestDeps({
      readModel: mockReadModel([existingTx]),
    });
    const result = updateTransaction(input, deps);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('DESCRIPTION_EMPTY');
    }
  });

  it('should preserve existing accountId (immutable)', () => {
    const existingTx = {
      id: TX_ID,
      date: '2026-04-01',
      type: 'expense' as const,
      amount: 100,
      currency: 'EUR' as const,
      description: 'Old description',
      accountId: ACCOUNT_ID,
      categoryId: null,
      subcategoryId: null,
      tagIds: [] as readonly string[],
      status: 'approved' as const,
      createdAt: '2026-04-01T00:00:00Z',
      reference: null,
      details: null,
    };

    const input: UpdateTransactionInput = {
      id: TX_ID,
      date: '2026-04-15',
      type: 'income',
      amount: 200,
      description: 'New description',
    };

    const deps = createTestDeps({
      now: () => new Date('2026-04-21T10:00:00Z'),
      readModel: mockReadModel([existingTx]),
    });
    const result = updateTransaction(input, deps);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // accountId must remain unchanged
      expect(result.value.payload.accountId).toBe(ACCOUNT_ID);
    }
  });
});

describe('updateTransaction — empty-string ID regression (label-removal bug)', () => {
  it('normalizes empty-string categoryId/subcategoryId to null in the event payload', () => {
    const existingTx = {
      id: TX_ID,
      date: '2026-04-01',
      type: 'expense' as const,
      amount: 100,
      currency: 'EUR' as const,
      description: 'Old',
      accountId: ACCOUNT_ID,
      categoryId: null,
      subcategoryId: null,
      tagIds: [] as readonly string[],
      status: 'approved' as const,
      createdAt: '2026-04-01T00:00:00Z',
      reference: null,
      details: null,
    };

    // Simulate a renderer path that emits '' for "no category" — the bug
    // before the fix would propagate this empty string into the event payload
    // and fail the strict tx.updated payload schema (length 26 or null).
    const input: UpdateTransactionInput = {
      id: TX_ID,
      date: '2026-04-15',
      type: 'expense',
      amount: 100,
      description: 'Updated description',
      categoryId: '',
      subcategoryId: '',
    };

    const deps = createTestDeps({
      now: () => new Date('2026-04-21T10:00:00Z'),
      newId: () => EVT_ID,
      readModel: mockReadModel([existingTx]),
    });

    const result = updateTransaction(input, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.payload.categoryId).toBeNull();
    expect(result.value.payload.subcategoryId).toBeNull();
  });
});

describe('updateTransaction — self-heals a corrupt stored createdAt (edit must not be blocked)', () => {
  const iso = z.string().datetime();

  it('falls back to noon UTC on the tx date when existing.createdAt is an invalid ISO datetime', () => {
    const existingTx = {
      id: TX_ID,
      date: '2026-04-29',
      type: 'income' as const,
      amount: 500,
      currency: 'EUR' as const,
      description: 'Donación corporativa — Empresa #E159',
      accountId: ACCOUNT_ID,
      categoryId: null,
      subcategoryId: null,
      tagIds: [] as readonly string[],
      status: 'approved' as const,
      // The real dev-seed seconds-overflow value Pedro hit live.
      createdAt: '2026-04-29T12:00:159.000Z',
      reference: null,
      details: null,
    };

    const input: UpdateTransactionInput = {
      id: TX_ID,
      date: '2026-04-29',
      type: 'income',
      amount: 500,
      description: 'Donación corporativa — Empresa #E159 (edited)',
    };

    const deps = createTestDeps({
      now: () => new Date('2026-06-07T10:00:00Z'),
      newId: () => EVT_ID,
      readModel: mockReadModel([existingTx]),
    });

    const result = updateTransaction(input, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The corrupt value is replaced by a valid, faithful fallback...
    expect(result.value.payload.createdAt).toBe('2026-04-29T12:00:00.000Z');
    // ...which passes the SAME gate that rejected the original.
    expect(iso.safeParse(result.value.payload.createdAt).success).toBe(true);
  });

  it('preserves a valid existing createdAt unchanged', () => {
    const existingTx = {
      id: TX_ID,
      date: '2026-04-01',
      type: 'expense' as const,
      amount: 100,
      currency: 'EUR' as const,
      description: 'Old',
      accountId: ACCOUNT_ID,
      categoryId: null,
      subcategoryId: null,
      tagIds: [] as readonly string[],
      status: 'approved' as const,
      createdAt: '2026-04-01T08:30:00.000Z',
      reference: null,
      details: null,
    };

    const input: UpdateTransactionInput = {
      id: TX_ID,
      date: '2026-04-15',
      type: 'expense',
      amount: 100,
      description: 'Updated',
    };

    const deps = createTestDeps({
      now: () => new Date('2026-06-07T10:00:00Z'),
      newId: () => EVT_ID,
      readModel: mockReadModel([existingTx]),
    });

    const result = updateTransaction(input, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.payload.createdAt).toBe('2026-04-01T08:30:00.000Z');
  });
});
