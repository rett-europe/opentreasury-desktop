// WI-21 — Configuración CRUD (archive-only) reducer transitions.
//
// Covers every new event type: *Updated / *Archived / *Unarchived for
// Account / Category / Tag, plus the full Subcategory lifecycle
// (Created/Updated/Archived/Unarchived). Also pins the backward-compat
// guarantee — a stream that only carries the pre-WI-21 `*Created` events
// replays identically.

import { beforeEach, describe, expect, it } from 'vitest';
import { applyEvent, getReadModel, replayEvents, resetReadModel } from './reducers';
import type { DomainEvent } from '../events/schemas';

const ISO = (s: string) => new Date(s).toISOString();

function seedAccount(id = 'A1'): DomainEvent {
  return {
    type: 'AccountCreated',
    id,
    name: 'Banco ABC',
    currency: 'EUR',
    openingBalance: 100,
    createdAt: ISO('2026-04-21T10:00:00Z'),
  };
}

function seedCategory(id = 'C1', name = 'Donaciones'): DomainEvent {
  return {
    type: 'CategoryCreated',
    id,
    name,
    createdAt: ISO('2026-04-21T10:00:00Z'),
  };
}

function seedTag(id = 'T1'): DomainEvent {
  return {
    type: 'TagCreated',
    id,
    name: 'urgente',
    createdAt: ISO('2026-04-21T10:00:00Z'),
  };
}

describe('WI-21 reducers — Account archive lifecycle', () => {
  beforeEach(() => resetReadModel());

  it('AccountUpdated patches only the supplied fields', () => {
    applyEvent(seedAccount());
    applyEvent({
      type: 'AccountUpdated',
      id: 'evt-1',
      accountId: 'A1',
      changes: { name: 'Banco XYZ', color: '#00ff00' },
      updatedAt: ISO('2026-04-22T10:00:00Z'),
    });
    const [acc] = getReadModel().configAccounts;
    expect(acc?.name).toBe('Banco XYZ');
    expect(acc?.color).toBe('#00ff00');
    expect(acc?.openingBalance).toBe(100); // untouched
  });

  it('AccountUpdated patches openingBalance when present in the changes payload', () => {
    applyEvent(seedAccount());
    applyEvent({
      type: 'AccountUpdated',
      id: 'evt-ob',
      accountId: 'A1',
      changes: { openingBalance: 250.5 },
      updatedAt: ISO('2026-04-22T10:00:00Z'),
    });
    const [acc] = getReadModel().configAccounts;
    expect(acc?.openingBalance).toBe(250.5);
    expect(acc?.name).toBe('Banco ABC'); // unchanged
  });

  it('AccountArchived stamps archivedAt; AccountUnarchived clears it', () => {
    applyEvent(seedAccount());
    applyEvent({
      type: 'AccountArchived',
      id: 'evt-2',
      accountId: 'A1',
      archivedAt: ISO('2026-04-22T10:00:00Z'),
    });
    expect(getReadModel().configAccounts[0]?.archivedAt).toBe(ISO('2026-04-22T10:00:00Z'));
    applyEvent({
      type: 'AccountUnarchived',
      id: 'evt-3',
      accountId: 'A1',
      unarchivedAt: ISO('2026-04-23T10:00:00Z'),
    });
    expect(getReadModel().configAccounts[0]?.archivedAt).toBeUndefined();
  });

  it('ignores events for unknown account ids (graceful replay)', () => {
    applyEvent(seedAccount());
    applyEvent({
      type: 'AccountArchived',
      id: 'evt-x',
      accountId: 'UNKNOWN',
      archivedAt: ISO('2026-04-22T10:00:00Z'),
    });
    expect(getReadModel().configAccounts[0]?.archivedAt).toBeUndefined();
  });
});

describe('WI-21 reducers — Category + Subcategory lifecycle', () => {
  beforeEach(() => resetReadModel());

  it('CategoryCreated initialises an empty subcategories array', () => {
    applyEvent(seedCategory());
    expect(getReadModel().configCategories[0]?.subcategories).toEqual([]);
  });

  it('CategoryUpdated / CategoryArchived / CategoryUnarchived', () => {
    applyEvent(seedCategory());
    applyEvent({
      type: 'CategoryUpdated',
      id: 'evt-c1',
      categoryId: 'C1',
      changes: { kind: 'expense', color: '#ff0000' },
      updatedAt: ISO('2026-04-22T10:00:00Z'),
    });
    applyEvent({
      type: 'CategoryArchived',
      id: 'evt-c2',
      categoryId: 'C1',
      archivedAt: ISO('2026-04-22T11:00:00Z'),
    });
    let cat = getReadModel().configCategories[0];
    expect(cat?.kind).toBe('expense');
    expect(cat?.color).toBe('#ff0000');
    expect(cat?.archivedAt).toBeDefined();

    applyEvent({
      type: 'CategoryUnarchived',
      id: 'evt-c3',
      categoryId: 'C1',
      unarchivedAt: ISO('2026-04-22T12:00:00Z'),
    });
    cat = getReadModel().configCategories[0];
    expect(cat?.archivedAt).toBeUndefined();
  });

  it('Subcategory CRUD is parent-scoped: created, updated, archived, unarchived', () => {
    applyEvent(seedCategory());
    applyEvent({
      type: 'SubcategoryCreated',
      id: 'S1',
      parentCategoryId: 'C1',
      name: 'General',
      createdAt: ISO('2026-04-21T11:00:00Z'),
    });
    let cat = getReadModel().configCategories[0];
    expect(cat?.subcategories).toHaveLength(1);
    expect(cat?.subcategories[0]?.name).toBe('General');

    applyEvent({
      type: 'SubcategoryUpdated',
      id: 'evt-s1',
      subcategoryId: 'S1',
      parentCategoryId: 'C1',
      changes: { name: 'Detallado' },
      updatedAt: ISO('2026-04-22T10:00:00Z'),
    });
    cat = getReadModel().configCategories[0];
    expect(cat?.subcategories[0]?.name).toBe('Detallado');

    applyEvent({
      type: 'SubcategoryArchived',
      id: 'evt-s2',
      subcategoryId: 'S1',
      parentCategoryId: 'C1',
      archivedAt: ISO('2026-04-22T11:00:00Z'),
    });
    expect(getReadModel().configCategories[0]?.subcategories[0]?.archivedAt).toBeDefined();

    applyEvent({
      type: 'SubcategoryUnarchived',
      id: 'evt-s3',
      subcategoryId: 'S1',
      parentCategoryId: 'C1',
      unarchivedAt: ISO('2026-04-22T12:00:00Z'),
    });
    expect(getReadModel().configCategories[0]?.subcategories[0]?.archivedAt).toBeUndefined();
  });

  it('archiving a parent category does NOT cascade-archive subcategories (per Switch ruling)', () => {
    applyEvent(seedCategory());
    applyEvent({
      type: 'SubcategoryCreated',
      id: 'S1',
      parentCategoryId: 'C1',
      name: 'General',
      createdAt: ISO('2026-04-21T11:00:00Z'),
    });
    applyEvent({
      type: 'CategoryArchived',
      id: 'evt-pc',
      categoryId: 'C1',
      archivedAt: ISO('2026-04-22T10:00:00Z'),
    });
    const cat = getReadModel().configCategories[0];
    expect(cat?.archivedAt).toBeDefined();
    expect(cat?.subcategories[0]?.archivedAt).toBeUndefined();
  });

  it('drops Subcategory* events targeting an unknown parent', () => {
    applyEvent({
      type: 'SubcategoryCreated',
      id: 'S1',
      parentCategoryId: 'NOPARENT',
      name: 'Orphan',
      createdAt: ISO('2026-04-21T11:00:00Z'),
    });
    expect(getReadModel().configCategories).toHaveLength(0);
  });
});

describe('WI-21 reducers — Tag lifecycle', () => {
  beforeEach(() => resetReadModel());

  it('TagUpdated / TagArchived / TagUnarchived', () => {
    applyEvent(seedTag());
    applyEvent({
      type: 'TagUpdated',
      id: 'evt-t1',
      tagId: 'T1',
      changes: { name: 'prioritario', color: '#123456' },
      updatedAt: ISO('2026-04-22T10:00:00Z'),
    });
    applyEvent({
      type: 'TagArchived',
      id: 'evt-t2',
      tagId: 'T1',
      archivedAt: ISO('2026-04-22T11:00:00Z'),
    });
    let tag = getReadModel().configTags[0];
    expect(tag?.name).toBe('prioritario');
    expect(tag?.color).toBe('#123456');
    expect(tag?.archivedAt).toBeDefined();

    applyEvent({
      type: 'TagUnarchived',
      id: 'evt-t3',
      tagId: 'T1',
      unarchivedAt: ISO('2026-04-22T12:00:00Z'),
    });
    tag = getReadModel().configTags[0];
    expect(tag?.archivedAt).toBeUndefined();
  });
});

describe('WI-21 — backward compatibility', () => {
  beforeEach(() => resetReadModel());

  it('replaying only pre-WI-21 *Created events produces an identical projection', () => {
    const events: DomainEvent[] = [seedAccount(), seedCategory(), seedTag()];
    replayEvents(events);
    const model = getReadModel();
    expect(model.configAccounts).toHaveLength(1);
    expect(model.configAccounts[0]?.archivedAt).toBeUndefined();
    expect(model.configCategories).toHaveLength(1);
    expect(model.configCategories[0]?.archivedAt).toBeUndefined();
    expect(model.configCategories[0]?.subcategories).toEqual([]);
    expect(model.configTags).toHaveLength(1);
    expect(model.configTags[0]?.archivedAt).toBeUndefined();
  });
});
