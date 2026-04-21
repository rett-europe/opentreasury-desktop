// WI-21 — categories + subcategories update/archive/unarchive handler tests.

import { beforeEach, describe, expect, it } from 'vitest';
import type { DomainEvent, EventLog } from '../../../core/eventLog/EventLog';
import { getReadModel, resetReadModel } from '../../../core/query/reducers';
import {
  createCategoriesArchiveHandler,
  createCategoriesCreateHandler,
  createCategoriesListHandler,
  createCategoriesUnarchiveHandler,
  createCategoriesUpdateHandler,
  createSubcategoriesArchiveHandler,
  createSubcategoriesCreateHandler,
  createSubcategoriesUnarchiveHandler,
  createSubcategoriesUpdateHandler,
} from './categories';

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
    newId: idGen('C'),
  };
}

describe('categories:update / archive / unarchive', () => {
  beforeEach(() => resetReadModel());

  it('patches name + kind and round-trips archive/unarchive', async () => {
    const deps = makeDeps();
    const create = createCategoriesCreateHandler(deps);
    const update = createCategoriesUpdateHandler(deps);
    const archive = createCategoriesArchiveHandler(deps);
    const unarchive = createCategoriesUnarchiveHandler(deps);
    const c = await create({ name: 'Gastos' });
    if (!c.ok) throw new Error('seed failed');
    const u = await update({
      id: c.event.id,
      changes: { name: 'Gastos-Operativos', kind: 'expense' },
    });
    expect(u.ok).toBe(true);
    expect(getReadModel().configCategories[0]!.kind).toBe('expense');

    const arch = await archive({ id: c.event.id });
    expect(arch.ok).toBe(true);
    const dup = await archive({ id: c.event.id });
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.error.code).toBe('ALREADY_ARCHIVED');

    const un = await unarchive({ id: c.event.id });
    expect(un.ok).toBe(true);
    expect(getReadModel().configCategories[0]!.archivedAt).toBeUndefined();
  });

  it('list hides archived categories by default and strips archived subcategories', async () => {
    const deps = makeDeps();
    const createCat = createCategoriesCreateHandler(deps);
    const archiveCat = createCategoriesArchiveHandler(deps);
    const createSub = createSubcategoriesCreateHandler(deps);
    const archiveSub = createSubcategoriesArchiveHandler(deps);
    const list = createCategoriesListHandler({ getReadModel });

    const a = await createCat({ name: 'Activa' });
    const z = await createCat({ name: 'Archivada' });
    if (!a.ok || !z.ok) throw new Error('seed failed');
    await archiveCat({ id: z.event.id });
    const s1 = await createSub({ parentCategoryId: a.event.id, name: 'Sub1' });
    const s2 = await createSub({ parentCategoryId: a.event.id, name: 'Sub2' });
    if (!s1.ok || !s2.ok) throw new Error('seed failed');
    await archiveSub({ id: s2.event.id, parentCategoryId: a.event.id });

    const def = await list();
    expect(def.categories).toHaveLength(1);
    expect(def.categories[0]!.name).toBe('Activa');
    expect(def.categories[0]!.subcategories).toHaveLength(1);
    expect(def.categories[0]!.subcategories![0]!.name).toBe('Sub1');

    const all = await list({ includeArchived: true });
    expect(all.categories).toHaveLength(2);
    const active = all.categories.find((c) => c.name === 'Activa')!;
    expect(active.subcategories).toHaveLength(2);
  });
});

describe('subcategories:create / update / archive / unarchive', () => {
  beforeEach(() => resetReadModel());

  it('create requires an existing parent and is unique per parent', async () => {
    const deps = makeDeps();
    const createCat = createCategoriesCreateHandler(deps);
    const createSub = createSubcategoriesCreateHandler(deps);
    const c = await createCat({ name: 'Padre' });
    if (!c.ok) throw new Error('seed failed');
    const ok = await createSub({ parentCategoryId: c.event.id, name: 'General' });
    expect(ok.ok).toBe(true);
    const dup = await createSub({ parentCategoryId: c.event.id, name: 'general' });
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.error.code).toBe('NAME_DUPLICATE');

    const orphan = await createSub({ parentCategoryId: 'NOPE', name: 'X' });
    expect(orphan.ok).toBe(false);
    if (orphan.ok) return;
    expect(orphan.error.code).toBe('PARENT_NOT_FOUND');
  });

  it('two parents can each own a "General" subcategory (scope is per-parent)', async () => {
    const deps = makeDeps();
    const createCat = createCategoriesCreateHandler(deps);
    const createSub = createSubcategoriesCreateHandler(deps);
    const a = await createCat({ name: 'Padre A' });
    const b = await createCat({ name: 'Padre B' });
    if (!a.ok || !b.ok) throw new Error('seed failed');
    const s1 = await createSub({ parentCategoryId: a.event.id, name: 'General' });
    const s2 = await createSub({ parentCategoryId: b.event.id, name: 'General' });
    expect(s1.ok).toBe(true);
    expect(s2.ok).toBe(true);
  });

  it('archive/unarchive round-trip on a subcategory', async () => {
    const deps = makeDeps();
    const createCat = createCategoriesCreateHandler(deps);
    const createSub = createSubcategoriesCreateHandler(deps);
    const archiveSub = createSubcategoriesArchiveHandler(deps);
    const unarchiveSub = createSubcategoriesUnarchiveHandler(deps);
    const c = await createCat({ name: 'Padre' });
    if (!c.ok) throw new Error('seed failed');
    const s = await createSub({ parentCategoryId: c.event.id, name: 'Sub' });
    if (!s.ok) throw new Error('seed failed');

    const arch = await archiveSub({ id: s.event.id, parentCategoryId: c.event.id });
    expect(arch.ok).toBe(true);
    const again = await archiveSub({ id: s.event.id, parentCategoryId: c.event.id });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.code).toBe('ALREADY_ARCHIVED');

    const un = await unarchiveSub({ id: s.event.id, parentCategoryId: c.event.id });
    expect(un.ok).toBe(true);
    expect(getReadModel().configCategories[0]!.subcategories[0]!.archivedAt).toBeUndefined();
  });

  it('update patches name without affecting sibling subcategories', async () => {
    const deps = makeDeps();
    const createCat = createCategoriesCreateHandler(deps);
    const createSub = createSubcategoriesCreateHandler(deps);
    const updateSub = createSubcategoriesUpdateHandler(deps);
    const c = await createCat({ name: 'Padre' });
    if (!c.ok) throw new Error('seed failed');
    const s1 = await createSub({ parentCategoryId: c.event.id, name: 'Alpha' });
    const s2 = await createSub({ parentCategoryId: c.event.id, name: 'Beta' });
    if (!s1.ok || !s2.ok) throw new Error('seed failed');
    const up = await updateSub({
      id: s1.event.id,
      parentCategoryId: c.event.id,
      changes: { name: 'Alpha-2' },
    });
    expect(up.ok).toBe(true);
    const subs = getReadModel().configCategories[0]!.subcategories;
    expect(subs[0]!.name).toBe('Alpha-2');
    expect(subs[1]!.name).toBe('Beta');
  });
});
