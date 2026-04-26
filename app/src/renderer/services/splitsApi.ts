// Splits API client — thin wrapper over window.opentreasury.transaction.split.*
// (SPEC-023). Mirrors the pattern established by `transactionApi.ts`.
//
// Scope: pure pass-through. Validation lives in the core command and
// the IPC boundary's Zod schema (see `shared/ipc-contracts/transaction-splits.ts`);
// the renderer does NOT re-validate — it just surfaces the typed result.

import type {
  SplitTransactionRequest,
  SplitTransactionResponse,
  RemoveSplitRequest,
  RemoveSplitResponse,
  GetSplitsRequest,
  GetSplitsResponse,
} from '../../shared/ipc-contracts/transaction-splits.js';

/**
 * Create or replace splits for a parent transaction. Resolves with a discriminated-union result:
 *  - `{ ok: true, event }` on success (the persisted `tx.split` envelope).
 *  - `{ ok: false, error }` on validation failure (see `SplitErrorCode`).
 *
 * Rejects only on unexpected IPC/transport errors — validation errors are
 * returned, not thrown, so callers do not need try/catch for the common
 * "bad input" path.
 */
export async function createSplit(
  input: SplitTransactionRequest,
): Promise<SplitTransactionResponse> {
  return window.opentreasury.transaction.split.create(input);
}

/**
 * Remove all splits from a parent transaction (SPEC-023 FR6).
 * Resolves with discriminated-union result:
 *  - `{ ok: true, event }` on success (the persisted `tx.split.removed` envelope).
 *  - `{ ok: false, error }` on validation failure (TX_NOT_FOUND, etc.).
 */
export async function removeSplit(
  input: RemoveSplitRequest,
): Promise<RemoveSplitResponse> {
  return window.opentreasury.transaction.split.remove(input);
}

/**
 * Query existing splits for a parent transaction (pre-populate editor).
 * Resolves with discriminated-union result:
 *  - `{ ok: true, splits }` on success (array of split rows).
 *  - `{ ok: false, error }` on validation failure (TX_NOT_FOUND, etc.).
 */
export async function getSplits(input: GetSplitsRequest): Promise<GetSplitsResponse> {
  return window.opentreasury.transaction.split.get(input);
}
