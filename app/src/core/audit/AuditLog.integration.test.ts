// SPEC-027 / crypto-spec §8 — Audit log hash-chain integration test (Cypher).
//
// Drives FileAuditLog over an in-memory blob store with a real master key:
// MK-encrypted persistence, lazy Ed25519 signing key, hash-chain linking,
// signature verification, tamper detection, and fail-closed append on a corrupt
// chain. Uses the real sodium-native crypto (no mocks).

import { describe, it, expect, beforeEach } from 'vitest';
import { FileAuditLog, type AuditBlobStore } from './AuditLog.js';
import type { AuditEntry, FileAuditLogDeps } from './types.js';
import { randomBytes } from '../crypto/primitives.js';

function memStore(): AuditBlobStore & { dump: Map<string, Uint8Array> } {
  const dump = new Map<string, Uint8Array>();
  return {
    dump,
    async read(name) {
      return dump.get(name) ?? null;
    },
    async write(name, data) {
      dump.set(name, Uint8Array.from(data));
    },
  };
}

const DATASET = '01HDATASETZZZZZZZZZZZZZZZA';
const DEVICE = 'device-abc';
const ACTOR = 'treasurer@example.org';

function makeLog(
  store: AuditBlobStore,
  mk: Uint8Array,
  ts = '2025-01-01T00:00:00.000Z',
): FileAuditLog {
  let clock = Date.parse(ts);
  const deps: FileAuditLogDeps = {
    store,
    mk,
    datasetId: DATASET,
    deviceId: DEVICE,
    actorUserIdentity: ACTOR,
    now: () => new Date(clock++),
  };
  return new FileAuditLog(deps);
}

let store: ReturnType<typeof memStore>;
let mk: Uint8Array;

beforeEach(() => {
  store = memStore();
  mk = randomBytes(32);
});

describe('FileAuditLog append + verify', () => {
  it('writes a genesis entry with seq 1 and null prev hash', async () => {
    const log = makeLog(store, mk);
    const entry = await log.append({
      action: 'export.csv',
      result: 'started',
      targetId: 'exp-1',
      afterHash: 'a'.repeat(64),
    });
    expect(entry.seq).toBe(1);
    expect(entry.prev_entry_hash).toBeNull();
    expect(entry.action).toBe('export.csv');
    expect(entry.signature.alg).toBe('ed25519');
    expect((await log.verifyChain()).ok).toBe(true);
  });

  it('chains multiple entries with monotonic seq and prev-hash links', async () => {
    const log = makeLog(store, mk);
    await log.append({
      action: 'export.csv',
      result: 'started',
      targetId: 'exp-1',
      afterHash: null,
    });
    await log.append({
      action: 'export.csv',
      result: 'succeeded',
      targetId: 'exp-1',
      afterHash: null,
    });
    await log.append({
      action: 'export.xlsx',
      result: 'started',
      targetId: 'exp-2',
      afterHash: null,
    });

    const all = await log.readAll();
    expect(all.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(all[1]!.prev_entry_hash).not.toBeNull();
    expect(all[2]!.prev_entry_hash).not.toBeNull();
    expect((await log.verifyChain()).ok).toBe(true);
  });

  it('persists encrypted — the chunk blob does not contain plaintext', async () => {
    const log = makeLog(store, mk);
    await log.append({
      action: 'export.csv',
      result: 'started',
      targetId: 'exp-secret-id',
      afterHash: null,
    });
    const blob = store.dump.get('current.chunk.v1')!;
    expect(Buffer.from(blob).toString('utf8')).not.toContain('exp-secret-id');
    expect(Buffer.from(blob).toString('utf8')).not.toContain('export.csv');
  });

  it('reopens with the persisted signing key and continues the chain', async () => {
    const log1 = makeLog(store, mk);
    await log1.append({
      action: 'export.csv',
      result: 'started',
      targetId: 'exp-1',
      afterHash: null,
    });

    const log2 = makeLog(store, mk);
    const next = await log2.append({
      action: 'export.csv',
      result: 'succeeded',
      targetId: 'exp-1',
      afterHash: null,
    });
    expect(next.seq).toBe(2);
    expect((await log2.verifyChain()).ok).toBe(true);
  });
});

describe('FileAuditLog tamper detection (fail closed)', () => {
  it('detects a flipped byte in the encrypted chunk as decrypt failure', async () => {
    const log = makeLog(store, mk);
    await log.append({
      action: 'export.csv',
      result: 'started',
      targetId: 'exp-1',
      afterHash: null,
    });
    const blob = store.dump.get('current.chunk.v1')!;
    blob[blob.length - 1] ^= 0xff;

    const verdict = await log.verifyChain();
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('decrypt-failed');
  });

  it('detects a forged entry (re-encrypted with the right MK but bad signature)', async () => {
    const log = makeLog(store, mk);
    await log.append({
      action: 'export.csv',
      result: 'started',
      targetId: 'exp-1',
      afterHash: 'a'.repeat(64),
    });

    // Rewrite the chunk with a mutated entry payload, re-sealed under the same MK
    // (an attacker who can write the blob but cannot forge an Ed25519 signature).
    const all = (await log.readAll()) as AuditEntry[];
    const forged: AuditEntry = { ...all[0]!, result: 'succeeded' };
    const tamperedLog = makeLog(store, mk);
    // Persist via a fresh log instance using its private writer path: emulate by
    // writing through the store using the same encryption the log expects.
    await writeChunk(store, mk, [forged]);

    const verdict = await tamperedLog.verifyChain();
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('signature-invalid');
  });

  it('throws on append when the chain is corrupt (fail closed)', async () => {
    const log = makeLog(store, mk);
    await log.append({
      action: 'export.csv',
      result: 'started',
      targetId: 'exp-1',
      afterHash: null,
    });
    const blob = store.dump.get('current.chunk.v1')!;
    blob[blob.length - 1] ^= 0xff;

    await expect(
      log.append({ action: 'export.csv', result: 'succeeded', targetId: 'exp-1', afterHash: null }),
    ).rejects.toThrow(/audit chain verification failed|could not verify/u);
  });
});

// Helper: re-seal a set of entries into the chunk exactly as FileAuditLog does,
// so a "forged" entry is decryptable but fails signature verification.
async function writeChunk(
  store: AuditBlobStore,
  mk: Uint8Array,
  entries: AuditEntry[],
): Promise<void> {
  const { encrypt, randomBytes: rnd } = await import('../crypto/primitives.js');
  const text = entries.map((e) => JSON.stringify(e)).join('\n');
  const nonce = rnd(24);
  const aad = Buffer.from(`audit-chunk:v1:${DATASET}`, 'utf8');
  const cipher = encrypt(Buffer.from(text, 'utf8'), mk, nonce, aad);
  await store.write('current.chunk.v1', Buffer.concat([Buffer.from(nonce), Buffer.from(cipher)]));
}
