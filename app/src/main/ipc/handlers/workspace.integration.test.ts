// Integration test: full workspace lifecycle — create → unlock → append event → read.
//
// Exercises the real crypto pipeline (generateMasterKey, wrapKey, Argon2id,
// safeStorage stub, EncryptedMultiDeviceEventLog) in a real temp directory.
// No Electron — safeStorage is stubbed with the same trivial XOR cipher used
// in unit tests.
//
// Flow under test (SPEC-026 §5.2 fresh setup + §4.4 read/write):
//   1. workspace:detect (fresh folder)
//   2. workspace:create → mnemonic + setupToken
//   3. workspace:confirmSetup (correct words) → events.key written to disk
//   4. session is active (MK in memory)
//   5. EncryptedMultiDeviceEventLog constructed with the session MK
//   6. append(event) writes encrypted line to events-{deviceId}.ndjson
//   7. load() decrypts and returns the event

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createWorkspaceHandlers } from './workspace.js';
import type { WorkspaceDeps } from './workspace.js';
import { getActiveWorkspace, _resetWorkspaceSession } from '../../workspace-session.js';
import { EncryptedMultiDeviceEventLog } from '../../../core/eventLog/EncryptedMultiDeviceEventLog.js';
import type { DomainEvent } from '../../../core/eventLog/EventLog.js';

const DEVICE_A = '01JWDEVCEAAAAAAAAAAAAAAAAA';

function makeDeps(overrides?: Partial<WorkspaceDeps>): WorkspaceDeps {
  const trivialEncrypt = (plain: string): Buffer => {
    const buf = Buffer.from(plain, 'utf8');
    for (let i = 0; i < buf.length; i++) buf[i] = (buf[i] ?? 0) ^ 0xab;
    return buf;
  };
  const trivialDecrypt = (cipher: Buffer): string => {
    const out = Buffer.allocUnsafe(cipher.length);
    for (let i = 0; i < cipher.length; i++) out[i] = (cipher[i] ?? 0) ^ 0xab;
    return out.toString('utf8');
  };

  return {
    deviceId: () => DEVICE_A,
    isEncryptionAvailable: () => true,
    safeStorageEncrypt: trivialEncrypt,
    safeStorageDecrypt: trivialDecrypt,
    hostname: () => 'IntegrationTestMachine',
    now: () => new Date('2026-05-12T12:00:00.000Z'),
    ...overrides,
  };
}

function makeEvent(id: string): DomainEvent {
  return {
    id,
    type: 'AccountCreated',
    datasetId: '01DATASETID000000000000001',
    actorDeviceId: DEVICE_A,
    actorUserId: '01USERID00000000000000001A',
    actorIdentitySource: 'local',
    createdAt: '2026-05-12T12:00:00.000Z',
    dekVersion: 1,
    version: 1,
    payload: { name: 'Test Account' },
  } as unknown as DomainEvent;
}

describe('workspace integration: create → unlock → append → read', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ot-ws-int-'));
    _resetWorkspaceSession();
  });

  afterEach(async () => {
    _resetWorkspaceSession();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('full fresh-setup lifecycle: detect → create → confirmSetup → append → load', async () => {
    const deps = makeDeps();
    const h = createWorkspaceHandlers(deps);

    // 1. Detect — empty folder → fresh.
    const detectRes = await h.handleDetect({ folderPath: tmpDir });
    expect(detectRes.ok).toBe(true);
    if (!detectRes.ok) throw new Error('detect failed');
    expect(detectRes.state).toBe('fresh');

    // 2. Create — generates MK + 12-word mnemonic.
    const createRes = await h.handleCreate({ folderPath: tmpDir });
    expect(createRes.ok).toBe(true);
    if (!createRes.ok) throw new Error('create failed');
    const { mnemonic, setupToken } = createRes;
    expect(mnemonic.split(' ')).toHaveLength(12);

    // 3. ConfirmSetup — supply all 12 words as challenge (0-indexed positions 1-12).
    const words = mnemonic.split(' ');
    const confirmWords: Record<string, string> = {};
    for (let i = 0; i < 12; i++) {
      confirmWords[String(i + 1)] = words[i]!;
    }
    const confirmRes = await h.handleConfirmSetup({ setupToken, confirmWords });
    expect(confirmRes.ok).toBe(true);
    if (!confirmRes.ok) throw new Error(`confirmSetup failed: ${confirmRes.error.message}`);

    // 4. Active workspace session now holds the MK.
    const session = getActiveWorkspace();
    expect(session).not.toBeNull();
    expect(session?.folderPath).toBe(tmpDir);
    expect(session?.deviceId).toBe(DEVICE_A);
    expect(session?.mk).toHaveLength(32);

    // 5. Construct EncryptedMultiDeviceEventLog with the unlocked MK.
    const log = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: session!.mk,
    });

    // 6. Append an event.
    const eventId = '01EVENTZ0000000000000000AA';
    const event = makeEvent(eventId);
    await log.append(event);

    // Verify the encrypted file was written.
    const encFilePath = path.join(tmpDir, `events-${DEVICE_A}.ndjson`);
    const rawContent = await fs.readFile(encFilePath, 'utf8');
    expect(rawContent.trim().length).toBeGreaterThan(0);
    // Must contain the event id in plaintext (AAD) but not the account name.
    expect(rawContent).toContain(eventId);
    expect(rawContent).not.toContain('Test Account');

    // 7. Load decrypts and returns the original event.
    // Use a fresh instance: the log's seenIds set is populated by append(), so
    // calling load() on the same instance would skip already-seen ids.
    const logForRead = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: session!.mk,
    });
    const loaded = await logForRead.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.id).toBe(eventId);
    expect((loaded[0]! as typeof event).payload).toEqual({ name: 'Test Account' });
  }, 30_000 /* Argon2id can take ~500ms; give 30s for slow CI */);

  it('full join lifecycle: detect → create → confirm → enroll second device → append → load merged', async () => {
    const DEVICE_B = '01JWDEVCEBBBBBBBBBBBBBBBBB';
    const depsA = makeDeps();
    const depsB = makeDeps();

    const hA = createWorkspaceHandlers(depsA);

    // Device A: creates the workspace.
    const createRes = await hA.handleCreate({ folderPath: tmpDir });
    if (!createRes.ok) throw new Error('create failed');
    const { mnemonic, setupToken } = createRes;

    const words = mnemonic.split(' ');
    const confirmWords: Record<string, string> = { '1': words[0]!, '2': words[1]!, '3': words[2]! };
    const confirmRes = await hA.handleConfirmSetup({ setupToken, confirmWords });
    if (!confirmRes.ok) throw new Error(`confirm failed: ${JSON.stringify(confirmRes)}`);

    const sessionA = getActiveWorkspace();
    if (!sessionA) throw new Error('no session after confirmSetup');

    // Append one event as device A.
    const logA = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: sessionA.mk,
    });
    const eventAId = '01EVENTA0000000000000000AA';
    await logA.append(makeEvent(eventAId));

    // Snapshot the MK before reset so _resetWorkspaceSession()'s wipe doesn't zero it.
    const mkACopy = new Uint8Array(sessionA.mk);

    // Device B: enroll via the mnemonic.
    _resetWorkspaceSession();
    const hB = createWorkspaceHandlers({ ...depsB, deviceId: () => DEVICE_B });
    const enrollRes = await hB.handleEnroll({
      folderPath: tmpDir,
      mnemonic,
      deviceLabel: 'Device-B',
    });
    expect(enrollRes.ok).toBe(true);
    if (!enrollRes.ok) throw new Error(`enroll failed: ${JSON.stringify(enrollRes)}`);
    expect(enrollRes.event.deviceId).toBe(DEVICE_B);

    const sessionB = getActiveWorkspace();
    if (!sessionB) throw new Error('no session after enroll');

    // MKs must be equal (same shared master key).
    expect(Buffer.from(mkACopy).equals(Buffer.from(sessionB.mk))).toBe(true);

    // Append one event as device B.
    const logB = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_B,
      masterKey: sessionB.mk,
    });
    const eventBId = '01EVENTB0000000000000000BB';
    await logB.append(makeEvent(eventBId));

    // Device A reads all events (both device files) — fresh instance so seenIds don't filter.
    const logMerged = new EncryptedMultiDeviceEventLog({
      dir: tmpDir,
      deviceId: DEVICE_A,
      masterKey: mkACopy,
    });
    const allEvents = await logMerged.load();
    const ids = allEvents.map((e) => e.id);
    expect(ids).toContain(eventAId);
    expect(ids).toContain(eventBId);
    // ULIDs sort lexicographically: A < B.
    expect(ids.indexOf(eventAId)).toBeLessThan(ids.indexOf(eventBId));
  }, 60_000 /* two Argon2id derivations */);

  it('recovery flow: detect(recovery state) → recover via mnemonic → unlock succeeds', async () => {
    const deps = makeDeps();
    const h = createWorkspaceHandlers(deps);

    // Set up a workspace as device A.
    const createRes = await h.handleCreate({ folderPath: tmpDir });
    if (!createRes.ok) throw new Error('create failed');
    const { mnemonic, setupToken } = createRes;
    const words = mnemonic.split(' ');
    const cw = { '1': words[0]!, '2': words[1]!, '3': words[2]! };
    const confirmRes = await h.handleConfirmSetup({ setupToken, confirmWords: cw });
    if (!confirmRes.ok) throw new Error('confirm failed');

    // Simulate safeStorage being unavailable for recovery.
    _resetWorkspaceSession();
    const recoveryDeps = makeDeps({
      isEncryptionAvailable: () => false,
      safeStorageEncrypt: (plain) => {
        // Recovery path re-wraps under safeStorage. We need encrypt to still work
        // even though detection says unavailable (detect uses safeStorageAvailable
        // but the re-wrap in recover does use encrypt).
        const buf = Buffer.from(plain, 'utf8');
        for (let i = 0; i < buf.length; i++) buf[i] = (buf[i] ?? 0) ^ 0xab;
        return buf;
      },
    });
    const hRecovery = createWorkspaceHandlers(recoveryDeps);

    // Detect → recovery state.
    const detectRes = await hRecovery.handleDetect({ folderPath: tmpDir });
    expect(detectRes.ok).toBe(true);
    if (!detectRes.ok) throw new Error('detect failed');
    expect(detectRes.state).toBe('recovery');

    // Recover via mnemonic.
    const recoverRes = await hRecovery.handleRecover({ mnemonic });
    expect(recoverRes.ok).toBe(true);
    if (!recoverRes.ok) throw new Error(`recover failed: ${JSON.stringify(recoverRes)}`);
    expect(recoverRes.event.type).toBe('device.recovered');

    // Session is now active.
    const session = getActiveWorkspace();
    expect(session).not.toBeNull();
    expect(session?.mk).toHaveLength(32);
  }, 30_000);
});
