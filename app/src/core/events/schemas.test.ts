// WI-19 — backward-compatibility tests for DomainEvent schemas.
//
// Old events on the NDJSON log (written before WI-19) do NOT carry the new
// `reference` / `details` fields. The schemas must still validate those old
// events on replay, and reducers must backfill the missing fields to null
// when projecting into the read model.

import { describe, expect, it, beforeEach } from 'vitest';
import { transactionCreatedEventSchema, movementImportedEventSchema } from './schemas';
import { applyEvent, getReadModel, resetReadModel } from '../query/reducers';
import type { DomainEvent } from './schemas';

const ulid = (suffix: string): string => (suffix + '0'.repeat(26)).slice(0, 26).toUpperCase();

describe('transactionCreatedEventSchema — backward compatibility', () => {
  it('validates an event WITHOUT reference/details (pre-WI-19 shape)', () => {
    const legacyEvent = {
      id: ulid('EVT1'),
      type: 'tx.created' as const,
      datasetId: ulid('DS'),
      actorDeviceId: ulid('DV'),
      createdAt: '2026-04-01T00:00:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: {
        id: ulid('TX1'),
        date: '2026-04-01',
        type: 'income' as const,
        amount: 100,
        currency: 'EUR' as const,
        description: 'Pre-WI-19 event',
        accountId: ulid('ACC'),
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'approved' as const,
        createdAt: '2026-04-01T00:00:00.000Z',
      },
    };
    const parsed = transactionCreatedEventSchema.safeParse(legacyEvent);
    expect(parsed.success).toBe(true);
  });

  it('validates an event WITH reference/details (post-WI-19 shape)', () => {
    const newEvent = {
      id: ulid('EVT2'),
      type: 'tx.created' as const,
      datasetId: ulid('DS'),
      actorDeviceId: ulid('DV'),
      createdAt: '2026-04-20T00:00:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: {
        id: ulid('TX2'),
        date: '2026-04-20',
        type: 'income' as const,
        amount: 100,
        currency: 'EUR' as const,
        description: 'Post-WI-19',
        accountId: ulid('ACC'),
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'approved' as const,
        createdAt: '2026-04-20T00:00:00.000Z',
        reference: 'INV-42',
        details: 'Monthly donation',
      },
    };
    const parsed = transactionCreatedEventSchema.safeParse(newEvent);
    expect(parsed.success).toBe(true);
  });

  it('validates an event with explicit null for reference/details', () => {
    const newEvent = {
      id: ulid('EVT3'),
      type: 'tx.created' as const,
      datasetId: ulid('DS'),
      actorDeviceId: ulid('DV'),
      createdAt: '2026-04-20T00:00:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: {
        id: ulid('TX3'),
        date: '2026-04-20',
        type: 'expense' as const,
        amount: 50,
        currency: 'EUR' as const,
        description: 'Explicit null metadata',
        accountId: ulid('ACC'),
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'approved' as const,
        createdAt: '2026-04-20T00:00:00.000Z',
        reference: null,
        details: null,
      },
    };
    const parsed = transactionCreatedEventSchema.safeParse(newEvent);
    expect(parsed.success).toBe(true);
  });

  it('rejects reference longer than 120 chars on the wire', () => {
    const parsed = transactionCreatedEventSchema.safeParse({
      id: ulid('EVT4'),
      type: 'tx.created' as const,
      datasetId: ulid('DS'),
      actorDeviceId: ulid('DV'),
      createdAt: '2026-04-20T00:00:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: {
        id: ulid('TX4'),
        date: '2026-04-20',
        type: 'income' as const,
        amount: 1,
        currency: 'EUR' as const,
        description: 'x',
        accountId: ulid('ACC'),
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'approved' as const,
        createdAt: '2026-04-20T00:00:00.000Z',
        reference: 'x'.repeat(121),
      },
    });
    expect(parsed.success).toBe(false);
  });
});

describe('movementImportedEventSchema — backward compatibility', () => {
  it('validates an import event WITHOUT reference/details', () => {
    const legacyEvent = {
      type: 'movement.imported' as const,
      id: ulid('EVT5'),
      date: '2026-04-01',
      movementType: 'income' as const,
      amount: 100,
      currency: 'EUR' as const,
      description: 'Pre-WI-19 import',
      accountId: ulid('ACC'),
      categoryId: null,
      subcategoryId: null,
      tagIds: [],
      status: 'pending' as const,
      createdAt: '2026-04-01T00:00:00.000Z',
      rowHash: '0123456789abcdef',
      sourceFileName: 'old.csv',
      importBatchId: ulid('BATCH1'),
      rowIndex: 1,
    };
    const parsed = movementImportedEventSchema.safeParse(legacyEvent);
    expect(parsed.success).toBe(true);
  });

  it('validates an import event WITH reference/details', () => {
    const parsed = movementImportedEventSchema.safeParse({
      type: 'movement.imported' as const,
      id: ulid('EVT6'),
      date: '2026-04-20',
      movementType: 'expense' as const,
      amount: 10,
      currency: 'EUR' as const,
      description: 'new',
      accountId: ulid('ACC'),
      categoryId: null,
      subcategoryId: null,
      tagIds: [],
      status: 'pending' as const,
      createdAt: '2026-04-20T00:00:00.000Z',
      rowHash: 'fedcba9876543210',
      sourceFileName: 'new.csv',
      importBatchId: ulid('BATCH2'),
      rowIndex: 2,
      reference: 'INV-42',
      details: 'hello',
    });
    expect(parsed.success).toBe(true);
  });
});

describe('reducer — backfills missing reference/details to null', () => {
  beforeEach(() => {
    resetReadModel();
  });

  it('projects a pre-WI-19 tx.created event with reference=null details=null', () => {
    // Seed account first
    applyEvent({
      id: ulid('EVTAC'),
      type: 'account.created',
      datasetId: ulid('DS'),
      actorDeviceId: ulid('DV'),
      createdAt: '2026-04-01T00:00:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: {
        id: ulid('ACC'),
        bankName: 'X',
        bankNameShort: null,
        accountLabel: 'X',
        color: null,
        sortOrder: 0,
        isActive: true,
        createdAt: '2026-04-01T00:00:00.000Z',
      },
    } as DomainEvent);

    const legacy: DomainEvent = {
      id: ulid('EVTX'),
      type: 'tx.created',
      datasetId: ulid('DS'),
      actorDeviceId: ulid('DV'),
      createdAt: '2026-04-01T00:00:00.000Z',
      dekVersion: 0,
      version: 1,
      // Intentionally omit reference/details from the payload.
      payload: {
        id: ulid('TXOLD'),
        date: '2026-04-01',
        type: 'income',
        amount: 100,
        currency: 'EUR',
        description: 'Pre-WI-19',
        accountId: ulid('ACC'),
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'approved',
        createdAt: '2026-04-01T00:00:00.000Z',
      },
    } as DomainEvent;

    applyEvent(legacy);
    const tx = getReadModel().transactions[0];
    expect(tx?.reference).toBeNull();
    expect(tx?.details).toBeNull();
  });

  it('indexes transactions by reference when set', () => {
    applyEvent({
      id: ulid('EVTAC2'),
      type: 'account.created',
      datasetId: ulid('DS'),
      actorDeviceId: ulid('DV'),
      createdAt: '2026-04-01T00:00:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: {
        id: ulid('ACC2'),
        bankName: 'X',
        bankNameShort: null,
        accountLabel: 'X',
        color: null,
        sortOrder: 0,
        isActive: true,
        createdAt: '2026-04-01T00:00:00.000Z',
      },
    } as DomainEvent);

    const withRef: DomainEvent = {
      id: ulid('EVTR'),
      type: 'tx.created',
      datasetId: ulid('DS'),
      actorDeviceId: ulid('DV'),
      createdAt: '2026-04-20T00:00:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: {
        id: ulid('TXREF'),
        date: '2026-04-20',
        type: 'income',
        amount: 100,
        currency: 'EUR',
        description: 'with ref',
        accountId: ulid('ACC2'),
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'approved',
        createdAt: '2026-04-20T00:00:00.000Z',
        reference: 'INV-42',
        details: null,
      },
    } as DomainEvent;

    applyEvent(withRef);
    const idx = getReadModel().transactionsByReference;
    expect(idx.get('INV-42')).toHaveLength(1);
    expect(idx.get('INV-42')?.[0]?.reference).toBe('INV-42');
  });
});
