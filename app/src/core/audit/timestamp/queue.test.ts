// SPEC-028 WI-5 (#362) — advisory queue model tests.
//
// `findPendingAnchors` is derived purely from the chain (anchors ∖ receipts), so
// a lost queue file is harmless. Also covers the backoff math and the in-memory
// retry-state bookkeeping.

import { describe, it, expect } from 'vitest';

import {
  findPendingAnchors,
  nextBackoffMs,
  DEFAULT_BACKOFF,
  TimestampRetryState,
} from './queue.js';
import { anchorMessageImprintHex } from './imprint.js';
import { canonicalHashHex } from '../../crypto/hash.js';
import { memStore, makeAuditLog, makeMk, appendTestAnchor, newTestUlid } from '../audit.testkit.js';

describe('findPendingAnchors (reconcile-from-chain)', () => {
  it('returns every anchor when no receipts exist', async () => {
    const log = makeAuditLog(memStore(), makeMk());
    const a1 = await appendTestAnchor(log, '1'.repeat(64));
    const a2 = await appendTestAnchor(log, '2'.repeat(64));
    const pending = findPendingAnchors(await log.readAll());
    expect(pending.map((p) => p.anchorSeq).sort()).toEqual([a1.seq, a2.seq].sort());
  });

  it('drops an anchor once a receipt references it', async () => {
    const store = memStore();
    const log = makeAuditLog(store, makeMk());
    const a1 = await appendTestAnchor(log, '1'.repeat(64));
    const a2 = await appendTestAnchor(log, '2'.repeat(64));

    // Append a receipt covering a1 (token payload is opaque to the queue).
    await log.appendTimestamp({
      targetId: newTestUlid(),
      providerId: 'test',
      anchorSeq: a1.seq,
      anchorEntryHash: canonicalHashHex(a1),
      eventLogRoot: a1.after_hash!,
      imprintAlg: 'sha256',
      messageImprint: anchorMessageImprintHex(a1),
      tsaNonce: 'ab',
      tsaToken: Buffer.from('opaque').toString('base64'),
      tsaGenTime: '2026-01-01T00:00:00.000Z',
      tsaSerialNumber: '01',
    });

    const pending = findPendingAnchors(await log.readAll());
    expect(pending.map((p) => p.anchorSeq)).toEqual([a2.seq]);
  });

  it('exposes the join key + event_log_root for each pending anchor', async () => {
    const log = makeAuditLog(memStore(), makeMk());
    const a1 = await appendTestAnchor(log, '7'.repeat(64));
    const [p] = findPendingAnchors(await log.readAll());
    expect(p!.anchorEntryHash).toBe(canonicalHashHex(a1));
    expect(p!.eventLogRoot).toBe('7'.repeat(64));
  });
});

describe('nextBackoffMs', () => {
  it('is zero before the first failure', () => {
    expect(nextBackoffMs(0)).toBe(0);
  });

  it('grows exponentially from the base', () => {
    expect(nextBackoffMs(1)).toBe(DEFAULT_BACKOFF.baseMs);
    expect(nextBackoffMs(2)).toBe(DEFAULT_BACKOFF.baseMs * 2);
    expect(nextBackoffMs(3)).toBe(DEFAULT_BACKOFF.baseMs * 4);
  });

  it('is clamped to the cap', () => {
    expect(nextBackoffMs(100)).toBe(DEFAULT_BACKOFF.capMs);
  });
});

describe('TimestampRetryState', () => {
  it('is eligible for an unseen seq', () => {
    const s = new TimestampRetryState();
    expect(s.eligible(1, 1000)).toBe(true);
  });

  it('backs off after a failure then becomes eligible again', () => {
    const s = new TimestampRetryState({ baseMs: 1000, capMs: 10_000 });
    s.recordFailure(1, 'unreachable', 0);
    expect(s.eligible(1, 500)).toBe(false); // within the 1s window
    expect(s.eligible(1, 1000)).toBe(true); // window elapsed
    expect(s.get(1)?.attempts).toBe(1);
    expect(s.get(1)?.lastError).toBe('unreachable');
  });

  it('clear() forgets a seq', () => {
    const s = new TimestampRetryState();
    s.recordFailure(2, 'timeout', 0);
    s.clear(2);
    expect(s.get(2)).toBeUndefined();
    expect(s.eligible(2, 0)).toBe(true);
  });
});
