// SPEC-026 §5.1 — Workspace state detection.
//
// Pure-Node, no Electron dependency. Determines which of the 4 states a
// workspace folder is in, given the folder path and this device's ULID.
//
// State table (spec §5.1, post legacy-format removal — see
// .squad/decisions.md D2 / Pedro directive 2026-05-13):
//   1 fresh     — no events.key, no events-*.ndjson (first-run setup).
//                 Also returned for folders containing only a stray legacy
//                 `events.ndjson` — the legacy unencrypted format is no
//                 longer supported. Callers can inspect `hadLegacyFile` on
//                 the result if they want to surface a one-line hint to
//                 the user (Trinity wires this into FreshSetupFlow).
//   2 join      — events.key exists, this deviceId NOT in devices[]
//   3 unlock    — events.key exists, deviceId in devices[], safeStorage works
//   4 recovery  — events.key exists, deviceId in devices[], safeStorage fails

import { promises as fs } from 'node:fs';
import {
  loadKeyFile,
  KEY_FILE_NOT_FOUND,
  KEY_FILE_SCHEMA_INVALID,
  KEY_FILE_INVALID_JSON,
  KEY_FILE_UNSUPPORTED_VERSION,
} from '../eventLog/keyFile.js';
import type { KeyFileError } from '../eventLog/keyFile.js';

export type WorkspaceState = 'fresh' | 'join' | 'unlock' | 'recovery';

export interface DetectionResult {
  state: WorkspaceState;
  /** True when the device entry was found in events.key devices[]. */
  hasDeviceWrap: boolean;
  /**
   * True when the folder contains a stray legacy unencrypted `events.ndjson`.
   * Only set when `state === 'fresh'` — every other state implies an encrypted
   * workspace took over. Surfaced so the fresh-setup screen can warn the user
   * that the legacy file will be ignored.
   */
  hadLegacyFile: boolean;
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
      return { state: 'fresh', hasDeviceWrap: false, hadLegacyFile: false };
    }
    throw err;
  }

  const hasLegacyFile = entries.includes('events.ndjson');
  const hasKeyFile = entries.includes('events.key');
  const DEVICE_FILE_RE = /^events-[0-9A-HJKMNP-TV-Z]{26}\.ndjson$/;
  const hasAnyDeviceFile = entries.some((f) => DEVICE_FILE_RE.test(f));

  // Legacy `events.ndjson` is no longer a supported state. A folder containing
  // only the legacy file (or the legacy file alongside no encrypted artifacts)
  // is treated as `fresh` — the user will be routed to FreshSetupFlow and the
  // legacy file is ignored on disk. `hadLegacyFile` is propagated so the
  // setup screen can warn the user (decision: .squad/decisions.md D2).
  if (!hasKeyFile && !hasAnyDeviceFile) {
    return { state: 'fresh', hasDeviceWrap: false, hadLegacyFile: hasLegacyFile };
  }

  // If there are device files but no key file that's an unusual partial state —
  // still route to 'fresh' so the user can complete setup.
  if (!hasKeyFile) {
    return { state: 'fresh', hasDeviceWrap: false, hadLegacyFile: hasLegacyFile };
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
      return { state: 'fresh', hasDeviceWrap: false, hadLegacyFile: hasLegacyFile };
    }
    throw err;
  }

  // State 2: events.key exists but this device is not enrolled.
  const deviceEntry = keyFile.devices.find((d) => d.deviceId === deviceId);
  if (!deviceEntry) {
    return { state: 'join', hasDeviceWrap: false, hadLegacyFile: false };
  }

  // Device IS enrolled. State 3 vs 4 depends on whether safeStorage is usable.
  if (!safeStorageAvailable) {
    return { state: 'recovery', hasDeviceWrap: true, hadLegacyFile: false };
  }

  // State 3: safeStorage available — attempt will happen in workspace:unlock.
  return { state: 'unlock', hasDeviceWrap: true, hadLegacyFile: false };
}
