// Insights IPC contracts — landing summary and tag analytics.
// Per UX-005 final spec §6.2, provides aggregated tag metrics for the landing page.

import { z } from 'zod';

export const IPC_INSIGHTS_LANDING_SUMMARY = 'insights:landing-summary';

// ============================================================================
// Request
// ============================================================================

export const insightsLandingSummaryRequestSchema = z
  .object({
    // Optional date window. Defaults to current calendar year (Jan 1 - Dec 31 or today, whichever is earlier).
    // Both must be present or both omitted.
    dateWindow: z
      .object({
        startISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
        endISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
      })
      .optional(),
    // Optional account filter. When omitted, aggregates across all non-archived accounts.
    accountId: z.string().min(1).optional(),
  })
  .optional();

export type InsightsLandingSummaryRequest = z.infer<typeof insightsLandingSummaryRequestSchema>;

// ============================================================================
// Response
// ============================================================================

// Per-tag metrics for landing card display
export const tagSummarySchema = z.object({
  tagId: z.string().min(1),
  name: z.string(), // May be empty string if tag deleted
  color: z.string().optional(), // From TagRecord; renderer falls back to colorHash if absent
  archived: z.boolean(), // True if TagArchived event applied
  // Financial metrics in integer cents (non-negative for income/expense, signed for net)
  ingresosCents: z.number().int().nonnegative(),
  gastosCents: z.number().int().nonnegative(),
  netoCents: z.number().int(), // signed: ingresos - gastos
  // Transaction count (movements tagged with this label in the window)
  // NOTE: multi-label transactions count toward EACH label's total (overlap acknowledged per spec)
  movimientosCount: z.number().int().nonnegative(),
  // Top 2 categories by total volume (income + expense) for this tag.
  // Empty array if no transactions; max 2 entries.
  topCategorias: z.array(
    z.object({
      categoryId: z.string().min(1),
      name: z.string(),
    }),
  ),
  // Sparkline data: net per month in cents. Only present if ≥3 months with data.
  // Array of signed integers, chronologically ordered (oldest first).
  sparklineNetCents: z.array(z.number().int()).optional(),
});

export type TagSummary = z.infer<typeof tagSummarySchema>;

// Global KPIs for the landing page strip
export const landingKPIsSchema = z.object({
  etiquetasActivasCount: z.number().int().nonnegative(), // Active tags with ≥1 transaction in window
  etiquetasTotalesCount: z.number().int().nonnegative(), // Total non-archived tags
  ingresosEtiquetadosCents: z.number().int().nonnegative(), // Sum across all tagged transactions
  gastosEtiquetadosCents: z.number().int().nonnegative(), // Sum across all tagged transactions
});

export type LandingKPIs = z.infer<typeof landingKPIsSchema>;

export const insightsLandingSummaryResponseSchema = z.object({
  // Global KPIs for the KPI strip
  kpis: landingKPIsSchema,
  // Top-N tags by magnitude (|net|), descending. Default N=8 per spec.
  // Excludes tags with 0 transactions in the window.
  tags: z.array(tagSummarySchema),
  // "Otras" bucket aggregating tail tags (if >8 qualifying tags exist).
  // Null if ≤8 tags or if tail has 0 transactions.
  otrasBucket: tagSummarySchema.nullable(),
  // Resolved window bounds (inclusive). ISO YYYY-MM-DD.
  windowStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  windowEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type InsightsLandingSummaryResponse = z.infer<typeof insightsLandingSummaryResponseSchema>;

// ============================================================================
// Drilldown (label-detail) contracts — UX-005 final spec §6.3 – §6.7
// ============================================================================
//
// Multi-tag semantics (locked by spec §9 OQ-2 + task brief): a transaction
// matches if it carries ANY of the requested `tagIds` (OR). A transaction is
// counted ONCE in the aggregate even if it matches multiple of the requested
// tags — overlap is intentional and not deduplicated across tag *cards* on
// landing, but within a single drilldown aggregate the tx is summed once
// (anything else would double-count amounts inside one window).
//
// All requests share the `{ tagIds, windowStart?, windowEnd?, accountId? }`
// shape. Window dates are ISO YYYY-MM-DD; when omitted the handler defaults
// to the current calendar year (parity with `insights:landing-summary`).

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const labelDetailRequestShape = {
  tagIds: z.array(z.string().min(1)).min(1),
  windowStart: isoDateSchema.optional(),
  windowEnd: isoDateSchema.optional(),
  accountId: z.string().min(1).optional(),
};

// ---------------------------------------------------------------------------
// §6.3 — insights:label-summary (header KPIs)
// ---------------------------------------------------------------------------

export const IPC_INSIGHTS_LABEL_SUMMARY = 'insights:label-summary';

export const insightsLabelSummaryRequestSchema = z.object(labelDetailRequestShape);
export type InsightsLabelSummaryRequest = z.infer<typeof insightsLabelSummaryRequestSchema>;

export const insightsLabelSummaryResponseSchema = z.object({
  incomeCents: z.number().int().nonnegative(),
  expenseCents: z.number().int().nonnegative(),
  netCents: z.number().int(),
  txCount: z.number().int().nonnegative(),
  categoryCount: z.number().int().nonnegative(),
  accountCount: z.number().int().nonnegative(),
  windowStart: isoDateSchema,
  windowEnd: isoDateSchema,
});
export type InsightsLabelSummaryResponse = z.infer<typeof insightsLabelSummaryResponseSchema>;

// ---------------------------------------------------------------------------
// §6.4 — insights:label-by-category (donut data; income & expense per slice)
// ---------------------------------------------------------------------------

export const IPC_INSIGHTS_LABEL_BY_CATEGORY = 'insights:label-by-category';

export const insightsLabelByCategoryRequestSchema = z.object(labelDetailRequestShape);
export type InsightsLabelByCategoryRequest = z.infer<typeof insightsLabelByCategoryRequestSchema>;

export const categorySliceSchema = z.object({
  categoryId: z.string().min(1).nullable(),
  categoryName: z.string(),
  incomeCents: z.number().int().nonnegative(),
  expenseCents: z.number().int().nonnegative(),
});
export type CategorySlice = z.infer<typeof categorySliceSchema>;

export const insightsLabelByCategoryResponseSchema = z.object({
  categories: z.array(categorySliceSchema),
});
export type InsightsLabelByCategoryResponse = z.infer<typeof insightsLabelByCategoryResponseSchema>;

// ---------------------------------------------------------------------------
// §6.5 — insights:label-by-subcategory (table rows)
// ---------------------------------------------------------------------------

export const IPC_INSIGHTS_LABEL_BY_SUBCATEGORY = 'insights:label-by-subcategory';

export const insightsLabelBySubcategoryRequestSchema = z.object(labelDetailRequestShape);
export type InsightsLabelBySubcategoryRequest = z.infer<
  typeof insightsLabelBySubcategoryRequestSchema
>;

export const subcategoryRowSchema = z.object({
  categoryId: z.string().min(1).nullable(),
  categoryName: z.string(),
  subcategoryId: z.string().min(1).nullable(),
  subcategoryName: z.string(),
  incomeCents: z.number().int().nonnegative(),
  expenseCents: z.number().int().nonnegative(),
});
export type SubcategoryRow = z.infer<typeof subcategoryRowSchema>;

export const insightsLabelBySubcategoryResponseSchema = z.object({
  rows: z.array(subcategoryRowSchema),
});
export type InsightsLabelBySubcategoryResponse = z.infer<
  typeof insightsLabelBySubcategoryResponseSchema
>;

// ---------------------------------------------------------------------------
// §6.6 — insights:label-monthly-evolution (sparkline buckets)
// ---------------------------------------------------------------------------

export const IPC_INSIGHTS_LABEL_MONTHLY_EVOLUTION = 'insights:label-monthly-evolution';

export const insightsLabelMonthlyEvolutionRequestSchema = z.object(labelDetailRequestShape);
export type InsightsLabelMonthlyEvolutionRequest = z.infer<
  typeof insightsLabelMonthlyEvolutionRequestSchema
>;

export const monthBucketSchema = z.object({
  monthIso: z.string().regex(/^\d{4}-\d{2}$/),
  incomeCents: z.number().int().nonnegative(),
  expenseCents: z.number().int().nonnegative(),
});
export type MonthBucket = z.infer<typeof monthBucketSchema>;

export const insightsLabelMonthlyEvolutionResponseSchema = z.object({
  months: z.array(monthBucketSchema),
});
export type InsightsLabelMonthlyEvolutionResponse = z.infer<
  typeof insightsLabelMonthlyEvolutionResponseSchema
>;

// ---------------------------------------------------------------------------
// §6.7 — insights:label-by-account (per-account horizontal bars)
// ---------------------------------------------------------------------------

export const IPC_INSIGHTS_LABEL_BY_ACCOUNT = 'insights:label-by-account';

export const insightsLabelByAccountRequestSchema = z.object(labelDetailRequestShape);
export type InsightsLabelByAccountRequest = z.infer<typeof insightsLabelByAccountRequestSchema>;

export const accountBucketSchema = z.object({
  accountId: z.string().min(1),
  accountName: z.string(),
  accountColor: z.string(),
  incomeCents: z.number().int().nonnegative(),
  expenseCents: z.number().int().nonnegative(),
});
export type AccountBucket = z.infer<typeof accountBucketSchema>;

export const insightsLabelByAccountResponseSchema = z.object({
  accounts: z.array(accountBucketSchema),
});
export type InsightsLabelByAccountResponse = z.infer<typeof insightsLabelByAccountResponseSchema>;
