// WI-20: updateTransaction command — pure domain, no I/O.
//
// Produces a `tx.updated` DomainEvent envelope from validated input + deps.
// Full-replacement payload (Pattern A from Neo's WI-20 scope doc).
// accountId is immutable — command ignores any incoming accountId and uses
// the stored value from the existing transaction.

import { z } from 'zod';
import type { TransactionUpdatedEvent, TransactionUpdatedPayload } from '../events/schemas';
import type { ReadModel } from '../query/types';
import type { TransactionType, TransactionStatus } from './createTransaction';

export interface UpdateTransactionInput {
  readonly id: string; // Transaction id being updated
  readonly date: string; // YYYY-MM-DD
  readonly type: TransactionType;
  readonly amount: number; // positive; sign carried by `type`
  readonly description: string;
  readonly categoryId?: string | null;
  readonly subcategoryId?: string | null;
  readonly tagIds?: readonly string[];
  readonly status?: TransactionStatus | undefined;
  readonly reference?: string | null | undefined;
  readonly details?: string | null | undefined;
}

export interface UpdateTransactionDeps {
  readonly now: () => Date;
  readonly newId: () => string; // ULID generator for event id
  readonly readModel: ReadModel;
  readonly datasetId: string;
  readonly actorDeviceId: string;
  readonly actorUserId: string; // P0-1 trial-readiness
  readonly actorIdentitySource: 'local' | 'aad'; // P0-1 trial-readiness
  readonly dekVersion?: number;
}

export type UpdateValidationErrorCode =
  | 'TX_NOT_FOUND'
  | 'AMOUNT_NON_POSITIVE'
  | 'DATE_INVALID'
  | 'DESCRIPTION_EMPTY'
  | 'TYPE_INVALID'
  | 'REFERENCE_TOO_LONG'
  | 'DETAILS_TOO_LONG';

export interface UpdateValidationError {
  readonly code: UpdateValidationErrorCode;
  readonly field: keyof UpdateTransactionInput;
  readonly message: string;
}

export type UpdateResult<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(s: string): boolean {
  if (!ISO_DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  const iso = d.toISOString().slice(0, 10);
  return iso === s;
}

// Validate full ISO 8601 datetimes with the SAME predicate the event/IPC
// response schemas use (`z.string().datetime()`), so any value we accept here
// is guaranteed to pass the downstream gate.
const isoDateTimeSchema = z.string().datetime();
function isValidIsoDateTime(s: unknown): s is string {
  return typeof s === 'string' && isoDateTimeSchema.safeParse(s).success;
}

function normalizeFreeText(value: string | null | undefined, maxLen: number): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

export function updateTransaction(
  input: UpdateTransactionInput,
  deps: UpdateTransactionDeps,
): UpdateResult<TransactionUpdatedEvent, UpdateValidationError> {
  // Validate type
  if (input.type !== 'income' && input.type !== 'expense') {
    return {
      ok: false,
      error: {
        code: 'TYPE_INVALID',
        field: 'type',
        message: "type must be 'income' or 'expense'",
      },
    };
  }

  // Validate amount
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return {
      ok: false,
      error: {
        code: 'AMOUNT_NON_POSITIVE',
        field: 'amount',
        message: 'amount must be a positive finite number (sign carried by type)',
      },
    };
  }

  // Validate description
  if (typeof input.description !== 'string' || input.description.trim() === '') {
    return {
      ok: false,
      error: {
        code: 'DESCRIPTION_EMPTY',
        field: 'description',
        message: 'description must be a non-empty string',
      },
    };
  }

  // Validate date
  if (!isValidIsoDate(input.date)) {
    return {
      ok: false,
      error: {
        code: 'DATE_INVALID',
        field: 'date',
        message: 'date must be a valid ISO 8601 calendar date (YYYY-MM-DD)',
      },
    };
  }

  // Normalize free-text fields
  const reference = normalizeFreeText(input.reference, 120);
  const details = normalizeFreeText(input.details, 1000);

  // Validate reference length
  if (reference !== null && reference.length > 120) {
    return {
      ok: false,
      error: {
        code: 'REFERENCE_TOO_LONG',
        field: 'reference',
        message: 'reference must not exceed 120 characters',
      },
    };
  }

  // Validate details length
  if (details !== null && details.length > 1000) {
    return {
      ok: false,
      error: {
        code: 'DETAILS_TOO_LONG',
        field: 'details',
        message: 'details must not exceed 1000 characters',
      },
    };
  }

  // Find existing transaction
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

  const updatedAt = deps.now().toISOString();
  const eventId = deps.newId();

  // Self-heal: never propagate a corrupt stored createdAt. A single bad
  // timestamp from ANY source (e.g. a legacy/dev-seeded row) must not make a
  // transaction permanently uneditable — the event/IPC schemas validate
  // createdAt with z.string().datetime(), so a garbage value would otherwise
  // be rejected at the response gate and the edit would always fail. Fall back
  // to noon UTC on the tx's own (validated) date; if that is somehow also
  // invalid, use the edit timestamp, which is always a valid ISO datetime.
  const safeCreatedAt = isValidIsoDateTime(existing.createdAt)
    ? existing.createdAt
    : isValidIsoDate(existing.date)
      ? `${existing.date}T12:00:00.000Z`
      : updatedAt;

  const payload: TransactionUpdatedPayload = {
    id: input.id,
    date: input.date,
    type: input.type,
    amount: input.amount,
    currency: 'EUR', // Always EUR
    description: input.description,
    accountId: existing.accountId, // Immutable — use stored value
    // `||` (not `??`): treat empty-string ID as "no category" so we never
    // emit '' into the event payload (event schema requires ULID-or-null).
    categoryId: input.categoryId || null,
    subcategoryId: input.subcategoryId || null,
    tagIds: input.tagIds ? [...input.tagIds] : [],
    status: input.status ?? existing.status, // Preserve existing status if not provided
    createdAt: safeCreatedAt, // Preserve original creation timestamp (self-healed if corrupt)
    updatedAt,
    reference,
    details,
  };

  const event: TransactionUpdatedEvent = {
    id: eventId,
    type: 'tx.updated',
    datasetId: deps.datasetId,
    actorDeviceId: deps.actorDeviceId,
    actorUserId: deps.actorUserId,
    actorIdentitySource: deps.actorIdentitySource,
    createdAt: updatedAt, // Event timestamp is when the edit occurred
    dekVersion: deps.dekVersion ?? 1,
    version: 1,
    payload,
  };

  return { ok: true, value: event };
}
