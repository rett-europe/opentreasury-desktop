// SPEC-023 FR14 + FR15 — split-parent locks on transaction:update and bulkUpdate.
// FR14: Reject parent amount change when active splits exist.
// FR15: Bulk update skips split parents, reports skippedSplitParentCount.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTransactionUpdateHandler,
  createTransactionBulkUpdateHandler,
  type TransactionCreateHandlerDeps,
} from './transaction';
import type { EventLog, DomainEvent } from '../../../core/eventLog/EventLog';
import { getReadModel, replayEvents, resetReadModel } from '../../../core/query/reducers';
import { createTestDeps, testUlid } from '../../../core/test-helpers';

const ACCOUNT_ID = testUlid('ACC1');
const DATASET_ID = testUlid('DATA');
const DEVICE_ID = testUlid('DEV1');

class InMemoryEventLog implements EventLog {
  private readonly events: DomainEvent[] = [];
  private readonly seen = new Set<string>();

  async append(event: DomainEvent): Promise<void> {
    if (this.seen.has(event.id)) return;
    this.seen.add(event.id);
    this.events.push(event);
  }

  async appendBatch(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.append(event);
    }
  }

  async load(): Promise<DomainEvent[]> {
    return [...this.events];
  }
}

function seedAccount(): void {
  replayEvents([
    {
      type: 'AccountCreated',
      id: ACCOUNT_ID,
      name: 'Main',
      label: 'Main',
      bankName: 'Test Bank',
      currency: 'EUR',
      openingBalance: 0,
      sortOrder: 0,
      createdAt: '2026-04-19T10:00:00.000Z',
    } as DomainEvent,
  ]);
}

function createTx(txId: string, amount: number): DomainEvent {
  return {
    type: 'tx.created',
    id: testUlid('EVT-C' + txId),
    datasetId: DATASET_ID,
    actorDeviceId: DEVICE_ID,
    createdAt: '2026-04-20T10:00:00.000Z',
    dekVersion: 0,
    version: 1,
    payload: {
      id: txId,
      date: '2026-04-20',
      type: 'expense',
      amount,
      currency: 'EUR',
      description: 'Test tx ' + txId,
      accountId: ACCOUNT_ID,
      categoryId: null,
      subcategoryId: null,
      tagIds: [],
      status: 'approved',
      createdAt: '2026-04-20T10:00:00.000Z',
      reference: null,
      details: null,
    },
  } as DomainEvent;
}

function makeDeps(): TransactionCreateHandlerDeps {
  return createTestDeps({
    eventLog: new InMemoryEventLog(),
    getReadModel,
    now: () => new Date('2026-04-20T12:00:00.000Z'),
    datasetId: DATASET_ID,
    actorDeviceId: DEVICE_ID,
  });
}

describe('transaction:update — FR14 PARENT_AMOUNT_LOCKED_BY_SPLIT', () => {
  beforeEach(() => {
    resetReadModel();
    seedAccount();
  });

  it('allows updating amount when transaction has no splits', async () => {
    const TX_ID = testUlid('TX01');
    replayEvents([createTx(TX_ID, 500)]);

    const handle = createTransactionUpdateHandler(makeDeps());

    const response = await handle({
      id: TX_ID,
      amount: 600, // change amount
      date: '2026-04-20',
      type: 'expense',
      description: 'Updated',
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.event.type).toBe('tx.updated');
    expect(response.event.payload.amount).toBe(600);
  });

  it('rejects amount change when transaction has active splits (TX_HAS_ACTIVE_SPLITS)', async () => {
    const TX_ID = testUlid('TX02');
    replayEvents([
      createTx(TX_ID, 500),
      {
        type: 'tx.split',
        id: testUlid('EVTSPLIT'),
        parentTxId: TX_ID,
        splits: [
          {
            splitId: testUlid('SP1'),
            amountCents: 30000,
            categoryId: null,
            subcategoryId: null,
            comment: null,
            sortOrder: 0,
          },
          {
            splitId: testUlid('SP2'),
            amountCents: 20000,
            categoryId: null,
            subcategoryId: null,
            comment: null,
            sortOrder: 1,
          },
        ],
        createdAt: '2026-04-20T11:00:00.000Z',
      } as DomainEvent,
    ]);

    const handle = createTransactionUpdateHandler(makeDeps());

    const response = await handle({
      id: TX_ID,
      amount: 600, // attempt to change amount
      date: '2026-04-20',
      type: 'expense',
      description: 'Try to update',
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.code).toBe('TX_HAS_ACTIVE_SPLITS');
    expect(response.error.message).toMatch(/active splits/i);
    expect(response.error.field).toBe('amount');
  });

  it('allows updating other fields (not amount) when transaction has splits', async () => {
    const TX_ID = testUlid('TX03');
    replayEvents([
      createTx(TX_ID, 500),
      {
        type: 'tx.split',
        id: testUlid('EVTSPLIT'),
        parentTxId: TX_ID,
        splits: [
          {
            splitId: testUlid('SP1'),
            amountCents: 30000,
            categoryId: null,
            subcategoryId: null,
            comment: null,
            sortOrder: 0,
          },
          {
            splitId: testUlid('SP2'),
            amountCents: 20000,
            categoryId: null,
            subcategoryId: null,
            comment: null,
            sortOrder: 1,
          },
        ],
        createdAt: '2026-04-20T11:00:00.000Z',
      } as DomainEvent,
    ]);

    const handle = createTransactionUpdateHandler(makeDeps());

    const response = await handle({
      id: TX_ID,
      amount: 500, // same amount — no change
      date: '2026-04-21', // change date
      type: 'expense',
      description: 'Changed description', // change description
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.event.type).toBe('tx.updated');
    expect(response.event.payload.description).toBe('Changed description');
    expect(response.event.payload.date).toBe('2026-04-21');
  });

  it('allows updating amount after splits are removed', async () => {
    const TX_ID = testUlid('TX04');
    replayEvents([
      createTx(TX_ID, 500),
      {
        type: 'tx.split',
        id: testUlid('EVTSPLIT'),
        parentTxId: TX_ID,
        splits: [
          {
            splitId: testUlid('SP1'),
            amountCents: 30000,
            categoryId: null,
            subcategoryId: null,
            comment: null,
            sortOrder: 0,
          },
          {
            splitId: testUlid('SP2'),
            amountCents: 20000,
            categoryId: null,
            subcategoryId: null,
            comment: null,
            sortOrder: 1,
          },
        ],
        createdAt: '2026-04-20T11:00:00.000Z',
      } as DomainEvent,
      {
        type: 'tx.split.removed',
        id: testUlid('EVTREM'),
        parentTxId: TX_ID,
        removedAt: '2026-04-20T11:30:00.000Z',
      } as DomainEvent,
    ]);

    const handle = createTransactionUpdateHandler(makeDeps());

    const response = await handle({
      id: TX_ID,
      amount: 600, // change amount after splits removed
      date: '2026-04-20',
      type: 'expense',
      description: 'Updated',
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.event.payload.amount).toBe(600);
  });
});

describe('transaction:bulkUpdate — FR15 skip split parents', () => {
  beforeEach(() => {
    resetReadModel();
    seedAccount();
  });

  it('applies bulk update to all transactions when none are split parents', async () => {
    const TX_A = testUlid('TXA');
    const TX_B = testUlid('TXB');
    const TX_C = testUlid('TXC');
    replayEvents([createTx(TX_A, 100), createTx(TX_B, 200), createTx(TX_C, 300)]);

    const handle = createTransactionBulkUpdateHandler(makeDeps());

    const response = await handle({
      ids: [TX_A, TX_B, TX_C],
      status: 'pending',
      correlationId: testUlid('CORR'),
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.updatedCount).toBe(3);
    expect(response.skippedSplitParentCount).toBe(0);
  });

  it('skips split parents and reports count when 2 of 5 are split parents', async () => {
    const TX_A = testUlid('TXA');
    const TX_B = testUlid('TXB'); // split parent
    const TX_C = testUlid('TXC');
    const TX_D = testUlid('TXD'); // split parent
    const TX_E = testUlid('TXE');

    replayEvents([
      createTx(TX_A, 100),
      createTx(TX_B, 200),
      createTx(TX_C, 300),
      createTx(TX_D, 400),
      createTx(TX_E, 500),
      // Split TX_B
      {
        type: 'tx.split',
        id: testUlid('SPLB'),
        parentTxId: TX_B,
        splits: [
          {
            splitId: testUlid('SP1'),
            amountCents: 10000,
            categoryId: null,
            subcategoryId: null,
            comment: null,
            sortOrder: 0,
          },
          {
            splitId: testUlid('SP2'),
            amountCents: 10000,
            categoryId: null,
            subcategoryId: null,
            comment: null,
            sortOrder: 1,
          },
        ],
        createdAt: '2026-04-20T11:00:00.000Z',
      } as DomainEvent,
      // Split TX_D
      {
        type: 'tx.split',
        id: testUlid('SPLD'),
        parentTxId: TX_D,
        splits: [
          {
            splitId: testUlid('SP3'),
            amountCents: 20000,
            categoryId: null,
            subcategoryId: null,
            comment: null,
            sortOrder: 0,
          },
          {
            splitId: testUlid('SP4'),
            amountCents: 20000,
            categoryId: null,
            subcategoryId: null,
            comment: null,
            sortOrder: 1,
          },
        ],
        createdAt: '2026-04-20T11:00:00.000Z',
      } as DomainEvent,
    ]);

    const handle = createTransactionBulkUpdateHandler(makeDeps());

    const response = await handle({
      ids: [TX_A, TX_B, TX_C, TX_D, TX_E],
      status: 'pending',
      correlationId: testUlid('CORR'),
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.skippedSplitParentCount).toBe(2); // TX_B and TX_D
    expect(response.updatedCount).toBe(3); // TX_A, TX_C, TX_E
    expect(response.events).toHaveLength(3);
  });

  it('skips all transactions when all 3 are split parents', async () => {
    const TX_A = testUlid('TXA');
    const TX_B = testUlid('TXB');
    const TX_C = testUlid('TXC');

    replayEvents([
      createTx(TX_A, 100),
      createTx(TX_B, 200),
      createTx(TX_C, 300),
      // Split all 3
      {
        type: 'tx.split',
        id: testUlid('SPLA'),
        parentTxId: TX_A,
        splits: [
          {
            splitId: testUlid('SP1'),
            amountCents: 5000,
            categoryId: null,
            subcategoryId: null,
            comment: null,
            sortOrder: 0,
          },
          {
            splitId: testUlid('SP2'),
            amountCents: 5000,
            categoryId: null,
            subcategoryId: null,
            comment: null,
            sortOrder: 1,
          },
        ],
        createdAt: '2026-04-20T11:00:00.000Z',
      } as DomainEvent,
      {
        type: 'tx.split',
        id: testUlid('SPLB'),
        parentTxId: TX_B,
        splits: [
          {
            splitId: testUlid('SP3'),
            amountCents: 10000,
            categoryId: null,
            subcategoryId: null,
            comment: null,
            sortOrder: 0,
          },
          {
            splitId: testUlid('SP4'),
            amountCents: 10000,
            categoryId: null,
            subcategoryId: null,
            comment: null,
            sortOrder: 1,
          },
        ],
        createdAt: '2026-04-20T11:00:00.000Z',
      } as DomainEvent,
      {
        type: 'tx.split',
        id: testUlid('SPLC'),
        parentTxId: TX_C,
        splits: [
          {
            splitId: testUlid('SP5'),
            amountCents: 15000,
            categoryId: null,
            subcategoryId: null,
            comment: null,
            sortOrder: 0,
          },
          {
            splitId: testUlid('SP6'),
            amountCents: 15000,
            categoryId: null,
            subcategoryId: null,
            comment: null,
            sortOrder: 1,
          },
        ],
        createdAt: '2026-04-20T11:00:00.000Z',
      } as DomainEvent,
    ]);

    const handle = createTransactionBulkUpdateHandler(makeDeps());

    const response = await handle({
      ids: [TX_A, TX_B, TX_C],
      status: 'pending',
      correlationId: testUlid('CORR'),
    });

    // When all transactions are split parents, the handler filters them all out,
    // leaving an empty ID list. The command then returns EMPTY_IDS.
    // This is correct behavior: the handler reports skippedSplitParentCount even
    // on the error path.
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.failures).toHaveLength(1);
    expect(response.failures[0]!.code).toBe('EMPTY_IDS');
  });
});
