// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTransaction } from './transactionApi.js';
import type {
  CreateTransactionRequest,
  CreateTransactionResponse,
  TransactionCreatedEventWire,
} from '../../shared/ipc-contracts/transaction.js';

function stubCreate(result: CreateTransactionResponse): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue(result);
  (window as unknown as { opentreasury: unknown }).opentreasury = {
    transaction: { create: fn },
  };
  return fn;
}

const BASE_INPUT: CreateTransactionRequest = {
  accountId: '01JABCDEF0123456789ABCDEFG',
  date: '2026-04-19',
  type: 'expense',
  amount: 12.5,
  currency: 'EUR',
  description: 'Test lunch',
};

describe('transactionApi.createTransaction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as unknown as { opentreasury?: unknown }).opentreasury;
  });

  it('passes input through to window.opentreasury.transaction.create and returns the success result unchanged', async () => {
    const event: TransactionCreatedEventWire = {
      id: '01JABCDEF0123456789ABCDEFG',
      type: 'tx.created',
      datasetId: '01JABCDEF0123456789ABCDEFG',
      actorDeviceId: '01JABCDEF0123456789ABCDEFG',
      createdAt: '2026-04-19T10:00:00.000Z',
      dekVersion: 1,
      version: 1,
      payload: {
        id: '01JABCDEF0123456789ABCDEFG',
        date: '2026-04-19',
        type: 'expense',
        amount: 12.5,
        currency: 'EUR',
        description: 'Test lunch',
        accountId: '01JABCDEF0123456789ABCDEFG',
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'approved',
        createdAt: '2026-04-19T10:00:00.000Z',
      },
    };
    const fn = stubCreate({ ok: true, event });

    const result = await createTransaction(BASE_INPUT);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(BASE_INPUT);
    expect(result).toEqual({ ok: true, event });
  });

  it('passes validation failures through unchanged (no throw)', async () => {
    const failure: CreateTransactionResponse = {
      ok: false,
      error: {
        code: 'AMOUNT_NON_POSITIVE',
        message: 'amount must be a positive finite number (sign carried by type)',
        field: 'amount',
      },
    };
    stubCreate(failure);

    const result = await createTransaction({ ...BASE_INPUT, amount: 0 });

    expect(result).toEqual(failure);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('AMOUNT_NON_POSITIVE');
  });
});
