// WI-12 — transaction:create handler integration tests.
// Uses an in-memory EventLog stub (dedupes by event.id, matches the
// JsonFileEventLog contract) and a fresh reducer state per test.

import { describe, it, expect, beforeEach } from 'vitest';
import { createTransactionCreateHandler } from './transaction';
import type { EventLog, DomainEvent } from '../../../core/eventLog/EventLog';
import {
  applyEvent,
  getReadModel,
  replayEvents,
  resetReadModel,
} from '../../../core/query/reducers';

const ulid = (suffix: string): string => (suffix + '0'.repeat(26)).slice(0, 26).toUpperCase();

const ACCOUNT_ID = ulid('ACC1');
const DATASET_ID = ulid('DATA');
const DEVICE_ID = ulid('DEV1');
const EVT_ID = ulid('EVT1');
const TX_ID = ulid('TX01');

class InMemoryEventLog implements EventLog {
  private readonly events: DomainEvent[] = [];
  private readonly seen = new Set<string>();

  async append(event: DomainEvent): Promise<void> {
    if (this.seen.has(event.id)) return;
    this.seen.add(event.id);
    this.events.push(event);
  }

  async load(): Promise<DomainEvent[]> {
    return [...this.events];
  }
}

function seedAccount(): void {
  replayEvents([
    {
      id: ulid('EVTACC'),
      type: 'account.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: '2026-04-19T10:00:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: {
        id: ACCOUNT_ID,
        bankName: 'Test Bank',
        bankNameShort: 'TB',
        accountLabel: 'Main',
        color: null,
        sortOrder: 0,
        isActive: true,
        createdAt: '2026-04-19T10:00:00.000Z',
      },
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

    const handle = createTransactionCreateHandler({
      eventLog,
      getReadModel,
      now: () => new Date('2026-04-20T12:00:00.000Z'),
      newId: () => ids[i++]!,
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
    });

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
    const handle = createTransactionCreateHandler({
      eventLog,
      getReadModel,
      now: () => new Date('2026-04-20T12:00:00.000Z'),
      newId: () => ulid('X'),
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
    });

    const response = await handle({ ...baseInput(), accountId: ulid('GHOST') });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.code).toBe('ACCOUNT_NOT_FOUND');
    expect(response.error.field).toBe('accountId');
    expect(await eventLog.load()).toHaveLength(0);
    expect(getReadModel().transactions).toHaveLength(0);
  });

  it('returns SCHEMA_INVALID for payloads that fail Zod at the boundary', async () => {
    const eventLog = new InMemoryEventLog();
    const handle = createTransactionCreateHandler({
      eventLog,
      getReadModel,
      now: () => new Date('2026-04-20T12:00:00.000Z'),
      newId: () => ulid('X'),
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
    });

    const response = await handle({ ...baseInput(), amount: -5 });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.code).toBe('SCHEMA_INVALID');
  });

  it('rejects invalid type enum at boundary', async () => {
    const eventLog = new InMemoryEventLog();
    const handle = createTransactionCreateHandler({
      eventLog,
      getReadModel,
      now: () => new Date(),
      newId: () => ulid('X'),
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
    });

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
    const handle = createTransactionCreateHandler({
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
    });

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
      async load() {
        return [];
      },
    };
    const handle = createTransactionCreateHandler({
      eventLog: throwingLog,
      getReadModel,
      now: () => new Date('2026-04-20T12:00:00.000Z'),
      newId: () => ulid('X'),
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
    });

    const response = await handle(baseInput());
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.code).toBe('INTERNAL');
    expect(response.error.message).toContain('disk on fire');
  });
});
