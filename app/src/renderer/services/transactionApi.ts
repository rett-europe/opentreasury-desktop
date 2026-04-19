// Transaction API client — thin wrapper over window.opentreasury.transaction.*
// (WI-12). Mirrors the pattern established by `panelApi.ts`.
//
// Scope: pure pass-through. Validation lives in the core command (WI-11);
// the IPC boundary does NOT re-validate (see .squad/decisions.md § WI-11
// "Cross-WI impact: WI-12"). The renderer likewise trusts the contract.

import type {
  CreateTransactionInput,
  CreateTransactionResult,
} from '../types/transaction.js';

/**
 * Submit a new transaction. Resolves with a discriminated-union result:
 *  - `{ ok: true, event }` on success (the persisted `tx.created` envelope).
 *  - `{ ok: false, error }` on validation failure (see ValidationErrorCode).
 *
 * Rejects only on unexpected IPC/transport errors — validation errors are
 * returned, not thrown, so callers do not need a try/catch for the common
 * "bad input" path.
 */
export async function createTransaction(
  input: CreateTransactionInput,
): Promise<CreateTransactionResult> {
  return window.opentreasury.transaction.create(input);
}
