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
