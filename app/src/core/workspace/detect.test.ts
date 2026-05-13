// Unit tests for detectWorkspaceState (SPEC-026 §5.1 — 5-state detection table).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { detectWorkspaceState } from './detect.js';
import { saveKeyFile } from '../eventLog/keyFile.js';
import type { KeyFileV2 } from '../eventLog/keyFile.js';

const DEVICE_A = '01JWDEVCEAAAAAAAAAAAAAAAAA';
const DEVICE_B = '01JWDEVCEBBBBBBBBBBBBBBBBB';

function makeKeyFileV2(deviceId: string): KeyFileV2 {
  return {
    version: 2,
    devices: [
      {
        deviceId,
        label: 'TestDevice',
        wrap_safestorage: Buffer.alloc(64).toString('base64'),
        enrolled_at: '2026-05-12T12:00:00.000Z',
      },
    ],
    wrap_recovery: Buffer.alloc(64).toString('base64'),
    salt: Buffer.alloc(16).toString('base64'),
    argon2_params: { m_kib: 65536, t: 4, p: 1 },
    created_at: '2026-05-12T12:00:00.000Z',
  };
}

describe('detectWorkspaceState', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ot-detect-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns fresh when folder does not exist', async () => {
    const result = await detectWorkspaceState(path.join(tmpDir, 'nonexistent'), DEVICE_A, true);
    expect(result.state).toBe('fresh');
    expect(result.hasDeviceWrap).toBe(false);
    expect(result.hadLegacyFile).toBe(false);
  });

  it('returns fresh when folder is empty', async () => {
    const result = await detectWorkspaceState(tmpDir, DEVICE_A, true);
    expect(result.state).toBe('fresh');
    expect(result.hadLegacyFile).toBe(false);
  });

  it('returns fresh with hadLegacyFile=true when only legacy events.ndjson exists', async () => {
    // SPEC-026 cleanup (.squad/decisions.md D2 / Pedro directive 2026-05-13):
    // the legacy unencrypted format is no longer supported. A stray events.ndjson
    // must NOT route to a migration screen — it collapses into fresh-setup,
    // with hadLegacyFile surfaced so the UI can warn the user the file will
    // be ignored.
    await fs.writeFile(path.join(tmpDir, 'events.ndjson'), '{}');
    const result = await detectWorkspaceState(tmpDir, DEVICE_A, true);
    expect(result.state).toBe('fresh');
    expect(result.hadLegacyFile).toBe(true);
  });

  it('returns fresh when only device files exist (partial state — no key)', async () => {
    await fs.writeFile(path.join(tmpDir, `events-${DEVICE_A}.ndjson`), '');
    const result = await detectWorkspaceState(tmpDir, DEVICE_A, true);
    expect(result.state).toBe('fresh');
  });

  it('returns join when events.key exists but deviceId not in devices[]', async () => {
    await saveKeyFile(tmpDir, makeKeyFileV2(DEVICE_A));
    const result = await detectWorkspaceState(tmpDir, DEVICE_B, true);
    expect(result.state).toBe('join');
    expect(result.hasDeviceWrap).toBe(false);
  });

  it('returns unlock when events.key exists, deviceId enrolled, safeStorage available', async () => {
    await saveKeyFile(tmpDir, makeKeyFileV2(DEVICE_A));
    const result = await detectWorkspaceState(tmpDir, DEVICE_A, true);
    expect(result.state).toBe('unlock');
    expect(result.hasDeviceWrap).toBe(true);
  });

  it('returns recovery when events.key exists, deviceId enrolled, safeStorage unavailable', async () => {
    await saveKeyFile(tmpDir, makeKeyFileV2(DEVICE_A));
    const result = await detectWorkspaceState(tmpDir, DEVICE_A, false);
    expect(result.state).toBe('recovery');
    expect(result.hasDeviceWrap).toBe(true);
  });

  it('returns fresh (not throws) when events.key exists but is malformed JSON', async () => {
    await fs.writeFile(path.join(tmpDir, 'events.key'), 'NOT JSON');
    const result = await detectWorkspaceState(tmpDir, DEVICE_A, true);
    expect(result.state).toBe('fresh');
  });

  it('returns fresh when events.key has invalid schema', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'events.key'),
      JSON.stringify({ version: 2, broken: true }),
    );
    const result = await detectWorkspaceState(tmpDir, DEVICE_A, true);
    expect(result.state).toBe('fresh');
  });
});
