// SPEC-026 #301 — Workspace lifecycle IPC handlers.
//
// Implements the 5 workspace channels defined in shared/ipc-contracts/workspace.ts:
//   workspace:detect        — 5-state detection (fresh|join|unlock|recovery|migration)
//   workspace:create        — fresh setup: generate MK + 12-word mnemonic
//   workspace:confirmSetup  — persist MK after user confirms 3 challenge words
//   workspace:enroll        — join an existing workspace via recovery code
//   workspace:unlock        — silent unlock via safeStorage
//   workspace:recover       — re-wrap MK via recovery code when safeStorage fails
//
// All Electron-specific dependencies (safeStorage, hostname) are injected for
// testability — see WorkspaceDeps and buildProductionWorkspaceDeps().
//
// Key material lifecycle:
//   - MK is generated in workspace:create and held in `pendingSetups` until
//     workspace:confirmSetup completes (then wiped from pending).
//   - After confirmSetup / enroll / unlock / recover, the MK moves into the
//     process-lifetime ActiveWorkspace session (workspace-session.ts).
//   - The EncryptedMultiDeviceEventLog reads the MK from the session singleton.

import * as os from 'node:os';
import { promises as fs } from 'node:fs';
import {
  workspaceDetectRequestSchema,
  workspaceCreateRequestSchema,
  workspaceConfirmSetupRequestSchema,
  workspaceEnrollRequestSchema,
  workspaceUnlockRequestSchema,
  workspaceRecoverRequestSchema,
  type WorkspaceDetectResponse,
  type WorkspaceCreateResponse,
  type WorkspaceConfirmSetupResponse,
  type WorkspaceEnrollResponse,
  type WorkspaceUnlockResponse,
  type WorkspaceRecoverResponse,
} from '../../../shared/ipc-contracts/workspace.js';
import { detectWorkspaceState } from '../../../core/workspace/detect.js';
import { loadKeyFile, saveKeyFile } from '../../../core/eventLog/keyFile.js';
import type { KeyFileV2 } from '../../../core/eventLog/keyFile.js';
import { generateMasterKey, wrapKey, unwrapKey } from '../../../core/crypto/masterKey.js';
import { randomBytes, wipe } from '../../../core/crypto/primitives.js';
import {
  generateMnemonic,
  validateMnemonic,
  normalizeMnemonic,
} from '../../../core/crypto/mnemonic.js';
import { deriveRecoveryKey, DEFAULT_ARGON2_PARAMS } from '../../../core/crypto/recoveryKey.js';
import { newUlid } from '../../ids.js';
import {
  setActiveWorkspace,
  setLastDetectedFolderPath,
  getLastDetectedFolderPath,
} from '../../workspace-session.js';

// ── Deps injection ──────────────────────────────────────────────────────────

export interface WorkspaceDeps {
  /** Returns this device's ULID (from bootstrap.getDeviceId()). */
  deviceId(): string;
  /** Whether Electron's safeStorage encryption is available on this OS user. */
  isEncryptionAvailable(): boolean;
  /** safeStorage.encryptString — encrypts a plaintext string under the OS keychain. */
  safeStorageEncrypt(plaintext: string): Buffer;
  /** safeStorage.decryptString — decrypts a Buffer previously encrypted by the OS keychain. */
  safeStorageDecrypt(ciphertext: Buffer): string;
  /** OS hostname for device label defaults. */
  hostname(): string;
  /** Current time — injectable for deterministic tests. */
  now(): Date;
}

// ── Pending setup state ──────────────────────────────────────────────────────
// Holds in-memory MK + mnemonic between workspace:create and workspace:confirmSetup.
// Keyed by the opaque setupToken returned to the renderer.

interface PendingSetup {
  folderPath: string;
  mk: Uint8Array;
  mnemonic: string;
}

const pendingSetups = new Map<string, PendingSetup>();

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Encode a Uint8Array as base64. Works with both Buffer and Uint8Array. */
function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/** Decode a base64 string to Uint8Array. */
function fromBase64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/**
 * Wrap a Master Key under Electron safeStorage.
 * Returns base64(encrypted_bytes) suitable for storage in events.key.
 */
function wrapMkWithSafeStorage(mk: Uint8Array, deps: WorkspaceDeps): string {
  const mkBase64 = toBase64(mk);
  const encrypted = deps.safeStorageEncrypt(mkBase64);
  return encrypted.toString('base64');
}

/**
 * Unwrap a Master Key that was wrapped with safeStorage.
 * @param wrapSafeStorage — base64 of the encrypted blob from events.key.
 */
function unwrapMkFromSafeStorage(wrapSafeStorage: string, deps: WorkspaceDeps): Uint8Array {
  const encryptedBuf = Buffer.from(wrapSafeStorage, 'base64');
  const mkBase64 = deps.safeStorageDecrypt(encryptedBuf);
  return fromBase64(mkBase64);
}

/**
 * Wrap a Master Key under an Argon2id-derived recovery key.
 * Returns base64(nonce || ciphertext || tag).
 */
function wrapMkWithRecoveryKey(mk: Uint8Array, recoveryKey: Uint8Array): string {
  const wrap = wrapKey(mk, recoveryKey);
  const combined = Buffer.concat([wrap.nonce, wrap.ciphertext]);
  return toBase64(combined);
}

/**
 * Unwrap a Master Key from a recovery-wrap blob.
 * @param wrapRecovery — base64(nonce || ciphertext || tag) from events.key.
 */
function unwrapMkFromRecoveryKey(wrapRecovery: string, recoveryKey: Uint8Array): Uint8Array {
  const combined = fromBase64(wrapRecovery);
  const nonce = combined.slice(0, 24);
  const ciphertext = combined.slice(24);
  return unwrapKey({ ciphertext, nonce }, recoveryKey);
}

function makeErrorResponse(code: string, message: string, field?: string) {
  return {
    ok: false as const,
    error: { code, message, ...(field ? { field } : {}) },
  };
}

// ── Handler factory ──────────────────────────────────────────────────────────

export function createWorkspaceHandlers(deps: WorkspaceDeps) {
  // ── workspace:detect ────────────────────────────────────────────────────

  async function handleDetect(raw: unknown): Promise<WorkspaceDetectResponse> {
    const parsed = workspaceDetectRequestSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return makeErrorResponse('invalid_request', parsed.error.message);
    }

    const folderPath = parsed.data.folderPath ?? getLastDetectedFolderPath() ?? undefined;
    if (!folderPath) {
      return makeErrorResponse(
        'no_folder',
        'No workspace folder path provided or previously detected.',
      );
    }

    try {
      const result = await detectWorkspaceState(
        folderPath,
        deps.deviceId(),
        deps.isEncryptionAvailable(),
      );
      // Track the folder path so unlock/recover can use it without re-passing.
      setLastDetectedFolderPath(folderPath);
      return { ok: true, state: result.state, folderPath };
    } catch (err) {
      return makeErrorResponse('detection_failed', (err as Error).message);
    }
  }

  // ── workspace:create ─────────────────────────────────────────────────────

  async function handleCreate(raw: unknown): Promise<WorkspaceCreateResponse> {
    const parsed = workspaceCreateRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return makeErrorResponse('invalid_request', parsed.error.message);
    }
    const { folderPath } = parsed.data;

    // Validate folder path exists (or can be created).
    try {
      await fs.mkdir(folderPath, { recursive: true });
    } catch (err) {
      return makeErrorResponse(
        'folder_error',
        `Cannot access or create workspace folder: ${(err as Error).message}`,
        'folderPath',
      );
    }

    // Ensure folder is actually a directory.
    try {
      const stat = await fs.stat(folderPath);
      if (!stat.isDirectory()) {
        return makeErrorResponse(
          'folder_error',
          'Workspace path must be a directory.',
          'folderPath',
        );
      }
    } catch (err) {
      return makeErrorResponse('folder_error', (err as Error).message, 'folderPath');
    }

    const mk = generateMasterKey();
    const mnemonic = generateMnemonic();
    const setupToken = newUlid();

    // Store the pending setup. MK is held here until confirmSetup.
    pendingSetups.set(setupToken, { folderPath, mk, mnemonic });

    // Track folder path for subsequent unlock/recover.
    setLastDetectedFolderPath(folderPath);

    return { ok: true, mnemonic, setupToken };
  }

  // ── workspace:confirmSetup ───────────────────────────────────────────────

  async function handleConfirmSetup(raw: unknown): Promise<WorkspaceConfirmSetupResponse> {
    const parsed = workspaceConfirmSetupRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return makeErrorResponse('invalid_request', parsed.error.message);
    }
    const { setupToken, confirmWords } = parsed.data;

    const pending = pendingSetups.get(setupToken);
    if (!pending) {
      return makeErrorResponse(
        'invalid_setup_token',
        'Setup token is invalid or expired. Please restart the setup flow.',
      );
    }

    // Validate the challenge words.
    const words = pending.mnemonic.split(' ');
    for (const [posStr, word] of Object.entries(confirmWords)) {
      const pos = parseInt(posStr, 10);
      if (isNaN(pos) || pos < 1 || pos > 12) {
        return makeErrorResponse(
          'invalid_position',
          `Position "${posStr}" is not in range 1-12.`,
          `word${posStr}`,
        );
      }
      const expected = words[pos - 1];
      if (expected !== word) {
        return makeErrorResponse(
          'confirmation_mismatch',
          `Word at position ${pos} does not match.`,
          `word${pos}`,
        );
      }
    }

    // All words match — persist the workspace.
    const { folderPath, mk, mnemonic } = pending;
    const now = deps.now();
    const deviceId = deps.deviceId();

    let wrapSafeStorage: string;
    try {
      wrapSafeStorage = wrapMkWithSafeStorage(mk, deps);
    } catch (err) {
      return makeErrorResponse(
        'safestorage_error',
        `safeStorage encryption failed: ${(err as Error).message}`,
      );
    }

    // Derive recovery key and wrap MK under it.
    const salt = randomBytes(16);
    let recoveryKey: Uint8Array | null = null;
    let wrapRecovery: string;
    try {
      recoveryKey = await deriveRecoveryKey(mnemonic, salt, {
        m: DEFAULT_ARGON2_PARAMS.m,
        t: DEFAULT_ARGON2_PARAMS.t,
        p: DEFAULT_ARGON2_PARAMS.p,
      });
      wrapRecovery = wrapMkWithRecoveryKey(mk, recoveryKey);
    } finally {
      if (recoveryKey !== null) wipe(recoveryKey);
    }

    const keyFileV2: KeyFileV2 = {
      version: 2,
      devices: [
        {
          deviceId,
          label: deps.hostname(),
          wrap_safestorage: wrapSafeStorage,
          enrolled_at: now.toISOString(),
        },
      ],
      wrap_recovery: wrapRecovery,
      salt: toBase64(salt),
      argon2_params: {
        m_kib: DEFAULT_ARGON2_PARAMS.m,
        t: DEFAULT_ARGON2_PARAMS.t,
        p: DEFAULT_ARGON2_PARAMS.p,
      },
      created_at: now.toISOString(),
    };

    try {
      await saveKeyFile(folderPath, keyFileV2);
    } catch (err) {
      return makeErrorResponse(
        'save_error',
        `Failed to write events.key: ${(err as Error).message}`,
      );
    }

    // Persist the active workspace session with the unlocked MK.
    setActiveWorkspace({ folderPath, deviceId, mk: new Uint8Array(mk) });

    // Clear pending setup (wipe original mk buffer).
    wipe(mk);
    pendingSetups.delete(setupToken);

    const workspaceId = newUlid();
    return {
      ok: true,
      event: {
        id: newUlid(),
        type: 'workspace.created',
        timestamp: now.toISOString(),
        workspaceId,
      },
    };
  }

  // ── workspace:enroll ─────────────────────────────────────────────────────

  async function handleEnroll(raw: unknown): Promise<WorkspaceEnrollResponse> {
    const parsed = workspaceEnrollRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return makeErrorResponse('invalid_request', parsed.error.message);
    }
    const { folderPath, mnemonic, deviceLabel } = parsed.data;
    const deviceId = deps.deviceId();
    const now = deps.now();

    // Validate mnemonic format before the expensive Argon2id derivation.
    const normalizedMnemonic = normalizeMnemonic(mnemonic);
    if (!validateMnemonic(normalizedMnemonic)) {
      return makeErrorResponse(
        'invalid_mnemonic',
        'The recovery code you entered is not valid. Please check and try again.',
        'mnemonic',
      );
    }

    // Load events.key.
    let keyFile: KeyFileV2;
    try {
      const result = await loadKeyFile(folderPath);
      keyFile = result.keyFile;
    } catch (err) {
      return makeErrorResponse(
        'keyfile_error',
        `Cannot read workspace key file: ${(err as Error).message}`,
      );
    }

    // Derive recovery key and attempt to unwrap MK.
    const saltBytes = fromBase64(keyFile.salt);
    let recoveryKey: Uint8Array | null = null;
    let mk: Uint8Array;
    try {
      recoveryKey = await deriveRecoveryKey(normalizedMnemonic, saltBytes, {
        m: keyFile.argon2_params.m_kib,
        t: keyFile.argon2_params.t,
        p: keyFile.argon2_params.p,
      });
      mk = unwrapMkFromRecoveryKey(keyFile.wrap_recovery, recoveryKey);
    } catch {
      return makeErrorResponse(
        'mnemonic_mismatch',
        "That recovery code doesn't match. Please check and try again.",
        'mnemonic',
      );
    } finally {
      if (recoveryKey !== null) wipe(recoveryKey);
    }

    // Wrap MK under this device's safeStorage.
    let wrapSafeStorage: string;
    try {
      wrapSafeStorage = wrapMkWithSafeStorage(mk, deps);
    } catch (err) {
      wipe(mk);
      return makeErrorResponse(
        'safestorage_error',
        `safeStorage encryption failed: ${(err as Error).message}`,
      );
    }

    // Append (or update) this device's entry in devices[].
    const label = deviceLabel ?? deps.hostname();
    const existingIdx = keyFile.devices.findIndex((d) => d.deviceId === deviceId);
    if (existingIdx >= 0) {
      keyFile.devices[existingIdx] = {
        ...keyFile.devices[existingIdx]!,
        label,
        wrap_safestorage: wrapSafeStorage,
        enrolled_at: now.toISOString(),
      };
    } else {
      keyFile.devices.push({
        deviceId,
        label,
        wrap_safestorage: wrapSafeStorage,
        enrolled_at: now.toISOString(),
      });
    }

    try {
      await saveKeyFile(folderPath, keyFile);
    } catch (err) {
      wipe(mk);
      return makeErrorResponse(
        'save_error',
        `Failed to update events.key: ${(err as Error).message}`,
      );
    }

    setActiveWorkspace({ folderPath, deviceId, mk });
    setLastDetectedFolderPath(folderPath);

    return {
      ok: true,
      event: {
        id: newUlid(),
        type: 'device.enrolled',
        timestamp: now.toISOString(),
        deviceId,
        deviceLabel: label,
      },
    };
  }

  // ── workspace:unlock ─────────────────────────────────────────────────────

  async function handleUnlock(raw: unknown): Promise<WorkspaceUnlockResponse> {
    workspaceUnlockRequestSchema?.parse(raw ?? {});

    if (!deps.isEncryptionAvailable()) {
      return {
        ok: false,
        error: {
          code: 'needs-recovery',
          message: 'Automatic unlock is unavailable. Please enter your recovery code.',
          needsRecovery: true,
        },
      };
    }

    const folderPath = getLastDetectedFolderPath();
    if (!folderPath) {
      return makeErrorResponse(
        'no_workspace',
        'No workspace folder detected. Call workspace:detect first.',
      );
    }

    const deviceId = deps.deviceId();

    // Load events.key and find this device's wrap.
    let keyFile: KeyFileV2;
    try {
      const result = await loadKeyFile(folderPath);
      keyFile = result.keyFile;
    } catch (err) {
      return makeErrorResponse(
        'keyfile_error',
        `Cannot read workspace key file: ${(err as Error).message}`,
      );
    }

    const deviceEntry = keyFile.devices.find((d) => d.deviceId === deviceId);
    if (!deviceEntry) {
      return {
        ok: false,
        error: {
          code: 'not_enrolled',
          message: 'This device is not enrolled in the workspace.',
        },
      };
    }

    // Attempt safeStorage decrypt.
    let mk: Uint8Array;
    try {
      mk = unwrapMkFromSafeStorage(deviceEntry.wrap_safestorage, deps);
    } catch {
      return {
        ok: false,
        error: {
          code: 'needs-recovery',
          message: 'Automatic unlock failed. Please enter your recovery code.',
          needsRecovery: true,
        },
      };
    }

    setActiveWorkspace({ folderPath, deviceId, mk });
    return { ok: true };
  }

  // ── workspace:recover ─────────────────────────────────────────────────────

  async function handleRecover(raw: unknown): Promise<WorkspaceRecoverResponse> {
    const parsed = workspaceRecoverRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return makeErrorResponse('invalid_request', parsed.error.message);
    }
    const { mnemonic } = parsed.data;

    const folderPath = getLastDetectedFolderPath();
    if (!folderPath) {
      return makeErrorResponse(
        'no_workspace',
        'No workspace folder detected. Call workspace:detect first.',
      );
    }

    const deviceId = deps.deviceId();
    const now = deps.now();

    // Validate mnemonic format.
    const normalizedMnemonic = normalizeMnemonic(mnemonic);
    if (!validateMnemonic(normalizedMnemonic)) {
      return makeErrorResponse(
        'invalid_mnemonic',
        'The recovery code you entered is not valid. Please check and try again.',
        'mnemonic',
      );
    }

    // Load events.key.
    let keyFile: KeyFileV2;
    try {
      const result = await loadKeyFile(folderPath);
      keyFile = result.keyFile;
    } catch (err) {
      return makeErrorResponse(
        'keyfile_error',
        `Cannot read workspace key file: ${(err as Error).message}`,
      );
    }

    // Derive recovery key and decrypt wrap_recovery → MK.
    const saltBytes = fromBase64(keyFile.salt);
    let recoveryKey: Uint8Array | null = null;
    let mk: Uint8Array;
    try {
      recoveryKey = await deriveRecoveryKey(normalizedMnemonic, saltBytes, {
        m: keyFile.argon2_params.m_kib,
        t: keyFile.argon2_params.t,
        p: keyFile.argon2_params.p,
      });
      mk = unwrapMkFromRecoveryKey(keyFile.wrap_recovery, recoveryKey);
    } catch {
      return makeErrorResponse(
        'mnemonic_mismatch',
        "That recovery code doesn't match. Please check and try again.",
        'mnemonic',
      );
    } finally {
      if (recoveryKey !== null) wipe(recoveryKey);
    }

    // Re-wrap MK under safeStorage and update events.key.
    let wrapSafeStorage: string;
    try {
      wrapSafeStorage = wrapMkWithSafeStorage(mk, deps);
    } catch (err) {
      wipe(mk);
      return makeErrorResponse(
        'safestorage_error',
        `safeStorage encryption failed: ${(err as Error).message}`,
      );
    }

    const existingIdx = keyFile.devices.findIndex((d) => d.deviceId === deviceId);
    if (existingIdx >= 0) {
      keyFile.devices[existingIdx] = {
        ...keyFile.devices[existingIdx]!,
        wrap_safestorage: wrapSafeStorage,
        enrolled_at: now.toISOString(),
      };
    } else {
      // Edge case: device entry was removed; re-add it.
      keyFile.devices.push({
        deviceId,
        label: deps.hostname(),
        wrap_safestorage: wrapSafeStorage,
        enrolled_at: now.toISOString(),
      });
    }

    try {
      await saveKeyFile(folderPath, keyFile);
    } catch (err) {
      wipe(mk);
      return makeErrorResponse(
        'save_error',
        `Failed to update events.key: ${(err as Error).message}`,
      );
    }

    setActiveWorkspace({ folderPath, deviceId, mk });

    return {
      ok: true,
      event: {
        id: newUlid(),
        type: 'device.recovered',
        timestamp: now.toISOString(),
        deviceId,
      },
    };
  }

  return {
    handleDetect,
    handleCreate,
    handleConfirmSetup,
    handleEnroll,
    handleUnlock,
    handleRecover,
  };
}

// ── Production deps factory ──────────────────────────────────────────────────

/**
 * Production WorkspaceDeps — imports Electron lazily so unit tests that load
 * this module without Electron don't blow up at import time.
 */
export async function buildProductionWorkspaceDeps(): Promise<WorkspaceDeps> {
  const { safeStorage } = await import('electron');
  const { getDeviceId } = await import('../../bootstrap.js');

  return {
    deviceId: () => getDeviceId(),
    isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
    safeStorageEncrypt: (plaintext: string) => safeStorage.encryptString(plaintext),
    safeStorageDecrypt: (ciphertext: Buffer) => safeStorage.decryptString(ciphertext),
    hostname: () => os.hostname(),
    now: () => new Date(),
  };
}

// ── Stable channel name re-exports for use in handlers.ts ───────────────────

export {
  IPC_WORKSPACE_DETECT,
  IPC_WORKSPACE_CREATE,
  IPC_WORKSPACE_CONFIRM_SETUP,
  IPC_WORKSPACE_ENROLL,
  IPC_WORKSPACE_UNLOCK,
  IPC_WORKSPACE_RECOVER,
  workspaceDetectResponseSchema,
  workspaceCreateResponseSchema,
  workspaceConfirmSetupResponseSchema,
  workspaceEnrollResponseSchema,
  workspaceUnlockResponseSchema,
  workspaceRecoverResponseSchema,
} from '../../../shared/ipc-contracts/workspace.js';
