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
});
