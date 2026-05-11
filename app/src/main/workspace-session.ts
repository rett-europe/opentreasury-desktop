// SPEC-026 — In-memory workspace session singleton.
//
// Holds the unlocked workspace state for the lifetime of the Electron process.
// Once the workspace is unlocked (via safeStorage, mnemonic, or recovery), the
// Master Key lives here until process exit or explicit clear.
//
// Design notes:
// - Only main-process code ever holds the MK. Never passes to renderer.
// - wipe() zeros the MK buffer when the session is replaced or cleared to
//   minimise the window where the key lives in process memory.

import { wipe } from '../core/crypto/primitives.js';

export interface ActiveWorkspace {
  /** Absolute path to the workspace folder (cloud-synced shared folder). */
  readonly folderPath: string;
  /** This device's ULID. */
  readonly deviceId: string;
  /** Unwrapped 256-bit Master Key. Wiped on clearActiveWorkspace(). */
  readonly mk: Uint8Array;
}

// In-memory state — one unlocked workspace per process lifetime.
let activeWorkspace: ActiveWorkspace | null = null;

// Last folder path observed via workspace:detect — used by unlock/recover
// when the request carries no explicit folderPath.
let lastDetectedFolderPath: string | null = null;

export function setActiveWorkspace(ws: ActiveWorkspace): void {
  if (activeWorkspace !== null) {
    wipe(activeWorkspace.mk);
  }
  activeWorkspace = ws;
}

export function getActiveWorkspace(): ActiveWorkspace | null {
  return activeWorkspace;
}

export function clearActiveWorkspace(): void {
  if (activeWorkspace !== null) {
    wipe(activeWorkspace.mk);
    activeWorkspace = null;
  }
}

export function setLastDetectedFolderPath(p: string): void {
  lastDetectedFolderPath = p;
}

export function getLastDetectedFolderPath(): string | null {
  return lastDetectedFolderPath;
}

/** Reset all session state — only for tests. */
export function _resetWorkspaceSession(): void {
  clearActiveWorkspace();
  lastDetectedFolderPath = null;
}
