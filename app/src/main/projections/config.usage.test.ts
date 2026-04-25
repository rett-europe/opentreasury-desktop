// issue #52 — selectCategoryUsage tally tests.
//
// Pure-function tests over a hand-built ReadModel. Verifies:
//   • transactions whose categoryId is null are ignored,
//   • subcategoryId presence drives the classifiedCount delta,
//   • categories with no movements are absent from the result.

import { describe, it, expect } from 'vitest';
import type { ReadModel, Transaction } from '../../core/query/types';
import { selectCategoryUsage } from './config';

function tx(partial: Partial<Transaction> & { id: string }): Transaction {
  return {
    id: partial.id,
    date: '2026-01-01',
    type: 'expense',
    amount: 10,
    currency: 'EUR',
    description: '',
    accountId: 'A1',
    categoryId: partial.categoryId ?? null,
    subcategoryId: partial.subcategoryId ?? null,
    tagIds: [],
    status: 'approved',
    createdAt: '2026-01-01T00:00:00.000Z',
    reference: null,
    details: null,
  };
}

function modelWith(transactions: readonly Transaction[]): ReadModel {
  return {
    transactions,
    configAccounts: [],
    configCategories: [],
    configTags: [],
    importMappings: [],
    rowHashes: new Set<string>(),
    notes: new Map(),
    transactionsByReference: new Map(),
  };
}

describe('selectCategoryUsage — issue #52', () => {
  it('counts transactions per category and flags subcategory-classified ones', () => {
    const model = modelWith([
      tx({ id: 'T1', categoryId: 'C1', subcategoryId: 'S1' }),
      tx({ id: 'T2', categoryId: 'C1', subcategoryId: 'S1' }),
      tx({ id: 'T3', categoryId: 'C1', subcategoryId: null }),
      tx({ id: 'T4', categoryId: 'C2', subcategoryId: 'S2' }),
    ]);

    const usage = selectCategoryUsage(model);

    expect(usage).toContainEqual({ categoryId: 'C1', transactionCount: 3, classifiedCount: 2 });
    expect(usage).toContainEqual({ categoryId: 'C2', transactionCount: 1, classifiedCount: 1 });
    expect(usage).toHaveLength(2);
  });

  it('ignores transactions with no categoryId (uncategorised)', () => {
    const model = modelWith([
      tx({ id: 'T1', categoryId: null, subcategoryId: null }),
      tx({ id: 'T2', categoryId: 'C1', subcategoryId: null }),
    ]);

    const usage = selectCategoryUsage(model);

    expect(usage).toEqual([{ categoryId: 'C1', transactionCount: 1, classifiedCount: 0 }]);
  });

  it('returns an empty array when there are no transactions', () => {
    expect(selectCategoryUsage(modelWith([]))).toEqual([]);
  });
});
