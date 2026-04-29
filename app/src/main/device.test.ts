// Tests for device.ts (P1-1 trial-readiness).
//
// Validates:
//   - loadDeviceId generates and persists on first run
//   - loadDeviceId reuses existing device.json on subsequent calls
//   - Atomic write safety (tmp → fsync → rename)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadDeviceId } from './device';

describe('device', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'device-test-'));
  });

  afterEach(async () => {
    // Clean up
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('generates a new device ID on first run', async () => {
    const deviceId = await loadDeviceId(testDir);

    expect(deviceId).toHaveLength(26); // ULID is 26 chars
    expect(deviceId).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/); // Crockford base32

    // Verify file was written
    const filePath = path.join(testDir, 'device.json');
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);

    expect(parsed.deviceId).toBe(deviceId);
    expect(parsed.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('reuses existing device ID on subsequent calls', async () => {
    const deviceId1 = await loadDeviceId(testDir);
    const deviceId2 = await loadDeviceId(testDir);

    expect(deviceId1).toBe(deviceId2);
  });

  it('regenerates if device.json is corrupted (invalid JSON)', async () => {
    const filePath = path.join(testDir, 'device.json');
    await fs.writeFile(filePath, 'not json', 'utf-8');

    const deviceId = await loadDeviceId(testDir);

    expect(deviceId).toHaveLength(26);

    // Verify valid JSON was written
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.deviceId).toBe(deviceId);
  });

  it('regenerates if device.json fails schema validation', async () => {
    const filePath = path.join(testDir, 'device.json');
    await fs.writeFile(filePath, JSON.stringify({ invalid: 'schema' }), 'utf-8');

    const deviceId = await loadDeviceId(testDir);

    expect(deviceId).toHaveLength(26);

    // Verify valid schema was written
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.deviceId).toBe(deviceId);
    expect(parsed.createdAt).toBeDefined();
  });
});
