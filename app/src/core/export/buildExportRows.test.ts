// SPEC-027 — buildExportRows expansion/filtering/cap unit tests (Cypher).

import { describe, it, expect } from 'vitest';
import { buildExportRows } from './buildExportRows.js';
import type {
  ConfigAccount,
  ConfigCategory,
  ConfigTag,
  ReadModel,
  Transaction,
  TransactionSplit,
} from '../query/types.js';
import type { ExportFilters } from '../../shared/ipc-contracts/export.js';

const ACC = '01HACCOUNTZZZZZZZZZZZZZZZA';
const CAT_A = '01HCATEGORYZZZZZZZZZZZZZAA';
const CAT_B = '01HCATEGORYZZZZZZZZZZZZZBB';
const SUB_A = '01HSUBCATZZZZZZZZZZZZZZZZAA';
const TAG = '01HTAGZZZZZZZZZZZZZZZZZZZZA';

function account(over: Partial<ConfigAccount> = {}): ConfigAccount {
  return {
    id: ACC,
    name: 'Caja',
    currency: 'EUR',
    openingBalance: 0,
    sortOrder: 0,
    createdAt: '2025-01-01T00:00:00.000Z',
    ...over,
  };
}

function category(
  id: string,
  name: string,
  subs: { id: string; name: string }[] = [],
): ConfigCategory {
  return {
    id,
    name,
    sortOrder: 0,
    createdAt: '2025-01-01T00:00:00.000Z',
    subcategories: subs.map((s) => ({
      id: s.id,
      parentCategoryId: id,
      name: s.name,
      createdAt: '2025-01-01T00:00:00.000Z',
    })),
  };
}

function tag(over: Partial<ConfigTag> = {}): ConfigTag {
  return { id: TAG, name: 'Comida', sortOrder: 0, createdAt: '2025-01-01T00:00:00.000Z', ...over };
}

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: '01HTX00000000000000000000A',
    date: '2025-02-10',
    type: 'expense',
    amount: 100,
    currency: 'EUR',
    description: 'Compra',
    accountId: ACC,
    categoryId: CAT_A,
    subcategoryId: null,
    tagIds: [],
    status: 'approved',
    createdAt: '2025-02-10T10:00:00.000Z',
    reference: null,
    details: null,
    ...over,
  };
}

interface ModelParts {
  readonly transactions?: Transaction[];
  readonly accounts?: ConfigAccount[];
  readonly categories?: ConfigCategory[];
  readonly tags?: ConfigTag[];
  readonly splits?: Map<string, readonly TransactionSplit[]>;
}

function model(parts: ModelParts = {}): ReadModel {
  const splits = parts.splits ?? new Map<string, readonly TransactionSplit[]>();
  return {
    transactions: parts.transactions ?? [],
    configAccounts: parts.accounts ?? [account()],
    configCategories: parts.categories ?? [
      category(CAT_A, 'Alimentación', [{ id: SUB_A, name: 'Restaurantes' }]),
      category(CAT_B, 'Viajes'),
    ],
    configTags: parts.tags ?? [tag()],
    importMappings: [],
    rowHashes: new Set<string>(),
    notes: new Map(),
    transactionsByReference: new Map(),
    splits,
    splitParentIds: new Set(splits.keys()),
  };
}

const RANGE: ExportFilters = { dateFrom: '2025-01-01', dateTo: '2025-12-31', accountIds: [ACC] };

describe('buildExportRows — non-split rows', () => {
  it('emits one row per matching transaction with resolved names', () => {
    const result = buildExportRows(model({ transactions: [tx()] }), RANGE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0]!;
    expect(row.account).toBe('Caja');
    expect(row.category).toBe('Alimentación');
    expect(row.isSplit).toBe(false);
    expect(row.parentId).toBe('');
  });

  it('signs expense amounts negative and income positive', () => {
    const result = buildExportRows(
      model({
        transactions: [
          tx({ id: '01HTX00000000000000000001A', type: 'expense', amount: 50 }),
          tx({ id: '01HTX00000000000000000002A', type: 'income', amount: 80, date: '2025-02-11' }),
        ],
      }),
      RANGE,
    );
    if (!result.ok) throw new Error('expected ok');
    const amounts = result.rows.map((r) => r.amount);
    expect(amounts).toContain(-50);
    expect(amounts).toContain(80);
  });

  it('excludes transactions outside the date range', () => {
    const result = buildExportRows(
      model({
        transactions: [
          tx({ date: '2024-12-31' }),
          tx({ id: '01HTX00000000000000000003A', date: '2025-02-10' }),
        ],
      }),
      RANGE,
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.rows).toHaveLength(1);
  });

  it('filters by category at the row level', () => {
    const result = buildExportRows(
      model({
        transactions: [
          tx({ id: '01HTX00000000000000000004A', categoryId: CAT_A }),
          tx({ id: '01HTX00000000000000000005A', categoryId: CAT_B, date: '2025-03-01' }),
        ],
      }),
      { ...RANGE, categoryIds: [CAT_B] },
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.category).toBe('Viajes');
  });
});

describe('buildExportRows — label filtering', () => {
  it('matches by tag NAME and renders labels as `;`-joined names', () => {
    const result = buildExportRows(model({ transactions: [tx({ tagIds: [TAG] })] }), {
      ...RANGE,
      labels: ['Comida'],
    });
    if (!result.ok) throw new Error('expected ok');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.labels).toBe('Comida');
  });

  it('drops a transaction whose tags do not intersect the label filter', () => {
    const result = buildExportRows(model({ transactions: [tx({ tagIds: [TAG] })] }), {
      ...RANGE,
      labels: ['Otra'],
    });
    if (!result.ok) throw new Error('expected ok');
    expect(result.rows).toHaveLength(0);
  });
});

describe('buildExportRows — split expansion', () => {
  it('expands a split parent into one child row per matching split', () => {
    const parent = tx({ id: '01HTXSPLITPARENT000000000A', amount: 100, categoryId: null });
    const splits = new Map<string, readonly TransactionSplit[]>([
      [
        parent.id,
        [
          {
            splitId: '01HSPLIT0000000000000000AA',
            parentTxId: parent.id,
            amountCents: 6000,
            categoryId: CAT_A,
            subcategoryId: null,
            comment: null,
            sortOrder: 0,
          },
          {
            splitId: '01HSPLIT0000000000000000BB',
            parentTxId: parent.id,
            amountCents: 4000,
            categoryId: CAT_B,
            subcategoryId: null,
            comment: null,
            sortOrder: 1,
          },
        ],
      ],
    ]);
    const result = buildExportRows(model({ transactions: [parent], splits }), RANGE);
    if (!result.ok) throw new Error('expected ok');
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((r) => r.isSplit)).toBe(true);
    expect(result.rows.every((r) => r.parentId === parent.id)).toBe(true);
    // expense sign + cents → euros
    expect(result.rows.map((r) => r.amount).sort()).toEqual([-60, -40].sort());
  });

  it('yields exactly one child row when only one split matches the category filter', () => {
    const parent = tx({ id: '01HTXSPLITPARENT000000001A', categoryId: null });
    const splits = new Map<string, readonly TransactionSplit[]>([
      [
        parent.id,
        [
          {
            splitId: '01HSPLIT0000000000000001AA',
            parentTxId: parent.id,
            amountCents: 6000,
            categoryId: CAT_A,
            subcategoryId: null,
            comment: null,
            sortOrder: 0,
          },
          {
            splitId: '01HSPLIT0000000000000001BB',
            parentTxId: parent.id,
            amountCents: 4000,
            categoryId: CAT_B,
            subcategoryId: null,
            comment: null,
            sortOrder: 1,
          },
        ],
      ],
    ]);
    const result = buildExportRows(model({ transactions: [parent], splits }), {
      ...RANGE,
      categoryIds: [CAT_A],
    });
    if (!result.ok) throw new Error('expected ok');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.category).toBe('Alimentación');
  });
});

describe('buildExportRows — ordering', () => {
  it('orders by date ASC then createdAt ASC', () => {
    const result = buildExportRows(
      model({
        transactions: [
          tx({
            id: '01HTX0000000000000000010A',
            date: '2025-03-01',
            createdAt: '2025-03-01T09:00:00.000Z',
          }),
          tx({
            id: '01HTX0000000000000000011A',
            date: '2025-01-01',
            createdAt: '2025-01-01T09:00:00.000Z',
          }),
          tx({
            id: '01HTX0000000000000000012A',
            date: '2025-01-01',
            createdAt: '2025-01-01T08:00:00.000Z',
          }),
        ],
      }),
      RANGE,
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.rows.map((r) => r.date)).toEqual(['2025-01-01', '2025-01-01', '2025-03-01']);
    expect(result.rows[0]!.id).toBe('01HTX0000000000000000012A');
  });
});

describe('buildExportRows — running balance + per-account summary (SPEC-027 §15)', () => {
  const ACC2 = '01HACCOUNTZZZZZZZZZZZZZZZB';

  it('seeds from the opening balance and includes movements before dateFrom', () => {
    const result = buildExportRows(
      model({
        accounts: [account({ openingBalance: 1000 })],
        transactions: [
          tx({ id: '01HTX0000000000000000020A', date: '2024-12-15', type: 'income', amount: 200 }),
          tx({ id: '01HTX0000000000000000021A', date: '2025-01-05', amount: 50.1 }),
          tx({ id: '01HTX0000000000000000022A', date: '2025-01-06', type: 'income', amount: 0.2 }),
        ],
      }),
      RANGE,
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.rows.map((r) => r.balance)).toEqual([1149.9, 1150.1]);
    expect(result.balances).toEqual([
      {
        account: 'Caja',
        opening: 1200,
        moneyIn: 0.2,
        moneyOut: 50.1,
        closing: 1150.1,
        movementCount: 2,
      },
    ]);
  });

  it('keeps the real account balance when category filters hide movements', () => {
    const result = buildExportRows(
      model({
        accounts: [account({ openingBalance: 500 })],
        transactions: [
          tx({
            id: '01HTX0000000000000000023A',
            date: '2025-02-01',
            categoryId: CAT_B,
            amount: 100,
          }),
          tx({
            id: '01HTX0000000000000000024A',
            date: '2025-02-02',
            categoryId: CAT_A,
            amount: 30,
          }),
        ],
      }),
      { ...RANGE, categoryIds: [CAT_A] },
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.rows).toHaveLength(1);
    // 500 − 100 (hidden) − 30 = 370
    expect(result.rows[0]!.balance).toBe(370);
    // Summary ignores category filters: both movements counted.
    expect(result.balances[0]).toMatchObject({
      opening: 500,
      moneyOut: 130,
      closing: 370,
      movementCount: 2,
    });
  });

  it('advances the balance per split child; the last child equals the post-movement balance', () => {
    const parent = tx({ id: '01HTXSPLITPARENT000000002A', amount: 100, categoryId: null });
    const splits = new Map<string, readonly TransactionSplit[]>([
      [
        parent.id,
        [
          {
            splitId: '01HSPLIT0000000000000002BB',
            parentTxId: parent.id,
            amountCents: 4000,
            categoryId: CAT_B,
            subcategoryId: null,
            comment: null,
            sortOrder: 1,
          },
          {
            splitId: '01HSPLIT0000000000000002AA',
            parentTxId: parent.id,
            amountCents: 6000,
            categoryId: CAT_A,
            subcategoryId: null,
            comment: null,
            sortOrder: 0,
          },
        ],
      ],
    ]);
    const result = buildExportRows(
      model({ accounts: [account({ openingBalance: 250 })], transactions: [parent], splits }),
      RANGE,
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.rows.map((r) => [r.id, r.balance])).toEqual([
      ['01HSPLIT0000000000000002AA', 190],
      ['01HSPLIT0000000000000002BB', 150],
    ]);
    expect(result.balances[0]).toMatchObject({ moneyOut: 100, closing: 150, movementCount: 1 });
  });

  it('tracks each account independently and lists selected accounts in sortOrder', () => {
    const result = buildExportRows(
      model({
        accounts: [
          account({ openingBalance: 100, sortOrder: 1 }),
          account({ id: ACC2, name: 'Banco', openingBalance: 1000, sortOrder: 0 }),
        ],
        transactions: [
          tx({ id: '01HTX0000000000000000025A', date: '2025-03-01', amount: 10 }),
          tx({ id: '01HTX0000000000000000026A', date: '2025-03-02', accountId: ACC2, amount: 20 }),
          tx({ id: '01HTX0000000000000000027A', date: '2025-03-03', amount: 5 }),
        ],
      }),
      { ...RANGE, accountIds: [ACC, ACC2] },
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.rows.map((r) => [r.account, r.balance])).toEqual([
      ['Caja', 90],
      ['Banco', 980],
      ['Caja', 85],
    ]);
    expect(result.balances.map((b) => [b.account, b.closing])).toEqual([
      ['Banco', 980],
      ['Caja', 85],
    ]);
  });

  it('includes a selected account with no movements in range (opening = closing)', () => {
    const result = buildExportRows(
      model({
        accounts: [account({ openingBalance: 42 })],
        transactions: [tx({ date: '2024-06-01', type: 'income', amount: 8 })],
      }),
      RANGE,
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.rows).toHaveLength(0);
    expect(result.balances).toEqual([
      { account: 'Caja', opening: 50, moneyIn: 0, moneyOut: 0, closing: 50, movementCount: 0 },
    ]);
  });

  it('without an account filter, summarises only accounts that produced rows', () => {
    const result = buildExportRows(
      model({
        accounts: [account(), account({ id: ACC2, name: 'Banco', sortOrder: 1 })],
        transactions: [
          tx({ id: '01HTX0000000000000000028A', categoryId: CAT_A }),
          tx({ id: '01HTX0000000000000000029A', accountId: ACC2, categoryId: CAT_B }),
        ],
      }),
      { dateFrom: '2025-01-01', dateTo: '2025-12-31', categoryIds: [CAT_A] },
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.balances.map((b) => b.account)).toEqual(['Caja']);
  });

  it('ignores movements after dateTo for both rows and closing balance', () => {
    const result = buildExportRows(
      model({
        accounts: [account({ openingBalance: 100 })],
        transactions: [
          tx({ id: '01HTX0000000000000000030A', date: '2025-06-01', amount: 10 }),
          tx({ id: '01HTX0000000000000000031A', date: '2026-01-01', amount: 999 }),
        ],
      }),
      RANGE,
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.rows).toHaveLength(1);
    expect(result.balances[0]!.closing).toBe(90);
  });
});
