// Import IPC contract — WI-17.
// Channel + Zod schemas for CSV/XLSX import via generic column mapper.
// Four-step flow: stage-file → dry-run → commit → last-mapping.

import { z } from 'zod';

// ============================================================================
// Channel name constants
// ============================================================================

export const IPC_IMPORT_STAGE_FILE = 'import:stage-file';
export const IPC_IMPORT_DRY_RUN = 'import:dry-run';
export const IPC_IMPORT_COMMIT = 'import:commit';
export const IPC_IMPORT_LAST_MAPPING = 'import:last-mapping';

// ============================================================================
// Error codes
// ============================================================================

export const importErrorCodeSchema = z.enum([
  'FILE_UNREADABLE',
  'FILE_TOO_LARGE',
  'SHEET_NOT_FOUND',
  'INSUFFICIENT_COLUMNS',
  'MAPPING_INVALID',
  'PARSE_ERROR',
  'SCHEMA_INVALID',
  'INTERNAL',
  'PATH_INVALID',
  'ROW_COUNT_EXCEEDED',
]);

export type ImportErrorCode = z.infer<typeof importErrorCodeSchema>;

// ============================================================================
// import:stage-file
// ============================================================================

export const stageFileRequestSchema = z.object({
  filePath: z.string().min(1),
  headerRow: z.number().int().min(1).max(20).optional(),
});

export type StageFileRequest = z.infer<typeof stageFileRequestSchema>;

const sheetInfoSchema = z.object({
  name: z.string(),
  columnHeaders: z.array(z.string()),
  rowCount: z.number().int().nonnegative(),
  detectedHeaderRow: z.number().int().min(1).max(20),
  previewRows: z.array(z.array(z.string())),
});

export const stageFileSuccessResponseSchema = z.object({
  ok: z.literal(true),
  fileId: z.string().min(1),
  sheets: z.array(sheetInfoSchema),
});

export const stageFileErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: importErrorCodeSchema,
    detail: z.string().optional(),
  }),
});

export const stageFileResponseSchema = z.union([
  stageFileSuccessResponseSchema,
  stageFileErrorResponseSchema,
]);

export type StageFileResponse = z.infer<typeof stageFileResponseSchema>;

// ============================================================================
// import:dry-run
// ============================================================================

export const columnMappingSchema = z.object({
  date: z.string().min(1),
  amount: z.string().min(1),
  description: z.string().min(1),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  tag: z.string().optional(),
  reference: z.string().optional(),
  details: z.string().optional(),
});

// Field-length limits for WI-19 `reference` / `details` columns. Kept here so
// the wizard client-side counter and the main-process validator agree on one
// source of truth.
export const REFERENCE_MAX_LENGTH = 120 as const;
export const DETAILS_MAX_LENGTH = 1000 as const;

export type ColumnMapping = z.infer<typeof columnMappingSchema>;

export const dryRunRequestSchema = z.object({
  fileId: z.string().min(1),
  sheetName: z.string().optional(),
  accountId: z.string().min(1),
  columnMapping: columnMappingSchema,
  importDuplicates: z.boolean().default(false),
  headerRow: z.number().int().min(1).max(20),
});

export type DryRunRequest = z.infer<typeof dryRunRequestSchema>;

const parsedRowSampleSchema = z.object({
  rowIndex: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number(),
  description: z.string(),
  isDuplicate: z.boolean(),
  // WI-19 + taxonomy — optional preview fields so the final preview table can
  // surface every mapped column, not just the four required ones. `category` /
  // `subcategory` are the RESOLVED display names (null when the raw cell was
  // empty or didn't match anything in the current read model). `tag` is the
  // joined list of resolved tag names (empty string when none matched).
  reference: z.string().nullable().optional(),
  details: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  subcategory: z.string().nullable().optional(),
  tag: z.string().optional(),
});

const duplicateRowSchema = z.object({
  rowIndex: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number(),
  description: z.string(),
  rowHash: z.string().length(16),
});

const parseErrorSchema = z.object({
  row: z.number().int().positive(),
  field: z.enum(['date', 'amount', 'description']).optional(),
  code: z.string(),
  raw: z.string().optional(),
  offending: z.string().optional(),
});

/**
 * Per-field slice of the dry-run taxonomy preview. `known` holds distinct
 * names that resolved to an existing read-model entity; `unknown` holds
 * distinct names that did not. Both are capped at
 * TAXONOMY_PREVIEW_NAME_LIMIT in the handler so the response stays bounded
 * on large files.
 */
const taxonomyFieldPreviewSchema = z.object({
  knownCount: z.number().int().nonnegative(),
  unknownCount: z.number().int().nonnegative(),
  known: z.array(z.string()),
  unknown: z.array(z.string()),
});

export const TAXONOMY_PREVIEW_NAME_LIMIT = 20 as const;

export const dryRunSuccessResponseSchema = z.object({
  ok: z.literal(true),
  summary: z.object({
    totalRows: z.number().int().nonnegative(),
    validRows: z.number().int().nonnegative(),
    duplicateCount: z.number().int().nonnegative(),
    errorCount: z.number().int().nonnegative(),
  }),
  samples: z.array(parsedRowSampleSchema).max(5),
  duplicates: z.array(duplicateRowSchema),
  errors: z.array(parseErrorSchema),
  inferredDateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']),
  dateFormatAmbiguous: z.boolean(),
  // Taxonomy preview — counts + sample names of category / subcategory / tag
  // cells found in the import, split by whether they match an existing
  // entity in the current read model. Unknown names are NOT auto-created by
  // this handler; rows that reference them still import, but with the
  // corresponding id dropped (null / omitted from tagIds). A follow-up will
  // let the user promote unknowns to real entities from the dry-run step.
  taxonomyPreview: z.object({
    categories: taxonomyFieldPreviewSchema,
    subcategories: taxonomyFieldPreviewSchema,
    tags: taxonomyFieldPreviewSchema,
  }),
});

export const dryRunErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: importErrorCodeSchema,
    detail: z.string().optional(),
  }),
});

export const dryRunResponseSchema = z.union([
  dryRunSuccessResponseSchema,
  dryRunErrorResponseSchema,
]);

export type DryRunResponse = z.infer<typeof dryRunResponseSchema>;

// ============================================================================
// import:commit
// ============================================================================

export const commitImportRequestSchema = z.object({
  fileId: z.string().min(1),
  sheetName: z.string().optional(),
  accountId: z.string().min(1),
  columnMapping: columnMappingSchema,
  importDuplicates: z.boolean().default(false),
  confirmed: z.literal(true),
  headerRow: z.number().int().min(1).max(20),
});

export type CommitImportRequest = z.infer<typeof commitImportRequestSchema>;

const commitWarningSchema = z.object({
  row: z.number().int().positive(),
  field: z.enum(['date', 'amount', 'description']).optional(),
  code: z.string(),
  raw: z.string().optional(),
});

export const commitImportSuccessResponseSchema = z.object({
  ok: z.literal(true),
  importBatchId: z.string().min(1),
  importedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  warnings: z.array(commitWarningSchema),
});

export const commitImportErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: importErrorCodeSchema,
    detail: z.string().optional(),
  }),
});

export const commitImportResponseSchema = z.union([
  commitImportSuccessResponseSchema,
  commitImportErrorResponseSchema,
]);

export type CommitImportResponse = z.infer<typeof commitImportResponseSchema>;

// ============================================================================
// import:last-mapping
// ============================================================================

export const lastMappingRequestSchema = z.object({
  accountId: z.string().min(1),
});

export type LastMappingRequest = z.infer<typeof lastMappingRequestSchema>;

export const lastMappingResponseSchema = z.object({
  mapping: columnMappingSchema.nullable(),
  updatedAt: z.string().datetime().nullable(),
});

export type LastMappingResponse = z.infer<typeof lastMappingResponseSchema>;
