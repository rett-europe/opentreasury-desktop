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

    expect(kpis.from).toBe('2026-04-01');
    expect(kpis.to).toBe('2026-04-30');
    expect(kpis.income).toBe(1000.0);
    expect(kpis.expense).toBe(300.0);
    expect(kpis.net).toBe(700.0);
    expect(kpis.transactionCount).toBe(2);
    expect(kpis.accountTransactionCounts.get(ulid('ACC1'))).toBe(2);
  });

  it('getRangeKPIs returns zero totals for empty range', () => {
    const kpis = _getRangeKPIs('2026-01-01', '2026-01-31');
    expect(kpis.from).toBe('2026-01-01');
    expect(kpis.to).toBe('2026-01-31');
    expect(kpis.income).toBe(0);
    expect(kpis.expense).toBe(0);
    expect(kpis.net).toBe(0);
    expect(kpis.transactionCount).toBe(0);
    expect(kpis.accountTransactionCounts.size).toBe(0);
  });
});
