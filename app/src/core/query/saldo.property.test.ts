// WI-22 — Property-based verification of Saldo aggregation invariants.
//
// Morpheus ships the aggregation as "structural" (correct by construction).
// This file promotes that assertion into a REAL gate by fuzzing randomized
// event logs (tx.created + tx.updated + tx.deleted) and checking the locked
// invariants from Neo's thin spec against a brute-force reference.
//
// Invariants checked (per period / anchor / event log):
//   I1  currentPeriod.totalIncome   === Σ type='income' tx in [start,end]
//   I2  currentPeriod.totalExpense  === Σ type='expense' tx in [start,end]
//   I3  Σ netByCategory.income      === currentPeriod.totalIncome
//   I4  Σ netByCategory.expense     === currentPeriod.totalExpense
//   I5  Σ monthlySeries.netIncome   === currentPeriod.totalIncome  (no projection drift)
//   I6  Σ monthlySeries.netExpense  === currentPeriod.totalExpense
//   I5p Σ priorMonthlySeries.netIncome  === priorPeriod.totalIncome  (mirror, never projected)
//   I6p Σ priorMonthlySeries.netExpense === priorPeriod.totalExpense
//   I7  priorPeriod totals          === brute-force over [prior.start, prior.end]
//   I8  Saldo ≡ Movements           — same period, same filter, same totals.
//
// All amounts are generated as integer-cents so float sums are bit-exact;
// saldo's round2 is idempotent on 2dp inputs, so assertions use strict ===.

import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { getSaldoComparison } from './saldo';
import type { ReadModel, Transaction, ConfigCategory } from './types';

// ---------------------------------------------------------------------------
// Event log + projection (mirrors what the reducer does for tx.* events, but
// scoped to the three fields saldo consumes: date, type, amount, categoryId).
// ---------------------------------------------------------------------------

type GenTx = {
  id: string;
  date: string;
  type: 'income' | 'expense';
  amountCents: number;
  categoryId: string | null;
};

type GenEvent =
  | { kind: 'create'; tx: GenTx }
  | { kind: 'update'; id: string; patch: Partial<Omit<GenTx, 'id'>> }
  | { kind: 'delete'; id: string };

function projectEvents(events: readonly GenEvent[]): GenTx[] {
  const byId = new Map<string, GenTx>();
  const order: string[] = [];
  for (const ev of events) {
    if (ev.kind === 'create') {
      if (!byId.has(ev.tx.id)) {
        byId.set(ev.tx.id, { ...ev.tx });
        order.push(ev.tx.id);
      }
    } else if (ev.kind === 'update') {
      const cur = byId.get(ev.id);
      if (cur) byId.set(ev.id, { ...cur, ...ev.patch });
    } else {
      if (byId.delete(ev.id)) {
        const idx = order.indexOf(ev.id);
        if (idx >= 0) order.splice(idx, 1);
      }
    }
  }
  return order.map((id) => byId.get(id)!);
}

function toReadModel(txs: readonly GenTx[], categoryIds: readonly string[]): ReadModel {
  const transactions: Transaction[] = txs.map((t) => ({
    id: t.id,
    date: t.date,
    type: t.type,
    amount: t.amountCents / 100,
    currency: 'EUR' as const,
    description: '',
    accountId: 'acc-1',
    categoryId: t.categoryId,
    subcategoryId: null,
    tagIds: [],
    status: 'approved' as const,
    createdAt: `${t.date}T00:00:00Z`,
    reference: null,
    details: null,
  }));
  const configCategories: ConfigCategory[] = categoryIds.map((id, i) => ({
    id,
    name: `Categoría ${i}`,
    createdAt: '2020-01-01T00:00:00Z',
    subcategories: [],
  }));
  return {
    transactions,
    accounts: [],
    categories: [],
    tags: [],
    configAccounts: [],
    configCategories,
    configTags: [],
    importMappings: [],
    rowHashes: new Set(),
    notes: new Map(),
    transactionsByReference: new Map(),
    splits: new Map(),
    splitParentIds: new Set(),
  };
}

// ---------------------------------------------------------------------------
// Brute-force reference implementation (Movements-style: loop + range check).
// Deliberately NOT sharing code with saldo.ts — duplication IS the test.
// ---------------------------------------------------------------------------

function refAggregate(
  txs: readonly GenTx[],
  start: string,
  end: string,
): { totalIncomeCents: number; totalExpenseCents: number } {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const tx of txs) {
    if (tx.date < start || tx.date > end) continue;
    if (tx.type === 'income') incomeCents += tx.amountCents;
    else expenseCents += tx.amountCents;
  }
  return { totalIncomeCents: incomeCents, totalExpenseCents: expenseCents };
}

const centsToEuros = (c: number): number => Math.round(c) / 100;

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

// Dates in 2020-01-01 .. 2030-12-31 (chosen to straddle saldo's prior-year
// shift: a current period in 2026 must have a well-defined 2025 prior).
const DATE_EPOCH_MS = Date.UTC(2020, 0, 1);
const DATE_END_MS = Date.UTC(2030, 11, 31);
const MS_PER_DAY = 86_400_000;
const DATE_DAYS = Math.round((DATE_END_MS - DATE_EPOCH_MS) / MS_PER_DAY) + 1;

function isoDay(dayOffset: number): string {
  const d = new Date(DATE_EPOCH_MS + dayOffset * MS_PER_DAY);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const dateArb = fc.integer({ min: 0, max: DATE_DAYS - 1 }).map(isoDay);

// Non-zero amount, up to 1e6 EUR, cent-accurate. min 1 cent, max 100_000_000.
const amountCentsArb = fc.integer({ min: 1, max: 100_000_000 });

const categoryIdPool = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'];
const categoryArb: fc.Arbitrary<string | null> = fc.option(fc.constantFrom(...categoryIdPool), {
  nil: null,
  freq: 4, // ~25% uncategorized
});

const txArb = (id: string): fc.Arbitrary<GenTx> =>
  fc.record({
    id: fc.constant(id),
    date: dateArb,
    type: fc.constantFrom<'income' | 'expense'>('income', 'expense'),
    amountCents: amountCentsArb,
    categoryId: categoryArb,
  });

// Build a sequence of events that is internally consistent: every
// update/delete references an id that was created earlier in the sequence.
// Count is 1..500 events; ~20% update/delete mix.
const eventLogArb: fc.Arbitrary<GenEvent[]> = fc.integer({ min: 1, max: 500 }).chain((n) =>
  fc.tuple(...Array.from({ length: n }, (_, i) => txArb(`tx-${i}`))).chain((baseTxs) =>
    fc
      .array(
        fc.record({
          kind: fc.constantFrom<'noop' | 'update' | 'delete'>(
            'noop',
            'noop',
            'noop',
            'noop',
            'update',
            'delete',
          ),
          targetIdx: fc.integer({ min: 0, max: Math.max(0, baseTxs.length - 1) }),
          patchDate: dateArb,
          patchAmount: amountCentsArb,
          patchType: fc.constantFrom<'income' | 'expense'>('income', 'expense'),
          patchCategory: categoryArb,
        }),
        { minLength: 0, maxLength: Math.min(baseTxs.length, 80) },
      )
      .map((mutations): GenEvent[] => {
        const events: GenEvent[] = baseTxs.map((tx) => ({ kind: 'create', tx }));
        for (const m of mutations) {
          if (m.kind === 'noop') continue;
          const id = `tx-${m.targetIdx}`;
          if (m.kind === 'update') {
            events.push({
              kind: 'update',
              id,
              patch: {
                date: m.patchDate,
                amountCents: m.patchAmount,
                type: m.patchType,
                categoryId: m.patchCategory,
              },
            });
          } else {
            events.push({ kind: 'delete', id });
          }
        }
        return events;
      }),
  ),
);

const periodArb = fc.constantFrom<'ano' | 'trim' | 'mes'>('ano', 'trim', 'mes');

// Anchor restricted to 2021..2029 so prior-year shift stays in the generated
// date range. Day is always 01 (saldo snaps to period boundaries anyway).
const anchorArb = fc
  .record({
    year: fc.integer({ min: 2021, max: 2029 }),
    month: fc.integer({ min: 1, max: 12 }),
  })
  .map(({ year, month }) => `${year}-${String(month).padStart(2, '0')}-01`);

// "Now" anywhere in the same range — drives isPartial / projection.
const nowArb = dateArb.map((iso) => new Date(`${iso}T00:00:00Z`));

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('Saldo aggregation — property-based invariants (fast-check)', () => {
  it('I1–I4: totals ≡ brute-force sums; per-category rows sum to totals', () => {
    fc.assert(
      fc.property(eventLogArb, periodArb, anchorArb, nowArb, (events, period, anchor, now) => {
        const txs = projectEvents(events);
        const model = toReadModel(txs, categoryIdPool);
        const res = getSaldoComparison(
          { period, anchor },
          { now: () => now, getReadModel: () => model },
        );

        // Brute-force reference over the SAME period saldo resolved.
        const refCur = refAggregate(txs, res.currentPeriod.start, res.currentPeriod.end);

        // I1 + I2 — totals match the reference (in cents, exact).
        expect(Math.round(res.currentPeriod.totalIncome * 100)).toBe(refCur.totalIncomeCents);
        expect(Math.round(res.currentPeriod.totalExpense * 100)).toBe(refCur.totalExpenseCents);

        // I3 + I4 — per-category rows sum to the totals (in cents, exact).
        const rowIncomeCents = res.currentPeriod.netByCategory.reduce(
          (s, r) => s + Math.round(r.income * 100),
          0,
        );
        const rowExpenseCents = res.currentPeriod.netByCategory.reduce(
          (s, r) => s + Math.round(r.expense * 100),
          0,
        );
        expect(rowIncomeCents).toBe(refCur.totalIncomeCents);
        expect(rowExpenseCents).toBe(refCur.totalExpenseCents);
      }),
      { numRuns: 120, verbose: true },
    );
  });

  it('I5–I6: monthly series totals (unprojected) sum to currentPeriod raw totals', () => {
    fc.assert(
      fc.property(eventLogArb, periodArb, anchorArb, nowArb, (events, period, anchor, now) => {
        const txs = projectEvents(events);
        const model = toReadModel(txs, categoryIdPool);
        const res = getSaldoComparison(
          { period, anchor },
          { now: () => now, getReadModel: () => model },
        );

        // Bucket count invariant per spec: 12 / 3 / 1.
        const expectedBuckets = period === 'ano' ? 12 : period === 'trim' ? 3 : 1;
        expect(res.monthlySeries).toHaveLength(expectedBuckets);

        const seriesIncomeCents = res.monthlySeries.reduce(
          (s, b) => s + Math.round(b.netIncome * 100),
          0,
        );
        const seriesExpenseCents = res.monthlySeries.reduce(
          (s, b) => s + Math.round(b.netExpense * 100),
          0,
        );
        expect(seriesIncomeCents).toBe(Math.round(res.currentPeriod.totalIncome * 100));
        expect(seriesExpenseCents).toBe(Math.round(res.currentPeriod.totalExpense * 100));

        // I5p / I6p (WI-22 amendment): priorMonthlySeries mirrors the same
        // invariant against priorPeriod totals. Bucket count matches
        // monthlySeries — same granularity → same bucket count, just shifted
        // to the prior-year window.
        expect(res.priorMonthlySeries).toHaveLength(expectedBuckets);
        const priorSeriesIncomeCents = res.priorMonthlySeries.reduce(
          (s, b) => s + Math.round(b.netIncome * 100),
          0,
        );
        const priorSeriesExpenseCents = res.priorMonthlySeries.reduce(
          (s, b) => s + Math.round(b.netExpense * 100),
          0,
        );
        expect(priorSeriesIncomeCents).toBe(Math.round(res.priorPeriod.totalIncome * 100));
        expect(priorSeriesExpenseCents).toBe(Math.round(res.priorPeriod.totalExpense * 100));

        // All prior buckets must lie within the prior-year window.
        for (const b of res.priorMonthlySeries) {
          expect(b.monthIso >= res.priorPeriod.start).toBe(true);
          expect(b.monthIso <= res.priorPeriod.end).toBe(true);
        }
      }),
      { numRuns: 120, verbose: true },
    );
  });

  it('I7: prior-period totals ≡ brute-force over prior range (never projected)', () => {
    fc.assert(
      fc.property(eventLogArb, periodArb, anchorArb, nowArb, (events, period, anchor, now) => {
        const txs = projectEvents(events);
        const model = toReadModel(txs, categoryIdPool);
        const res = getSaldoComparison(
          { period, anchor },
          { now: () => now, getReadModel: () => model },
        );

        const refPrior = refAggregate(txs, res.priorPeriod.start, res.priorPeriod.end);
        expect(Math.round(res.priorPeriod.totalIncome * 100)).toBe(refPrior.totalIncomeCents);
        expect(Math.round(res.priorPeriod.totalExpense * 100)).toBe(refPrior.totalExpenseCents);

        const priorRowIncome = res.priorPeriod.netByCategory.reduce(
          (s, r) => s + Math.round(r.income * 100),
          0,
        );
        const priorRowExpense = res.priorPeriod.netByCategory.reduce(
          (s, r) => s + Math.round(r.expense * 100),
          0,
        );
        expect(priorRowIncome).toBe(refPrior.totalIncomeCents);
        expect(priorRowExpense).toBe(refPrior.totalExpenseCents);
      }),
      { numRuns: 120, verbose: true },
    );
  });

  it('I8: Saldo ≡ Movements — same period + filter yields identical totals', () => {
    // "Movements" in this app is a filtered list. The equivalence property is:
    // if a user opens Movements with the same date-range filter as Saldo's
    // current period, the sums they see are bit-identical to Saldo's totals.
    // We simulate Movements as `txs.filter(inRange).reduce(sum)` — the same
    // loop Movements' query would run.
    fc.assert(
      fc.property(eventLogArb, periodArb, anchorArb, nowArb, (events, period, anchor, now) => {
        const txs = projectEvents(events);
        const model = toReadModel(txs, categoryIdPool);
        const res = getSaldoComparison(
          { period, anchor },
          { now: () => now, getReadModel: () => model },
        );

        // Movements-style: simple range filter + per-type sum.
        const movementsInRange = txs.filter(
          (t) => t.date >= res.currentPeriod.start && t.date <= res.currentPeriod.end,
        );
        const movIncomeCents = movementsInRange
          .filter((t) => t.type === 'income')
          .reduce((s, t) => s + t.amountCents, 0);
        const movExpenseCents = movementsInRange
          .filter((t) => t.type === 'expense')
          .reduce((s, t) => s + t.amountCents, 0);

        expect(Math.round(res.currentPeriod.totalIncome * 100)).toBe(movIncomeCents);
        expect(Math.round(res.currentPeriod.totalExpense * 100)).toBe(movExpenseCents);
        expect(centsToEuros(movIncomeCents)).toBe(res.currentPeriod.totalIncome);
        expect(centsToEuros(movExpenseCents)).toBe(res.currentPeriod.totalExpense);
      }),
      { numRuns: 150, verbose: true },
    );
  });
});

// ---------------------------------------------------------------------------
// Boundary-specific deterministic tests — property tests are statistical;
// these pin behaviour at the exact corners that are most likely to regress.
// ---------------------------------------------------------------------------

function deterministicModel(txs: readonly Partial<GenTx>[]): ReadModel {
  const full: GenTx[] = txs.map((t, i) => ({
    id: t.id ?? `tx-${i}`,
    date: t.date ?? '2026-01-15',
    type: t.type ?? 'income',
    amountCents: t.amountCents ?? 10_000,
    categoryId: t.categoryId ?? null,
  }));
  return toReadModel(full, categoryIdPool);
}

describe('Saldo — boundary cases', () => {
  it('leap-day: mes abr 2024-02 vs 2023-02 (no Feb 29 in 2023) — prior collapses to 2023-02-28', () => {
    const model = deterministicModel([
      { date: '2024-02-29', type: 'income', amountCents: 5_000, categoryId: 'c1' },
      { date: '2023-02-28', type: 'income', amountCents: 3_000, categoryId: 'c1' },
    ]);
    const res = getSaldoComparison(
      { period: 'mes', anchor: '2024-02-01' },
      { now: () => new Date('2024-03-15T00:00:00Z'), getReadModel: () => model },
    );
    expect(res.currentPeriod.start).toBe('2024-02-01');
    expect(res.currentPeriod.end).toBe('2024-02-29');
    expect(res.priorPeriod.start).toBe('2023-02-01');
    expect(res.priorPeriod.end).toBe('2023-02-28'); // Pedro-locked collapse
    expect(res.currentPeriod.totalIncome).toBe(50);
    expect(res.priorPeriod.totalIncome).toBe(30);
  });

  it('period boundary: tx at 2026-01-01 lands in ano 2026, NOT 2025', () => {
    const model = deterministicModel([
      { date: '2026-01-01', type: 'income', amountCents: 10_000, categoryId: 'c1' },
      { date: '2025-12-31', type: 'income', amountCents: 20_000, categoryId: 'c1' },
    ]);
    const res2026 = getSaldoComparison(
      { period: 'ano', anchor: '2026-01-01' },
      { now: () => new Date('2027-01-10T00:00:00Z'), getReadModel: () => model },
    );
    expect(res2026.currentPeriod.totalIncome).toBe(100);
    expect(res2026.priorPeriod.totalIncome).toBe(200);
  });

  it('projection at daysElapsed=1: does not crash, produces finite projected total', () => {
    const model = deterministicModel([
      { date: '2026-01-01', type: 'income', amountCents: 1_000, categoryId: 'c1' },
    ]);
    const res = getSaldoComparison(
      { period: 'ano', anchor: '2026-01-01' },
      { now: () => new Date('2026-01-01T00:00:00Z'), getReadModel: () => model },
    );
    expect(res.currentPeriod.daysElapsed).toBe(1);
    expect(res.currentPeriod.daysInPeriod).toBe(365);
    expect(res.currentPeriod.isPartial).toBe(true);
    expect(res.currentPeriod.currentProjectedTotal).not.toBeNull();
    const projected = res.currentPeriod.currentProjectedTotal!;
    expect(Number.isFinite(projected.income)).toBe(true);
    expect(Number.isFinite(projected.expense)).toBe(true);
    // 10 EUR actual × 365/1 = 3650 EUR projected.
    expect(projected.income).toBe(3650);
  });

  it('projection at last day (daysElapsed=daysInPeriod): isPartial=false, currentProjectedTotal=null', () => {
    const model = deterministicModel([
      { date: '2026-06-15', type: 'income', amountCents: 1_000, categoryId: 'c1' },
    ]);
    const res = getSaldoComparison(
      { period: 'ano', anchor: '2026-01-01' },
      { now: () => new Date('2026-12-31T00:00:00Z'), getReadModel: () => model },
    );
    expect(res.currentPeriod.daysElapsed).toBe(365);
    expect(res.currentPeriod.daysInPeriod).toBe(365);
    expect(res.currentPeriod.isPartial).toBe(false);
    expect(res.currentPeriod.currentProjectedTotal).toBeNull();
  });

  it('zero events in period: totals=0, netByCategory=[], isPartial reflects clock', () => {
    const model = deterministicModel([]);
    const res = getSaldoComparison(
      { period: 'ano', anchor: '2026-01-01' },
      { now: () => new Date('2026-07-01T00:00:00Z'), getReadModel: () => model },
    );
    expect(res.currentPeriod.totalIncome).toBe(0);
    expect(res.currentPeriod.totalExpense).toBe(0);
    expect(res.currentPeriod.netByCategory).toEqual([]);
    expect(res.priorPeriod.netByCategory).toEqual([]);
    expect(res.currentPeriod.isPartial).toBe(true);
    expect(res.currentPeriod.currentProjectedTotal).toEqual({ income: 0, expense: 0 });

    // Same empty model but clock past period end → not partial, projection null.
    const resAfter = getSaldoComparison(
      { period: 'ano', anchor: '2026-01-01' },
      { now: () => new Date('2027-01-05T00:00:00Z'), getReadModel: () => model },
    );
    expect(resAfter.currentPeriod.isPartial).toBe(false);
    expect(resAfter.currentPeriod.currentProjectedTotal).toBeNull();
  });

  it('same-month-prior-year: abr 2026 → priorPeriod is abr 2025, NOT mar 2026', () => {
    const model = deterministicModel([]);
    const res = getSaldoComparison(
      { period: 'mes', anchor: '2026-04-01' },
      { now: () => new Date('2026-04-30T00:00:00Z'), getReadModel: () => model },
    );
    expect(res.currentPeriod.start).toBe('2026-04-01');
    expect(res.currentPeriod.end).toBe('2026-04-30');
    expect(res.priorPeriod.start).toBe('2025-04-01');
    expect(res.priorPeriod.end).toBe('2025-04-30');
  });

  it('priorMonthlySeries (WI-22): bucket count mirrors monthlySeries and is keyed to the prior window', () => {
    const model = deterministicModel([
      // Current 2026 events
      { date: '2026-04-15', type: 'income', amountCents: 10_000, categoryId: 'c1' },
      // Prior 2025 events — distributed across months so we verify bucketing,
      // not just totals.
      { date: '2025-01-10', type: 'income', amountCents: 2_500, categoryId: 'c1' },
      { date: '2025-04-20', type: 'expense', amountCents: 1_500, categoryId: 'c1' },
      { date: '2025-12-31', type: 'income', amountCents: 3_000, categoryId: 'c1' },
    ]);

    const ano = getSaldoComparison(
      { period: 'ano', anchor: '2026-01-01' },
      { now: () => new Date('2026-05-01T00:00:00Z'), getReadModel: () => model },
    );
    expect(ano.priorMonthlySeries).toHaveLength(12);
    expect(ano.priorMonthlySeries[0]!.monthIso).toBe('2025-01-01');
    expect(ano.priorMonthlySeries[11]!.monthIso).toBe('2025-12-01');
    expect(ano.priorMonthlySeries[0]).toEqual({
      monthIso: '2025-01-01',
      netIncome: 25,
      netExpense: 0,
    });
    expect(ano.priorMonthlySeries[3]).toEqual({
      monthIso: '2025-04-01',
      netIncome: 0,
      netExpense: 15,
    });
    // Σ prior buckets === prior totals (never projected).
    const sumInc = ano.priorMonthlySeries.reduce((s, b) => s + b.netIncome, 0);
    const sumExp = ano.priorMonthlySeries.reduce((s, b) => s + b.netExpense, 0);
    expect(sumInc).toBe(ano.priorPeriod.totalIncome);
    expect(sumExp).toBe(ano.priorPeriod.totalExpense);

    const trim = getSaldoComparison(
      { period: 'trim', anchor: '2026-04-01' },
      { now: () => new Date('2026-05-01T00:00:00Z'), getReadModel: () => model },
    );
    expect(trim.priorMonthlySeries).toHaveLength(3);
    expect(trim.priorMonthlySeries[0]!.monthIso).toBe('2025-04-01');

    const mes = getSaldoComparison(
      { period: 'mes', anchor: '2026-04-01' },
      { now: () => new Date('2026-05-01T00:00:00Z'), getReadModel: () => model },
    );
    expect(mes.priorMonthlySeries).toHaveLength(1);
    expect(mes.priorMonthlySeries[0]!.monthIso).toBe('2025-04-01');
  });

  it('priorMonthlySeries (WI-22): zero-filled when no prior-period data exists', () => {
    const model = deterministicModel([
      { date: '2026-06-01', type: 'income', amountCents: 10_000, categoryId: 'c1' },
    ]);
    const res = getSaldoComparison(
      { period: 'ano', anchor: '2026-01-01' },
      { now: () => new Date('2026-06-15T00:00:00Z'), getReadModel: () => model },
    );
    expect(res.priorMonthlySeries).toHaveLength(12);
    for (const b of res.priorMonthlySeries) {
      expect(b.netIncome).toBe(0);
      expect(b.netExpense).toBe(0);
      expect(b.monthIso.startsWith('2025-')).toBe(true);
    }
  });
});
