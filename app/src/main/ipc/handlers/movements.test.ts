// WI-12 — movements:list handler integration tests.

import { describe, it, expect, beforeEach } from 'vitest';
import { createMovementsListHandler } from './movements';
import type { DomainEvent } from '../../../core/eventLog/EventLog';
import { getReadModel, replayEvents, resetReadModel } from '../../../core/query/reducers';
import { testUlid } from '../../../core/test-helpers';

const DATASET_ID = testUlid('DATASET');
const DEVICE_ID = testUlid('DEVICE');
const ACCOUNT_ID = testUlid('ACC1');
const CAT_ID = testUlid('CAT1');
const SUB_ID = testUlid('SUB1');
const TAG_ID = testUlid('TAG1');

function seed(): void {
  const events: DomainEvent[] = [
    {
      id: testUlid('EA1'),
      type: 'account.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: '2026-01-01T00:00:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: {
        id: ACCOUNT_ID,
        bankName: 'Caixa',
        bankNameShort: 'CX',
        accountLabel: 'Operativa',
        color: null,
        sortOrder: 0,
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    },
    {
      id: testUlid('ECAT1'),
      type: 'category.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: '2026-01-01T00:00:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: {
        id: CAT_ID,
        name: 'Donaciones',
        description: null,
        categoryType: 'income',
        sortOrder: 0,
        isActive: true,
        subcategories: [{ id: SUB_ID, name: 'Individuales', isActive: true }],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    },
    {
      id: testUlid('ETAG1'),
      type: 'tag.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: '2026-01-01T00:00:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: {
        id: TAG_ID,
        name: 'Campaign-A',
        color: null,
        sortOrder: 0,
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    },
    {
      id: testUlid('ETX1'),
      type: 'tx.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: '2026-04-10T12:00:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: {
        id: testUlid('TX1'),
        date: '2026-04-10',
        type: 'income',
        amount: 100,
        currency: 'EUR',
        description: 'First',
        accountId: ACCOUNT_ID,
        categoryId: CAT_ID,
        subcategoryId: SUB_ID,
        tagIds: [TAG_ID],
        status: 'approved',
        createdAt: '2026-04-10T12:00:00.000Z',
      },
    },
    {
      id: testUlid('ETX2'),
      type: 'tx.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: '2026-04-15T12:00:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: {
        id: testUlid('TX2'),
        date: '2026-04-15',
        type: 'expense',
        amount: 42,
        currency: 'EUR',
        description: 'Second',
        accountId: ACCOUNT_ID,
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'pending',
        createdAt: '2026-04-15T12:00:00.000Z',
      },
    },
  ];
  replayEvents(events);
}

describe('movements:list handler', () => {
  beforeEach(() => {
    resetReadModel();
    seed();
  });

  it('returns all transactions projected into MovementRecord shape, DESC by date', async () => {
    const handle = createMovementsListHandler({ getReadModel });
    const movements = await handle({});

    expect(movements).toHaveLength(2);
    // DESC order — most recent first
    expect(movements[0]!.date).toBe('2026-04-15');
    expect(movements[0]!.description).toBe('Second');
    expect(movements[0]!.accountId).toBe(ACCOUNT_ID);
    expect(movements[0]!.categoryId).toBeNull();
    expect(movements[0]!.tagIds).toEqual([]);
    expect(movements[0]!.createdAt).toBe('2026-04-15T12:00:00.000Z');

    expect(movements[1]!.date).toBe('2026-04-10');
    expect(movements[1]!.categoryId).toBe(CAT_ID);
    expect(movements[1]!.subcategoryId).toBe(SUB_ID);
    expect(movements[1]!.tagIds).toEqual([TAG_ID]);
    expect(movements[1]!.status).toBe('approved');
  });

  it('respects accountId filter', async () => {
    const handle = createMovementsListHandler({ getReadModel });
    const movements = await handle({ accountId: testUlid('OTHER') });
    expect(movements).toHaveLength(0);
  });

  it('respects dateFrom / dateTo filters', async () => {
    const handle = createMovementsListHandler({ getReadModel });
    const onlyRecent = await handle({ dateFrom: '2026-04-12' });
    expect(onlyRecent).toHaveLength(1);
    expect(onlyRecent[0]!.date).toBe('2026-04-15');

    const onlyOld = await handle({ dateTo: '2026-04-12' });
    expect(onlyOld).toHaveLength(1);
    expect(onlyOld[0]!.date).toBe('2026-04-10');
  });

  it('applies limit / offset', async () => {
    const handle = createMovementsListHandler({ getReadModel });
    const first = await handle({ limit: 1 });
    expect(first).toHaveLength(1);
    expect(first[0]!.date).toBe('2026-04-15');

    const second = await handle({ limit: 1, offset: 1 });
    expect(second).toHaveLength(1);
    expect(second[0]!.date).toBe('2026-04-10');
  });

  it('accepts undefined request (no-filter case)', async () => {
    const handle = createMovementsListHandler({ getReadModel });
    const movements = await handle(undefined);
    expect(movements).toHaveLength(2);
  });
});
