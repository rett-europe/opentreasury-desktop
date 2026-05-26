// Unit tests for buildPerfSeedEvents (Option B perf-seeder).
//
// Determinism is the single load-bearing invariant: tests/e2e/movements-perf
// uses two consecutive runs of the seeder to populate the same dataset for
// median measurements, and the median is only meaningful if both runs produce
// byte-identical events.

import { describe, it, expect } from 'vitest';
import { buildPerfSeedEvents, type PerfSeedDeps } from './devSeed';

const DEPS: PerfSeedDeps = {
  datasetId: '01TESTDATASETIDXXXXXXXXXXX',
  actorDeviceId: '01TESTDEVICEIDXXXXXXXXXXX',
  actorUserId: '01TESTUSERIDXXXXXXXXXXXXXX',
  txCount: 250,
};

describe('buildPerfSeedEvents', () => {
  it('emits the expected reference-data event counts', () => {
    const events = buildPerfSeedEvents({ ...DEPS, txCount: 0 });
    // 5 accounts + 8 categories + 25 subcategories (3+4+3+3+4+5+2+1) + 6 tags = 44
    expect(events.filter((e) => e.type === 'AccountCreated')).toHaveLength(5);
    expect(events.filter((e) => e.type === 'CategoryCreated')).toHaveLength(8);
    expect(events.filter((e) => e.type === 'SubcategoryCreated')).toHaveLength(25);
    expect(events.filter((e) => e.type === 'TagCreated')).toHaveLength(6);
    expect(events).toHaveLength(44);
  });

  it('emits exactly txCount tx.created events on top of the reference data', () => {
    const events = buildPerfSeedEvents({ ...DEPS, txCount: 1000 });
    expect(events.filter((e) => e.type === 'tx.created')).toHaveLength(1000);
    expect(events).toHaveLength(44 + 1000);
  });

  it('is byte-deterministic across two calls with the same inputs', () => {
    const a = buildPerfSeedEvents(DEPS);
    const b = buildPerfSeedEvents(DEPS);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('produces a different stream when the PRNG seed changes', () => {
    const a = buildPerfSeedEvents(DEPS);
    const b = buildPerfSeedEvents({ ...DEPS, prngSeed: 0xdeadbeef });
    // Reference data is deterministic regardless of seed, but tx payloads
    // diverge — the stringified streams must differ in full.
    expect(JSON.stringify(b)).not.toBe(JSON.stringify(a));
  });

  it('writes tx.created events with the WI-23 unified flat envelope', () => {
    const events = buildPerfSeedEvents({ ...DEPS, txCount: 3 });
    const txs = events.filter((e) => e.type === 'tx.created');
    expect(txs).toHaveLength(3);
    for (const evt of txs) {
      const e = evt as unknown as Record<string, unknown>;
      expect(typeof e['id']).toBe('string');
      expect((e['id'] as string).length).toBe(26);
      expect(e['datasetId']).toBe(DEPS.datasetId);
      expect(e['actorDeviceId']).toBe(DEPS.actorDeviceId);
      expect(e['actorUserId']).toBe(DEPS.actorUserId);
      expect(e['actorIdentitySource']).toBe('local');
      expect(e['dekVersion']).toBe(0);
      expect(e['version']).toBe(1);
      expect(typeof e['createdAt']).toBe('string');

      const payload = e['payload'] as Record<string, unknown>;
      expect(typeof payload['id']).toBe('string');
      expect((payload['id'] as string).length).toBe(26);
      expect(typeof payload['date']).toBe('string');
      expect(['income', 'expense']).toContain(payload['type']);
      expect(typeof payload['amount']).toBe('number');
      expect(payload['currency']).toBe('EUR');
      expect(typeof payload['accountId']).toBe('string');
      expect(typeof payload['categoryId']).toBe('string');
      expect(typeof payload['subcategoryId']).toBe('string');
      expect(Array.isArray(payload['tagIds'])).toBe(true);
      expect(['pending', 'approved']).toContain(payload['status']);
    }
  });

  it('rejects non-integer or negative txCount', () => {
    expect(() => buildPerfSeedEvents({ ...DEPS, txCount: -1 })).toThrow();
    expect(() => buildPerfSeedEvents({ ...DEPS, txCount: 1.5 })).toThrow();
    expect(() => buildPerfSeedEvents({ ...DEPS, txCount: Number.NaN })).toThrow();
  });
});
