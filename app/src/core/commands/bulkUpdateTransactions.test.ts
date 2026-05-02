// WI-31a: bulkUpdateTransactions command tests

import { describe, it, expect } from 'vitest';
import { bulkUpdateTransactions, type BulkUpdateInput } from './bulkUpdateTransactions';
import type { ReadModel } from '../query/types';
import { createTestDeps, testUlid } from '../test-helpers';

const mockReadModel = (transactions: ReadModel['transactions'] = []): ReadModel => ({
  transactions,
  accounts: [
    {
      id: testUlid('ACC1'),
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
  configTags: [],
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
  accountId: testUlid('ACC1'),
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
const CAT_ID = testUlid('CAT1');
const TAG_ID2 = testUlid('TAG2');
const TAG_ID3 = testUlid('TAG3');

describe('bulkUpdateTransactions', () => {
  it('happy path — updates N=3 transactions', () => {
    const now = new Date('2026-04-24T10:00:00Z');
    const tx1 = makeTx(TX1);
    const tx2 = makeTx(TX2, { description: 'Second tx' });
    const tx3 = makeTx(TX3, { description: 'Third tx' });

    let evtCounter = 0;
    const newId = () => testUlid(`EVT${String(evtCounter++).padStart(21, '0')}`);

    const input: BulkUpdateInput = {
      ids: [TX1, TX2, TX3],
      categoryId: CAT_ID,
      status: 'pending',
      correlationId: CORRELATION,
    };

    const deps = createTestDeps({
      now: () => now,
      newId,
      readModel: mockReadModel([tx1, tx2, tx3]),
    });

    const result = bulkUpdateTransactions(input, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toHaveLength(3);

    // All events carry the same correlationId
    for (const event of result.events) {
      expect(event.payload.correlationId).toBe(CORRELATION);
      expect(event.payload.categoryId).toBe(CAT_ID);
      expect(event.payload.status).toBe('pending');
    }

    // Transaction ids match
    expect(result.events[0]!.payload.id).toBe(TX1);
    expect(result.events[1]!.payload.id).toBe(TX2);
    expect(result.events[2]!.payload.id).toBe(TX3);
  });

  it('partial failure — 1 bad tx in 3 returns failures with zero events', () => {
    const tx1 = makeTx(TX1);
    const tx3 = makeTx(TX3);

    const input: BulkUpdateInput = {
      ids: [TX1, TX2, TX3], // TX2 does not exist
      categoryId: CAT_ID,
      correlationId: CORRELATION,
    };

    const deps = createTestDeps({
      readModel: mockReadModel([tx1, tx3]),
    });

    const result = bulkUpdateTransactions(input, deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.id).toBe(TX2);
    expect(result.failures[0]!.code).toBe('TX_NOT_FOUND');
  });

  it('returns EMPTY_IDS failure when ids array is empty', () => {
    const input: BulkUpdateInput = {
      ids: [],
      correlationId: CORRELATION,
    };

    const deps = createTestDeps({
      readModel: mockReadModel([]),
    });

    const result = bulkUpdateTransactions(input, deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.code).toBe('EMPTY_IDS');
  });

  it('returns TX_NOT_FOUND for unknown id', () => {
    const input: BulkUpdateInput = {
      ids: [testUlid('NONE')],
      correlationId: CORRELATION,
    };

    const deps = createTestDeps({
      readModel: mockReadModel([]),
    });

    const result = bulkUpdateTransactions(input, deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.code).toBe('TX_NOT_FOUND');
  });

  it('correlationId is uniform across all events', () => {
    const tx1 = makeTx(TX1);
    const tx2 = makeTx(TX2);

    let evtCounter = 0;
    const newId = () => testUlid(`EVT${String(evtCounter++).padStart(21, '0')}`);

    const input: BulkUpdateInput = {
      ids: [TX1, TX2],
      correlationId: CORRELATION,
    };

    const deps = createTestDeps({
      now: () => new Date('2026-04-24T10:00:00Z'),
      newId,
      readModel: mockReadModel([tx1, tx2]),
    });

    const result = bulkUpdateTransactions(input, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const correlationIds = result.events.map((e) => e.payload.correlationId);
    expect(new Set(correlationIds).size).toBe(1);
    expect(correlationIds[0]).toBe(CORRELATION);
  });

  it('preserves unchanged fields (date, type, amount, description, reference, details)', () => {
    const tx1 = makeTx(TX1, {
      date: '2026-03-15',
      type: 'income',
      amount: 500,
      description: 'Original description',
      reference: 'REF-001',
      details: 'Original details',
    });

    const input: BulkUpdateInput = {
      ids: [TX1],
      categoryId: CAT_ID,
      correlationId: CORRELATION,
    };

    const deps = createTestDeps({
      now: () => new Date('2026-04-24T10:00:00Z'),
      readModel: mockReadModel([tx1]),
    });

    const result = bulkUpdateTransactions(input, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const payload = result.events[0]!.payload;
    expect(payload.date).toBe('2026-03-15');
    expect(payload.type).toBe('income');
    expect(payload.amount).toBe(500);
    expect(payload.description).toBe('Original description');
    expect(payload.reference).toBe('REF-001');
    expect(payload.details).toBe('Original details');
    expect(payload.accountId).toBe(testUlid('ACC1'));
    expect(payload.createdAt).toBe('2026-04-01T00:00:00Z');
    // Only categoryId was changed
    expect(payload.categoryId).toBe(CAT_ID);
  });

  it('dedupes ids (no duplicate events)', () => {
    const tx1 = makeTx(TX1);

    let evtCounter = 0;
    const newId = () => testUlid(`EVT${String(evtCounter++).padStart(21, '0')}`);

    const input: BulkUpdateInput = {
      ids: [TX1, TX1, TX1],
      categoryId: CAT_ID,
      correlationId: CORRELATION,
    };

    const deps = createTestDeps({
      now: () => new Date('2026-04-24T10:00:00Z'),
      newId,
      readModel: mockReadModel([tx1]),
    });

    const result = bulkUpdateTransactions(input, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toHaveLength(1);
  });

  it('clears categoryId when null is passed', () => {
    const tx1 = makeTx(TX1, { categoryId: CAT_ID });

    const input: BulkUpdateInput = {
      ids: [TX1],
      categoryId: null,
      correlationId: CORRELATION,
    };

    const deps = createTestDeps({
      now: () => new Date('2026-04-24T10:00:00Z'),
      readModel: mockReadModel([tx1]),
    });

    const result = bulkUpdateTransactions(input, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events[0]!.payload.categoryId).toBeNull();
  });

  it('replaces tagIds with replace-set semantics', () => {
    const tx1 = makeTx(TX1, { tagIds: [testUlid('TAG1')] });

    const input: BulkUpdateInput = {
      ids: [TX1],
      tagIds: [TAG_ID2, TAG_ID3],
      correlationId: CORRELATION,
    };

    const deps = createTestDeps({
      now: () => new Date('2026-04-24T10:00:00Z'),
      readModel: mockReadModel([tx1]),
    });

    const result = bulkUpdateTransactions(input, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events[0]!.payload.tagIds).toEqual([TAG_ID2, TAG_ID3]);
  });
});
