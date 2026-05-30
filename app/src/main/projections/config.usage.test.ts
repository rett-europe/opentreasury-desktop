// issue #52 — selectCategoryUsage tally tests + WI-21-followup hard-delete
// usage projections (accounts, subcategories, tags, categories-with-splits).
//
// Pure-function tests over a hand-built ReadModel. Verifies:
//   • transactions whose categoryId is null are ignored,
//   • subcategoryId presence drives the classifiedCount delta,
//   • categories with no movements are absent from the result,
//   • the *delete-safety* projections (accounts/subcategories/tags/category+
//     splits) tally split children where appropriate.

import { describe, it, expect } from 'vitest';
import type { ReadModel, Transaction, TransactionSplit } from '../../core/query/types';
import {
  selectAccountUsage,
  selectCategoryDeleteUsage,
  selectCategoryUsage,
  selectSubcategoryUsage,
  selectTagUsage,
} from './config';

function tx(partial: Partial<Transaction> & { id: string }): Transaction {
  return {
    id: partial.id,
    date: '2026-01-01',
    type: 'expense',
    amount: 10,
    currency: 'EUR',
    description: '',
    accountId: partial.accountId ?? 'A1',
    categoryId: partial.categoryId ?? null,
    subcategoryId: partial.subcategoryId ?? null,
    tagIds: partial.tagIds ?? [],
    status: 'approved',
    createdAt: '2026-01-01T00:00:00.000Z',
    reference: null,
    details: null,
  };
}

function modelWith(
  transactions: readonly Transaction[],
  splits?: ReadonlyMap<string, readonly TransactionSplit[]>,
): ReadModel {
  return {
    transactions,
    configAccounts: [],
    configCategories: [],
    configTags: [],
    importMappings: [],
    rowHashes: new Set<string>(),
    notes: new Map(),
    transactionsByReference: new Map(),
    splits: splits ?? new Map(),
    splitParentIds: new Set(splits ? Array.from(splits.keys()) : []),
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

// ---------------------------------------------------------------------------
// WI-21-followup — Hard-delete safety projections.
// ---------------------------------------------------------------------------

describe('selectAccountUsage', () => {
  it('counts transactions referencing each account', () => {
    const model = modelWith([
      tx({ id: 'T1', accountId: 'A1' }),
      tx({ id: 'T2', accountId: 'A1' }),
      tx({ id: 'T3', accountId: 'A2' }),
    ]);

    const usage = selectAccountUsage(model);

    expect(usage).toContainEqual({ accountId: 'A1', transactionCount: 2 });
    expect(usage).toContainEqual({ accountId: 'A2', transactionCount: 1 });
    expect(usage).toHaveLength(2);
  });

  it('returns an empty array when there are no transactions', () => {
    expect(selectAccountUsage(modelWith([]))).toEqual([]);
  });
});

describe('selectSubcategoryUsage', () => {
  it('counts transactions referencing each subcategory', () => {
    const model = modelWith([
      tx({ id: 'T1', categoryId: 'C1', subcategoryId: 'S1' }),
      tx({ id: 'T2', categoryId: 'C1', subcategoryId: 'S1' }),
      tx({ id: 'T3', categoryId: 'C1', subcategoryId: 'S2' }),
      tx({ id: 'T4', categoryId: 'C1', subcategoryId: null }),
    ]);

    const usage = selectSubcategoryUsage(model);

    expect(usage).toContainEqual({ subcategoryId: 'S1', transactionCount: 2 });
    expect(usage).toContainEqual({ subcategoryId: 'S2', transactionCount: 1 });
    expect(usage).toHaveLength(2);
  });

  it('also counts split children referencing the subcategory', () => {
    const splits = new Map<string, readonly TransactionSplit[]>([
      [
        'TP1',
        [
          {
            splitId: 'SP1',
            parentTxId: 'TP1',
            amountCents: 1000,
            categoryId: 'C1',
            subcategoryId: 'S1',
            comment: null,
            sortOrder: 0,
          },
          {
            splitId: 'SP2',
            parentTxId: 'TP1',
            amountCents: 500,
            categoryId: 'C1',
            subcategoryId: 'S1',
            comment: null,
            sortOrder: 1,
          },
        ],
      ],
    ]);
    const model = modelWith([tx({ id: 'T1', categoryId: 'C1', subcategoryId: 'S1' })], splits);

    const usage = selectSubcategoryUsage(model);

    expect(usage).toContainEqual({ subcategoryId: 'S1', transactionCount: 3 });
  });

  it('returns an empty array when there are no references', () => {
    expect(selectSubcategoryUsage(modelWith([]))).toEqual([]);
  });
});

describe('selectCategoryDeleteUsage', () => {
  it('counts transactions + split children sharing a categoryId', () => {
    const splits = new Map<string, readonly TransactionSplit[]>([
      [
        'TP1',
        [
          {
            splitId: 'SP1',
            parentTxId: 'TP1',
            amountCents: 1000,
            categoryId: 'C1',
            subcategoryId: null,
            comment: null,
            sortOrder: 0,
          },
        ],
      ],
    ]);
    const model = modelWith([tx({ id: 'T1', categoryId: 'C1' })], splits);

    const usage = selectCategoryDeleteUsage(model);

    expect(usage).toContainEqual({ categoryId: 'C1', transactionCount: 2 });
  });
});

describe('selectTagUsage', () => {
  it('counts transactions referencing each tag (multi-tag friendly)', () => {
    const model = modelWith([
      tx({ id: 'T1', tagIds: ['G1', 'G2'] }),
      tx({ id: 'T2', tagIds: ['G1'] }),
      tx({ id: 'T3', tagIds: [] }),
    ]);

    const usage = selectTagUsage(model);

    expect(usage).toContainEqual({ tagId: 'G1', transactionCount: 2 });
    expect(usage).toContainEqual({ tagId: 'G2', transactionCount: 1 });
    expect(usage).toHaveLength(2);
  });

  it('returns an empty array when no transaction carries any tag', () => {
    expect(selectTagUsage(modelWith([tx({ id: 'T1' })]))).toEqual([]);
  });
});
