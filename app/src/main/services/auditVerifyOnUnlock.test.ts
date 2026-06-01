// SPEC-028 WI-3 (#361) — Chain-verify-on-unlock service tests.
//
// Exercises `verifyOnUnlock` across the full outcome taxonomy, driving a REAL
// signed `FileAuditLog` (in-memory blob store) plus raw on-disk-style event
// files. The two security-critical acceptance criteria are asserted explicitly:
//   - AC5: a fabricated one-byte edit in an anchored event file fails CLOSED.
//   - AC6: late peer events appended after the anchor are `notYetAnchored` and
//          must NOT fail closed (normal multi-device sync).
// Also asserts the read-only invariant: a missing signing key is surfaced as
// `signing-key-missing` WITHOUT generating/persisting a new key.

import { describe, it, expect } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fsp } from 'node:fs';

import { FileAuditLog, type AuditBlobStore } from '../../core/audit/AuditLog.js';
import type { AuditEntry, DeviceFrontier } from '../../core/audit/types.js';
import {
  computeDeviceFrontier,
  computeEventLogRoot,
  type RawDeviceFile,
} from '../../core/audit/frontier.js';
import { randomBytes, encrypt } from '../../core/crypto/primitives.js';
import { verifyOnUnlock, readStableDeviceFiles } from './auditVerifyOnUnlock.js';

const DATASET = '01HDATASETZZZZZZZZZZZZZZZA';
const DEVICE = '01JWDEVCEAAAAAAAAAAAAAAAAA';
const DEVICE_B = '01JWDEVCEBBBBBBBBBBBBBBBBB';
const ACTOR = 'treasurer@example.org';
const CHUNK_NAME = 'current.chunk.v1';
const SIGNING_KEY_NAME = 'signing-key.v1';

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

function makeLog(store: AuditBlobStore, mk: Uint8Array): FileAuditLog {
  let clock = Date.parse('2025-01-01T00:00:00.000Z');
  return new FileAuditLog({
    store,
    mk,
    datasetId: DATASET,
    deviceId: DEVICE,
    actorUserIdentity: ACTOR,
    now: () => new Date(clock++),
  });
}

/** Build a canonical encrypted-line shape `{ id, c }` as bytes incl. `\n`. */
function line(id: string, c = 'cipher'): Uint8Array {
  return Buffer.from(`${JSON.stringify({ id, c })}\n`, 'utf8');
}

function fileBytes(...lines: Uint8Array[]): Uint8Array {
  return Buffer.concat(lines.map((l) => Buffer.from(l)));
}

function rawFile(deviceId: string, bytes: Uint8Array): RawDeviceFile {
  return { deviceId, fileName: `events-${deviceId}.ndjson`, bytes };
}

/** Compute a faithful anchor payload (root + frontiers) over the given files. */
function anchorOf(files: RawDeviceFile[]): {
  eventLogRoot: string;
  deviceFrontiers: DeviceFrontier[];
} {
  const deviceFrontiers = files.map((f) => computeDeviceFrontier(f).frontier!);
  return { eventLogRoot: computeEventLogRoot(deviceFrontiers), deviceFrontiers };
}

/** Append a real signed anchor over `files` and return the live log + store. */
async function logWithAnchor(
  files: RawDeviceFile[],
): Promise<{ log: FileAuditLog; store: ReturnType<typeof memStore>; mk: Uint8Array }> {
  const store = memStore();
  const mk = randomBytes(32);
  const log = makeLog(store, mk);
  const { eventLogRoot, deviceFrontiers } = anchorOf(files);
  await log.appendAnchor({
    action: 'audit.anchor',
    targetId: '01HANCHOR0000000000000000A',
    observedAt: '2025-01-01T00:00:01.000Z',
    eventLogRoot,
    deviceFrontiers,
  });
  return { log, store, mk };
}

const stableFiles =
  (files: RawDeviceFile[]) => async (): Promise<readonly RawDeviceFile[] | 'unstable'> =>
    files;

describe('verifyOnUnlock — open (not fail-closed)', () => {
  it('verifies a faithful snapshot → ok, opens (no notYetAnchored)', async () => {
    const files = [rawFile(DEVICE, fileBytes(line('id-1'), line('id-2')))];
    const { log } = await logWithAnchor(files);

    const verdict = await verifyOnUnlock({ auditLog: log, readDeviceFiles: stableFiles(files) });

    expect(verdict.status).toBe('ok');
    expect(verdict.failClosed).toBe(false);
    expect(verdict.category).toBe('ok');
    expect(verdict.summary.notYetAnchoredTotal).toBe(0);
  });

  it('AC6 — late peer events after the anchor are notYetAnchored, NOT tamper', async () => {
    const anchored = [rawFile(DEVICE, fileBytes(line('id-1'), line('id-2')))];
    const { log } = await logWithAnchor(anchored);
    // Peer syncs two more lines AFTER the anchor was signed.
    const grown = [
      rawFile(DEVICE, fileBytes(line('id-1'), line('id-2'), line('id-3'), line('id-4'))),
    ];

    const verdict = await verifyOnUnlock({ auditLog: log, readDeviceFiles: stableFiles(grown) });

    expect(verdict.status).toBe('ok');
    expect(verdict.failClosed).toBe(false);
    expect(verdict.summary.notYetAnchoredTotal).toBe(2);
  });

  it('a device enrolled after the anchor is counted as new, not tamper', async () => {
    const anchored = [rawFile(DEVICE, fileBytes(line('id-1')))];
    const { log } = await logWithAnchor(anchored);
    const withNew = [...anchored, rawFile(DEVICE_B, fileBytes(line('id-9')))];

    const verdict = await verifyOnUnlock({ auditLog: log, readDeviceFiles: stableFiles(withNew) });

    expect(verdict.status).toBe('ok');
    expect(verdict.failClosed).toBe(false);
    expect(verdict.summary.newDeviceCount).toBe(1);
  });

  it('a fresh empty store → no-audit-chain and generates NO signing key', async () => {
    const store = memStore();
    const mk = randomBytes(32);
    const log = makeLog(store, mk);

    const verdict = await verifyOnUnlock({ auditLog: log, readDeviceFiles: stableFiles([]) });

    expect(verdict.status).toBe('no-audit-chain');
    expect(verdict.failClosed).toBe(false);
    expect(store.dump.has(SIGNING_KEY_NAME)).toBe(false);
  });

  it('a chain with no anchor entry yet → no-anchor, opens', async () => {
    const store = memStore();
    const mk = randomBytes(32);
    const log = makeLog(store, mk);
    await log.append({
      action: 'export.csv',
      result: 'started',
      targetId: 'exp-1',
      afterHash: null,
    });

    const verdict = await verifyOnUnlock({ auditLog: log, readDeviceFiles: stableFiles([]) });

    expect(verdict.status).toBe('no-anchor');
    expect(verdict.failClosed).toBe(false);
  });
});

describe('verifyOnUnlock — fail-closed: tamper (restore)', () => {
  it('AC5 — a fabricated one-byte edit in an anchored file fails CLOSED', async () => {
    const files = [rawFile(DEVICE, fileBytes(line('id-1'), line('id-2')))];
    const { log } = await logWithAnchor(files);
    // Flip a single byte inside an ANCHORED line (same line_count + last id).
    const tampered = [rawFile(DEVICE, fileBytes(line('id-1'), line('id-2', 'CIPHER')))];

    const verdict = await verifyOnUnlock({ auditLog: log, readDeviceFiles: stableFiles(tampered) });

    expect(verdict.status).toBe('anchor-content-mismatch');
    expect(verdict.failClosed).toBe(true);
    expect(verdict.category).toBe('tamper');
    expect(verdict.recovery).toBe('restore');
    expect(verdict.devices[0]?.status).toBe('head-mismatch');
  });

  it('a swapped anchored event id fails closed (last-event-mismatch)', async () => {
    const files = [rawFile(DEVICE, fileBytes(line('id-1'), line('id-2')))];
    const { log } = await logWithAnchor(files);
    const swapped = [rawFile(DEVICE, fileBytes(line('id-1'), line('id-X')))];

    const verdict = await verifyOnUnlock({ auditLog: log, readDeviceFiles: stableFiles(swapped) });

    expect(verdict.status).toBe('anchor-content-mismatch');
    expect(verdict.failClosed).toBe(true);
    expect(verdict.devices[0]?.status).toBe('last-event-mismatch');
  });

  it('a tampered audit entry fails closed as chain-broken', async () => {
    const files = [rawFile(DEVICE, fileBytes(line('id-1'), line('id-2')))];
    const { log, store, mk } = await logWithAnchor(files);

    // Forge the signed anchor entry: re-seal under the MK but the Ed25519
    // signature no longer covers the mutated payload.
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

    const verdict = await verifyOnUnlock({
      auditLog: makeLog(store, mk),
      readDeviceFiles: stableFiles(files),
    });

    expect(verdict.status).toBe('chain-broken');
    expect(verdict.failClosed).toBe(true);
    expect(verdict.category).toBe('tamper');
  });
});

describe('verifyOnUnlock — fail-closed: unavailable (retry)', () => {
  it('an anchored device file that is missing → anchored-file-missing', async () => {
    const files = [rawFile(DEVICE, fileBytes(line('id-1'), line('id-2')))];
    const { log } = await logWithAnchor(files);

    const verdict = await verifyOnUnlock({ auditLog: log, readDeviceFiles: stableFiles([]) });

    expect(verdict.status).toBe('anchored-file-missing');
    expect(verdict.failClosed).toBe(true);
    expect(verdict.category).toBe('unavailable');
    expect(verdict.recovery).toBe('retry');
  });

  it('an anchored device file truncated below its line_count → anchored-file-truncated', async () => {
    const files = [rawFile(DEVICE, fileBytes(line('id-1'), line('id-2'), line('id-3')))];
    const { log } = await logWithAnchor(files);
    const truncated = [rawFile(DEVICE, fileBytes(line('id-1'), line('id-2')))];

    const verdict = await verifyOnUnlock({
      auditLog: log,
      readDeviceFiles: stableFiles(truncated),
    });

    expect(verdict.status).toBe('anchored-file-truncated');
    expect(verdict.failClosed).toBe(true);
    expect(verdict.category).toBe('unavailable');
  });

  it('a signing key absent while a chunk exists → signing-key-missing, NO key written', async () => {
    const files = [rawFile(DEVICE, fileBytes(line('id-1')))];
    const { store, mk } = await logWithAnchor(files);
    // Simulate a cloud-sync race: the chunk synced but the sealed signing key
    // has not arrived yet. A read-only verify must NOT regenerate it.
    expect(store.dump.has(CHUNK_NAME)).toBe(true);
    store.dump.delete(SIGNING_KEY_NAME);

    const verdict = await verifyOnUnlock({
      auditLog: makeLog(store, mk),
      readDeviceFiles: stableFiles(files),
    });

    expect(verdict.status).toBe('signing-key-missing');
    expect(verdict.failClosed).toBe(true);
    expect(verdict.category).toBe('unavailable');
    // Read-only invariant: verify must not have generated/persisted a key.
    expect(store.dump.has(SIGNING_KEY_NAME)).toBe(false);
  });

  it('event files that keep changing across retries → files-unstable', async () => {
    const files = [rawFile(DEVICE, fileBytes(line('id-1')))];
    const { log } = await logWithAnchor(files);

    const verdict = await verifyOnUnlock({
      auditLog: log,
      readDeviceFiles: async () => 'unstable' as const,
    });

    expect(verdict.status).toBe('files-unstable');
    expect(verdict.failClosed).toBe(true);
    expect(verdict.category).toBe('unavailable');
  });
});

describe('verifyOnUnlock — fail safe', () => {
  it('an unexpected error while reading device files fails CLOSED (never opens)', async () => {
    const files = [rawFile(DEVICE, fileBytes(line('id-1')))];
    const { log } = await logWithAnchor(files);

    const verdict = await verifyOnUnlock({
      auditLog: log,
      readDeviceFiles: async () => {
        throw new Error('disk exploded');
      },
    });

    expect(verdict.failClosed).toBe(true);
    expect(verdict.status).toBe('chain-broken');
  });

  it('redacts the view-model: only deviceId/status/notYetAnchored on devices', async () => {
    const files = [rawFile(DEVICE, fileBytes(line('id-1')))];
    const { log } = await logWithAnchor(files);

    const verdict = await verifyOnUnlock({ auditLog: log, readDeviceFiles: stableFiles(files) });

    for (const d of verdict.devices) {
      expect(Object.keys(d).sort()).toEqual(['deviceId', 'notYetAnchored', 'status']);
    }
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
  await store.write(CHUNK_NAME, Buffer.concat([Buffer.from(nonce), Buffer.from(cipher)]));
}

describe('readStableDeviceFiles', () => {
  it('returns [] when the event-log dir does not exist', async () => {
    const missing = path.join(os.tmpdir(), `otrv-wi3-missing-${Date.now()}`);
    const files = await readStableDeviceFiles(missing);
    expect(files).toEqual([]);
  });

  it('reads only canonical events-<ULID>.ndjson files as raw bytes', async () => {
    const dir = path.join(os.tmpdir(), `otrv-wi3-read-${Date.now()}`);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, `events-${DEVICE}.ndjson`), Buffer.from(line('id-1')));
    await fsp.writeFile(path.join(dir, 'events.ndjson'), Buffer.from('legacy\n')); // ignored
    await fsp.writeFile(path.join(dir, 'notes.txt'), Buffer.from('nope\n')); // ignored

    const files = await readStableDeviceFiles(dir);
    expect(files).not.toBe('unstable');
    const list = files as readonly RawDeviceFile[];
    expect(list.map((f) => f.deviceId)).toEqual([DEVICE]);
    expect(Buffer.from(list[0]!.bytes).toString('utf8')).toContain('id-1');

    await fsp.rm(dir, { recursive: true, force: true });
  });
});
