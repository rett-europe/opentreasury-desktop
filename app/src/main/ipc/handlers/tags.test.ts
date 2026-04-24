// WI-15-lite — tags:create + tags:list handler tests.

import { describe, it, expect, beforeEach } from 'vitest';
import { createTagsCreateHandler, createTagsListHandler } from './tags';
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

function makeHandler() {
  const log = new InMemoryEventLog();
  const handle = createTagsCreateHandler({
    eventLog: log,
    getReadModel,
    now: () => FIXED_NOW,
    newId: idGen('T'),
  });
  return { log, handle };
}

describe('tags:create', () => {
  beforeEach(() => resetReadModel());

  it('creates a tag', async () => {
    const { log, handle } = makeHandler();
    const resp = await handle({ name: 'reto' });
    expect(resp.ok).toBe(true);
    if (!resp.ok) return;
    expect(resp.event.type).toBe('TagCreated');
    expect(resp.event.name).toBe('reto');
    expect(log.events).toHaveLength(1);
    expect(getReadModel().configTags).toHaveLength(1);
  });

  it('NAME_EMPTY for blank', async () => {
    const { handle } = makeHandler();
    const resp = await handle({ name: '   ' });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('NAME_EMPTY');
  });

  it('SCHEMA_INVALID for wrong payload', async () => {
    const { handle } = makeHandler();
    const resp = await handle({});
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('SCHEMA_INVALID');
  });

  it('NAME_DUPLICATE on trim-insensitive collision', async () => {
    const { handle } = makeHandler();
    await handle({ name: 'Prioridad' });
    const dup = await handle({ name: 'prioridad ' });
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.error.code).toBe('NAME_DUPLICATE');
  });

  it('INTERNAL wraps thrown event-log errors', async () => {
    const throwingLog: EventLog = {
      async append() {
        throw new Error('fs gone');
      },
      async load() {
        return [];
      },
    };
    const handle = createTagsCreateHandler({
      eventLog: throwingLog,
      getReadModel,
      now: () => FIXED_NOW,
      newId: idGen('T'),
    });
    const resp = await handle({ name: 'x' });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('INTERNAL');
  });
});

describe('tags:list', () => {
  beforeEach(() => resetReadModel());

  it('empty when no events', async () => {
    const list = createTagsListHandler({ getReadModel });
    const resp = await list();
    expect(resp.tags).toEqual([]);
  });

  it('projects after creates', async () => {
    const { handle } = makeHandler();
    await handle({ name: 'one' });
    await handle({ name: 'two' });
    const list = createTagsListHandler({ getReadModel });
    const resp = await list();
    expect(resp.tags.map((t) => t.name)).toEqual(['one', 'two']);
  });
});
