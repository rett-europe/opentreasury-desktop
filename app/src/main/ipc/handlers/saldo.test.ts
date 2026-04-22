// WI-22 — saldo:get-comparison handler integration test.
// Exercises the thin pass-through handler against a reset read model
// populated via the standard reducer path. Response-shape validation lives
// in the IPC registration (handlers.ts) — we re-parse here to mirror that.

import { describe, it, expect, beforeEach } from 'vitest';
import { handleGetSaldoComparison } from './saldo';
import {
  saldoComparisonResponseSchema,
  type SaldoComparisonRequest,
} from '../../../shared/ipc-contracts/saldo';
import { applyEvent, resetReadModel } from '../../../core/query/reducers';
import type { DomainEvent } from '../../../core/events/schemas';

const ulid = (suffix: string): string => (suffix + '0'.repeat(26)).slice(0, 26).toUpperCase();

const DATASET = ulid('DATA');
const DEVICE = ulid('DEV1');
const ACCOUNT = ulid('ACC1');
const CAT = ulid('CAT1');

let evtCounter = 0;
function envelope(): Pick<
  DomainEvent,
  'id' | 'datasetId' | 'actorDeviceId' | 'createdAt' | 'dekVersion' | 'version'
> {
  evtCounter += 1;
  return {
    id: ulid('EVT' + String(evtCounter).padStart(2, '0')),
    datasetId: DATASET,
    actorDeviceId: DEVICE,
    createdAt: '2026-04-22T10:00:00Z',
    dekVersion: 1,
    version: 1,
  };
}

function seedCategory(): void {
  applyEvent({
    ...envelope(),
    type: 'CategoryCreated',
    categoryId: CAT,
    payload: {
      name: 'Donaciones',
      color: '#111',
      kind: 'income',
      createdAt: '2025-01-01T00:00:00Z',
    },
  } as DomainEvent);
}

function seedTx(id: string, date: string, type: 'income' | 'expense', amount: number): void {
  applyEvent({
    ...envelope(),
    type: 'tx.created',
    payload: {
      id: ulid(id),
      date,
      type,
      amount,
      currency: 'EUR',
      description: 'seed',
      accountId: ACCOUNT,
      categoryId: CAT,
      subcategoryId: null,
      tagIds: [],
      status: 'approved',
      createdAt: `${date}T10:00:00Z`,
    },
  } as DomainEvent);
}

describe('handleGetSaldoComparison', () => {
  beforeEach(() => {
    resetReadModel();
    evtCounter = 0;
  });

  it('returns a Zod-valid response for an empty read model', async () => {
    const req: SaldoComparisonRequest = { period: 'ano', anchor: '2025-01-01' };
    const res = await handleGetSaldoComparison(req);
    const parsed = saldoComparisonResponseSchema.parse(res);
    expect(parsed.currentPeriod.totalIncome).toBe(0);
    expect(parsed.currentPeriod.totalExpense).toBe(0);
    expect(parsed.currentPeriod.netByCategory).toEqual([]);
    expect(parsed.monthlySeries).toHaveLength(12);
  });

  it('aggregates transactions and keeps Saldo totals === sum of event payload amounts', async () => {
    seedCategory();
    seedTx('TX01', '2025-03-10', 'income', 100);
    seedTx('TX02', '2025-07-15', 'income', 250);
    seedTx('TX03', '2025-11-20', 'expense', 40);
    // Outside year — must be ignored.
    seedTx('TX04', '2024-12-31', 'income', 999);

    const res = await handleGetSaldoComparison({ period: 'ano', anchor: '2025-01-01' });
    expect(saldoComparisonResponseSchema.safeParse(res).success).toBe(true);
    expect(res.currentPeriod.totalIncome).toBe(350);
    expect(res.currentPeriod.totalExpense).toBe(40);
    const row = res.currentPeriod.netByCategory.find((r) => r.categoryId === CAT);
    expect(row?.income).toBe(350);
    expect(row?.expense).toBe(40);
    // Invariant: per-category sums === period totals.
    const sumIncome = res.currentPeriod.netByCategory.reduce((s, r) => s + r.income, 0);
    const sumExpense = res.currentPeriod.netByCategory.reduce((s, r) => s + r.expense, 0);
    expect(sumIncome).toBe(res.currentPeriod.totalIncome);
    expect(sumExpense).toBe(res.currentPeriod.totalExpense);
  });

  it('routes mes to same-month-prior-year (abr 2026 → abr 2025)', async () => {
    seedCategory();
    seedTx('TX01', '2026-04-15', 'income', 500);
    seedTx('TX02', '2025-04-10', 'income', 300); // prior bucket
    seedTx('TX03', '2025-03-10', 'income', 999); // wrong month — must be ignored

    const res = await handleGetSaldoComparison({ period: 'mes', anchor: '2026-04-01' });
    expect(res.currentPeriod.start).toBe('2026-04-01');
    expect(res.currentPeriod.end).toBe('2026-04-30');
    expect(res.priorPeriod.start).toBe('2025-04-01');
    expect(res.priorPeriod.end).toBe('2025-04-30');
    expect(res.priorPeriod.totalIncome).toBe(300);
  });
});
