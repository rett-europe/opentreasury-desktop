// transaction:split/split:remove/split:get IPC handler factories — SPEC-023.
//
// Wire the split mutation commands to the runtime singletons (EventLog +
// reducer read model + ULID/clock generators). Mirrors the createTransaction
// handler's layered validation + error-envelope pattern:
//
//   1. Zod-parse the raw IPC payload (SCHEMA_INVALID at the boundary).
//   2. Business-rule validation inside the handler (TX_NOT_FOUND, SUM_MISMATCH).
//   3. Append to the event log, then apply to the reducer if the log grew.
//
// Nothing throws across IPC — all failures return a discriminated union.
//
// Sum invariant (FR3): `sum(amountCents) === Math.round(parentTx.amount * 100)`.
// Integer comparison — no floating-point tolerance. This check is authoritative
// even if the renderer already validated.

import type { EventLog } from '../../../core/eventLog/index.js';
import type {
  TransactionSplitEvent,
  TransactionSplitRemovedEvent,
} from '../../../core/events/schemas.js';
import { applyEvent } from '../../../core/query/reducers.js';
import type { ReadModel } from '../../../core/query/types.js';
import {
  getSplitsRequestSchema,
  removeSplitRequestSchema,
  splitTransactionRequestSchema,
  type GetSplitsResponse,
  type RemoveSplitResponse,
  type SplitErrorCode,
  type SplitTransactionResponse,
} from '../../../shared/ipc-contracts/transaction-splits.js';

export interface SplitHandlerDeps {
  readonly eventLog: EventLog;
  readonly getReadModel: () => ReadModel;
  readonly now: () => Date;
  readonly newId: () => string;
  readonly applyEvent?: typeof applyEvent;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function schemaInvalid(issues: string): { code: SplitErrorCode; message: string } {
  return { code: 'SCHEMA_INVALID', message: issues };
}

function internal(err: unknown): { code: SplitErrorCode; message: string } {
  const message = err instanceof Error ? err.message : String(err);
  return { code: 'INTERNAL', message };
}

// ---------------------------------------------------------------------------
// transaction:split — create or replace splits for a parent transaction.
// ---------------------------------------------------------------------------

export function createSplitTransactionHandler(
  deps: SplitHandlerDeps,
): (raw: unknown) => Promise<SplitTransactionResponse> {
  const apply = deps.applyEvent ?? applyEvent;

  return async function handleSplitTransaction(
    raw: unknown,
  ): Promise<SplitTransactionResponse> {
    try {
      const parsed = splitTransactionRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: schemaInvalid(
            parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          ),
        };
      }

      const model = deps.getReadModel();
      const parentTx = model.transactions.find((t) => t.id === parsed.data.parentTxId);

      if (!parentTx) {
        return {
          ok: false,
          error: { code: 'TX_NOT_FOUND', message: 'Parent transaction not found' },
        };
      }

      // SPEC-023 FR3 — sum constraint: sum(amountCents) MUST equal parent.amount * 100.
      const totalCents = parsed.data.splits.reduce((sum, s) => sum + s.amountCents, 0);
      const expectedCents = Math.round(parentTx.amount * 100);
      if (totalCents !== expectedCents) {
        return {
          ok: false,
          error: {
            code: 'SUM_MISMATCH',
            message: `Split amounts (${totalCents} cents) do not equal parent amount (${expectedCents} cents)`,
          },
        };
      }

      // Build the event payload. Assign splitId + sortOrder for each child.
      const event: TransactionSplitEvent = {
        type: 'tx.split',
        id: deps.newId(),
        parentTxId: parsed.data.parentTxId,
        splits: parsed.data.splits.map((s, idx) => ({
          splitId: deps.newId(),
          amountCents: s.amountCents,
          categoryId: s.categoryId ?? null,
          subcategoryId: s.subcategoryId ?? null,
          comment: s.comment ?? null,
          sortOrder: idx,
        })),
        createdAt: deps.now().toISOString(),
      };

      const before = (await deps.eventLog.load()).length;
      await deps.eventLog.append(event);
      const after = (await deps.eventLog.load()).length;
      if (after > before) apply(event);

      return { ok: true, event };
    } catch (err) {
      return { ok: false, error: internal(err) };
    }
  };
}

// ---------------------------------------------------------------------------
// transaction:split:remove — revert parent to un-split single-line behaviour.
// ---------------------------------------------------------------------------

export function createRemoveSplitHandler(
  deps: SplitHandlerDeps,
): (raw: unknown) => Promise<RemoveSplitResponse> {
  const apply = deps.applyEvent ?? applyEvent;

  return async function handleRemoveSplit(raw: unknown): Promise<RemoveSplitResponse> {
    try {
      const parsed = removeSplitRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: schemaInvalid(
            parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          ),
        };
      }

      const model = deps.getReadModel();
      const parentTx = model.transactions.find((t) => t.id === parsed.data.parentTxId);

      if (!parentTx) {
        return {
          ok: false,
          error: { code: 'TX_NOT_FOUND', message: 'Parent transaction not found' },
        };
      }

      // Idempotent: if no splits exist, it's a no-op (no error).
      // The read model will ignore the event if the parent has no splits.
      const event: TransactionSplitRemovedEvent = {
        type: 'tx.split.removed',
        id: deps.newId(),
        parentTxId: parsed.data.parentTxId,
        removedAt: deps.now().toISOString(),
      };

      const before = (await deps.eventLog.load()).length;
      await deps.eventLog.append(event);
      const after = (await deps.eventLog.load()).length;
      if (after > before) apply(event);

      return { ok: true, event };
    } catch (err) {
      return { ok: false, error: internal(err) };
    }
  };
}

// ---------------------------------------------------------------------------
// transaction:split:get — query splits for a parent (pre-populate editor).
// ---------------------------------------------------------------------------

export function createGetSplitsHandler(
  deps: Pick<SplitHandlerDeps, 'getReadModel'>,
): (raw: unknown) => Promise<GetSplitsResponse> {
  return async function handleGetSplits(raw: unknown): Promise<GetSplitsResponse> {
    try {
      const parsed = getSplitsRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: schemaInvalid(
            parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          ),
        };
      }

      const model = deps.getReadModel();
      const parentTx = model.transactions.find((t) => t.id === parsed.data.parentTxId);

      if (!parentTx) {
        return {
          ok: false,
          error: { code: 'TX_NOT_FOUND', message: 'Parent transaction not found' },
        };
      }

      const splits = model.splits.get(parsed.data.parentTxId) ?? [];

      return {
        ok: true,
        splits: splits.map((s) => ({
          splitId: s.splitId,
          amountCents: s.amountCents,
          categoryId: s.categoryId,
          subcategoryId: s.subcategoryId,
          comment: s.comment,
          sortOrder: s.sortOrder,
        })),
      };
    } catch (err) {
      return { ok: false, error: internal(err) };
    }
  };
}
