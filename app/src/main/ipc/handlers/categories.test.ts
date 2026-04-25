// WI-15-lite — categories:create + categories:list handler tests.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createCategoriesCreateHandler,
  createCategoriesListHandler,
  createCategoriesUsageHandler,
} from './categories';
import type { EventLog, DomainEvent } from '../../../core/eventLog/EventLog';
import { applyEvent, getReadModel, resetReadModel } from '../../../core/query/reducers';

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

function makeHandler() {
  const log = new InMemoryEventLog();
  const handle = createCategoriesCreateHandler({
    eventLog: log,
    getReadModel,
    now: () => FIXED_NOW,
    newId: idGen('C'),
  });
  return { log, handle };
}

describe('categories:create — happy path', () => {
  beforeEach(() => resetReadModel());

  it('creates a category, no type field, color optional', async () => {
    const { log, handle } = makeHandler();
    const resp = await handle({ name: 'Donaciones', color: '#ff0000' });

    expect(resp.ok).toBe(true);
    if (!resp.ok) return;
    expect(resp.event.type).toBe('CategoryCreated');
    expect(resp.event.name).toBe('Donaciones');
    expect(resp.event.color).toBe('#ff0000');
    expect(log.events).toHaveLength(1);
    expect(getReadModel().configCategories).toHaveLength(1);
    // Sanity: no 'type' (income/expense) leaks onto the stored record.
    const stored = getReadModel().configCategories[0]!;
    expect(Object.keys(stored)).not.toContain('categoryType');
    expect(Object.keys(stored)).not.toContain('direction');
  });

  it('creates a category without color', async () => {
    const { handle } = makeHandler();
    const resp = await handle({ name: 'Otros' });
    expect(resp.ok).toBe(true);
    if (!resp.ok) return;
    expect(resp.event.color).toBeUndefined();
  });
});

describe('categories:create — validation failures', () => {
  beforeEach(() => resetReadModel());

  it('NAME_EMPTY for blank', async () => {
    const { handle } = makeHandler();
    const resp = await handle({ name: '' });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('NAME_EMPTY');
  });

  it('SCHEMA_INVALID for wrong shape', async () => {
    const { handle } = makeHandler();
    const resp = await handle({ name: 42 });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('SCHEMA_INVALID');
  });

  it('NAME_DUPLICATE (case-insensitive) on collision', async () => {
    const { handle } = makeHandler();
    const first = await handle({ name: 'Gastos' });
    expect(first.ok).toBe(true);
    const second = await handle({ name: 'GASTOS' });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe('NAME_DUPLICATE');
  });

  it('INTERNAL wraps unexpected throws', async () => {
    const throwingLog: EventLog = {
      async append() {
        throw new Error('boom');
      },
      async load() {
        return [];
      },
    };
    const handle = createCategoriesCreateHandler({
      eventLog: throwingLog,
      getReadModel,
      now: () => FIXED_NOW,
      newId: idGen('C'),
    });
    const resp = await handle({ name: 'X' });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('INTERNAL');
  });
});

describe('categories:list', () => {
  beforeEach(() => resetReadModel());

  it('empty when no events', async () => {
    const list = createCategoriesListHandler({ getReadModel });
    const resp = await list();
    expect(resp.categories).toEqual([]);
  });

  it('projects after creates', async () => {
    const { handle } = makeHandler();
    await handle({ name: 'A' });
    await handle({ name: 'B', color: '#0f0' });
    const list = createCategoriesListHandler({ getReadModel });
    const resp = await list();
    expect(resp.categories).toHaveLength(2);
    expect(resp.categories[1]!.color).toBe('#0f0');
  });
});

// issue #52 — usage counters per category over the movements read model.
describe('categories:usage', () => {
  beforeEach(() => resetReadModel());

  function ulid(suffix: string): string {
    return `01HZ${suffix.padEnd(22, '0')}`;
  }

  function txEvent(id: string, payload: {
    categoryId: string | null;
    subcategoryId: string | null;
  }): DomainEvent {
    return {
      type: 'tx.created',
      id: ulid(id),
      datasetId: ulid('DATA'),
      actorDeviceId: ulid('DEV1'),
      occurredAt: '2026-04-20T12:00:00.000Z',
      schemaVersion: 1,
      dekVersion: 0,
      payload: {
        id: ulid('T' + id),
        date: '2026-04-20',
        type: 'expense',
        amount: 10,
        currency: 'EUR',
        description: '',
        accountId: ulid('ACC1'),
        categoryId: payload.categoryId,
        subcategoryId: payload.subcategoryId,
        tagIds: [],
        status: 'approved',
        createdAt: '2026-04-20T12:00:00.000Z',
      },
    } as unknown as DomainEvent;
  }

  it('returns empty usage when there are no transactions', async () => {
    const handle = createCategoriesUsageHandler({ getReadModel });
    const resp = await handle();
    expect(resp.usage).toEqual([]);
  });

  it('counts transactions and classified subset per category', async () => {
    const C1 = ulid('CAT1');
    const C2 = ulid('CAT2');
    const S1 = ulid('SUB1');
    applyEvent(txEvent('1', { categoryId: C1, subcategoryId: S1 }));
    applyEvent(txEvent('2', { categoryId: C1, subcategoryId: S1 }));
    applyEvent(txEvent('3', { categoryId: C1, subcategoryId: null }));
    applyEvent(txEvent('4', { categoryId: C2, subcategoryId: null }));
    applyEvent(txEvent('5', { categoryId: null, subcategoryId: null }));

    const handle = createCategoriesUsageHandler({ getReadModel });
    const resp = await handle();
    expect(resp.usage).toContainEqual({
      categoryId: C1,
      transactionCount: 3,
      classifiedCount: 2,
    });
    expect(resp.usage).toContainEqual({
      categoryId: C2,
      transactionCount: 1,
      classifiedCount: 0,
    });
    expect(resp.usage).toHaveLength(2);
  });
});
