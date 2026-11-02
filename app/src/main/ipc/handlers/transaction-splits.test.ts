// SPEC-023 — transaction splits handler validation tests.
// Validates Pedro's 6 normative locks (FR3, FR12, FR13, FR14, FR15 + the
// parent-not-split constraint on split:remove). Uses an in-memory EventLog stub
// matching the JsonFileEventLog contract (dedupes by event.id). Each test runs
// against a fresh reducer state.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSplitTransactionHandler,
  createRemoveSplitHandler,
  createGetSplitsHandler,
  type SplitHandlerDeps,
} from './transaction-splits';
import type { EventLog, DomainEvent } from '../../../core/eventLog/EventLog';
import {
  applyEvent,
  getReadModel,
  replayEvents,
  resetReadModel,
} from '../../../core/query/reducers';
import {
  MAX_SPLITS_PER_TX,
  SPLIT_COMMENT_MAX,
} from '../../../shared/ipc-contracts/transaction-splits';

const ulid = (suffix: string): string => (suffix + '0'.repeat(26)).slice(0, 26).toUpperCase();

const ACCOUNT_ID = ulid('ACC1');
const TX_ID = ulid('TX01');

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

function seedAccountAndTx(txAmount = 500): void {
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
      type: 'tx.created',
      id: ulid('EVT-C'),
      datasetId: ulid('DATA'),
      actorDeviceId: ulid('DEV1'),
      createdAt: '2026-04-20T10:00:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: {
        id: TX_ID,
        date: '2026-04-20',
        type: 'expense',
        amount: txAmount,
        currency: 'EUR',
        description: 'Mixed payment',
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
  ]);
}

function makeDeps(): SplitHandlerDeps {
  return {
    eventLog: new InMemoryEventLog(),
    getReadModel,
    now: () => new Date('2026-04-20T12:00:00.000Z'),
    newId: () => ulid('EVT' + Math.random().toString(36).slice(2, 6).toUpperCase()),
  };
}

describe('transaction:split handler — cents-sum invariant (SPEC-023 FR3)', () => {
  beforeEach(() => {
    resetReadModel();
  });

  it('accepts 2 splits summing exactly to parentTx.amount * 100', async () => {
    seedAccountAndTx(500);
    const handle = createSplitTransactionHandler(makeDeps());

    const response = await handle({
      parentTxId: TX_ID,
      splits: [
        { amountCents: 30000, categoryId: null, subcategoryId: null, comment: 'Part A' },
        { amountCents: 20000, categoryId: null, subcategoryId: null, comment: 'Part B' },
      ],
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.event.type).toBe('tx.split');
    expect(response.event.splits).toHaveLength(2);
  });

  it('rejects splits with sum 1 cent less than parentTx.amount * 100', async () => {
    seedAccountAndTx(500);
    const handle = createSplitTransactionHandler(makeDeps());

    const response = await handle({
      parentTxId: TX_ID,
      splits: [
        { amountCents: 30000, categoryId: null },
        { amountCents: 19999, categoryId: null }, // off by 1
      ],
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.code).toBe('SUM_MISMATCH');
    expect(response.error.message).toContain('49999');
    expect(response.error.message).toContain('50000');
  });

  it('rejects splits with sum 1 cent more than parentTx.amount * 100', async () => {
    seedAccountAndTx(500);
    const handle = createSplitTransactionHandler(makeDeps());

    const response = await handle({
      parentTxId: TX_ID,
      splits: [
        { amountCents: 30000, categoryId: null },
        { amountCents: 20001, categoryId: null }, // off by 1
      ],
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.code).toBe('SUM_MISMATCH');
    expect(response.error.message).toContain('50001');
    expect(response.error.message).toContain('50000');
  });
});

describe('transaction:split handler — MAX_SPLITS_PER_TX limit (SPEC-023 FR12)', () => {
  beforeEach(() => {
    resetReadModel();
  });

  it('accepts exactly 20 splits', async () => {
    seedAccountAndTx(2000);
    const handle = createSplitTransactionHandler(makeDeps());

    const splits = Array.from({ length: 20 }, () => ({
      amountCents: 10000,
      categoryId: null,
      subcategoryId: null,
      comment: null,
    }));

    const response = await handle({ parentTxId: TX_ID, splits });

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.event.splits).toHaveLength(20);
  });

  it('rejects 21 splits (boundary)', async () => {
    seedAccountAndTx(2100);
    const handle = createSplitTransactionHandler(makeDeps());

    const splits = Array.from({ length: 21 }, () => ({
      amountCents: 10000,
      categoryId: null,
    }));

    const response = await handle({ parentTxId: TX_ID, splits });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.code).toBe('SCHEMA_INVALID');
    expect(response.error.message).toMatch(
      /too_big|have <=20 items|Array must contain at most 20 element/i,
    );
  });

  it('ensures MAX_SPLITS_PER_TX constant is 20 per spec', () => {
    expect(MAX_SPLITS_PER_TX).toBe(20);
  });
});

describe('transaction:split handler — SPLIT_COMMENT_MAX limit (SPEC-023 FR13)', () => {
  beforeEach(() => {
    resetReadModel();
  });

  it('accepts split comment with exactly 500 chars', async () => {
    seedAccountAndTx(500);
    const handle = createSplitTransactionHandler(makeDeps());

    const comment = 'A'.repeat(500);

    const response = await handle({
      parentTxId: TX_ID,
      splits: [
        { amountCents: 30000, categoryId: null, comment },
        { amountCents: 20000, categoryId: null },
      ],
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.event.splits[0]!.comment).toHaveLength(500);
  });

  it('rejects split comment with 501 chars (boundary)', async () => {
    seedAccountAndTx(500);
    const handle = createSplitTransactionHandler(makeDeps());

    const comment = 'B'.repeat(501);

    const response = await handle({
      parentTxId: TX_ID,
      splits: [
        { amountCents: 30000, categoryId: null, comment },
        { amountCents: 20000, categoryId: null },
      ],
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.code).toBe('SCHEMA_INVALID');
    expect(response.error.message).toMatch(
      /have <=500 characters|String must contain at most 500 character/i,
    );
  });

  it('ensures SPLIT_COMMENT_MAX constant is 500 per spec', () => {
    expect(SPLIT_COMMENT_MAX).toBe(500);
  });
});

describe('transaction:split handler — parent already split (SPEC-023 FR6 idempotency)', () => {
  beforeEach(() => {
    resetReadModel();
  });

  it('replaces existing splits when parent is re-split (idempotent replacement)', async () => {
    seedAccountAndTx(500);
    const deps = makeDeps();
    const handle = createSplitTransactionHandler(deps);

    // First split: 2 children
    const firstResponse = await handle({
      parentTxId: TX_ID,
      splits: [
        { amountCents: 30000, categoryId: null, comment: 'Old A' },
        { amountCents: 20000, categoryId: null, comment: 'Old B' },
      ],
    });
    expect(firstResponse.ok).toBe(true);
    if (!firstResponse.ok) return;
    applyEvent(firstResponse.event);

    // Second split: 3 children (replaces the first)
    const secondResponse = await handle({
      parentTxId: TX_ID,
      splits: [
        { amountCents: 20000, categoryId: null, comment: 'New A' },
        { amountCents: 15000, categoryId: null, comment: 'New B' },
        { amountCents: 15000, categoryId: null, comment: 'New C' },
      ],
    });
    expect(secondResponse.ok).toBe(true);
    if (!secondResponse.ok) return;

    // Verify read model has 3 children, not 5
    const model = getReadModel();
    const splits = model.splits.get(TX_ID);
    expect(splits).toBeDefined();
    expect(splits).toHaveLength(3);
    expect(splits!.map((s) => s.comment)).toEqual(['New A', 'New B', 'New C']);
  });
});

describe('transaction:split:remove handler — parent not split (SPEC-023 FR6)', () => {
  beforeEach(() => {
    resetReadModel();
  });

  it('allows removing splits on an un-split parent (idempotent no-op)', async () => {
    seedAccountAndTx(500);
    const handle = createRemoveSplitHandler(makeDeps());

    const response = await handle({ parentTxId: TX_ID });

    // Spec says this is a no-op, not an error. Event is still appended but reducer ignores it.
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.event.type).toBe('tx.split.removed');
    expect(response.event.parentTxId).toBe(TX_ID);
  });

  it('removes splits when parent has active splits', async () => {
    seedAccountAndTx(500);
    const deps = makeDeps();
    const splitHandle = createSplitTransactionHandler(deps);
    const removeHandle = createRemoveSplitHandler(deps);

    // Split first
    const splitResponse = await splitHandle({
      parentTxId: TX_ID,
      splits: [
        { amountCents: 30000, categoryId: null },
        { amountCents: 20000, categoryId: null },
      ],
    });
    expect(splitResponse.ok).toBe(true);
    if (!splitResponse.ok) return;
    applyEvent(splitResponse.event);

    // Verify splits exist
    let model = getReadModel();
    expect(model.splits.has(TX_ID)).toBe(true);
    expect(model.splitParentIds.has(TX_ID)).toBe(true);

    // Remove splits
    const removeResponse = await removeHandle({ parentTxId: TX_ID });
    expect(removeResponse.ok).toBe(true);
    if (!removeResponse.ok) return;
    applyEvent(removeResponse.event);

    // Verify splits removed
    model = getReadModel();
    expect(model.splits.has(TX_ID)).toBe(false);
    expect(model.splitParentIds.has(TX_ID)).toBe(false);
  });
});

describe('transaction:split:get handler — query splits for editor', () => {
  beforeEach(() => {
    resetReadModel();
  });

  it('returns empty array when parent has no splits', async () => {
    seedAccountAndTx(500);
    const handle = createGetSplitsHandler({ getReadModel });

    const response = await handle({ parentTxId: TX_ID });

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.splits).toEqual([]);
  });

  it('returns splits with all fields when parent has splits', async () => {
    seedAccountAndTx(500);
    const deps = makeDeps();
    const splitHandle = createSplitTransactionHandler(deps);
    const getHandle = createGetSplitsHandler({ getReadModel });

    const splitResponse = await splitHandle({
      parentTxId: TX_ID,
      splits: [
        { amountCents: 30000, categoryId: ulid('CAT1'), subcategoryId: null, comment: 'First' },
        { amountCents: 20000, categoryId: null, subcategoryId: ulid('SUB2'), comment: 'Second' },
      ],
    });
    expect(splitResponse.ok).toBe(true);
    if (!splitResponse.ok) return;
    applyEvent(splitResponse.event);

    const getResponse = await getHandle({ parentTxId: TX_ID });

    expect(getResponse.ok).toBe(true);
    if (!getResponse.ok) return;
    expect(getResponse.splits).toHaveLength(2);
    expect(getResponse.splits[0]!.amountCents).toBe(30000);
    expect(getResponse.splits[0]!.categoryId).toBe(ulid('CAT1'));
    expect(getResponse.splits[0]!.comment).toBe('First');
    expect(getResponse.splits[1]!.amountCents).toBe(20000);
    expect(getResponse.splits[1]!.subcategoryId).toBe(ulid('SUB2'));
    expect(getResponse.splits[1]!.comment).toBe('Second');
  });

  it('rejects query for non-existent transaction', async () => {
    resetReadModel();
    const handle = createGetSplitsHandler({ getReadModel });

    const response = await handle({ parentTxId: ulid('NOPE') });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.code).toBe('TX_NOT_FOUND');
  });
});

describe('transaction:split handler — TX_NOT_FOUND guard', () => {
  beforeEach(() => {
    resetReadModel();
  });

  it('rejects split when parent transaction does not exist', async () => {
    resetReadModel(); // no tx seeded
    const handle = createSplitTransactionHandler(makeDeps());

    const response = await handle({
      parentTxId: ulid('NOPE'),
      splits: [
        { amountCents: 30000, categoryId: null },
        { amountCents: 20000, categoryId: null },
      ],
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.code).toBe('TX_NOT_FOUND');
  });
});
