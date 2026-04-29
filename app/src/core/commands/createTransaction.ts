// WI-11: createTransaction command — pure domain, no I/O.
//
// Produces a `tx.created` DomainEvent envelope from validated input + deps.
// Wiring to IPC (WI-12), UI (WI-13), and event-log persistence (WI-4′) happens
// in their own WIs. This module is Electron-free and fs-free (ADR-002 §2.4).
//
// Schema choice (locked by WI-1 + docs/schemas/cloud-reference-notes.md):
//   - `amount` is ALWAYS positive; `type: 'income' | 'expense'` determines sign.
//   - Mirrors cloud `transactions.amount` (Decimal, positive) + `transaction_type`.
//     Do NOT introduce a signed amount here.

import type { TransactionCreatedEvent, TransactionCreatedPayload } from '../events/schemas';
import type { ReadModel } from '../query/types';

export type TransactionType = 'income' | 'expense';
export type TransactionStatus = 'pending' | 'approved';

export interface CreateTransactionInput {
  readonly accountId: string;
  readonly date: string; // YYYY-MM-DD
  readonly type: TransactionType;
  readonly amount: number; // positive; sign carried by `type`
  readonly currency: 'EUR';
  readonly description: string;
  readonly categoryId?: string | null;
  readonly subcategoryId?: string | null;
  readonly tagIds?: readonly string[];
  readonly status?: TransactionStatus;
  // WI-19 — optional user-supplied metadata. Trim + empty→null is applied
  // at the IPC boundary (shared/ipc-contracts/transaction.ts); by the time
  // the command runs, values are either a non-empty string or null/omitted.
  readonly reference?: string | null;
  readonly details?: string | null;
}

export interface CreateTransactionDeps {
  readonly now: () => Date;
  readonly newId: () => string; // ULID generator (26-char Crockford base32)
  readonly readModel: ReadModel;
  readonly datasetId: string; // ULID of the active dataset
  readonly actorDeviceId: string; // ULID of the current device
  readonly actorUserId: string; // ULID of the current user — P0-1 trial-readiness
  readonly actorIdentitySource: 'local' | 'aad'; // P0-1 trial-readiness
  readonly dekVersion?: number; // defaults to 1 for M1.5
}

export type ValidationErrorCode =
  | 'ACCOUNT_NOT_FOUND'
  | 'AMOUNT_NON_POSITIVE'
  | 'CURRENCY_EMPTY'
  | 'DATE_INVALID'
  | 'DESCRIPTION_EMPTY'
  | 'TYPE_INVALID';

export interface ValidationError {
  readonly code: ValidationErrorCode;
  readonly field: keyof CreateTransactionInput;
  readonly message: string;
}

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(s: string): boolean {
  if (!ISO_DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  // Guard against e.g. 2026-02-31 being coerced to a valid March date.
  const iso = d.toISOString().slice(0, 10);
  return iso === s;
}

// WI-19 — defensive normalization at the command layer: trim, empty→null,
// clamp to max length. The IPC schema already normalizes, but the command is
// callable in tests and future direct-call paths so we repeat the rule here.
function normalizeFreeText(value: string | null | undefined, maxLen: number): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

export function createTransaction(
  input: CreateTransactionInput,
  deps: CreateTransactionDeps,
): Result<TransactionCreatedEvent, ValidationError> {
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

  if (typeof input.currency !== 'string' || input.currency.trim() === '') {
    return {
      ok: false,
      error: {
        code: 'CURRENCY_EMPTY',
        field: 'currency',
        message: 'currency must be a non-empty ISO 4217 code',
      },
    };
  }

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

  const accountExists = deps.readModel.configAccounts.some((a) => a.id === input.accountId);
  if (!accountExists) {
    return {
      ok: false,
      error: {
        code: 'ACCOUNT_NOT_FOUND',
        field: 'accountId',
        message: `accountId '${input.accountId}' does not exist in the read model`,
      },
    };
  }

  const createdAt = deps.now().toISOString();
  const eventId = deps.newId();
  const transactionId = deps.newId();

  const payload: TransactionCreatedPayload = {
    id: transactionId,
    date: input.date,
    type: input.type,
    amount: input.amount,
    currency: input.currency,
    description: input.description,
    accountId: input.accountId,
    categoryId: input.categoryId ?? null,
    subcategoryId: input.subcategoryId ?? null,
    tagIds: input.tagIds ? [...input.tagIds] : [],
    status: input.status ?? 'approved',
    createdAt,
    // WI-19 — always emit explicit null for absent fields so new events are
    // unambiguous (downstream reducers still tolerate `undefined` for
    // backward-compat with pre-WI-19 events on disk).
    reference: normalizeFreeText(input.reference, 120),
    details: normalizeFreeText(input.details, 1000),
  };

  const event: TransactionCreatedEvent = {
    id: eventId,
    type: 'tx.created',
    datasetId: deps.datasetId,
    actorDeviceId: deps.actorDeviceId,
    actorUserId: deps.actorUserId,
    actorIdentitySource: deps.actorIdentitySource,
    createdAt,
    dekVersion: deps.dekVersion ?? 1,
    version: 1,
    payload,
  };

  return { ok: true, value: event };
}
