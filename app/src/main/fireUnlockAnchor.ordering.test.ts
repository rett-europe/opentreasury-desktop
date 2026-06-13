// #379 — `fireUnlockAnchor` must run the timestamp drain strictly AFTER the
// anchor settles (so the anchor's signing key + entry are on disk before the
// drain reads them). The ordering lives in the exported pure helper
// `sequenceUnlockSideEffects`, which is what we pin here.

import { describe, it, expect, vi } from 'vitest';

// bootstrap.ts does `import { app } from 'electron'` at module top level.
vi.mock('electron', () => ({
  app: {
    getPath: () => '/should/not/be/used',
    getVersion: () => '0.0.0-test',
  },
}));

import { sequenceUnlockSideEffects } from './bootstrap.js';

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('#379 — sequenceUnlockSideEffects ordering', () => {
  it('starts the drain only after the anchor resolves', async () => {
    const events: string[] = [];
    const anchorGate = deferred<void>();

    const anchorNow = vi.fn(async () => {
      events.push('anchor:start');
      await anchorGate.promise;
      events.push('anchor:end');
    });
    const drainNow = vi.fn(async () => {
      events.push('drain:start');
    });

    const done = sequenceUnlockSideEffects(anchorNow, drainNow);

    // Anchor started, drain must NOT have started while the anchor is in flight.
    await Promise.resolve();
    expect(anchorNow).toHaveBeenCalledTimes(1);
    expect(drainNow).not.toHaveBeenCalled();

    anchorGate.resolve();
    await done;
    await Promise.resolve();

    expect(drainNow).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['anchor:start', 'anchor:end', 'drain:start']);
  });

  it('still runs the drain when the anchor rejects (best-effort, never throws)', async () => {
    const drainNow = vi.fn(async () => undefined);
    const anchorNow = vi.fn(async () => {
      throw new Error('anchor boom');
    });

    await expect(sequenceUnlockSideEffects(anchorNow, drainNow)).resolves.toBeUndefined();
    await Promise.resolve();

    expect(drainNow).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when both side-effects are absent', async () => {
    await expect(sequenceUnlockSideEffects(undefined, undefined)).resolves.toBeUndefined();
  });
});
