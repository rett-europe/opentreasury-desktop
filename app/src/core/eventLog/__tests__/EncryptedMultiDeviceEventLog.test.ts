// SPEC-026 #309 — Unit tests for the encrypted, per-device append-only event
// log (`EncryptedMultiDeviceEventLog`).
//
// Coverage matrix:
//   - write → read round-trip (single device)
//   - AAD mismatch / tampered ciphertext rejection
//   - multi-device interleave with merge-sort by ULID
//   - stale `*.ndjson.tmp` cleanup
//   - idempotency (append same event twice = one disk line)
//   - invalid constructor inputs (deviceId / master key size)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  EncryptedMultiDeviceEventLog,
  eventsFileName,
  ENCRYPTED_EVENT_AUTH_FAILED,
} from '../EncryptedMultiDeviceEventLog.js';
import { generateMasterKey } from '../../crypto/masterKey.js';
import type { DomainEvent } from '../EventLog.js';

// Crockford base32 — no I, L, O, U.
const DEVICE_A = '01JWDEVCEAAAAAAAAAAAAAAAAA';
const DEVICE_B = '01JWDEVCEBBBBBBBBBBBBBBBBB';

// Build a syntactically valid 26-char Crockford ULID. The first 10 chars carry
// the timestamp prefix in real ULIDs; we just need lexical ordering to be
// deterministic across tests.
function ulid(prefix: string): string {
  const sanitized = prefix.toUpperCase().replace(/[^0-9A-HJKMNP-TV-Z]/g, '0');
  return (sanitized + '0'.repeat(26)).slice(0, 26);
}

function makeEvent(
  id: string,
  deviceId: string,
  payload: Record<string, unknown> = {},
): DomainEvent {
  return {
    id,
    type: 'AccountCreated',
    datasetId: ulid('DATASET01'),
    actorDeviceId: deviceId,
    actorUserId: ulid('USER0001'),
    actorIdentitySource: 'local',
    createdAt: '2026-05-12T12:00:00.000Z',
    dekVersion: 1,
    version: 1,
    payload: { name: `Account-${id.slice(-4)}`, ...payload },
  } as unknown as DomainEvent;
}

describe('EncryptedMultiDeviceEventLog', () => {
  let tmpDir: string;
  let mk: Uint8Array;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ot-evlog-'));
    mk = generateMasterKey();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ---- Constructor validation --------------------------------------------

  it('rejects a non-32-byte master key', () => {
    expect(
      () =>
        new EncryptedMultiDeviceEventLog({
          dir: tmpDir,
          deviceId: DEVICE_A,
          masterKey: new Uint8Array(16),
        }),
    ).toThrow(/Master Key must be 32 bytes/);
  });

  it('rejects a deviceId that is not a 26-char ULID', () => {
    expect(
      () =>
        new EncryptedMultiDeviceEventLog({
          dir: tmpDir,
          deviceId: 'not-a-ulid',
          masterKey: mk,
        }),
    ).toThrow(/26-char ULID/);
  });

  it('writes only to its own per-device file', () => {
    const log = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: mk,
    });
    expect(log.absoluteWritePath).toBe(path.join(tmpDir, `events-${DEVICE_A}.ndjson`));
    expect(log.owningDeviceId).toBe(DEVICE_A);
  });

  // ---- Round-trip (single device) ----------------------------------------

  it('round-trips three events via append + load', async () => {
    const log = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: mk,
    });
    const e1 = makeEvent(ulid('EVENT001'), DEVICE_A);
    const e2 = makeEvent(ulid('EVENT002'), DEVICE_A);
    const e3 = makeEvent(ulid('EVENT003'), DEVICE_A);

    await log.append(e1);
    await log.append(e2);
    await log.append(e3);

    // Fresh instance to prove durability (not just in-memory cache).
    const reopened = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: mk,
    });
    const loaded = await reopened.load();

    expect(loaded.map((e) => e.id)).toEqual([e1.id, e2.id, e3.id]);
    expect(loaded[0]).toEqual(e1);
  });

  it('appendBatch writes multiple events atomically and survives reopen', async () => {
    const log = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: mk,
    });
    const evs = [ulid('B0001'), ulid('B0002'), ulid('B0003')].map((id) => makeEvent(id, DEVICE_A));
    await log.appendBatch(evs);

    const reopened = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: mk,
    });
    const loaded = await reopened.load();
    expect(loaded).toHaveLength(3);
    expect(loaded.map((e) => e.id)).toEqual(evs.map((e) => e.id));
  });

  it('returns [] when the workspace folder is empty', async () => {
    const log = new EncryptedMultiDeviceEventLog({
      dir: path.join(tmpDir, 'fresh'),
      deviceId: DEVICE_A,
      masterKey: mk,
    });
    const loaded = await log.load();
    expect(loaded).toEqual([]);
  });

  // ---- Idempotency --------------------------------------------------------

  it('append is idempotent by event.id within a process', async () => {
    const log = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: mk,
    });
    const evt = makeEvent(ulid('DUP00001'), DEVICE_A);

    await log.append(evt);
    await log.append(evt);
    await log.append({ ...evt } as DomainEvent);

    const raw = await fs.readFile(path.join(tmpDir, eventsFileName(DEVICE_A)), 'utf8');
    expect(raw.split('\n').filter((l) => l.length > 0)).toHaveLength(1);
  });

  it('appendBatch skips already-seen ids (idempotent)', async () => {
    const log = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: mk,
    });
    const e1 = makeEvent(ulid('IDEMP001'), DEVICE_A);
    const e2 = makeEvent(ulid('IDEMP002'), DEVICE_A);

    await log.append(e1);
    await log.appendBatch([e1, e2]);

    const reread = await new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: mk,
    }).load();
    expect(reread.map((e) => e.id)).toEqual([e1.id, e2.id]);
  });

  // ---- AAD / tamper rejection --------------------------------------------

  it('throws ENCRYPTED_EVENT_AUTH_FAILED if the on-disk id no longer matches the AAD', async () => {
    const log = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: mk,
    });
    const e1 = makeEvent(ulid('AADT0001'), DEVICE_A);
    await log.append(e1);

    // Swap the plaintext `id` field on disk to a different ULID. AAD check
    // at decrypt time MUST reject the mismatch.
    const filePath = path.join(tmpDir, eventsFileName(DEVICE_A));
    const swappedId = ulid('SWAPPED1');
    const raw = await fs.readFile(filePath, 'utf8');
    const tampered = raw.replace(`"${e1.id}"`, `"${swappedId}"`);
    expect(tampered).not.toBe(raw); // sanity: substitution actually happened
    await fs.writeFile(filePath, tampered, 'utf8');

    const reopened = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: mk,
    });
    const err = await reopened.load().catch((e: unknown) => e as Error & { code?: string });
    expect(err.code).toBe(ENCRYPTED_EVENT_AUTH_FAILED);
    expect(err.message).toContain(swappedId);
  });

  it('throws ENCRYPTED_EVENT_AUTH_FAILED on a tampered ciphertext', async () => {
    const log = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: mk,
    });
    const e1 = makeEvent(ulid('TAMP0001'), DEVICE_A);
    await log.append(e1);

    const filePath = path.join(tmpDir, eventsFileName(DEVICE_A));
    const raw = await fs.readFile(filePath, 'utf8');
    // Decode the on-disk JSON line, flip a byte in the middle of the
    // ciphertext, re-encode. This is the most reliable tamper for AEAD.
    const parsed = JSON.parse(raw.trim()) as { id: string; c: string };
    const ct = Buffer.from(parsed.c, 'base64');
    const mid = Math.floor(ct.length / 2);
    ct[mid] = ct[mid] ^ 0xff;
    parsed.c = ct.toString('base64');
    await fs.writeFile(filePath, `${JSON.stringify(parsed)}\n`, 'utf8');

    const reopened = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: mk,
    });
    await expect(reopened.load()).rejects.toMatchObject({ code: ENCRYPTED_EVENT_AUTH_FAILED });
  });

  it('throws when read with the wrong master key', async () => {
    const log = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: mk,
    });
    await log.append(makeEvent(ulid('WRONGMK1'), DEVICE_A));

    const wrongMk = generateMasterKey();
    const reopened = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: wrongMk,
    });
    await expect(reopened.load()).rejects.toMatchObject({ code: ENCRYPTED_EVENT_AUTH_FAILED });
  });

  it('skips a malformed trailing line without throwing (crash simulation)', async () => {
    const log = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: mk,
    });
    const e1 = makeEvent(ulid('CRSH0001'), DEVICE_A);
    await log.append(e1);

    // Append a partial line (no trailing newline, broken JSON).
    await fs.appendFile(path.join(tmpDir, eventsFileName(DEVICE_A)), '{"id":"01HZPARTIAL', 'utf8');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const reopened = new EncryptedMultiDeviceEventLog({
        dir: tmpDir,
        deviceId: DEVICE_A,
        masterKey: mk,
      });
      const loaded = await reopened.load();
      expect(loaded.map((e) => e.id)).toEqual([e1.id]);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  // ---- Multi-device interleave + merge-sort -----------------------------

  it('merges two devices files and yields events sorted by ULID', async () => {
    const logA = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: mk,
    });
    const logB = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_B,
      masterKey: mk,
    });

    // Interleave ULIDs by writing them to different devices in non-sorted
    // order. The expected sort is purely lexicographic on event.id.
    const idA1 = ulid('A0000001');
    const idB1 = ulid('B0000001');
    const idA2 = ulid('C0000001'); // A's later event sorts after B's earlier one
    const idB2 = ulid('D0000001');

    await logB.append(makeEvent(idB1, DEVICE_B));
    await logA.append(makeEvent(idA1, DEVICE_A));
    await logA.append(makeEvent(idA2, DEVICE_A));
    await logB.append(makeEvent(idB2, DEVICE_B));

    // Either device's reader sees the unified, sorted timeline.
    const fromA = await new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: mk,
    }).load();

    expect(fromA.map((e) => e.id)).toEqual([idA1, idB1, idA2, idB2]);

    // Both files exist and only one device wrote to each.
    const entries = await fs.readdir(tmpDir);
    expect(entries.sort()).toEqual([eventsFileName(DEVICE_A), eventsFileName(DEVICE_B)].sort());
  });

  it('de-duplicates the same event id appearing in two device files', async () => {
    const logA = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: mk,
    });
    const logB = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_B,
      masterKey: mk,
    });

    const sharedId = ulid('SHARED01');
    await logA.append(makeEvent(sharedId, DEVICE_A));
    await logB.append(makeEvent(sharedId, DEVICE_B)); // peer re-emitted same id

    const loaded = await new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: mk,
    }).load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.id).toBe(sharedId);
  });

  // ---- Cross-device ciphertext transplant rejection (MEDIUM-1) -----------

  it('same-device: event written for device A decrypts correctly from its own file', async () => {
    // Positive side of the cross-device transplant test — confirms AAD format
    // is correct for same-device reads.
    const log = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: mk,
    });
    const event = makeEvent(ulid('SAMEDEV1'), DEVICE_A);
    await log.append(event);

    const reopened = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: mk,
    });
    const loaded = await reopened.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.id).toBe(event.id);
  });

  it('cross-device transplant: line copied from events-A into events-B fails to decrypt', async () => {
    // Negative case: an attacker (or buggy sync) copies a ciphertext line from
    // events-{A}.ndjson into events-{B}.ndjson. The AAD includes the file's
    // deviceId, so decryption MUST fail — AEAD verification rejects the mismatch.
    const logA = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: mk,
    });
    const event = makeEvent(ulid('XPLANT01'), DEVICE_A);
    await logA.append(event);

    // Simulate the transplant: place device A's encrypted line in a fresh
    // directory named as device B's file. There is no device-A file in this
    // new directory, so seenIds cannot short-circuit the decryption attempt.
    const dir2 = await fs.mkdtemp(`${tmpDir}-xplant-`);
    try {
      const lineFromA = await fs.readFile(path.join(tmpDir, eventsFileName(DEVICE_A)), 'utf8');
      await fs.writeFile(path.join(dir2, eventsFileName(DEVICE_B)), lineFromA, 'utf8');

      const logB = new EncryptedMultiDeviceEventLog({
        dir: dir2,
        deviceId: DEVICE_B,
        masterKey: mk,
      });
      const err = await logB.load().catch((e: unknown) => e as Error & { code?: string });
      expect(err.code).toBe(ENCRYPTED_EVENT_AUTH_FAILED);
    } finally {
      await fs.rm(dir2, { recursive: true, force: true });
    }
  });

  // ---- Stale tmp cleanup -------------------------------------------------

  it('removes stale `events-*.ndjson.tmp` siblings on load', async () => {
    const log = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: mk,
    });
    await log.append(makeEvent(ulid('TMP00001'), DEVICE_A));

    // Drop a leftover from a hypothetical aborted migration.
    const stale = path.join(tmpDir, `events-${DEVICE_B}.ndjson.tmp`);
    await fs.writeFile(stale, '{"id":"old-aborted-write"', 'utf8');

    await log.load();
    await expect(fs.access(stale)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
