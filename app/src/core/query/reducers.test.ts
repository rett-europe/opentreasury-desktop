import { describe, expect, it, beforeEach } from 'vitest';
import { applyEvent, getReadModel, resetReadModel } from './reducers';
import { queryRecentTransactions, getMonthKPIs, getAccountBalances } from './queries';
import { createTransaction } from '../commands/createTransaction';
import type { DomainEvent, ConfigAccountCreatedEvent } from '../events/schemas';
import { createTestDeps, testUlid } from '../test-helpers';

const DATASET_ID = testUlid('DATASET');
const DEVICE_ID = testUlid('DEVICE');
const ACCOUNT_ID = testUlid('ACC1');

// WI-23 — seed emits the unified `AccountCreated` event (same id space as
// `transaction.accountId`), replacing the legacy `account.created` envelope.
function seedAccountEvent(): ConfigAccountCreatedEvent {
  return {
    type: 'AccountCreated',
    id: ACCOUNT_ID,
    name: 'Caixa operativa',
    label: 'Caixa operativa',
    bankName: 'Caixa',
    currency: 'EUR',
    openingBalance: 0,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
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
      const deps = createTestDeps({
        now: () => new Date(spec.createdAt),
        newId: () => {
          const id = evtIds[i] ?? `EX${i}`;
          i += 1;
          return testUlid(id);
        },
        readModel: getReadModel(),
      });
      const result = createTransaction(
        {
          accountId: ACCOUNT_ID,
          date: spec.date,
          type: spec.type,
          amount: spec.amount,
          currency: 'EUR',
          description: spec.desc,
        },
        deps,
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
        id: testUlid('EX1'),
        type: 'tx.created',
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
        createdAt: '2026-02-01T00:00:00.000Z',
        dekVersion: 1,
        version: 1,
        payload: {
          id: testUlid('T1'),
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
        id: testUlid('EX3'),
        type: 'tx.created',
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
        createdAt: '2026-04-01T00:00:00.000Z',
        dekVersion: 1,
        version: 1,
        payload: {
          id: testUlid('T3'),
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
        id: testUlid('EX2'),
        type: 'tx.created',
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
        createdAt: '2026-03-01T00:00:00.000Z',
        dekVersion: 1,
        version: 1,
        payload: {
          id: testUlid('T2'),
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

// WI-20 — TransactionUpdated and TransactionDeleted projection tests
describe('reducers — tx.updated projection (WI-20)', () => {
  beforeEach(() => {
    resetReadModel();
  });

  it('replaces transaction in projection on tx.updated event', () => {
    applyEvent(seedAccountEvent());

    // Create initial transaction
    const createEvent: DomainEvent = {
      id: testUlid('EX1'),
      type: 'tx.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: '2026-04-01T00:00:00.000Z',
      dekVersion: 1,
      version: 1,
      payload: {
        id: testUlid('T1'),
        date: '2026-04-01',
        type: 'expense',
        amount: 100,
        currency: 'EUR',
        description: 'Original description',
        accountId: ACCOUNT_ID,
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'approved',
        createdAt: '2026-04-01T00:00:00.000Z',
        reference: null,
        details: null,
      },
    };
    applyEvent(createEvent);

    let model = getReadModel();
    expect(model.transactions).toHaveLength(1);
    expect(model.transactions[0]?.description).toBe('Original description');
    expect(model.transactions[0]?.amount).toBe(100);
    expect(model.transactions[0]?.type).toBe('expense');

    // Update transaction
    const updateEvent: DomainEvent = {
      id: testUlid('EX2'),
      type: 'tx.updated',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: '2026-04-15T00:00:00.000Z',
      dekVersion: 1,
      version: 1,
      payload: {
        id: testUlid('T1'), // Same transaction id
        date: '2026-04-10',
        type: 'income',
        amount: 200,
        currency: 'EUR',
        description: 'Updated description',
        accountId: ACCOUNT_ID,
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'pending',
        createdAt: '2026-04-01T00:00:00.000Z', // Original creation timestamp preserved
        updatedAt: '2026-04-15T00:00:00.000Z',
        reference: 'REF-123',
        details: 'Some details',
      },
    };
    applyEvent(updateEvent);

    model = getReadModel();
    expect(model.transactions).toHaveLength(1);
    expect(model.transactions[0]?.description).toBe('Updated description');
    expect(model.transactions[0]?.amount).toBe(200);
    expect(model.transactions[0]?.type).toBe('income');
    expect(model.transactions[0]?.status).toBe('pending');
    expect(model.transactions[0]?.reference).toBe('REF-123');
    expect(model.transactions[0]?.details).toBe('Some details');
    expect(model.transactions[0]?.createdAt).toBe('2026-04-01T00:00:00.000Z');
  });

  it('rebuilds transactionsByReference index on tx.updated', () => {
    applyEvent(seedAccountEvent());

    // Create transaction with reference
    const createEvent: DomainEvent = {
      id: testUlid('EX1'),
      type: 'tx.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: '2026-04-01T00:00:00.000Z',
      dekVersion: 1,
      version: 1,
      payload: {
        id: testUlid('T1'),
        date: '2026-04-01',
        type: 'expense',
        amount: 100,
        currency: 'EUR',
        description: 'Original',
        accountId: ACCOUNT_ID,
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'approved',
        createdAt: '2026-04-01T00:00:00.000Z',
        reference: 'REF-OLD',
        details: null,
      },
    };
    applyEvent(createEvent);

    let model = getReadModel();
    expect(model.transactionsByReference.get('REF-OLD')).toHaveLength(1);

    // Update transaction with new reference
    const updateEvent: DomainEvent = {
      id: testUlid('EX2'),
      type: 'tx.updated',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: '2026-04-15T00:00:00.000Z',
      dekVersion: 1,
      version: 1,
      payload: {
        id: testUlid('T1'),
        date: '2026-04-01',
        type: 'expense',
        amount: 100,
        currency: 'EUR',
        description: 'Updated',
        accountId: ACCOUNT_ID,
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'approved',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-15T00:00:00.000Z',
        reference: 'REF-NEW',
        details: null,
      },
    };
    applyEvent(updateEvent);

    model = getReadModel();
    expect(model.transactionsByReference.get('REF-OLD')).toBeUndefined();
    expect(model.transactionsByReference.get('REF-NEW')).toHaveLength(1);
  });
});

describe('reducers — tx.deleted projection (WI-20)', () => {
  beforeEach(() => {
    resetReadModel();
  });

  it('removes transaction from projection on tx.deleted event', () => {
    applyEvent(seedAccountEvent());

    // Create two transactions
    const tx1: DomainEvent = {
      id: testUlid('EX1'),
      type: 'tx.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: '2026-04-01T00:00:00.000Z',
      dekVersion: 1,
      version: 1,
      payload: {
        id: testUlid('T1'),
        date: '2026-04-01',
        type: 'expense',
        amount: 100,
        currency: 'EUR',
        description: 'Transaction 1',
        accountId: ACCOUNT_ID,
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'approved',
        createdAt: '2026-04-01T00:00:00.000Z',
        reference: null,
        details: null,
      },
    };
    const tx2: DomainEvent = {
      id: testUlid('EX2'),
      type: 'tx.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: '2026-04-02T00:00:00.000Z',
      dekVersion: 1,
      version: 1,
      payload: {
        id: testUlid('T2'),
        date: '2026-04-02',
        type: 'income',
        amount: 200,
        currency: 'EUR',
        description: 'Transaction 2',
        accountId: ACCOUNT_ID,
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'approved',
        createdAt: '2026-04-02T00:00:00.000Z',
        reference: null,
        details: null,
      },
    };
    applyEvent(tx1);
    applyEvent(tx2);

    let model = getReadModel();
    expect(model.transactions).toHaveLength(2);

    // Delete first transaction
    const deleteEvent: DomainEvent = {
      type: 'tx.deleted',
      id: testUlid('EX3'),
      txId: testUlid('T1'),
      deletedAt: '2026-04-15T00:00:00.000Z',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      dekVersion: 1,
      version: 1,
    };
    applyEvent(deleteEvent);

    model = getReadModel();
    expect(model.transactions).toHaveLength(1);
    expect(model.transactions[0]?.description).toBe('Transaction 2');
  });

  it('removes transaction from transactionsByReference index on tx.deleted', () => {
    applyEvent(seedAccountEvent());

    // Create transaction with reference
    const createEvent: DomainEvent = {
      id: testUlid('EX1'),
      type: 'tx.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: '2026-04-01T00:00:00.000Z',
      dekVersion: 1,
      version: 1,
      payload: {
        id: testUlid('T1'),
        date: '2026-04-01',
        type: 'expense',
        amount: 100,
        currency: 'EUR',
        description: 'Transaction',
        accountId: ACCOUNT_ID,
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'approved',
        createdAt: '2026-04-01T00:00:00.000Z',
        reference: 'REF-123',
        details: null,
      },
    };
    applyEvent(createEvent);

    let model = getReadModel();
    expect(model.transactionsByReference.get('REF-123')).toHaveLength(1);

    // Delete transaction
    const deleteEvent: DomainEvent = {
      type: 'tx.deleted',
      id: testUlid('EX2'),
      txId: testUlid('T1'),
      deletedAt: '2026-04-15T00:00:00.000Z',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      dekVersion: 1,
      version: 1,
    };
    applyEvent(deleteEvent);

    model = getReadModel();
    expect(model.transactionsByReference.get('REF-123')).toBeUndefined();
  });

  it('removes notes for deleted transaction', () => {
    applyEvent(seedAccountEvent());

    // Create transaction
    const createEvent: DomainEvent = {
      id: testUlid('EX1'),
      type: 'tx.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: '2026-04-01T00:00:00.000Z',
      dekVersion: 1,
      version: 1,
      payload: {
        id: testUlid('T1'),
        date: '2026-04-01',
        type: 'expense',
        amount: 100,
        currency: 'EUR',
        description: 'Transaction',
        accountId: ACCOUNT_ID,
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'approved',
        createdAt: '2026-04-01T00:00:00.000Z',
        reference: null,
        details: null,
      },
    };
    applyEvent(createEvent);

    // Add note to transaction
    const noteEvent: DomainEvent = {
      type: 'tx.note.added',
      id: testUlid('EN1'),
      noteId: testUlid('N1'),
      txId: testUlid('T1'),
      text: 'Test note',
      createdAt: '2026-04-02T00:00:00.000Z',
    };
    applyEvent(noteEvent);

    let model = getReadModel();
    expect(model.notes.get(testUlid('T1'))).toHaveLength(1);

    // Delete transaction
    const deleteEvent: DomainEvent = {
      type: 'tx.deleted',
      id: testUlid('EX2'),
      txId: testUlid('T1'),
      deletedAt: '2026-04-15T00:00:00.000Z',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      dekVersion: 1,
      version: 1,
    };
    applyEvent(deleteEvent);

    model = getReadModel();
    expect(model.notes.get(testUlid('T1'))).toBeUndefined();
  });
});
