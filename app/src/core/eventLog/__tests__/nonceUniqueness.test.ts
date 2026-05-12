// SPEC-026 #306 — Nonce uniqueness across the entire workspace (AC17).
//
// AC17 (spec §17): "Per-event nonces are unique across all device files
// (verified by globbing the workspace and asserting `set(nonces).size ===
// total_count`)."
//
// Each XChaCha20-Poly1305 ciphertext is `base64(nonce || cipher || tag)` where
// the nonce is 24 bytes (libsodium `crypto_aead_xchacha20poly1305_ietf_NPUBBYTES`).
// `generateNonce()` uses `randombytes_buf` — collision probability at our scale
// (~1e3 events / workspace, 192 bits of entropy) is < 2^-160. We never the less
// assert it empirically here so a future regression (e.g. someone wires in a
// CTR-style monotonic nonce keyed by deviceId) is caught immediately.
//
// Scope: 3 simulated devices each writing 100 events into the same workspace
// folder. We then glob `events-*.ndjson`, parse every line, slice the nonce
// from the base64-decoded ciphertext, and assert `set.size === total_count`.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import { EncryptedMultiDeviceEventLog, eventsFileName } from '../EncryptedMultiDeviceEventLog.js';
import { generateMasterKey } from '../../crypto/masterKey.js';
import type { DomainEvent } from '../EventLog.js';

const NONCE_BYTES = 24; // XChaCha20-Poly1305 IETF nonce length

// Local ULID generator. We cannot import `main/ids.ts` from `core/` (ADR-002
// §2.4 — core is Electron-free); inline a minimal Crockford-base32 ULID here
// for test fixtures only.
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
    name: `Account-${id.slice(-4)}`,
    label: 'L',
    currency: 'EUR',
    openingBalance: 0,
    sortOrder: 0,
    createdAt: '2026-05-12T12:00:00.000Z',
    actorDeviceId: deviceId,
  } as unknown as DomainEvent;
}

describe('SPEC-026 AC17 — nonce uniqueness across the workspace', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ot-nonce-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('no nonce repeats across 3 devices × 100 events (300 total)', async () => {
    const mk = generateMasterKey();
    const devices = [newUlid(), newUlid(), newUlid()];
    const EVENTS_PER_DEVICE = 100;

    for (const deviceId of devices) {
      const log = new EncryptedMultiDeviceEventLog({
        dir: tmpDir,
        deviceId,
        masterKey: mk,
      });
      const batch: DomainEvent[] = [];
      for (let i = 0; i < EVENTS_PER_DEVICE; i++) {
        batch.push(makeEvent(newUlid(), deviceId));
      }
      await log.appendBatch(batch);
    }

    // Walk every device file, extract every nonce from every encrypted line.
    const entries = await fs.readdir(tmpDir);
    const eventFiles = entries.filter((f) => /^events-.*\.ndjson$/.test(f));
    expect(eventFiles).toHaveLength(devices.length);

    const nonces = new Set<string>();
    let total = 0;
    for (const f of eventFiles) {
      const raw = await fs.readFile(path.join(tmpDir, f), 'utf8');
      for (const line of raw.split('\n')) {
        if (line.length === 0) continue;
        const parsed = JSON.parse(line) as { id: string; c: string };
        const combined = Buffer.from(parsed.c, 'base64');
        // First 24 bytes is the nonce (per `encryptEvent` layout).
        const nonce = combined.subarray(0, NONCE_BYTES).toString('hex');
        nonces.add(nonce);
        total++;
      }
    }

    expect(total).toBe(devices.length * EVENTS_PER_DEVICE);
    // The cardinal AC17 assertion — no nonce repeats anywhere.
    expect(nonces.size).toBe(total);
  });

  it('reloading a workspace and writing more events does not repeat nonces with the original batch', async () => {
    // Regression guard: opening a new log instance must not reset any
    // counter / seed that could collide with previously persisted nonces.
    const mk = generateMasterKey();
    const deviceId = newUlid();

    const log1 = new EncryptedMultiDeviceEventLog({ dir: tmpDir, deviceId, masterKey: mk });
    await log1.appendBatch(Array.from({ length: 50 }, () => makeEvent(newUlid(), deviceId)));

    // Fresh process simulation: brand-new instance, no shared in-memory state.
    const log2 = new EncryptedMultiDeviceEventLog({ dir: tmpDir, deviceId, masterKey: mk });
    await log2.appendBatch(Array.from({ length: 50 }, () => makeEvent(newUlid(), deviceId)));

    const raw = await fs.readFile(path.join(tmpDir, eventsFileName(deviceId)), 'utf8');
    const lines = raw.split('\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(100);

    const nonces = new Set<string>();
    for (const line of lines) {
      const parsed = JSON.parse(line) as { id: string; c: string };
      nonces.add(Buffer.from(parsed.c, 'base64').subarray(0, NONCE_BYTES).toString('hex'));
    }
    expect(nonces.size).toBe(100);
  });
});
