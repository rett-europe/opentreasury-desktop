// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAccount, listAccounts } from './accountsApi.js';
import type {
  AccountRecord,
  AccountsListResponse,
  CreateAccountRequest,
  CreateAccountResponse,
} from '../../shared/ipc-contracts/accounts.js';

function stub(api: { list?: ReturnType<typeof vi.fn>; create?: ReturnType<typeof vi.fn> }): void {
  (window as unknown as { opentreasury: unknown }).opentreasury = {
    accounts: api,
  };
}

const SAMPLE: AccountRecord = {
  id: '01JABCDEF0123456789ABCDEFG',
  name: 'Principal',
  bankName: 'Unicaja',
  currency: 'EUR',
  openingBalance: 1000,
  createdAt: '2026-04-19T10:00:00.000Z',
};

describe('accountsApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as unknown as { opentreasury?: unknown }).opentreasury;
  });

  it('listAccounts returns the accounts payload unchanged', async () => {
    const payload: AccountsListResponse = { accounts: [SAMPLE] };
    const fn = vi.fn().mockResolvedValue(payload);
    stub({ list: fn });

    const result = await listAccounts();

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toEqual(payload);
  });

  it('createAccount forwards the request and returns the success event', async () => {
    const req: CreateAccountRequest = { name: 'Eventos', openingBalance: 0 };
    const ok: CreateAccountResponse = {
      ok: true,
      event: { type: 'AccountCreated', ...SAMPLE },
    };
    const fn = vi.fn().mockResolvedValue(ok);
    stub({ create: fn });

    const result = await createAccount(req);

    expect(fn).toHaveBeenCalledWith(req);
    expect(result).toEqual(ok);
  });

  it('createAccount passes validation failures through (no throw)', async () => {
    const fail: CreateAccountResponse = {
      ok: false,
      error: { code: 'NAME_EMPTY', message: 'name is required', field: 'name' },
    };
    const fn = vi.fn().mockResolvedValue(fail);
    stub({ create: fn });

    const result = await createAccount({ name: '' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('NAME_EMPTY');
  });

  it('createAccount rejects only on transport errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    stub({ create: fn });

    await expect(createAccount({ name: 'X' })).rejects.toThrow('boom');
  });
});
