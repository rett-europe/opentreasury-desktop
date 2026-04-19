// Transaction IPC contract — WI-12.
// Channel + Zod schemas for `transaction:create`. Mirrors WI-11's
// CreateTransactionInput / ValidationError types from core/commands without
// importing them (the shared/ boundary is renderer-safe, so it must stay
// free of core/ imports to keep the dependency graph one-way per ADR-002 §4.1).

import { z } from 'zod';

// IPC channel name constant
export const IPC_TRANSACTION_CREATE = 'transaction:create';

// ----------------------------------------------------------------------------
// Event schema — mirrors core/events/schemas.ts transactionCreatedEventSchema.
// Kept here (not imported from core/) so renderer → shared does not pull core/
// into the renderer bundle (ADR-002 §4.1).
// ----------------------------------------------------------------------------

const transactionCreatedPayloadMirrorSchema = z.object({
  id: z.string().length(26),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['income', 'expense']),
  amount: z.number().positive(),
  currency: z.literal('EUR'),
  description: z.string().max(500),
  accountId: z.string().length(26),
  categoryId: z.string().length(26).nullable(),
  subcategoryId: z.string().length(26).nullable(),
  tagIds: z.array(z.string().length(26)),
  status: z.enum(['pending', 'approved']),
  createdAt: z.string().datetime(),
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
