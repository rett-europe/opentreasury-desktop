// transaction:create IPC handler factory — WI-12.
// transaction:update IPC handler factory — WI-20.
// transaction:delete IPC handler factory — WI-20.
//
// Wires the pure core/commands to the runtime singletons
// (EventLog + reducer read model + ULID/clock generators).
//
// Validation is layered:
//   1. Zod-parse the raw IPC payload (boundary check — renderer is untrusted).
//   2. Business-rule validation inside the command (e.g. tx exists).
// Errors are returned as a discriminated union; nothing throws across IPC.

import {
  createTransaction,
  type CreateTransactionInput,
  type ValidationErrorCode,
  updateTransaction,
  type UpdateTransactionInput,
  type UpdateValidationErrorCode,
  deleteTransaction,
  type DeleteTransactionInput,
  type DeleteValidationErrorCode,
  bulkUpdateTransactions,
  type BulkUpdateInput,
} from '../../../core/commands/index.js';
import type { EventLog } from '../../../core/eventLog/index.js';
import { applyEvent } from '../../../core/query/reducers.js';
import type { ReadModel } from '../../../core/query/types.js';
import {
  createTransactionRequestSchema,
  type CreateTransactionResponse,
  updateTransactionRequestSchema,
  type UpdateTransactionResponse,
  deleteTransactionRequestSchema,
  type DeleteTransactionResponse,
  bulkUpdateTransactionRequestSchema,
  type BulkUpdateTransactionResponse,
} from '../../../shared/ipc-contracts/transaction.js';

export interface TransactionCreateHandlerDeps {
  readonly eventLog: EventLog;
  readonly getReadModel: () => ReadModel;
  readonly now: () => Date;
  readonly newId: () => string;
  readonly datasetId: string;
  readonly actorDeviceId: string;
  readonly dekVersion?: number;
  /** Override for tests — defaults to core reducer's applyEvent singleton. */
  readonly applyEvent?: typeof applyEvent;
}

export function createTransactionCreateHandler(
  deps: TransactionCreateHandlerDeps,
): (raw: unknown) => Promise<CreateTransactionResponse> {
  const apply = deps.applyEvent ?? applyEvent;

  return async function handleTransactionCreate(raw: unknown): Promise<CreateTransactionResponse> {
    try {
      const parsed = createTransactionRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: 'SCHEMA_INVALID',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        };
      }

      const input: CreateTransactionInput = {
        accountId: parsed.data.accountId,
        date: parsed.data.date,
        type: parsed.data.type,
        amount: parsed.data.amount,
        currency: parsed.data.currency,
        description: parsed.data.description,
        categoryId: parsed.data.categoryId ?? null,
        subcategoryId: parsed.data.subcategoryId ?? null,
        tagIds: parsed.data.tagIds ?? [],
        status: parsed.data.status ?? 'approved',
      };
      const result = createTransaction(input, {
        now: deps.now,
        newId: deps.newId,
        readModel: deps.getReadModel(),
        datasetId: deps.datasetId,
        actorDeviceId: deps.actorDeviceId,
        dekVersion: deps.dekVersion ?? 0,
      });

      if (!result.ok) {
        return {
          ok: false,
          error: {
            code: result.error.code as ValidationErrorCode,
            message: result.error.message,
            field: String(result.error.field),
          },
        };
      }

      // Idempotent append — JsonFileEventLog dedupes by event.id, so replaying
      // the same event is safe. Guard the in-memory projection separately: only
      // apply to the reducer when the log truly grew.
      const before = (await deps.eventLog.load()).length;
      await deps.eventLog.append(result.value);
      const after = (await deps.eventLog.load()).length;
      if (after > before) {
        apply(result.value);
      }

      return { ok: true, event: result.value };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { code: 'INTERNAL', message } };
    }
  };
}

// WI-20 — Update Transaction Handler
export interface TransactionUpdateHandlerDeps {
  readonly eventLog: EventLog;
  readonly getReadModel: () => ReadModel;
  readonly now: () => Date;
  readonly newId: () => string;
  readonly datasetId: string;
  readonly actorDeviceId: string;
  readonly dekVersion?: number;
  readonly applyEvent?: typeof applyEvent;
}

export function createTransactionUpdateHandler(
  deps: TransactionUpdateHandlerDeps,
): (raw: unknown) => Promise<UpdateTransactionResponse> {
  const apply = deps.applyEvent ?? applyEvent;

  return async function handleTransactionUpdate(raw: unknown): Promise<UpdateTransactionResponse> {
    try {
      const parsed = updateTransactionRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: 'SCHEMA_INVALID',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        };
      }

      const input: UpdateTransactionInput = {
        id: parsed.data.id,
        date: parsed.data.date,
        type: parsed.data.type,
        amount: parsed.data.amount,
        description: parsed.data.description,
        categoryId: parsed.data.categoryId ?? null,
        subcategoryId: parsed.data.subcategoryId ?? null,
        tagIds: parsed.data.tagIds ?? [],
        status: parsed.data.status ?? undefined,
        reference: parsed.data.reference,
        details: parsed.data.details,
      };

      // SPEC-023 FR14 — reject parent amount edit when splits exist.
      const model = deps.getReadModel();
      const existingTx = model.transactions.find((t) => t.id === input.id);
      if (existingTx && model.splitParentIds.has(input.id)) {
        // Check if amount is being changed
        if (Math.abs(existingTx.amount - input.amount) > 0.001) {
          return {
            ok: false,
            error: {
              code: 'TX_HAS_ACTIVE_SPLITS',
              message: 'Cannot change amount on a transaction with active splits. Remove splits first.',
              field: 'amount',
            },
          };
        }
      }

      const result = updateTransaction(input, {
        now: deps.now,
        newId: deps.newId,
        readModel: deps.getReadModel(),
        datasetId: deps.datasetId,
        actorDeviceId: deps.actorDeviceId,
        dekVersion: deps.dekVersion ?? 0,
      });

      if (!result.ok) {
        return {
          ok: false,
          error: {
            code: result.error.code as UpdateValidationErrorCode,
            message: result.error.message,
            field: String(result.error.field),
          },
        };
      }

      const before = (await deps.eventLog.load()).length;
      await deps.eventLog.append(result.value);
      const after = (await deps.eventLog.load()).length;
      if (after > before) {
        apply(result.value);
      }

      return { ok: true, event: result.value };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { code: 'INTERNAL', message } };
    }
  };
}

// WI-20 — Delete Transaction Handler
export interface TransactionDeleteHandlerDeps {
  readonly eventLog: EventLog;
  readonly getReadModel: () => ReadModel;
  readonly now: () => Date;
  readonly newId: () => string;
  readonly datasetId: string;
  readonly actorDeviceId: string;
  readonly dekVersion?: number;
  readonly applyEvent?: typeof applyEvent;
}

export function createTransactionDeleteHandler(
  deps: TransactionDeleteHandlerDeps,
): (raw: unknown) => Promise<DeleteTransactionResponse> {
  const apply = deps.applyEvent ?? applyEvent;

  return async function handleTransactionDelete(raw: unknown): Promise<DeleteTransactionResponse> {
    try {
      const parsed = deleteTransactionRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: 'SCHEMA_INVALID',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        };
      }

      const input: DeleteTransactionInput = {
        id: parsed.data.id,
      };

      const result = deleteTransaction(input, {
        now: deps.now,
        newId: deps.newId,
        readModel: deps.getReadModel(),
        datasetId: deps.datasetId,
        actorDeviceId: deps.actorDeviceId,
        dekVersion: deps.dekVersion ?? 0,
      });

      if (!result.ok) {
        return {
          ok: false,
          error: {
            code: result.error.code as DeleteValidationErrorCode,
            message: result.error.message,
            field: String(result.error.field),
          },
        };
      }

      const before = (await deps.eventLog.load()).length;
      await deps.eventLog.append(result.value);
      const after = (await deps.eventLog.load()).length;
      if (after > before) {
        apply(result.value);
      }

      return { ok: true, event: result.value };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { code: 'INTERNAL', message } };
    }
  };
}

// WI-31a — Bulk Update Transaction Handler
export interface TransactionBulkUpdateHandlerDeps {
  readonly eventLog: EventLog;
  readonly getReadModel: () => ReadModel;
  readonly now: () => Date;
  readonly newId: () => string;
  readonly datasetId: string;
  readonly actorDeviceId: string;
  readonly dekVersion?: number;
  readonly applyEvent?: typeof applyEvent;
}

export function createTransactionBulkUpdateHandler(
  deps: TransactionBulkUpdateHandlerDeps,
): (raw: unknown) => Promise<BulkUpdateTransactionResponse> {
  const apply = deps.applyEvent ?? applyEvent;

  return async function handleTransactionBulkUpdate(
    raw: unknown,
  ): Promise<BulkUpdateTransactionResponse> {
    try {
      const parsed = bulkUpdateTransactionRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          failures: [
            {
              id: '',
              code: 'SCHEMA_INVALID',
              message: parsed.error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join('; '),
            },
          ],
        };
      }

      const input: BulkUpdateInput = {
        ids: parsed.data.ids,
        categoryId: parsed.data.categoryId,
        subcategoryId: parsed.data.subcategoryId,
        tagIds: parsed.data.tagIds,
        status: parsed.data.status,
        correlationId: parsed.data.correlationId,
      };

      // SPEC-023 FR15 — skip split parents entirely in bulk operations.
      const model = deps.getReadModel();
      const filteredIds = input.ids.filter((id) => !model.splitParentIds.has(id));
      const skippedSplitParentCount = input.ids.length - filteredIds.length;

      const result = bulkUpdateTransactions(
        { ...input, ids: filteredIds },
        {
          now: deps.now,
          newId: deps.newId,
          readModel: deps.getReadModel(),
          datasetId: deps.datasetId,
          actorDeviceId: deps.actorDeviceId,
          dekVersion: deps.dekVersion ?? 0,
        },
      );

      if (!result.ok) {
        return {
          ok: false,
          failures: result.failures.map((f) => ({
            id: f.id,
            code: f.code,
            message: f.message,
          })),
        };
      }

      // Atomically append all events in a single write + fsync.
      // If appendBatch fails, no events are persisted (all-or-nothing I/O).
      const before = (await deps.eventLog.load()).length;
      await deps.eventLog.appendBatch(result.events);
      const after = (await deps.eventLog.load()).length;

      // Apply reducer for newly-appended events
      if (after > before) {
        for (const event of result.events) {
          apply(event);
        }
      }

      return {
        ok: true,
        updatedCount: result.events.length,
        events: result.events,
        skippedSplitParentCount,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        failures: [{ id: '', code: 'INTERNAL', message }],
      };
    }
  };
}
