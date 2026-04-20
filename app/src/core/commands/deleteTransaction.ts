// WI-20: deleteTransaction command — pure domain, no I/O.
//
// Produces a `tx.deleted` DomainEvent from validated input + deps.
// Soft-delete — append-only event log; reducer removes from projection.

import type { TransactionDeletedEvent } from '../events/schemas';
import type { ReadModel } from '../query/types';

export interface DeleteTransactionInput {
  readonly id: string; // Transaction id being deleted
}

export interface DeleteTransactionDeps {
  readonly now: () => Date;
  readonly newId: () => string; // ULID generator for event id
  readonly readModel: ReadModel;
  readonly datasetId: string;
  readonly actorDeviceId: string;
  readonly dekVersion?: number;
}

export type DeleteValidationErrorCode = 'TX_NOT_FOUND';

export interface DeleteValidationError {
  readonly code: DeleteValidationErrorCode;
  readonly field: keyof DeleteTransactionInput;
  readonly message: string;
}

export type DeleteResult<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function deleteTransaction(
  input: DeleteTransactionInput,
  deps: DeleteTransactionDeps,
): DeleteResult<TransactionDeletedEvent, DeleteValidationError> {
  // Verify transaction exists
  const existing = deps.readModel.transactions.find((tx) => tx.id === input.id);
  if (!existing) {
    return {
      ok: false,
      error: {
        code: 'TX_NOT_FOUND',
        field: 'id',
        message: `transaction '${input.id}' not found in read model`,
      },
    };
  }

  const deletedAt = deps.now().toISOString();
  const eventId = deps.newId();

  const event: TransactionDeletedEvent = {
    type: 'tx.deleted',
    id: eventId,
    txId: input.id,
    deletedAt,
    datasetId: deps.datasetId,
    actorDeviceId: deps.actorDeviceId,
    dekVersion: deps.dekVersion ?? 1,
    version: 1,
  };

  return { ok: true, value: event };
}
