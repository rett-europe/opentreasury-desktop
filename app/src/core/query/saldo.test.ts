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
      income: 800,
      expense: 0,
    });
  });

  it('buckets uncategorized transactions under categoryId=null with Spanish fallback name', () => {
    const model = makeModel([{ date: '2026-02-01', type: 'income', amount: 50, categoryId: null }]);
    const res = runSaldo(model, 'ano', '2026-01-01', new Date('2027-01-10T00:00:00Z'));
    const uncat = res.currentPeriod.netByCategory.find((r) => r.categoryId === null);
    expect(uncat).toEqual({
      categoryId: null,
      categoryName: 'Sin categoría',
      income: 50,
      expense: 0,
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
