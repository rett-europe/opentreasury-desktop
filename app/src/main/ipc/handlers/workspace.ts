// SPEC-026 #301 — Workspace lifecycle IPC handlers.
//
// Implements the 7 workspace channels defined in shared/ipc-contracts/workspace.ts:
//   workspace:detect        — 4-state detection (fresh|join|unlock|recovery)
//   workspace:create        — fresh setup: generate MK + 12-word mnemonic
//   workspace:confirmSetup  — persist MK after user confirms 3 challenge words
//   workspace:enroll        — join an existing workspace via recovery code
//   workspace:unlock        — silent unlock via safeStorage
//   workspace:recover       — re-wrap MK via recovery code when safeStorage fails
//   workspace:lock          — zeroize MK from in-memory session (MEDIUM-2)
//
// All Electron-specific dependencies (safeStorage, hostname, homeDir) are injected for
// testability — see WorkspaceDeps and buildProductionWorkspaceDeps().
//
// MEDIUM-3 (accepted risk): workspace:create returns the freshly-generated 12-word
// mnemonic to the renderer for one-time display + confirmation. We accept this
// because the renderer must show it to the user in plaintext anyway. Mitigation:
// the pendingSetups entry holding the same mnemonic in main is bounded by a 5-min
// TTL and a 10-entry cap (MEDIUM-1), and is wiped on confirmSetup or eviction.
//
// Key material lifecycle:
//   - MK is generated in workspace:create and held in `pendingSetups` until
//     workspace:confirmSetup completes (then wiped from pending).
//   - After confirmSetup / enroll / unlock / recover, the MK moves into the
//     process-lifetime ActiveWorkspace session (workspace-session.ts).
//   - The EncryptedMultiDeviceEventLog reads the MK from the session singleton.

import * as os from 'node:os';
import * as path from 'node:path';
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
  type WorkspaceLockResponse,
} from '../../../shared/ipc-contracts/workspace.js';
import { detectWorkspaceState } from '../../../core/workspace/detect.js';
import { bootTrace } from '../../bootTrace.js';
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
  clearActiveWorkspace,
  setLastDetectedFolderPath,
  getLastDetectedFolderPath,
} from '../../workspace-session.js';
import type { IntegrityVerdict } from '../../../shared/ipc-contracts/audit-integrity.js';

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
  /** User home directory root — injectable so tests can permit os.tmpdir(). */
  homeDir(): string;
  /**
   * Returns the configured workspace dataDir from appConfig, or null if unset
   * (first-run, before user picked a folder). Resolved to an absolute path.
   *
   * Cold-start fallback for workspace:detect / workspace:unlock: when the
   * renderer omits `folderPath` and the in-memory `lastDetectedFolderPath`
   * has not been populated yet (fresh app launch), handlers consult this
   * to recover the workspace location from persisted app config.
   */
  getConfiguredDataDir?: () => string | null;
  /**
   * SPEC-026 — Install the encrypted event log into the main-process
   * bootstrap singleton after a successful confirmSetup / enroll / unlock /
   * recover. The handler passes the device ULID and the unlocked Master Key
   * (copied internally — caller retains ownership). After this resolves,
   * `getEventLog()` returns the encrypted log and the in-memory read model
   * has been hydrated from every per-device events file in the workspace.
   *
   * Optional so tests can stub a no-op; production wires it to
   * `bootstrap.installEncryptedEventLog`.
   */
  installEncryptedEventLog?: (deviceId: string, mk: Uint8Array) => Promise<void>;

  /**
   * SPEC-028 WI-2 — best-effort, BOUNDED anchor invoked on `workspace:lock`
   * BEFORE the master key is wiped. Folds a final signed frontier snapshot into
   * the audit chain so the just-locked session is tamper-evident. Optional so
   * tests can omit it; production wires it to `bootstrap.anchorNowBeforeLock`.
   * Must never throw and must resolve promptly (it is internally time-bounded).
   */
  anchorBeforeLock?: () => Promise<void>;

  /**
   * SPEC-028 WI-3 — tear the workspace back down after a fail-closed
   * verify-on-unlock verdict so it is NOT left readable in memory. Invoked by
   * the unlock handlers when `installEncryptedEventLog` throws a
   * `WorkspaceIntegrityError`. Production wires it to
   * `bootstrap.lockWorkspaceAfterIntegrityFailure`.
   */
  lockWorkspaceAfterIntegrityFailure?: () => void;

  /**
   * SPEC-028 WI-3 — returns the verdict from the most recent verify-on-unlock so
   * the OK-path responses can carry it to the Audit viewer (WI-4) without the
   * renderer re-verifying. Production wires it to
   * `bootstrap.getLastUnlockIntegrityVerdict`.
   */
  getLastUnlockIntegrityVerdict?: () => IntegrityVerdict | null;
}

/**
 * SPEC-028 WI-3 — structural guard for the fail-closed integrity error thrown by
 * `installEncryptedEventLog`. Matched by shape (name + `verdict`) rather than by
 * `instanceof` to avoid a static import of the main bootstrap module (which
 * loads Electron) into this otherwise Electron-free handler module.
 */
function isWorkspaceIntegrityError(err: unknown): err is { verdict: IntegrityVerdict } {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { name?: unknown }).name === 'WorkspaceIntegrityError' &&
    'verdict' in err
  );
}

// ── Pending setup state (MEDIUM-1 hardening: TTL + cap) ─────────────────────
// Holds in-memory MK + mnemonic between workspace:create and workspace:confirmSetup.
// Keyed by the opaque setupToken returned to the renderer. Each entry is bounded
// by a 5-minute TTL and the map is capped at 10 entries — overflow evicts oldest.

interface PendingSetup {
  folderPath: string;
  mk: Uint8Array;
  mnemonic: string;
  timer: ReturnType<typeof setTimeout>;
}

const PENDING_SETUP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const PENDING_SETUP_MAX = 10;

const pendingSetups = new Map<string, PendingSetup>();

function evictPendingSetup(setupToken: string): void {
  const entry = pendingSetups.get(setupToken);
  if (entry) {
    clearTimeout(entry.timer);
    wipe(entry.mk);
    pendingSetups.delete(setupToken);
  }
}

function storePendingSetup(setupToken: string, setup: Omit<PendingSetup, 'timer'>): void {
  if (pendingSetups.size >= PENDING_SETUP_MAX) {
    const oldestKey = pendingSetups.keys().next().value;
    if (oldestKey !== undefined) evictPendingSetup(oldestKey);
  }
  const timer = setTimeout(() => evictPendingSetup(setupToken), PENDING_SETUP_TTL_MS);
  if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
    (timer as { unref(): void }).unref();
  }
  pendingSetups.set(setupToken, { ...setup, timer });
}

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

// ── Path boundary validation (HIGH-1 / LOW-1) ──────────────────────────────
//
// Allowlist policy: workspace folder must reside under the user's home directory
// (os.homedir()) after full path resolution. This covers all realistic cases:
// OneDrive, Desktop, Documents, and any custom sub-folder of home.
// Rejected: UNC paths, Windows device prefixes, and '..' after resolve.
//
// homeDir is taken from WorkspaceDeps.homeDir() for testability.

export function validateFolderBoundary(
  folderPath: string,
  homeDir: string,
): { ok: true; normalized: string } | { ok: false; reason: string } {
  if (folderPath.startsWith('\\\\')) {
    return { ok: false, reason: 'UNC and Windows device paths are not allowed' };
  }
  const normalized = path.resolve(folderPath);
  if (normalized.includes('..')) {
    return { ok: false, reason: 'Path traversal detected' };
  }
  if (normalized.startsWith('\\\\?\\') || normalized.startsWith('\\\\.\\')) {
    return { ok: false, reason: 'Windows device paths are not allowed' };
  }
  const normalizedHome = path.resolve(homeDir);
  const homeWithSep = normalizedHome.endsWith(path.sep)
    ? normalizedHome
    : normalizedHome + path.sep;
  if (normalized !== normalizedHome && !normalized.startsWith(homeWithSep)) {
    return { ok: false, reason: 'Workspace folder must be within your home directory' };
  }
  return { ok: true, normalized };
}

// ── Error message sanitization (LOW-2) ────────────────────────────────────
const WIN_ABS_PATH_RE = /[A-Za-z]:\\[^\s,'"]+/g;
const UNC_PATH_RE = /\\\\[^\s,'"]+/g;
const POSIX_ABS_PATH_RE = /\/[^\s,'"]+/g;

function sanitizeFsError(raw: string): string {
  return raw
    .replace(WIN_ABS_PATH_RE, '<path>')
    .replace(UNC_PATH_RE, '<path>')
    .replace(POSIX_ABS_PATH_RE, '<path>');
}

// ── Rate limiter (LOW-3) ───────────────────────────────────────────────────
const RATE_WINDOWS: Record<string, { maxCalls: number; windowMs: number }> = {
  detect: { maxCalls: 60, windowMs: 60_000 },
  create: { maxCalls: 10, windowMs: 60_000 },
  confirmSetup: { maxCalls: 20, windowMs: 60_000 },
  enroll: { maxCalls: 10, windowMs: 60_000 },
  unlock: { maxCalls: 30, windowMs: 60_000 },
  recover: { maxCalls: 10, windowMs: 60_000 },
  lock: { maxCalls: 30, windowMs: 60_000 },
};

interface RateEntry {
  count: number;
  resetAt: number;
}
const rateCounters = new Map<string, RateEntry>();

function checkRateLimit(channel: string): boolean {
  const limit = RATE_WINDOWS[channel];
  if (!limit) return true;
  const now = Date.now();
  const entry = rateCounters.get(channel);
  if (!entry || now >= entry.resetAt) {
    rateCounters.set(channel, { count: 1, resetAt: now + limit.windowMs });
    return true;
  }
  if (entry.count >= limit.maxCalls) return false;
  entry.count += 1;
  return true;
}

function makeErrorResponse(code: string, message: string, field?: string) {
  return {
    ok: false as const,
    error: { code, message: sanitizeFsError(message), ...(field ? { field } : {}) },
  };
}

function rateLimitedError() {
  return makeErrorResponse('rate_limited', 'Too many requests. Please wait before retrying.');
}

/** Test-only: clear the module-global rate-limit counters between tests. */
export function _resetWorkspaceRateLimits(): void {
  rateCounters.clear();
}

// ── Handler factory ──────────────────────────────────────────────────────────

export function createWorkspaceHandlers(deps: WorkspaceDeps) {
  const homeDir = deps.homeDir();

  // ── workspace:detect ────────────────────────────────────────────────────

  async function handleDetect(raw: unknown): Promise<WorkspaceDetectResponse> {
    if (!checkRateLimit('detect')) return rateLimitedError();
    const parsed = workspaceDetectRequestSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return makeErrorResponse('invalid_request', parsed.error.message);
    }

    const rawFolderPath =
      parsed.data.folderPath ??
      getLastDetectedFolderPath() ??
      deps.getConfiguredDataDir?.() ??
      undefined;
    if (!rawFolderPath) {
      return makeErrorResponse(
        'no_folder',
        'No workspace folder path provided or previously detected.',
      );
    }

    const boundary = validateFolderBoundary(rawFolderPath, homeDir);
    if (!boundary.ok) {
      return makeErrorResponse('invalid_path', boundary.reason, 'folderPath');
    }
    const folderPath = boundary.normalized;

    try {
      bootTrace('detect:start');
      const result = await detectWorkspaceState(
        folderPath,
        deps.deviceId(),
        deps.isEncryptionAvailable(),
      );
      bootTrace('detect:end', { state: result.state });
      // Track the folder path so unlock/recover can use it without re-passing.
      setLastDetectedFolderPath(folderPath);
      return { ok: true, state: result.state, folderPath, hadLegacyFile: result.hadLegacyFile };
    } catch (err) {
      return makeErrorResponse('detection_failed', (err as Error).message);
    }
  }

  // ── workspace:create ─────────────────────────────────────────────────────

  async function handleCreate(raw: unknown): Promise<WorkspaceCreateResponse> {
    if (!checkRateLimit('create')) return rateLimitedError();
    const parsed = workspaceCreateRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return makeErrorResponse('invalid_request', parsed.error.message);
    }

    const boundary = validateFolderBoundary(parsed.data.folderPath, homeDir);
    if (!boundary.ok) {
      return makeErrorResponse('invalid_path', boundary.reason, 'folderPath');
    }
    const folderPath = boundary.normalized;

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

    // Store the pending setup. MK is held here until confirmSetup (or TTL eviction).
    storePendingSetup(setupToken, { folderPath, mk, mnemonic });

    // Track folder path for subsequent unlock/recover.
    setLastDetectedFolderPath(folderPath);

    return { ok: true, mnemonic, setupToken };
  }

  // ── workspace:confirmSetup ───────────────────────────────────────────────

  async function handleConfirmSetup(raw: unknown): Promise<WorkspaceConfirmSetupResponse> {
    if (!checkRateLimit('confirmSetup')) return rateLimitedError();
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

    // SPEC-026 — Install the encrypted event log so the renderer can read
    // events on this freshly-created workspace.
    try {
      await deps.installEncryptedEventLog?.(deviceId, mk);
    } catch (err) {
      if (isWorkspaceIntegrityError(err)) {
        deps.lockWorkspaceAfterIntegrityFailure?.();
        evictPendingSetup(setupToken);
        return {
          ok: false,
          error: {
            code: 'integrity-failure',
            message: 'Workspace integrity verification failed. Recovery is required.',
            needsRecovery: true,
            integrity: err.verdict,
          },
        };
      }
      // eslint-disable-next-line no-console
      console.error(
        `[workspace] confirmSetup: installEncryptedEventLog failed: ${(err as Error).message}`,
      );
    }

    // Clear pending setup (wipe original mk buffer + clear TTL timer).
    evictPendingSetup(setupToken);

    const workspaceId = newUlid();
    return {
      ok: true,
      event: {
        id: newUlid(),
        type: 'workspace.created',
        timestamp: now.toISOString(),
        workspaceId,
      },
      integrity: deps.getLastUnlockIntegrityVerdict?.() ?? undefined,
    };
  }

  // ── workspace:enroll ─────────────────────────────────────────────────────

  async function handleEnroll(raw: unknown): Promise<WorkspaceEnrollResponse> {
    if (!checkRateLimit('enroll')) return rateLimitedError();
    const parsed = workspaceEnrollRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return makeErrorResponse('invalid_request', parsed.error.message);
    }
    const { folderPath: rawFolderPath, mnemonic, deviceLabel } = parsed.data;
    const boundary = validateFolderBoundary(rawFolderPath, homeDir);
    if (!boundary.ok) {
      return makeErrorResponse('invalid_path', boundary.reason, 'folderPath');
    }
    const folderPath = boundary.normalized;
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

    // SPEC-026 — Install the encrypted event log so the renderer can read
    // events from peer-device files (e.g. the workspace creator's events).
    try {
      await deps.installEncryptedEventLog?.(deviceId, mk);
    } catch (err) {
      if (isWorkspaceIntegrityError(err)) {
        deps.lockWorkspaceAfterIntegrityFailure?.();
        return {
          ok: false,
          error: {
            code: 'integrity-failure',
            message: 'Workspace integrity verification failed. Recovery is required.',
            needsRecovery: true,
            integrity: err.verdict,
          },
        };
      }
      // eslint-disable-next-line no-console
      console.error(
        `[workspace] enroll: installEncryptedEventLog failed: ${(err as Error).message}`,
      );
    }

    return {
      ok: true,
      event: {
        id: newUlid(),
        type: 'device.enrolled',
        timestamp: now.toISOString(),
        deviceId,
        deviceLabel: label,
      },
      integrity: deps.getLastUnlockIntegrityVerdict?.() ?? undefined,
    };
  }

  // ── workspace:unlock ─────────────────────────────────────────────────────

  async function handleUnlock(raw: unknown): Promise<WorkspaceUnlockResponse> {
    if (!checkRateLimit('unlock')) {
      return {
        ok: false,
        error: { code: 'rate_limited', message: 'Too many requests. Please wait before retrying.' },
      };
    }
    bootTrace('unlock:start');
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

    const folderPath = getLastDetectedFolderPath() ?? deps.getConfiguredDataDir?.() ?? null;
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
      bootTrace('decrypt:start');
      mk = unwrapMkFromSafeStorage(deviceEntry.wrap_safestorage, deps);
      bootTrace('decrypt:end');
    } catch {
      bootTrace('decrypt:fail');
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

    // SPEC-026 — Install the encrypted event log so the renderer's first
    // queries after silent unlock hit a hydrated read model.
    try {
      await deps.installEncryptedEventLog?.(deviceId, mk);
      bootTrace('unlock:end', { ok: true });
    } catch (err) {
      if (isWorkspaceIntegrityError(err)) {
        deps.lockWorkspaceAfterIntegrityFailure?.();
        return {
          ok: false,
          error: {
            code: 'integrity-failure',
            message: 'Workspace integrity verification failed. Recovery is required.',
            needsRecovery: true,
            integrity: err.verdict,
          },
        };
      }
      // eslint-disable-next-line no-console
      console.error(
        `[workspace] unlock: installEncryptedEventLog failed: ${(err as Error).message}`,
      );
    }

    return { ok: true, integrity: deps.getLastUnlockIntegrityVerdict?.() ?? undefined };
  }

  // ── workspace:recover ─────────────────────────────────────────────────────

  async function handleRecover(raw: unknown): Promise<WorkspaceRecoverResponse> {
    if (!checkRateLimit('recover')) return rateLimitedError();
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

    // SPEC-026 — Install the encrypted event log so the renderer sees events
    // immediately after recovery, without needing a restart.
    try {
      await deps.installEncryptedEventLog?.(deviceId, mk);
    } catch (err) {
      if (isWorkspaceIntegrityError(err)) {
        deps.lockWorkspaceAfterIntegrityFailure?.();
        return {
          ok: false,
          error: {
            code: 'integrity-failure',
            message: 'Workspace integrity verification failed. Restore from a trusted backup.',
            needsRecovery: true,
            integrity: err.verdict,
          },
        };
      }
      // eslint-disable-next-line no-console
      console.error(
        `[workspace] recover: installEncryptedEventLog failed: ${(err as Error).message}`,
      );
    }

    return {
      ok: true,
      event: {
        id: newUlid(),
        type: 'device.recovered',
        timestamp: now.toISOString(),
        deviceId,
      },
      integrity: deps.getLastUnlockIntegrityVerdict?.() ?? undefined,
    };
  }

  // ── workspace:lock (MEDIUM-2) ────────────────────────────────────────────
  async function handleLock(_raw: unknown): Promise<WorkspaceLockResponse> {
    if (!checkRateLimit('lock')) {
      return {
        ok: false,
        error: { code: 'rate_limited', message: 'Too many requests. Please wait before retrying.' },
      };
    }
    // SPEC-028 WI-2 — fold a final signed frontier snapshot into the audit chain
    // BEFORE clearActiveWorkspace() wipes the MK. Bounded + best-effort: on
    // timeout or error we still proceed to lock (anchoring must never block).
    try {
      await deps.anchorBeforeLock?.();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[workspace] lock: anchorBeforeLock failed: ${(err as Error).message}`);
    }
    clearActiveWorkspace();
    return { ok: true };
  }

  return {
    handleDetect,
    handleCreate,
    handleConfirmSetup,
    handleEnroll,
    handleUnlock,
    handleRecover,
    handleLock,
  };
}

// ── Production deps factory ──────────────────────────────────────────────────

/**
 * Production WorkspaceDeps — imports Electron lazily so unit tests that load
 * this module without Electron don't blow up at import time.
 */
export async function buildProductionWorkspaceDeps(): Promise<WorkspaceDeps> {
  const { safeStorage } = await import('electron');
  const {
    getDeviceId,
    getEffectiveEventLogDirOrNull,
    installEncryptedEventLog,
    anchorNowBeforeLock,
    lockWorkspaceAfterIntegrityFailure,
    getLastUnlockIntegrityVerdict,
  } = await import('../../bootstrap.js');

  return {
    deviceId: () => getDeviceId(),
    isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
    safeStorageEncrypt: (plaintext: string) => safeStorage.encryptString(plaintext),
    safeStorageDecrypt: (ciphertext: Buffer) => safeStorage.decryptString(ciphertext),
    hostname: () => os.hostname(),
    now: () => new Date(),
    homeDir: () => os.homedir(),
    // Reuse bootstrap's already-resolved absolute path (applies the same
    // relative-to-userDataDir resolution rule as resolveEventLogDir). Returns
    // null while onboarding is pending (appConfig.dataDir === null).
    getConfiguredDataDir: () => getEffectiveEventLogDirOrNull(),
    // SPEC-026 — Wire post-unlock event-log installation.
    installEncryptedEventLog: async (deviceId: string, mk: Uint8Array) => {
      await installEncryptedEventLog(deviceId, mk);
    },
    // SPEC-028 WI-2 — bounded, best-effort anchor before lock wipes the MK.
    anchorBeforeLock: () => anchorNowBeforeLock(),
    // SPEC-028 WI-3 — fail-closed teardown + OK-path verdict accessor.
    lockWorkspaceAfterIntegrityFailure: () => lockWorkspaceAfterIntegrityFailure(),
    getLastUnlockIntegrityVerdict: () => getLastUnlockIntegrityVerdict(),
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
  IPC_WORKSPACE_LOCK,
  workspaceDetectResponseSchema,
  workspaceCreateResponseSchema,
  workspaceConfirmSetupResponseSchema,
  workspaceEnrollResponseSchema,
  workspaceUnlockResponseSchema,
  workspaceRecoverResponseSchema,
  workspaceLockResponseSchema,
} from '../../../shared/ipc-contracts/workspace.js';
