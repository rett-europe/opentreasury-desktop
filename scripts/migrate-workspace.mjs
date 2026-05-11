#!/usr/bin/env node
/**
 * One-shot legacy workspace migration script — SPEC-026 #308
 *
 * Migrates a v1 (plaintext) workspace to the v2 encrypted format.
 * Intended for Pedro's 2 legacy workspaces only. NOT exposed in the app UI.
 *
 * Usage:
 *   node scripts/migrate-workspace.mjs <workspace-folder>
 *
 * Exit codes:
 *   0 — success
 *   1 — user cancelled
 *   2 — invalid input
 *   3 — internal error
 *
 * Crypto note: This script inlines the same logic as app/src/core/crypto/ and
 * app/src/core/eventLog/ because those modules are TypeScript and cannot be
 * directly imported from a plain .mjs Node script without a build step. Any
 * changes to the crypto primitives in the app must be mirrored here.
 * Functions marked with "mirrors: <file>" indicate the source of truth.
 *
 * Migration placeholder convention:
 *   The device entry written by this script sets `migration_placeholder: true`
 *   alongside `wrap_safestorage`. This signals that the `wrap_safestorage` field
 *   is NOT genuine OS-encrypted material -- it holds the same ciphertext as
 *   `wrap_recovery` (recovery-key-wrapped MK) purely as a structural placeholder.
 *   Any code that reads `events.key` MUST check `entry.migration_placeholder`
 *   before calling safeStorage.decryptString(). When `migration_placeholder` is
 *   true, the entry MUST be treated as uninitialized and the re-enroll flow MUST
 *   be triggered. See keyFile.ts DeviceWrap schema for the optional field.
 */

import { createReadStream, promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { createInterface } from 'node:readline';

import * as argon2 from 'argon2';
import * as bip39 from 'bip39';
import sodium from 'sodium-native';

// ── Exit codes ───────────────────────────────────────────────────────────────

const EXIT_OK = 0;
const EXIT_USER_CANCELLED = 1;
const EXIT_INVALID_INPUT = 2;
const EXIT_INTERNAL_ERROR = 3;

// ── ULID generator ───────────────────────────────────────────────────────────

/** Crockford Base32 alphabet (no I, L, O, U). */
const CROCKFORD_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Generate a real ULID (26 char Crockford base32).
 * Timestamp prefix (10 chars) + random suffix (16 chars).
 */
function generateUlid() {
  // 48-bit timestamp
  const now = Date.now();
  const tsBuf = Buffer.alloc(8);
  tsBuf.writeBigUInt64BE(BigInt(now));
  const tsBytes = tsBuf.slice(2); // last 6 bytes = 48 bits

  // 80 bits of randomness (10 bytes)
  const randBuf = Buffer.allocUnsafe(10);
  sodium.randombytes_buf(randBuf);

  let result = '';
  // Encode timestamp (48 bits → 10 chars at 5 bits/char)
  let tsVal = BigInt(0);
  for (let i = 0; i < 6; i++) {
    tsVal = (tsVal << BigInt(8)) | BigInt(tsBytes[i]);
  }
  const tsChars = [];
  for (let i = 0; i < 10; i++) {
    tsChars.unshift(CROCKFORD_CHARS[Number(tsVal & BigInt(31))]);
    tsVal >>= BigInt(5);
  }
  result += tsChars.join('');

  // Encode random (80 bits → 16 chars at 5 bits/char)
  let randVal = BigInt(0);
  for (let i = 0; i < 10; i++) {
    randVal = (randVal << BigInt(8)) | BigInt(randBuf[i]);
  }
  const randChars = [];
  for (let i = 0; i < 16; i++) {
    randChars.unshift(CROCKFORD_CHARS[Number(randVal & BigInt(31))]);
    randVal >>= BigInt(5);
  }
  result += randChars.join('');

  return result;
}

// ── Crypto primitives — mirrors: app/src/core/crypto/primitives.ts ───────────

const KEY_SIZE = 32;
const NONCE_SIZE = 24;
const TAG_SIZE = 16;

function cryptoEncrypt(plaintext, key, nonce, aad) {
  if (key.length !== KEY_SIZE) throw new Error(`Key must be ${KEY_SIZE} bytes`);
  if (nonce.length !== NONCE_SIZE) throw new Error(`Nonce must be ${NONCE_SIZE} bytes`);
  const ciphertext = Buffer.allocUnsafe(plaintext.length + TAG_SIZE);
  sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    ciphertext,
    plaintext.length > 0 ? plaintext : Buffer.alloc(0),
    aad.length > 0 ? aad : null,
    null,
    nonce,
    key,
  );
  return ciphertext;
}

function cryptoDecrypt(ciphertext, key, nonce, aad) {
  if (key.length !== KEY_SIZE) throw new Error(`Key must be ${KEY_SIZE} bytes`);
  if (nonce.length !== NONCE_SIZE) throw new Error(`Nonce must be ${NONCE_SIZE} bytes`);
  if (ciphertext.length < TAG_SIZE) throw new Error('Ciphertext too short');
  const plaintextLen = ciphertext.length - TAG_SIZE;
  const plaintext = Buffer.allocUnsafe(Math.max(1, plaintextLen));
  const ok = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    plaintext,
    null,
    ciphertext,
    aad.length > 0 ? aad : null,
    nonce,
    key,
  );
  if (!ok) throw new Error('Decryption failed: could not verify data');
  return plaintext.subarray(0, plaintextLen);
}

function randomBytes(len) {
  const buf = Buffer.allocUnsafe(len);
  sodium.randombytes_buf(buf);
  return buf;
}

function wipe(buf) {
  if (buf.length === 0) return;
  sodium.sodium_memzero(buf);
}

// ── Nonce generation — mirrors: app/src/core/crypto/nonce.ts ─────────────────

function generateNonce() {
  return randomBytes(NONCE_SIZE);
}

// ── Master key — mirrors: app/src/core/crypto/masterKey.ts ───────────────────

function generateMasterKey() {
  return randomBytes(KEY_SIZE);
}

function wrapKey(mk, wrappingKey) {
  const nonce = generateNonce();
  const aad = new Uint8Array(0);
  const ciphertext = cryptoEncrypt(mk, wrappingKey, nonce, aad);
  return { ciphertext, nonce };
}

// ── Recovery key — mirrors: app/src/core/crypto/recoveryKey.ts ───────────────

const DEFAULT_ARGON2_PARAMS = { m: 65536, t: 4, p: 1 };

function normalizeMnemonic(words) {
  return words.normalize('NFKD').toLowerCase().trim().replace(/\s+/g, ' ');
}

async function deriveRecoveryKey(mnemonic, salt, params = DEFAULT_ARGON2_PARAMS) {
  if (salt.length !== 16) throw new Error(`Salt must be 16 bytes, got ${salt.length}`);
  const normalized = normalizeMnemonic(mnemonic);
  const seed = bip39.mnemonicToSeedSync(normalized);
  try {
    const hash = await argon2.hash(Buffer.from(seed), {
      type: argon2.argon2id,
      memoryCost: params.m,
      timeCost: params.t,
      parallelism: params.p,
      hashLength: 32,
      salt: Buffer.from(salt),
      raw: true,
    });
    return new Uint8Array(hash);
  } finally {
    wipe(Buffer.from(seed));
  }
}

// ── Event encryption — mirrors: app/src/core/crypto/event.ts ─────────────────

/**
 * Encrypt one event. AAD = "<eventId>:<deviceId>" (binds ciphertext to both).
 * Returns base64(nonce || ciphertext || tag).
 */
function encryptEvent(plaintext, mk, eventId, deviceId) {
  const plaintextBytes = Buffer.from(plaintext, 'utf8');
  const nonce = generateNonce();
  const aad = Buffer.from(`${eventId}:${deviceId}`, 'utf8');
  const ciphertext = cryptoEncrypt(plaintextBytes, mk, nonce, aad);
  return Buffer.concat([nonce, ciphertext]).toString('base64');
}

/**
 * Decrypt one event. AAD = "<eventId>:<deviceId>".
 * Returns the plaintext JSON string.
 */
function decryptEvent(line, mk, eventId, deviceId) {
  const combined = Buffer.from(line, 'base64');
  if (combined.length < NONCE_SIZE) throw new Error('Encrypted event too short');
  const nonce = combined.subarray(0, NONCE_SIZE);
  const ciphertext = combined.subarray(NONCE_SIZE);
  const aad = Buffer.from(`${eventId}:${deviceId}`, 'utf8');
  const plaintext = cryptoDecrypt(ciphertext, mk, nonce, aad);
  return Buffer.from(plaintext).toString('utf8');
}

// ── Key file — mirrors: app/src/core/eventLog/keyFile.ts ─────────────────────

const KEY_FILE_NAME = 'events.key';

/**
 * Atomically write events.key. tmp → fsync → rename.
 * mode 0o600 on POSIX.
 */
async function saveKeyFile(dir, keyFile) {
  const filePath = path.join(dir, KEY_FILE_NAME);
  const tmpPath = `${filePath}.tmp`;
  const body = JSON.stringify(keyFile, null, 2);
  const fileMode = process.platform !== 'win32' ? 0o600 : undefined;
  await fs.writeFile(tmpPath, body, { encoding: 'utf8', mode: fileMode });
  const handle = await fs.open(tmpPath, 'r+');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmpPath, filePath);
  if (process.platform !== 'win32') {
    const dirHandle = await fs.open(dir, 'r');
    try {
      await dirHandle.sync();
    } finally {
      await dirHandle.close();
    }
  }
}

// ── Encrypted line format — mirrors: app/src/core/eventLog/EncryptedMultiDeviceEventLog.ts

function serializeEncryptedLine(id, ciphertextB64) {
  return `{"id":${JSON.stringify(id)},"c":${JSON.stringify(ciphertextB64)}}\n`;
}

function eventsFileName(deviceId) {
  return `events-${deviceId}.ndjson`;
}

// ── Stdin helpers ─────────────────────────────────────────────────────────────
//
// Uses a line queue to buffer stdin lines. This prevents the "lost line" race
// that occurs with readline in non-terminal (piped) mode, where all input may
// be buffered and multiple 'line' events fire before the second once('line')
// listener is registered.

let _lineQueue = null;

function getLineQueue() {
  if (_lineQueue) return _lineQueue;

  const lines = [];
  const waiters = [];

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('line', (line) => {
    if (waiters.length > 0) {
      // Someone is waiting — give the line directly
      const resolve = waiters.shift();
      resolve(line);
    } else {
      // Nobody waiting yet — buffer the line
      lines.push(line);
    }
  });

  _lineQueue = {
    readLine() {
      return new Promise((resolve) => {
        if (lines.length > 0) {
          resolve(lines.shift());
        } else {
          waiters.push(resolve);
        }
      });
    },
    close() {
      rl.close();
    },
  };

  return _lineQueue;
}

function closeReadline() {
  if (_lineQueue) {
    _lineQueue.close();
    _lineQueue = null;
  }
}

async function askYN(prompt) {
  process.stdout.write(prompt);
  const answer = await getLineQueue().readLine();
  return answer.trim().toLowerCase() === 'y';
}

async function pressEnterToContinue(prompt) {
  process.stdout.write(prompt);
  await getLineQueue().readLine();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const workspaceArg = process.argv[2];

  // ─── 1. Input validation ──────────────────────────────────────────────────

  if (!workspaceArg) {
    console.error('Usage: node scripts/migrate-workspace.mjs <workspace-folder>');
    process.exit(EXIT_INVALID_INPUT);
  }

  const workspaceDir = path.resolve(workspaceArg);

  let dirStat;
  try {
    dirStat = await fs.stat(workspaceDir);
  } catch {
    console.error(`Error: "${workspaceDir}" does not exist or is not accessible.`);
    process.exit(EXIT_INVALID_INPUT);
  }

  if (!dirStat.isDirectory()) {
    console.error(`Error: "${workspaceDir}" is not a directory.`);
    process.exit(EXIT_INVALID_INPUT);
  }

  const plainEventLog = path.join(workspaceDir, 'events.ndjson');
  try {
    await fs.access(plainEventLog);
  } catch {
    console.error(
      `Error: "${plainEventLog}" not found. This does not look like an OpenTreasury workspace.`,
    );
    process.exit(EXIT_INVALID_INPUT);
  }

  // Refuse if already encrypted (events.key exists OR events-*.ndjson exist)
  const keyFilePath = path.join(workspaceDir, KEY_FILE_NAME);
  try {
    await fs.access(keyFilePath);
    console.error(
      `Error: workspace already encrypted — "${keyFilePath}" already exists.\n` +
        `       If you want to re-migrate, remove the key file and the events-*.ndjson files first.`,
    );
    process.exit(EXIT_INVALID_INPUT);
  } catch {
    // Good — key file does not exist yet
  }

  const dirEntries = await fs.readdir(workspaceDir);
  const existingEncryptedFiles = dirEntries.filter((f) =>
    /^events-[0-9A-HJKMNP-TV-Z]{26}\.ndjson$/.test(f),
  );
  if (existingEncryptedFiles.length > 0) {
    console.error(
      `Error: workspace already encrypted — encrypted event files found:\n` +
        existingEncryptedFiles.map((f) => `  ${f}`).join('\n') +
        `\n\nThis workspace appears to have already been migrated.`,
    );
    process.exit(EXIT_INVALID_INPUT);
  }

  // ─── 2. Interactive prompt ────────────────────────────────────────────────

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║          OpenTreasury Workspace Encryption Migration         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`This will encrypt the workspace at:`);
  console.log(`  ${workspaceDir}`);
  console.log('');
  console.log('The original "events.ndjson" will be renamed to');
  console.log('"events.ndjson.pre-encryption.bak" after a successful migration.');
  console.log('It is YOUR responsibility to delete it when you are confident');
  console.log('the encrypted data is correct. It will NOT be auto-deleted.');
  console.log('');

  const confirmed = await askYN('Continue? [y/N] ');
  if (!confirmed) {
    closeReadline();
    console.log('Migration cancelled.');
    process.exit(EXIT_USER_CANCELLED);
  }

  // ─── 3. Generate recovery code ────────────────────────────────────────────

  // mirrors app/src/core/crypto/mnemonic.ts — 128 bits = 12 words
  const mnemonic = bip39.generateMnemonic(128);
  const mnemonicWords = mnemonic.split(' ');

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║               ⚠  YOUR RECOVERY CODE  ⚠                     ║');
  console.log('║                                                              ║');
  console.log('║  WRITE THIS DOWN. IT CANNOT BE RECOVERED.                   ║');
  console.log('║  Anyone with this code can decrypt your workspace.          ║');
  console.log('║  Store it in a secure place (password manager, paper safe). ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  // Print 12 words in rows of 4
  for (let row = 0; row < 3; row++) {
    const words = mnemonicWords.slice(row * 4, row * 4 + 4);
    const formatted = words
      .map((w, i) => `${String(row * 4 + i + 1).padStart(2)}. ${w.padEnd(12)}`)
      .join('  ');
    console.log(`║  ${formatted.padEnd(60)}║`);
  }
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  await pressEnterToContinue("Press ENTER to confirm you've written down the recovery code... ");

  // ─── 4 & 5. Generate device ID and derive keys ────────────────────────────

  console.log('');
  console.log('Deriving encryption keys (this may take a few seconds)...');

  const deviceId = generateUlid();
  const salt = randomBytes(16);

  let masterKey;
  let recoveryKey;
  let wrappedUnderRecovery;

  try {
    masterKey = generateMasterKey();
    recoveryKey = await deriveRecoveryKey(mnemonic, salt, DEFAULT_ARGON2_PARAMS);
    wrappedUnderRecovery = wrapKey(masterKey, recoveryKey);
  } catch (err) {
    console.error(`Error deriving keys: ${err.message}`);
    process.exit(EXIT_INTERNAL_ERROR);
  } finally {
    if (recoveryKey) wipe(recoveryKey);
  }

  // Build the keyFile v2.
  // Note: The migration device entry uses the recovery wrap also as
  // wrap_safestorage (a migration placeholder). When Pedro opens this
  // workspace in the app, the app will re-enroll the device with proper
  // OS safeStorage keying. This is documented and intentional.
  const wrapRecoveryB64 = Buffer.concat([
    wrappedUnderRecovery.nonce,
    wrappedUnderRecovery.ciphertext,
  ]).toString('base64');

  const keyFile = {
    version: 2,
    devices: [
      {
        deviceId,
        label: 'migration-device (re-enroll in app)',
        wrap_safestorage: wrapRecoveryB64, // placeholder: same as recovery wrap
        migration_placeholder: true, // signals: not OS-encrypted, demand re-enroll
        enrolled_at: new Date().toISOString(),
      },
    ],
    wrap_recovery: wrapRecoveryB64,
    salt: Buffer.from(salt).toString('base64'),
    argon2_params: {
      m_kib: DEFAULT_ARGON2_PARAMS.m,
      t: DEFAULT_ARGON2_PARAMS.t,
      p: DEFAULT_ARGON2_PARAMS.p,
    },
    created_at: new Date().toISOString(),
  };

  // ─── 6. Encrypt and rewrite events ───────────────────────────────────────

  console.log('Encrypting events...');

  const encryptedFilePath = path.join(workspaceDir, eventsFileName(deviceId));
  const encryptedTmpPath = `${encryptedFilePath}.tmp`;

  let eventCount = 0;

  try {
    const fileStream = createReadStream(plainEventLog, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    const writeHandle = await fs.open(
      encryptedTmpPath,
      'w',
      process.platform !== 'win32' ? 0o600 : undefined,
    );

    try {
      for await (const rawLine of rl) {
        const line = rawLine.trim();
        if (line.length === 0) continue;

        let event;
        try {
          event = JSON.parse(line);
        } catch {
          console.error(`  Warning: skipping non-JSON line: ${line.slice(0, 60)}`);
          continue;
        }

        if (
          typeof event !== 'object' ||
          event === null ||
          typeof event.id !== 'string' ||
          event.id.length === 0
        ) {
          console.error(`  Warning: skipping event without valid id: ${line.slice(0, 60)}`);
          continue;
        }

        // Set actorDeviceId to the migration device if not already present
        if (!event.actorDeviceId) {
          event.actorDeviceId = deviceId;
        }

        const encryptedLine = serializeEncryptedLine(
          event.id,
          encryptEvent(JSON.stringify(event), masterKey, event.id, deviceId),
        );

        await writeHandle.writeFile(encryptedLine, { encoding: 'utf8' });
        eventCount++;
      }

      await writeHandle.sync();
    } finally {
      await writeHandle.close();
      rl.close();
      fileStream.destroy();
    }
  } catch (err) {
    // Clean up tmp file on failure
    try {
      await fs.unlink(encryptedTmpPath);
    } catch {
      /* ignore */
    }
    wipe(masterKey);
    closeReadline();
    console.error(`Error encrypting events: ${err.message}`);
    process.exit(EXIT_INTERNAL_ERROR);
  }

  // ─── 7. Atomic commit: verify → rename tmp → write key file → rename original

  console.log(`Verifying encrypted output (${eventCount} events)...`);

  // Sanity check: rename tmp → final, then read back and decrypt 1-2 events
  await fs.rename(encryptedTmpPath, encryptedFilePath);

  try {
    const encryptedRaw = await fs.readFile(encryptedFilePath, 'utf8');
    const encryptedLines = encryptedRaw.split('\n').filter((l) => l.trim().length > 0);

    if (encryptedLines.length !== eventCount) {
      throw new Error(
        `Event count mismatch: wrote ${eventCount} but file has ${encryptedLines.length} lines`,
      );
    }

    // Verify first and last events
    const samplesToCheck = [encryptedLines[0]];
    if (encryptedLines.length > 1) samplesToCheck.push(encryptedLines[encryptedLines.length - 1]);

    for (const sample of samplesToCheck) {
      let parsed;
      try {
        parsed = JSON.parse(sample);
      } catch {
        throw new Error(`Verification failed: encrypted line is not valid JSON`);
      }
      const decrypted = decryptEvent(parsed.c, masterKey, parsed.id, deviceId);
      const event = JSON.parse(decrypted);
      if (event.id !== parsed.id) {
        throw new Error(`Verification failed: decrypted event id mismatch`);
      }
    }
  } catch (err) {
    // Verification failed — leave original intact, remove the bad encrypted file
    try {
      await fs.unlink(encryptedFilePath);
    } catch {
      /* ignore */
    }
    wipe(masterKey);
    closeReadline();
    console.error(`Error: verification failed — original events.ndjson is untouched.`);
    console.error(`  ${err.message}`);
    process.exit(EXIT_INTERNAL_ERROR);
  }

  // Write the key file (last step per SPEC-026 §3.3 — key file is flipped last)
  try {
    await saveKeyFile(workspaceDir, keyFile);
  } catch (err) {
    // Key file write failed — leave encrypted events and original both present
    wipe(masterKey);
    closeReadline();
    console.error(`Error writing events.key — original events.ndjson is untouched.`);
    console.error(`  ${err.message}`);
    process.exit(EXIT_INTERNAL_ERROR);
  }

  // Rename original to .bak (never auto-deleted — Pedro deletes manually)
  const bakPath = `${plainEventLog}.pre-encryption.bak`;
  await fs.rename(plainEventLog, bakPath);

  // Clean up master key from memory
  wipe(masterKey);

  // Close readline before exit so Node doesn't hang waiting for stdin
  closeReadline();

  // ─── 8. Success ──────────────────────────────────────────────────────────

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                   ✓  Migration complete!                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Encrypted events : ${eventsFileName(deviceId)}`);
  console.log(`  Key file          : events.key`);
  console.log(`  Original backup   : events.ndjson.pre-encryption.bak`);
  console.log(`  Events migrated   : ${eventCount}`);
  console.log(`  Device ID         : ${deviceId}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Open the workspace in the OpenTreasury app.');
  console.log('  2. When prompted, enter your recovery code to enroll this device.');
  console.log('  3. Once you are confident the data is correct, delete the .bak file.');
  console.log('');

  process.exit(EXIT_OK);
}

main().catch((err) => {
  console.error(`Unexpected error: ${err.message}`);
  console.error(err.stack);
  process.exit(EXIT_INTERNAL_ERROR);
});
