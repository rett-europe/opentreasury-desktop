// Saldo IPC contract — WI-22.
// Single aggregation endpoint backing the Saldo screen (income/expense
// panels, monthly 12/3/1-bucket series, KPI strip with projected deltas).
//
// Locked semantics (Pedro, 2026-04-22):
//   - "Mes" compares same-month-prior-year (abr 2026 vs abr 2025), NOT the
//     previous calendar month.
//   - Default period is Año (current year vs prior year).
//   - Partial-period projection is linear pro-rata, UTC inclusive day count.
//   - Monthly series (12/3/1 buckets) is NEVER projected — only the
//     `currentPeriod` totals carry a projection. This applies to BOTH
//     `monthlySeries` (current period) and `priorMonthlySeries` (prior
//     same-period window) — both are raw unprojected buckets, shape-identical.
//   - Projection lives on the server (server-derived-fields pattern); the
//     renderer renders `currentProjectedTotal` verbatim, never recomputes.

import { z } from 'zod';

// IPC channel name
export const IPC_SALDO_GET_COMPARISON = 'saldo:get-comparison';

// ============================================================================
// Request
// ============================================================================

// Period granularity. Spanish shortcodes — the UI selector uses them verbatim
// and we keep the wire format stable rather than re-mapping on either side.
export const saldoPeriodSchema = z.enum(['ano', 'trim', 'mes']);
export type SaldoPeriod = z.infer<typeof saldoPeriodSchema>;

export const saldoComparisonRequestSchema = z.object({
  period: saldoPeriodSchema,
  // ISO date (YYYY-MM-DD) of the FIRST day of the current period. The server
  // derives exact boundaries and the matching same-period-prior-year window.
  //   - ano  → first day of the year, e.g. 2026-01-01.
  //   - trim → first day of the quarter, e.g. 2026-04-01 (Q2).
  //   - mes  → first day of the month, e.g. 2026-04-01.
  anchor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.literal('EUR').optional(),
});

export type SaldoComparisonRequest = z.infer<typeof saldoComparisonRequestSchema>;

// ============================================================================
// Response — nested shapes
// ============================================================================

// Signed net per category for one period. `categoryId=null` is the
// "uncategorized" bucket. `income`/`expense` are non-negative amounts (so
// `net = income - expense`).
export const saldoCategoryNetSchema = z.object({
  categoryId: z.string().nullable(),
  // `null` when the transaction's category is missing (deleted) or the
  // bucket is the explicit uncategorized bucket (`categoryId === null`).
  // The renderer resolves a locale-appropriate label via i18n.
  categoryName: z.string().nullable(),
  income: z.number().nonnegative(),
  expense: z.number().nonnegative(),
});
export type SaldoCategoryNet = z.infer<typeof saldoCategoryNetSchema>;

// Projection for the current period ONLY. `null` when the period is complete
// (i.e. today >= end). When non-null, `income`/`expense` are pro-rated totals
// computed server-side; the renderer must render them verbatim (no local
// recompute — server-derived-fields pattern).
export const saldoProjectedTotalSchema = z.object({
  income: z.number().nonnegative(),
  expense: z.number().nonnegative(),
});
export type SaldoProjectedTotal = z.infer<typeof saldoProjectedTotalSchema>;

// Current period — includes projection + partial-ness metadata.
export const saldoCurrentPeriodSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // inclusive
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // inclusive
  totalIncome: z.number().nonnegative(),
  totalExpense: z.number().nonnegative(),
  netByCategory: z.array(saldoCategoryNetSchema),
  isPartial: z.boolean(),
  daysElapsed: z.number().int().positive(),
  daysInPeriod: z.number().int().positive(),
  // Required field in the schema (server-derived-fields pattern); value is
  // `null` when the period is complete, populated otherwise.
  currentProjectedTotal: saldoProjectedTotalSchema.nullable(),
});
export type SaldoCurrentPeriod = z.infer<typeof saldoCurrentPeriodSchema>;

// Prior period — same-period-prior-year by definition, therefore ALWAYS
// complete and NEVER projected. No partial-ness metadata.
export const saldoPriorPeriodSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalIncome: z.number().nonnegative(),
  totalExpense: z.number().nonnegative(),
  netByCategory: z.array(saldoCategoryNetSchema),
});
export type SaldoPriorPeriod = z.infer<typeof saldoPriorPeriodSchema>;

// One bucket of the monthly comparison chart (never projected).
// `monthIso` is the first day of the month, e.g. "2026-04-01".
// Bucket count: 12 for `ano`, 3 for `trim`, 1 for `mes`.
export const saldoMonthlyBucketSchema = z.object({
  monthIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  netIncome: z.number().nonnegative(),
  netExpense: z.number().nonnegative(),
});
export type SaldoMonthlyBucket = z.infer<typeof saldoMonthlyBucketSchema>;

// Biggest-category-growth callout row in the KPI strip. `null` if no category
// has a computable (prior != 0) pct growth.
export const saldoBiggestCategoryGrowthSchema = z.object({
  categoryId: z.string().nullable(),
  categoryName: z.string().nullable(),
  deltaPct: z.number(),
});
export type SaldoBiggestCategoryGrowth = z.infer<typeof saldoBiggestCategoryGrowthSchema>;

// KPI strip deltas. All deltas are signed fractions (0.1 = +10%). `null`
// when prior === 0 and therefore pct growth is undefined — renderer shows
// the "—" / "sin datos previos" affordance. When the current period is
// partial, the three period-level deltas are computed against the PROJECTED
// current total (per Link's AC4); otherwise against the raw current total.
export const saldoKpisSchema = z.object({
  netDelta: z.number().nullable(),
  incomeDelta: z.number().nullable(),
  expenseDelta: z.number().nullable(),
  biggestCategoryGrowth: saldoBiggestCategoryGrowthSchema.nullable(),
});
export type SaldoKpis = z.infer<typeof saldoKpisSchema>;

// ============================================================================
// Response — top level
// ============================================================================

export const saldoComparisonResponseSchema = z.object({
  currentPeriod: saldoCurrentPeriodSchema,
  priorPeriod: saldoPriorPeriodSchema,
  monthlySeries: z.array(saldoMonthlyBucketSchema),
  // Same shape as `monthlySeries` but keyed to the prior same-period-prior-year
  // window (e.g. 12 buckets 2025-01-01…2025-12-01 when the current period is
  // 2026 `ano`). Required — renderers get a predictable shape and can render a
  // flat line when a period has no prior data (zero-filled buckets). Never
  // projected (same rule as `monthlySeries`).
  priorMonthlySeries: z.array(saldoMonthlyBucketSchema),
  kpis: saldoKpisSchema,
});
export type SaldoComparisonResponse = z.infer<typeof saldoComparisonResponseSchema>;
