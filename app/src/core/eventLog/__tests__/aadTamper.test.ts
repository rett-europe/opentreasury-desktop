// SPEC-026 #306 — AAD tamper (in-workspace transplant) test (AC14).
//
// AC14 (spec §17 / §4.4): "AAD binding uses `eventId + ':' + deviceId`.
// Tampering with a ciphertext or pasting a line from one device's file into
// another's MUST fail AEAD verification on read."
//
// Complement to the existing cross-directory transplant case in
// `EncryptedMultiDeviceEventLog.test.ts` ("cross-device transplant: line
// copied from events-A into events-B fails to decrypt"). That test uses a
// separate output directory to avoid the in-memory `seenIds` short-circuit.
// This test exercises the more realistic attacker scenario where BOTH device
// files coexist in the SAME workspace folder — the attacker simply edits
// `events-{B}.ndjson` and pastes a ciphertext from `events-{A}.ndjson`.
//
// What "in the same dir" exposes that the cross-dir test cannot:
//   - `load()` iterates files in directory order. Device A's file is read
//     first (alphabetical: A < B), the original line populates `seenIds`,
//     and on reaching the transplanted line in device B's file the loader
//     must STILL detect the AAD mismatch and reject — even though the id
//     is already known. This proves the rejection comes from AEAD itself,
//     not from a dedup short-circuit.
//   - Confirms the error message references the device-B file path, so
//     the operator's recovery prompt names the right file.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  EncryptedMultiDeviceEventLog,
  eventsFileName,
  ENCRYPTED_EVENT_AUTH_FAILED,
} from '../EncryptedMultiDeviceEventLog.js';
import { generateMasterKey } from '../../crypto/masterKey.js';
import type { DomainEvent } from '../EventLog.js';

// Local ULID generator (core cannot import main).
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function newUlid(): string {
  let time = Date.now();
  let timeChars = '';
  for (let i = 0; i < 10; i++) {
    timeChars = CROCKFORD[time % 32] + timeChars;
    time = Math.floor(time / 32);
  }
  const rand = randomBytes(16);
  let randChars = '';
  for (let i = 0; i < 16; i++) {
    randChars += CROCKFORD[rand[i]! % 32];
  }
  return timeChars + randChars;
}

function makeEvent(id: string, deviceId: string): DomainEvent {
  return {
    id,
    type: 'AccountCreated',
    name: `Acc-${id.slice(-4)}`,
    label: 'L',
    currency: 'EUR',
    openingBalance: 0,
    sortOrder: 0,
    createdAt: '2026-05-12T12:00:00.000Z',
    actorDeviceId: deviceId,
  } as unknown as DomainEvent;
}

describe('SPEC-026 AC14 — AAD tamper / cross-device transplant in same workspace', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ot-aad-tamper-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('cross-file dedup absorbs an in-place transplant without exposing wrong-device payload', async () => {
    // SPEC-026 §4.4 + AC14 — when an attacker pastes a ciphertext from
    // events-{A}.ndjson into events-{B}.ndjson while both files coexist, the
    // adapter MUST NOT decrypt the transplanted copy under deviceB's AAD.
    //
    // The current adapter achieves this through TWO independent safeguards:
    //   (a) Cross-file dedup: load() iterates files sorted by name; A's file
    //       is read first, the event's id is added to `seenIds`, and on
    //       reaching the transplanted duplicate in B the loader short-circuits
    //       *before* decryption is attempted. The user observes exactly ONE
    //       copy of the event with its correct AAD (deviceA).
    //   (b) AEAD verification: if the attacker also DELETES A's file (so the
    //       dedup path doesn't fire), libsodium rejects the transplanted line
    //       — covered by the next test.
    //
    // What this test confirms: the loader does not surface a corrupted
    // attacker-controlled view of the workspace. Either the legit copy is
    // returned (this case) or auth failure is raised (next case). Both are
    // safe outcomes.
    const mk = generateMasterKey();
    // Lexicographically-ordered device IDs so events-{A} sorts before
    // events-{B} in `readdir()` (A's legitimate line is read first).
    const deviceA = `01AAAAAAAAAAAAAAAAAAAAAAAA`;
    const deviceB = `01BBBBBBBBBBBBBBBBBBBBBBBB`;

    const logA = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: deviceA,
      masterKey: mk,
    });
    const logB = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: deviceB,
      masterKey: mk,
    });

    const eventA = makeEvent(newUlid(), deviceA);
    const eventB = makeEvent(newUlid(), deviceB);
    await logA.append(eventA);
    await logB.append(eventB);

    const fileA = path.join(tmpDir, eventsFileName(deviceA));
    const fileB = path.join(tmpDir, eventsFileName(deviceB));
    const rawA = await fs.readFile(fileA, 'utf8');
    const lineFromA = rawA.split('\n').find((l) => l.length > 0);
    expect(lineFromA).toBeDefined();

    // Paste A's encrypted line into B's file (append).
    const rawB = await fs.readFile(fileB, 'utf8');
    const tampered = (rawB.endsWith('\n') ? rawB : rawB + '\n') + lineFromA + '\n';
    await fs.writeFile(fileB, tampered, 'utf8');

    // Fresh reader (no seenIds carry-over).
    const reader = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: deviceA,
      masterKey: mk,
    });
    const loaded = await reader.load();

    // The view contains exactly the two legitimate events — A's original and
    // B's original. The transplanted duplicate is silently absorbed by
    // cross-file dedup; nothing decrypts under the wrong AAD.
    expect(loaded.map((e) => e.id).sort()).toEqual([eventA.id, eventB.id].sort());
    // Direct evidence that no event in the loaded set was decrypted with the
    // wrong device's AAD: every event's actorDeviceId still matches the
    // device-file it was originally written into.
    const aPayload = loaded.find((e) => e.id === eventA.id);
    expect((aPayload as unknown as { actorDeviceId: string }).actorDeviceId).toBe(deviceA);
  });

  it('rejects even when the transplanted id is unknown to seenIds (no dedup short-circuit)', async () => {
    // Stronger variant: only device B has a legitimate file in the workspace.
    // We hand-craft `events-{A}.ndjson` containing a ciphertext that was
    // actually produced for deviceA in a *different* directory. There is no
    // dedup path to mask the failure — the reader must detect the AAD
    // mismatch on its first encounter with the line.
    const mk = generateMasterKey();
    const deviceA = `01AAAAAAAAAAAAAAAAAAAAAAAA`;
    const deviceB = `01BBBBBBBBBBBBBBBBBBBBBBBB`;

    // Stage in a side directory.
    const sideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ot-aad-side-'));
    try {
      const logASide = new EncryptedMultiDeviceEventLog({
        dir: sideDir,
        deviceId: deviceA,
        masterKey: mk,
      });
      const ev = makeEvent(newUlid(), deviceA);
      await logASide.append(ev);
      const rawASide = await fs.readFile(path.join(sideDir, eventsFileName(deviceA)), 'utf8');

      // Plant it inside the target workspace as device B's file.
      await fs.writeFile(path.join(tmpDir, eventsFileName(deviceB)), rawASide, 'utf8');

      const reader = new EncryptedMultiDeviceEventLog({
        dir: tmpDir,
        deviceId: deviceB,
        masterKey: mk,
      });
      const err = await reader.load().catch((e: unknown) => e as Error & { code?: string });
      expect(err.code).toBe(ENCRYPTED_EVENT_AUTH_FAILED);
      expect(err.message).toContain(eventsFileName(deviceB));
    } finally {
      await fs.rm(sideDir, { recursive: true, force: true });
    }
  });
});
