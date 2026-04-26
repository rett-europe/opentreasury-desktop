// Transaction Splits IPC contract — SPEC-023.
//
// Channels + Zod schemas for the full split lifecycle:
//   - transaction:split        (create or replace splits for a parent)
//   - transaction:split:remove (revert parent to un-split single-line behaviour)
//   - transaction:split:get    (query splits for a parent — renderer pre-populates editor)
//
// Error-code discriminated-union response matches the `transaction:create`
// shape so the renderer handles all boundaries uniformly. Splits live alongside
// a transaction; they divide the parent amount into ≥2 children with independent
// category/subcategory/comment. Integer cents (e.g. 30000 = €300.00) eliminate
// floating-point drift in the sum invariant. UI converts at the edge.
//
// Renderer boundary: this module is renderer-safe (no core/ or main/ imports,
// no Electron/Node APIs) per ADR-002 §4.1. Imported by preload bridge + the
// renderer service layer; both see the same types.

import { z } from 'zod';

// ============================================================================
// Channel name constants
// ============================================================================

export const IPC_TRANSACTION_SPLIT = 'transaction:split';
export const IPC_TRANSACTION_SPLIT_REMOVE = 'transaction:split:remove';
export const IPC_TRANSACTION_SPLIT_GET = 'transaction:split:get';

// ============================================================================
// Constants (exported for UI validation + editor limits)
// ============================================================================

export const MAX_SPLITS_PER_TX = 20;
export const SPLIT_COMMENT_MAX = 500;

// ============================================================================
// Error codes — same shape as transaction:create's discriminated union.
// ============================================================================

export const splitErrorCodeSchema = z.enum([
  'TX_NOT_FOUND',
  'TX_DELETED',
  'INVALID_SPLIT_COUNT', // < 2 or > MAX_SPLITS_PER_TX
  'SUM_MISMATCH', // sum(amountCents) !== parentTx.amount * 100
  'SCHEMA_INVALID',
  'INTERNAL',
]);

export type SplitErrorCode = z.infer<typeof splitErrorCodeSchema>;

export const splitErrorSchema = z.object({
  code: splitErrorCodeSchema,
  message: z.string(),
  field: z.string().optional(),
});

export type SplitError = z.infer<typeof splitErrorSchema>;

// ============================================================================
// Split comment normalization helper. Accepts string | null | undefined,
// trims whitespace, empty → null. Enforces max length AFTER trimming.
// ============================================================================

const splitCommentField = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined) return null;
    const trimmed = v.trim();
    return trimmed === '' ? null : trimmed;
  })
  .pipe(z.string().max(SPLIT_COMMENT_MAX).nullable());

// ============================================================================
// Event mirror schemas — one per split lifecycle event. Kept here (not imported
// from core/) to preserve renderer → shared dependency direction (ADR-002 §4.1).
// ============================================================================

export const transactionSplitRowMirrorSchema = z.object({
  splitId: z.string().length(26),
  amountCents: z.number().int().positive(),
  categoryId: z.string().length(26).nullable(),
  subcategoryId: z.string().length(26).nullable(),
  comment: z.string().max(SPLIT_COMMENT_MAX).nullable(),
  sortOrder: z.number().int().nonnegative(),
});

export type TransactionSplitRowWire = z.infer<typeof transactionSplitRowMirrorSchema>;

export const transactionSplitEventMirrorSchema = z.object({
  type: z.literal('tx.split'),
  id: z.string().length(26),
  parentTxId: z.string().length(26),
  splits: z.array(transactionSplitRowMirrorSchema).min(2).max(MAX_SPLITS_PER_TX),
  createdAt: z.string().datetime(),
});

export type TransactionSplitEventWire = z.infer<typeof transactionSplitEventMirrorSchema>;

export const transactionSplitRemovedEventMirrorSchema = z.object({
  type: z.literal('tx.split.removed'),
  id: z.string().length(26),
  parentTxId: z.string().length(26),
  removedAt: z.string().datetime(),
});

export type TransactionSplitRemovedEventWire = z.infer<
  typeof transactionSplitRemovedEventMirrorSchema
>;

// ============================================================================
// transaction:split — create or replace splits for a parent transaction.
// ============================================================================

export const splitTransactionRequestSchema = z.object({
  parentTxId: z.string().length(26),
  splits: z
    .array(
      z.object({
        amountCents: z.number().int().positive(), // EUR cents (e.g. 30000 = €300.00)
        categoryId: z.string().length(26).nullable().optional(),
        subcategoryId: z.string().length(26).nullable().optional(),
        comment: splitCommentField.optional(),
      }),
    )
    .min(2)
    .max(MAX_SPLITS_PER_TX),
});

export type SplitTransactionRequest = z.infer<typeof splitTransactionRequestSchema>;

export const splitTransactionResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: transactionSplitEventMirrorSchema }),
  z.object({ ok: z.literal(false), error: splitErrorSchema }),
]);

export type SplitTransactionResponse = z.infer<typeof splitTransactionResponseSchema>;

// ============================================================================
// transaction:split:remove — revert parent to un-split single-line behaviour.
// ============================================================================

export const removeSplitRequestSchema = z.object({
  parentTxId: z.string().length(26),
});

export type RemoveSplitRequest = z.infer<typeof removeSplitRequestSchema>;

export const removeSplitResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: transactionSplitRemovedEventMirrorSchema }),
  z.object({ ok: z.literal(false), error: splitErrorSchema }),
]);

export type RemoveSplitResponse = z.infer<typeof removeSplitResponseSchema>;

// ============================================================================
// transaction:split:get — query splits for a parent (pre-populate editor).
// ============================================================================

export const getSplitsRequestSchema = z.object({
  parentTxId: z.string().length(26),
});

export type GetSplitsRequest = z.infer<typeof getSplitsRequestSchema>;

export const getSplitsResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    splits: z.array(transactionSplitRowMirrorSchema),
  }),
  z.object({ ok: z.literal(false), error: splitErrorSchema }),
]);

export type GetSplitsResponse = z.infer<typeof getSplitsResponseSchema>;
