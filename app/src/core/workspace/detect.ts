// SPEC-026 §5.1 — Workspace state detection.
//
// Pure-Node, no Electron dependency. Determines which of the 5 states a
// workspace folder is in, given the folder path and this device's ULID.
//
// State table (spec §5.1):
//   1 fresh     — no events.key, no events-*.ndjson (first-run setup)
//   2 join      — events.key exists, this deviceId NOT in devices[]
//   3 unlock    — events.key exists, deviceId in devices[], safeStorage works
//   4 recovery  — events.key exists, deviceId in devices[], safeStorage fails
//   5 migration — legacy events.ndjson (single file) exists, no events.key

import { promises as fs } from 'node:fs';
import {
  loadKeyFile,
  KEY_FILE_NOT_FOUND,
  KEY_FILE_SCHEMA_INVALID,
  KEY_FILE_INVALID_JSON,
  KEY_FILE_UNSUPPORTED_VERSION,
} from '../eventLog/keyFile.js';
import type { KeyFileError } from '../eventLog/keyFile.js';

export type WorkspaceState = 'fresh' | 'join' | 'unlock' | 'recovery' | 'migration';

export interface DetectionResult {
  state: WorkspaceState;
  /** True when the device entry was found in events.key devices[]. */
  hasDeviceWrap: boolean;
}

/**
 * Detect the workspace state for the given folder + device.
 *
 * @param dir - Absolute path to the workspace folder (cloud-synced shared folder).
 * @param deviceId - This device's ULID (from device.json, per-machine).
 * @param safeStorageAvailable - Whether Electron's safeStorage.isEncryptionAvailable()
 *   returns true. Controls the unlock vs recovery split when the device IS enrolled.
 *   Pass false in tests / when Electron is unavailable.
 */
export async function detectWorkspaceState(
  dir: string,
  deviceId: string,
  safeStorageAvailable: boolean,
): Promise<DetectionResult> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // Folder does not exist yet — treat as fresh (user just typed a new path).
      return { state: 'fresh', hasDeviceWrap: false };
    }
    throw err;
  }

  const hasLegacyFile = entries.includes('events.ndjson');
  const hasKeyFile = entries.includes('events.key');
  const DEVICE_FILE_RE = /^events-[0-9A-HJKMNP-TV-Z]{26}\.ndjson$/;
  const hasAnyDeviceFile = entries.some((f) => DEVICE_FILE_RE.test(f));

  // State 5: legacy single plaintext file exists, no events.key → migration.
  if (hasLegacyFile && !hasKeyFile) {
    return { state: 'migration', hasDeviceWrap: false };
  }

  // State 1: no events.key and no per-device files → fresh.
  if (!hasKeyFile && !hasAnyDeviceFile) {
    return { state: 'fresh', hasDeviceWrap: false };
  }

  // If there are device files but no key file that's an unusual partial state —
  // still route to 'fresh' so the user can complete setup.
  if (!hasKeyFile) {
    return { state: 'fresh', hasDeviceWrap: false };
  }

  // events.key exists — attempt to read and validate it.
  let keyFile;
  try {
    const result = await loadKeyFile(dir);
    keyFile = result.keyFile;
  } catch (err) {
    const code = (err as KeyFileError).code;
    if (
      code === KEY_FILE_NOT_FOUND ||
      code === KEY_FILE_INVALID_JSON ||
      code === KEY_FILE_SCHEMA_INVALID ||
      code === KEY_FILE_UNSUPPORTED_VERSION
    ) {
      // Key file is present but unreadable — surface as fresh so the user
      // can start over. The caller may wish to log the original error.
      return { state: 'fresh', hasDeviceWrap: false };
    }
    throw err;
  }

  // State 2: events.key exists but this device is not enrolled.
  const deviceEntry = keyFile.devices.find((d) => d.deviceId === deviceId);
  if (!deviceEntry) {
    return { state: 'join', hasDeviceWrap: false };
  }

  // Device IS enrolled. State 3 vs 4 depends on whether safeStorage is usable.
  if (!safeStorageAvailable) {
    return { state: 'recovery', hasDeviceWrap: true };
  }

  // State 3: safeStorage available — attempt will happen in workspace:unlock.
  return { state: 'unlock', hasDeviceWrap: true };
}
