// SPEC-026 #309 — Per-device key file (`events.key`) read / write / migrate.
//
// File location: `<workspaceDir>/events.key`
// Lifecycle: written once at workspace creation (multi-wrap, includes the
// initial device's safeStorage wrap + a shared recovery wrap). Updated when
// new devices enroll (append a `DeviceWrap` to `devices[]`).
//
// Key file v2 (the schema we ship) — multi-wrap, multi-device:
// {
//   "version": 2,
//   "devices": [
//     {
//       "deviceId":      "<26-char ULID>",
//       "label":         "Pedro's Surface",
//       "wrap_safestorage": "<base64(nonce||cipher||tag)>",  // MK wrapped under
//                                                            //   safeStorage KEK
//       "enrolled_at":   "2026-05-12T12:00:00.000Z"
//     }
//   ],
//   "wrap_recovery":  "<base64(nonce||cipher||tag)>",          // MK wrapped under
//                                                              //   Argon2id(mnemonic)
//   "salt":           "<base64(16 random bytes)>",
//   "argon2_params":  { "m_kib": 65536, "t": 4, "p": 1 },      // store inline so
//                                                              //   future tunings
//                                                              //   stay backward
//                                                              //   compatible
//   "created_at":     "2026-05-12T11:59:59.000Z"
// }
//
// Key file v1 (legacy single-device pre multi-user redesign) — modeled here
// for forward-compat / migration only. Field shape:
// {
//   "version": 1,
//   "wrap_safestorage": "...",
//   "wrap_recovery":    "...",
//   "salt":             "...",
//   "argon2_params":    { ... },
//   "created_at":       "..."
// }
//
// Design notes:
// - Pure-Node (no Electron import): the safeStorage KEK is provided by the
//   main-process layer; this module only manipulates already-wrapped material.
// - Argon2id params are *immutable per workspace* (changing them breaks the
//   recovery wrap). They are persisted inside `events.key` so a future
//   tuning of `DEFAULT_ARGON2_PARAMS` does not invalidate older workspaces.
// - Atomic writes: `tmp → fsync → rename` per ADR-001 C8 and the SPEC-026
//   crash-safety contract (§3.3 of the migration spec).

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';

// ---- Shared constants ------------------------------------------------------

export const KEY_FILE_NAME = 'events.key';

/** Latest on-disk schema version we know how to write. */
export const KEY_FILE_VERSION = 2 as const;

// ---- Zod schemas -----------------------------------------------------------

const argon2ParamsSchema = z.object({
  m_kib: z.number().int().positive(),
  t: z.number().int().positive(),
  p: z.number().int().positive(),
});

const deviceWrapSchema = z.object({
  deviceId: z.string().length(26),
  label: z.string().min(1).max(120),
  wrap_safestorage: z.string().min(1),
  enrolled_at: z.string().datetime(),
  /**
   * Set to `true` only on device entries written by the one-shot migration
   * script (`scripts/migrate-workspace.mjs`). Indicates that `wrap_safestorage`
   * is NOT OS-encrypted material -- it contains the same ciphertext as
   * `wrap_recovery` as a structural placeholder. Code that reads this entry
   * MUST NOT call `safeStorage.decryptString()` on it; instead route to the
   * re-enroll flow. Absent on all normal (app-created) device entries.
   */
  migration_placeholder: z.boolean().optional(),
});

export const keyFileV2Schema = z.object({
  version: z.literal(2),
  devices: z.array(deviceWrapSchema).min(1),
  wrap_recovery: z.string().min(1),
  salt: z.string().min(1),
  argon2_params: argon2ParamsSchema,
  created_at: z.string().datetime(),
});

export const keyFileV1Schema = z.object({
  version: z.literal(1),
  wrap_safestorage: z.string().min(1),
  wrap_recovery: z.string().min(1),
  salt: z.string().min(1),
  argon2_params: argon2ParamsSchema,
  created_at: z.string().datetime(),
});

export type Argon2ParamsPersisted = z.infer<typeof argon2ParamsSchema>;
export type DeviceWrap = z.infer<typeof deviceWrapSchema>;
export type KeyFileV2 = z.infer<typeof keyFileV2Schema>;
export type KeyFileV1 = z.infer<typeof keyFileV1Schema>;

// ---- Error codes (stable for callers) --------------------------------------

export const KEY_FILE_NOT_FOUND = 'KEY_FILE_NOT_FOUND';
export const KEY_FILE_INVALID_JSON = 'KEY_FILE_INVALID_JSON';
export const KEY_FILE_SCHEMA_INVALID = 'KEY_FILE_SCHEMA_INVALID';
export const KEY_FILE_UNSUPPORTED_VERSION = 'KEY_FILE_UNSUPPORTED_VERSION';

export interface KeyFileError extends Error {
  code: string;
}

function makeKeyFileError(code: string, message: string): KeyFileError {
  const err: KeyFileError = Object.assign(new Error(message), { code });
  return err;
}

// ---- Migration -------------------------------------------------------------

export interface V1MigrationContext {
  /** ULID of the device that owned the v1 wrap (becomes `devices[0].deviceId`). */
  deviceId: string;
  /** Human-readable label for the migrated device entry. */
  label: string;
  /** Optional clock injection for deterministic tests. */
  now?: Date;
}

/**
 * Convert a parsed v1 key file into a v2 key file. The single
 * `wrap_safestorage` becomes the first device entry; everything else is
 * carried across unchanged. The caller is responsible for persisting the
 * result (`saveKeyFile`).
 */
export function migrateKeyFileV1ToV2(v1: KeyFileV1, ctx: V1MigrationContext): KeyFileV2 {
  const now = (ctx.now ?? new Date()).toISOString();
  return {
    version: 2,
    devices: [
      {
        deviceId: ctx.deviceId,
        label: ctx.label,
        wrap_safestorage: v1.wrap_safestorage,
        enrolled_at: now,
      },
    ],
    wrap_recovery: v1.wrap_recovery,
    salt: v1.salt,
    argon2_params: v1.argon2_params,
    created_at: v1.created_at,
  };
}

// ---- Read / write ----------------------------------------------------------

export interface LoadKeyFileOptions {
  /**
   * If the on-disk file is v1, the loader will auto-migrate to v2 in memory
   * using this context. The migrated value is returned with `migrated: true`
   * but is NOT persisted to disk (the caller decides when to flush — typically
   * after also creating the new device's safeStorage wrap).
   */
  migration?: V1MigrationContext;
}

export interface LoadKeyFileResult {
  keyFile: KeyFileV2;
  /** True iff the on-disk file was v1 and was auto-migrated in memory. */
  migrated: boolean;
}

/**
 * Read and validate `events.key` from `dir`. Throws a `KeyFileError` with a
 * stable `code` on every failure path so callers can branch deterministically:
 *
 *   - `KEY_FILE_NOT_FOUND`        — no file present (ENOENT)
 *   - `KEY_FILE_INVALID_JSON`     — file present but not parseable as JSON
 *   - `KEY_FILE_SCHEMA_INVALID`   — JSON parses but does not match v1/v2 schema
 *   - `KEY_FILE_UNSUPPORTED_VERSION` — `version` field is unknown (e.g. v3 from
 *     a newer app build) — caller should refuse to mount the workspace.
 */
export async function loadKeyFile(
  dir: string,
  opts: LoadKeyFileOptions = {},
): Promise<LoadKeyFileResult> {
  const filePath = path.join(dir, KEY_FILE_NAME);

  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw makeKeyFileError(KEY_FILE_NOT_FOUND, `events.key not found at ${filePath}`);
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw makeKeyFileError(
      KEY_FILE_INVALID_JSON,
      `events.key at ${filePath} is not valid JSON: ${(err as Error).message}`,
    );
  }

  const version = readVersion(parsed);

  if (version === 2) {
    const result = keyFileV2Schema.safeParse(parsed);
    if (!result.success) {
      throw makeKeyFileError(
        KEY_FILE_SCHEMA_INVALID,
        `events.key v2 at ${filePath} failed schema validation: ${result.error.message}`,
      );
    }
    return { keyFile: result.data, migrated: false };
  }

  if (version === 1) {
    const result = keyFileV1Schema.safeParse(parsed);
    if (!result.success) {
      throw makeKeyFileError(
        KEY_FILE_SCHEMA_INVALID,
        `events.key v1 at ${filePath} failed schema validation: ${result.error.message}`,
      );
    }
    if (!opts.migration) {
      // Caller asked to load without supplying migration context — surface as
      // a schema-invalid (not "unsupported version") because we DO support v1
      // when the caller opts in to migration.
      throw makeKeyFileError(
        KEY_FILE_SCHEMA_INVALID,
        `events.key at ${filePath} is v1 — pass opts.migration to auto-upgrade to v2`,
      );
    }
    const v2 = migrateKeyFileV1ToV2(result.data, opts.migration);
    return { keyFile: v2, migrated: true };
  }

  throw makeKeyFileError(
    KEY_FILE_UNSUPPORTED_VERSION,
    `events.key at ${filePath} has unsupported version ${String(version)} — this build understands v1 (auto-migrated) and v2`,
  );
}

/**
 * Atomically write `events.key` to `dir`. Pattern: write to `events.key.tmp`,
 * `fsync` the file handle, then `fs.rename` to `events.key`. NTFS guarantees
 * same-directory rename is atomic (ADR-001 C8); on POSIX this is also atomic.
 *
 * The caller is responsible for ordering: per SPEC-026 §3.3, `events.key`
 * must be the *last* file flipped in the migration / encryption flow so a
 * crash mid-write never leaves a workspace where the key is committed but
 * the events are not.
 */
export async function saveKeyFile(dir: string, keyFile: KeyFileV2): Promise<void> {
  // Validate before writing — refuse to persist a malformed file.
  const result = keyFileV2Schema.safeParse(keyFile);
  if (!result.success) {
    throw makeKeyFileError(
      KEY_FILE_SCHEMA_INVALID,
      `refusing to write malformed events.key: ${result.error.message}`,
    );
  }

  await fs.mkdir(dir, { recursive: true });

  const filePath = path.join(dir, KEY_FILE_NAME);
  const tmpPath = `${filePath}.tmp`;

  // 2-space indent: the file is small (a few KB), human-readable diffs in
  // OneDrive version history matter more than byte count.
  // LOW-3: mode 0o600 (owner read/write only) on POSIX. On Windows the mode
  // argument is ignored by the OS; NTFS permissions are managed separately.
  const body = JSON.stringify(result.data, null, 2);
  const fileMode = process.platform !== 'win32' ? 0o600 : undefined;

  await fs.writeFile(tmpPath, body, { encoding: 'utf8', mode: fileMode });
  const handle = await fs.open(tmpPath, 'r+');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmpPath, filePath);

  // POSIX only: fsync the parent directory so the directory entry for
  // `events.key` is durable after a power failure. On NTFS (Windows) this
  // is unnecessary — the rename is already journalled — and opening a
  // directory for write access is not supported.
  if (process.platform !== 'win32') {
    const dirHandle = await fs.open(dir, 'r');
    try {
      await dirHandle.sync();
    } finally {
      await dirHandle.close();
    }
  }
}

function readVersion(parsed: unknown): unknown {
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  return (parsed as { version?: unknown }).version;
}
