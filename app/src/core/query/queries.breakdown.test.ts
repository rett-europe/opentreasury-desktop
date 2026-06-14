import { describe, expect, it, beforeEach } from 'vitest';
import { applyEvent, resetReadModel } from './reducers';
import {
  getCategoryBreakdownInRange,
  getReconciliationForRange,
  getRangeKPIs,
  getAccountBalancesInRange,
  type CategoryBreakdownRow,
} from './queries';
import type { DomainEvent } from '../events/schemas';

// SPEC-030 (WI-1) — core category-breakdown + reconciliation query tests.
//
// Fixtures are seeded through the real reducer pipeline (applyEvent) so the
// new queries are exercised against an authentic ReadModel, and the
// reconciliation-to-Panel invariant is asserted against the existing
// getRangeKPIs / getAccountBalancesInRange paths.

const ulid = (suffix: string) => `01HZ${suffix.padEnd(22, '0')}`;

const ACC1 = ulid('ACC1');
const ACC2 = ulid('ACC2');
const CAT_INCOME = ulid('CATI');
const CAT_SHARED = ulid('CATS'); // appears on BOTH income and expense sides
const CAT_EXPENSE = ulid('CATE');
const SUB_A = ulid('SUBA');
const SUB_B = ulid('SUBB');

let seq = 0;
const nextEnv = () => ulid(`ENV${(seq += 1)}`);

function account(id: string, opening: number, sortOrder: number): DomainEvent {
  return {
    type: 'AccountCreated',
    id,
    name: `Account ${sortOrder}`,
    currency: 'EUR',
    openingBalance: opening,
    sortOrder,
    createdAt: '2023-01-01T00:00:00.000Z',
  } as DomainEvent;
}

function category(id: string, name: string, sortOrder: number): DomainEvent {
  return {
    type: 'CategoryCreated',
    id,
    name,
    sortOrder,
    createdAt: '2023-01-01T00:00:00.000Z',
  } as DomainEvent;
}

function subcategory(id: string, parentCategoryId: string, name: string): DomainEvent {
  return {
    type: 'SubcategoryCreated',
    id,
    parentCategoryId,
    name,
    createdAt: '2023-01-01T00:00:00.000Z',
  } as DomainEvent;
}

interface TxOpts {
  id?: string;
  date: string;
  type: 'income' | 'expense';
  amount: number;
  accountId?: string;
  categoryId?: string | null;
  subcategoryId?: string | null;
}

function tx(opts: TxOpts): DomainEvent {
  const id = opts.id ?? nextEnv();
  return {
    id: nextEnv(),
    type: 'tx.created',
    datasetId: ulid('DATA'),
    actorDeviceId: ulid('DEV1'),
    createdAt: `${opts.date}T10:00:00.000Z`,
    dekVersion: 1,
    version: 1,
    payload: {
      id,
      date: opts.date,
      type: opts.type,
      amount: opts.amount,
      currency: 'EUR',
      description: 'tx',
      accountId: opts.accountId ?? ACC1,
      categoryId: opts.categoryId ?? null,
      subcategoryId: opts.subcategoryId ?? null,
      tagIds: [],
      status: 'approved',
      createdAt: `${opts.date}T10:00:00.000Z`,
    },
  } as DomainEvent;
}

interface SplitChild {
  amountCents: number;
  categoryId: string | null;
  subcategoryId?: string | null;
}

function split(parentTxId: string, children: SplitChild[]): DomainEvent {
  return {
    type: 'tx.split',
    id: nextEnv(),
    parentTxId,
    splits: children.map((c, i) => ({
      splitId: ulid(`SP${parentTxId.slice(-2)}${i}`),
      amountCents: c.amountCents,
      categoryId: c.categoryId,
      subcategoryId: c.subcategoryId ?? null,
      comment: null,
      sortOrder: i,
    })),
    createdAt: '2024-06-01T11:00:00.000Z',
  } as DomainEvent;
}

function seed(events: DomainEvent[]): void {
  for (const e of events) applyEvent(e);
}

/** Sum the rounded subtotals of a set of breakdown rows. */
function sumRows(rows: readonly CategoryBreakdownRow[]): number {
  return Math.round(rows.reduce((acc, r) => acc + r.total, 0) * 100) / 100;
}

beforeEach(() => {
  resetReadModel();
  seq = 0;
});

describe('getCategoryBreakdownInRange — classification & reconciliation', () => {
  it('reconciles credit/debit subtotals to getRangeKPIs (consolidated)', () => {
    seed([
      account(ACC1, 0, 0),
      account(ACC2, 0, 1),
      category(CAT_INCOME, 'Membership fees', 0),
      category(CAT_EXPENSE, 'Office expenses', 1),
      tx({ date: '2024-03-10', type: 'income', amount: 4650.0, categoryId: CAT_INCOME }),
      tx({ date: '2024-04-15', type: 'income', amount: 4856.21, categoryId: null }),
      tx({
        date: '2024-05-20',
        type: 'expense',
        amount: 8647.5,
        accountId: ACC2,
        categoryId: CAT_EXPENSE,
      }),
    ]);

    const kpis = getRangeKPIs('2024-01-01', '2024-12-31');
    const bd = getCategoryBreakdownInRange('2024-01-01', '2024-12-31', 'category');

    expect(sumRows(bd.income)).toBe(kpis.income);
    expect(sumRows(bd.expense)).toBe(kpis.expense);
    expect(kpis.income).toBe(9506.21);
    expect(kpis.expense).toBe(8647.5);
  });

  it('reconciles to getAccountBalancesInRange for a single account scope', () => {
    seed([
      account(ACC1, 0, 0),
      account(ACC2, 0, 1),
      category(CAT_INCOME, 'Income', 0),
      tx({ date: '2024-02-01', type: 'income', amount: 1000, accountId: ACC1 }),
      tx({ date: '2024-02-02', type: 'expense', amount: 250, accountId: ACC1 }),
      tx({ date: '2024-02-03', type: 'income', amount: 5000, accountId: ACC2 }),
      tx({ date: '2024-02-04', type: 'expense', amount: 999.99, accountId: ACC2 }),
    ]);

    const balances = getAccountBalancesInRange('2024-01-01', '2024-12-31');
    const acc1 = balances.find((b) => b.accountId === ACC1)!;

    const bd = getCategoryBreakdownInRange('2024-01-01', '2024-12-31', 'category', ACC1);

    expect(sumRows(bd.income)).toBe(acc1.income);
    expect(sumRows(bd.expense)).toBe(acc1.expense);
    // Single-account scope must NOT leak the global KPI totals.
    expect(sumRows(bd.income)).toBe(1000);
    expect(sumRows(bd.expense)).toBe(250);
  });

  it('classifies by Transaction.type regardless of sign or category — one category, both sides', () => {
    seed([
      account(ACC1, 0, 0),
      category(CAT_SHARED, 'Events', 0),
      tx({ date: '2024-06-01', type: 'income', amount: 300, categoryId: CAT_SHARED }),
      tx({ date: '2024-06-02', type: 'expense', amount: 120, categoryId: CAT_SHARED }),
    ]);

    const bd = getCategoryBreakdownInRange('2024-01-01', '2024-12-31', 'category');

    const incomeRow = bd.income.find((r) => r.categoryId === CAT_SHARED);
    const expenseRow = bd.expense.find((r) => r.categoryId === CAT_SHARED);
    expect(incomeRow?.total).toBe(300);
    expect(incomeRow?.label).toBe('Events');
    expect(expenseRow?.total).toBe(120);
    expect(expenseRow?.label).toBe('Events');
  });

  it('attributes split children to their own categories (parent type inherited)', () => {
    const PARENT = ulid('TXPAR');
    seed([
      account(ACC1, 0, 0),
      category(CAT_INCOME, 'Grants', 0),
      category(CAT_SHARED, 'Misc', 1),
      tx({ id: PARENT, date: '2024-07-01', type: 'income', amount: 500, categoryId: null }),
      split(PARENT, [
        { amountCents: 30000, categoryId: CAT_INCOME },
        { amountCents: 20000, categoryId: CAT_SHARED },
      ]),
    ]);

    const bd = getCategoryBreakdownInRange('2024-01-01', '2024-12-31', 'category');
    const kpis = getRangeKPIs('2024-01-01', '2024-12-31');

    expect(bd.income.find((r) => r.categoryId === CAT_INCOME)?.total).toBe(300);
    expect(bd.income.find((r) => r.categoryId === CAT_SHARED)?.total).toBe(200);
    expect(bd.expense).toHaveLength(0);
    expect(sumRows(bd.income)).toBe(kpis.income);
  });

  it('buckets uncategorised transactions under the null/Unclassified row', () => {
    seed([
      account(ACC1, 0, 0),
      category(CAT_EXPENSE, 'Office', 0),
      tx({ date: '2024-08-01', type: 'expense', amount: 75, categoryId: null }),
      tx({ date: '2024-08-02', type: 'expense', amount: 25, categoryId: CAT_EXPENSE }),
    ]);

    const bd = getCategoryBreakdownInRange('2024-01-01', '2024-12-31', 'category');

    // null categoryId is the "Unclassified" bucket; core layer leaves the label
    // null for the renderer to localise (never a hard-coded string here).
    const unclassified = bd.expense.find((r) => r.categoryId === null);
    expect(unclassified).toBeDefined();
    expect(unclassified?.label).toBeNull();
    expect(unclassified?.total).toBe(75);
  });

  it('subcategory mode: subcategory-less tx falls under null sub-row of its category', () => {
    seed([
      account(ACC1, 0, 0),
      category(CAT_EXPENSE, 'Events', 0),
      subcategory(SUB_A, CAT_EXPENSE, 'Madrid'),
      tx({
        date: '2024-09-01',
        type: 'expense',
        amount: 100,
        categoryId: CAT_EXPENSE,
        subcategoryId: SUB_A,
      }),
      tx({
        date: '2024-09-02',
        type: 'expense',
        amount: 40,
        categoryId: CAT_EXPENSE,
        subcategoryId: null,
      }),
    ]);

    const bd = getCategoryBreakdownInRange('2024-01-01', '2024-12-31', 'category-subcategory');
    const row = bd.expense.find((r) => r.categoryId === CAT_EXPENSE)!;

    expect(row.total).toBe(140);
    expect(row.subRows).toBeDefined();
    const named = row.subRows!.find((s) => s.subcategoryId === SUB_A);
    const unnamed = row.subRows!.find((s) => s.subcategoryId === null);
    expect(named?.label).toBe('Madrid');
    expect(named?.total).toBe(100);
    expect(unnamed?.label).toBeNull();
    expect(unnamed?.total).toBe(40);
    // Subcategory subtotals reconcile to the category total.
    expect(Math.round(row.subRows!.reduce((a, s) => a + s.total, 0) * 100) / 100).toBe(row.total);
  });

  it('category mode omits subRows; subcategory mode includes them', () => {
    seed([
      account(ACC1, 0, 0),
      category(CAT_EXPENSE, 'Events', 0),
      subcategory(SUB_B, CAT_EXPENSE, 'Lisbon'),
      tx({
        date: '2024-10-01',
        type: 'expense',
        amount: 60,
        categoryId: CAT_EXPENSE,
        subcategoryId: SUB_B,
      }),
    ]);

    const flat = getCategoryBreakdownInRange('2024-01-01', '2024-12-31', 'category');
    const nested = getCategoryBreakdownInRange('2024-01-01', '2024-12-31', 'category-subcategory');

    expect(flat.expense[0]!.subRows).toBeUndefined();
    expect(nested.expense[0]!.subRows).toHaveLength(1);
  });

  it('empty range returns empty line items', () => {
    seed([account(ACC1, 0, 0), tx({ date: '2023-12-31', type: 'income', amount: 100 })]);

    const bd = getCategoryBreakdownInRange('2024-01-01', '2024-12-31', 'category');
    expect(bd.income).toHaveLength(0);
    expect(bd.expense).toHaveLength(0);
  });
});

describe('getReconciliationForRange — opening/closing', () => {
  it('replicates the RSE worked example (32162.93 + 9506.21 − 8647.50 = 33021.64)', () => {
    seed([
      account(ACC1, 32162.93, 0),
      category(CAT_INCOME, 'Membership fees', 0),
      category(CAT_EXPENSE, 'Expenses', 1),
      tx({ date: '2024-03-10', type: 'income', amount: 4650.0, categoryId: CAT_INCOME }),
      tx({ date: '2024-04-15', type: 'income', amount: 4856.21, categoryId: CAT_INCOME }),
      tx({ date: '2024-05-20', type: 'expense', amount: 8647.5, categoryId: CAT_EXPENSE }),
    ]);

    const rec = getReconciliationForRange('2024-01-01', '2024-12-31');
    expect(rec.opening).toBe(32162.93);
    expect(rec.credits).toBe(9506.21);
    expect(rec.debits).toBe(8647.5);
    expect(rec.closing).toBe(33021.64);
    expect(rec.closing).toBe(Math.round((rec.opening + rec.credits - rec.debits) * 100) / 100);
  });

  it('opening includes stored openingBalance plus the net of pre-period transactions', () => {
    seed([
      account(ACC1, 1000, 0),
      tx({ date: '2023-06-01', type: 'income', amount: 500 }), // before period
      tx({ date: '2023-09-01', type: 'expense', amount: 200 }), // before period
      tx({ date: '2024-02-01', type: 'income', amount: 300 }), // in period
    ]);

    const rec = getReconciliationForRange('2024-01-01', '2024-12-31');
    // opening = 1000 + (500 − 200) = 1300
    expect(rec.opening).toBe(1300);
    expect(rec.credits).toBe(300);
    expect(rec.debits).toBe(0);
    expect(rec.closing).toBe(1600);
  });

  it('scopes opening/closing to a single account', () => {
    seed([
      account(ACC1, 1000, 0),
      account(ACC2, 5000, 1),
      tx({ date: '2023-12-01', type: 'income', amount: 100, accountId: ACC1 }),
      tx({ date: '2023-12-01', type: 'income', amount: 9999, accountId: ACC2 }),
      tx({ date: '2024-03-01', type: 'expense', amount: 50, accountId: ACC1 }),
      tx({ date: '2024-03-01', type: 'income', amount: 7, accountId: ACC2 }),
    ]);

    const rec = getReconciliationForRange('2024-01-01', '2024-12-31', ACC1);
    // opening = 1000 + 100 (pre-period ACC1 only); ACC2 excluded
    expect(rec.opening).toBe(1100);
    expect(rec.credits).toBe(0);
    expect(rec.debits).toBe(50);
    expect(rec.closing).toBe(1050);
  });

  it('empty range: opening equals closing', () => {
    seed([account(ACC1, 2500, 0)]);

    const rec = getReconciliationForRange('2024-01-01', '2024-12-31');
    expect(rec.credits).toBe(0);
    expect(rec.debits).toBe(0);
    expect(rec.opening).toBe(2500);
    expect(rec.closing).toBe(2500);
    expect(rec.closing).toBe(rec.opening);
  });

  it('consolidated credits/debits equal the breakdown subtotals and getRangeKPIs', () => {
    seed([
      account(ACC1, 0, 0),
      account(ACC2, 0, 1),
      category(CAT_INCOME, 'Income', 0),
      tx({ date: '2024-04-01', type: 'income', amount: 1234.56, accountId: ACC1 }),
      tx({ date: '2024-04-02', type: 'expense', amount: 78.9, accountId: ACC2 }),
    ]);

    const rec = getReconciliationForRange('2024-01-01', '2024-12-31');
    const kpis = getRangeKPIs('2024-01-01', '2024-12-31');
    const bd = getCategoryBreakdownInRange('2024-01-01', '2024-12-31', 'category');

    expect(rec.credits).toBe(kpis.income);
    expect(rec.debits).toBe(kpis.expense);
    expect(rec.credits).toBe(sumRows(bd.income));
    expect(rec.debits).toBe(sumRows(bd.expense));
  });
});
