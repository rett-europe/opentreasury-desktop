import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleInsightsLabelSummary,
  handleInsightsLabelByCategory,
  handleInsightsLabelBySubcategory,
  handleInsightsLabelMonthlyEvolution,
  handleInsightsLabelByAccount,
} from './insights.js';
import type { ReadModel, Transaction, TransactionSplit } from '../../../core/query/types.js';
import * as reducers from '../../../core/query/reducers.js';

vi.mock('../../../core/query/reducers.js', () => ({
  getReadModel: vi.fn(),
}));

const mockGetReadModel = vi.mocked(reducers.getReadModel);

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeTx(overrides: Partial<Transaction> & Pick<Transaction, 'id'>): Transaction {
  return {
    id: overrides.id,
    date: '2026-03-15',
    type: 'expense',
    amount: 100,
    currency: 'EUR',
    description: 'Test',
    accountId: 'acc-1',
    categoryId: 'cat-1',
    subcategoryId: null,
    tagIds: [],
    status: 'approved',
    createdAt: '2026-03-15T00:00:00Z',
    reference: null,
    details: null,
    ...overrides,
  };
}

function makeModel(
  transactions: Transaction[],
  splits?: ReadonlyMap<string, readonly TransactionSplit[]>,
): ReadModel {
  return {
    transactions,
    configAccounts: [
      {
        id: 'acc-1',
        name: 'Main',
        label: 'Main Account',
        color: '#001122',
        currency: 'EUR',
        openingBalance: 0,
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'acc-2',
        name: 'Savings',
        currency: 'EUR',
        openingBalance: 0,
        sortOrder: 1,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
    configCategories: [
      {
        id: 'cat-1',
        name: 'Donaciones',
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00Z',
        subcategories: [
          {
            id: 'sub-1a',
            parentCategoryId: 'cat-1',
            name: 'Particulares',
            createdAt: '2026-01-01T00:00:00Z',
          },
          {
            id: 'sub-1b',
            parentCategoryId: 'cat-1',
            name: 'Empresas',
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      },
      {
        id: 'cat-2',
        name: 'Eventos',
        sortOrder: 1,
        createdAt: '2026-01-01T00:00:00Z',
        subcategories: [],
      },
    ],
    configTags: [
      { id: 'tag-A', name: 'A', sortOrder: 0, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'tag-B', name: 'B', sortOrder: 1, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'tag-C', name: 'C', sortOrder: 2, createdAt: '2026-01-01T00:00:00Z' },
    ],
    importMappings: [],
    rowHashes: new Set(),
    notes: new Map(),
    transactionsByReference: new Map(),
    splits: splits ?? new Map(),
    splitParentIds: new Set(splits ? Array.from(splits.keys()) : []),
  };
}

const WINDOW = { windowStart: '2026-01-01', windowEnd: '2026-12-31' };

// ---------------------------------------------------------------------------
// label-summary
// ---------------------------------------------------------------------------

describe('handleInsightsLabelSummary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aggregates income / expense / count for matching tagIds (OR semantics)', async () => {
    mockGetReadModel.mockReturnValue(
      makeModel([
        makeTx({ id: 't1', type: 'income', amount: 200, tagIds: ['tag-A'] }),
        makeTx({ id: 't2', type: 'expense', amount: 50, tagIds: ['tag-B'] }),
        makeTx({ id: 't3', type: 'expense', amount: 999, tagIds: ['tag-C'] }), // not selected
      ]),
    );

    const r = await handleInsightsLabelSummary({ ...WINDOW, tagIds: ['tag-A', 'tag-B'] });

    expect(r.incomeCents).toBe(20000);
    expect(r.expenseCents).toBe(5000);
    expect(r.netCents).toBe(15000);
    expect(r.txCount).toBe(2);
  });

  it('counts a tx with multiple matching tags exactly once (no double-count)', async () => {
    mockGetReadModel.mockReturnValue(
      makeModel([makeTx({ id: 't1', type: 'income', amount: 100, tagIds: ['tag-A', 'tag-B'] })]),
    );

    const r = await handleInsightsLabelSummary({ ...WINDOW, tagIds: ['tag-A', 'tag-B'] });

    expect(r.txCount).toBe(1);
    expect(r.incomeCents).toBe(10000);
  });

  it('counts distinct categories and accounts touched', async () => {
    mockGetReadModel.mockReturnValue(
      makeModel([
        makeTx({
          id: 't1',
          amount: 10,
          categoryId: 'cat-1',
          accountId: 'acc-1',
          tagIds: ['tag-A'],
        }),
        makeTx({
          id: 't2',
          amount: 10,
          categoryId: 'cat-2',
          accountId: 'acc-1',
          tagIds: ['tag-A'],
        }),
        makeTx({
          id: 't3',
          amount: 10,
          categoryId: 'cat-1',
          accountId: 'acc-2',
          tagIds: ['tag-A'],
        }),
      ]),
    );

    const r = await handleInsightsLabelSummary({ ...WINDOW, tagIds: ['tag-A'] });

    expect(r.categoryCount).toBe(2);
    expect(r.accountCount).toBe(2);
  });

  it('respects window edges (inclusive on both sides)', async () => {
    mockGetReadModel.mockReturnValue(
      makeModel([
        makeTx({ id: 't1', date: '2026-02-28', amount: 1, tagIds: ['tag-A'] }),
        makeTx({ id: 't2', date: '2026-03-01', amount: 1, tagIds: ['tag-A'] }), // start edge
        makeTx({ id: 't3', date: '2026-03-31', amount: 1, tagIds: ['tag-A'] }), // end edge
        makeTx({ id: 't4', date: '2026-04-01', amount: 1, tagIds: ['tag-A'] }),
      ]),
    );

    const r = await handleInsightsLabelSummary({
      tagIds: ['tag-A'],
      windowStart: '2026-03-01',
      windowEnd: '2026-03-31',
    });

    expect(r.txCount).toBe(2);
    expect(r.windowStart).toBe('2026-03-01');
    expect(r.windowEnd).toBe('2026-03-31');
  });

  it('split-aware: aggregates by split categories, not parent', async () => {
    const parent = makeTx({
      id: 't1',
      type: 'expense',
      amount: 300,
      categoryId: 'cat-1',
      tagIds: ['tag-A'],
    });
    const splits = new Map<string, readonly TransactionSplit[]>([
      [
        't1',
        [
          {
            splitId: 's1',
            parentTxId: 't1',
            amountCents: 20000, // €200
            categoryId: 'cat-1',
            subcategoryId: null,
            comment: null,
            sortOrder: 0,
          },
          {
            splitId: 's2',
            parentTxId: 't1',
            amountCents: 10000, // €100
            categoryId: 'cat-2',
            subcategoryId: null,
            comment: null,
            sortOrder: 1,
          },
        ],
      ],
    ]);
    mockGetReadModel.mockReturnValue(makeModel([parent], splits));

    const r = await handleInsightsLabelSummary({ ...WINDOW, tagIds: ['tag-A'] });

    expect(r.expenseCents).toBe(30000);
    expect(r.categoryCount).toBe(2); // cat-1 + cat-2 from splits
    expect(r.txCount).toBe(1); // still one transaction
  });

  it('defaults window to current calendar year when omitted', async () => {
    const year = new Date().getUTCFullYear();
    mockGetReadModel.mockReturnValue(
      makeModel([makeTx({ id: 't1', date: `${year}-01-01`, amount: 10, tagIds: ['tag-A'] })]),
    );

    const r = await handleInsightsLabelSummary({ tagIds: ['tag-A'] });

    expect(r.windowStart).toBe(`${year}-01-01`);
    expect(r.txCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// label-by-category
// ---------------------------------------------------------------------------

describe('handleInsightsLabelByCategory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('groups income and expense per category', async () => {
    mockGetReadModel.mockReturnValue(
      makeModel([
        makeTx({ id: 't1', type: 'income', amount: 100, categoryId: 'cat-1', tagIds: ['tag-A'] }),
        makeTx({ id: 't2', type: 'expense', amount: 30, categoryId: 'cat-1', tagIds: ['tag-A'] }),
        makeTx({ id: 't3', type: 'expense', amount: 20, categoryId: 'cat-2', tagIds: ['tag-A'] }),
      ]),
    );

    const r = await handleInsightsLabelByCategory({ ...WINDOW, tagIds: ['tag-A'] });
    const cat1 = r.categories.find((c) => c.categoryId === 'cat-1')!;
    const cat2 = r.categories.find((c) => c.categoryId === 'cat-2')!;

    expect(cat1.incomeCents).toBe(10000);
    expect(cat1.expenseCents).toBe(3000);
    expect(cat2.incomeCents).toBe(0);
    expect(cat2.expenseCents).toBe(2000);
  });

  it('emits null categoryId for uncategorized', async () => {
    mockGetReadModel.mockReturnValue(
      makeModel([makeTx({ id: 't1', amount: 10, categoryId: null, tagIds: ['tag-A'] })]),
    );

    const r = await handleInsightsLabelByCategory({ ...WINDOW, tagIds: ['tag-A'] });
    expect(r.categories).toHaveLength(1);
    expect(r.categories[0]?.categoryId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// label-by-subcategory
// ---------------------------------------------------------------------------

describe('handleInsightsLabelBySubcategory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rolls up by (category, subcategory) and sorts by total magnitude', async () => {
    mockGetReadModel.mockReturnValue(
      makeModel([
        makeTx({
          id: 't1',
          type: 'income',
          amount: 500,
          categoryId: 'cat-1',
          subcategoryId: 'sub-1a',
          tagIds: ['tag-A'],
        }),
        makeTx({
          id: 't2',
          type: 'income',
          amount: 100,
          categoryId: 'cat-1',
          subcategoryId: 'sub-1b',
          tagIds: ['tag-A'],
        }),
        makeTx({
          id: 't3',
          type: 'expense',
          amount: 50,
          categoryId: 'cat-1',
          subcategoryId: 'sub-1a',
          tagIds: ['tag-A'],
        }),
      ]),
    );

    const r = await handleInsightsLabelBySubcategory({ ...WINDOW, tagIds: ['tag-A'] });
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]?.subcategoryId).toBe('sub-1a'); // larger volume
    expect(r.rows[0]?.subcategoryName).toBe('Particulares');
    expect(r.rows[0]?.incomeCents).toBe(50000);
    expect(r.rows[0]?.expenseCents).toBe(5000);
    expect(r.rows[1]?.subcategoryId).toBe('sub-1b');
  });
});

// ---------------------------------------------------------------------------
// label-monthly-evolution
// ---------------------------------------------------------------------------

describe('handleInsightsLabelMonthlyEvolution', () => {
  beforeEach(() => vi.clearAllMocks());

  it('buckets matching transactions by YYYY-MM, sorted ascending', async () => {
    mockGetReadModel.mockReturnValue(
      makeModel([
        makeTx({ id: 't1', date: '2026-01-15', type: 'income', amount: 10, tagIds: ['tag-A'] }),
        makeTx({ id: 't2', date: '2026-03-01', type: 'expense', amount: 5, tagIds: ['tag-A'] }),
        makeTx({ id: 't3', date: '2026-03-31', type: 'expense', amount: 3, tagIds: ['tag-A'] }),
      ]),
    );

    const r = await handleInsightsLabelMonthlyEvolution({ ...WINDOW, tagIds: ['tag-A'] });
    expect(r.months).toEqual([
      { monthIso: '2026-01', incomeCents: 1000, expenseCents: 0 },
      { monthIso: '2026-03', incomeCents: 0, expenseCents: 800 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// label-by-account
// ---------------------------------------------------------------------------

describe('handleInsightsLabelByAccount', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aggregates per accountId with name + color, sorted by magnitude', async () => {
    mockGetReadModel.mockReturnValue(
      makeModel([
        makeTx({ id: 't1', type: 'income', amount: 5, accountId: 'acc-2', tagIds: ['tag-A'] }),
        makeTx({ id: 't2', type: 'income', amount: 50, accountId: 'acc-1', tagIds: ['tag-A'] }),
        makeTx({ id: 't3', type: 'expense', amount: 20, accountId: 'acc-1', tagIds: ['tag-A'] }),
      ]),
    );

    const r = await handleInsightsLabelByAccount({ ...WINDOW, tagIds: ['tag-A'] });
    expect(r.accounts).toHaveLength(2);
    expect(r.accounts[0]?.accountId).toBe('acc-1'); // larger magnitude
    expect(r.accounts[0]?.accountName).toBe('Main Account'); // label preferred over name
    expect(r.accounts[0]?.accountColor).toBe('#001122');
    expect(r.accounts[0]?.incomeCents).toBe(5000);
    expect(r.accounts[0]?.expenseCents).toBe(2000);
    expect(r.accounts[1]?.accountId).toBe('acc-2');
    expect(r.accounts[1]?.accountName).toBe('Savings'); // no label → fallback to name
    expect(r.accounts[1]?.accountColor).toBe(''); // no color → empty string
  });

  it('honors optional accountId filter (single-account view)', async () => {
    mockGetReadModel.mockReturnValue(
      makeModel([
        makeTx({ id: 't1', type: 'income', amount: 5, accountId: 'acc-2', tagIds: ['tag-A'] }),
        makeTx({ id: 't2', type: 'income', amount: 50, accountId: 'acc-1', tagIds: ['tag-A'] }),
      ]),
    );

    const r = await handleInsightsLabelByAccount({
      ...WINDOW,
      tagIds: ['tag-A'],
      accountId: 'acc-1',
    });
    expect(r.accounts).toHaveLength(1);
    expect(r.accounts[0]?.accountId).toBe('acc-1');
  });
});
