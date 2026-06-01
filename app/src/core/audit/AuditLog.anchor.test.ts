// SPEC-028 WI-2 (#358) — Audit-log anchor entry tests.
//
// Verifies the FR4a data-model extension on FileAuditLog: appendAnchor writes a
// signed, hash-chained `audit.anchor` entry whose Ed25519 signature covers the
// frontier payload; tampering the payload breaks verification; and existing
// export entries remain byte-identical (back-compat regression — optional
// `payload` must not alter canonical bytes / signatures).

import { describe, it, expect, beforeEach } from 'vitest';
import { FileAuditLog, type AuditBlobStore, type FileAuditLogDeps } from './AuditLog.js';
import type { AuditEntry, DeviceFrontier } from './types.js';
import { randomBytes, encrypt } from '../crypto/primitives.js';

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

function makeLog(store: AuditBlobStore, mk: Uint8Array): FileAuditLog {
  let clock = Date.parse('2025-01-01T00:00:00.000Z');
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

function frontiers(root = 'head'): DeviceFrontier[] {
  return [
    {
      device_id: '01JWDEVCEAAAAAAAAAAAAAAAAA',
      file_name: 'events-01JWDEVCEAAAAAAAAAAAAAAAAA.ndjson',
      line_count: 3,
      last_event_id: '01JEVENT0000000000000000ID',
      device_head_hash: `${root}-${'a'.repeat(58)}`,
    },
  ];
}

const ROOT = 'f'.repeat(64);

let store: ReturnType<typeof memStore>;
let mk: Uint8Array;

beforeEach(() => {
  store = memStore();
  mk = randomBytes(32);
});

describe('FileAuditLog.appendAnchor', () => {
  it('writes a signed, chained anchor entry that verifies', async () => {
    const log = makeLog(store, mk);
    const entry = await log.appendAnchor({
      action: 'audit.anchor',
      targetId: '01HANCHOR0000000000000000A',
      observedAt: '2025-01-01T00:00:01.000Z',
      eventLogRoot: ROOT,
      deviceFrontiers: frontiers(),
    });

    expect(entry.seq).toBe(1);
    expect(entry.action).toBe('audit.anchor');
    expect(entry.result).toBe('succeeded');
    expect(entry.target_ref).toEqual({ type: 'anchor', id: '01HANCHOR0000000000000000A' });
    expect(entry.before_hash).toBeNull();
    expect(entry.after_hash).toBe(ROOT);
    expect(entry.payload?.event_log_root).toBe(ROOT);
    // prev_entry_hash is null at genesis and mirrored into the signed payload.
    expect(entry.prev_entry_hash).toBeNull();
    expect(entry.payload?.audit_chain_prev_hash).toBeNull();
    expect((await log.verifyChain()).ok).toBe(true);
  });

  it('binds audit_chain_prev_hash to the real prev hash when chained after an entry', async () => {
    const log = makeLog(store, mk);
    await log.append({
      action: 'export.csv',
      result: 'started',
      targetId: 'exp-1',
      afterHash: null,
    });
    const anchor = await log.appendAnchor({
      action: 'audit.anchor',
      targetId: '01HANCHOR0000000000000000B',
      observedAt: '2025-01-01T00:00:02.000Z',
      eventLogRoot: ROOT,
      deviceFrontiers: frontiers(),
    });
    expect(anchor.seq).toBe(2);
    expect(anchor.prev_entry_hash).not.toBeNull();
    expect(anchor.payload?.audit_chain_prev_hash).toBe(anchor.prev_entry_hash);
    expect((await log.verifyChain()).ok).toBe(true);
  });

  it('rejects appending an anchor action through the plain append() path', async () => {
    const log = makeLog(store, mk);
    await expect(
      // Anchor actions are valid AuditActions but must go through appendAnchor;
      // append() enforces this at runtime (not at the type level).
      log.append({ action: 'audit.anchor', result: 'succeeded', targetId: 'x', afterHash: ROOT }),
    ).rejects.toThrow(/must be appended via appendAnchor/u);
  });

  it('detects a tampered payload via signature failure', async () => {
    const log = makeLog(store, mk);
    await log.appendAnchor({
      action: 'audit.anchor',
      targetId: '01HANCHOR0000000000000000C',
      observedAt: '2025-01-01T00:00:03.000Z',
      eventLogRoot: ROOT,
      deviceFrontiers: frontiers(),
    });

    // An attacker who can re-seal under the MK but cannot forge Ed25519 mutates
    // a frontier line_count. The entry decrypts but the signature no longer
    // covers the payload.
    const all = (await log.readAll()) as AuditEntry[];
    const orig = all[0]!;
    const forged: AuditEntry = {
      ...orig,
      payload: {
        ...orig.payload!,
        device_frontiers: [{ ...orig.payload!.device_frontiers[0]!, line_count: 999 }],
      },
    };
    await writeChunk(store, mk, [forged]);

    const verdict = await makeLog(store, mk).verifyChain();
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('signature-invalid');
  });
});

describe('FileAuditLog back-compat (export entries unchanged)', () => {
  it('export entries carry no payload and serialize without a payload key', async () => {
    const log = makeLog(store, mk);
    const entry = await log.append({
      action: 'export.csv',
      result: 'started',
      targetId: 'exp-1',
      afterHash: 'a'.repeat(64),
    });

    // The optional `payload` must be OMITTED (not null) on export entries so the
    // canonical signing bytes — and therefore existing signatures and prev-hash
    // links — are unchanged from the pre-SPEC-028 shape.
    expect('payload' in entry).toBe(false);
    const { signature: _sig, ...unsigned } = entry;
    expect(JSON.stringify(unsigned)).not.toContain('payload');
    expect(JSON.stringify(unsigned)).toBe(
      JSON.stringify({
        seq: 1,
        timestamp: '2025-01-01T00:00:00.000Z',
        dataset_id: DATASET,
        actor_device_id: DEVICE,
        actor_user_identity: ACTOR,
        action: 'export.csv',
        result: 'started',
        target_ref: { type: 'export', id: 'exp-1' },
        before_hash: null,
        after_hash: 'a'.repeat(64),
        prev_entry_hash: null,
      }),
    );
  });

  it('keeps export entries verifiable in a mixed export+anchor chain', async () => {
    const log = makeLog(store, mk);
    await log.append({
      action: 'export.csv',
      result: 'started',
      targetId: 'exp-1',
      afterHash: null,
    });
    await log.appendAnchor({
      action: 'audit.anchor',
      targetId: '01HANCHOR0000000000000000D',
      observedAt: '2025-01-01T00:00:05.000Z',
      eventLogRoot: ROOT,
      deviceFrontiers: frontiers(),
    });
    await log.append({
      action: 'export.csv',
      result: 'succeeded',
      targetId: 'exp-1',
      afterHash: null,
    });

    const all = await log.readAll();
    expect(all.map((e) => e.action)).toEqual(['export.csv', 'audit.anchor', 'export.csv']);
    expect('payload' in all[0]!).toBe(false);
    expect('payload' in all[2]!).toBe(false);
    expect((await log.verifyChain()).ok).toBe(true);
  });
});

// Re-seal entries into the chunk exactly as FileAuditLog does so a forged entry
// is decryptable under the MK but fails Ed25519 verification.
async function writeChunk(
  store: AuditBlobStore,
  mk: Uint8Array,
  entries: AuditEntry[],
): Promise<void> {
  const text = entries.map((e) => JSON.stringify(e)).join('\n');
  const nonce = randomBytes(24);
  const aad = Buffer.from(`audit-chunk:v1:${DATASET}`, 'utf8');
  const cipher = encrypt(Buffer.from(text, 'utf8'), mk, nonce, aad);
  await store.write('current.chunk.v1', Buffer.concat([Buffer.from(nonce), Buffer.from(cipher)]));
}
