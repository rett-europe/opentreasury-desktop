// WI-15-lite — accounts:create + accounts:list handler tests.
// Uses an in-memory EventLog stub (dedupes by event.id, matches the
// JsonFileEventLog contract) and a fresh reducer state per test.

import { describe, it, expect, beforeEach } from 'vitest';
import { createAccountsCreateHandler, createAccountsListHandler } from './accounts';
import type { EventLog, DomainEvent } from '../../../core/eventLog/EventLog';
import { getReadModel, resetReadModel } from '../../../core/query/reducers';

class InMemoryEventLog implements EventLog {
  readonly events: DomainEvent[] = [];
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

const FIXED_NOW = new Date('2026-04-20T12:00:00.000Z');

function idGen(prefix: string): () => string {
  let i = 0;
  return () => `${prefix}_${++i}`;
}

function makeHandler(log = new InMemoryEventLog(), newId = idGen('A')) {
  const handle = createAccountsCreateHandler({
    eventLog: log,
    getReadModel,
    now: () => FIXED_NOW,
    newId,
  });
  return { log, handle };
}

describe('accounts:create — happy path', () => {
  beforeEach(() => resetReadModel());

  it('creates an account, appends the event, updates the read model', async () => {
    const { log, handle } = makeHandler();

    const resp = await handle({ name: 'Banco ABC', bankName: 'Unicaja', openingBalance: 100 });

    expect(resp.ok).toBe(true);
    if (!resp.ok) return;
    expect(resp.event.type).toBe('AccountCreated');
    expect(resp.event.name).toBe('Banco ABC');
    expect(resp.event.bankName).toBe('Unicaja');
    expect(resp.event.currency).toBe('EUR');
    expect(resp.event.openingBalance).toBe(100);
    expect(resp.event.createdAt).toBe(FIXED_NOW.toISOString());
    expect(log.events).toHaveLength(1);
    expect(getReadModel().configAccounts).toHaveLength(1);
    expect(getReadModel().configAccounts[0]!.name).toBe('Banco ABC');
  });

  it('defaults openingBalance to 0 and omits bankName when not provided', async () => {
    const { handle } = makeHandler();
    const resp = await handle({ name: 'Caja' });

    expect(resp.ok).toBe(true);
    if (!resp.ok) return;
    expect(resp.event.openingBalance).toBe(0);
    expect(resp.event.bankName).toBeUndefined();
  });

  it('trims whitespace from name', async () => {
    const { handle } = makeHandler();
    const resp = await handle({ name: '  Caja Rural  ' });

    expect(resp.ok).toBe(true);
    if (!resp.ok) return;
    expect(resp.event.name).toBe('Caja Rural');
  });
});

describe('accounts:create — validation failures', () => {
  beforeEach(() => resetReadModel());

  it('returns NAME_EMPTY for blank name', async () => {
    const { handle } = makeHandler();
    const resp = await handle({ name: '   ' });

    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('NAME_EMPTY');
    expect(resp.error.field).toBe('name');
  });

  it('returns SCHEMA_INVALID for non-object payload', async () => {
    const { handle } = makeHandler();
    const resp = await handle({ name: 123 });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('SCHEMA_INVALID');
  });

  it('returns OPENING_BALANCE_INVALID for non-finite balance', async () => {
    const { handle } = makeHandler();
    const resp = await handle({ name: 'Infinite', openingBalance: Number.POSITIVE_INFINITY });

    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('OPENING_BALANCE_INVALID');
    expect(resp.error.field).toBe('openingBalance');
  });

  it('returns NAME_DUPLICATE (case-insensitive, trimmed) on collision', async () => {
    const { handle } = makeHandler();
    const first = await handle({ name: 'Banco ABC' });
    expect(first.ok).toBe(true);

    const second = await handle({ name: '  banco abc  ' });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe('NAME_DUPLICATE');
    expect(second.error.field).toBe('name');
  });

  it('wraps event-log throws as INTERNAL', async () => {
    const throwingLog: EventLog = {
      async append() {
        throw new Error('disk on fire');
      },
      async load() {
        return [];
      },
    };
    const handle = createAccountsCreateHandler({
      eventLog: throwingLog,
      getReadModel,
      now: () => FIXED_NOW,
      newId: idGen('E'),
    });

    const resp = await handle({ name: 'X' });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('INTERNAL');
    expect(resp.error.message).toContain('disk on fire');
  });
});

describe('accounts:list', () => {
  beforeEach(() => resetReadModel());

  it('returns empty array on fresh read model', async () => {
    const list = createAccountsListHandler({ getReadModel });
    const resp = await list();
    expect(resp.accounts).toEqual([]);
  });

  it('returns records after creates', async () => {
    const { handle } = makeHandler();
    await handle({ name: 'A1', openingBalance: 10 });
    await handle({ name: 'A2', bankName: 'Banco', openingBalance: -5 });

    const list = createAccountsListHandler({ getReadModel });
    const resp = await list();

    expect(resp.accounts).toHaveLength(2);
    expect(resp.accounts[0]!.name).toBe('A1');
    expect(resp.accounts[0]!.openingBalance).toBe(10);
    expect(resp.accounts[0]!.currency).toBe('EUR');
    expect(resp.accounts[1]!.name).toBe('A2');
    expect(resp.accounts[1]!.bankName).toBe('Banco');
  });
});
