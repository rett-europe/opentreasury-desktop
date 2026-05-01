import { describe, expect, it, beforeEach } from 'vitest';
import {
  transactionCreatedEventSchema as _transactionCreatedEventSchema,
  accountCreatedEventSchema as _accountCreatedEventSchema,
} from '../events/schemas';
import {
  applyEvent,
  replayEvents as _replayEvents,
  resetReadModel,
  getReadModel,
} from './reducers';
import {
  queryRecentTransactions as _queryRecentTransactions,
  getAccountBalances as _getAccountBalances,
  getAccountBalancesInRange as _getAccountBalancesInRange,
  getMonthKPIs as _getMonthKPIs,
  getRangeKPIs as _getRangeKPIs,
  getAccountSparklines as _getAccountSparklines,
  getAccounts as _getAccounts,
} from './queries';
import type { DomainEvent } from '../events/schemas';

const ulid = (suffix: string) => `01HZ${suffix.padEnd(22, '0')}`;

describe('Event-sourced read model', () => {
  beforeEach(() => {
    resetReadModel();
  });

  it('applies tx.created event and updates read model', () => {
    const event: DomainEvent = {
      id: ulid('ENV1'),
      type: 'tx.created',
      datasetId: ulid('DATA'),
      actorDeviceId: ulid('DEV1'),
      createdAt: '2026-04-19T10:00:00Z',
      dekVersion: 1,
      version: 1,
      payload: {
        id: ulid('TX01'),
        date: '2026-04-15',
        type: 'income',
        amount: 1500.0,
        currency: 'EUR',
        description: 'Test income',
        accountId: ulid('ACC1'),
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'approved',
        createdAt: '2026-04-15T12:00:00Z',
      },
    };

    applyEvent(event);
    const model = getReadModel();

    expect(model.transactions).toHaveLength(1);
    expect(model.transactions[0].id).toBe(ulid('TX01'));
    expect(model.transactions[0].amount).toBe(1500.0);
  });

  it('getRangeKPIs computes KPIs for a date range (inclusive)', () => {
    // Seed 3 transactions across different dates
    const events: DomainEvent[] = [
      {
        id: ulid('ENV1'),
        type: 'tx.created',
        datasetId: ulid('DATA'),
        actorDeviceId: ulid('DEV1'),
        createdAt: '2026-04-10T10:00:00Z',
        dekVersion: 1,
        version: 1,
        payload: {
          id: ulid('TX01'),
          date: '2026-04-10',
          type: 'income',
          amount: 1000.0,
          currency: 'EUR',
          description: 'Early income',
          accountId: ulid('ACC1'),
          categoryId: null,
          subcategoryId: null,
          tagIds: [],
          status: 'approved',
          createdAt: '2026-04-10T10:00:00Z',
        },
      },
      {
        id: ulid('ENV2'),
        type: 'tx.created',
        datasetId: ulid('DATA'),
        actorDeviceId: ulid('DEV1'),
        createdAt: '2026-04-20T10:00:00Z',
        dekVersion: 1,
        version: 2,
        payload: {
          id: ulid('TX02'),
          date: '2026-04-20',
          type: 'expense',
          amount: 300.0,
          currency: 'EUR',
          description: 'Mid expense',
          accountId: ulid('ACC1'),
          categoryId: null,
          subcategoryId: null,
          tagIds: [],
          status: 'approved',
          createdAt: '2026-04-20T10:00:00Z',
        },
      },
      {
        id: ulid('ENV3'),
        type: 'tx.created',
        datasetId: ulid('DATA'),
        actorDeviceId: ulid('DEV1'),
        createdAt: '2026-05-05T10:00:00Z',
        dekVersion: 1,
        version: 3,
        payload: {
          id: ulid('TX03'),
          date: '2026-05-05',
          type: 'income',
          amount: 500.0,
          currency: 'EUR',
          description: 'Late income (outside range)',
          accountId: ulid('ACC1'),
          categoryId: null,
          subcategoryId: null,
          tagIds: [],
          status: 'approved',
          createdAt: '2026-05-05T10:00:00Z',
        },
      },
    ];

    events.forEach((e) => applyEvent(e));

    // Range: 2026-04-01 through 2026-04-30 (includes TX01 and TX02, excludes TX03)
    const kpis = _getRangeKPIs('2026-04-01', '2026-04-30');

    expect(kpis).toEqual({
      from: '2026-04-01',
      to: '2026-04-30',
      income: 1000.0,
      expense: 300.0,
      net: 700.0,
      transactionCount: 2,
    });
  });

  it('getRangeKPIs returns zero totals for empty range', () => {
    const kpis = _getRangeKPIs('2026-01-01', '2026-01-31');
    expect(kpis).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
      income: 0,
      expense: 0,
      net: 0,
      transactionCount: 0,
    });
  });

  it('getAccountBalancesInRange filters by date range (inclusive)', () => {
    // Seed AccountCreated config events + multiple transactions across two accounts + date ranges.
    // Note: legacy `account.created` envelope events are no-ops in the reducer (WI-23);
    // configAccounts is populated only by `AccountCreated` config events.
    applyEvent({
      type: 'AccountCreated',
      id: ulid('ACC1'),
      name: 'CaixaBank',
      bankName: 'CaixaBank',
      currency: 'EUR',
      openingBalance: 0,
      sortOrder: 1,
      createdAt: '2026-03-01T10:00:00.000Z',
    } as unknown as DomainEvent);
    applyEvent({
      type: 'AccountCreated',
      id: ulid('ACC2'),
      name: 'Santander',
      bankName: 'Santander',
      currency: 'EUR',
      openingBalance: 0,
      sortOrder: 2,
      createdAt: '2026-03-01T10:00:00.000Z',
    } as unknown as DomainEvent);

    const events: DomainEvent[] = [
      // Transaction in ACC1, inside range
      {
        id: ulid('ENV3'),
        type: 'tx.created',
        datasetId: ulid('DATA'),
        actorDeviceId: ulid('DEV1'),
        createdAt: '2026-04-10T10:00:00Z',
        dekVersion: 1,
        version: 3,
        payload: {
          id: ulid('TX01'),
          date: '2026-04-10',
          type: 'income',
          amount: 1000.0,
          currency: 'EUR',
          description: 'April income',
          accountId: ulid('ACC1'),
          categoryId: null,
          subcategoryId: null,
          tagIds: [],
          status: 'approved',
          createdAt: '2026-04-10T10:00:00Z',
        },
      },
      // Transaction in ACC1, inside range
      {
        id: ulid('ENV4'),
        type: 'tx.created',
        datasetId: ulid('DATA'),
        actorDeviceId: ulid('DEV1'),
        createdAt: '2026-04-20T10:00:00Z',
        dekVersion: 1,
        version: 4,
        payload: {
          id: ulid('TX02'),
          date: '2026-04-20',
          type: 'expense',
          amount: 300.0,
          currency: 'EUR',
          description: 'April expense',
          accountId: ulid('ACC1'),
          categoryId: null,
          subcategoryId: null,
          tagIds: [],
          status: 'approved',
          createdAt: '2026-04-20T10:00:00Z',
        },
      },
      // Transaction in ACC2, inside range
      {
        id: ulid('ENV5'),
        type: 'tx.created',
        datasetId: ulid('DATA'),
        actorDeviceId: ulid('DEV1'),
        createdAt: '2026-04-25T10:00:00Z',
        dekVersion: 1,
        version: 5,
        payload: {
          id: ulid('TX03'),
          date: '2026-04-25',
          type: 'income',
          amount: 500.0,
          currency: 'EUR',
          description: 'Late April income',
          accountId: ulid('ACC2'),
          categoryId: null,
          subcategoryId: null,
          tagIds: [],
          status: 'approved',
          createdAt: '2026-04-25T10:00:00Z',
        },
      },
      // Transaction in ACC1, OUTSIDE range (May)
      {
        id: ulid('ENV6'),
        type: 'tx.created',
        datasetId: ulid('DATA'),
        actorDeviceId: ulid('DEV1'),
        createdAt: '2026-05-05T10:00:00Z',
        dekVersion: 1,
        version: 6,
        payload: {
          id: ulid('TX04'),
          date: '2026-05-05',
          type: 'income',
          amount: 200.0,
          currency: 'EUR',
          description: 'May income (excluded)',
          accountId: ulid('ACC1'),
          categoryId: null,
          subcategoryId: null,
          tagIds: [],
          status: 'approved',
          createdAt: '2026-05-05T10:00:00Z',
        },
      },
    ];

    events.forEach((e) => applyEvent(e));

    // Range: 2026-04-01 through 2026-04-30
    const balances = _getAccountBalancesInRange('2026-04-01', '2026-04-30');

    // Expect 2 accounts, sorted by label (CaixaBank < Santander)
    expect(balances).toHaveLength(2);

    // ACC1: income=1000, expense=300, net=700 (April only)
    expect(balances[0]).toMatchObject({
      accountId: ulid('ACC1'),
      accountLabel: 'CaixaBank',
      income: 1000.0,
      expense: 300.0,
      net: 700.0,
    });

    // ACC2: income=500, expense=0, net=500 (April only)
    expect(balances[1]).toMatchObject({
      accountId: ulid('ACC2'),
      accountLabel: 'Santander',
      income: 500.0,
      expense: 0,
      net: 500.0,
    });
  });

  it('getAccountBalancesInRange includes accounts with zero activity in range', () => {
    // Seed one AccountCreated config event with no transactions in the range
    applyEvent({
      type: 'AccountCreated',
      id: ulid('ACC1'),
      name: 'CaixaBank',
      bankName: 'CaixaBank',
      currency: 'EUR',
      openingBalance: 0,
      sortOrder: 1,
      createdAt: '2026-03-01T10:00:00.000Z',
    } as unknown as DomainEvent);

    const balances = _getAccountBalancesInRange('2026-04-01', '2026-04-30');

    expect(balances).toHaveLength(1);
    expect(balances[0]).toMatchObject({
      accountId: ulid('ACC1'),
      accountLabel: 'CaixaBank',
      income: 0,
      expense: 0,
      net: 0,
    });
  });
});
