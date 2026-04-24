// WI-31a: bulkUpdateTransactions command — pure domain, no I/O.
//
// Applies the same partial-update payload to N transactions.
// Validate-all-then-apply: if any single tx fails validation, the entire
// batch returns { ok: false, failures } with zero events emitted.
// All emitted `tx.updated` envelopes share the same `correlationId`.

import type { TransactionUpdatedEvent, TransactionUpdatedPayload } from '../events/schemas';
import type { ReadModel } from '../query/types';
import type { TransactionType, TransactionStatus } from './createTransaction';
import type { UpdateValidationErrorCode } from './updateTransaction';

export interface BulkUpdateInput {
  readonly ids: readonly string[];
  readonly categoryId?: string | null;
  readonly subcategoryId?: string | null;
  readonly tagIds?: readonly string[];
  readonly status?: 'pending' | 'approved';
  readonly correlationId: string;
}

export interface BulkUpdateDeps {
  readonly now: () => Date;
  readonly newId: () => string;
  readonly readModel: ReadModel;
  readonly datasetId: string;
  readonly actorDeviceId: string;
  readonly dekVersion?: number;
}

export type BulkUpdateErrorCode = UpdateValidationErrorCode | 'EMPTY_IDS';

export interface BulkUpdateFailure {
  readonly id: string;
  readonly code: BulkUpdateErrorCode;
  readonly message: string;
}

export type BulkUpdateResult =
  | { readonly ok: true; readonly events: TransactionUpdatedEvent[] }
  | { readonly ok: false; readonly failures: BulkUpdateFailure[] };

export function bulkUpdateTransactions(
  input: BulkUpdateInput,
  deps: BulkUpdateDeps,
): BulkUpdateResult {
  // Dedupe ids
  const uniqueIds = [...new Set(input.ids)];

  // Empty ids check
  if (uniqueIds.length === 0) {
    return {
      ok: false,
      failures: [{ id: '', code: 'EMPTY_IDS' as BulkUpdateErrorCode, message: 'ids must be non-empty' }],
    };
  }

  const updatedAt = deps.now().toISOString();
  const failures: BulkUpdateFailure[] = [];
  const events: TransactionUpdatedEvent[] = [];

  // Phase 1: Validate all
  for (const txId of uniqueIds) {
    const existing = deps.readModel.transactions.find((tx) => tx.id === txId);
    if (!existing) {
      failures.push({
        id: txId,
        code: 'TX_NOT_FOUND',
        message: `transaction '${txId}' not found in read model`,
      });
      continue;
    }

    // Build merged payload — only override fields present in the bulk patch;
    // date/type/amount/description/reference/details are preserved unchanged.
    const payload: TransactionUpdatedPayload = {
      id: existing.id,
      date: existing.date,
      type: existing.type as TransactionType,
      amount: existing.amount,
      currency: 'EUR',
      description: existing.description,
      accountId: existing.accountId,
      categoryId: input.categoryId !== undefined ? input.categoryId ?? null : existing.categoryId,
      subcategoryId:
        input.subcategoryId !== undefined ? input.subcategoryId ?? null : existing.subcategoryId,
      tagIds: input.tagIds !== undefined ? [...input.tagIds] : [...existing.tagIds],
      status: (input.status ?? existing.status) as TransactionStatus,
      createdAt: existing.createdAt,
      updatedAt,
      reference: existing.reference ?? null,
      details: existing.details ?? null,
      correlationId: input.correlationId,
    };

    const eventId = deps.newId();

    const event: TransactionUpdatedEvent = {
      id: eventId,
      type: 'tx.updated',
      datasetId: deps.datasetId,
      actorDeviceId: deps.actorDeviceId,
      createdAt: updatedAt,
      dekVersion: deps.dekVersion ?? 1,
      version: 1,
      payload,
    };

    events.push(event);
  }

  // Phase 2: All-or-nothing — if any failed, return failures with zero events
  if (failures.length > 0) {
    return { ok: false, failures };
  }

  return { ok: true, events };
}
