// Transaction API client — thin wrapper over window.opentreasury.transaction.*
// (WI-12). Mirrors the pattern established by `panelApi.ts`.
//
// Scope: pure pass-through. Validation lives in the core command (WI-11) and
// the IPC boundary's Zod schema (see `shared/ipc-contracts/transaction.ts`);
// the renderer does NOT re-validate — it just surfaces the typed result.

import type {
  BulkUpdateTransactionRequest,
  BulkUpdateTransactionResponse,
  CreateTransactionRequest,
  CreateTransactionResponse,
  UpdateTransactionRequest,
  UpdateTransactionResponse,
  DeleteTransactionRequest,
  DeleteTransactionResponse,
} from '../../shared/ipc-contracts/transaction.js';

/**
 * Submit a new transaction. Resolves with a discriminated-union result:
 *  - `{ ok: true, event }` on success (the persisted `tx.created` envelope).
 *  - `{ ok: false, error }` on validation failure (see `TransactionValidationErrorCode`).
 *
 * Rejects only on unexpected IPC/transport errors — validation errors are
 * returned, not thrown, so callers do not need try/catch for the common
 * "bad input" path.
 */
export async function createTransaction(
  input: CreateTransactionRequest,
): Promise<CreateTransactionResponse> {
  return window.opentreasury.transaction.create(input);
}

/**
 * Update an existing transaction (WI-20). Full-replacement payload.
 * Resolves with discriminated-union result:
 *  - `{ ok: true, event }` on success (the persisted `tx.updated` envelope).
 *  - `{ ok: false, error }` on validation failure (TX_NOT_FOUND, etc.).
 */
export async function updateTransaction(
  input: UpdateTransactionRequest,
): Promise<UpdateTransactionResponse> {
  return window.opentreasury.transaction.update(input);
}

/**
 * Delete a transaction (WI-20). Soft-delete via append-only event.
 * Resolves with discriminated-union result:
 *  - `{ ok: true, event }` on success (the persisted `tx.deleted` envelope).
 *  - `{ ok: false, error }` on validation failure (TX_NOT_FOUND, etc.).
 */
export async function deleteTransaction(
  input: DeleteTransactionRequest,
): Promise<DeleteTransactionResponse> {
  return window.opentreasury.transaction.delete(input);
}

/**
 * Bulk-update multiple transactions (WI-31a/WI-31b). Applies the same
 * partial patch to N transactions in a single IPC round-trip and emits
 * one `tx.updated` event per row sharing a `correlationId`.
 *
 * Resolves with discriminated-union result:
 *  - `{ ok: true, updatedCount, events }` on full success.
 *  - `{ ok: false, failures }` on validation failure (zero events applied).
 */
export async function bulkUpdateTransactions(
  input: BulkUpdateTransactionRequest,
): Promise<BulkUpdateTransactionResponse> {
  return window.opentreasury.transaction.bulkUpdate(input);
}
