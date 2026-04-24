// WI-31a: bulkUpdateTransactions command tests

import { describe, it, expect } from 'vitest';
import { bulkUpdateTransactions, type BulkUpdateInput } from './bulkUpdateTransactions';
import type { ReadModel } from '../query/types';

const mockReadModel = (transactions: ReadModel['transactions'] = []): ReadModel => ({
  transactions,
  accounts: [
    {
      id: '01234567890123456789012345',
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
  accountId: '01234567890123456789012345',
  categoryId: null,
  subcategoryId: null,
  tagIds: [] as readonly string[],
  status: 'approved' as const,
  createdAt: '2026-04-01T00:00:00Z',
  reference: null,
  details: null,
  ...overrides,
});

const TX1 = 'tx001234567890123456789012';
const TX2 = 'tx002345678901234567890123';
const TX3 = 'tx003456789012345678901234';
const CORRELATION = 'cor00000000000000000000000';

describe('bulkUpdateTransactions', () => {
  it('happy path — updates N=3 transactions', () => {
    const now = new Date('2026-04-24T10:00:00Z');
    const tx1 = makeTx(TX1);
    const tx2 = makeTx(TX2, { description: 'Second tx' });
    const tx3 = makeTx(TX3, { description: 'Third tx' });

    let evtCounter = 0;
    const newId = () => `evt${String(evtCounter++).padStart(23, '0')}`;

    const input: BulkUpdateInput = {
      ids: [TX1, TX2, TX3],
      categoryId: 'cat00000000000000000000000',
      status: 'pending',
      correlationId: CORRELATION,
    };

    const result = bulkUpdateTransactions(input, {
      now: () => now,
      newId,
      readModel: mockReadModel([tx1, tx2, tx3]),
      datasetId: 'ds000000000000000000000000',
      actorDeviceId: 'dev00000000000000000000000',
      dekVersion: 1,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toHaveLength(3);

    // All events carry the same correlationId
    for (const event of result.events) {
      expect(event.payload.correlationId).toBe(CORRELATION);
      expect(event.payload.categoryId).toBe('cat00000000000000000000000');
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
      categoryId: 'cat00000000000000000000000',
      correlationId: CORRELATION,
    };

    const result = bulkUpdateTransactions(input, {
      now: () => new Date(),
      newId: () => 'evt00000000000000000000000',
      readModel: mockReadModel([tx1, tx3]),
      datasetId: 'ds000000000000000000000000',
      actorDeviceId: 'dev00000000000000000000000',
    });

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

    const result = bulkUpdateTransactions(input, {
      now: () => new Date(),
      newId: () => 'evt00000000000000000000000',
      readModel: mockReadModel([]),
      datasetId: 'ds000000000000000000000000',
      actorDeviceId: 'dev00000000000000000000000',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.code).toBe('EMPTY_IDS');
  });

  it('returns TX_NOT_FOUND for unknown id', () => {
    const input: BulkUpdateInput = {
      ids: ['nonexistent00000000000000'],
      correlationId: CORRELATION,
    };

    const result = bulkUpdateTransactions(input, {
      now: () => new Date(),
      newId: () => 'evt00000000000000000000000',
      readModel: mockReadModel([]),
      datasetId: 'ds000000000000000000000000',
      actorDeviceId: 'dev00000000000000000000000',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.code).toBe('TX_NOT_FOUND');
  });

  it('correlationId is uniform across all events', () => {
    const tx1 = makeTx(TX1);
    const tx2 = makeTx(TX2);

    let evtCounter = 0;
    const newId = () => `evt${String(evtCounter++).padStart(23, '0')}`;

    const input: BulkUpdateInput = {
      ids: [TX1, TX2],
      correlationId: CORRELATION,
    };

    const result = bulkUpdateTransactions(input, {
      now: () => new Date('2026-04-24T10:00:00Z'),
      newId,
      readModel: mockReadModel([tx1, tx2]),
      datasetId: 'ds000000000000000000000000',
      actorDeviceId: 'dev00000000000000000000000',
    });

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
      categoryId: 'cat00000000000000000000000',
      correlationId: CORRELATION,
    };

    const result = bulkUpdateTransactions(input, {
      now: () => new Date('2026-04-24T10:00:00Z'),
      newId: () => 'evt00000000000000000000000',
      readModel: mockReadModel([tx1]),
      datasetId: 'ds000000000000000000000000',
      actorDeviceId: 'dev00000000000000000000000',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const payload = result.events[0]!.payload;
    expect(payload.date).toBe('2026-03-15');
    expect(payload.type).toBe('income');
    expect(payload.amount).toBe(500);
    expect(payload.description).toBe('Original description');
    expect(payload.reference).toBe('REF-001');
    expect(payload.details).toBe('Original details');
    expect(payload.accountId).toBe('01234567890123456789012345');
    expect(payload.createdAt).toBe('2026-04-01T00:00:00Z');
    // Only categoryId was changed
    expect(payload.categoryId).toBe('cat00000000000000000000000');
  });

  it('dedupes ids (no duplicate events)', () => {
    const tx1 = makeTx(TX1);

    let evtCounter = 0;
    const newId = () => `evt${String(evtCounter++).padStart(23, '0')}`;

    const input: BulkUpdateInput = {
      ids: [TX1, TX1, TX1],
      categoryId: 'cat00000000000000000000000',
      correlationId: CORRELATION,
    };

    const result = bulkUpdateTransactions(input, {
      now: () => new Date('2026-04-24T10:00:00Z'),
      newId,
      readModel: mockReadModel([tx1]),
      datasetId: 'ds000000000000000000000000',
      actorDeviceId: 'dev00000000000000000000000',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toHaveLength(1);
  });

  it('clears categoryId when null is passed', () => {
    const tx1 = makeTx(TX1, { categoryId: 'cat00000000000000000000000' });

    const input: BulkUpdateInput = {
      ids: [TX1],
      categoryId: null,
      correlationId: CORRELATION,
    };

    const result = bulkUpdateTransactions(input, {
      now: () => new Date('2026-04-24T10:00:00Z'),
      newId: () => 'evt00000000000000000000000',
      readModel: mockReadModel([tx1]),
      datasetId: 'ds000000000000000000000000',
      actorDeviceId: 'dev00000000000000000000000',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events[0]!.payload.categoryId).toBeNull();
  });

  it('replaces tagIds with replace-set semantics', () => {
    const tx1 = makeTx(TX1, { tagIds: ['tag00000000000000000000001'] });

    const input: BulkUpdateInput = {
      ids: [TX1],
      tagIds: ['tag00000000000000000000002', 'tag00000000000000000000003'],
      correlationId: CORRELATION,
    };

    const result = bulkUpdateTransactions(input, {
      now: () => new Date('2026-04-24T10:00:00Z'),
      newId: () => 'evt00000000000000000000000',
      readModel: mockReadModel([tx1]),
      datasetId: 'ds000000000000000000000000',
      actorDeviceId: 'dev00000000000000000000000',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events[0]!.payload.tagIds).toEqual([
      'tag00000000000000000000002',
      'tag00000000000000000000003',
    ]);
  });
});
