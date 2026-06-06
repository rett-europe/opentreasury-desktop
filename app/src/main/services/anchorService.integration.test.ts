// SPEC-028 WI-2 (#358) — Anchor service + event-log frontier integration tests.
//
// Drives the real `EncryptedMultiDeviceEventLog` (fs-backed, real crypto) and a
// real `FileAuditLog` (in-memory blob store, real crypto) through the anchor
// service. Covers: unlock→anchor round trip, recompute-on-second-unlock,
// multi-device frontier capture, tamper localisation, conflict-copy / stale
// refusals, single-flight scheduling, and the never-blocks-writes guarantee.
// Mirrors spec §9.2.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  EncryptedMultiDeviceEventLog,
  eventsFileName,
} from '../../core/eventLog/EncryptedMultiDeviceEventLog.js';
import { generateMasterKey } from '../../core/crypto/masterKey.js';
import {
  FileAuditLog,
  type AuditBlobStore,
  type FileAuditLogDeps,
} from '../../core/audit/AuditLog.js';
import type { AuditEntry } from '../../core/audit/types.js';
import { verifyAnchorAgainstFiles, type RawDeviceFile } from '../../core/audit/frontier.js';
import { randomBytes } from '../../core/crypto/primitives.js';
import type { DomainEvent } from '../../core/eventLog/EventLog.js';
import { runAnchorOnce, AnchorScheduler, type AnchorOutcome } from './anchorService.js';

const DEV_A = '01JWDEVCEAAAAAAAAAAAAAAAAA';
const DEV_B = '01JWDEVCEBBBBBBBBBBBBBBBBB';
const DATASET = '01HDATASETZZZZZZZZZZZZZZZA';

function ulid(prefix: string): string {
  const sanitized = prefix.toUpperCase().replace(/[^0-9A-HJKMNP-TV-Z]/g, '0');
  return (sanitized + '0'.repeat(26)).slice(0, 26);
}

let eventSeq = 0;
function nextEventId(): string {
  eventSeq += 1;
  return ulid(`01JEV${String(eventSeq).padStart(6, '0')}`);
}

function makeEvent(deviceId: string, id = nextEventId()): DomainEvent {
  return {
    id,
    type: 'AccountCreated',
    datasetId: DATASET,
    actorDeviceId: deviceId,
    actorUserId: ulid('USER0001'),
    actorIdentitySource: 'local',
    createdAt: '2026-05-12T12:00:00.000Z',
    dekVersion: 1,
    version: 1,
    payload: { name: `Account-${id.slice(-4)}` },
  } as unknown as DomainEvent;
}

function memStore(): AuditBlobStore {
  const dump = new Map<string, Uint8Array>();
  return {
    async read(name) {
      return dump.get(name) ?? null;
    },
    async write(name, data) {
      dump.set(name, Uint8Array.from(data));
    },
  };
}

function makeAuditLog(store: AuditBlobStore, mk: Uint8Array): FileAuditLog {
  let clock = Date.parse('2025-01-01T00:00:00.000Z');
  const deps: FileAuditLogDeps = {
    store,
    mk,
    datasetId: DATASET,
    deviceId: DEV_A,
    actorUserIdentity: 'treasurer@example.org',
    now: () => new Date(clock++),
  };
  return new FileAuditLog(deps);
}

let ulidSeq = 0;
function newUlid(): string {
  ulidSeq += 1;
  return ulid(`01HANCHOR${String(ulidSeq).padStart(4, '0')}`);
}

/** Read the raw on-disk per-device files for the verification recompute path. */
async function readRawFiles(dir: string): Promise<RawDeviceFile[]> {
  const entries = await fs.readdir(dir);
  const files: RawDeviceFile[] = [];
  for (const f of entries) {
    const m = /^events-([0-9A-HJKMNP-TV-Z]{26})\.ndjson$/.exec(f);
    if (m === null) continue;
    files.push({ deviceId: m[1]!, fileName: f, bytes: await fs.readFile(path.join(dir, f)) });
  }
  return files;
}

describe('anchor service + event-log frontier (integration)', () => {
  let tmpDir: string;
  let mk: Uint8Array;
  let auditMk: Uint8Array;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ot-anchor-'));
    mk = generateMasterKey();
    auditMk = randomBytes(32);
    eventSeq = 0;
    ulidSeq = 0;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function makeEventLog(deviceId: string): EncryptedMultiDeviceEventLog {
    return new EncryptedMultiDeviceEventLog({ dir: tmpDir, deviceId, masterKey: mk });
  }

  it('anchors a single-device log and the anchor verifies against disk', async () => {
    const log = makeEventLog(DEV_A);
    await log.append(makeEvent(DEV_A));
    await log.append(makeEvent(DEV_A));

    const auditLog = makeAuditLog(memStore(), auditMk);
    const outcome = await runAnchorOnce({
      auditLog,
      eventLog: log,
      newUlid,
      now: () => new Date('2025-02-01T00:00:00.000Z'),
    });

    expect(outcome.status).toBe('anchored');
    const entries = (await auditLog.readAll()) as AuditEntry[];
    const anchor = entries[entries.length - 1]!;
    expect(anchor.action).toBe('audit.anchor');

    const files = await readRawFiles(tmpDir);
    const res = verifyAnchorAgainstFiles(anchor.payload!, files, anchor.after_hash);
    expect(res.ok).toBe(true);
    expect(res.devices).toHaveLength(1);
    expect(res.devices[0]!.status).toBe('ok');
  });

  it('captures a multi-device frontier and recompute matches after more writes', async () => {
    const logA = makeEventLog(DEV_A);
    const logB = makeEventLog(DEV_B);
    await logA.append(makeEvent(DEV_A));
    await logB.append(makeEvent(DEV_B));
    await logB.append(makeEvent(DEV_B));
    // logB must hydrate logA's existence; snapshot is taken from logA's view.
    await logA.load();

    const auditLog = makeAuditLog(memStore(), auditMk);
    const first = await runAnchorOnce({
      auditLog,
      eventLog: logA,
      newUlid,
      now: () => new Date('2025-02-01T00:00:00.000Z'),
    });
    expect(first.status).toBe('anchored');

    const entries = (await auditLog.readAll()) as AuditEntry[];
    const anchor = entries[entries.length - 1]!;
    expect(anchor.payload!.device_frontiers).toHaveLength(2);

    // A late append on A: the prior anchor still verifies, with notYetAnchored.
    await logA.append(makeEvent(DEV_A));
    const files = await readRawFiles(tmpDir);
    const res = verifyAnchorAgainstFiles(anchor.payload!, files, anchor.after_hash);
    expect(res.ok).toBe(true);
    const devA = res.devices.find((d) => d.device_id === DEV_A)!;
    expect(devA.notYetAnchored).toBe(1);
  });

  it('localises tamper to the edited device file', async () => {
    const logA = makeEventLog(DEV_A);
    const logB = makeEventLog(DEV_B);
    await logA.append(makeEvent(DEV_A));
    await logB.append(makeEvent(DEV_B));
    await logA.load();

    const auditLog = makeAuditLog(memStore(), auditMk);
    await runAnchorOnce({
      auditLog,
      eventLog: logA,
      newUlid,
      now: () => new Date('2025-02-01T00:00:00.000Z'),
    });
    const entries = (await auditLog.readAll()) as AuditEntry[];
    const anchor = entries[entries.length - 1]!;

    // Corrupt a base64 char inside device B's ciphertext while keeping the line
    // valid JSON, so the recomputed head diverges for B alone.
    const bPath = path.join(tmpDir, eventsFileName(DEV_B));
    const text = (await fs.readFile(bPath)).toString('utf8');
    const idx = text.indexOf('","c":"') + 8; // a byte well inside the `c` value
    const orig = text[idx]!;
    const swapped = orig === 'A' ? 'B' : 'A';
    const tampered = text.slice(0, idx) + swapped + text.slice(idx + 1);
    await fs.writeFile(bPath, tampered);

    const files = await readRawFiles(tmpDir);
    const res = verifyAnchorAgainstFiles(anchor.payload!, files, anchor.after_hash);
    expect(res.ok).toBe(false);
    const devA = res.devices.find((d) => d.device_id === DEV_A)!;
    const devB = res.devices.find((d) => d.device_id === DEV_B)!;
    expect(devA.status).toBe('ok'); // tamper is localised to B
    expect(devB.status).toBe('head-mismatch');
  });

  it('skips anchoring when there are no events', async () => {
    const log = makeEventLog(DEV_A);
    const auditLog = makeAuditLog(memStore(), auditMk);
    const outcome = await runAnchorOnce({
      auditLog,
      eventLog: log,
      newUlid,
      now: () => new Date(),
    });
    expect(outcome.status).toBe('skipped');
    expect((outcome as { reason: string }).reason).toBe('no-events');
  });

  it('refuses to sign when a cloud-sync conflict copy is present', async () => {
    const log = makeEventLog(DEV_A);
    await log.append(makeEvent(DEV_A));
    // Drop a conflict copy alongside the canonical file.
    await fs.writeFile(
      path.join(tmpDir, `events-${DEV_A} (1).ndjson`),
      await fs.readFile(path.join(tmpDir, eventsFileName(DEV_A))),
    );

    const snap = await log.snapshotFrontier();
    expect(snap.ok).toBe(false);
    expect((snap as { reason: string }).reason).toBe('conflict-copy');

    const auditLog = makeAuditLog(memStore(), auditMk);
    const outcome = await runAnchorOnce({
      auditLog,
      eventLog: log,
      newUlid,
      now: () => new Date(),
    });
    expect(outcome.status).toBe('skipped');
    expect((outcome as { reason: string }).reason).toBe('conflict-copy');
  });

  it('refuses to sign a frontier when the own file was edited out of band', async () => {
    const log = makeEventLog(DEV_A);
    await log.append(makeEvent(DEV_A));
    // External edit grows the file behind the in-memory head's back.
    await fs.appendFile(path.join(tmpDir, eventsFileName(DEV_A)), 'garbage-without-newline');

    const snap = await log.snapshotFrontier();
    expect(snap.ok).toBe(false);
    expect((snap as { reason: string }).reason).toBe('own-size-mismatch');
  });

  it('never throws even if the audit log append fails', async () => {
    const log = makeEventLog(DEV_A);
    await log.append(makeEvent(DEV_A));
    const auditLog = makeAuditLog(memStore(), auditMk);
    // Force appendAnchor to throw.
    (auditLog as unknown as { appendAnchor: () => Promise<never> }).appendAnchor = () =>
      Promise.reject(new Error('boom'));

    const outcome = await runAnchorOnce({
      auditLog,
      eventLog: log,
      newUlid,
      now: () => new Date(),
    });
    expect(outcome.status).toBe('error');
  });
});

describe('AnchorScheduler', () => {
  it('fires a count-triggered run at the threshold (off the write path)', async () => {
    let runs = 0;
    const scheduler = new AnchorScheduler({
      thresholdAppends: 3,
      run: async (): Promise<AnchorOutcome> => {
        runs += 1;
        return { status: 'skipped', reason: 'test' };
      },
    });
    scheduler.onLocalAppend(1);
    scheduler.onLocalAppend(1);
    expect(runs).toBe(0); // below threshold, and never synchronous
    scheduler.onLocalAppend(1);
    // queued in a microtask — let it drain.
    await Promise.resolve();
    await Promise.resolve();
    expect(runs).toBe(1);
    scheduler.dispose();
  });

  it('fires a timer-triggered run armed on the first write', async () => {
    let runs = 0;
    let armed: (() => void) | null = null;
    const scheduler = new AnchorScheduler({
      thresholdAppends: 1000,
      intervalMs: 999,
      setTimer: (cb) => {
        armed = cb;
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: () => {
        armed = null;
      },
      run: async (): Promise<AnchorOutcome> => {
        runs += 1;
        return { status: 'skipped', reason: 'test' };
      },
    });
    scheduler.onLocalAppend(1);
    expect(armed).not.toBeNull();
    armed!(); // simulate the timer firing
    await Promise.resolve();
    expect(runs).toBe(1);
    scheduler.dispose();
  });

  it('anchorNow is single-flight and runs once more after an in-flight run', async () => {
    const flush = async (): Promise<void> => {
      for (let i = 0; i < 8; i++) await Promise.resolve();
    };
    let active = 0;
    let maxConcurrent = 0;
    let runs = 0;
    const releasers: Array<() => void> = [];
    const scheduler = new AnchorScheduler({
      run: async (): Promise<AnchorOutcome> => {
        runs += 1;
        active += 1;
        maxConcurrent = Math.max(maxConcurrent, active);
        await new Promise<void>((r) => releasers.push(r));
        active -= 1;
        return { status: 'skipped', reason: 'test' };
      },
    });

    const first = scheduler.anchorNow();
    await flush();
    const second = scheduler.anchorNow();
    await flush();
    expect(runs).toBe(1); // second is waiting for the first to finish

    releasers.shift()!(); // finish the first run
    await flush(); // second run should now have started
    expect(runs).toBe(2);

    releasers.shift()!(); // finish the second run
    await first;
    await second;

    expect(maxConcurrent).toBe(1); // never overlap
    scheduler.dispose();
  });

  it('returns skipped once disposed', async () => {
    const scheduler = new AnchorScheduler({
      run: async (): Promise<AnchorOutcome> => ({ status: 'anchored', seq: 1, eventLogRoot: 'x' }),
    });
    scheduler.dispose();
    const outcome = await scheduler.anchorNow();
    expect(outcome.status).toBe('skipped');
  });
});
