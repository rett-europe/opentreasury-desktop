import { describe, expect, it } from 'vitest';
import { getSaldoComparison, __internal } from './saldo';
import type { ReadModel, Transaction, ConfigCategory } from './types';

// Test harness — build a minimal ReadModel from a list of transactions +
// config categories, skipping the full reducer pipeline.

function makeModel(
  transactions: readonly Partial<Transaction>[],
  configCategories: readonly Partial<ConfigCategory>[] = [],
): ReadModel {
  const txs: Transaction[] = transactions.map((t, i) => ({
    id: t.id ?? `tx-${i}`,
    date: t.date ?? '2026-01-15',
    type: t.type ?? 'income',
    amount: t.amount ?? 100,
    currency: 'EUR',
    description: t.description ?? 'tx',
    accountId: t.accountId ?? 'acc-1',
    categoryId: t.categoryId ?? null,
    subcategoryId: t.subcategoryId ?? null,
    tagIds: t.tagIds ?? [],
    status: t.status ?? 'approved',
    createdAt: t.createdAt ?? '2026-01-15T10:00:00Z',
    reference: t.reference ?? null,
    details: t.details ?? null,
  }));
  const cats: ConfigCategory[] = configCategories.map((c, i) => ({
    id: c.id ?? `cat-${i}`,
    name: c.name ?? `Cat ${i}`,
    createdAt: c.createdAt ?? '2025-01-01T00:00:00Z',
    subcategories: [],
    ...c,
  }));
  return {
    transactions: txs,
    accounts: [],
    categories: [],
    tags: [],
    configAccounts: [],
    configCategories: cats,
    configTags: [],
    importMappings: [],
    rowHashes: new Set(),
    notes: new Map(),
    transactionsByReference: new Map(),
    splits: new Map(),
    splitParentIds: new Set(),
  };
}

const runSaldo = (model: ReadModel, period: 'ano' | 'trim' | 'mes', anchor: string, now: Date) =>
  getSaldoComparison({ period, anchor }, { now: () => now, getReadModel: () => model });

describe('resolvePeriodRange', () => {
  it('resolves ano to full year inclusive', () => {
    expect(__internal.resolvePeriodRange('ano', '2026-01-01')).toEqual({
      start: '2026-01-01',
      end: '2026-12-31',
    });
    // Anchor mid-year still snaps to Jan 1 / Dec 31.
    expect(__internal.resolvePeriodRange('ano', '2026-07-15')).toEqual({
      start: '2026-01-01',
      end: '2026-12-31',
    });
  });

  it('resolves trim to the quarter containing the anchor', () => {
    expect(__internal.resolvePeriodRange('trim', '2026-04-01')).toEqual({
      start: '2026-04-01',
      end: '2026-06-30',
    });
    expect(__internal.resolvePeriodRange('trim', '2026-05-15')).toEqual({
      start: '2026-04-01',
      end: '2026-06-30',
    });
    expect(__internal.resolvePeriodRange('trim', '2026-12-31')).toEqual({
      start: '2026-10-01',
      end: '2026-12-31',
    });
  });

  it('resolves mes to the full month, respecting variable lengths + leap years', () => {
    expect(__internal.resolvePeriodRange('mes', '2026-04-01')).toEqual({
      start: '2026-04-01',
      end: '2026-04-30',
    });
    expect(__internal.resolvePeriodRange('mes', '2024-02-10')).toEqual({
      start: '2024-02-01',
      end: '2024-02-29', // leap
    });
    expect(__internal.resolvePeriodRange('mes', '2025-02-10')).toEqual({
      start: '2025-02-01',
      end: '2025-02-28',
    });
  });
});

describe('shiftPriorYear — Pedro-locked same-period-prior-year semantics', () => {
  it('shifts ano back by one year', () => {
    expect(__internal.shiftPriorYear({ start: '2026-01-01', end: '2026-12-31' })).toEqual({
      start: '2025-01-01',
      end: '2025-12-31',
    });
  });
  it('shifts mes back by one year (abr 2026 → abr 2025)', () => {
    expect(__internal.shiftPriorYear({ start: '2026-04-01', end: '2026-04-30' })).toEqual({
      start: '2025-04-01',
      end: '2025-04-30',
    });
  });
  it('handles leap-year collapse on Feb', () => {
    expect(__internal.shiftPriorYear({ start: '2024-02-01', end: '2024-02-29' })).toEqual({
      start: '2023-02-01',
      end: '2023-02-28',
    });
  });
});

describe('getSaldoComparison — aggregation', () => {
  it('sums income/expense by category within the current period and same-period-prior-year', () => {
    const model = makeModel(
      [
        // 2026 Q2
        { date: '2026-04-15', type: 'income', amount: 500, categoryId: 'c1' },
        { date: '2026-04-20', type: 'expense', amount: 120, categoryId: 'c2' },
        { date: '2026-05-05', type: 'income', amount: 300, categoryId: 'c1' },
        // 2025 Q2 (prior)
        { date: '2025-04-10', type: 'income', amount: 400, categoryId: 'c1' },
        { date: '2025-06-25', type: 'expense', amount: 60, categoryId: 'c2' },
        // Outside both ranges — must be ignored
        { date: '2026-01-10', type: 'income', amount: 999, categoryId: 'c1' },
        { date: '2024-04-10', type: 'income', amount: 999, categoryId: 'c1' },
      ],
      [
        { id: 'c1', name: 'Donaciones' },
        { id: 'c2', name: 'Gastos operativos' },
      ],
    );

    // Period complete (now after end) → no projection.
    const res = runSaldo(model, 'trim', '2026-04-01', new Date('2026-07-01T00:00:00Z'));

    expect(res.currentPeriod.start).toBe('2026-04-01');
    expect(res.currentPeriod.end).toBe('2026-06-30');
    expect(res.currentPeriod.totalIncome).toBe(800);
    expect(res.currentPeriod.totalExpense).toBe(120);
    expect(res.currentPeriod.isPartial).toBe(false);
    expect(res.currentPeriod.currentProjectedTotal).toBeNull();

    expect(res.priorPeriod.start).toBe('2025-04-01');
    expect(res.priorPeriod.end).toBe('2025-06-30');
    expect(res.priorPeriod.totalIncome).toBe(400);
    expect(res.priorPeriod.totalExpense).toBe(60);

    const c1 = res.currentPeriod.netByCategory.find((r) => r.categoryId === 'c1');
    expect(c1).toEqual({
      categoryId: 'c1',
      categoryName: 'Donaciones',
      kind: 'income',
      income: 800,
      expense: 0,
      subcategories: [
        {
          subcategoryId: null,
          subcategoryName: null,
          kind: 'income',
          income: 800,
          expense: 0,
        },
      ],
    });
  });

  it('buckets uncategorized transactions under categoryId=null with null name (renderer resolves via i18n)', () => {
    const model = makeModel([{ date: '2026-02-01', type: 'income', amount: 50, categoryId: null }]);
    const res = runSaldo(model, 'ano', '2026-01-01', new Date('2027-01-10T00:00:00Z'));
    const uncat = res.currentPeriod.netByCategory.find((r) => r.categoryId === null);
    expect(uncat).toEqual({
      categoryId: null,
      categoryName: null,
      // Issue #78 — uncategorized has no intrinsic kind, projection falls back
      // to net-sign classification (income > expense → income side).
      kind: 'income',
      income: 50,
      expense: 0,
      subcategories: [
        {
          subcategoryId: null,
          subcategoryName: null,
          kind: 'income',
          income: 50,
          expense: 0,
        },
      ],
    });
  });

  it('builds exactly 12 / 3 / 1 monthly buckets and never projects them', () => {
    const model = makeModel(
      [{ date: '2026-04-15', type: 'income', amount: 1000, categoryId: 'c1' }],
      [{ id: 'c1', name: 'Donaciones' }],
    );

    const ano = runSaldo(model, 'ano', '2026-01-01', new Date('2026-04-20T00:00:00Z'));
    expect(ano.monthlySeries).toHaveLength(12);
    expect(ano.monthlySeries[0]!.monthIso).toBe('2026-01-01');
    expect(ano.monthlySeries[11]!.monthIso).toBe('2026-12-01');
    // April bucket carries the raw 1000, NOT a projected value.
    const apr = ano.monthlySeries.find((b) => b.monthIso === '2026-04-01');
    expect(apr).toEqual({ monthIso: '2026-04-01', netIncome: 1000, netExpense: 0 });

    const trim = runSaldo(model, 'trim', '2026-04-01', new Date('2026-04-20T00:00:00Z'));
    expect(trim.monthlySeries).toHaveLength(3);

    const mes = runSaldo(model, 'mes', '2026-04-01', new Date('2026-04-20T00:00:00Z'));
    expect(mes.monthlySeries).toHaveLength(1);
  });

  it('monthlyIncome / monthlyExpense: 12 buckets keyed to the anchor calendar year, split by type', () => {
    const model = makeModel(
      [
        // 2026 — should appear in the chart arrays.
        { date: '2026-01-15', type: 'income', amount: 300, categoryId: 'c1' },
        { date: '2026-01-20', type: 'expense', amount: 50, categoryId: 'c2' },
        { date: '2026-04-10', type: 'income', amount: 700, categoryId: 'c1' },
        { date: '2026-04-25', type: 'expense', amount: 120, categoryId: 'c2' },
        { date: '2026-12-31', type: 'income', amount: 40, categoryId: 'c1' },
        // 2025 — must not leak into the 2026 chart arrays.
        { date: '2025-04-10', type: 'income', amount: 999, categoryId: 'c1' },
        { date: '2025-04-10', type: 'expense', amount: 999, categoryId: 'c2' },
      ],
      [
        { id: 'c1', name: 'Donaciones' },
        { id: 'c2', name: 'Gastos' },
      ],
    );

    // Period = trim (Q2 2026) — the chart arrays are independent of period and
    // cover the full calendar year 2026.
    const res = runSaldo(model, 'trim', '2026-04-01', new Date('2027-01-10T00:00:00Z'));

    expect(res.monthlyIncome).toHaveLength(12);
    expect(res.monthlyExpense).toHaveLength(12);
    // January (idx 0) → 300 / 50.
    expect(res.monthlyIncome[0]).toBe(300);
    expect(res.monthlyExpense[0]).toBe(50);
    // April (idx 3) → 700 / 120.
    expect(res.monthlyIncome[3]).toBe(700);
    expect(res.monthlyExpense[3]).toBe(120);
    // December (idx 11) → 40 / 0.
    expect(res.monthlyIncome[11]).toBe(40);
    expect(res.monthlyExpense[11]).toBe(0);
    // Months with no activity are zero.
    expect(res.monthlyIncome[5]).toBe(0);
    expect(res.monthlyExpense[5]).toBe(0);
    // Totals over the year match Σ of each array.
    const sumIncome = res.monthlyIncome.reduce((s, v) => s + v, 0);
    const sumExpense = res.monthlyExpense.reduce((s, v) => s + v, 0);
    expect(sumIncome).toBe(1040);
    expect(sumExpense).toBe(170);
  });

  it('aggregation totals match a manual Movements-style sum (Saldo ≡ Movements invariant)', () => {
    const model = makeModel(
      Array.from({ length: 25 }, (_, i) => ({
        date: `2026-${String((i % 12) + 1).padStart(2, '0')}-15`,
        type: (i % 3 === 0 ? 'expense' : 'income') as 'income' | 'expense',
        amount: (i + 1) * 10,
        categoryId: i % 2 === 0 ? 'c1' : 'c2',
      })),
      [
        { id: 'c1', name: 'Donaciones' },
        { id: 'c2', name: 'Gastos' },
      ],
    );
    const res = runSaldo(model, 'ano', '2026-01-01', new Date('2027-01-10T00:00:00Z'));
    const incomeFromRows = res.currentPeriod.netByCategory.reduce((s, r) => s + r.income, 0);
    const expenseFromRows = res.currentPeriod.netByCategory.reduce((s, r) => s + r.expense, 0);
    expect(incomeFromRows).toBe(res.currentPeriod.totalIncome);
    expect(expenseFromRows).toBe(res.currentPeriod.totalExpense);
    // Independent naive sum — same number both sides == Movements-ish parity.
    let manualIncome = 0;
    let manualExpense = 0;
    for (const tx of model.transactions) {
      if (tx.date >= '2026-01-01' && tx.date <= '2026-12-31') {
        if (tx.type === 'income') manualIncome += tx.amount;
        else manualExpense += tx.amount;
      }
    }
    expect(res.currentPeriod.totalIncome).toBe(Math.round(manualIncome * 100) / 100);
    expect(res.currentPeriod.totalExpense).toBe(Math.round(manualExpense * 100) / 100);
  });
});

describe('getSaldoComparison — projection (S3)', () => {
  it('returns currentProjectedTotal=null when the period is complete', () => {
    const model = makeModel([
      { date: '2025-06-01', type: 'income', amount: 200, categoryId: null },
    ]);
    const res = runSaldo(model, 'ano', '2025-01-01', new Date('2026-01-10T00:00:00Z'));
    expect(res.currentPeriod.isPartial).toBe(false);
    expect(res.currentPeriod.currentProjectedTotal).toBeNull();
    expect(res.currentPeriod.daysElapsed).toBe(365);
    expect(res.currentPeriod.daysInPeriod).toBe(365);
  });

  it('computes linear pro-rata projection on partial current period', () => {
    // 2026 non-leap year → 365 days. "Today" = 2026-04-10 UTC.
    // daysElapsed = Jan 1 → Apr 10 inclusive = 31+28+31+10 = 100.
    const model = makeModel([
      { date: '2026-01-15', type: 'income', amount: 100, categoryId: null },
      { date: '2026-03-31', type: 'expense', amount: 50, categoryId: null },
    ]);
    const res = runSaldo(model, 'ano', '2026-01-01', new Date('2026-04-10T00:00:00Z'));

    expect(res.currentPeriod.isPartial).toBe(true);
    expect(res.currentPeriod.daysInPeriod).toBe(365);
    expect(res.currentPeriod.daysElapsed).toBe(100);

    // projected = actual * (365 / 100) = actual * 3.65
    expect(res.currentPeriod.currentProjectedTotal).toEqual({
      income: 365,
      expense: 182.5,
    });
  });

  it('projects both income and expense independently and uses UTC-inclusive day count', () => {
    // Mes: abr 2026 = 30 days. "Today" = abr 10 → elapsed = 10.
    const model = makeModel([
      { date: '2026-04-02', type: 'income', amount: 300, categoryId: null },
      { date: '2026-04-05', type: 'expense', amount: 100, categoryId: null },
    ]);
    const res = runSaldo(model, 'mes', '2026-04-01', new Date('2026-04-10T00:00:00Z'));
    expect(res.currentPeriod.daysInPeriod).toBe(30);
    expect(res.currentPeriod.daysElapsed).toBe(10);
    // scale = 30/10 = 3
    expect(res.currentPeriod.currentProjectedTotal).toEqual({
      income: 900,
      expense: 300,
    });
  });

  it('KPI deltas use the PROJECTED current when period is partial (AC4)', () => {
    // Current Q2 partial: 100 income, 0 expense at day 45/91 (~half).
    // Prior Q2 complete: 120 income, 0 expense.
    // Projected current income ≈ 100 * 91/45 ≈ 202.22.
    // incomeDelta = (projected - prior)/prior ≈ (202.22 - 120)/120 ≈ 0.685.
    const model = makeModel(
      [
        { date: '2026-04-15', type: 'income', amount: 100, categoryId: 'c1' },
        { date: '2025-05-10', type: 'income', amount: 120, categoryId: 'c1' },
      ],
      [{ id: 'c1', name: 'Donaciones' }],
    );
    const res = runSaldo(model, 'trim', '2026-04-01', new Date('2026-05-15T00:00:00Z'));
    expect(res.currentPeriod.isPartial).toBe(true);
    expect(res.kpis.incomeDelta).not.toBeNull();
    // Recompute from the response values for self-consistency.
    const projected = res.currentPeriod.currentProjectedTotal!;
    const expected = (projected.income - res.priorPeriod.totalIncome) / res.priorPeriod.totalIncome;
    expect(res.kpis.incomeDelta).toBeCloseTo(expected, 6);
  });

  it('returns null delta when prior period has zero', () => {
    const model = makeModel([
      { date: '2026-04-15', type: 'income', amount: 100, categoryId: null },
    ]);
    const res = runSaldo(model, 'ano', '2026-01-01', new Date('2027-01-10T00:00:00Z'));
    expect(res.priorPeriod.totalIncome).toBe(0);
    expect(res.kpis.incomeDelta).toBeNull();
    expect(res.kpis.netDelta).toBeNull();
  });
});

describe('getSaldoComparison — biggest category growth', () => {
  it('picks the category with the largest positive pct growth', () => {
    const model = makeModel(
      [
        // 2026
        { date: '2026-05-01', type: 'income', amount: 200, categoryId: 'c1' },
        { date: '2026-05-01', type: 'income', amount: 300, categoryId: 'c2' },
        // 2025
        { date: '2025-05-01', type: 'income', amount: 100, categoryId: 'c1' }, // +100%
        { date: '2025-05-01', type: 'income', amount: 250, categoryId: 'c2' }, // +20%
      ],
      [
        { id: 'c1', name: 'Donaciones' },
        { id: 'c2', name: 'Subvenciones' },
      ],
    );
    const res = runSaldo(model, 'ano', '2026-01-01', new Date('2027-01-10T00:00:00Z'));
    expect(res.kpis.biggestCategoryGrowth).not.toBeNull();
    expect(res.kpis.biggestCategoryGrowth!.categoryId).toBe('c1');
    expect(res.kpis.biggestCategoryGrowth!.deltaPct).toBeCloseTo(1.0, 6);
  });
});

// WI-B prerequisite (#67) — per-subcategory aggregation extension
describe('getSaldoComparison — subcategory aggregation (WI-B #67)', () => {
  it('populates subcategories array with income/expense per subcategory', () => {
    const model = makeModel(
      [
        { date: '2026-04-10', type: 'income', amount: 500, categoryId: 'c1', subcategoryId: 's1' },
        { date: '2026-04-15', type: 'income', amount: 300, categoryId: 'c1', subcategoryId: 's2' },
        { date: '2026-04-20', type: 'expense', amount: 120, categoryId: 'c1', subcategoryId: 's1' },
      ],
      [
        {
          id: 'c1',
          name: 'Donaciones',
          subcategories: [
            { id: 's1', parentCategoryId: 'c1', name: 'Socios', createdAt: '2025-01-01T00:00:00Z' },
            {
              id: 's2',
              parentCategoryId: 'c1',
              name: 'Empresas',
              createdAt: '2025-01-01T00:00:00Z',
            },
          ],
        },
      ],
    );

    const res = runSaldo(model, 'ano', '2026-01-01', new Date('2027-01-10T00:00:00Z'));
    const c1 = res.currentPeriod.netByCategory.find((r) => r.categoryId === 'c1');

    expect(c1).toBeDefined();
    expect(c1!.subcategories).toBeDefined();
    expect(c1!.subcategories).toHaveLength(2);

    // Sorted by abs(income - expense) desc: s1 has net 380, s2 has net 300
    expect(c1!.subcategories![0]).toEqual({
      subcategoryId: 's1',
      subcategoryName: 'Socios',
      kind: 'income',
      income: 500,
      expense: 120,
    });
    expect(c1!.subcategories![1]).toEqual({
      subcategoryId: 's2',
      subcategoryName: 'Empresas',
      kind: 'income',
      income: 300,
      expense: 0,
    });
  });

  it('sum of subcategory income equals category income (invariant AC3)', () => {
    const model = makeModel(
      [
        { date: '2026-04-10', type: 'income', amount: 500, categoryId: 'c1', subcategoryId: 's1' },
        { date: '2026-04-15', type: 'income', amount: 300, categoryId: 'c1', subcategoryId: 's2' },
        { date: '2026-04-20', type: 'income', amount: 200, categoryId: 'c1', subcategoryId: 's3' },
      ],
      [
        {
          id: 'c1',
          name: 'Donaciones',
          subcategories: [
            { id: 's1', parentCategoryId: 'c1', name: 'Socios', createdAt: '2025-01-01T00:00:00Z' },
            {
              id: 's2',
              parentCategoryId: 'c1',
              name: 'Empresas',
              createdAt: '2025-01-01T00:00:00Z',
            },
            {
              id: 's3',
              parentCategoryId: 'c1',
              name: 'Eventos',
              createdAt: '2025-01-01T00:00:00Z',
            },
          ],
        },
      ],
    );

    const res = runSaldo(model, 'ano', '2026-01-01', new Date('2027-01-10T00:00:00Z'));
    const c1 = res.currentPeriod.netByCategory.find((r) => r.categoryId === 'c1');

    expect(c1).toBeDefined();
    const sumSubcategoryIncome = c1!.subcategories!.reduce((acc, s) => acc + s.income, 0);
    expect(sumSubcategoryIncome).toBe(c1!.income);
  });

  it('sum of subcategory expense equals category expense (invariant AC4)', () => {
    const model = makeModel(
      [
        { date: '2026-04-10', type: 'expense', amount: 100, categoryId: 'c1', subcategoryId: 's1' },
        { date: '2026-04-15', type: 'expense', amount: 200, categoryId: 'c1', subcategoryId: 's2' },
        { date: '2026-04-20', type: 'expense', amount: 50, categoryId: 'c1', subcategoryId: 's3' },
      ],
      [
        {
          id: 'c1',
          name: 'Gastos',
          subcategories: [
            {
              id: 's1',
              parentCategoryId: 'c1',
              name: 'Salarios',
              createdAt: '2025-01-01T00:00:00Z',
            },
            {
              id: 's2',
              parentCategoryId: 'c1',
              name: 'Seguridad Social',
              createdAt: '2025-01-01T00:00:00Z',
            },
            {
              id: 's3',
              parentCategoryId: 'c1',
              name: 'Formación',
              createdAt: '2025-01-01T00:00:00Z',
            },
          ],
        },
      ],
    );

    const res = runSaldo(model, 'ano', '2026-01-01', new Date('2027-01-10T00:00:00Z'));
    const c1 = res.currentPeriod.netByCategory.find((r) => r.categoryId === 'c1');

    expect(c1).toBeDefined();
    const sumSubcategoryExpense = c1!.subcategories!.reduce((acc, s) => acc + s.expense, 0);
    expect(sumSubcategoryExpense).toBe(c1!.expense);
  });

  it('sorts subcategories by abs(income - expense) descending (AC5)', () => {
    const model = makeModel(
      [
        { date: '2026-04-10', type: 'income', amount: 100, categoryId: 'c1', subcategoryId: 's1' }, // net: 100
        { date: '2026-04-15', type: 'income', amount: 500, categoryId: 'c1', subcategoryId: 's2' }, // net: 500
        {
          date: '2026-04-20',
          type: 'expense',
          amount: 400,
          categoryId: 'c1',
          subcategoryId: 's3',
        }, // net: -400 (abs 400)
        { date: '2026-04-25', type: 'income', amount: 50, categoryId: 'c1', subcategoryId: 's4' }, // net: 50
      ],
      [
        {
          id: 'c1',
          name: 'Mixed',
          subcategories: [
            { id: 's1', parentCategoryId: 'c1', name: 'Sub1', createdAt: '2025-01-01T00:00:00Z' },
            { id: 's2', parentCategoryId: 'c1', name: 'Sub2', createdAt: '2025-01-01T00:00:00Z' },
            { id: 's3', parentCategoryId: 'c1', name: 'Sub3', createdAt: '2025-01-01T00:00:00Z' },
            { id: 's4', parentCategoryId: 'c1', name: 'Sub4', createdAt: '2025-01-01T00:00:00Z' },
          ],
        },
      ],
    );

    const res = runSaldo(model, 'ano', '2026-01-01', new Date('2027-01-10T00:00:00Z'));
    const c1 = res.currentPeriod.netByCategory.find((r) => r.categoryId === 'c1');

    expect(c1).toBeDefined();
    expect(c1!.subcategories).toHaveLength(4);
    // Order: s2 (500), s3 (400), s1 (100), s4 (50)
    expect(c1!.subcategories![0]!.subcategoryId).toBe('s2');
    expect(c1!.subcategories![1]!.subcategoryId).toBe('s3');
    expect(c1!.subcategories![2]!.subcategoryId).toBe('s1');
    expect(c1!.subcategories![3]!.subcategoryId).toBe('s4');
  });

  it('excludes subcategories with both income == 0 AND expense == 0', () => {
    const model = makeModel(
      [
        { date: '2026-04-10', type: 'income', amount: 500, categoryId: 'c1', subcategoryId: 's1' },
        // s2 has no transactions, should NOT appear
      ],
      [
        {
          id: 'c1',
          name: 'Donaciones',
          subcategories: [
            { id: 's1', parentCategoryId: 'c1', name: 'Socios', createdAt: '2025-01-01T00:00:00Z' },
            {
              id: 's2',
              parentCategoryId: 'c1',
              name: 'Empresas',
              createdAt: '2025-01-01T00:00:00Z',
            },
          ],
        },
      ],
    );

    const res = runSaldo(model, 'ano', '2026-01-01', new Date('2027-01-10T00:00:00Z'));
    const c1 = res.currentPeriod.netByCategory.find((r) => r.categoryId === 'c1');

    expect(c1).toBeDefined();
    expect(c1!.subcategories).toHaveLength(1);
    expect(c1!.subcategories![0]!.subcategoryId).toBe('s1');
  });

  it('handles categories with no subcategorized transactions (empty array)', () => {
    const model = makeModel(
      [{ date: '2026-04-10', type: 'income', amount: 500, categoryId: 'c1', subcategoryId: null }],
      [
        {
          id: 'c1',
          name: 'Donaciones',
          subcategories: [
            { id: 's1', parentCategoryId: 'c1', name: 'Socios', createdAt: '2025-01-01T00:00:00Z' },
          ],
        },
      ],
    );

    const res = runSaldo(model, 'ano', '2026-01-01', new Date('2027-01-10T00:00:00Z'));
    const c1 = res.currentPeriod.netByCategory.find((r) => r.categoryId === 'c1');

    expect(c1).toBeDefined();
    // Transaction has subcategoryId=null, which creates a null subcategory entry
    // (this represents uncategorized transactions within the category)
    expect(c1!.subcategories).toHaveLength(1);
    expect(c1!.subcategories![0]!.subcategoryId).toBeNull();
    expect(c1!.subcategories![0]!.subcategoryName).toBeNull();
    expect(c1!.subcategories![0]!.income).toBe(500);
  });

  it('resolves archived subcategory names (AC6)', () => {
    const model = makeModel(
      [{ date: '2026-04-10', type: 'income', amount: 500, categoryId: 'c1', subcategoryId: 's1' }],
      [
        {
          id: 'c1',
          name: 'Donaciones',
          subcategories: [
            {
              id: 's1',
              parentCategoryId: 'c1',
              name: 'Archived Sub',
              createdAt: '2025-01-01T00:00:00Z',
              archivedAt: '2026-01-01T00:00:00Z',
            },
          ],
        },
      ],
    );

    const res = runSaldo(model, 'ano', '2026-01-01', new Date('2027-01-10T00:00:00Z'));
    const c1 = res.currentPeriod.netByCategory.find((r) => r.categoryId === 'c1');

    expect(c1).toBeDefined();
    expect(c1!.subcategories).toHaveLength(1);
    expect(c1!.subcategories![0]!.subcategoryName).toBe('Archived Sub');
  });

  it('resolves deleted subcategory name to null (AC7)', () => {
    const model = makeModel(
      [
        {
          date: '2026-04-10',
          type: 'income',
          amount: 500,
          categoryId: 'c1',
          subcategoryId: 's-deleted',
        },
      ],
      [
        {
          id: 'c1',
          name: 'Donaciones',
          subcategories: [], // subcategory was deleted
        },
      ],
    );

    const res = runSaldo(model, 'ano', '2026-01-01', new Date('2027-01-10T00:00:00Z'));
    const c1 = res.currentPeriod.netByCategory.find((r) => r.categoryId === 'c1');

    expect(c1).toBeDefined();
    expect(c1!.subcategories).toHaveLength(1);
    expect(c1!.subcategories![0]!.subcategoryId).toBe('s-deleted');
    expect(c1!.subcategories![0]!.subcategoryName).toBeNull();
  });

  it('populates subcategories for both currentPeriod and priorPeriod', () => {
    const model = makeModel(
      [
        // 2026
        { date: '2026-04-10', type: 'income', amount: 500, categoryId: 'c1', subcategoryId: 's1' },
        { date: '2026-04-15', type: 'income', amount: 300, categoryId: 'c1', subcategoryId: 's2' },
        // 2025
        { date: '2025-04-10', type: 'income', amount: 400, categoryId: 'c1', subcategoryId: 's1' },
        { date: '2025-04-15', type: 'income', amount: 100, categoryId: 'c1', subcategoryId: 's2' },
      ],
      [
        {
          id: 'c1',
          name: 'Donaciones',
          subcategories: [
            { id: 's1', parentCategoryId: 'c1', name: 'Socios', createdAt: '2025-01-01T00:00:00Z' },
            {
              id: 's2',
              parentCategoryId: 'c1',
              name: 'Empresas',
              createdAt: '2025-01-01T00:00:00Z',
            },
          ],
        },
      ],
    );

    const res = runSaldo(model, 'ano', '2026-01-01', new Date('2027-01-10T00:00:00Z'));
    const currentC1 = res.currentPeriod.netByCategory.find((r) => r.categoryId === 'c1');
    const priorC1 = res.priorPeriod.netByCategory.find((r) => r.categoryId === 'c1');

    expect(currentC1!.subcategories).toHaveLength(2);
    expect(priorC1!.subcategories).toHaveLength(2);

    // Current: s1 has 500, s2 has 300
    expect(currentC1!.subcategories![0]!.subcategoryId).toBe('s1');
    expect(currentC1!.subcategories![0]!.income).toBe(500);

    // Prior: s1 has 400, s2 has 100
    expect(priorC1!.subcategories![0]!.subcategoryId).toBe('s1');
    expect(priorC1!.subcategories![0]!.income).toBe(400);
  });

  it('handles transactions with null subcategoryId (uncategorized subcategory)', () => {
    const model = makeModel(
      [
        { date: '2026-04-10', type: 'income', amount: 500, categoryId: 'c1', subcategoryId: 's1' },
        { date: '2026-04-15', type: 'income', amount: 300, categoryId: 'c1', subcategoryId: null },
      ],
      [
        {
          id: 'c1',
          name: 'Donaciones',
          subcategories: [
            { id: 's1', parentCategoryId: 'c1', name: 'Socios', createdAt: '2025-01-01T00:00:00Z' },
          ],
        },
      ],
    );

    const res = runSaldo(model, 'ano', '2026-01-01', new Date('2027-01-10T00:00:00Z'));
    const c1 = res.currentPeriod.netByCategory.find((r) => r.categoryId === 'c1');

    expect(c1).toBeDefined();
    expect(c1!.income).toBe(800); // total includes both subcategorized and not
    expect(c1!.subcategories).toHaveLength(2);

    // Should have s1 and null subcategory
    const nullSub = c1!.subcategories!.find((s) => s.subcategoryId === null);
    expect(nullSub).toBeDefined();
    expect(nullSub!.subcategoryName).toBeNull();
    expect(nullSub!.income).toBe(300);
  });
});

// Issue #78 — Category placement follows the category's intrinsic `kind`
// (income/expense), not the period's net sign. Captures Pedro's dogfood
// directive: a refund-heavy expense category whose period net is positive
// must STILL render on the expense side (with a "+" treatment); an income
// category that happens to net negative this period STILL renders on the
// income side.
describe('getSaldoComparison — classify by intrinsic category kind (#78)', () => {
  it('refund-heavy expense category stays on the expense side with positive net', () => {
    // "Gastos" is intrinsically an expense category. This period it received
    // a 1000 EUR refund (income flow) and 600 EUR of purchases — net is
    // +400, but the category must remain on the expense side.
    const model = makeModel(
      [
        { date: '2026-04-15', type: 'income', amount: 1000, categoryId: 'c-gastos' },
        { date: '2026-04-20', type: 'expense', amount: 600, categoryId: 'c-gastos' },
      ],
      [{ id: 'c-gastos', name: 'Gastos', kind: 'expense' }],
    );
    const res = runSaldo(model, 'ano', '2026-01-01', new Date('2027-01-10T00:00:00Z'));

    const row = res.currentPeriod.netByCategory.find((r) => r.categoryId === 'c-gastos');
    expect(row).toBeDefined();
    // Bucket placement is the category's intrinsic kind, not the net sign.
    expect(row!.kind).toBe('expense');
    expect(row!.income).toBe(1000);
    expect(row!.expense).toBe(600);
    // Net is positive (refund > purchases) but the row still lives on the
    // expense side — the renderer is expected to render this with a "+" on
    // the bar (Pedro's directive).
    expect(row!.income - row!.expense).toBe(400);
  });

  it('income category that nets negative (reversed deposit) stays on the income side', () => {
    // "Donaciones" is intrinsically an income category. A reversed deposit
    // pushes the period net negative (200 income vs 350 expense = -150),
    // but the category must remain on the income side.
    const model = makeModel(
      [
        { date: '2026-04-10', type: 'income', amount: 200, categoryId: 'c-don' },
        { date: '2026-04-12', type: 'expense', amount: 350, categoryId: 'c-don' },
      ],
      [{ id: 'c-don', name: 'Donaciones', kind: 'income' }],
    );
    const res = runSaldo(model, 'ano', '2026-01-01', new Date('2027-01-10T00:00:00Z'));

    const row = res.currentPeriod.netByCategory.find((r) => r.categoryId === 'c-don');
    expect(row).toBeDefined();
    expect(row!.kind).toBe('income');
    expect(row!.income).toBe(200);
    expect(row!.expense).toBe(350);
    expect(row!.income - row!.expense).toBe(-150);
  });

  it('subcategories inherit their parent category kind regardless of their own net sign', () => {
    // Parent "Gastos" is expense-typed. Subcategory s-refund nets POSITIVE
    // (refund > purchase) — but it MUST still be classified expense because
    // its parent is an expense category. Subcategory s-cost nets negative as
    // expected and is also expense.
    const model = makeModel(
      [
        // s-refund: 800 income (refund), 200 expense → net +600
        {
          date: '2026-04-10',
          type: 'income',
          amount: 800,
          categoryId: 'c1',
          subcategoryId: 's-refund',
        },
        {
          date: '2026-04-11',
          type: 'expense',
          amount: 200,
          categoryId: 'c1',
          subcategoryId: 's-refund',
        },
        // s-cost: 0 income, 500 expense → net -500
        {
          date: '2026-04-12',
          type: 'expense',
          amount: 500,
          categoryId: 'c1',
          subcategoryId: 's-cost',
        },
      ],
      [
        {
          id: 'c1',
          name: 'Gastos',
          kind: 'expense',
          subcategories: [
            {
              id: 's-refund',
              parentCategoryId: 'c1',
              name: 'Devoluciones',
              createdAt: '2025-01-01T00:00:00Z',
            },
            {
              id: 's-cost',
              parentCategoryId: 'c1',
              name: 'Compras',
              createdAt: '2025-01-01T00:00:00Z',
            },
          ],
        },
      ],
    );
    const res = runSaldo(model, 'ano', '2026-01-01', new Date('2027-01-10T00:00:00Z'));
    const row = res.currentPeriod.netByCategory.find((r) => r.categoryId === 'c1');
    expect(row).toBeDefined();
    expect(row!.kind).toBe('expense');
    // Both subcategories inherit parent's kind regardless of own net sign.
    for (const sub of row!.subcategories!) {
      expect(sub.kind).toBe('expense');
    }
  });

  it('legacy categories without kind fall back to net-sign classification', () => {
    // Backwards-compat: a ConfigCategory created before the `kind` field was
    // added (no `kind` property) gets classified by net sign — preserves
    // pre-#78 behaviour for already-imported NDJSON logs.
    const model = makeModel(
      [{ date: '2026-04-15', type: 'income', amount: 250, categoryId: 'c-legacy' }],
      [{ id: 'c-legacy', name: 'Legacy' }],
    );
    const res = runSaldo(model, 'ano', '2026-01-01', new Date('2027-01-10T00:00:00Z'));
    const row = res.currentPeriod.netByCategory.find((r) => r.categoryId === 'c-legacy');
    expect(row).toBeDefined();
    expect(row!.kind).toBe('income');
  });

  it('rows are ordered with income-kind bucket before expense-kind bucket', () => {
    const model = makeModel(
      [
        { date: '2026-04-10', type: 'income', amount: 100, categoryId: 'c-inc' },
        { date: '2026-04-12', type: 'expense', amount: 200, categoryId: 'c-exp' },
      ],
      [
        { id: 'c-inc', name: 'Ingreso', kind: 'income' },
        { id: 'c-exp', name: 'Gasto', kind: 'expense' },
      ],
    );
    const res = runSaldo(model, 'ano', '2026-01-01', new Date('2027-01-10T00:00:00Z'));
    const ids = res.currentPeriod.netByCategory.map((r) => r.categoryId);
    expect(ids.indexOf('c-inc')).toBeLessThan(ids.indexOf('c-exp'));
  });
});
