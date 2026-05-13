// SPEC-026 cleanup — encrypted dev-seed flow (.squad/decisions.md D3).
//
// Replaces the old plaintext-NDJSON dev-seed: routes seed events through the
// same EncryptedMultiDeviceEventLog write path JoinFlow/FreshSetupFlow uses.
// Result: every `npm run dev` launch exercises real crypto, and no
// `events.ndjson` plaintext file is ever produced.
//
// DEV-ONLY. The whole module is gated on NODE_ENV — importing devKey.ts
// throws under production at module load (defense in depth).

import { promises as fs } from 'node:fs';
import { saveKeyFile, type KeyFileV2 } from '../../core/eventLog/keyFile.js';
import { generateMasterKey, wrapKey } from '../../core/crypto/masterKey.js';
import { randomBytes, wipe } from '../../core/crypto/primitives.js';
import { deriveRecoveryKey, DEFAULT_ARGON2_PARAMS } from '../../core/crypto/recoveryKey.js';
import { EncryptedMultiDeviceEventLog } from '../../core/eventLog/EncryptedMultiDeviceEventLog.js';
import type { DomainEvent } from '../../core/eventLog/index.js';
import { DEV_RECOVERY_MNEMONIC } from './devKey.js';

export interface SeedEncryptedDevWorkspaceDeps {
  /** Absolute path to the (empty) dev workspace folder. */
  dir: string;
  /** This device's ULID. */
  deviceId: string;
  /** Hostname used as the device's `label` in events.key. */
  hostname: string;
  /** True when Electron's safeStorage.isEncryptionAvailable() is true. */
  safeStorageAvailable: boolean;
  /** safeStorage.encryptString — wraps an MK base64 string under the OS keychain. */
  safeStorageEncrypt: (plaintext: string) => Buffer;
}

export interface SeedEncryptedDevWorkspaceResult {
  /** The Master Key for the freshly-created dev workspace. Caller owns / wipes. */
  mk: Uint8Array;
  /** The encrypted event log instance (ready for reuse / hydration). */
  log: EncryptedMultiDeviceEventLog;
}

/**
 * Create an encrypted dev workspace under `dir`, enroll this device, then
 * write `seedEvents` through the encrypted event log. The dev recovery code
 * (`DEV_RECOVERY_MNEMONIC`) is the constant defined in `devKey.ts` — its sole
 * purpose is to make dev launches reproducible without a setup wizard.
 *
 * Pre-conditions: `dir` exists and is empty of any events.key /
 * events-*.ndjson / events.ndjson artifacts. Caller is responsible for the
 * empty-folder check (see bootstrap.ts).
 */
export async function seedEncryptedDevWorkspace(
  deps: SeedEncryptedDevWorkspaceDeps,
  seedEvents: readonly DomainEvent[],
): Promise<SeedEncryptedDevWorkspaceResult> {
  if (process.env['NODE_ENV'] === 'production') {
    // Belt-and-braces — devKey.ts also throws on import, but this guards
    // against any test that mutates env vars after module load.
    throw new Error('[devSeed] seedEncryptedDevWorkspace() called under NODE_ENV=production');
  }

  await fs.mkdir(deps.dir, { recursive: true });

  const mk = generateMasterKey();
  try {
    const salt = randomBytes(16);

    // Wrap MK under the recovery key derived from the dev mnemonic.
    let recoveryKey: Uint8Array | null = null;
    let wrapRecovery: string;
    try {
      recoveryKey = await deriveRecoveryKey(DEV_RECOVERY_MNEMONIC, salt, {
        m: DEFAULT_ARGON2_PARAMS.m,
        t: DEFAULT_ARGON2_PARAMS.t,
        p: DEFAULT_ARGON2_PARAMS.p,
      });
      const w = wrapKey(mk, recoveryKey);
      wrapRecovery = Buffer.concat([Buffer.from(w.nonce), Buffer.from(w.ciphertext)]).toString(
        'base64',
      );
    } finally {
      if (recoveryKey !== null) wipe(recoveryKey);
    }

    // Wrap MK under this device's safeStorage when available. When it isn't
    // (e.g. headless CI), reuse the recovery wrap so the device entry still
    // validates against the v2 schema — unlock will route through the
    // recovery flow on next launch.
    let wrapSafeStorage: string;
    if (deps.safeStorageAvailable) {
      const encrypted = deps.safeStorageEncrypt(Buffer.from(mk).toString('base64'));
      wrapSafeStorage = encrypted.toString('base64');
    } else {
      wrapSafeStorage = wrapRecovery;
    }

    const now = new Date().toISOString();
    const keyFile: KeyFileV2 = {
      version: 2,
      devices: [
        {
          deviceId: deps.deviceId,
          label: deps.hostname,
          wrap_safestorage: wrapSafeStorage,
          enrolled_at: now,
        },
      ],
      wrap_recovery: wrapRecovery,
      salt: Buffer.from(salt).toString('base64'),
      argon2_params: {
        m_kib: DEFAULT_ARGON2_PARAMS.m,
        t: DEFAULT_ARGON2_PARAMS.t,
        p: DEFAULT_ARGON2_PARAMS.p,
      },
      created_at: now,
    };

    await saveKeyFile(deps.dir, keyFile);

    // Construct the encrypted log with its own copy of the MK so the caller
    // can wipe theirs without breaking subsequent appends.
    const log = new EncryptedMultiDeviceEventLog({
      dir: deps.dir,
      deviceId: deps.deviceId,
      masterKey: new Uint8Array(mk),
    });

    for (const evt of seedEvents) {
      await log.append(evt);
    }

    return { mk, log };
  } catch (err) {
    wipe(mk);
    throw err;
  }
}
