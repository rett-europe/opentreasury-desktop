// Tests for the query:rehydrate IPC handler factory.

import { describe, it, expect, vi } from 'vitest';

import { createQueryRehydrateHandler } from './query.js';

describe('query:rehydrate handler', () => {
  it('returns the success payload from rehydrateFromDisk', async () => {
    const rehydrateFromDisk = vi
      .fn()
      .mockResolvedValue({ ok: true, eventCount: 5, durationMs: 12 });
    const handler = createQueryRehydrateHandler({ rehydrateFromDisk });

    const response = await handler({});

    expect(rehydrateFromDisk).toHaveBeenCalledTimes(1);
    expect(response).toEqual({ ok: true, eventCount: 5, durationMs: 12 });
  });

  it('returns the failure payload from rehydrateFromDisk', async () => {
    const rehydrateFromDisk = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'no_event_log', message: 'workspace locked' },
    });
    const handler = createQueryRehydrateHandler({ rehydrateFromDisk });

    const response = await handler({});

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error).toEqual({ code: 'no_event_log', message: 'workspace locked' });
    }
  });

  it('accepts undefined / empty request (no params channel)', async () => {
    const rehydrateFromDisk = vi.fn().mockResolvedValue({ ok: true, eventCount: 0, durationMs: 1 });
    const handler = createQueryRehydrateHandler({ rehydrateFromDisk });

    await expect(handler(undefined)).resolves.toMatchObject({ ok: true });
    await expect(handler({})).resolves.toMatchObject({ ok: true });
  });

  it('rejects unexpected request fields (strict schema)', async () => {
    const rehydrateFromDisk = vi.fn();
    const handler = createQueryRehydrateHandler({ rehydrateFromDisk });

    await expect(handler({ scope: 'movements' })).rejects.toThrow();
    expect(rehydrateFromDisk).not.toHaveBeenCalled();
  });

  it('throws if rehydrateFromDisk returns a malformed payload (response is validated)', async () => {
    const rehydrateFromDisk = vi.fn().mockResolvedValue({ ok: 'maybe' } as unknown as never);
    const handler = createQueryRehydrateHandler({ rehydrateFromDisk });

    await expect(handler({})).rejects.toThrow();
  });
});
