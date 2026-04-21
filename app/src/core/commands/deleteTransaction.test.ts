// WI-20: deleteTransaction command tests

import { describe, it, expect } from 'vitest';
import { deleteTransaction, type DeleteTransactionInput } from './deleteTransaction';
import type { ReadModel } from '../query/types';

const mockReadModel = (transactions: ReadModel['transactions'] = []): ReadModel => ({
  transactions,
  accounts: [],
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

describe('deleteTransaction', () => {
  it('should delete a transaction successfully', () => {
    const now = new Date('2026-04-21T10:00:00Z');
    const existingTx = {
      id: 'tx001234567890123456789012',
      date: '2026-04-01',
      type: 'expense' as const,
      amount: 100,
      currency: 'EUR' as const,
      description: 'Test transaction',
      accountId: '01234567890123456789012345',
      categoryId: null,
      subcategoryId: null,
      tagIds: [] as readonly string[],
      status: 'approved' as const,
      createdAt: '2026-04-01T00:00:00Z',
      reference: null,
      details: null,
    };

    const input: DeleteTransactionInput = {
      id: 'tx001234567890123456789012',
    };

    const result = deleteTransaction(input, {
      now: () => now,
      newId: () => 'evt00000000000000000000000',
      readModel: mockReadModel([existingTx]),
      datasetId: 'ds000000000000000000000000',
      actorDeviceId: 'dev00000000000000000000000',
      dekVersion: 1,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('tx.deleted');
      expect(result.value.id).toBe('evt00000000000000000000000');
      expect(result.value.txId).toBe('tx001234567890123456789012');
      expect(result.value.deletedAt).toBe('2026-04-21T10:00:00.000Z');
      expect(result.value.datasetId).toBe('ds000000000000000000000000');
      expect(result.value.actorDeviceId).toBe('dev00000000000000000000000');
      expect(result.value.dekVersion).toBe(1);
      expect(result.value.version).toBe(1);
    }
  });

  it('should return TX_NOT_FOUND if transaction does not exist', () => {
    const input: DeleteTransactionInput = {
      id: 'nonexistent00000000000000',
    };

    const result = deleteTransaction(input, {
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
      expect(result.error.message).toContain('not found');
    }
  });
});
