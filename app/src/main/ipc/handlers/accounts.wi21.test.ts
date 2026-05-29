// WI-21 — accounts update/archive/unarchive handler tests.

import { beforeEach, describe, expect, it } from 'vitest';
import type { DomainEvent, EventLog } from '../../../core/eventLog/EventLog';
import { getReadModel, resetReadModel } from '../../../core/query/reducers';
import {
  createAccountsArchiveHandler,
  createAccountsCreateHandler,
  createAccountsListHandler,
  createAccountsUnarchiveHandler,
  createAccountsUpdateHandler,
} from './accounts';

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

const FIXED_NOW = new Date('2026-04-22T12:00:00.000Z');

function idGen(prefix: string): () => string {
  let i = 0;
  return () => `${prefix}_${++i}`;
}

function makeDeps(log = new InMemoryEventLog(), newId = idGen('A')) {
  return {
    eventLog: log,
    getReadModel,
    now: () => FIXED_NOW,
    newId,
  };
}

describe('accounts:update', () => {
  beforeEach(() => resetReadModel());

  it('patches a single field and leaves the others intact', async () => {
    const deps = makeDeps();
    const create = createAccountsCreateHandler(deps);
    const update = createAccountsUpdateHandler(deps);
    const created = await create({ name: 'A1', openingBalance: 50 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const resp = await update({ id: created.event.id, changes: { color: '#ff0000' } });
    expect(resp.ok).toBe(true);
    if (!resp.ok) return;
    expect(resp.event.changes.color).toBe('#ff0000');
    const acc = getReadModel().configAccounts[0]!;
    expect(acc.color).toBe('#ff0000');
    expect(acc.name).toBe('A1');
    expect(acc.openingBalance).toBe(50);
  });

  it('returns NOT_FOUND for unknown id', async () => {
    const deps = makeDeps();
    const update = createAccountsUpdateHandler(deps);
    const resp = await update({ id: 'missing', changes: { color: '#000' } });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('NOT_FOUND');
  });

  it('rejects empty/whitespace name with NAME_EMPTY', async () => {
    const deps = makeDeps();
    const create = createAccountsCreateHandler(deps);
    const update = createAccountsUpdateHandler(deps);
    const created = await create({ name: 'A1' });
    if (!created.ok) throw new Error('seed failed');
    const resp = await update({ id: created.event.id, changes: { name: '   ' } });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('NAME_EMPTY');
  });

  it('rejects rename that collides (case-insensitive) with a different account', async () => {
    const deps = makeDeps();
    const create = createAccountsCreateHandler(deps);
    const update = createAccountsUpdateHandler(deps);
    const a = await create({ name: 'Alpha' });
    const b = await create({ name: 'Beta' });
    if (!a.ok || !b.ok) throw new Error('seed failed');
    const resp = await update({ id: b.event.id, changes: { name: 'alpha' } });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('NAME_DUPLICATE');
  });

  it('rejects an empty changes object via SCHEMA_INVALID', async () => {
    const deps = makeDeps();
    const create = createAccountsCreateHandler(deps);
    const update = createAccountsUpdateHandler(deps);
    const created = await create({ name: 'A1' });
    if (!created.ok) throw new Error('seed failed');
    const resp = await update({ id: created.event.id, changes: {} });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('SCHEMA_INVALID');
  });

  it('rejects all-undefined changes payload via SCHEMA_INVALID (no no-op events)', async () => {
    const deps = makeDeps();
    const create = createAccountsCreateHandler(deps);
    const update = createAccountsUpdateHandler(deps);
    const created = await create({ name: 'A1' });
    if (!created.ok) throw new Error('seed failed');
    const resp = await update({
      id: created.event.id,
      changes: { color: undefined, label: undefined },
    });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('SCHEMA_INVALID');
  });

  it('drops whitespace-only optional strings instead of persisting empty values', async () => {
    const deps = makeDeps();
    const create = createAccountsCreateHandler(deps);
    const update = createAccountsUpdateHandler(deps);
    const created = await create({ name: 'A1', color: '#111' });
    if (!created.ok) throw new Error('seed failed');
    const resp = await update({
      id: created.event.id,
      changes: { label: 'keep', color: '   ' },
    });
    expect(resp.ok).toBe(true);
    if (!resp.ok) return;
    expect(resp.event.changes.color).toBeUndefined();
    expect('color' in resp.event.changes).toBe(false);
    expect(resp.event.changes.label).toBe('keep');
  });

  it('rejects when every optional string is whitespace-only (collapses to no-op)', async () => {
    const deps = makeDeps();
    const create = createAccountsCreateHandler(deps);
    const update = createAccountsUpdateHandler(deps);
    const created = await create({ name: 'A1' });
    if (!created.ok) throw new Error('seed failed');
    const resp = await update({
      id: created.event.id,
      changes: { color: '   ', label: '  ' },
    });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('SCHEMA_INVALID');
  });

  // trial.3.13 — opening balance is editable post-creation. Pedro's real-world
  // use case is fixing an account whose original opening balance was wrong
  // (e.g. seeded as €0 when it should have been €1.331,85). The handler
  // accepts the change unconditionally; no `OPENING_BALANCE_LOCKED` /
  // usage-count gate exists. The renderer guards the shift behind a confirm
  // dialog when transactions are attached.
  it('updates openingBalance and projects the new value onto the read model', async () => {
    const deps = makeDeps();
    const create = createAccountsCreateHandler(deps);
    const update = createAccountsUpdateHandler(deps);
    const created = await create({ name: 'Wrong opening', openingBalance: 0 });
    if (!created.ok) throw new Error('seed failed');

    const resp = await update({
      id: created.event.id,
      changes: { openingBalance: 1331.85 },
    });
    expect(resp.ok).toBe(true);
    if (!resp.ok) return;
    expect(resp.event.changes.openingBalance).toBe(1331.85);
    expect(getReadModel().configAccounts[0]!.openingBalance).toBe(1331.85);
  });

  it('no-op-strips openingBalance when the new value equals the current', async () => {
    const deps = makeDeps();
    const create = createAccountsCreateHandler(deps);
    const update = createAccountsUpdateHandler(deps);
    const created = await create({ name: 'A1', openingBalance: 42 });
    if (!created.ok) throw new Error('seed failed');

    const resp = await update({
      id: created.event.id,
      changes: { openingBalance: 42 },
    });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('SCHEMA_INVALID');
  });

  it('rejects a non-finite openingBalance with OPENING_BALANCE_INVALID', async () => {
    const deps = makeDeps();
    const create = createAccountsCreateHandler(deps);
    const update = createAccountsUpdateHandler(deps);
    const created = await create({ name: 'A1', openingBalance: 10 });
    if (!created.ok) throw new Error('seed failed');

    const resp = await update({
      id: created.event.id,
      changes: { openingBalance: Number.POSITIVE_INFINITY },
    });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('OPENING_BALANCE_INVALID');
    expect(resp.error.field).toBe('openingBalance');
  });
});

describe('accounts:archive / unarchive', () => {
  beforeEach(() => resetReadModel());

  it('archive then unarchive round-trip', async () => {
    const deps = makeDeps();
    const create = createAccountsCreateHandler(deps);
    const archive = createAccountsArchiveHandler(deps);
    const unarchive = createAccountsUnarchiveHandler(deps);
    const created = await create({ name: 'A1' });
    if (!created.ok) throw new Error('seed failed');

    const arch = await archive({ id: created.event.id });
    expect(arch.ok).toBe(true);
    if (!arch.ok) return;
    expect(arch.event.archivedAt).toBe(FIXED_NOW.toISOString());
    expect(getReadModel().configAccounts[0]!.archivedAt).toBe(FIXED_NOW.toISOString());

    const un = await unarchive({ id: created.event.id });
    expect(un.ok).toBe(true);
    if (!un.ok) return;
    expect(getReadModel().configAccounts[0]!.archivedAt).toBeUndefined();
  });

  it('archive on already-archived returns ALREADY_ARCHIVED', async () => {
    const deps = makeDeps();
    const create = createAccountsCreateHandler(deps);
    const archive = createAccountsArchiveHandler(deps);
    const created = await create({ name: 'A1' });
    if (!created.ok) throw new Error('seed failed');
    await archive({ id: created.event.id });
    const again = await archive({ id: created.event.id });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.code).toBe('ALREADY_ARCHIVED');
  });

  it('unarchive on an active account returns NOT_ARCHIVED', async () => {
    const deps = makeDeps();
    const create = createAccountsCreateHandler(deps);
    const unarchive = createAccountsUnarchiveHandler(deps);
    const created = await create({ name: 'A1' });
    if (!created.ok) throw new Error('seed failed');
    const resp = await unarchive({ id: created.event.id });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('NOT_ARCHIVED');
  });

  it('archive for unknown id → NOT_FOUND', async () => {
    const deps = makeDeps();
    const archive = createAccountsArchiveHandler(deps);
    const resp = await archive({ id: 'nope' });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('NOT_FOUND');
  });
});

describe('accounts:list includeArchived', () => {
  beforeEach(() => resetReadModel());

  it('hides archived accounts by default; returns them when includeArchived=true', async () => {
    const deps = makeDeps();
    const create = createAccountsCreateHandler(deps);
    const archive = createAccountsArchiveHandler(deps);
    const list = createAccountsListHandler({ getReadModel });
    const a = await create({ name: 'Active' });
    const b = await create({ name: 'Gone' });
    if (!a.ok || !b.ok) throw new Error('seed failed');
    await archive({ id: b.event.id });

    const def = await list();
    expect(def.accounts.map((x) => x.name)).toEqual(['Active']);

    const withAll = await list({ includeArchived: true });
    expect(withAll.accounts).toHaveLength(2);
    expect(withAll.accounts.find((x) => x.name === 'Gone')?.archivedAt).toBe(
      FIXED_NOW.toISOString(),
    );
  });
});
