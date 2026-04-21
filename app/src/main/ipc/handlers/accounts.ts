// accounts:create + accounts:list + (WI-21) accounts:update / accounts:archive
// / accounts:unarchive IPC handler factories.
//
// Event-sourced CRUD (archive-only — no hard-delete per Switch's WI-21
// ruling). Append-only: every successful mutation emits an `AccountCreated`
// / `AccountUpdated` / `AccountArchived` / `AccountUnarchived` event to the
// same NDJSON log used by transactions, then folds it into the read model.
// Nothing throws across IPC; validation failures return a structured
// { ok:false, error } branch.

import type { EventLog } from '../../../core/eventLog/index.js';
import type {
  ConfigAccountArchivedEvent,
  ConfigAccountCreatedEvent,
  ConfigAccountUnarchivedEvent,
  ConfigAccountUpdatedEvent,
} from '../../../core/events/schemas.js';
import { applyEvent as coreApplyEvent } from '../../../core/query/reducers.js';
import type { ReadModel } from '../../../core/query/types.js';
import {
  archiveAccountRequestSchema,
  createAccountRequestSchema,
  unarchiveAccountRequestSchema,
  updateAccountRequestSchema,
  type AccountRecord,
  type ArchiveAccountResponse,
  type CreateAccountResponse,
  type UnarchiveAccountResponse,
  type UpdateAccountResponse,
} from '../../../shared/ipc-contracts/accounts.js';
import { selectAccounts, selectActiveAccounts } from '../../projections/config.js';

export interface AccountsHandlerDeps {
  readonly eventLog: EventLog;
  readonly getReadModel: () => ReadModel;
  readonly now: () => Date;
  readonly newId: () => string;
  /** Override for tests — defaults to core reducer's applyEvent singleton. */
  readonly applyEvent?: typeof coreApplyEvent;
}

async function appendAndApply(
  deps: AccountsHandlerDeps,
  event: Parameters<typeof coreApplyEvent>[0],
): Promise<void> {
  const apply = deps.applyEvent ?? coreApplyEvent;
  // Idempotent append — JsonFileEventLog dedupes by event.id; only apply
  // to the reducer when the log truly grew (mirrors transaction handler).
  const before = (await deps.eventLog.load()).length;
  await deps.eventLog.append(event);
  const after = (await deps.eventLog.load()).length;
  if (after > before) {
    apply(event);
  }
}

export function createAccountsCreateHandler(
  deps: AccountsHandlerDeps,
): (raw: unknown) => Promise<CreateAccountResponse> {
  return async function handleAccountsCreate(raw: unknown): Promise<CreateAccountResponse> {
    try {
      const parsed = createAccountRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: 'SCHEMA_INVALID',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        };
      }

      const name = parsed.data.name.trim();
      if (name.length === 0) {
        return {
          ok: false,
          error: { code: 'NAME_EMPTY', message: 'Account name is required', field: 'name' },
        };
      }

      const openingBalance = parsed.data.openingBalance ?? 0;
      if (!Number.isFinite(openingBalance)) {
        return {
          ok: false,
          error: {
            code: 'OPENING_BALANCE_INVALID',
            message: 'Opening balance must be a finite number',
            field: 'openingBalance',
          },
        };
      }

      const existing = deps.getReadModel().configAccounts;
      const clash = existing.some((a) => a.name.trim().toLowerCase() === name.toLowerCase());
      if (clash) {
        return {
          ok: false,
          error: {
            code: 'NAME_DUPLICATE',
            message: `An account named "${name}" already exists`,
            field: 'name',
          },
        };
      }

      const bankName = parsed.data.bankName?.trim();
      const label = parsed.data.label?.trim();
      const iban = parsed.data.iban?.trim();
      const color = parsed.data.color?.trim();
      const event: ConfigAccountCreatedEvent = {
        type: 'AccountCreated',
        id: deps.newId(),
        name,
        currency: 'EUR',
        openingBalance,
        createdAt: deps.now().toISOString(),
        ...(bankName !== undefined && bankName.length > 0 ? { bankName } : {}),
        ...(label !== undefined && label.length > 0 ? { label } : {}),
        ...(iban !== undefined && iban.length > 0 ? { iban } : {}),
        ...(color !== undefined && color.length > 0 ? { color } : {}),
        ...(parsed.data.isPaypal !== undefined ? { isPaypal: parsed.data.isPaypal } : {}),
      };

      await appendAndApply(deps, event);

      return { ok: true, event };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { code: 'INTERNAL', message } };
    }
  };
}

export function createAccountsListHandler(
  deps: Pick<AccountsHandlerDeps, 'getReadModel'>,
): (raw?: unknown) => Promise<{ accounts: AccountRecord[] }> {
  return async function handleAccountsList(raw?: unknown): Promise<{ accounts: AccountRecord[] }> {
    const includeArchived =
      typeof raw === 'object' &&
      raw !== null &&
      'includeArchived' in raw &&
      (raw as { includeArchived?: unknown }).includeArchived === true;
    const model = deps.getReadModel();
    return {
      accounts: includeArchived ? selectAccounts(model) : selectActiveAccounts(model),
    };
  };
}

export function createAccountsUpdateHandler(
  deps: AccountsHandlerDeps,
): (raw: unknown) => Promise<UpdateAccountResponse> {
  return async function handleAccountsUpdate(raw: unknown): Promise<UpdateAccountResponse> {
    try {
      const parsed = updateAccountRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: 'SCHEMA_INVALID',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        };
      }

      const { id, changes } = parsed.data;
      const existing = deps.getReadModel().configAccounts;
      const current = existing.find((a) => a.id === id);
      if (!current) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: `Account ${id} not found` },
        };
      }

      // Normalise strings (trim) and reject an empty name explicitly so we
      // never persist whitespace-only values.
      const normalised: typeof changes = { ...changes };
      if (normalised.name !== undefined) {
        const trimmed = normalised.name.trim();
        if (trimmed.length === 0) {
          return {
            ok: false,
            error: { code: 'NAME_EMPTY', message: 'Account name is required', field: 'name' },
          };
        }
        normalised.name = trimmed;
      }
      if (normalised.bankName !== undefined) normalised.bankName = normalised.bankName.trim();
      if (normalised.label !== undefined) normalised.label = normalised.label.trim();
      if (normalised.iban !== undefined) normalised.iban = normalised.iban.trim();
      if (normalised.color !== undefined) normalised.color = normalised.color.trim();

      if (normalised.name !== undefined) {
        const clash = existing.some(
          (a) => a.id !== id && a.name.trim().toLowerCase() === normalised.name!.toLowerCase(),
        );
        if (clash) {
          return {
            ok: false,
            error: {
              code: 'NAME_DUPLICATE',
              message: `An account named "${normalised.name}" already exists`,
              field: 'name',
            },
          };
        }
      }

      const event: ConfigAccountUpdatedEvent = {
        type: 'AccountUpdated',
        id: deps.newId(),
        accountId: id,
        changes: normalised,
        updatedAt: deps.now().toISOString(),
      };

      await appendAndApply(deps, event);

      return { ok: true, event };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { code: 'INTERNAL', message } };
    }
  };
}

export function createAccountsArchiveHandler(
  deps: AccountsHandlerDeps,
): (raw: unknown) => Promise<ArchiveAccountResponse> {
  return async function handleAccountsArchive(raw: unknown): Promise<ArchiveAccountResponse> {
    try {
      const parsed = archiveAccountRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: 'SCHEMA_INVALID',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        };
      }
      const { id } = parsed.data;
      const current = deps.getReadModel().configAccounts.find((a) => a.id === id);
      if (!current) {
        return { ok: false, error: { code: 'NOT_FOUND', message: `Account ${id} not found` } };
      }
      if (current.archivedAt !== undefined) {
        return {
          ok: false,
          error: { code: 'ALREADY_ARCHIVED', message: `Account ${id} is already archived` },
        };
      }

      const event: ConfigAccountArchivedEvent = {
        type: 'AccountArchived',
        id: deps.newId(),
        accountId: id,
        archivedAt: deps.now().toISOString(),
      };
      await appendAndApply(deps, event);
      return { ok: true, event };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { code: 'INTERNAL', message } };
    }
  };
}

export function createAccountsUnarchiveHandler(
  deps: AccountsHandlerDeps,
): (raw: unknown) => Promise<UnarchiveAccountResponse> {
  return async function handleAccountsUnarchive(raw: unknown): Promise<UnarchiveAccountResponse> {
    try {
      const parsed = unarchiveAccountRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: 'SCHEMA_INVALID',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        };
      }
      const { id } = parsed.data;
      const current = deps.getReadModel().configAccounts.find((a) => a.id === id);
      if (!current) {
        return { ok: false, error: { code: 'NOT_FOUND', message: `Account ${id} not found` } };
      }
      if (current.archivedAt === undefined) {
        return {
          ok: false,
          error: { code: 'NOT_ARCHIVED', message: `Account ${id} is not archived` },
        };
      }

      const event: ConfigAccountUnarchivedEvent = {
        type: 'AccountUnarchived',
        id: deps.newId(),
        accountId: id,
        unarchivedAt: deps.now().toISOString(),
      };
      await appendAndApply(deps, event);
      return { ok: true, event };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { code: 'INTERNAL', message } };
    }
  };
}
