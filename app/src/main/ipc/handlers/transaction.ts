// transaction:create IPC handler factory — WI-12.
//
// Wires the pure core/commands/createTransaction command to the runtime
// singletons (EventLog + reducer read model + ULID/clock generators).
//
// Validation is layered:
//   1. Zod-parse the raw IPC payload (boundary check — renderer is untrusted).
//   2. Business-rule validation inside createTransaction() (e.g. account exists).
// Errors are returned as a discriminated union; nothing throws across IPC.

import {
  createTransaction,
  type CreateTransactionInput,
  type ValidationErrorCode,
} from '../../../core/commands/index.js';
import type { EventLog } from '../../../core/eventLog/index.js';
import { applyEvent } from '../../../core/query/reducers.js';
import type { ReadModel } from '../../../core/query/types.js';
import {
  createTransactionRequestSchema,
  type CreateTransactionResponse,
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
