// Device ID persistence (P1-1 trial-readiness).
//
// Manages the per-laptop device ID stored in userData/device.json. This ID is
// stable across app launches and identifies "which laptop wrote this event" in
// the actorDeviceId field of DomainEventBase.
//
// The device ID is a real ULID (not fake), generated on first launch, and
// persisted atomically (tmp → fsync → rename) for crash safety.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import { newUlid } from './ids.js';

// Zod schema — device.json structure
export const deviceSchema = z.object({
  deviceId: z.string().length(26), // ULID
  createdAt: z.string().datetime(), // ISO 8601 UTC
});

export type Device = z.infer<typeof deviceSchema>;

const DEVICE_FILENAME = 'device.json';

/**
 * Load device.json from the userData directory.
 * If the file doesn't exist, generate a new device ID and persist it.
 * Returns the device ID (never null).
 */
export async function loadDeviceId(userDataDir: string): Promise<string> {
  const filePath = path.join(userDataDir, DEVICE_FILENAME);

  try {
    const content = await fs.readFile(filePath, 'utf-8');

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Invalid JSON — regenerate and persist
      // eslint-disable-next-line no-console
      console.warn(`[device] Invalid JSON in device.json (${filePath}) — regenerating`);
      return await createAndSaveDevice(userDataDir);
    }

    const result = deviceSchema.safeParse(parsed);

    if (!result.success) {
      // Invalid device.json — regenerate and persist
      // eslint-disable-next-line no-console
      console.warn(
        `[device] Invalid device.json (${filePath}): ${result.error.message} — regenerating`,
      );
      return await createAndSaveDevice(userDataDir);
    }

    return result.data.deviceId;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist — first launch. Generate and persist.
      return await createAndSaveDevice(userDataDir);
    }
    // Unexpected I/O error (permission denied, disk full, etc.) — propagate.
    throw err;
  }
}

/**
 * Generate a new device ID and save it atomically.
 */
async function createAndSaveDevice(userDataDir: string): Promise<string> {
  const device: Device = {
    deviceId: newUlid(),
    createdAt: new Date().toISOString(),
  };

  const filePath = path.join(userDataDir, DEVICE_FILENAME);
  const tmpPath = `${filePath}.tmp`;

  const content = JSON.stringify(device, null, 2);

  // Write to .tmp, fsync, rename atomically (ADR-001 C8)
  await fs.writeFile(tmpPath, content, 'utf-8');
  const fh = await fs.open(tmpPath, 'r+');
  try {
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fs.rename(tmpPath, filePath);

  // eslint-disable-next-line no-console
  console.log(`[device] Generated and saved device ID: ${device.deviceId}`);

  return device.deviceId;
}
