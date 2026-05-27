// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { rehydrate } from './queryApi.js';
import type { QueryRehydrateResponse } from '../../shared/ipc-contracts/query.js';

function stubRehydrate(result: QueryRehydrateResponse): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue(result);
  (window as unknown as { opentreasury: unknown }).opentreasury = {
    query: { rehydrate: fn },
  };
  return fn;
}

describe('queryApi.rehydrate', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as unknown as { opentreasury?: unknown }).opentreasury;
  });

  it('passes through the success response from the IPC bridge', async () => {
    const fn = stubRehydrate({ ok: true, eventCount: 42, durationMs: 12 });

    const result = await rehydrate();

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith();
    expect(result).toEqual({ ok: true, eventCount: 42, durationMs: 12 });
  });

  it('passes through the failure response from the IPC bridge', async () => {
    stubRehydrate({
      ok: false,
      error: { code: 'rehydrate_failed', message: 'disk gone' },
    });

    const result = await rehydrate();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ code: 'rehydrate_failed', message: 'disk gone' });
    }
  });
});
