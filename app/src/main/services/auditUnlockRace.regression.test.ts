// #379 regression — the unlock anchor + timestamp drain must never persist an
// audit entry whose signature fingerprint diverges from the on-disk signing
// key (which locks out the next fail-closed unlock).
//
// Root cause: on a fresh audit dir the anchor path and the timestamp path each
// built an independent `FileAuditLog` and PREFLIGHTED with the key-CREATING
// `verifyChain()` (default `allowKeyCreation: true`). The two instances raced
// to generate + persist DIFFERENT signing keys, so the anchor got signed with
// key A while the on-disk key ended up B → the next unlock's read-only verify
// hit `key-fingerprint-mismatch` at seq 1 and failed closed.
//
// Fix invariant: the signing key is created in EXACTLY ONE place — the
// append/write path (`appendAnchor`/`append` → `appendCore` → `ensureSigningKey`)
// under the process-global append lock. Every preflight uses
// `verifyChain({ allowKeyCreation: false })`. These tests pin that invariant.

import { describe, it, expect } from 'vitest';

import { runAnchorOnce, type FrontierSource } from './anchorService.js';
import { runTimestampOnce } from './timestampService.js';
import { TimestampRetryState } from '../../core/audit/timestamp/queue.js';
import type { TimestampProvider, TimestampResult } from '../../core/audit/timestamp/provider.js';
import {
  makeTrustedToken,
  makeTestCa,
  type TestCa,
} from '../../core/audit/timestamp/tsa.testkit.js';
import {
  memStore,
  makeAuditLog,
  makeMk,
  newTestUlid,
  TEST_DEVICE,
} from '../../core/audit/audit.testkit.js';
import type { AuditBlobStore, FileAuditLog } from '../../core/audit/AuditLog.js';
import type { DeviceFrontier } from '../../core/audit/types.js';

const SIGNING_KEY_NAME = 'signing-key.v1';
const NOW = new Date('2026-06-01T00:00:00Z');
const FIXED_NONCE = Buffer.from('00112233', 'hex');

const FRONTIER: DeviceFrontier = {
  device_id: TEST_DEVICE,
  file_name: `events-${TEST_DEVICE}.ndjson`,
  line_count: 3,
  last_event_id: '01JEV0000000000000000000AA',
  device_head_hash: 'a'.repeat(64),
};

function nonceBig(bytes: Uint8Array): bigint {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v;
}

function happyProvider(ca: TestCa): TimestampProvider {
  return {
    id: 'test',
    kind: 'rfc3161',
    trustRootIds: ['test-root'],
    async requestTimestamp(req): Promise<TimestampResult> {
      const { tokenDer } = makeTrustedToken({
        imprintHash: req.hash,
        nonce: nonceBig(req.nonce),
        genTime: new Date('2026-01-01T00:00:00Z'),
        ca,
      });
      return { ok: true, tokenDer };
    },
  };
}

function timestampDeps(log: FileAuditLog, ca: TestCa) {
  return {
    auditLog: log,
    provider: happyProvider(ca),
    newUlid: newTestUlid,
    now: () => NOW,
    randomNonce: () => Uint8Array.from(FIXED_NONCE),
    retry: new TimestampRetryState(),
    resolveRoots: () => [ca.root.pem],
  };
}

function anchoringEventLog(): FrontierSource {
  return {
    async snapshotFrontier() {
      return { ok: true, frontiers: [FRONTIER] } as const;
    },
  };
}

type DumpStore = AuditBlobStore & { dump: Map<string, Uint8Array> };

/**
 * A store view over a shared `dump` that returns `null` for the FIRST read of
 * the signing key, modelling the production race where the timestamp instance
 * observed "no key yet" even though the anchor instance had already persisted
 * one (sync/timing). Every later read sees the real on-disk value.
 */
function staleSigningKeyView(dump: Map<string, Uint8Array>): AuditBlobStore {
  let firstSigningKeyReadDone = false;
  return {
    async read(name) {
      if (name === SIGNING_KEY_NAME && !firstSigningKeyReadDone) {
        firstSigningKeyReadDone = true;
        return null;
      }
      return dump.get(name) ?? null;
    },
    async write(name, data) {
      dump.set(name, Uint8Array.from(data));
    },
  };
}

describe('#379 — unlock anchor/timestamp signing-key race', () => {
  it('a timestamp drain on a fresh chain NEVER persists a signing key', async () => {
    const ca = makeTestCa();
    const store = memStore() as DumpStore;
    const log = makeAuditLog(store, makeMk());

    const outcome = await runTimestampOnce(timestampDeps(log, ca));

    // Nothing to timestamp on a fresh chain — and, crucially, the preflight must
    // not have created a key (it used to, racing the anchor's key creation).
    expect(outcome.status).toBe('idle');
    expect(store.dump.has(SIGNING_KEY_NAME)).toBe(false);
  });

  it('an anchor run that finds no events NEVER persists a signing key', async () => {
    const store = memStore() as DumpStore;
    const log = makeAuditLog(store, makeMk());
    const eventLog: FrontierSource = {
      async snapshotFrontier() {
        return { ok: false, reason: 'no-events' } as const;
      },
    };

    const outcome = await runAnchorOnce({
      auditLog: log,
      eventLog,
      newUlid: newTestUlid,
      now: () => NOW,
    });

    expect(outcome.status).toBe('skipped');
    expect(store.dump.has(SIGNING_KEY_NAME)).toBe(false);
  });

  // PRIMARY regression: reproduces the exact lockout end-to-end and is fully
  // deterministic. The anchor persists+signs with its key; the timestamp path
  // (whose first signing-key read is stale) must NOT generate and persist a
  // divergent key. Before the fix the timestamp preflight created key B and
  // clobbered the on-disk key, so the next unlock's read-only verify failed
  // closed with `key-fingerprint-mismatch`. After the fix it skips cleanly.
  it('a stale-keyed timestamp drain does NOT lock out the next unlock', async () => {
    const ca = makeTestCa();
    const mk = makeMk();
    const lockKey = `audit-379-${Math.random().toString(36).slice(2)}`;
    const dump = new Map<string, Uint8Array>();
    const plainStore: AuditBlobStore = {
      async read(name) {
        return dump.get(name) ?? null;
      },
      async write(name, data) {
        dump.set(name, Uint8Array.from(data));
      },
    };

    // 1) Anchor unlock side-effect: creates + persists its signing key on the
    //    write path and appends a signed anchor (seq 1).
    const anchorLog = makeAuditLog(plainStore, mk, { lockKey });
    const anchorOutcome = await runAnchorOnce({
      auditLog: anchorLog,
      eventLog: anchoringEventLog(),
      newUlid: newTestUlid,
      now: () => NOW,
    });
    expect(anchorOutcome.status).toBe('anchored');
    expect(dump.has(SIGNING_KEY_NAME)).toBe(true);
    const keyAfterAnchor = Uint8Array.from(dump.get(SIGNING_KEY_NAME)!);

    // 2) Timestamp unlock side-effect on a stale view (first signing-key read
    //    returns null). It must NOT regenerate/clobber the on-disk key.
    const tsLog = makeAuditLog(staleSigningKeyView(dump), mk, { lockKey });
    await runTimestampOnce(timestampDeps(tsLog, ca));

    // The on-disk signing key is untouched by the timestamp path.
    expect(Buffer.from(dump.get(SIGNING_KEY_NAME)!)).toEqual(Buffer.from(keyAfterAnchor));

    // 3) The next unlock's fail-closed, read-only verification must pass.
    const reader = makeAuditLog(plainStore, mk, { lockKey });
    const verdict = await reader.verifyChain({ allowKeyCreation: false });
    expect(verdict.reason).toBeUndefined();
    expect(verdict.ok).toBe(true);
  });
});
