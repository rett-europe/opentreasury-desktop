// WI-12 — transaction:create handler integration tests.
// WI-31a — transaction:bulkUpdate handler integration tests.
// Uses an in-memory EventLog stub (dedupes by event.id, matches the
// JsonFileEventLog contract) and a fresh reducer state per test.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTransactionCreateHandler,
  createTransactionBulkUpdateHandler,
  createTransactionBulkAddLabelHandler,
} from './transaction';
import type { EventLog, DomainEvent } from '../../../core/eventLog/EventLog';
import {
  applyEvent,
  getReadModel,
  replayEvents,
  resetReadModel,
} from '../../../core/query/reducers';
import { createTestDeps, testUlid } from '../../../core/test-helpers';

const ACCOUNT_ID = testUlid('ACC1');
const DATASET_ID = testUlid('DATASET');
const DEVICE_ID = testUlid('DEVICE');
const EVT_ID = testUlid('EVT1');
const TX_ID = testUlid('TX01');

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
  // WI-23 — seed the unified `AccountCreated` event so `transaction.accountId`
  // resolves against a populated `configAccounts` projection (legacy
  // `account.created` is refused by the loader boot-guard).
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

function baseInput() {
  return {
    accountId: ACCOUNT_ID,
    date: '2026-04-20',
    type: 'income' as const,
    amount: 100,
    currency: 'EUR' as const,
    description: 'Test donation',
  };
}

describe('transaction:create handler — happy path', () => {
  beforeEach(() => {
    resetReadModel();
    seedAccount();
  });

  it('validates input, calls core command, appends to event log, applies reducer', async () => {
    const eventLog = new InMemoryEventLog();
    const ids = [EVT_ID, TX_ID];
    let i = 0;

    const handle = createTransactionCreateHandler(
      createTestDeps({
        eventLog,
        getReadModel,
        now: () => new Date('2026-04-20T12:00:00.000Z'),
        newId: () => ids[i++]!,
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
      }),
    );

    const response = await handle(baseInput());

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.event.type).toBe('tx.created');
    expect(response.event.id).toBe(EVT_ID);
    expect(response.event.payload.id).toBe(TX_ID);
    expect(response.event.datasetId).toBe(DATASET_ID);

    const stored = await eventLog.load();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.id).toBe(EVT_ID);

    expect(getReadModel().transactions).toHaveLength(1);
    expect(getReadModel().transactions[0]!.id).toBe(TX_ID);
  });
});

describe('transaction:create handler — validation failures', () => {
  beforeEach(() => {
    resetReadModel();
    seedAccount();
  });

  it('returns ACCOUNT_NOT_FOUND for unknown account (no throw across IPC)', async () => {
    const eventLog = new InMemoryEventLog();
    const handle = createTransactionCreateHandler(
      createTestDeps({
        eventLog,
        getReadModel,
        now: () => new Date('2026-04-20T12:00:00.000Z'),
        newId: () => testUlid('X'),
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
      }),
    );

    const response = await handle({ ...baseInput(), accountId: testUlid('GHOST') });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.code).toBe('ACCOUNT_NOT_FOUND');
    expect(response.error.field).toBe('accountId');
    expect(await eventLog.load()).toHaveLength(0);
    expect(getReadModel().transactions).toHaveLength(0);
  });

  it('returns SCHEMA_INVALID for payloads that fail Zod at the boundary', async () => {
    const eventLog = new InMemoryEventLog();
    const handle = createTransactionCreateHandler(
      createTestDeps({
        eventLog,
        getReadModel,
        now: () => new Date('2026-04-20T12:00:00.000Z'),
        newId: () => testUlid('X'),
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
      }),
    );

    const response = await handle({ ...baseInput(), amount: -5 });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.code).toBe('SCHEMA_INVALID');
  });

  it('rejects invalid type enum at boundary', async () => {
    const eventLog = new InMemoryEventLog();
    const handle = createTransactionCreateHandler(
      createTestDeps({
        eventLog,
        getReadModel,
        now: () => new Date(),
        newId: () => testUlid('X'),
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
      }),
    );

    const response = await handle({ ...baseInput(), type: 'transfer' });
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.code).toBe('SCHEMA_INVALID');
  });
});

describe('transaction:create handler — idempotency', () => {
  beforeEach(() => {
    resetReadModel();
    seedAccount();
  });

  it('appending the same event.id twice only applies the reducer once', async () => {
    const eventLog = new InMemoryEventLog();
    // Fixed ids — every call returns the same event id + tx id.
    const handle = createTransactionCreateHandler(
      createTestDeps({
        eventLog,
        getReadModel,
        now: () => new Date('2026-04-20T12:00:00.000Z'),
        newId: (() => {
          const queue = [EVT_ID, TX_ID, EVT_ID, TX_ID];
          let k = 0;
          return () => queue[k++]!;
        })(),
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
        applyEvent,
      }),
    );

    const r1 = await handle(baseInput());
    const r2 = await handle(baseInput());

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(await eventLog.load()).toHaveLength(1);
    // Reducer must not double-apply: only one transaction projected.
    expect(getReadModel().transactions).toHaveLength(1);
  });
});

describe('transaction:create handler — unexpected errors', () => {
  beforeEach(() => {
    resetReadModel();
    seedAccount();
  });

  it('wraps EventLog throws as INTERNAL without escaping IPC', async () => {
    const throwingLog: EventLog = {
      async append() {
        throw new Error('disk on fire');
      },
      async appendBatch() {
        throw new Error('disk on fire');
      },
      async load() {
        return [];
      },
    };
    const handle = createTransactionCreateHandler(
      createTestDeps({
        eventLog: throwingLog,
        getReadModel,
        now: () => new Date('2026-04-20T12:00:00.000Z'),
        newId: () => testUlid('X'),
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
      }),
    );

    const response = await handle(baseInput());
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.code).toBe('INTERNAL');
    expect(response.error.message).toContain('disk on fire');
  });
});

// ---------------------------------------------------------------------------
// WI-31a — transaction:bulkUpdate handler integration tests
// ---------------------------------------------------------------------------

const TX1_ID = testUlid('TX01');
const TX2_ID = testUlid('TX02');
const TX3_ID = testUlid('TX03');
const CORRELATION_ID = testUlid('COR1');

function seedTransactions(): void {
  replayEvents([
    {
      id: testUlid('EVTTX1'),
      type: 'tx.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: '2026-04-20T10:00:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: {
        id: TX1_ID,
        date: '2026-04-20',
        type: 'expense',
        amount: 100,
        currency: 'EUR',
        description: 'Transaction 1',
        accountId: ACCOUNT_ID,
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'approved',
        createdAt: '2026-04-20T10:00:00.000Z',
        reference: null,
        details: null,
      },
    } as DomainEvent,
    {
      id: testUlid('EVTTX2'),
      type: 'tx.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: '2026-04-20T11:00:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: {
        id: TX2_ID,
        date: '2026-04-21',
        type: 'income',
        amount: 200,
        currency: 'EUR',
        description: 'Transaction 2',
        accountId: ACCOUNT_ID,
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'pending',
        createdAt: '2026-04-20T11:00:00.000Z',
        reference: null,
        details: null,
      },
    } as DomainEvent,
    {
      id: testUlid('EVTTX3'),
      type: 'tx.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: '2026-04-20T12:00:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: {
        id: TX3_ID,
        date: '2026-04-22',
        type: 'expense',
        amount: 50,
        currency: 'EUR',
        description: 'Transaction 3',
        accountId: ACCOUNT_ID,
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'approved',
        createdAt: '2026-04-20T12:00:00.000Z',
        reference: null,
        details: null,
      },
    } as DomainEvent,
  ]);
}

const CAT_ID = testUlid('CAT1');

describe('transaction:bulkUpdate handler — happy path', () => {
  beforeEach(() => {
    resetReadModel();
    seedAccount();
    seedTransactions();
  });

  it('bulk-updates 3 transactions, appends events, applies reducer', async () => {
    const eventLog = new InMemoryEventLog();
    let evtCounter = 0;

    const handle = createTransactionBulkUpdateHandler(
      createTestDeps({
        eventLog,
        getReadModel,
        now: () => new Date('2026-04-24T12:00:00.000Z'),
        newId: () => testUlid(`BK${evtCounter++}`),
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
        applyEvent,
      }),
    );

    const response = await handle({
      ids: [TX1_ID, TX2_ID, TX3_ID],
      categoryId: CAT_ID,
      status: 'pending',
      correlationId: CORRELATION_ID,
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.updatedCount).toBe(3);
    expect(response.events).toHaveLength(3);

    // All events share the same correlationId
    for (const event of response.events) {
      expect(event.payload.correlationId).toBe(CORRELATION_ID);
      expect(event.payload.categoryId).toBe(CAT_ID);
      expect(event.payload.status).toBe('pending');
    }

    // Events were appended to the log
    const stored = await eventLog.load();
    expect(stored).toHaveLength(3);

    // Reducer was applied — transactions updated in read model
    const txs = getReadModel().transactions;
    const tx1 = txs.find((t) => t.id === TX1_ID);
    expect(tx1!.categoryId).toBe(CAT_ID);
    expect(tx1!.status).toBe('pending');
  });
});

describe('transaction:bulkUpdate handler — validation failures', () => {
  beforeEach(() => {
    resetReadModel();
    seedAccount();
    seedTransactions();
  });

  it('returns failures when one tx is unknown (all-or-nothing)', async () => {
    const eventLog = new InMemoryEventLog();

    const handle = createTransactionBulkUpdateHandler(
      createTestDeps({
        eventLog,
        getReadModel,
        now: () => new Date('2026-04-24T12:00:00.000Z'),
        newId: () => testUlid('BK0'),
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
        applyEvent,
      }),
    );

    const response = await handle({
      ids: [TX1_ID, testUlid('GHOST')],
      categoryId: CAT_ID,
      correlationId: CORRELATION_ID,
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.failures).toHaveLength(1);
    expect(response.failures[0]!.code).toBe('TX_NOT_FOUND');

    // No events appended
    expect(await eventLog.load()).toHaveLength(0);
  });

  it('returns SCHEMA_INVALID for payloads that fail Zod at the boundary', async () => {
    const eventLog = new InMemoryEventLog();

    const handle = createTransactionBulkUpdateHandler(
      createTestDeps({
        eventLog,
        getReadModel,
        now: () => new Date(),
        newId: () => testUlid('BK0'),
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
        applyEvent,
      }),
    );

    // Missing correlationId
    const response = await handle({ ids: [TX1_ID] });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.failures[0]!.code).toBe('SCHEMA_INVALID');
  });
});

describe('transaction:bulkUpdate handler — unexpected errors', () => {
  beforeEach(() => {
    resetReadModel();
    seedAccount();
    seedTransactions();
  });

  it('wraps EventLog throws as INTERNAL without escaping IPC', async () => {
    const throwingLog: EventLog = {
      async append() {
        throw new Error('disk on fire');
      },
      async appendBatch() {
        throw new Error('disk on fire');
      },
      async load() {
        return [];
      },
    };

    const handle = createTransactionBulkUpdateHandler(
      createTestDeps({
        eventLog: throwingLog,
        getReadModel,
        now: () => new Date('2026-04-24T12:00:00.000Z'),
        newId: () => testUlid('BK0'),
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
        applyEvent,
      }),
    );

    const response = await handle({
      ids: [TX1_ID],
      correlationId: CORRELATION_ID,
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.failures[0]!.code).toBe('INTERNAL');
    expect(response.failures[0]!.message).toContain('disk on fire');
  });
});

// ---------------------------------------------------------------------------
// WI-31a — response-schema-parse tests
// Ensures handler responses survive the `bulkUpdateTransactionResponseSchema.parse()`
// gate in `handlers.ts` — catches drift between emitted codes and the Zod enum.
// ---------------------------------------------------------------------------

import {
  bulkUpdateTransactionResponseSchema,
  bulkAddLabelTransactionResponseSchema,
} from '../../../shared/ipc-contracts/transaction';

describe('transaction:bulkUpdate — response survives Zod response-schema parse', () => {
  beforeEach(() => {
    resetReadModel();
    seedAccount();
    seedTransactions();
  });

  it('happy-path response parses through bulkUpdateTransactionResponseSchema', async () => {
    const eventLog = new InMemoryEventLog();
    let evtCounter = 0;

    const handle = createTransactionBulkUpdateHandler(
      createTestDeps({
        eventLog,
        getReadModel,
        now: () => new Date('2026-04-24T12:00:00.000Z'),
        newId: () => testUlid(`RS${evtCounter++}`),
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
        applyEvent,
      }),
    );

    const response = await handle({
      ids: [TX1_ID],
      categoryId: CAT_ID,
      correlationId: CORRELATION_ID,
    });

    expect(() => bulkUpdateTransactionResponseSchema.parse(response)).not.toThrow();
  });

  it('EMPTY_IDS failure parses through bulkUpdateTransactionResponseSchema', () => {
    // The request schema enforces ids.min(1) so EMPTY_IDS can only come
    // from a direct command call. Simulate by constructing the response
    // shape the handler would produce and parsing it.
    const emptyIdsResponse = {
      ok: false as const,
      failures: [{ id: '', code: 'EMPTY_IDS', message: 'ids must be non-empty' }],
    };
    expect(() => bulkUpdateTransactionResponseSchema.parse(emptyIdsResponse)).not.toThrow();
  });

  it('SCHEMA_INVALID failure parses through bulkUpdateTransactionResponseSchema', async () => {
    const eventLog = new InMemoryEventLog();

    const handle = createTransactionBulkUpdateHandler(
      createTestDeps({
        eventLog,
        getReadModel,
        now: () => new Date(),
        newId: () => testUlid('RS0'),
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
        applyEvent,
      }),
    );

    // Missing correlationId triggers SCHEMA_INVALID
    const response = await handle({ ids: [TX1_ID] });

    expect(response.ok).toBe(false);
    expect(() => bulkUpdateTransactionResponseSchema.parse(response)).not.toThrow();
  });

  it('INTERNAL failure parses through bulkUpdateTransactionResponseSchema', async () => {
    const throwingLog: EventLog = {
      async append() {
        throw new Error('boom');
      },
      async appendBatch() {
        throw new Error('boom');
      },
      async load() {
        return [];
      },
    };

    const handle = createTransactionBulkUpdateHandler(
      createTestDeps({
        eventLog: throwingLog,
        getReadModel,
        now: () => new Date('2026-04-24T12:00:00.000Z'),
        newId: () => testUlid('RS0'),
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
        applyEvent,
      }),
    );

    const response = await handle({
      ids: [TX1_ID],
      correlationId: CORRELATION_ID,
    });

    expect(response.ok).toBe(false);
    expect(() => bulkUpdateTransactionResponseSchema.parse(response)).not.toThrow();
  });

  it('TX_NOT_FOUND failure parses through bulkUpdateTransactionResponseSchema', async () => {
    const eventLog = new InMemoryEventLog();

    const handle = createTransactionBulkUpdateHandler(
      createTestDeps({
        eventLog,
        getReadModel,
        now: () => new Date(),
        newId: () => testUlid('RS0'),
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
        applyEvent,
      }),
    );

    const response = await handle({
      ids: [testUlid('GHOST')],
      correlationId: CORRELATION_ID,
    });

    expect(response.ok).toBe(false);
    expect(() => bulkUpdateTransactionResponseSchema.parse(response)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Bulk Add Label — handler integration tests.
// Mirrors the WI-31a bulk-update suite above with the parallel scenarios
// requested in Pedro's spec: happy path (3 txs), idempotent (1 already has
// the label), unknown tx id, invalid (unknown) label.
// ---------------------------------------------------------------------------

// (bulkAddLabelTransactionResponseSchema imported above with bulkUpdate.)

const TAG_ID = testUlid('TAG1');

function seedAccountTagAndTransactions(extraEvents: DomainEvent[] = []): void {
  // `replayEvents` resets the read model on every call, so all seed events
  // must be applied in a single batch (this differs from `seedAccount()` +
  // `seedTransactions()` above, which is fine only for tests that don't
  // need the account in the projection — they only patch txs).
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
    {
      type: 'TagCreated',
      id: TAG_ID,
      name: 'COVID-19',
      sortOrder: 0,
      createdAt: '2026-04-19T10:00:00.000Z',
    } as DomainEvent,
    {
      id: testUlid('EVTTX1'),
      type: 'tx.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: '2026-04-20T10:00:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: {
        id: TX1_ID,
        date: '2026-04-20',
        type: 'expense',
        amount: 100,
        currency: 'EUR',
        description: 'Transaction 1',
        accountId: ACCOUNT_ID,
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'approved',
        createdAt: '2026-04-20T10:00:00.000Z',
        reference: null,
        details: null,
      },
    } as DomainEvent,
    {
      id: testUlid('EVTTX2'),
      type: 'tx.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: '2026-04-20T11:00:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: {
        id: TX2_ID,
        date: '2026-04-21',
        type: 'income',
        amount: 200,
        currency: 'EUR',
        description: 'Transaction 2',
        accountId: ACCOUNT_ID,
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'pending',
        createdAt: '2026-04-20T11:00:00.000Z',
        reference: null,
        details: null,
      },
    } as DomainEvent,
    {
      id: testUlid('EVTTX3'),
      type: 'tx.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: '2026-04-20T12:00:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: {
        id: TX3_ID,
        date: '2026-04-22',
        type: 'expense',
        amount: 50,
        currency: 'EUR',
        description: 'Transaction 3',
        accountId: ACCOUNT_ID,
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'approved',
        createdAt: '2026-04-20T12:00:00.000Z',
        reference: null,
        details: null,
      },
    } as DomainEvent,
    ...extraEvents,
  ]);
}

describe('transaction:bulkAddLabel handler — happy path', () => {
  beforeEach(() => {
    resetReadModel();
    seedAccountTagAndTransactions();
  });

  it('appends the label to 3 transactions, persists 3 events, applies reducer', async () => {
    const eventLog = new InMemoryEventLog();
    let evtCounter = 0;

    const handle = createTransactionBulkAddLabelHandler(
      createTestDeps({
        eventLog,
        getReadModel,
        now: () => new Date('2026-04-24T12:00:00.000Z'),
        newId: () => testUlid(`AL${evtCounter++}`),
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
        applyEvent,
      }),
    );

    const response = await handle({
      ids: [TX1_ID, TX2_ID, TX3_ID],
      tagId: TAG_ID,
      correlationId: CORRELATION_ID,
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.updatedCount).toBe(3);
    expect(response.skippedAlreadyHadCount).toBe(0);
    expect(response.skippedSplitParentCount).toBe(0);
    expect(response.events).toHaveLength(3);
    expect(response.results).toHaveLength(3);
    expect(response.results.every((r) => r.status === 'updated')).toBe(true);

    for (const event of response.events) {
      expect(event.payload.correlationId).toBe(CORRELATION_ID);
      expect(event.payload.tagIds).toContain(TAG_ID);
    }

    expect(await eventLog.load()).toHaveLength(3);

    // Reducer applied — read model reflects the new tag on each tx.
    const txs = getReadModel().transactions;
    for (const id of [TX1_ID, TX2_ID, TX3_ID]) {
      const tx = txs.find((t) => t.id === id);
      expect(tx!.tagIds).toContain(TAG_ID);
    }
  });
});

describe('transaction:bulkAddLabel handler — idempotency', () => {
  beforeEach(() => {
    resetReadModel();
    // Pre-tag TX2 with TAG_ID by seeding a `tx.updated` event in the same
    // replay batch — replayEvents resets the model on every call, so this
    // must travel together with the rest of the seed.
    seedAccountTagAndTransactions([
      {
        id: testUlid('PRETAG'),
        type: 'tx.updated',
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
        createdAt: '2026-04-22T00:00:00.000Z',
        dekVersion: 0,
        version: 1,
        payload: {
          id: TX2_ID,
          date: '2026-04-21',
          type: 'income',
          amount: 200,
          currency: 'EUR',
          description: 'Transaction 2',
          accountId: ACCOUNT_ID,
          categoryId: null,
          subcategoryId: null,
          tagIds: [TAG_ID],
          status: 'pending',
          createdAt: '2026-04-20T11:00:00.000Z',
          updatedAt: '2026-04-22T00:00:00.000Z',
          reference: null,
          details: null,
        },
      } as DomainEvent,
    ]);
  });

  it('silently skips a tx that already has the label (no event emitted for it)', async () => {
    const eventLog = new InMemoryEventLog();
    let evtCounter = 0;

    const handle = createTransactionBulkAddLabelHandler(
      createTestDeps({
        eventLog,
        getReadModel,
        now: () => new Date('2026-04-24T12:00:00.000Z'),
        newId: () => testUlid(`AL${evtCounter++}`),
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
        applyEvent,
      }),
    );

    const response = await handle({
      ids: [TX1_ID, TX2_ID, TX3_ID],
      tagId: TAG_ID,
      correlationId: CORRELATION_ID,
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.updatedCount).toBe(2); // TX1 + TX3
    expect(response.skippedAlreadyHadCount).toBe(1); // TX2
    expect(response.events).toHaveLength(2);

    // Per-tx result map reflects the skip.
    const tx2Result = response.results.find((r) => r.id === TX2_ID);
    expect(tx2Result?.status).toBe('skipped');
    const tx1Result = response.results.find((r) => r.id === TX1_ID);
    expect(tx1Result?.status).toBe('updated');

    // Only 2 events were appended to the log (no duplicate tagging of TX2).
    expect(await eventLog.load()).toHaveLength(2);

    // None of the emitted events target TX2.
    for (const event of response.events) {
      expect(event.payload.id).not.toBe(TX2_ID);
    }
  });
});

describe('transaction:bulkAddLabel handler — validation failures', () => {
  beforeEach(() => {
    resetReadModel();
    seedAccountTagAndTransactions();
  });

  it('returns TX_NOT_FOUND when one tx id is unknown (all-or-nothing)', async () => {
    const eventLog = new InMemoryEventLog();

    const handle = createTransactionBulkAddLabelHandler(
      createTestDeps({
        eventLog,
        getReadModel,
        now: () => new Date('2026-04-24T12:00:00.000Z'),
        newId: () => testUlid('AL0'),
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
        applyEvent,
      }),
    );

    const response = await handle({
      ids: [TX1_ID, testUlid('GHOST')],
      tagId: TAG_ID,
      correlationId: CORRELATION_ID,
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.failures).toHaveLength(1);
    expect(response.failures[0]!.code).toBe('TX_NOT_FOUND');

    expect(await eventLog.load()).toHaveLength(0);
  });

  it('returns TAG_NOT_FOUND when the requested label does not exist', async () => {
    const eventLog = new InMemoryEventLog();

    const handle = createTransactionBulkAddLabelHandler(
      createTestDeps({
        eventLog,
        getReadModel,
        now: () => new Date('2026-04-24T12:00:00.000Z'),
        newId: () => testUlid('AL0'),
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
        applyEvent,
      }),
    );

    const response = await handle({
      ids: [TX1_ID],
      tagId: testUlid('NOTAG'),
      correlationId: CORRELATION_ID,
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.failures).toHaveLength(1);
    expect(response.failures[0]!.code).toBe('TAG_NOT_FOUND');
    expect(await eventLog.load()).toHaveLength(0);
  });

  it('returns SCHEMA_INVALID for payloads that fail Zod at the boundary', async () => {
    const eventLog = new InMemoryEventLog();

    const handle = createTransactionBulkAddLabelHandler(
      createTestDeps({
        eventLog,
        getReadModel,
        now: () => new Date(),
        newId: () => testUlid('AL0'),
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
        applyEvent,
      }),
    );

    // Missing tagId
    const response = await handle({ ids: [TX1_ID], correlationId: CORRELATION_ID });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.failures[0]!.code).toBe('SCHEMA_INVALID');
  });
});

describe('transaction:bulkAddLabel — response survives Zod response-schema parse', () => {
  beforeEach(() => {
    resetReadModel();
    seedAccountTagAndTransactions();
  });

  it('happy-path response parses through bulkAddLabelTransactionResponseSchema', async () => {
    const eventLog = new InMemoryEventLog();
    let evtCounter = 0;

    const handle = createTransactionBulkAddLabelHandler(
      createTestDeps({
        eventLog,
        getReadModel,
        now: () => new Date('2026-04-24T12:00:00.000Z'),
        newId: () => testUlid(`RS${evtCounter++}`),
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
        applyEvent,
      }),
    );

    const response = await handle({
      ids: [TX1_ID],
      tagId: TAG_ID,
      correlationId: CORRELATION_ID,
    });

    expect(() => bulkAddLabelTransactionResponseSchema.parse(response)).not.toThrow();
  });

  it('TAG_NOT_FOUND failure parses through bulkAddLabelTransactionResponseSchema', async () => {
    const eventLog = new InMemoryEventLog();

    const handle = createTransactionBulkAddLabelHandler(
      createTestDeps({
        eventLog,
        getReadModel,
        now: () => new Date(),
        newId: () => testUlid('RS0'),
        datasetId: DATASET_ID,
        actorDeviceId: DEVICE_ID,
        applyEvent,
      }),
    );

    const response = await handle({
      ids: [TX1_ID],
      tagId: testUlid('NOTAG'),
      correlationId: CORRELATION_ID,
    });

    expect(() => bulkAddLabelTransactionResponseSchema.parse(response)).not.toThrow();
  });
});
