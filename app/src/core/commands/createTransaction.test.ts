import { describe, expect, it } from 'vitest';
import {
  createTransaction,
  type CreateTransactionDeps,
  type CreateTransactionInput,
} from './createTransaction';
import type { ReadModel } from '../query/types';

const ulid = (suffix: string) => `01HZ${suffix.padEnd(22, '0')}`;

const ACCOUNT_ID = ulid('ACC1');
const DATASET_ID = ulid('DATA');
const DEVICE_ID = ulid('DEV1');
const EVT_ID = ulid('EVT1');
const TX_ID = ulid('TX01');

function baseReadModel(): ReadModel {
  return {
    transactions: [],
    accounts: [
      {
        id: ACCOUNT_ID,
        bankName: 'Caixa',
        bankNameShort: null,
        accountLabel: 'Caixa operativa',
        color: null,
        sortOrder: 0,
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    categories: [],
    tags: [],
  };
}

function baseDeps(readModel: ReadModel = baseReadModel()): CreateTransactionDeps {
  // Deterministic newId: returns EVT_ID on 1st call, TX_ID on 2nd.
  const ids = [EVT_ID, TX_ID];
  let i = 0;
  return {
    now: () => new Date('2026-04-20T10:15:00.000Z'),
    newId: () => {
      const next = ids[i] ?? ulid(`EX${i}`);
      i += 1;
      return next;
    },
    readModel,
    datasetId: DATASET_ID,
    actorDeviceId: DEVICE_ID,
    dekVersion: 1,
  };
}

function baseInput(over: Partial<CreateTransactionInput> = {}): CreateTransactionInput {
  return {
    accountId: ACCOUNT_ID,
    date: '2026-04-15',
    type: 'income',
    amount: 1500,
    currency: 'EUR',
    description: 'Donation April',
    ...over,
  };
}

describe('createTransaction — happy path', () => {
  it('returns a tx.created event with correct payload and envelope', () => {
    const result = createTransaction(baseInput(), baseDeps());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const event = result.value;
    expect(event.type).toBe('tx.created');
    expect(event.id).toBe(EVT_ID);
    expect(event.datasetId).toBe(DATASET_ID);
    expect(event.actorDeviceId).toBe(DEVICE_ID);
    expect(event.createdAt).toBe('2026-04-20T10:15:00.000Z');
    expect(event.dekVersion).toBe(1);
    expect(event.version).toBe(1);

    expect(event.payload).toEqual({
      id: TX_ID,
      date: '2026-04-15',
      type: 'income',
      amount: 1500,
      currency: 'EUR',
      description: 'Donation April',
      accountId: ACCOUNT_ID,
      categoryId: null,
      subcategoryId: null,
      tagIds: [],
      status: 'approved',
      createdAt: '2026-04-20T10:15:00.000Z',
    });
  });

  it('preserves optional categoryId, subcategoryId, tagIds, status when provided', () => {
    const catId = ulid('CAT1');
    const subId = ulid('SUB1');
    const tagId = ulid('TAG1');
    const result = createTransaction(
      baseInput({
        type: 'expense',
        amount: 42.5,
        categoryId: catId,
        subcategoryId: subId,
        tagIds: [tagId],
        status: 'pending',
      }),
      baseDeps(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.payload.categoryId).toBe(catId);
    expect(result.value.payload.subcategoryId).toBe(subId);
    expect(result.value.payload.tagIds).toEqual([tagId]);
    expect(result.value.payload.status).toBe('pending');
    expect(result.value.payload.type).toBe('expense');
    expect(result.value.payload.amount).toBe(42.5);
  });
});

describe('createTransaction — validation failures', () => {
  it('rejects unknown accountId', () => {
    const result = createTransaction(
      baseInput({ accountId: ulid('GHOST') }),
      baseDeps(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('ACCOUNT_NOT_FOUND');
    expect(result.error.field).toBe('accountId');
  });

  it('rejects amount = 0', () => {
    const result = createTransaction(baseInput({ amount: 0 }), baseDeps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('AMOUNT_NON_POSITIVE');
    expect(result.error.field).toBe('amount');
  });

  it('rejects negative amount (sign is carried by `type`, not amount)', () => {
    const result = createTransaction(baseInput({ amount: -10 }), baseDeps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('AMOUNT_NON_POSITIVE');
  });

  it('rejects non-finite amount (NaN, Infinity)', () => {
    const r1 = createTransaction(baseInput({ amount: Number.NaN }), baseDeps());
    const r2 = createTransaction(baseInput({ amount: Number.POSITIVE_INFINITY }), baseDeps());
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
  });

  it('rejects empty description', () => {
    const result = createTransaction(baseInput({ description: '   ' }), baseDeps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('DESCRIPTION_EMPTY');
    expect(result.error.field).toBe('description');
  });

  it('rejects malformed date (wrong format)', () => {
    const result = createTransaction(baseInput({ date: '15/04/2026' }), baseDeps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('DATE_INVALID');
    expect(result.error.field).toBe('date');
  });

  it('rejects impossible calendar date (Feb 31)', () => {
    const result = createTransaction(baseInput({ date: '2026-02-31' }), baseDeps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('DATE_INVALID');
  });

  it('rejects empty currency', () => {
    const result = createTransaction(
      baseInput({ currency: '' as unknown as 'EUR' }),
      baseDeps(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CURRENCY_EMPTY');
  });

  it('rejects invalid type', () => {
    const result = createTransaction(
      baseInput({ type: 'transfer' as unknown as 'income' }),
      baseDeps(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('TYPE_INVALID');
  });
});

describe('createTransaction — determinism', () => {
  it('uses injected now() and newId() without touching globals', () => {
    let nowCalls = 0;
    let idCalls = 0;
    const deps: CreateTransactionDeps = {
      now: () => {
        nowCalls += 1;
        return new Date('2026-06-01T00:00:00.000Z');
      },
      newId: () => {
        idCalls += 1;
        return ulid(`ID${idCalls}`);
      },
      readModel: baseReadModel(),
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
    };

    const result = createTransaction(baseInput(), deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(nowCalls).toBeGreaterThanOrEqual(1);
    expect(idCalls).toBe(2); // event id + transaction id
    expect(result.value.id).not.toBe(result.value.payload.id);
    expect(result.value.createdAt).toBe('2026-06-01T00:00:00.000Z');
    expect(result.value.payload.createdAt).toBe('2026-06-01T00:00:00.000Z');
  });
});
