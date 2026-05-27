// Tests for `createRehydrateReadModelFromDisk` — single-flight behavior,
// success/error result shapes, and post-flight reset so subsequent callers
// can trigger a fresh rehydrate after a previous one settles.

import { describe, it, expect, vi } from 'vitest';

import { createRehydrateReadModelFromDisk } from './rehydrate.js';
import type { DomainEvent } from '../../core/eventLog/EventLog.js';

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createRehydrateReadModelFromDisk', () => {
  it('returns ok with eventCount + durationMs on success', async () => {
    const events: DomainEvent[] = [];
    const replay = vi.fn();
    let ticks = 0;
    const rehydrate = createRehydrateReadModelFromDisk({
      eventLog: { load: vi.fn().mockResolvedValue(events) },
      replayEvents: replay,
      now: () => ticks++ * 10, // 0, 10, 20, ...
    });

    const result = await rehydrate();

    expect(result).toEqual({ ok: true, eventCount: 0, durationMs: 10 });
    expect(replay).toHaveBeenCalledTimes(1);
    expect(replay).toHaveBeenCalledWith(events);
  });

  it('forwards events from load() into replayEvents()', async () => {
    const events: DomainEvent[] = [
      // Shape doesn't matter for this test — replayEvents is mocked.
      { id: 'e1' } as unknown as DomainEvent,
      { id: 'e2' } as unknown as DomainEvent,
    ];
    const replay = vi.fn();
    const rehydrate = createRehydrateReadModelFromDisk({
      eventLog: { load: vi.fn().mockResolvedValue(events) },
      replayEvents: replay,
    });

    const result = await rehydrate();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.eventCount).toBe(2);
    }
    expect(replay).toHaveBeenCalledWith(events);
  });

  it('returns ok:false with code+message when load() rejects', async () => {
    const replay = vi.fn();
    const rehydrate = createRehydrateReadModelFromDisk({
      eventLog: { load: vi.fn().mockRejectedValue(new Error('disk gone')) },
      replayEvents: replay,
    });

    const result = await rehydrate();

    expect(result).toEqual({
      ok: false,
      error: { code: 'rehydrate_failed', message: 'disk gone' },
    });
    expect(replay).not.toHaveBeenCalled();
  });

  it('stringifies non-Error rejections so the renderer always gets a message', async () => {
    const rehydrate = createRehydrateReadModelFromDisk({
      eventLog: { load: vi.fn().mockRejectedValue('plain string error') },
      replayEvents: vi.fn(),
    });

    const result = await rehydrate();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('plain string error');
      expect(result.error.code).toBe('rehydrate_failed');
    }
  });

  it('single-flights concurrent calls — one load() per in-flight window', async () => {
    const gate = deferred<DomainEvent[]>();
    const load = vi.fn().mockReturnValue(gate.promise);
    const replay = vi.fn();
    const rehydrate = createRehydrateReadModelFromDisk({
      eventLog: { load },
      replayEvents: replay,
    });

    const a = rehydrate();
    const b = rehydrate();
    const c = rehydrate();

    expect(load).toHaveBeenCalledTimes(1);

    gate.resolve([]);
    const [ra, rb, rc] = await Promise.all([a, b, c]);

    expect(ra).toBe(rb);
    expect(rb).toBe(rc);
    expect(ra.ok).toBe(true);
    // replayEvents runs exactly once even though three callers awaited.
    expect(replay).toHaveBeenCalledTimes(1);
  });

  it('allows a new flight after the previous one settles', async () => {
    const events1: DomainEvent[] = [];
    const events2: DomainEvent[] = [{ id: 'e1' } as unknown as DomainEvent];
    const load = vi.fn().mockResolvedValueOnce(events1).mockResolvedValueOnce(events2);
    const replay = vi.fn();
    const rehydrate = createRehydrateReadModelFromDisk({
      eventLog: { load },
      replayEvents: replay,
    });

    const first = await rehydrate();
    const second = await rehydrate();

    expect(load).toHaveBeenCalledTimes(2);
    expect(replay).toHaveBeenCalledTimes(2);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok) expect(first.eventCount).toBe(0);
    if (second.ok) expect(second.eventCount).toBe(1);
  });

  it('allows a new flight after a failed flight settles', async () => {
    const events: DomainEvent[] = [];
    const load = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(events);
    const replay = vi.fn();
    const rehydrate = createRehydrateReadModelFromDisk({
      eventLog: { load },
      replayEvents: replay,
    });

    const first = await rehydrate();
    expect(first.ok).toBe(false);

    const second = await rehydrate();
    expect(second.ok).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
    expect(replay).toHaveBeenCalledTimes(1); // only the successful flight
  });
});
