// Renderer-side mirror of the transaction IPC contract (WI-12).
//
// TODO(WI-12 follow-up): Morpheus is authoring `app/src/shared/ipc-contracts/transaction.ts`
// in parallel. Once it lands, replace these inline types with `export * from` /
// `export type { ... } from '../../shared/ipc-contracts/transaction'`.
// The shapes below MUST stay in lock-step with:
//   - `app/src/core/commands/createTransaction.ts` (CreateTransactionInput, ValidationErrorCode)
//   - `app/src/core/events/schemas.ts` (TransactionCreatedEvent envelope + payload)
//   - `.squad/decisions.md` § "Transaction Schema + Validation Rules (WI-11)"

export type TransactionType = 'income' | 'expense';
export type TransactionStatus = 'pending' | 'approved';

/**
 * Input accepted by `window.opentreasury.transaction.create`.
 * Mirrors `CreateTransactionInput` from the core command — amount is always
 * positive, sign is carried by `type`.
 */
export interface CreateTransactionInput {
  readonly accountId: string;
  readonly date: string; // YYYY-MM-DD
  readonly type: TransactionType;
  readonly amount: number; // > 0, finite
  readonly currency: 'EUR';
  readonly description: string;
  readonly categoryId?: string | null;
  readonly subcategoryId?: string | null;
  readonly tagIds?: readonly string[];
  readonly status?: TransactionStatus;
}

export type ValidationErrorCode =
  | 'ACCOUNT_NOT_FOUND'
  | 'AMOUNT_NON_POSITIVE'
  | 'CURRENCY_EMPTY'
  | 'DATE_INVALID'
  | 'DESCRIPTION_EMPTY'
  | 'TYPE_INVALID';

export interface TransactionCreatedPayload {
  readonly id: string;
  readonly date: string;
  readonly type: TransactionType;
  readonly amount: number;
  readonly currency: 'EUR';
  readonly description: string;
  readonly accountId: string;
  readonly categoryId: string | null;
  readonly subcategoryId: string | null;
  readonly tagIds: readonly string[];
  readonly status: TransactionStatus;
  readonly createdAt: string;
}

export interface TransactionCreatedEvent {
  readonly id: string;
  readonly type: 'tx.created';
  readonly datasetId: string;
  readonly actorDeviceId: string;
  readonly createdAt: string;
  readonly dekVersion: number;
  readonly version: number;
  readonly payload: TransactionCreatedPayload;
}

/**
 * Discriminated-union result returned by the IPC bridge. Validation failures
 * are NOT thrown — they come back as `{ ok: false, error }` so the UI can
 * render field-level errors without a try/catch dance.
 */
export type CreateTransactionResult =
  | { readonly ok: true; readonly event: TransactionCreatedEvent }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: ValidationErrorCode;
        readonly message: string;
      };
    };
