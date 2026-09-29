// SPEC-030 — Financial Report IPC contract (WI-2).
//
// Two renderer→main channels (`report:build`, `report:generate`), each
// Zod-validated at the boundary (spec §7, R12/C13).
//
// HARD RULES encoded here (spec §7/§8):
//   - The renderer NEVER supplies a path string. The save destination is
//     resolved by `dialog.showSaveDialog` in main during `report:generate`;
//     the generate request carries ONLY the one-shot `confirmationToken`.
//   - No master-key material, recovery-phrase fragment, or transaction-level
//     plaintext row may appear in any schema. The `ReportModel` carries
//     AGGREGATES ONLY (line-item labels + rounded amounts the user is about to
//     print anyway), never raw rows.
//   - `report:generate` returns an outcome ('saved' | 'canceled' | 'error') —
//     never a path string back to the renderer.
//
// This module is import-safe from renderer, preload, and main (shared zone).

import { z } from 'zod';

// ============================================================================
// Channel name constants
// ============================================================================

export const IPC_REPORT_BUILD = 'report:build';
export const IPC_REPORT_GENERATE = 'report:generate';

// ============================================================================
// Primitive schemas
// ============================================================================

/** Crockford Base32 ULID — 26 chars, excludes I, L, O, U. */
const ulidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/u, 'must be a ULID');

/** ISO calendar date `YYYY-MM-DD`. */
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'must be YYYY-MM-DD');

export const reportLocaleSchema = z.enum(['es', 'en']);
export type ReportLocaleCode = z.infer<typeof reportLocaleSchema>;

export const reportPeriodKindSchema = z.enum(['calendar-year', 'custom-range']);
export type ReportPeriodKind = z.infer<typeof reportPeriodKindSchema>;

export const reportGroupingSchema = z.enum(['category', 'category-subcategory']);
export type ReportGrouping = z.infer<typeof reportGroupingSchema>;

/** Fixed in v1 (FR11) — XLSX deferred. */
export const reportFormatSchema = z.literal('pdf');
export type ReportFormat = z.infer<typeof reportFormatSchema>;

// ============================================================================
// Error codes (CE-RPT-xxx). Surfaced to the renderer; no PII, no paths.
// ============================================================================

export const reportErrorCodeSchema = z.enum([
  'REPORT_NO_WORKSPACE', // CE-RPT-001 — no unlocked workspace / encrypted-but-locked (FR14)
  'REPORT_TOKEN_INVALID', // CE-RPT-002 — token expired / replayed / wrong window
  'REPORT_DEST_INSIDE_WORKSPACE', // CE-RPT-003 — destination inside dataset root (hard block, FR14)
  'REPORT_DEST_TEMP_DIR', // CE-RPT-004 — destination resolves into a system temp dir (R6)
  'REPORT_RECONCILE_MISMATCH', // CE-RPT-005 — opening+credits−debits ≠ closing (FR20)
  'REPORT_AUDIT_FAILED', // CE-RPT-006 — audit chain verify/append failed (fail closed)
  'REPORT_RENDER_FAILED', // CE-RPT-007 — HTML → PDF render failed
  'REPORT_WRITE_FAILED', // CE-RPT-008 — file I/O / atomic rename failure
  'REPORT_INTERNAL', // CE-RPT-009 — unexpected internal error
]);
export type ReportErrorCode = z.infer<typeof reportErrorCodeSchema>;

// ============================================================================
// ReportModel — AGGREGATES ONLY (spec §7). Crosses IPC for the renderer
// preview AND is rebuilt in main from the token for the PDF render.
// ============================================================================

export const reportSignatorySchema = z
  .object({
    name: z.string(),
    role: z.string(),
    place: z.string(),
  })
  .strict();
export type ReportSignatory = z.infer<typeof reportSignatorySchema>;

export const reportSubRowSchema = z
  .object({
    label: z.string(),
    amount: z.number(),
  })
  .strict();
export type ReportSubRow = z.infer<typeof reportSubRowSchema>;

export const reportLineItemSchema = z
  .object({
    label: z.string(),
    amount: z.number(),
    subRows: z.array(reportSubRowSchema).optional(),
  })
  .strict();
export type ReportLineItem = z.infer<typeof reportLineItemSchema>;

export const reportTableSchema = z
  .object({
    rows: z.array(reportLineItemSchema),
    total: z.number(),
  })
  .strict();
export type ReportTable = z.infer<typeof reportTableSchema>;

export const reportReconciliationSchema = z
  .object({
    opening: z.number(),
    credits: z.number(),
    debits: z.number(),
    /**
     * Net money moved between the organisation's OWN accounts in the period
     * (`in − out`). Excluded from `credits`/`debits` because an internal
     * transfer is neither income nor expense. Always 0 in consolidated scope
     * (both legs cancel); non-zero when the report is scoped to one account,
     * where the transfer is real cash. Keeps
     * `opening + credits − debits + internalTransfersNet === closing`.
     */
    internalTransfersNet: z.number(),
    closing: z.number(),
  })
  .strict();
export type ReportReconciliation = z.infer<typeof reportReconciliationSchema>;

export const reportHeaderSchema = z
  .object({
    orgName: z.string(),
    legalRegistrationLine: z.string(),
    address: z.string(),
    contactEmail: z.string(),
    /** Non-sensitive branding asset, inlined as a data: URL (never a path). */
    logoDataUrl: z.string().nullable(),
    title: z.string(),
    periodLabel: z.string(),
    generatedLabel: z.string(),
  })
  .strict();
export type ReportHeader = z.infer<typeof reportHeaderSchema>;

export const reportPeriodSchema = z
  .object({
    kind: reportPeriodKindSchema,
    start: isoDateSchema,
    end: isoDateSchema,
    year: z.number().int().nullable(),
  })
  .strict();
export type ReportPeriod = z.infer<typeof reportPeriodSchema>;

export const reportModelSchema = z
  .object({
    locale: reportLocaleSchema,
    grouping: reportGroupingSchema,
    header: reportHeaderSchema,
    scopeLabel: z.string(),
    credits: reportTableSchema,
    debits: reportTableSchema,
    reconciliation: reportReconciliationSchema,
    period: reportPeriodSchema,
    signatures: z
      .object({
        treasurer: reportSignatorySchema,
        auditor: reportSignatorySchema,
      })
      .strict(),
  })
  .strict();
export type ReportModel = z.infer<typeof reportModelSchema>;

// ============================================================================
// report:build (renderer → main). Returns the aggregate-only ReportModel for
// the preview plus a one-shot confirmation token (TTL ≤ 60s, bound to params).
// ============================================================================

export const reportBuildRequestSchema = z
  .object({
    periodKind: reportPeriodKindSchema,
    periodStart: isoDateSchema,
    periodEnd: isoDateSchema,
    // empty/undefined = all accounts (consolidated); a single id = per-account.
    // WI-1 queries scope to one account or all — a subset (>1) is out of scope.
    accountIds: z.array(ulidSchema).max(1).optional(),
    grouping: reportGroupingSchema,
    locale: reportLocaleSchema,
  })
  .strict()
  .refine((r) => r.periodStart <= r.periodEnd, {
    message: 'periodStart must be on or before periodEnd',
    path: ['periodStart'],
  });
export type ReportBuildRequest = z.infer<typeof reportBuildRequestSchema>;

export const reportBuildResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    model: reportModelSchema,
    confirmationToken: z.string().min(1),
  }),
  z.object({ ok: z.literal(false), code: reportErrorCodeSchema }),
]);
export type ReportBuildResponse = z.infer<typeof reportBuildResponseSchema>;

// ============================================================================
// report:generate (renderer → main) — carries ONLY the one-shot token. No
// path, no params, no format (fixed to pdf in v1). Response is an outcome —
// never a path string.
// ============================================================================

export const reportGenerateRequestSchema = z
  .object({
    confirmationToken: z.string().min(1),
  })
  .strict();
export type ReportGenerateRequest = z.infer<typeof reportGenerateRequestSchema>;

export const reportGenerateResponseSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('saved'), basename: z.string().min(1) }),
  z.object({ outcome: z.literal('canceled') }),
  z.object({ outcome: z.literal('error'), code: reportErrorCodeSchema }),
]);
export type ReportGenerateResponse = z.infer<typeof reportGenerateResponseSchema>;
