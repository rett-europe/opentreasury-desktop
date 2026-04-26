// SPEC-023 — transaction splits reducer tests.
// Validates that tx.split / tx.split.removed events correctly update:
//   - ReadModel.splits Map
//   - ReadModel.splitParentIds Set
//
// These projections are queried at runtime for FR14 (reject parent amount
// change), FR15 (bulk skip), and the Movements list (hasSplits badge).

import { describe, it, expect, beforeEach } from 'vitest';
import { applyEvent, getReadModel, resetReadModel, replayEvents } from './reducers';
import type { DomainEvent } from '../events/schemas';

const ulid = (suffix: string): string => (suffix + '0'.repeat(26)).slice(0, 26).toUpperCase();

const ACCOUNT_ID = ulid('ACC1');
const TX_ID = ulid('TX01');

function seedAccountAndTx(): void {
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
        amount: 500,
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

describe('reducers — tx.split event projection', () => {
  beforeEach(() => {
    resetReadModel();
  });

  it('applies tx.split event and populates splits Map + splitParentIds Set', () => {
    seedAccountAndTx();

    const splitEvent: DomainEvent = {
      type: 'tx.split',
      id: ulid('EVTSPLIT'),
      parentTxId: TX_ID,
      splits: [
        {
          splitId: ulid('SP1'),
          amountCents: 30000,
          categoryId: ulid('CAT1'),
          subcategoryId: null,
          comment: 'First split',
          sortOrder: 0,
        },
        {
          splitId: ulid('SP2'),
          amountCents: 20000,
          categoryId: null,
          subcategoryId: ulid('SUB2'),
          comment: 'Second split',
          sortOrder: 1,
        },
      ],
      createdAt: '2026-04-20T11:00:00.000Z',
    };

    applyEvent(splitEvent);

    const model = getReadModel();

    // Verify splits Map entry
    expect(model.splits.has(TX_ID)).toBe(true);
    const splits = model.splits.get(TX_ID);
    expect(splits).toHaveLength(2);
    expect(splits![0]!.splitId).toBe(ulid('SP1'));
    expect(splits![0]!.parentTxId).toBe(TX_ID);
    expect(splits![0]!.amountCents).toBe(30000);
    expect(splits![0]!.categoryId).toBe(ulid('CAT1'));
    expect(splits![0]!.subcategoryId).toBeNull();
    expect(splits![0]!.comment).toBe('First split');
    expect(splits![0]!.sortOrder).toBe(0);

    expect(splits![1]!.splitId).toBe(ulid('SP2'));
    expect(splits![1]!.amountCents).toBe(20000);
    expect(splits![1]!.categoryId).toBeNull();
    expect(splits![1]!.subcategoryId).toBe(ulid('SUB2'));
    expect(splits![1]!.comment).toBe('Second split');
    expect(splits![1]!.sortOrder).toBe(1);

    // Verify splitParentIds Set entry
    expect(model.splitParentIds.has(TX_ID)).toBe(true);
  });

  it('replaces existing splits when parent is re-split (idempotent replacement)', () => {
    seedAccountAndTx();

    // First split: 2 children
    const firstSplit: DomainEvent = {
      type: 'tx.split',
      id: ulid('SPLIT1'),
      parentTxId: TX_ID,
      splits: [
        {
          splitId: ulid('OLD-A'),
          amountCents: 30000,
          categoryId: null,
          subcategoryId: null,
          comment: 'Old A',
          sortOrder: 0,
        },
        {
          splitId: ulid('OLD-B'),
          amountCents: 20000,
          categoryId: null,
          subcategoryId: null,
          comment: 'Old B',
          sortOrder: 1,
        },
      ],
      createdAt: '2026-04-20T11:00:00.000Z',
    };
    applyEvent(firstSplit);

    // Verify first split applied
    let model = getReadModel();
    expect(model.splits.get(TX_ID)).toHaveLength(2);

    // Second split: 3 children (replaces the first)
    const secondSplit: DomainEvent = {
      type: 'tx.split',
      id: ulid('SPLIT2'),
      parentTxId: TX_ID,
      splits: [
        {
          splitId: ulid('NEW-A'),
          amountCents: 20000,
          categoryId: null,
          subcategoryId: null,
          comment: 'New A',
          sortOrder: 0,
        },
        {
          splitId: ulid('NEW-B'),
          amountCents: 15000,
          categoryId: null,
          subcategoryId: null,
          comment: 'New B',
          sortOrder: 1,
        },
        {
          splitId: ulid('NEW-C'),
          amountCents: 15000,
          categoryId: null,
          subcategoryId: null,
          comment: 'New C',
          sortOrder: 2,
        },
      ],
      createdAt: '2026-04-20T12:00:00.000Z',
    };
    applyEvent(secondSplit);

    // Verify second split replaced first (3 children, not 5)
    model = getReadModel();
    const splits = model.splits.get(TX_ID);
    expect(splits).toHaveLength(3);
    expect(splits!.map((s) => s.splitId)).toEqual([
      ulid('NEW-A'),
      ulid('NEW-B'),
      ulid('NEW-C'),
    ]);
    expect(splits!.map((s) => s.comment)).toEqual(['New A', 'New B', 'New C']);
  });

  it('normalizes null/undefined to null for category/subcategory/comment', () => {
    seedAccountAndTx();

    const splitEvent: DomainEvent = {
      type: 'tx.split',
      id: ulid('EVTSPLIT'),
      parentTxId: TX_ID,
      splits: [
        {
          splitId: ulid('SP1'),
          amountCents: 30000,
          categoryId: undefined as unknown as null, // test undefined
          subcategoryId: null,
          comment: null,
          sortOrder: 0,
        },
        {
          splitId: ulid('SP2'),
          amountCents: 20000,
          categoryId: null,
          subcategoryId: undefined as unknown as null,
          comment: undefined as unknown as null,
          sortOrder: 1,
        },
      ],
      createdAt: '2026-04-20T11:00:00.000Z',
    };

    applyEvent(splitEvent);

    const model = getReadModel();
    const splits = model.splits.get(TX_ID);
    expect(splits![0]!.categoryId).toBeNull();
    expect(splits![0]!.subcategoryId).toBeNull();
    expect(splits![0]!.comment).toBeNull();
    expect(splits![1]!.categoryId).toBeNull();
    expect(splits![1]!.subcategoryId).toBeNull();
    expect(splits![1]!.comment).toBeNull();
  });
});

describe('reducers — tx.split.removed event projection', () => {
  beforeEach(() => {
    resetReadModel();
  });

  it('removes splits Map entry and splitParentIds Set entry', () => {
    seedAccountAndTx();

    // Apply split first
    const splitEvent: DomainEvent = {
      type: 'tx.split',
      id: ulid('EVTSPLIT'),
      parentTxId: TX_ID,
      splits: [
        {
          splitId: ulid('SP1'),
          amountCents: 30000,
          categoryId: null,
          subcategoryId: null,
          comment: null,
          sortOrder: 0,
        },
        {
          splitId: ulid('SP2'),
          amountCents: 20000,
          categoryId: null,
          subcategoryId: null,
          comment: null,
          sortOrder: 1,
        },
      ],
      createdAt: '2026-04-20T11:00:00.000Z',
    };
    applyEvent(splitEvent);

    // Verify splits exist
    let model = getReadModel();
    expect(model.splits.has(TX_ID)).toBe(true);
    expect(model.splitParentIds.has(TX_ID)).toBe(true);

    // Apply split.removed
    const removeEvent: DomainEvent = {
      type: 'tx.split.removed',
      id: ulid('EVTREM'),
      parentTxId: TX_ID,
      removedAt: '2026-04-20T12:00:00.000Z',
    };
    applyEvent(removeEvent);

    // Verify splits removed
    model = getReadModel();
    expect(model.splits.has(TX_ID)).toBe(false);
    expect(model.splitParentIds.has(TX_ID)).toBe(false);
  });

  it('is a no-op when removing splits from a non-split parent (idempotent)', () => {
    seedAccountAndTx();

    // No splits applied yet
    let model = getReadModel();
    expect(model.splits.has(TX_ID)).toBe(false);
    expect(model.splitParentIds.has(TX_ID)).toBe(false);

    // Apply split.removed on an un-split parent
    const removeEvent: DomainEvent = {
      type: 'tx.split.removed',
      id: ulid('EVTREM'),
      parentTxId: TX_ID,
      removedAt: '2026-04-20T12:00:00.000Z',
    };
    applyEvent(removeEvent);

    // Verify still no splits (no error thrown)
    model = getReadModel();
    expect(model.splits.has(TX_ID)).toBe(false);
    expect(model.splitParentIds.has(TX_ID)).toBe(false);
  });

  it('allows re-splitting after removal (round-trip cycle)', () => {
    seedAccountAndTx();

    // Split
    const splitEvent1: DomainEvent = {
      type: 'tx.split',
      id: ulid('SPLIT1'),
      parentTxId: TX_ID,
      splits: [
        { splitId: ulid('SP1'), amountCents: 30000, categoryId: null, subcategoryId: null, comment: null, sortOrder: 0 },
        { splitId: ulid('SP2'), amountCents: 20000, categoryId: null, subcategoryId: null, comment: null, sortOrder: 1 },
      ],
      createdAt: '2026-04-20T11:00:00.000Z',
    };
    applyEvent(splitEvent1);
    expect(getReadModel().splits.has(TX_ID)).toBe(true);

    // Remove
    const removeEvent: DomainEvent = {
      type: 'tx.split.removed',
      id: ulid('REM1'),
      parentTxId: TX_ID,
      removedAt: '2026-04-20T12:00:00.000Z',
    };
    applyEvent(removeEvent);
    expect(getReadModel().splits.has(TX_ID)).toBe(false);

    // Re-split
    const splitEvent2: DomainEvent = {
      type: 'tx.split',
      id: ulid('SPLIT2'),
      parentTxId: TX_ID,
      splits: [
        { splitId: ulid('SP3'), amountCents: 25000, categoryId: null, subcategoryId: null, comment: null, sortOrder: 0 },
        { splitId: ulid('SP4'), amountCents: 25000, categoryId: null, subcategoryId: null, comment: null, sortOrder: 1 },
      ],
      createdAt: '2026-04-20T13:00:00.000Z',
    };
    applyEvent(splitEvent2);

    const model = getReadModel();
    expect(model.splits.has(TX_ID)).toBe(true);
    expect(model.splits.get(TX_ID)).toHaveLength(2);
    expect(model.splitParentIds.has(TX_ID)).toBe(true);
  });
});

describe('reducers — splits projection with multiple parents', () => {
  beforeEach(() => {
    resetReadModel();
  });

  it('maintains independent splits for 3 different parent transactions', () => {
    const TX_A = ulid('TXA');
    const TX_B = ulid('TXB');
    const TX_C = ulid('TXC');

    replayEvents([
      {
        type: 'AccountCreated',
        id: ACCOUNT_ID,
        name: 'Main',
        label: 'Main',
        bankName: 'Test',
        currency: 'EUR',
        openingBalance: 0,
        sortOrder: 0,
        createdAt: '2026-04-19T10:00:00.000Z',
      } as DomainEvent,
      // Create 3 transactions
      ...([TX_A, TX_B, TX_C].map((id) => ({
        type: 'tx.created',
        id: ulid('EVT-C' + id),
        datasetId: ulid('DATA'),
        actorDeviceId: ulid('DEV'),
        createdAt: '2026-04-20T10:00:00.000Z',
        dekVersion: 0,
        version: 1,
        payload: {
          id,
          date: '2026-04-20',
          type: 'expense',
          amount: 100,
          currency: 'EUR',
          description: 'Tx ' + id,
          accountId: ACCOUNT_ID,
          categoryId: null,
          subcategoryId: null,
          tagIds: [],
          status: 'approved',
          createdAt: '2026-04-20T10:00:00.000Z',
          reference: null,
          details: null,
        },
      })) as DomainEvent[]),
      // Split each
      {
        type: 'tx.split',
        id: ulid('SPLA'),
        parentTxId: TX_A,
        splits: [
          { splitId: ulid('A1'), amountCents: 5000, categoryId: null, subcategoryId: null, comment: 'A1', sortOrder: 0 },
          { splitId: ulid('A2'), amountCents: 5000, categoryId: null, subcategoryId: null, comment: 'A2', sortOrder: 1 },
        ],
        createdAt: '2026-04-20T11:00:00.000Z',
      } as DomainEvent,
      {
        type: 'tx.split',
        id: ulid('SPLB'),
        parentTxId: TX_B,
        splits: [
          { splitId: ulid('B1'), amountCents: 6000, categoryId: null, subcategoryId: null, comment: 'B1', sortOrder: 0 },
          { splitId: ulid('B2'), amountCents: 4000, categoryId: null, subcategoryId: null, comment: 'B2', sortOrder: 1 },
        ],
        createdAt: '2026-04-20T11:00:00.000Z',
      } as DomainEvent,
      {
        type: 'tx.split',
        id: ulid('SPLC'),
        parentTxId: TX_C,
        splits: [
          { splitId: ulid('C1'), amountCents: 3000, categoryId: null, subcategoryId: null, comment: 'C1', sortOrder: 0 },
          { splitId: ulid('C2'), amountCents: 4000, categoryId: null, subcategoryId: null, comment: 'C2', sortOrder: 1 },
          { splitId: ulid('C3'), amountCents: 3000, categoryId: null, subcategoryId: null, comment: 'C3', sortOrder: 2 },
        ],
        createdAt: '2026-04-20T11:00:00.000Z',
      } as DomainEvent,
    ]);

    const model = getReadModel();

    expect(model.splits.size).toBe(3);
    expect(model.splitParentIds.size).toBe(3);

    expect(model.splits.get(TX_A)).toHaveLength(2);
    expect(model.splits.get(TX_B)).toHaveLength(2);
    expect(model.splits.get(TX_C)).toHaveLength(3);

    expect(model.splitParentIds.has(TX_A)).toBe(true);
    expect(model.splitParentIds.has(TX_B)).toBe(true);
    expect(model.splitParentIds.has(TX_C)).toBe(true);

    expect(model.splits.get(TX_A)!.map((s) => s.comment)).toEqual(['A1', 'A2']);
    expect(model.splits.get(TX_C)!.map((s) => s.comment)).toEqual(['C1', 'C2', 'C3']);
  });
});
