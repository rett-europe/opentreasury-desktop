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
  bulkAddLabelToTransactions,
  type BulkAddLabelInput,
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
  bulkAddLabelTransactionRequestSchema,
  type BulkAddLabelTransactionResponse,
} from '../../../shared/ipc-contracts/transaction.js';
import { ReadOnlyEventLogError } from '../../eventLog-readonly-wrapper.js';

export interface TransactionCreateHandlerDeps {
  readonly eventLog: EventLog;
  readonly getReadModel: () => ReadModel;
  readonly now: () => Date;
  readonly newId: () => string;
  readonly datasetId: string;
  readonly actorDeviceId: string;
  readonly actorUserId: string; // P0-1 trial-readiness
  readonly actorIdentitySource: 'local' | 'aad'; // P0-1 trial-readiness
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
        // Defensive: schema already normalizes '' → null, but `|| null` keeps
        // the IPC layer correct even if the schema is loosened in the future.
        categoryId: parsed.data.categoryId || null,
        subcategoryId: parsed.data.subcategoryId || null,
        tagIds: parsed.data.tagIds ?? [],
        status: parsed.data.status ?? 'approved',
      };
      const result = createTransaction(input, {
        now: deps.now,
        newId: deps.newId,
        readModel: deps.getReadModel(),
        datasetId: deps.datasetId,
        actorDeviceId: deps.actorDeviceId,
        actorUserId: deps.actorUserId,
        actorIdentitySource: deps.actorIdentitySource,
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
      // P1-3: Catch ReadOnlyEventLogError and map to EVENT_LOG_READONLY
      if (err instanceof ReadOnlyEventLogError) {
        return {
          ok: false,
          error: {
            code: 'EVENT_LOG_READONLY',
            message: err.message,
          },
        };
      }
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { code: 'INTERNAL', message } };
    }
  };
}
export interface TransactionUpdateHandlerDeps {
  readonly eventLog: EventLog;
  readonly getReadModel: () => ReadModel;
  readonly now: () => Date;
  readonly newId: () => string;
  readonly datasetId: string;
  readonly actorDeviceId: string;
  readonly actorUserId: string; // P0-1 trial-readiness
  readonly actorIdentitySource: 'local' | 'aad'; // P0-1 trial-readiness
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
        // Defensive: schema normalizes '' → null. `|| null` keeps the IPC
        // layer correct even if the schema is loosened in the future.
        categoryId: parsed.data.categoryId || null,
        subcategoryId: parsed.data.subcategoryId || null,
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
              message:
                'Cannot change amount on a transaction with active splits. Remove splits first.',
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
        actorUserId: deps.actorUserId,
        actorIdentitySource: deps.actorIdentitySource,
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
      // P1-3: Catch ReadOnlyEventLogError and map to EVENT_LOG_READONLY
      if (err instanceof ReadOnlyEventLogError) {
        return {
          ok: false,
          error: {
            code: 'EVENT_LOG_READONLY',
            message: err.message,
          },
        };
      }
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
  readonly actorUserId: string; // P0-1 trial-readiness
  readonly actorIdentitySource: 'local' | 'aad'; // P0-1 trial-readiness
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
        actorUserId: deps.actorUserId,
        actorIdentitySource: deps.actorIdentitySource,
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
      // P1-3: Catch ReadOnlyEventLogError and map to EVENT_LOG_READONLY
      if (err instanceof ReadOnlyEventLogError) {
        return {
          ok: false,
          error: {
            code: 'EVENT_LOG_READONLY',
            message: err.message,
          },
        };
      }
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
  readonly actorUserId: string; // P0-1 trial-readiness
  readonly actorIdentitySource: 'local' | 'aad'; // P0-1 trial-readiness
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
        // Preserve `undefined` (= "don't change this field") semantics while
        // still normalizing '' → null so the merged event payload never
        // carries an empty-string ULID slot.
        categoryId:
          parsed.data.categoryId === undefined ? undefined : parsed.data.categoryId || null,
        subcategoryId:
          parsed.data.subcategoryId === undefined ? undefined : parsed.data.subcategoryId || null,
        tagIds: parsed.data.tagIds,
        status: parsed.data.status,
        type: parsed.data.type,
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
          actorUserId: deps.actorUserId,
          actorIdentitySource: deps.actorIdentitySource,
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
      // P1-3: Catch ReadOnlyEventLogError and map to EVENT_LOG_READONLY
      if (err instanceof ReadOnlyEventLogError) {
        return {
          ok: false,
          failures: [{ id: '', code: 'EVENT_LOG_READONLY', message: err.message }],
        };
      }
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        failures: [{ id: '', code: 'INTERNAL', message }],
      };
    }
  };
}

// Bulk Add Label Handler — append-set tagIds to N transactions (idempotent
// per-tx). Mirrors createTransactionBulkUpdateHandler.
export interface TransactionBulkAddLabelHandlerDeps {
  readonly eventLog: EventLog;
  readonly getReadModel: () => ReadModel;
  readonly now: () => Date;
  readonly newId: () => string;
  readonly datasetId: string;
  readonly actorDeviceId: string;
  readonly actorUserId: string; // P0-1 trial-readiness
  readonly actorIdentitySource: 'local' | 'aad'; // P0-1 trial-readiness
  readonly dekVersion?: number;
  readonly applyEvent?: typeof applyEvent;
}

export function createTransactionBulkAddLabelHandler(
  deps: TransactionBulkAddLabelHandlerDeps,
): (raw: unknown) => Promise<BulkAddLabelTransactionResponse> {
  const apply = deps.applyEvent ?? applyEvent;

  return async function handleTransactionBulkAddLabel(
    raw: unknown,
  ): Promise<BulkAddLabelTransactionResponse> {
    try {
      const parsed = bulkAddLabelTransactionRequestSchema.safeParse(raw);
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

      const input: BulkAddLabelInput = {
        ids: parsed.data.ids,
        tagId: parsed.data.tagId,
        correlationId: parsed.data.correlationId,
      };

      // SPEC-023 FR15 — skip split parents entirely in bulk operations.
      const model = deps.getReadModel();
      const filteredIds = input.ids.filter((id) => !model.splitParentIds.has(id));
      const skippedSplitParentCount = input.ids.length - filteredIds.length;

      // If every requested id is a split parent, the command would EMPTY_IDS;
      // surface that as a non-error happy response with zero updates so the
      // renderer can show the split-parent skipped notice without a failure.
      if (filteredIds.length === 0) {
        return {
          ok: true,
          results: [],
          events: [],
          updatedCount: 0,
          skippedAlreadyHadCount: 0,
          skippedSplitParentCount,
        };
      }

      const result = bulkAddLabelToTransactions(
        { ...input, ids: filteredIds },
        {
          now: deps.now,
          newId: deps.newId,
          readModel: deps.getReadModel(),
          datasetId: deps.datasetId,
          actorDeviceId: deps.actorDeviceId,
          actorUserId: deps.actorUserId,
          actorIdentitySource: deps.actorIdentitySource,
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
      if (result.events.length > 0) {
        const before = (await deps.eventLog.load()).length;
        await deps.eventLog.appendBatch(result.events);
        const after = (await deps.eventLog.load()).length;
        if (after > before) {
          for (const event of result.events) {
            apply(event);
          }
        }
      }

      const updatedSet = new Set(result.updatedIds);
      const results = filteredIds.map((id) => ({
        id,
        status: (updatedSet.has(id) ? 'updated' : 'skipped') as 'updated' | 'skipped',
      }));

      return {
        ok: true,
        results,
        events: result.events,
        updatedCount: result.events.length,
        skippedAlreadyHadCount: result.skippedIds.length,
        skippedSplitParentCount,
      };
    } catch (err) {
      // P1-3: Catch ReadOnlyEventLogError and map to EVENT_LOG_READONLY
      if (err instanceof ReadOnlyEventLogError) {
        return {
          ok: false,
          failures: [{ id: '', code: 'EVENT_LOG_READONLY', message: err.message }],
        };
      }
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        failures: [{ id: '', code: 'INTERNAL', message }],
      };
    }
  };
}
