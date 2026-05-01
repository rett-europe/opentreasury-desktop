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
  getAccountTransactionCountsInRange as _getAccountTransactionCountsInRange,
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

  it('getAccountTransactionCountsInRange returns per-account counts in date range', () => {
    // Seed 2 accounts with AccountCreated flat events (WI-23 shape)
    const accountEvents: DomainEvent[] = [
      {
        type: 'AccountCreated',
        id: ulid('ACC1'),
        name: 'Checking',
        bankName: 'Bank A',
        currency: 'EUR',
        openingBalance: 0,
        sortOrder: 0,
        createdAt: '2026-04-01T10:00:00Z',
      },
      {
        type: 'AccountCreated',
        id: ulid('ACC2'),
        name: 'Savings',
        bankName: 'Bank B',
        currency: 'EUR',
        openingBalance: 0,
        sortOrder: 1,
        createdAt: '2026-04-01T10:00:00Z',
      },
    ];

    // Seed transactions: 3 for ACC1 (2 in range), 1 for ACC2 (all in range)
    const txEvents: DomainEvent[] = [
      {
        id: ulid('ENV1'),
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
          description: 'ACC1 income in range',
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
        version: 4,
        payload: {
          id: ulid('TX02'),
          date: '2026-04-20',
          type: 'expense',
          amount: 300.0,
          currency: 'EUR',
          description: 'ACC1 expense in range',
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
        version: 5,
        payload: {
          id: ulid('TX03'),
          date: '2026-05-05',
          type: 'income',
          amount: 500.0,
          currency: 'EUR',
          description: 'ACC1 income outside range',
          accountId: ulid('ACC1'),
          categoryId: null,
          subcategoryId: null,
          tagIds: [],
          status: 'approved',
          createdAt: '2026-05-05T10:00:00Z',
        },
      },
      {
        id: ulid('ENV4'),
        type: 'tx.created',
        datasetId: ulid('DATA'),
        actorDeviceId: ulid('DEV1'),
        createdAt: '2026-04-15T10:00:00Z',
        dekVersion: 1,
        version: 6,
        payload: {
          id: ulid('TX04'),
          date: '2026-04-15',
          type: 'expense',
          amount: 50.0,
          currency: 'EUR',
          description: 'ACC2 expense in range',
          accountId: ulid('ACC2'),
          categoryId: null,
          subcategoryId: null,
          tagIds: [],
          status: 'approved',
          createdAt: '2026-04-15T10:00:00Z',
        },
      },
    ];

    [...accountEvents, ...txEvents].forEach((e) => applyEvent(e));

    // Range: 2026-04-01 through 2026-04-30
    const counts = _getAccountTransactionCountsInRange('2026-04-01', '2026-04-30');

    expect(counts).toEqual({
      [ulid('ACC1')]: 2, // TX01 and TX02
      [ulid('ACC2')]: 1, // TX04
    });
  });

  it('getAccountTransactionCountsInRange includes zero counts for accounts with no transactions', () => {
    // Seed 1 account but no transactions
    const accountEvents: DomainEvent[] = [
      {
        type: 'AccountCreated',
        id: ulid('ACC1'),
        name: 'Empty Account',
        bankName: 'Bank A',
        currency: 'EUR',
        openingBalance: 0,
        sortOrder: 0,
        createdAt: '2026-04-01T10:00:00Z',
      },
    ];

    accountEvents.forEach((e) => applyEvent(e));

    const counts = _getAccountTransactionCountsInRange('2026-04-01', '2026-04-30');

    expect(counts).toEqual({
      [ulid('ACC1')]: 0,
    });
  });
});
