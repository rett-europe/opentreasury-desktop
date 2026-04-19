// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { listMovements } from './movementsApi.js';
import type {
  MovementRecord,
  MovementsFilter,
} from '../types/movementsFilter.js';

function stubList(result: MovementRecord[]): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue(result);
  (window as unknown as { opentreasury: unknown }).opentreasury = {
    movements: { list: fn },
  };
  return fn;
}

const SAMPLE: MovementRecord = {
  id: '01JABCDEF0123456789ABCDEFG',
  date: '2026-04-19',
  type: 'income',
  amount: 100,
  currency: 'EUR',
  description: 'Donation',
  accountId: '01JABCDEF0123456789ABCDEFG',
  categoryId: null,
  subcategoryId: null,
  tagIds: [],
  status: 'approved',
  createdAt: '2026-04-19T10:00:00.000Z',
};

describe('movementsApi.listMovements', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as unknown as { opentreasury?: unknown }).opentreasury;
  });

  it('forwards the filter and returns the records unchanged', async () => {
    const fn = stubList([SAMPLE]);
    const filter: MovementsFilter = {
      accountId: '01JABCDEF0123456789ABCDEFG',
      dateFrom: '2026-04-01',
      dateTo: '2026-04-30',
      limit: 50,
    };

    const result = await listMovements(filter);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(filter);
    expect(result).toEqual([SAMPLE]);
  });

  it('calls through with undefined when no filter is supplied', async () => {
    const fn = stubList([]);

    const result = await listMovements();

    expect(fn).toHaveBeenCalledWith(undefined);
    expect(result).toEqual([]);
  });
});
