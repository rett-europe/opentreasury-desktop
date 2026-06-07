// Unit tests for buildPerfSeedEvents (Option B perf-seeder).
//
// Determinism is the single load-bearing invariant: tests/e2e/movements-perf
// uses two consecutive runs of the seeder to populate the same dataset for
// median measurements, and the median is only meaningful if both runs produce
// byte-identical events.

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { buildPerfSeedEvents, txCreatedAt, type PerfSeedDeps } from './devSeed';

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

describe('txCreatedAt', () => {
  // Regression for the seconds-overflow bug: encoding a global row ordinal into
  // the seconds field produced invalid ISO strings (e.g. `...T12:00:159.000Z`)
  // once the merged seed grew past 60 rows, which then crashed transaction:update
  // when the read model preserved the corrupt createdAt. Every ordinal must yield
  // a string that passes z.string().datetime().
  const iso = z.string().datetime();

  it('produces a valid ISO datetime for ordinals beyond the seconds range', () => {
    for (const ordinal of [0, 1, 59, 60, 61, 159, 200, 3599, 3600, 86399]) {
      const value = txCreatedAt('2026-04-29', ordinal);
      expect(iso.safeParse(value).success).toBe(true);
    }
  });

  it('stays monotonic with ordinal within a day so DESC sort mirrors seed order', () => {
    const a = txCreatedAt('2026-04-29', 60);
    const b = txCreatedAt('2026-04-29', 159);
    const c = txCreatedAt('2026-04-29', 200);
    expect(a < b).toBe(true);
    expect(b < c).toBe(true);
  });

  it('keeps the given calendar date', () => {
    expect(txCreatedAt('2026-04-29', 159).startsWith('2026-04-29T')).toBe(true);
  });
});
