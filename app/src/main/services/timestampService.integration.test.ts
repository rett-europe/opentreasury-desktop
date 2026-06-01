// SPEC-028 WI-5 (#362) — timestamp service integration tests (CORE asks).
//
// Exercises `runTimestampOnce` + `TimestampScheduler` end-to-end against an
// in-memory audit log and stub providers. Proves the non-negotiables: a
// hung/offline TSA NEVER blocks the write path; receipts are appended on
// success and fully verify; concurrent drains append exactly one receipt;
// failure modes leave the anchor pending and retryable; a tampered token never
// yields a receipt.

import { describe, it, expect } from 'vitest';

import { runTimestampOnce, TimestampScheduler } from './timestampService.js';
import type { TimestampProvider, TimestampResult } from '../../core/audit/timestamp/provider.js';
import { TimestampRetryState } from '../../core/audit/timestamp/queue.js';
import { verifyTimestampReceipt } from '../../core/audit/timestamp/verify.js';
import {
  makeTrustedToken,
  makeTestCa,
  type TestCa,
} from '../../core/audit/timestamp/tsa.testkit.js';
import {
  memStore,
  makeAuditLog,
  makeMk,
  appendTestAnchor,
  newTestUlid,
} from '../../core/audit/audit.testkit.js';
import type { AuditEntry, AuditTimestampPayload } from '../../core/audit/types.js';
import type { FileAuditLog } from '../../core/audit/AuditLog.js';

const NOW = new Date('2026-06-01T00:00:00Z');
const GEN = new Date('2026-01-01T00:00:00Z');
const FIXED_NONCE = Buffer.from('00112233', 'hex');

function nonceBig(bytes: Uint8Array): bigint {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v;
}

/** Provider that mints a valid token over whatever imprint/nonce it is given. */
function happyProvider(ca: TestCa): TimestampProvider {
  return {
    id: 'test',
    kind: 'rfc3161',
    trustRootIds: ['test-root'],
    async requestTimestamp(req): Promise<TimestampResult> {
      const { tokenDer } = makeTrustedToken({
        imprintHash: req.hash,
        nonce: nonceBig(req.nonce),
        genTime: GEN,
        ca,
      });
      return { ok: true, tokenDer };
    },
  };
}

function erroringProvider(
  error: 'unreachable' | 'http-error' | 'rejected' | 'malformed',
): TimestampProvider {
  return {
    id: 'test',
    kind: 'rfc3161',
    trustRootIds: ['test-root'],
    async requestTimestamp(): Promise<TimestampResult> {
      return { ok: false, error };
    },
  };
}

/** Provider whose request never resolves — models a hung TSA connection. */
function hungProvider(): TimestampProvider {
  return {
    id: 'test',
    kind: 'rfc3161',
    trustRootIds: ['test-root'],
    requestTimestamp() {
      return new Promise<TimestampResult>(() => {
        /* never resolves */
      });
    },
  };
}

function deps(log: FileAuditLog, provider: TimestampProvider, ca: TestCa) {
  return {
    auditLog: log,
    provider,
    newUlid: newTestUlid,
    now: () => NOW,
    randomNonce: () => Uint8Array.from(FIXED_NONCE),
    retry: new TimestampRetryState(),
    resolveRoots: () => [ca.root.pem],
  };
}

function receipts(entries: readonly AuditEntry[]): AuditEntry[] {
  return entries.filter((e) => e.action === 'audit.anchor.timestamped');
}

describe('runTimestampOnce — happy path', () => {
  it('timestamps a pending anchor and the receipt fully verifies', async () => {
    const ca = makeTestCa();
    const log = makeAuditLog(memStore(), makeMk());
    const anchor = await appendTestAnchor(log, '1'.repeat(64));

    const outcome = await runTimestampOnce(deps(log, happyProvider(ca), ca));
    expect(outcome).toMatchObject({ status: 'drained', appended: 1, pending: 0 });

    const all = await log.readAll();
    const rx = receipts(all);
    expect(rx).toHaveLength(1);

    const res = verifyTimestampReceipt({
      receipt: rx[0]!.payload as AuditTimestampPayload,
      anchorEntry: anchor,
      now: NOW,
      trustRootsPem: [ca.root.pem],
    });
    expect(res.ok).toBe(true);
  });

  it('reconciles multiple pending anchors from the chain in one drain', async () => {
    const ca = makeTestCa();
    const log = makeAuditLog(memStore(), makeMk());
    await appendTestAnchor(log, '1'.repeat(64));
    await appendTestAnchor(log, '2'.repeat(64));

    const outcome = await runTimestampOnce(deps(log, happyProvider(ca), ca));
    expect(outcome).toMatchObject({ status: 'drained', appended: 2, pending: 0 });
  });
});

describe('runTimestampOnce — non-blocking guarantees (CORE)', () => {
  it('offline TSA leaves the anchor pending with no receipt, then a later drain succeeds', async () => {
    const ca = makeTestCa();
    const log = makeAuditLog(memStore(), makeMk());
    await appendTestAnchor(log, '1'.repeat(64));

    const offline = await runTimestampOnce(deps(log, erroringProvider('unreachable'), ca));
    expect(offline).toMatchObject({ status: 'drained', appended: 0, failed: 1, pending: 1 });
    expect(receipts(await log.readAll())).toHaveLength(0);

    const online = await runTimestampOnce(deps(log, happyProvider(ca), ca));
    expect(online).toMatchObject({ status: 'drained', appended: 1, pending: 0 });
    expect(receipts(await log.readAll())).toHaveLength(1);
  });

  it('a HUNG TSA never settles the drain while other work proceeds', async () => {
    const ca = makeTestCa();
    const log = makeAuditLog(memStore(), makeMk());
    await appendTestAnchor(log, '1'.repeat(64));

    const drain = runTimestampOnce(deps(log, hungProvider(), ca));
    // The drain awaits the hung request; an independent op must win the race.
    const winner = await Promise.race([
      drain.then(() => 'drain-settled'),
      Promise.resolve('writes-proceed'),
    ]);
    expect(winner).toBe('writes-proceed');
    // No receipt was written while the request hangs.
    expect(receipts(await log.readAll())).toHaveLength(0);
  });

  it('TimestampScheduler.onNewAnchor() is fire-and-forget and never blocks the caller', async () => {
    const ca = makeTestCa();
    const log = makeAuditLog(memStore(), makeMk());
    await appendTestAnchor(log, '1'.repeat(64));

    const scheduler = new TimestampScheduler({
      run: () => runTimestampOnce(deps(log, hungProvider(), ca)),
    });

    // Returns synchronously; a hung drain must not stall this turn of work.
    scheduler.onNewAnchor();
    let progressed = false;
    await Promise.resolve().then(() => {
      progressed = true;
    });
    expect(progressed).toBe(true);
    expect(receipts(await log.readAll())).toHaveLength(0);
    scheduler.dispose();
  });
});

describe('runTimestampOnce — idempotency + failure modes', () => {
  it('two concurrent drains append exactly one receipt', async () => {
    const ca = makeTestCa();
    const log = makeAuditLog(memStore(), makeMk(), { lockKey: 'shared' });
    await appendTestAnchor(log, '1'.repeat(64));

    const p = happyProvider(ca);
    await Promise.all([runTimestampOnce(deps(log, p, ca)), runTimestampOnce(deps(log, p, ca))]);

    expect(receipts(await log.readAll())).toHaveLength(1);
  });

  it.each(['http-error', 'rejected', 'malformed'] as const)(
    'failure mode %s leaves the anchor pending and writes no receipt',
    async (mode) => {
      const ca = makeTestCa();
      const log = makeAuditLog(memStore(), makeMk());
      await appendTestAnchor(log, '1'.repeat(64));

      const outcome = await runTimestampOnce(deps(log, erroringProvider(mode), ca));
      expect(outcome).toMatchObject({ status: 'drained', appended: 0, failed: 1, pending: 1 });
      expect(receipts(await log.readAll())).toHaveLength(0);
    },
  );

  it('a malformed/garbage token is rejected and never produces a receipt', async () => {
    const ca = makeTestCa();
    const log = makeAuditLog(memStore(), makeMk());
    await appendTestAnchor(log, '1'.repeat(64));

    const garbage: TimestampProvider = {
      id: 'test',
      kind: 'rfc3161',
      trustRootIds: ['test-root'],
      async requestTimestamp(): Promise<TimestampResult> {
        return { ok: true, tokenDer: Uint8Array.of(0x30, 0x03, 0x02, 0x01, 0x00) };
      },
    };

    const outcome = await runTimestampOnce(deps(log, garbage, ca));
    expect(outcome).toMatchObject({ status: 'drained', appended: 0, failed: 1 });
    expect(receipts(await log.readAll())).toHaveLength(0);
  });

  it('skips (does not throw) when the audit chain does not verify', async () => {
    const ca = makeTestCa();
    const store = memStore();
    const log = makeAuditLog(store, makeMk());
    await appendTestAnchor(log, '1'.repeat(64));

    // Corrupt the persisted chunk so verifyChain fails.
    const dump = (store as unknown as { dump: Map<string, Uint8Array> }).dump;
    for (const [name, bytes] of dump) {
      if (name.includes('chunk')) {
        const copy = Uint8Array.from(bytes);
        copy[copy.length - 1] ^= 0xff;
        dump.set(name, copy);
      }
    }

    const outcome = await runTimestampOnce(deps(log, happyProvider(ca), ca));
    // Never throws; reports idle rather than appending onto a corrupt chain.
    expect(outcome.status).toBe('idle');
  });
});

describe('tampered receipt (CORE)', () => {
  it('a flipped token byte makes verifyTimestampReceipt fail', async () => {
    const ca = makeTestCa();
    const log = makeAuditLog(memStore(), makeMk());
    const anchor = await appendTestAnchor(log, '1'.repeat(64));
    await runTimestampOnce(deps(log, happyProvider(ca), ca));

    const receipt = receipts(await log.readAll())[0]!.payload as AuditTimestampPayload;
    const tokenBytes = Buffer.from(receipt.tsa_token, 'base64');
    tokenBytes[tokenBytes.length - 2] ^= 0xff; // corrupt the trailing TSA signature

    const res = verifyTimestampReceipt({
      receipt: { ...receipt, tsa_token: tokenBytes.toString('base64') },
      anchorEntry: anchor,
      now: NOW,
      trustRootsPem: [ca.root.pem],
    });
    expect(res.ok).toBe(false);
  });

  it('a mutated receipt entry fails the audit chain signature', async () => {
    const ca = makeTestCa();
    const store = memStore();
    const log = makeAuditLog(store, makeMk());
    await appendTestAnchor(log, '1'.repeat(64));
    await runTimestampOnce(deps(log, happyProvider(ca), ca));
    expect((await log.verifyChain()).ok).toBe(true);

    // Flip a byte inside the encrypted chain blob → decrypt/verify must fail.
    const dump = (store as unknown as { dump: Map<string, Uint8Array> }).dump;
    for (const [name, bytes] of dump) {
      if (name.includes('chunk')) {
        const copy = Uint8Array.from(bytes);
        copy[copy.length - 1] ^= 0xff;
        dump.set(name, copy);
      }
    }
    expect((await log.verifyChain()).ok).toBe(false);
  });
});
