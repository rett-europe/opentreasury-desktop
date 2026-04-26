// Transaction IPC contract — WI-12.
// Channel + Zod schemas for `transaction:create`. Mirrors WI-11's
// CreateTransactionInput / ValidationError types from core/commands without
// importing them (the shared/ boundary is renderer-safe, so it must stay
// free of core/ imports to keep the dependency graph one-way per ADR-002 §4.1).

import { z } from 'zod';

// IPC channel name constants
export const IPC_TRANSACTION_CREATE = 'transaction:create';
export const IPC_TRANSACTION_UPDATE = 'transaction:update';
export const IPC_TRANSACTION_DELETE = 'transaction:delete';
export const IPC_TRANSACTION_BULK_UPDATE = 'transaction:bulkUpdate';

// ----------------------------------------------------------------------------
// Event schema — mirrors core/events/schemas.ts transactionCreatedEventSchema.
// Kept here (not imported from core/) so renderer → shared does not pull core/
// into the renderer bundle (ADR-002 §4.1).
// ----------------------------------------------------------------------------

const transactionCreatedPayloadMirrorSchema = z.object({
  id: z.string().length(26),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['income', 'expense']),
  amount: z.number().nonnegative(),
  currency: z.literal('EUR'),
  description: z.string().max(500),
  accountId: z.string().length(26),
  categoryId: z.string().length(26).nullable(),
  subcategoryId: z.string().length(26).nullable(),
  tagIds: z.array(z.string().length(26)),
  status: z.enum(['pending', 'approved']),
  createdAt: z.string().datetime(),
  reference: z.string().max(120).nullable().optional(),
  details: z.string().max(1000).nullable().optional(),
});

const transactionCreatedEventMirrorSchema = z.object({
  id: z.string().length(26),
  type: z.literal('tx.created'),
  datasetId: z.string().length(26),
  actorDeviceId: z.string().length(26),
  createdAt: z.string().datetime(),
  dekVersion: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  payload: transactionCreatedPayloadMirrorSchema,
});

export type TransactionCreatedEventWire = z.infer<typeof transactionCreatedEventMirrorSchema>;

// ============================================================================
// Request — CreateTransactionInput (mirrors WI-11 command input)
// ============================================================================

export const transactionTypeSchema = z.enum(['income', 'expense']);
export const transactionStatusSchema = z.enum(['pending', 'approved']);

// WI-19 — free-text field normalization at the IPC boundary:
//   - Accepts string | null | undefined.
//   - Trims whitespace.
//   - Empty string (after trimming) → null.
//   - Enforces max length AFTER trimming.
// Shared by `reference` (120) and `details` (1000) on transaction:create, and
// re-used inside the notes request schemas.
const freeTextField = (maxLen: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined) return null;
      const trimmed = v.trim();
      return trimmed === '' ? null : trimmed;
    })
    .pipe(z.string().max(maxLen).nullable());

// Boundary-level schema — validates the shape of the untrusted IPC payload.
// Business-rule validation (e.g. accountId exists) happens in the command.
export const createTransactionRequestSchema = z.object({
  accountId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  type: transactionTypeSchema,
  amount: z.number().positive().finite(),
  currency: z.literal('EUR'),
  description: z.string().min(1).max(500),
  categoryId: z.string().nullable().optional(),
  subcategoryId: z.string().nullable().optional(),
  tagIds: z.array(z.string()).optional(),
  status: transactionStatusSchema.optional(),
  // WI-19 — optional user-supplied metadata. Normalized to string|null.
  reference: freeTextField(120).optional(),
  details: freeTextField(1000).optional(),
});

export type CreateTransactionRequest = z.infer<typeof createTransactionRequestSchema>;

// ============================================================================
// Response — discriminated union
// ============================================================================

export const transactionValidationErrorCodeSchema = z.enum([
  'ACCOUNT_NOT_FOUND',
  'AMOUNT_NON_POSITIVE',
  'CURRENCY_EMPTY',
  'DATE_INVALID',
  'DESCRIPTION_EMPTY',
  'TYPE_INVALID',
  'TX_NOT_FOUND',
  'TX_HAS_ACTIVE_SPLITS', // SPEC-023 FR14 — reject parent amount edit when splits exist
  'SCHEMA_INVALID',
  'INTERNAL',
]);

export type TransactionValidationErrorCode = z.infer<typeof transactionValidationErrorCodeSchema>;

export const transactionErrorSchema = z.object({
  code: transactionValidationErrorCodeSchema,
  message: z.string(),
  field: z.string().optional(),
});

export type TransactionError = z.infer<typeof transactionErrorSchema>;

export const createTransactionResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: transactionCreatedEventMirrorSchema }),
  z.object({ ok: z.literal(false), error: transactionErrorSchema }),
]);

export type CreateTransactionResponse = z.infer<typeof createTransactionResponseSchema>;

// ============================================================================
// WI-20 — Update Transaction
// ============================================================================

// Mirrors tx.updated event payload schema from core/events/schemas.ts
const transactionUpdatedPayloadMirrorSchema = z.object({
  id: z.string().length(26),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['income', 'expense']),
  amount: z.number().nonnegative(),
  currency: z.literal('EUR'),
  description: z.string().max(500),
  accountId: z.string().length(26),
  categoryId: z.string().length(26).nullable(),
  subcategoryId: z.string().length(26).nullable(),
  tagIds: z.array(z.string().length(26)),
  status: z.enum(['pending', 'approved']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  reference: z.string().max(120).nullable().optional(),
  details: z.string().max(1000).nullable().optional(),
  // WI-31a — Optional correlation id (ULID) for bulk-update grouping.
  correlationId: z.string().length(26).optional(),
});

const transactionUpdatedEventMirrorSchema = z.object({
  id: z.string().length(26),
  type: z.literal('tx.updated'),
  datasetId: z.string().length(26),
  actorDeviceId: z.string().length(26),
  createdAt: z.string().datetime(),
  dekVersion: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  payload: transactionUpdatedPayloadMirrorSchema,
});

export type TransactionUpdatedEventWire = z.infer<typeof transactionUpdatedEventMirrorSchema>;

// Request schema — full payload (accountId, currency, createdAt are server-side)
export const updateTransactionRequestSchema = z.object({
  id: z.string().min(1), // Transaction id being updated
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: transactionTypeSchema,
  amount: z.number().positive().finite(),
  description: z.string().min(1).max(500),
  categoryId: z.string().nullable().optional(),
  subcategoryId: z.string().nullable().optional(),
  tagIds: z.array(z.string()).optional(),
  status: transactionStatusSchema.optional(),
  reference: freeTextField(120).optional(),
  details: freeTextField(1000).optional(),
});

export type UpdateTransactionRequest = z.infer<typeof updateTransactionRequestSchema>;

export const updateTransactionValidationErrorCodeSchema = z.enum([
  'TX_NOT_FOUND',
  'AMOUNT_NON_POSITIVE',
  'DATE_INVALID',
  'DESCRIPTION_EMPTY',
  'TYPE_INVALID',
  'REFERENCE_TOO_LONG',
  'DETAILS_TOO_LONG',
  'TX_HAS_ACTIVE_SPLITS', // SPEC-023 FR14 — reject parent amount edit when splits exist
  'SCHEMA_INVALID',
  'INTERNAL',
]);

export type UpdateTransactionValidationErrorCode = z.infer<
  typeof updateTransactionValidationErrorCodeSchema
>;

export const updateTransactionErrorSchema = z.object({
  code: updateTransactionValidationErrorCodeSchema,
  message: z.string(),
  field: z.string().optional(),
});

export type UpdateTransactionError = z.infer<typeof updateTransactionErrorSchema>;

export const updateTransactionResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: transactionUpdatedEventMirrorSchema }),
  z.object({ ok: z.literal(false), error: updateTransactionErrorSchema }),
]);

export type UpdateTransactionResponse = z.infer<typeof updateTransactionResponseSchema>;

// ============================================================================
// WI-20 — Delete Transaction
// ============================================================================

const transactionDeletedEventMirrorSchema = z.object({
  type: z.literal('tx.deleted'),
  id: z.string().length(26),
  txId: z.string().length(26),
  deletedAt: z.string().datetime(),
  datasetId: z.string().length(26),
  actorDeviceId: z.string().length(26),
  dekVersion: z.number().int().nonnegative(),
  version: z.number().int().positive(),
});

export type TransactionDeletedEventWire = z.infer<typeof transactionDeletedEventMirrorSchema>;

export const deleteTransactionRequestSchema = z.object({
  id: z.string().min(1),
});

export type DeleteTransactionRequest = z.infer<typeof deleteTransactionRequestSchema>;

export const deleteTransactionValidationErrorCodeSchema = z.enum([
  'TX_NOT_FOUND',
  'SCHEMA_INVALID',
  'INTERNAL',
]);

export type DeleteTransactionValidationErrorCode = z.infer<
  typeof deleteTransactionValidationErrorCodeSchema
>;

export const deleteTransactionErrorSchema = z.object({
  code: deleteTransactionValidationErrorCodeSchema,
  message: z.string(),
  field: z.string().optional(),
});

export type DeleteTransactionError = z.infer<typeof deleteTransactionErrorSchema>;

export const deleteTransactionResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: transactionDeletedEventMirrorSchema }),
  z.object({ ok: z.literal(false), error: deleteTransactionErrorSchema }),
]);

export type DeleteTransactionResponse = z.infer<typeof deleteTransactionResponseSchema>;

// ============================================================================
// WI-31a — Bulk Update Transaction
// ============================================================================

export const bulkUpdateTransactionRequestSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  categoryId: z.string().nullable().optional(),
  subcategoryId: z.string().nullable().optional(),
  tagIds: z.array(z.string()).optional(),
  status: transactionStatusSchema.optional(),
  correlationId: z.string().min(1),
});

export type BulkUpdateTransactionRequest = z.infer<typeof bulkUpdateTransactionRequestSchema>;

// Dedicated code enum for bulk-update failures. Extends the single-update
// codes with `EMPTY_IDS` (from the command) so the response schema accepts
// every code the handler can emit — prevents Zod parse failures at the
// `handlers.ts` response-validation gate (Blocker 1 from review).
export const bulkUpdateFailureCodeSchema = z.enum([
  ...updateTransactionValidationErrorCodeSchema.options,
  'EMPTY_IDS',
]);

export type BulkUpdateFailureCode = z.infer<typeof bulkUpdateFailureCodeSchema>;

export const bulkUpdateTransactionFailureSchema = z.object({
  id: z.string(),
  code: bulkUpdateFailureCodeSchema,
  message: z.string(),
});

export type BulkUpdateTransactionFailure = z.infer<typeof bulkUpdateTransactionFailureSchema>;

export const bulkUpdateTransactionResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    updatedCount: z.number().int().nonnegative(),
    events: z.array(transactionUpdatedEventMirrorSchema),
    // SPEC-023 FR15 — count of split parents skipped in bulk update.
    skippedSplitParentCount: z.number().int().nonnegative(),
  }),
  z.object({
    ok: z.literal(false),
    failures: z.array(bulkUpdateTransactionFailureSchema),
  }),
]);

export type BulkUpdateTransactionResponse = z.infer<typeof bulkUpdateTransactionResponseSchema>;
