// Transaction API client — thin wrapper over window.opentreasury.transaction.*
// (WI-12). Mirrors the pattern established by `panelApi.ts`.
//
// Scope: pure pass-through. Validation lives in the core command (WI-11) and
// the IPC boundary's Zod schema (see `shared/ipc-contracts/transaction.ts`);
// the renderer does NOT re-validate — it just surfaces the typed result.

import type {
  CreateTransactionRequest,
  CreateTransactionResponse,
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
