import { describe, expect, it, beforeEach } from 'vitest';
import { applyEvent, getReadModel, resetReadModel } from './reducers';
import { queryRecentTransactions, getMonthKPIs, getAccountBalances } from './queries';
import { createTransaction } from '../commands/createTransaction';
import type { DomainEvent, AccountCreatedEvent } from '../events/schemas';

const ulid = (suffix: string) => `01HZ${suffix.padEnd(22, '0')}`;

const DATASET_ID = ulid('DATA');
const DEVICE_ID = ulid('DEV1');
const ACCOUNT_ID = ulid('ACC1');

function seedAccountEvent(): AccountCreatedEvent {
  return {
    id: ulid('EVA1'),
    type: 'account.created',
    datasetId: DATASET_ID,
    actorDeviceId: DEVICE_ID,
    createdAt: '2026-01-01T00:00:00.000Z',
    dekVersion: 1,
    version: 1,
    payload: {
      id: ACCOUNT_ID,
      bankName: 'Caixa',
      bankNameShort: null,
      accountLabel: 'Caixa operativa',
      color: null,
      sortOrder: 0,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

describe('reducers — TransactionCreated projection (WI-11)', () => {
  beforeEach(() => {
    resetReadModel();
  });

  it('applies 3 tx.created events produced by createTransaction and projects recent/KPI/balance correctly', () => {
    // Seed: 1 account
    applyEvent(seedAccountEvent());

    // Build 3 transactions via the command, wired to the in-memory read model.
    const specs = [
      {
        date: '2026-03-10',
        type: 'income' as const,
        amount: 500,
        desc: 'Cuota socio marzo',
        createdAt: '2026-03-10T09:00:00.000Z',
      },
      {
        date: '2026-04-05',
        type: 'expense' as const,
        amount: 120,
        desc: 'Suministros abril',
        createdAt: '2026-04-05T12:00:00.000Z',
      },
      {
        date: '2026-04-20',
        type: 'income' as const,
        amount: 2000,
        desc: 'Donación abril',
        createdAt: '2026-04-20T15:30:00.000Z',
      },
    ];

    const evtIds = ['E1', 'T1', 'E2', 'T2', 'E3', 'T3'];
    let i = 0;

    for (const spec of specs) {
      const result = createTransaction(
        {
          accountId: ACCOUNT_ID,
          date: spec.date,
          type: spec.type,
          amount: spec.amount,
          currency: 'EUR',
          description: spec.desc,
        },
        {
          now: () => new Date(spec.createdAt),
          newId: () => {
            const id = evtIds[i] ?? `EX${i}`;
            i += 1;
            return ulid(id);
          },
          readModel: getReadModel(),
          datasetId: DATASET_ID,
          actorDeviceId: DEVICE_ID,
        },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('command failed');
      applyEvent(result.value as DomainEvent);
    }

    // Read model now has 3 transactions.
    const model = getReadModel();
    expect(model.transactions).toHaveLength(3);

    // Recent transactions: sorted DESC by createdAt.
    const recent = queryRecentTransactions(10);
    expect(recent).toHaveLength(3);
    expect(recent.map((t) => t.description)).toEqual([
      'Donación abril',
      'Suministros abril',
      'Cuota socio marzo',
    ]);

    // April KPIs: income 2000, expense 120, net 1880, count 2.
    const aprilKPIs = getMonthKPIs('2026-04');
    expect(aprilKPIs).toEqual({
      yearMonth: '2026-04',
      income: 2000,
      expense: 120,
      net: 1880,
      transactionCount: 2,
    });

    // March KPIs: income 500 only.
    const marchKPIs = getMonthKPIs('2026-03');
    expect(marchKPIs.income).toBe(500);
    expect(marchKPIs.expense).toBe(0);
    expect(marchKPIs.transactionCount).toBe(1);

    // Account balance aggregate.
    const balances = getAccountBalances();
    expect(balances).toHaveLength(1);
    expect(balances[0]).toMatchObject({
      accountId: ACCOUNT_ID,
      income: 2500,
      expense: 120,
      net: 2380,
    });
  });

  it('replays preserve insertion order and recentMovements stays sorted by createdAt desc', () => {
    applyEvent(seedAccountEvent());

    // Apply events out of chronological order — query must still sort DESC.
    const events: DomainEvent[] = [
      {
        id: ulid('EX1'),
        type: 'tx.created',
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
        createdAt: '2026-02-01T00:00:00.000Z',
        dekVersion: 1,
        version: 1,
        payload: {
          id: ulid('T1'),
          date: '2026-02-01',
          type: 'income',
          amount: 10,
          currency: 'EUR',
          description: 'oldest',
          accountId: ACCOUNT_ID,
          categoryId: null,
          subcategoryId: null,
          tagIds: [],
          status: 'approved',
          createdAt: '2026-02-01T00:00:00.000Z',
        },
      },
      {
        id: ulid('EX3'),
        type: 'tx.created',
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
        createdAt: '2026-04-01T00:00:00.000Z',
        dekVersion: 1,
        version: 1,
        payload: {
          id: ulid('T3'),
          date: '2026-04-01',
          type: 'income',
          amount: 30,
          currency: 'EUR',
          description: 'newest',
          accountId: ACCOUNT_ID,
          categoryId: null,
          subcategoryId: null,
          tagIds: [],
          status: 'approved',
          createdAt: '2026-04-01T00:00:00.000Z',
        },
      },
      {
        id: ulid('EX2'),
        type: 'tx.created',
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
        createdAt: '2026-03-01T00:00:00.000Z',
        dekVersion: 1,
        version: 1,
        payload: {
          id: ulid('T2'),
          date: '2026-03-01',
          type: 'income',
          amount: 20,
          currency: 'EUR',
          description: 'middle',
          accountId: ACCOUNT_ID,
          categoryId: null,
          subcategoryId: null,
          tagIds: [],
          status: 'approved',
          createdAt: '2026-03-01T00:00:00.000Z',
        },
      },
    ];
    for (const e of events) applyEvent(e);

    const recent = queryRecentTransactions(10);
    expect(recent.map((t) => t.description)).toEqual(['newest', 'middle', 'oldest']);
  });
});
