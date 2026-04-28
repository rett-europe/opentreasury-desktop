// Bulk add-label command — pure domain, no I/O.
//
// Mirrors WI-31a's bulkUpdateTransactions architecture, but with append-set
// semantics for tagIds: each selected tx receives the new label appended to
// its existing tagIds. If a tx already carries the tag, it is silently
// skipped (no event emitted) — idempotent per-tx.
//
// Validation is all-or-nothing across the batch:
//   - empty ids                     → EMPTY_IDS
//   - tag does not exist in configTags → TAG_NOT_FOUND
//   - any unknown tx id             → TX_NOT_FOUND
// If any failure surfaces during validation, zero events are returned.
//
// All emitted `tx.updated` envelopes share the same `correlationId`, so the
// reducer / future undo plumbing can group them.

import type { TransactionUpdatedEvent, TransactionUpdatedPayload } from '../events/schemas';
import type { ReadModel } from '../query/types';
import type { TransactionType, TransactionStatus } from './createTransaction';

export interface BulkAddLabelInput {
  readonly ids: readonly string[];
  readonly tagId: string;
  readonly correlationId: string;
}

export interface BulkAddLabelDeps {
  readonly now: () => Date;
  readonly newId: () => string;
  readonly readModel: ReadModel;
  readonly datasetId: string;
  readonly actorDeviceId: string;
  readonly dekVersion?: number;
}

export type BulkAddLabelErrorCode = 'EMPTY_IDS' | 'TAG_NOT_FOUND' | 'TX_NOT_FOUND';

export interface BulkAddLabelFailure {
  readonly id: string;
  readonly code: BulkAddLabelErrorCode;
  readonly message: string;
}

export type BulkAddLabelResult =
  | {
      readonly ok: true;
      readonly events: TransactionUpdatedEvent[];
      readonly updatedIds: readonly string[];
      readonly skippedIds: readonly string[];
    }
  | { readonly ok: false; readonly failures: BulkAddLabelFailure[] };

export function bulkAddLabelToTransactions(
  input: BulkAddLabelInput,
  deps: BulkAddLabelDeps,
): BulkAddLabelResult {
  // Dedupe ids, preserving order of first occurrence.
  const uniqueIds = [...new Set(input.ids)];

  if (uniqueIds.length === 0) {
    return {
      ok: false,
      failures: [{ id: '', code: 'EMPTY_IDS', message: 'ids must be non-empty' }],
    };
  }

  // Tag existence check — must be a known label in the read model.
  const tagExists = deps.readModel.configTags.some((t) => t.id === input.tagId);
  if (!tagExists) {
    return {
      ok: false,
      failures: [
        {
          id: input.tagId,
          code: 'TAG_NOT_FOUND',
          message: `tag '${input.tagId}' not found in read model`,
        },
      ],
    };
  }

  // Phase 1: Validate all tx ids exist.
  const failures: BulkAddLabelFailure[] = [];
  const txById = new Map(deps.readModel.transactions.map((tx) => [tx.id, tx]));
  for (const txId of uniqueIds) {
    if (!txById.has(txId)) {
      failures.push({
        id: txId,
        code: 'TX_NOT_FOUND',
        message: `transaction '${txId}' not found in read model`,
      });
    }
  }
  if (failures.length > 0) {
    return { ok: false, failures };
  }

  // Phase 2: Build events for txs that don't already carry the tag.
  const updatedAt = deps.now().toISOString();
  const events: TransactionUpdatedEvent[] = [];
  const updatedIds: string[] = [];
  const skippedIds: string[] = [];

  for (const txId of uniqueIds) {
    const existing = txById.get(txId);
    if (!existing) continue; // already validated, type-narrow only.

    if (existing.tagIds.includes(input.tagId)) {
      skippedIds.push(txId);
      continue;
    }

    const payload: TransactionUpdatedPayload = {
      id: existing.id,
      date: existing.date,
      type: existing.type as TransactionType,
      amount: existing.amount,
      currency: 'EUR',
      description: existing.description,
      accountId: existing.accountId,
      categoryId: existing.categoryId,
      subcategoryId: existing.subcategoryId,
      tagIds: [...existing.tagIds, input.tagId],
      status: existing.status as TransactionStatus,
      createdAt: existing.createdAt,
      updatedAt,
      reference: existing.reference ?? null,
      details: existing.details ?? null,
      correlationId: input.correlationId,
    };

    const event: TransactionUpdatedEvent = {
      id: deps.newId(),
      type: 'tx.updated',
      datasetId: deps.datasetId,
      actorDeviceId: deps.actorDeviceId,
      createdAt: updatedAt,
      dekVersion: deps.dekVersion ?? 0,
      version: 1,
      payload,
    };

    events.push(event);
    updatedIds.push(txId);
  }

  return { ok: true, events, updatedIds, skippedIds };
}
