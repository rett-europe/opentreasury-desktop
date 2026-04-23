import { describe, expect, it } from 'vitest';
import {
  IPC_SALDO_GET_COMPARISON,
  saldoComparisonRequestSchema,
  saldoComparisonResponseSchema,
} from './saldo';

// Contract freeze tests — tripwires for any accidental drift in the shape
// Trinity + Cypher depend on. If one of these fails, it's NOT a flaky test:
// it means the contract moved and needs a matching amendment note.

describe('saldo IPC contract', () => {
  it('exposes the frozen channel name', () => {
    expect(IPC_SALDO_GET_COMPARISON).toBe('saldo:get-comparison');
  });

  it('parses a valid request for each period variant', () => {
    for (const period of ['ano', 'trim', 'mes'] as const) {
      expect(saldoComparisonRequestSchema.parse({ period, anchor: '2026-04-01' })).toEqual({
        period,
        anchor: '2026-04-01',
      });
    }
    expect(
      saldoComparisonRequestSchema.parse({
        period: 'ano',
        anchor: '2026-01-01',
        currency: 'EUR',
      }),
    ).toEqual({ period: 'ano', anchor: '2026-01-01', currency: 'EUR' });
  });

  it('rejects invalid periods and malformed anchors', () => {
    expect(
      saldoComparisonRequestSchema.safeParse({ period: 'year', anchor: '2026-01-01' }).success,
    ).toBe(false);
    expect(saldoComparisonRequestSchema.safeParse({ period: 'ano', anchor: '2026' }).success).toBe(
      false,
    );
    expect(
      saldoComparisonRequestSchema.safeParse({ period: 'ano', anchor: '01-01-2026' }).success,
    ).toBe(false);
  });

  it('accepts a minimally-populated complete-period response (no projection)', () => {
    const res = saldoComparisonResponseSchema.parse({
      currentPeriod: {
        start: '2025-01-01',
        end: '2025-12-31',
        totalIncome: 1000,
        totalExpense: 500,
        netByCategory: [],
        isPartial: false,
        daysElapsed: 365,
        daysInPeriod: 365,
        currentProjectedTotal: null,
      },
      priorPeriod: {
        start: '2024-01-01',
        end: '2024-12-31',
        totalIncome: 800,
        totalExpense: 400,
        netByCategory: [],
      },
      monthlySeries: [],
      priorMonthlySeries: [],
      monthlyIncome: Array(12).fill(0),
      monthlyExpense: Array(12).fill(0),
      kpis: {
        netDelta: 0.25,
        incomeDelta: 0.25,
        expenseDelta: 0.25,
        biggestCategoryGrowth: null,
      },
    });
    expect(res.currentPeriod.currentProjectedTotal).toBeNull();
    expect(res.kpis.biggestCategoryGrowth).toBeNull();
  });

  it('requires currentProjectedTotal to be present on a partial period (server-derived-fields pattern)', () => {
    const partial = {
      currentPeriod: {
        start: '2026-01-01',
        end: '2026-12-31',
        totalIncome: 300,
        totalExpense: 100,
        netByCategory: [
          { categoryId: 'c1', categoryName: 'Donaciones', income: 300, expense: 0 },
          { categoryId: null, categoryName: 'Sin categoría', income: 0, expense: 100 },
        ],
        isPartial: true,
        daysElapsed: 100,
        daysInPeriod: 365,
        currentProjectedTotal: { income: 1095, expense: 365 },
      },
      priorPeriod: {
        start: '2025-01-01',
        end: '2025-12-31',
        totalIncome: 1000,
        totalExpense: 400,
        netByCategory: [],
      },
      monthlySeries: [
        { monthIso: '2026-01-01', netIncome: 100, netExpense: 30 },
        { monthIso: '2026-02-01', netIncome: 120, netExpense: 40 },
      ],
      priorMonthlySeries: [
        { monthIso: '2025-01-01', netIncome: 80, netExpense: 20 },
        { monthIso: '2025-02-01', netIncome: 90, netExpense: 25 },
      ],
      monthlyIncome: Array(12).fill(0),
      monthlyExpense: Array(12).fill(0),
      kpis: {
        netDelta: 0.1,
        incomeDelta: 0.095,
        expenseDelta: -0.0875,
        biggestCategoryGrowth: {
          categoryId: 'c1',
          categoryName: 'Donaciones',
          deltaPct: 0.5,
        },
      },
    };
    const res = saldoComparisonResponseSchema.parse(partial);
    expect(res.currentPeriod.currentProjectedTotal).toEqual({ income: 1095, expense: 365 });
  });

  it('rejects a response that omits the required currentProjectedTotal field', () => {
    const bad = {
      currentPeriod: {
        start: '2026-01-01',
        end: '2026-12-31',
        totalIncome: 0,
        totalExpense: 0,
        netByCategory: [],
        isPartial: false,
        daysElapsed: 365,
        daysInPeriod: 365,
        // currentProjectedTotal intentionally missing
      },
      priorPeriod: {
        start: '2025-01-01',
        end: '2025-12-31',
        totalIncome: 0,
        totalExpense: 0,
        netByCategory: [],
      },
      monthlySeries: [],
      priorMonthlySeries: [],
      monthlyIncome: Array(12).fill(0),
      monthlyExpense: Array(12).fill(0),
      kpis: {
        netDelta: null,
        incomeDelta: null,
        expenseDelta: null,
        biggestCategoryGrowth: null,
      },
    };
    expect(saldoComparisonResponseSchema.safeParse(bad).success).toBe(false);
  });

  it('requires priorMonthlySeries (WI-22 amendment — additive, year-over-year chart)', () => {
    const base = {
      currentPeriod: {
        start: '2026-01-01',
        end: '2026-12-31',
        totalIncome: 0,
        totalExpense: 0,
        netByCategory: [],
        isPartial: false,
        daysElapsed: 365,
        daysInPeriod: 365,
        currentProjectedTotal: null,
      },
      priorPeriod: {
        start: '2025-01-01',
        end: '2025-12-31',
        totalIncome: 0,
        totalExpense: 0,
        netByCategory: [],
      },
      monthlySeries: [],
      monthlyIncome: Array(12).fill(0),
      monthlyExpense: Array(12).fill(0),
      kpis: {
        netDelta: null,
        incomeDelta: null,
        expenseDelta: null,
        biggestCategoryGrowth: null,
      },
    };
    // Missing priorMonthlySeries → rejected.
    expect(saldoComparisonResponseSchema.safeParse(base).success).toBe(false);
    // Zero-filled array is acceptable — e.g. empty prior window is still a valid shape.
    const ok = saldoComparisonResponseSchema.safeParse({
      ...base,
      priorMonthlySeries: [{ monthIso: '2025-01-01', netIncome: 0, netExpense: 0 }],
    });
    expect(ok.success).toBe(true);
  });
});
