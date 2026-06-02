// SPEC-027 — Export IPC contract.
//
// Two renderer→main channels (`export:prepare`, `export:run`) plus one
// unidirectional main→renderer progress event (`export:progress`). Every
// payload is Zod-validated at the boundary (spec §7, R12/C13).
//
// HARD RULES encoded here:
//   - The renderer NEVER supplies a path string. The save destination is
//     resolved by `dialog.showSaveDialog` in main during `export:prepare`;
//     `export:run` carries only the one-shot `confirmationToken`.
//   - No master-key material, recovery-phrase fragment, or plaintext row may
//     appear in any schema. Filter values are PII-equivalent and never leave
//     the typed filter set.
//
// This module is import-safe from renderer, preload, and main (shared zone).

import { z } from 'zod';
import { dateFormatSchema, numberFormatSchema } from '../format/index.js';

// ============================================================================
// Channel name constants
// ============================================================================

export const IPC_EXPORT_PREPARE = 'export:prepare';
export const IPC_EXPORT_RUN = 'export:run';
/** Unidirectional main → renderer progress event. Counts only — never rows. */
export const IPC_EXPORT_PROGRESS = 'export:progress';
/** Reveal the last successful export for the calling window (FR19). No path crosses IPC. */
export const IPC_EXPORT_REVEAL = 'export:reveal';

// ============================================================================
// Primitive schemas
// ============================================================================

/** Crockford Base32 ULID — 26 chars, excludes I, L, O, U. */
const ulidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/u, 'must be a ULID');

/** ISO calendar date `YYYY-MM-DD`. */
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'must be YYYY-MM-DD');

export const exportFormatSchema = z.enum(['csv', 'xlsx']);
export type ExportFormat = z.infer<typeof exportFormatSchema>;

// ============================================================================
// ExportFilters (spec §7)
//
// `dateFrom`/`dateTo` are REQUIRED (Pedro's "date range mandatory" rule). The
// other facets are optional multi-selects. `labels` are length-capped and must
// not contain path separators (R17 input validation).
// ============================================================================

const labelSchema = z
  .string()
  .min(1)
  .max(64, 'label too long')
  .refine((s) => !/[\\/]/u.test(s), { message: 'label must not contain path separators' });

export const exportFiltersSchema = z
  .object({
    accountIds: z.array(ulidSchema).max(1000).optional(),
    categoryIds: z.array(ulidSchema).max(1000).optional(),
    subcategoryIds: z.array(ulidSchema).max(1000).optional(),
    labels: z.array(labelSchema).max(1000).optional(),
    dateFrom: isoDateSchema,
    dateTo: isoDateSchema,
  })
  .strict()
  .refine((f) => f.dateFrom <= f.dateTo, {
    message: 'dateFrom must be on or before dateTo',
    path: ['dateFrom'],
  });

export type ExportFilters = z.infer<typeof exportFiltersSchema>;

// ============================================================================
// Mandatory-filter gate (FR23 / AC18)
//
// A full/unfiltered export is NOT allowed. The user MUST select a date range
// (always present in the schema) PLUS at least one additional filter (account,
// category, subcategory, OR label). This pure predicate is shared by the
// renderer (button enablement) and main (authoritative re-check).
// ============================================================================

export interface MinimumFilterCandidate {
  readonly accountIds?: readonly string[] | undefined;
  readonly categoryIds?: readonly string[] | undefined;
  readonly subcategoryIds?: readonly string[] | undefined;
  readonly labels?: readonly string[] | undefined;
  readonly dateFrom?: string | undefined;
  readonly dateTo?: string | undefined;
}

export function isMinimumFilterSetSatisfied(filters: MinimumFilterCandidate): boolean {
  const hasDateRange =
    typeof filters.dateFrom === 'string' &&
    filters.dateFrom.length > 0 &&
    typeof filters.dateTo === 'string' &&
    filters.dateTo.length > 0;
  if (!hasDateRange) return false;

  const hasAdditional =
    (filters.accountIds?.length ?? 0) > 0 ||
    (filters.categoryIds?.length ?? 0) > 0 ||
    (filters.subcategoryIds?.length ?? 0) > 0 ||
    (filters.labels?.length ?? 0) > 0;
  return hasAdditional;
}

// ============================================================================
// Error codes (CE-EXP-xxx). Surfaced to the renderer; localized copy lives in
// the crypto-error-copy-catalog. No PII, no paths.
// ============================================================================

export const exportErrorCodeSchema = z.enum([
  'EXPORT_DEST_INSIDE_WORKSPACE', // CE-EXP-001 — destination inside dataset root (hard block, FR14)
  'EXPORT_ROW_CAP_EXCEEDED', // CE-EXP-002 — > 100k rows after split expansion (FR9)
  'EXPORT_MIN_FILTERS', // CE-EXP-003 — mandatory-filter gate not satisfied (FR23)
  'EXPORT_RATE_LIMITED', // CE-EXP-004 — > 3 exports / 15 min (gate cond. 3)
  'EXPORT_LOCKED_OUT', // CE-EXP-005 — 5 confirmation mistypes → 5 min lockout (gate cond. 4)
  'EXPORT_TOKEN_INVALID', // CE-EXP-006 — token expired / replayed / wrong window
  'EXPORT_DEST_TEMP_DIR', // CE-EXP-007 — destination resolves into a system temp dir (R6)
  'EXPORT_WRITE_FAILED', // CE-EXP-008 — file I/O / atomic rename failure
  'EXPORT_NO_WORKSPACE', // CE-EXP-009 — no unlocked workspace
  'EXPORT_AUDIT_FAILED', // CE-EXP-010 — audit chain verify/append failed (fail closed)
  'EXPORT_INTERNAL', // CE-EXP-011 — unexpected internal error
]);
export type ExportErrorCode = z.infer<typeof exportErrorCodeSchema>;

// ============================================================================
// export:prepare
// ============================================================================

export const exportLocaleSchema = z.enum(['es', 'en']);
export type ExportLocaleCode = z.infer<typeof exportLocaleSchema>;

export const exportPrepareRequestSchema = z
  .object({
    format: exportFormatSchema,
    filters: exportFiltersSchema,
    /** Renderer's active i18n locale — drives filename copy only (FR12). */
    locale: exportLocaleSchema,
    dateFormat: dateFormatSchema,
    numberFormat: numberFormatSchema,
  })
  .strict();
export type ExportPrepareRequest = z.infer<typeof exportPrepareRequestSchema>;

export const exportPrepareWarningSchema = z.enum(['unc-path', 'row-count-above-threshold']);
export type ExportPrepareWarning = z.infer<typeof exportPrepareWarningSchema>;

export const exportPrepareResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    confirmationToken: z.string().min(1),
    basename: z.string().min(1),
    warnings: z.array(exportPrepareWarningSchema),
    estimatedRowCount: z.number().int().nonnegative(),
  }),
  z.object({ ok: z.literal(false), code: z.literal('USER_CANCELLED_DIALOG') }),
  z.object({ ok: z.literal(false), code: exportErrorCodeSchema }),
]);
export type ExportPrepareResponse = z.infer<typeof exportPrepareResponseSchema>;

// ============================================================================
// export:run — carries ONLY the one-shot token. No path, no filters.
// ============================================================================

export const exportRunRequestSchema = z
  .object({
    confirmationToken: z.string().min(1),
  })
  .strict();
export type ExportRunRequest = z.infer<typeof exportRunRequestSchema>;

export const exportRunResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    basename: z.string().min(1),
    rowCount: z.number().int().nonnegative(),
  }),
  z.object({ ok: z.literal(false), code: exportErrorCodeSchema }),
]);
export type ExportRunResponse = z.infer<typeof exportRunResponseSchema>;

// ============================================================================
// export:progress (main → renderer). Counts only, ≤ 1 per 200 ms.
// ============================================================================

export const exportProgressSchema = z
  .object({
    phase: z.enum(['decrypting', 'writing']),
    rowsDone: z.number().int().nonnegative(),
    rowsTotal: z.number().int().nonnegative(),
  })
  .strict();
export type ExportProgress = z.infer<typeof exportProgressSchema>;

// ============================================================================
// export:reveal (FR19) — reveal the last successful export in the OS file
// manager. Request is empty; the absolute path stays in main.
// ============================================================================

export const exportRevealRequestSchema = z.object({}).strict();
export type ExportRevealRequest = z.infer<typeof exportRevealRequestSchema>;

export const exportRevealResponseSchema = z.object({ ok: z.boolean() }).strict();
export type ExportRevealResponse = z.infer<typeof exportRevealResponseSchema>;
