// Bulk add-label command tests — mirror bulkUpdateTransactions.test.ts.

import { describe, it, expect } from 'vitest';
import { bulkAddLabelToTransactions, type BulkAddLabelInput } from './bulkAddLabelToTransactions';
import type { ReadModel } from '../query/types';
import { createTestDeps, testUlid } from '../test-helpers';

const ACCOUNT_ID = testUlid('ACC1');
const TAG_ID = testUlid('TAG1');

const mockReadModel = (
  transactions: ReadModel['transactions'] = [],
  tagIds: readonly string[] = [TAG_ID],
): ReadModel => ({
  transactions,
  accounts: [
    {
      id: ACCOUNT_ID,
      bankName: 'Test Bank',
      bankNameShort: 'TB',
      accountLabel: 'Test Account',
      color: '#ff0000',
      sortOrder: 0,
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
    },
  ],
  categories: [],
  tags: [],
  configAccounts: [],
  configCategories: [],
  configTags: tagIds.map((id, i) => ({
    id,
    name: `Tag ${i}`,
    sortOrder: i,
    createdAt: '2026-01-01T00:00:00Z',
  })),
  importMappings: [],
  rowHashes: new Set(),
  notes: new Map(),
  transactionsByReference: new Map(),
});

const makeTx = (id: string, overrides: Partial<ReadModel['transactions'][number]> = {}) => ({
  id,
  date: '2026-04-01',
  type: 'expense' as const,
  amount: 100,
  currency: 'EUR' as const,
  description: 'Test tx',
  accountId: ACCOUNT_ID,
  categoryId: null,
  subcategoryId: null,
  tagIds: [] as readonly string[],
  status: 'approved' as const,
  createdAt: '2026-04-01T00:00:00Z',
  reference: null,
  details: null,
  ...overrides,
});

const TX1 = testUlid('TX01');
const TX2 = testUlid('TX02');
const TX3 = testUlid('TX03');
const CORRELATION = testUlid('COR1');

describe('bulkAddLabelToTransactions', () => {
  it('happy path — appends label to N=3 transactions, all events share correlationId', () => {
    const now = new Date('2026-04-24T10:00:00Z');
    const tx1 = makeTx(TX1);
    const tx2 = makeTx(TX2, { description: 'Second tx' });
    const tx3 = makeTx(TX3, { description: 'Third tx' });

    let evtCounter = 0;
    const newId = () => testUlid(`EVT${String(evtCounter++).padStart(21, '0')}`);

    const input: BulkAddLabelInput = {
      ids: [TX1, TX2, TX3],
      tagId: TAG_ID,
      correlationId: CORRELATION,
    };

    const deps = createTestDeps({
      now: () => now,
      newId,
      readModel: mockReadModel([tx1, tx2, tx3]),
    });

    const result = bulkAddLabelToTransactions(input, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toHaveLength(3);
    expect(result.updatedIds).toEqual([TX1, TX2, TX3]);
    expect(result.skippedIds).toEqual([]);

    for (const event of result.events) {
      expect(event.payload.correlationId).toBe(CORRELATION);
      expect(event.payload.tagIds).toEqual([TAG_ID]);
    }
    expect(result.events[0]!.payload.id).toBe(TX1);
    expect(result.events[1]!.payload.id).toBe(TX2);
    expect(result.events[2]!.payload.id).toBe(TX3);
  });

  it('appends to existing tagIds (preserves prior tags)', () => {
    const PRIOR_TAG_ID = testUlid('TAG9');
    const tx1 = makeTx(TX1, { tagIds: [PRIOR_TAG_ID] });

    const input: BulkAddLabelInput = {
      ids: [TX1],
      tagId: TAG_ID,
      correlationId: CORRELATION,
    };

    const deps = createTestDeps({
      now: () => new Date('2026-04-24T10:00:00Z'),
      readModel: mockReadModel([tx1]),
    });

    const result = bulkAddLabelToTransactions(input, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.payload.tagIds).toEqual([PRIOR_TAG_ID, TAG_ID]);
  });

  it('idempotent — silently skips txs that already carry the tag', () => {
    const tx1 = makeTx(TX1);
    const tx2 = makeTx(TX2, { tagIds: [TAG_ID] }); // already tagged
    const tx3 = makeTx(TX3);

    let evtCounter = 0;
    const newId = () => testUlid(`EVT${String(evtCounter++).padStart(21, '0')}`);

    const input: BulkAddLabelInput = {
      ids: [TX1, TX2, TX3],
      tagId: TAG_ID,
      correlationId: CORRELATION,
    };

    const deps = createTestDeps({
      now: () => new Date('2026-04-24T10:00:00Z'),
      newId,
      readModel: mockReadModel([tx1, tx2, tx3]),
    });

    const result = bulkAddLabelToTransactions(input, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toHaveLength(2); // TX2 skipped → no event
    expect(result.updatedIds).toEqual([TX1, TX3]);
    expect(result.skippedIds).toEqual([TX2]);

    // Emitted events target only TX1 + TX3.
    const emittedIds = result.events.map((e) => e.payload.id);
    expect(emittedIds).not.toContain(TX2);
  });

  it('returns TX_NOT_FOUND for unknown tx id (all-or-nothing)', () => {
    const tx1 = makeTx(TX1);

    const input: BulkAddLabelInput = {
      ids: [TX1, TX2], // TX2 does not exist
      tagId: TAG_ID,
      correlationId: CORRELATION,
    };

    const deps = createTestDeps({
      now: () => new Date('2026-04-24T10:00:00Z'),
      readModel: mockReadModel([tx1]),
    });

    const result = bulkAddLabelToTransactions(input, deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.id).toBe(TX2);
    expect(result.failures[0]!.code).toBe('TX_NOT_FOUND');
  });

  it('returns TAG_NOT_FOUND when tagId is unknown', () => {
    const UNKNOWN_TAG_ID = testUlid('UNKN');
    const tx1 = makeTx(TX1);

    const input: BulkAddLabelInput = {
      ids: [TX1],
      tagId: UNKNOWN_TAG_ID,
      correlationId: CORRELATION,
    };

    const deps = createTestDeps({
      now: () => new Date('2026-04-24T10:00:00Z'),
      readModel: mockReadModel([tx1]),
    });

    const result = bulkAddLabelToTransactions(input, deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.code).toBe('TAG_NOT_FOUND');
    expect(result.failures[0]!.id).toBe(UNKNOWN_TAG_ID);
  });

  it('returns EMPTY_IDS when ids array is empty', () => {
    const input: BulkAddLabelInput = {
      ids: [],
      tagId: TAG_ID,
      correlationId: CORRELATION,
    };

    const deps = createTestDeps({
      readModel: mockReadModel([]),
    });

    const result = bulkAddLabelToTransactions(input, deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.code).toBe('EMPTY_IDS');
  });

  it('dedupes ids (no duplicate events for the same tx)', () => {
    const tx1 = makeTx(TX1);

    let evtCounter = 0;
    const newId = () => testUlid(`EVT${String(evtCounter++).padStart(21, '0')}`);

    const input: BulkAddLabelInput = {
      ids: [TX1, TX1, TX1],
      tagId: TAG_ID,
      correlationId: CORRELATION,
    };

    const deps = createTestDeps({
      now: () => new Date('2026-04-24T10:00:00Z'),
      newId,
      readModel: mockReadModel([tx1]),
    });

    const result = bulkAddLabelToTransactions(input, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toHaveLength(1);
  });

  it('preserves unchanged fields (date, type, amount, description, reference, details, status)', () => {
    const CAT_ID = testUlid('CAT1');
    const SUB_ID = testUlid('SUB1');
    const tx1 = makeTx(TX1, {
      date: '2026-03-15',
      type: 'income',
      amount: 500,
      description: 'Original description',
      reference: 'REF-001',
      details: 'Original details',
      categoryId: CAT_ID,
      subcategoryId: SUB_ID,
      status: 'pending',
    });

    const input: BulkAddLabelInput = {
      ids: [TX1],
      tagId: TAG_ID,
      correlationId: CORRELATION,
    };

    const deps = createTestDeps({
      now: () => new Date('2026-04-24T10:00:00Z'),
      readModel: mockReadModel([tx1]),
    });

    const result = bulkAddLabelToTransactions(input, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const payload = result.events[0]!.payload;
    expect(payload.date).toBe('2026-03-15');
    expect(payload.type).toBe('income');
    expect(payload.amount).toBe(500);
    expect(payload.description).toBe('Original description');
    expect(payload.reference).toBe('REF-001');
    expect(payload.details).toBe('Original details');
    expect(payload.categoryId).toBe(CAT_ID);
    expect(payload.subcategoryId).toBe(SUB_ID);
    expect(payload.status).toBe('pending');
    expect(payload.tagIds).toEqual([TAG_ID]);
  });
});
