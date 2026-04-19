// accounts:create + accounts:list IPC handler factories — WI-15-lite.
//
// Event-sourced CRUD (create + list only). Append-only: every successful
// create emits an `AccountCreated` event to the same NDJSON log used by
// transactions, then folds it into the read model. Nothing throws across
// IPC; validation failures return a structured { ok:false, error } branch.

import type { EventLog } from '../../../core/eventLog/index.js';
import type { ConfigAccountCreatedEvent } from '../../../core/events/schemas.js';
import { applyEvent as coreApplyEvent } from '../../../core/query/reducers.js';
import type { ReadModel } from '../../../core/query/types.js';
import {
  createAccountRequestSchema,
  type AccountRecord,
  type CreateAccountResponse,
} from '../../../shared/ipc-contracts/accounts.js';
import { selectAccounts } from '../../projections/config.js';

export interface AccountsHandlerDeps {
  readonly eventLog: EventLog;
  readonly getReadModel: () => ReadModel;
  readonly now: () => Date;
  readonly newId: () => string;
  /** Override for tests — defaults to core reducer's applyEvent singleton. */
  readonly applyEvent?: typeof coreApplyEvent;
}

export function createAccountsCreateHandler(
  deps: AccountsHandlerDeps,
): (raw: unknown) => Promise<CreateAccountResponse> {
  const apply = deps.applyEvent ?? coreApplyEvent;

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
      const event: ConfigAccountCreatedEvent = {
        type: 'AccountCreated',
        id: deps.newId(),
        name,
        currency: 'EUR',
        openingBalance,
        createdAt: deps.now().toISOString(),
        ...(bankName !== undefined && bankName.length > 0 ? { bankName } : {}),
      };

      // Idempotent append — JsonFileEventLog dedupes by event.id; only apply
      // to the reducer when the log truly grew (mirrors transaction handler).
      const before = (await deps.eventLog.load()).length;
      await deps.eventLog.append(event);
      const after = (await deps.eventLog.load()).length;
      if (after > before) {
        apply(event);
      }

      return { ok: true, event };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { code: 'INTERNAL', message } };
    }
  };
}

export function createAccountsListHandler(
  deps: Pick<AccountsHandlerDeps, 'getReadModel'>,
): () => Promise<{ accounts: AccountRecord[] }> {
  return async function handleAccountsList(): Promise<{ accounts: AccountRecord[] }> {
    return { accounts: selectAccounts(deps.getReadModel()) };
  };
}
