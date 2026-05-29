// WI-21-followup — hard-delete handler integration tests.
// Covers all four entities (accounts, categories, subcategories, tags):
//   • happy path — no references → event appended, entity dropped from RM,
//   • HAS_REFERENCES — references present → NO event appended, entity kept,
//   • NOT_FOUND — unknown id,
//   • idempotency — applying the same *Deleted event twice does not crash.
// Critical safety-net: the entire ruling that opened the door for hard-delete
// (Switch's WI-21 history.md L330) rests on the usage-count gate. These tests
// are the contract.

import { beforeEach, describe, expect, it } from 'vitest';
import type { DomainEvent, EventLog } from '../../../core/eventLog/EventLog';
import { applyEvent, getReadModel, resetReadModel } from '../../../core/query/reducers';
import { createAccountsCreateHandler, createAccountsDeleteHandler } from './accounts';
import {
  createCategoriesCreateHandler,
  createCategoriesDeleteHandler,
  createSubcategoriesCreateHandler,
  createSubcategoriesDeleteHandler,
} from './categories';
import { createTagsCreateHandler, createTagsDeleteHandler } from './tags';

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

const FIXED_NOW = new Date('2026-05-29T12:00:00.000Z');

function idGen(prefix: string): () => string {
  let i = 0;
  return () => `${prefix}_${++i}`;
}

function makeDeps(log = new InMemoryEventLog(), newId = idGen('E')) {
  return {
    eventLog: log,
    getReadModel,
    now: () => FIXED_NOW,
    newId,
  };
}

// Synthetic Transaction with sane defaults — used to introduce references
// so we can verify the HAS_REFERENCES gate fires.
function seedTransaction(overrides: {
  readonly id: string;
  readonly accountId?: string;
  readonly categoryId?: string | null;
  readonly subcategoryId?: string | null;
  readonly tagIds?: readonly string[];
}): void {
  applyEvent({
    type: 'tx.created',
    id: overrides.id,
    datasetId: 'D'.padEnd(26, '0'),
    actorDeviceId: 'V'.padEnd(26, '0'),
    actorUserId: 'U'.padEnd(26, '0'),
    actorIdentitySource: 'local',
    createdAt: FIXED_NOW.toISOString(),
    dekVersion: 0,
    version: 1,
    payload: {
      id: overrides.id,
      date: '2026-05-01',
      type: 'expense',
      amount: 10,
      currency: 'EUR',
      description: 'seed',
      accountId: overrides.accountId ?? 'A_seed',
      categoryId: overrides.categoryId ?? null,
      subcategoryId: overrides.subcategoryId ?? null,
      tagIds: overrides.tagIds ?? [],
      status: 'approved',
      createdAt: FIXED_NOW.toISOString(),
      reference: null,
      details: null,
    },
  });
}

describe('accounts:delete', () => {
  beforeEach(() => resetReadModel());

  it('deletes an unreferenced account and removes it from the read model', async () => {
    const deps = makeDeps();
    const create = createAccountsCreateHandler(deps);
    const del = createAccountsDeleteHandler(deps);
    const created = await create({ name: 'Empty', openingBalance: 0 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.event.id;

    const resp = await del({ id });
    expect(resp.ok).toBe(true);
    if (!resp.ok) return;
    expect(resp.event.type).toBe('AccountDeleted');
    expect(resp.event.accountId).toBe(id);
    expect(getReadModel().configAccounts.find((a) => a.id === id)).toBeUndefined();
  });

  it('rejects HAS_REFERENCES when transactions reference the account', async () => {
    const deps = makeDeps();
    const log = deps.eventLog as InMemoryEventLog;
    const create = createAccountsCreateHandler(deps);
    const del = createAccountsDeleteHandler(deps);
    const created = await create({ name: 'Bank', openingBalance: 0 });
    if (!created.ok) throw new Error('create failed');
    const id = created.event.id;
    seedTransaction({ id: 'T1', accountId: id });
    const eventsBefore = log.events.length;

    const resp = await del({ id });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('HAS_REFERENCES');
    expect(resp.error.transactionCount).toBe(1);
    expect(log.events.length).toBe(eventsBefore);
    expect(getReadModel().configAccounts.find((a) => a.id === id)).toBeDefined();
  });

  it('returns NOT_FOUND for unknown account id', async () => {
    const deps = makeDeps();
    const del = createAccountsDeleteHandler(deps);
    const resp = await del({ id: 'missing' });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('NOT_FOUND');
  });

  it('idempotently applies AccountDeleted twice without crashing', async () => {
    const deps = makeDeps();
    const create = createAccountsCreateHandler(deps);
    const del = createAccountsDeleteHandler(deps);
    const created = await create({ name: 'A', openingBalance: 0 });
    if (!created.ok) return;
    const id = created.event.id;
    const resp = await del({ id });
    if (!resp.ok) return;
    // Replay through the reducer — must not throw.
    expect(() => applyEvent(resp.event)).not.toThrow();
    expect(getReadModel().configAccounts.find((a) => a.id === id)).toBeUndefined();
  });
});

describe('categories:delete', () => {
  beforeEach(() => resetReadModel());

  it('deletes an unreferenced category and removes it from the read model', async () => {
    const deps = makeDeps();
    const create = createCategoriesCreateHandler(deps);
    const del = createCategoriesDeleteHandler(deps);
    const created = await create({ name: 'Empty cat' });
    if (!created.ok) return;
    const id = created.event.id;

    const resp = await del({ id });
    expect(resp.ok).toBe(true);
    if (!resp.ok) return;
    expect(resp.event.type).toBe('CategoryDeleted');
    expect(getReadModel().configCategories.find((c) => c.id === id)).toBeUndefined();
  });

  it('rejects HAS_REFERENCES when transactions reference the category', async () => {
    const deps = makeDeps();
    const log = deps.eventLog as InMemoryEventLog;
    const create = createCategoriesCreateHandler(deps);
    const del = createCategoriesDeleteHandler(deps);
    const created = await create({ name: 'Used' });
    if (!created.ok) return;
    const id = created.event.id;
    seedTransaction({ id: 'T1', categoryId: id });
    const eventsBefore = log.events.length;

    const resp = await del({ id });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('HAS_REFERENCES');
    expect(resp.error.transactionCount).toBe(1);
    expect(log.events.length).toBe(eventsBefore);
    expect(getReadModel().configCategories.find((c) => c.id === id)).toBeDefined();
  });

  it('rejects HAS_REFERENCES when only a subcategory of the category is referenced', async () => {
    const deps = makeDeps();
    const createCat = createCategoriesCreateHandler(deps);
    const createSub = createSubcategoriesCreateHandler(deps);
    const del = createCategoriesDeleteHandler(deps);
    const cat = await createCat({ name: 'Parent' });
    if (!cat.ok) return;
    const sub = await createSub({ parentCategoryId: cat.event.id, name: 'Child' });
    if (!sub.ok) return;
    seedTransaction({ id: 'T1', categoryId: cat.event.id, subcategoryId: sub.event.id });

    const resp = await del({ id: cat.event.id });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    // Parent has 1 ref (T1.categoryId) AND child has 1 ref (T1.subcategoryId)
    // — handler sums both.
    expect(resp.error.code).toBe('HAS_REFERENCES');
    expect(resp.error.transactionCount).toBe(2);
  });

  it('returns NOT_FOUND for unknown category id', async () => {
    const deps = makeDeps();
    const del = createCategoriesDeleteHandler(deps);
    const resp = await del({ id: 'missing' });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('NOT_FOUND');
  });

  it('idempotently applies CategoryDeleted twice without crashing', async () => {
    const deps = makeDeps();
    const create = createCategoriesCreateHandler(deps);
    const del = createCategoriesDeleteHandler(deps);
    const created = await create({ name: 'C1' });
    if (!created.ok) return;
    const id = created.event.id;
    const resp = await del({ id });
    if (!resp.ok) return;
    expect(() => applyEvent(resp.event)).not.toThrow();
  });
});

describe('subcategories:delete', () => {
  beforeEach(() => resetReadModel());

  it('deletes an unreferenced subcategory and removes it from the parent', async () => {
    const deps = makeDeps();
    const createCat = createCategoriesCreateHandler(deps);
    const createSub = createSubcategoriesCreateHandler(deps);
    const del = createSubcategoriesDeleteHandler(deps);
    const cat = await createCat({ name: 'P' });
    if (!cat.ok) return;
    const sub = await createSub({ parentCategoryId: cat.event.id, name: 'S' });
    if (!sub.ok) return;

    const resp = await del({ id: sub.event.id, parentCategoryId: cat.event.id });
    expect(resp.ok).toBe(true);
    if (!resp.ok) return;
    const parent = getReadModel().configCategories.find((c) => c.id === cat.event.id);
    expect(parent?.subcategories.find((s) => s.id === sub.event.id)).toBeUndefined();
  });

  it('rejects HAS_REFERENCES when a transaction references the subcategory', async () => {
    const deps = makeDeps();
    const log = deps.eventLog as InMemoryEventLog;
    const createCat = createCategoriesCreateHandler(deps);
    const createSub = createSubcategoriesCreateHandler(deps);
    const del = createSubcategoriesDeleteHandler(deps);
    const cat = await createCat({ name: 'P' });
    if (!cat.ok) return;
    const sub = await createSub({ parentCategoryId: cat.event.id, name: 'S' });
    if (!sub.ok) return;
    seedTransaction({ id: 'T1', categoryId: cat.event.id, subcategoryId: sub.event.id });
    const eventsBefore = log.events.length;

    const resp = await del({ id: sub.event.id, parentCategoryId: cat.event.id });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('HAS_REFERENCES');
    expect(resp.error.transactionCount).toBe(1);
    expect(log.events.length).toBe(eventsBefore);
  });

  it('returns PARENT_NOT_FOUND when the parent category is missing', async () => {
    const deps = makeDeps();
    const del = createSubcategoriesDeleteHandler(deps);
    const resp = await del({ id: 'sub', parentCategoryId: 'missing' });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('PARENT_NOT_FOUND');
  });

  it('returns NOT_FOUND when the subcategory does not exist under the parent', async () => {
    const deps = makeDeps();
    const createCat = createCategoriesCreateHandler(deps);
    const del = createSubcategoriesDeleteHandler(deps);
    const cat = await createCat({ name: 'P' });
    if (!cat.ok) return;
    const resp = await del({ id: 'missing', parentCategoryId: cat.event.id });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('NOT_FOUND');
  });
});

describe('tags:delete', () => {
  beforeEach(() => resetReadModel());

  it('deletes an unreferenced tag and removes it from the read model', async () => {
    const deps = makeDeps();
    const create = createTagsCreateHandler(deps);
    const del = createTagsDeleteHandler(deps);
    const created = await create({ name: 'Unused' });
    if (!created.ok) return;
    const id = created.event.id;

    const resp = await del({ id });
    expect(resp.ok).toBe(true);
    if (!resp.ok) return;
    expect(resp.event.type).toBe('TagDeleted');
    expect(getReadModel().configTags.find((t) => t.id === id)).toBeUndefined();
  });

  it('rejects HAS_REFERENCES when a transaction carries the tag', async () => {
    const deps = makeDeps();
    const log = deps.eventLog as InMemoryEventLog;
    const create = createTagsCreateHandler(deps);
    const del = createTagsDeleteHandler(deps);
    const created = await create({ name: 'Used' });
    if (!created.ok) return;
    const id = created.event.id;
    seedTransaction({ id: 'T1', tagIds: [id] });
    const eventsBefore = log.events.length;

    const resp = await del({ id });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('HAS_REFERENCES');
    expect(resp.error.transactionCount).toBe(1);
    expect(log.events.length).toBe(eventsBefore);
  });

  it('returns NOT_FOUND for unknown tag id', async () => {
    const deps = makeDeps();
    const del = createTagsDeleteHandler(deps);
    const resp = await del({ id: 'missing' });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('NOT_FOUND');
  });

  it('idempotently applies TagDeleted twice without crashing', async () => {
    const deps = makeDeps();
    const create = createTagsCreateHandler(deps);
    const del = createTagsDeleteHandler(deps);
    const created = await create({ name: 'T' });
    if (!created.ok) return;
    const id = created.event.id;
    const resp = await del({ id });
    if (!resp.ok) return;
    expect(() => applyEvent(resp.event)).not.toThrow();
  });
});
