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
  tag: z.string().optional(),
});

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
});

const duplicateRowSchema = z.object({
  rowIndex: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number(),
  description: z.string(),
  rowHash: z.string().length(16),
});

const parseErrorSchema = z.object({
  rowIndex: z.number().int().positive(),
  field: z.enum(['date', 'amount', 'description']),
  reason: z.string(),
});

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
  rowIndex: z.number().int().positive(),
  field: z.enum(['date', 'amount', 'description']),
  reason: z.string(),
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
