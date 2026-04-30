// Dataset IPC contract — export current dataset to a folder.
//
// Provides the dataset:export channel that copies the active dataset
// (events.ndjson + metadata) to a user-chosen folder for backup or
// migration purposes. This is a non-destructive copy; the active dataset
// remains unchanged.

import { z } from 'zod';

export const IPC_DATASET_EXPORT = 'dataset:export';

// dataset:export request — caller supplies the target directory path
export const datasetExportRequestSchema = z.object({
  targetDir: z.string().min(1),
});

export type DatasetExportRequest = z.infer<typeof datasetExportRequestSchema>;

// Error codes the renderer can pattern-match on (WI-19 shape)
//   EXPORT_TARGET_INVALID      — path is under userData / equals source / non-writable
//   EXPORT_TARGET_NOT_EMPTY    — target contains an existing events.ndjson
//   EXPORT_DISK_FULL           — ENOSPC bubbled up
//   EXPORT_PERMISSION_DENIED   — EACCES/EPERM
//   EXPORT_VERIFY_FAILED       — post-copy verification failed
//   EXPORT_FAILED              — generic fallback with details
export const datasetExportErrorCodeSchema = z.enum([
  'EXPORT_TARGET_INVALID',
  'EXPORT_TARGET_NOT_EMPTY',
  'EXPORT_DISK_FULL',
  'EXPORT_PERMISSION_DENIED',
  'EXPORT_VERIFY_FAILED',
  'EXPORT_FAILED',
]);

export type DatasetExportErrorCode = z.infer<typeof datasetExportErrorCodeSchema>;

export const datasetExportResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    targetDir: z.string(),
    fileCount: z.number().int().nonnegative(),
    totalBytes: z.number().int().nonnegative(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: datasetExportErrorCodeSchema,
      message: z.string(),
      details: z.string().optional(),
    }),
  }),
]);

export type DatasetExportResponse = z.infer<typeof datasetExportResponseSchema>;
