// Accounts API client — thin wrapper over window.opentreasury.accounts.*
// Mirrors panelApi/movementsApi patterns. Part of WI-15-lite (Trinity).

import type {
  AccountsListRequest,
  AccountsListResponse,
  CreateAccountRequest,
  CreateAccountResponse,
} from '../../shared/ipc-contracts/accounts.js';

/** List accounts (server sort order). Pass `includeArchived: true` to surface archived records. */
export async function listAccounts(req?: AccountsListRequest): Promise<AccountsListResponse> {
  return window.opentreasury.accounts.list(req);
}

/**
 * Create a new account. Resolves with a discriminated-union result:
 *  - `{ ok: true, event }` on success.
 *  - `{ ok: false, error }` on validation failure (callers map error.field
 *    + error.code → field-level messages via i18n `errors.*`).
 *
 * Only unexpected transport errors reject.
 */
export async function createAccount(input: CreateAccountRequest): Promise<CreateAccountResponse> {
  return window.opentreasury.accounts.create(input);
}
