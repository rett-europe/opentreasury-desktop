// WI-21 — tags update/archive/unarchive handler tests.

import { beforeEach, describe, expect, it } from 'vitest';
import type { DomainEvent, EventLog } from '../../../core/eventLog/EventLog';
import { getReadModel, resetReadModel } from '../../../core/query/reducers';
import {
  createTagsArchiveHandler,
  createTagsCreateHandler,
  createTagsListHandler,
  createTagsUnarchiveHandler,
  createTagsUpdateHandler,
} from './tags';

class InMemoryEventLog implements EventLog {
  readonly events: DomainEvent[] = [];
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

const FIXED_NOW = new Date('2026-04-22T12:00:00.000Z');

function idGen(prefix: string): () => string {
  let i = 0;
  return () => `${prefix}_${++i}`;
}

function makeDeps() {
  return {
    eventLog: new InMemoryEventLog(),
    getReadModel,
    now: () => FIXED_NOW,
    newId: idGen('T'),
  };
}

describe('tags:update / archive / unarchive', () => {
  beforeEach(() => resetReadModel());

  it('update renames and re-colours', async () => {
    const deps = makeDeps();
    const create = createTagsCreateHandler(deps);
    const update = createTagsUpdateHandler(deps);
    const t = await create({ name: 'uno' });
    if (!t.ok) throw new Error('seed failed');
    const u = await update({ id: t.event.id, changes: { name: 'UNO', color: '#aabbcc' } });
    expect(u.ok).toBe(true);
    const stored = getReadModel().configTags[0]!;
    expect(stored.name).toBe('UNO');
    expect(stored.color).toBe('#aabbcc');
  });

  it('duplicate name on rename rejected', async () => {
    const deps = makeDeps();
    const create = createTagsCreateHandler(deps);
    const update = createTagsUpdateHandler(deps);
    const a = await create({ name: 'alpha' });
    const b = await create({ name: 'beta' });
    if (!a.ok || !b.ok) throw new Error('seed failed');
    const resp = await update({ id: b.event.id, changes: { name: 'Alpha' } });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('NAME_DUPLICATE');
  });

  it('archive/unarchive round-trip', async () => {
    const deps = makeDeps();
    const create = createTagsCreateHandler(deps);
    const archive = createTagsArchiveHandler(deps);
    const unarchive = createTagsUnarchiveHandler(deps);
    const t = await create({ name: 'x' });
    if (!t.ok) throw new Error('seed failed');
    const arch = await archive({ id: t.event.id });
    expect(arch.ok).toBe(true);
    const dup = await archive({ id: t.event.id });
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.error.code).toBe('ALREADY_ARCHIVED');
    const un = await unarchive({ id: t.event.id });
    expect(un.ok).toBe(true);
    const notArch = await unarchive({ id: t.event.id });
    expect(notArch.ok).toBe(false);
    if (notArch.ok) return;
    expect(notArch.error.code).toBe('NOT_ARCHIVED');
  });

  it('list filters archived by default', async () => {
    const deps = makeDeps();
    const create = createTagsCreateHandler(deps);
    const archive = createTagsArchiveHandler(deps);
    const list = createTagsListHandler({ getReadModel });
    const a = await create({ name: 'active' });
    const z = await create({ name: 'gone' });
    if (!a.ok || !z.ok) throw new Error('seed failed');
    await archive({ id: z.event.id });
    const def = await list();
    expect(def.tags.map((t) => t.name)).toEqual(['active']);
    const all = await list({ includeArchived: true });
    expect(all.tags).toHaveLength(2);
  });
});
