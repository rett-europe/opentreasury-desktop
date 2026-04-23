// Saldo read-model aggregation (WI-22, S2 + S3).
//
// Pure, on-demand aggregation over the hydrated read model. No new events,
// no materialized buckets — per Neo's thin spec (neo-wi22-saldo-thinspec §2),
// one O(n) pass over model.transactions at ≤1k-event scale is <5 ms and the
// IPC round trip dominates.
//
// Locked semantics (Pedro):
//   * Period = 'ano' | 'trim' | 'mes'. Anchor is the ISO first day of the
//     current period.
//   * "Prior" is ALWAYS same-period-prior-year (e.g. abr 2026 → abr 2025),
//     across all three granularities. Never prior calendar month.
//   * Default caller-side period is 'ano' with anchor = Jan 1 of current year.
//   * Partial-period projection is linear pro-rata, UTC inclusive day count:
//       projected = actual * (daysInPeriod / daysElapsed)
//     applied to totalIncome and totalExpense (NOT to per-category rows, NOT
//     to the monthly series — per thin-spec §5). Applies to BOTH
//     `monthlySeries` and `priorMonthlySeries` — the prior-year monthly
//     buckets share the current-period never-projected rule.
//   * Server-derived-fields pattern: currentProjectedTotal is a REQUIRED
//     response field (null iff period complete). Renderer renders verbatim.

import type {
  SaldoComparisonRequest,
  SaldoComparisonResponse,
  SaldoCategoryNet,
  SaldoMonthlyBucket,
  SaldoPeriod,
} from '../../shared/ipc-contracts/saldo';
import type { ReadModel } from './types';
import { getReadModel } from './reducers';

// ----- Category-name resolution -----------------------------------------
// Transactions carry a categoryId that references model.configCategories.
// Archived categories still resolve (users shouldn't lose the label on
// historical tx); deleted-or-null categories resolve to `null` so the
// renderer can render a locale-appropriate label via i18n (see
// `saldo.panel.uncategorized` in common.json). User-facing strings must
// not live in the core/query layer.
function resolveCategoryName(categoryId: string | null, model: ReadModel): string | null {
  if (categoryId === null) return null;
  const c = model.configCategories.find((x) => x.id === categoryId);
  return c?.name ?? null;
}

// ----- Date helpers (UTC, inclusive) -------------------------------------
// Everything below works in UTC. Day counting is inclusive on both ends so
// `daysBetween('2026-01-01','2026-01-01') + 1 === 1`.

function parseUtcDate(iso: string): Date {
  // "YYYY-MM-DD" → midnight UTC. Avoids local-TZ drift.
  const [y, m, d] = iso.split('-').map((s) => Number.parseInt(s, 10));
  if (!y || !m || !d) throw new Error(`Invalid ISO date: ${iso}`);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatUtcDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetweenInclusive(startIso: string, endIso: string): number {
  const start = parseUtcDate(startIso).getTime();
  const end = parseUtcDate(endIso).getTime();
  return Math.round((end - start) / MS_PER_DAY) + 1;
}

// ----- Period resolution -------------------------------------------------

export interface PeriodRange {
  readonly start: string; // ISO, inclusive
  readonly end: string; // ISO, inclusive
}

function lastDayOfMonth(year: number, monthIdx0: number): number {
  // monthIdx0 is 0..11. Day 0 of next month === last day of this month.
  return new Date(Date.UTC(year, monthIdx0 + 1, 0)).getUTCDate();
}

function resolvePeriodRange(period: SaldoPeriod, anchorIso: string): PeriodRange {
  const anchor = parseUtcDate(anchorIso);
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth(); // 0..11

  if (period === 'ano') {
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
  if (period === 'trim') {
    const qStartMonth = Math.floor(m / 3) * 3; // 0, 3, 6, 9
    const qEndMonth = qStartMonth + 2;
    const endDay = lastDayOfMonth(y, qEndMonth);
    return {
      start: `${y}-${String(qStartMonth + 1).padStart(2, '0')}-01`,
      end: `${y}-${String(qEndMonth + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`,
    };
  }
  // 'mes'
  const endDay = lastDayOfMonth(y, m);
  return {
    start: `${y}-${String(m + 1).padStart(2, '0')}-01`,
    end: `${y}-${String(m + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`,
  };
}

// "Same period prior year" — by definition never a leap-day hazard because
// we shift YEAR only and re-derive the month's last day. (E.g. 2024-02-29
// as the current end collapses to 2023-02-28 for the prior end.)
function shiftPriorYear(range: PeriodRange): PeriodRange {
  const [sy, sm, sd] = range.start.split('-').map((s) => Number.parseInt(s, 10));
  const [ey, em] = range.end.split('-').map((s) => Number.parseInt(s, 10));
  const priorStart = `${sy! - 1}-${String(sm!).padStart(2, '0')}-${String(sd!).padStart(2, '0')}`;
  const priorEndDay = lastDayOfMonth(ey! - 1, em! - 1);
  const priorEnd = `${ey! - 1}-${String(em!).padStart(2, '0')}-${String(priorEndDay).padStart(2, '0')}`;
  return { start: priorStart, end: priorEnd };
}

// ----- Aggregation core --------------------------------------------------

interface TotalsAgg {
  totalIncome: number;
  totalExpense: number;
  byCategory: Map<string | null, { name: string | null; income: number; expense: number }>;
}

function aggregateTotals(model: ReadModel, range: PeriodRange): TotalsAgg {
  const agg: TotalsAgg = {
    totalIncome: 0,
    totalExpense: 0,
    byCategory: new Map(),
  };
  for (const tx of model.transactions) {
    // date is YYYY-MM-DD — lexical compare is safe against inclusive bounds.
    if (tx.date < range.start || tx.date > range.end) continue;
    if (tx.type === 'income') agg.totalIncome += tx.amount;
    else agg.totalExpense += tx.amount;
    const key = tx.categoryId;
    const existing = agg.byCategory.get(key);
    if (existing) {
      if (tx.type === 'income') existing.income += tx.amount;
      else existing.expense += tx.amount;
    } else {
      agg.byCategory.set(key, {
        name: resolveCategoryName(key, model),
        income: tx.type === 'income' ? tx.amount : 0,
        expense: tx.type === 'expense' ? tx.amount : 0,
      });
    }
  }
  return agg;
}

function toCategoryNetArray(agg: TotalsAgg): SaldoCategoryNet[] {
  const rows: SaldoCategoryNet[] = [];
  for (const [categoryId, value] of agg.byCategory) {
    rows.push({
      categoryId,
      categoryName: value.name,
      income: round2(value.income),
      expense: round2(value.expense),
    });
  }
  // Deterministic order for UI + test stability: net desc, tie → name asc,
  // tie → categoryId string (null sorts last).
  rows.sort((a, b) => {
    const netA = a.income - a.expense;
    const netB = b.income - b.expense;
    if (netA !== netB) return netB - netA;
    // null category names sort last (matches null categoryId tiebreak).
    const nameA = a.categoryName ?? '\uffff';
    const nameB = b.categoryName ?? '\uffff';
    const nameCmp = nameA.localeCompare(nameB);
    if (nameCmp !== 0) return nameCmp;
    const idA = a.categoryId ?? '\uffff';
    const idB = b.categoryId ?? '\uffff';
    return idA.localeCompare(idB);
  });
  return rows;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ----- Monthly series (never projected) ---------------------------------

function buildMonthlySeries(model: ReadModel, range: PeriodRange): SaldoMonthlyBucket[] {
  // Enumerate the months contained in [range.start, range.end] inclusive.
  const start = parseUtcDate(range.start);
  const end = parseUtcDate(range.end);
  const buckets: SaldoMonthlyBucket[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor.getTime() <= end.getTime()) {
    buckets.push({
      monthIso: formatUtcDate(cursor),
      netIncome: 0,
      netExpense: 0,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  // Index by YYYY-MM prefix for O(1) lookup in the tx pass.
  const byPrefix = new Map<string, SaldoMonthlyBucket>();
  for (const b of buckets) {
    byPrefix.set(b.monthIso.substring(0, 7), b);
  }

  for (const tx of model.transactions) {
    if (tx.date < range.start || tx.date > range.end) continue;
    const prefix = tx.date.substring(0, 7);
    const bucket = byPrefix.get(prefix);
    if (!bucket) continue;
    if (tx.type === 'income') bucket.netIncome += tx.amount;
    else bucket.netExpense += tx.amount;
  }

  for (const b of buckets) {
    b.netIncome = round2(b.netIncome);
    b.netExpense = round2(b.netExpense);
  }
  return buckets;
}

// ----- Projection (S3) --------------------------------------------------

interface ProjectionResult {
  isPartial: boolean;
  daysElapsed: number;
  daysInPeriod: number;
  projectedIncome: number | null;
  projectedExpense: number | null;
}

export function computeProjection(
  range: PeriodRange,
  totalIncome: number,
  totalExpense: number,
  now: Date,
): ProjectionResult {
  const daysInPeriod = daysBetweenInclusive(range.start, range.end);
  // Clamp today to start of day UTC, then to [range.start, range.end].
  const todayIso = formatUtcDate(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
  );
  let effectiveEndIso: string;
  if (todayIso < range.start) {
    // Period hasn't started yet — treat as partial with 1 day elapsed so the
    // renderer still has a valid denominator (Neo §5 locked to min 1).
    effectiveEndIso = range.start;
  } else if (todayIso > range.end) {
    effectiveEndIso = range.end;
  } else {
    effectiveEndIso = todayIso;
  }
  const daysElapsed = Math.max(1, daysBetweenInclusive(range.start, effectiveEndIso));

  const isPartial = todayIso < range.end;
  if (!isPartial) {
    return {
      isPartial: false,
      daysElapsed,
      daysInPeriod,
      projectedIncome: null,
      projectedExpense: null,
    };
  }
  const scale = daysInPeriod / daysElapsed;
  return {
    isPartial: true,
    daysElapsed,
    daysInPeriod,
    projectedIncome: round2(totalIncome * scale),
    projectedExpense: round2(totalExpense * scale),
  };
}

// ----- KPIs --------------------------------------------------------------

function pctDelta(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return (current - prior) / prior;
}

function biggestCategoryGrowth(
  currentRows: readonly SaldoCategoryNet[],
  priorRows: readonly SaldoCategoryNet[],
): { categoryId: string | null; categoryName: string | null; deltaPct: number } | null {
  // Net-based pct growth per category. Only categories with non-zero prior
  // net have a computable pct; pick the largest positive deltaPct.
  const priorByKey = new Map<string, SaldoCategoryNet>();
  for (const r of priorRows) priorByKey.set(r.categoryId ?? '__null__', r);
  let best: {
    categoryId: string | null;
    categoryName: string | null;
    deltaPct: number;
  } | null = null;
  for (const cur of currentRows) {
    const key = cur.categoryId ?? '__null__';
    const prior = priorByKey.get(key);
    if (!prior) continue;
    const priorNet = prior.income - prior.expense;
    const curNet = cur.income - cur.expense;
    if (priorNet === 0) continue;
    const delta = (curNet - priorNet) / priorNet;
    if (best === null || delta > best.deltaPct) {
      best = {
        categoryId: cur.categoryId,
        categoryName: cur.categoryName,
        deltaPct: delta,
      };
    }
  }
  return best;
}

// ----- Public API --------------------------------------------------------

export interface SaldoComparisonDeps {
  readonly now?: () => Date;
  readonly getReadModel?: () => ReadModel;
}

/**
 * Compute the full Saldo comparison response for a given period/anchor.
 * Pure with respect to injected `now` + `getReadModel`; in production both
 * default to the singleton bootstrap-hydrated read model and the real clock.
 */
export function getSaldoComparison(
  request: SaldoComparisonRequest,
  deps: SaldoComparisonDeps = {},
): SaldoComparisonResponse {
  const model = deps.getReadModel?.() ?? getReadModel();
  const now = deps.now?.() ?? new Date();

  const currentRange = resolvePeriodRange(request.period, request.anchor);
  const priorRange = shiftPriorYear(currentRange);

  const currentAgg = aggregateTotals(model, currentRange);
  const priorAgg = aggregateTotals(model, priorRange);

  const currentRows = toCategoryNetArray(currentAgg);
  const priorRows = toCategoryNetArray(priorAgg);

  const monthlySeries = buildMonthlySeries(model, currentRange);
  const priorMonthlySeries = buildMonthlySeries(model, priorRange);

  // New chart inputs (Saldo redesign, Pedro 2026-04): always 12 buckets of
  // absolute income / expense for the CALENDAR YEAR that contains the anchor,
  // independent of `period`. The renderer renders these verbatim; YoY lives
  // in the per-category panels.
  const anchorYear = parseUtcDate(request.anchor).getUTCFullYear();
  const fullYearRange: PeriodRange = {
    start: `${anchorYear}-01-01`,
    end: `${anchorYear}-12-31`,
  };
  const fullYearBuckets = buildMonthlySeries(model, fullYearRange);
  const monthlyIncome = fullYearBuckets.map((b) => b.netIncome);
  const monthlyExpense = fullYearBuckets.map((b) => b.netExpense);

  const projection = computeProjection(
    currentRange,
    currentAgg.totalIncome,
    currentAgg.totalExpense,
    now,
  );

  // Per AC4: when partial, deltas are computed against PROJECTED current.
  const effectiveIncome =
    projection.isPartial && projection.projectedIncome !== null
      ? projection.projectedIncome
      : round2(currentAgg.totalIncome);
  const effectiveExpense =
    projection.isPartial && projection.projectedExpense !== null
      ? projection.projectedExpense
      : round2(currentAgg.totalExpense);
  const priorIncome = round2(priorAgg.totalIncome);
  const priorExpense = round2(priorAgg.totalExpense);
  const effectiveNet = effectiveIncome - effectiveExpense;
  const priorNet = priorIncome - priorExpense;

  return {
    currentPeriod: {
      start: currentRange.start,
      end: currentRange.end,
      totalIncome: round2(currentAgg.totalIncome),
      totalExpense: round2(currentAgg.totalExpense),
      netByCategory: currentRows,
      isPartial: projection.isPartial,
      daysElapsed: projection.daysElapsed,
      daysInPeriod: projection.daysInPeriod,
      currentProjectedTotal:
        projection.isPartial &&
        projection.projectedIncome !== null &&
        projection.projectedExpense !== null
          ? {
              income: projection.projectedIncome,
              expense: projection.projectedExpense,
            }
          : null,
    },
    priorPeriod: {
      start: priorRange.start,
      end: priorRange.end,
      totalIncome: priorIncome,
      totalExpense: priorExpense,
      netByCategory: priorRows,
    },
    monthlySeries,
    priorMonthlySeries,
    monthlyIncome,
    monthlyExpense,
    kpis: {
      netDelta: pctDelta(effectiveNet, priorNet),
      incomeDelta: pctDelta(effectiveIncome, priorIncome),
      expenseDelta: pctDelta(effectiveExpense, priorExpense),
      biggestCategoryGrowth: biggestCategoryGrowth(currentRows, priorRows),
    },
  };
}

// Internal test hooks — exported for unit tests only. Not part of the IPC
// surface (the IPC handler only calls `getSaldoComparison`).
export const __internal = {
  resolvePeriodRange,
  shiftPriorYear,
  daysBetweenInclusive,
};
