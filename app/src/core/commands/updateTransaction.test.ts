// WI-20: updateTransaction command tests

import { describe, it, expect } from 'vitest';
import { updateTransaction, type UpdateTransactionInput } from './updateTransaction';
import type { ReadModel } from '../query/types';

const mockReadModel = (transactions: ReadModel['transactions'] = []): ReadModel => ({
  transactions,
  accounts: [
    {
      id: '01234567890123456789012345',
      bankName: 'Test Bank',
      bankNameShort: 'TB',
      accountLabel: 'Test Account',
      color: '#ff0000',
      sortOrder: 0,
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
    },
  ],
  categories: [],
  tags: [],
  configAccounts: [],
  configCategories: [],
  configTags: [],
  importMappings: [],
  rowHashes: new Set(),
  notes: new Map(),
  transactionsByReference: new Map(),
});

describe('updateTransaction', () => {
  it('should update a transaction successfully', () => {
    const now = new Date('2026-04-21T10:00:00Z');
    const existingTx = {
      id: 'tx001234567890123456789012',
      date: '2026-04-01',
      type: 'expense' as const,
      amount: 100,
      currency: 'EUR' as const,
      description: 'Old description',
      accountId: '01234567890123456789012345',
      categoryId: null,
      subcategoryId: null,
      tagIds: [] as readonly string[],
      status: 'approved' as const,
      createdAt: '2026-04-01T00:00:00Z',
      reference: null,
      details: null,
    };

    const input: UpdateTransactionInput = {
      id: 'tx001234567890123456789012',
      date: '2026-04-15',
      type: 'income',
      amount: 200,
      description: 'New description',
      status: 'pending',
      reference: 'REF-123',
      details: 'Some details',
    };

    const result = updateTransaction(input, {
      now: () => now,
      newId: () => 'evt00000000000000000000000',
      readModel: mockReadModel([existingTx]),
      datasetId: 'ds000000000000000000000000',
      actorDeviceId: 'dev00000000000000000000000',
      dekVersion: 1,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('tx.updated');
      expect(result.value.id).toBe('evt00000000000000000000000');
      expect(result.value.payload.id).toBe('tx001234567890123456789012');
      expect(result.value.payload.date).toBe('2026-04-15');
      expect(result.value.payload.type).toBe('income');
      expect(result.value.payload.amount).toBe(200);
      expect(result.value.payload.description).toBe('New description');
      expect(result.value.payload.status).toBe('pending');
      expect(result.value.payload.reference).toBe('REF-123');
      expect(result.value.payload.details).toBe('Some details');
      // Immutables preserved
      expect(result.value.payload.accountId).toBe('01234567890123456789012345');
      expect(result.value.payload.currency).toBe('EUR');
      expect(result.value.payload.createdAt).toBe('2026-04-01T00:00:00Z');
      expect(result.value.payload.updatedAt).toBe('2026-04-21T10:00:00.000Z');
    }
  });

  it('should return TX_NOT_FOUND if transaction does not exist', () => {
    const input: UpdateTransactionInput = {
      id: 'nonexistent00000000000000',
      date: '2026-04-15',
      type: 'income',
      amount: 200,
      description: 'Description',
    };

    const result = updateTransaction(input, {
      now: () => new Date(),
      newId: () => 'evt00000000000000000000000',
      readModel: mockReadModel([]),
      datasetId: 'ds000000000000000000000000',
      actorDeviceId: 'dev00000000000000000000000',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TX_NOT_FOUND');
      expect(result.error.field).toBe('id');
    }
  });

  it('should return AMOUNT_NON_POSITIVE if amount is zero', () => {
    const existingTx = {
      id: 'tx001234567890123456789012',
      date: '2026-04-01',
      type: 'expense' as const,
      amount: 100,
      currency: 'EUR' as const,
      description: 'Old description',
      accountId: '01234567890123456789012345',
      categoryId: null,
      subcategoryId: null,
      tagIds: [] as readonly string[],
      status: 'approved' as const,
      createdAt: '2026-04-01T00:00:00Z',
      reference: null,
      details: null,
    };

    const input: UpdateTransactionInput = {
      id: 'tx001234567890123456789012',
      date: '2026-04-15',
      type: 'income',
      amount: 0,
      description: 'Description',
    };

    const result = updateTransaction(input, {
      now: () => new Date(),
      newId: () => 'evt00000000000000000000000',
      readModel: mockReadModel([existingTx]),
      datasetId: 'ds000000000000000000000000',
      actorDeviceId: 'dev00000000000000000000000',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('AMOUNT_NON_POSITIVE');
    }
  });

  it('should return AMOUNT_NON_POSITIVE if amount is negative', () => {
    const existingTx = {
      id: 'tx001234567890123456789012',
      date: '2026-04-01',
      type: 'expense' as const,
      amount: 100,
      currency: 'EUR' as const,
      description: 'Old description',
      accountId: '01234567890123456789012345',
      categoryId: null,
      subcategoryId: null,
      tagIds: [] as readonly string[],
      status: 'approved' as const,
      createdAt: '2026-04-01T00:00:00Z',
      reference: null,
      details: null,
    };

    const input: UpdateTransactionInput = {
      id: 'tx001234567890123456789012',
      date: '2026-04-15',
      type: 'income',
      amount: -50,
      description: 'Description',
    };

    const result = updateTransaction(input, {
      now: () => new Date(),
      newId: () => 'evt00000000000000000000000',
      readModel: mockReadModel([existingTx]),
      datasetId: 'ds000000000000000000000000',
      actorDeviceId: 'dev00000000000000000000000',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('AMOUNT_NON_POSITIVE');
    }
  });

  it('should return DATE_INVALID if date is malformed', () => {
    const existingTx = {
      id: 'tx001234567890123456789012',
      date: '2026-04-01',
      type: 'expense' as const,
      amount: 100,
      currency: 'EUR' as const,
      description: 'Old description',
      accountId: '01234567890123456789012345',
      categoryId: null,
      subcategoryId: null,
      tagIds: [] as readonly string[],
      status: 'approved' as const,
      createdAt: '2026-04-01T00:00:00Z',
      reference: null,
      details: null,
    };

    const input: UpdateTransactionInput = {
      id: 'tx001234567890123456789012',
      date: '2026-02-31', // Invalid date
      type: 'income',
      amount: 100,
      description: 'Description',
    };

    const result = updateTransaction(input, {
      now: () => new Date(),
      newId: () => 'evt00000000000000000000000',
      readModel: mockReadModel([existingTx]),
      datasetId: 'ds000000000000000000000000',
      actorDeviceId: 'dev00000000000000000000000',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('DATE_INVALID');
    }
  });

  it('should return TYPE_INVALID if type is not income or expense', () => {
    const existingTx = {
      id: 'tx001234567890123456789012',
      date: '2026-04-01',
      type: 'expense' as const,
      amount: 100,
      currency: 'EUR' as const,
      description: 'Old description',
      accountId: '01234567890123456789012345',
      categoryId: null,
      subcategoryId: null,
      tagIds: [] as readonly string[],
      status: 'approved' as const,
      createdAt: '2026-04-01T00:00:00Z',
      reference: null,
      details: null,
    };

    const input = {
      id: 'tx001234567890123456789012',
      date: '2026-04-15',
      type: 'invalid',
      amount: 100,
      description: 'Description',
    } as unknown as UpdateTransactionInput;

    const result = updateTransaction(input, {
      now: () => new Date(),
      newId: () => 'evt00000000000000000000000',
      readModel: mockReadModel([existingTx]),
      datasetId: 'ds000000000000000000000000',
      actorDeviceId: 'dev00000000000000000000000',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TYPE_INVALID');
    }
  });

  it('should return DESCRIPTION_EMPTY if description is empty', () => {
    const existingTx = {
      id: 'tx001234567890123456789012',
      date: '2026-04-01',
      type: 'expense' as const,
      amount: 100,
      currency: 'EUR' as const,
      description: 'Old description',
      accountId: '01234567890123456789012345',
      categoryId: null,
      subcategoryId: null,
      tagIds: [] as readonly string[],
      status: 'approved' as const,
      createdAt: '2026-04-01T00:00:00Z',
      reference: null,
      details: null,
    };

    const input: UpdateTransactionInput = {
      id: 'tx001234567890123456789012',
      date: '2026-04-15',
      type: 'income',
      amount: 100,
      description: '   ', // Whitespace only
    };

    const result = updateTransaction(input, {
      now: () => new Date(),
      newId: () => 'evt00000000000000000000000',
      readModel: mockReadModel([existingTx]),
      datasetId: 'ds000000000000000000000000',
      actorDeviceId: 'dev00000000000000000000000',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('DESCRIPTION_EMPTY');
    }
  });

  it('should preserve existing accountId (immutable)', () => {
    const existingTx = {
      id: 'tx001234567890123456789012',
      date: '2026-04-01',
      type: 'expense' as const,
      amount: 100,
      currency: 'EUR' as const,
      description: 'Old description',
      accountId: '01234567890123456789012345',
      categoryId: null,
      subcategoryId: null,
      tagIds: [] as readonly string[],
      status: 'approved' as const,
      createdAt: '2026-04-01T00:00:00Z',
      reference: null,
      details: null,
    };

    const input: UpdateTransactionInput = {
      id: 'tx001234567890123456789012',
      date: '2026-04-15',
      type: 'income',
      amount: 200,
      description: 'New description',
    };

    const result = updateTransaction(input, {
      now: () => new Date('2026-04-21T10:00:00Z'),
      newId: () => 'evt00000000000000000000000',
      readModel: mockReadModel([existingTx]),
      datasetId: 'ds000000000000000000000000',
      actorDeviceId: 'dev00000000000000000000000',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // accountId must remain unchanged
      expect(result.value.payload.accountId).toBe('01234567890123456789012345');
    }
  });
});
