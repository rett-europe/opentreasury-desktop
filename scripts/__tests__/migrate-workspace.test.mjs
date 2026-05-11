/**
 * Tests for scripts/migrate-workspace.mjs — SPEC-026 #308
 *
 * Run with:
 *   npx vitest run scripts/__tests__/migrate-workspace.test.mjs
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

// ── Crypto helpers (inlined for test verification, matching the script) ───────

import * as argon2 from 'argon2';
import * as bip39 from 'bip39';
import sodium from 'sodium-native';

const KEY_SIZE = 32;
const NONCE_SIZE = 24;
const TAG_SIZE = 16;

function cryptoDecrypt(ciphertext, key, nonce, aad) {
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
  if (!ok) throw new Error('Decryption failed');
  return plaintext.subarray(0, plaintextLen);
}

function decryptEvent(line, mk, eventId, deviceId) {
  const combined = Buffer.from(line, 'base64');
  const nonce = combined.subarray(0, NONCE_SIZE);
  const ciphertext = combined.subarray(NONCE_SIZE);
  const aad = Buffer.from(`${eventId}:${deviceId}`, 'utf8');
  const plaintext = cryptoDecrypt(ciphertext, mk, nonce, aad);
  return Buffer.from(plaintext).toString('utf8');
}

async function deriveRecoveryKey(mnemonic, saltB64) {
  const salt = Buffer.from(saltB64, 'base64');
  const normalized = mnemonic.normalize('NFKD').toLowerCase().trim().replace(/\s+/g, ' ');
  const seed = bip39.mnemonicToSeedSync(normalized);
  const hash = await argon2.hash(Buffer.from(seed), {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 4,
    parallelism: 1,
    hashLength: 32,
    salt: Buffer.from(salt),
    raw: true,
  });
  return new Uint8Array(hash);
}

function unwrapKey(noncePlusCipher, wrappingKey) {
  const buf = Buffer.from(noncePlusCipher, 'base64');
  const nonce = buf.subarray(0, NONCE_SIZE);
  const ciphertext = buf.subarray(NONCE_SIZE);
  return cryptoDecrypt(ciphertext, wrappingKey, nonce, Buffer.alloc(0));
}

// ── Fixture helpers ───────────────────────────────────────────────────────────

const CROCKFORD_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // eslint-disable-line @typescript-eslint/no-unused-vars

function fakeUlid(seedKey) {
  const upper = String(seedKey)
    .toUpperCase()
    .replace(/[^0-9A-HJKMNP-TV-Z]/g, '0');
  return (upper + '0'.repeat(26)).slice(0, 26);
}

function makeFixtureEvents() {
  const datasetId = fakeUlid('DATASET001');
  const deviceId = fakeUlid('DEVICE0001');
  const userId = fakeUlid('USER000001');
  const now = '2026-01-15T10:00:00.000Z';

  return [
    {
      id: fakeUlid('EVTACCOUNT1'),
      type: 'AccountCreated',
      datasetId,
      actorDeviceId: deviceId,
      actorUserId: userId,
      actorIdentitySource: 'local',
      createdAt: now,
      dekVersion: 0,
      version: 1,
      payload: { name: 'Test Account', bankName: 'Test Bank' },
    },
    {
      id: fakeUlid('EVTACCOUNT2'),
      type: 'AccountCreated',
      datasetId,
      actorDeviceId: deviceId,
      actorUserId: userId,
      actorIdentitySource: 'local',
      createdAt: '2026-01-15T10:01:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: { name: 'Savings Account', bankName: 'Test Bank' },
    },
    {
      id: fakeUlid('EVTCATEGORY1'),
      type: 'CategoryCreated',
      datasetId,
      actorDeviceId: deviceId,
      actorUserId: userId,
      actorIdentitySource: 'local',
      createdAt: '2026-01-15T10:02:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: { name: 'Donations', type: 'income' },
    },
    {
      id: fakeUlid('EVTTXCREATE1'),
      type: 'tx.created',
      datasetId,
      actorDeviceId: deviceId,
      actorUserId: userId,
      actorIdentitySource: 'local',
      createdAt: '2026-01-15T10:03:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: {
        id: fakeUlid('TX000000001'),
        date: '2026-01-15',
        type: 'income',
        amount: 100.0,
        currency: 'EUR',
        description: 'Test donation',
        accountId: fakeUlid('EVTACCOUNT1'),
        categoryId: fakeUlid('EVTCATEGORY1'),
        subcategoryId: null,
        tagIds: [],
        status: 'approved',
        createdAt: '2026-01-15T10:03:00.000Z',
      },
    },
    {
      id: fakeUlid('EVTTXCREATE2'),
      type: 'tx.created',
      datasetId,
      actorDeviceId: deviceId,
      actorUserId: userId,
      actorIdentitySource: 'local',
      createdAt: '2026-01-15T10:04:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: {
        id: fakeUlid('TX000000002'),
        date: '2026-01-15',
        type: 'expense',
        amount: 50.5,
        currency: 'EUR',
        description: 'Office supplies',
        accountId: fakeUlid('EVTACCOUNT2'),
        categoryId: fakeUlid('EVTCATEGORY1'),
        subcategoryId: null,
        tagIds: [],
        status: 'approved',
        createdAt: '2026-01-15T10:04:00.000Z',
      },
    },
  ];
}

// ── Run the migration script as a child process ───────────────────────────────

/**
 * Run migrate-workspace.mjs with stdin piped.
 * @param {string} workspaceDir
 * @param {string} stdinInput  — text to send on stdin (e.g. "y\n\n")
 * @returns {{ exitCode, stdout, stderr }}
 */
async function runMigration(workspaceDir, stdinInput) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')),
      '..',
      'migrate-workspace.mjs',
    );

    const child = spawn(process.execPath, [scriptPath, workspaceDir], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });

    // Write stdin and close
    child.stdin.write(stdinInput);
    child.stdin.end();
  });
}

/**
 * Extract recovery mnemonic from script stdout.
 * The script prints words in a framed block; extract all 12 words.
 */
function extractMnemonic(stdout) {
  // Each word appears as "<N>. <word>" in the stdout
  const matches = [...stdout.matchAll(/\s+(\d+)\.\s+([a-z]+)/g)];
  if (matches.length < 12) return null;
  // Sort by ordinal and extract word
  const numbered = matches.map((m) => ({ n: parseInt(m[1], 10), word: m[2] }));
  numbered.sort((a, b) => a.n - b.n);
  return numbered
    .slice(0, 12)
    .map((x) => x.word)
    .join(' ');
}

/**
 * Extract device ID from script stdout.
 */
function extractDeviceId(stdout) {
  const match = stdout.match(/Device ID\s*:\s*([0-9A-HJKMNP-TV-Z]{26})/);
  return match ? match[1] : null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('migrate-workspace.mjs', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ot-migrate-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── Happy path ──────────────────────────────────────────────────────────

  it('migrates a v1 workspace end-to-end', async () => {
    // Write fixture events.ndjson
    const events = makeFixtureEvents();
    const ndjson = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    await fs.writeFile(path.join(tmpDir, 'events.ndjson'), ndjson, 'utf8');

    // Run migration: confirm "y", then press Enter for the recovery code warning
    const { exitCode, stdout, stderr } = await runMigration(tmpDir, 'y\n\n');

    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    // ── events.key exists ────────────────────────────────────────────────

    const keyFileRaw = await fs.readFile(path.join(tmpDir, 'events.key'), 'utf8');
    const keyFile = JSON.parse(keyFileRaw);

    expect(keyFile.version).toBe(2);
    expect(typeof keyFile.wrap_recovery).toBe('string');
    expect(typeof keyFile.salt).toBe('string');
    expect(keyFile.argon2_params).toMatchObject({ m_kib: 65536, t: 4, p: 1 });
    expect(Array.isArray(keyFile.devices)).toBe(true);
    expect(keyFile.devices.length).toBeGreaterThanOrEqual(1);

    // ── Encrypted events file exists ─────────────────────────────────────

    const deviceId = extractDeviceId(stdout);
    expect(deviceId).toBeTruthy();
    expect(deviceId).toHaveLength(26);

    const encryptedFilePath = path.join(tmpDir, `events-${deviceId}.ndjson`);
    const encryptedRaw = await fs.readFile(encryptedFilePath, 'utf8');
    const encryptedLines = encryptedRaw.split('\n').filter((l) => l.trim().length > 0);

    expect(encryptedLines).toHaveLength(events.length);

    // ── Extract mnemonic from stdout ─────────────────────────────────────

    const mnemonic = extractMnemonic(stdout);
    expect(mnemonic).toBeTruthy();
    const wordCount = mnemonic.split(' ').length;
    expect(wordCount).toBe(12);

    // ── Derive recovery key and unwrap master key ─────────────────────────

    const recoveryKey = await deriveRecoveryKey(mnemonic, keyFile.salt);
    const masterKeyBuf = unwrapKey(keyFile.wrap_recovery, recoveryKey);
    const masterKey = new Uint8Array(masterKeyBuf);

    expect(masterKey).toHaveLength(KEY_SIZE);

    // ── Decrypt all events ───────────────────────────────────────────────

    const decryptedEvents = [];
    for (const line of encryptedLines) {
      const parsed = JSON.parse(line);
      expect(typeof parsed.id).toBe('string');
      expect(typeof parsed.c).toBe('string');

      const plaintext = decryptEvent(parsed.c, masterKey, parsed.id, deviceId);
      const event = JSON.parse(plaintext);
      expect(event.id).toBe(parsed.id);
      decryptedEvents.push(event);
    }

    expect(decryptedEvents).toHaveLength(events.length);

    // All original event ids are present
    const originalIds = new Set(events.map((e) => e.id));
    for (const e of decryptedEvents) {
      expect(originalIds.has(e.id)).toBe(true);
    }

    // ── Original renamed to .bak ─────────────────────────────────────────

    const bakPath = path.join(tmpDir, 'events.ndjson.pre-encryption.bak');
    const bakExists = await fs
      .access(bakPath)
      .then(() => true)
      .catch(() => false);
    expect(bakExists).toBe(true);

    const originalStillExists = await fs
      .access(path.join(tmpDir, 'events.ndjson'))
      .then(() => true)
      .catch(() => false);
    expect(originalStillExists).toBe(false);
  }, 60_000); // allow up to 60s for Argon2id KDF

  // ── Input validation ────────────────────────────────────────────────────

  it('exits 2 when no argument is given', async () => {
    const { exitCode } = await runMigration('', '');
    expect(exitCode).toBe(2);
  });

  it('exits 2 when workspace does not contain events.ndjson', async () => {
    const { exitCode, stderr } = await runMigration(tmpDir, '');
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/events\.ndjson/i);
  });

  it('exits 2 when events.key already exists', async () => {
    await fs.writeFile(path.join(tmpDir, 'events.ndjson'), '{}', 'utf8');
    await fs.writeFile(path.join(tmpDir, 'events.key'), '{}', 'utf8');
    const { exitCode, stderr } = await runMigration(tmpDir, '');
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/already encrypted/i);
  });

  it('exits 2 when encrypted event files already exist', async () => {
    await fs.writeFile(path.join(tmpDir, 'events.ndjson'), '{}', 'utf8');
    await fs.writeFile(path.join(tmpDir, 'events-01JWDEVCEAAAAAAAAAAAAAAAAA.ndjson'), '{}', 'utf8');
    const { exitCode, stderr } = await runMigration(tmpDir, '');
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/already encrypted/i);
  });

  // ── User cancellation ────────────────────────────────────────────────────

  it('exits 1 when user enters N at the confirm prompt', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'events.ndjson'),
      JSON.stringify(makeFixtureEvents()[0]) + '\n',
      'utf8',
    );
    const { exitCode, stdout } = await runMigration(tmpDir, 'N\n');
    expect(exitCode).toBe(1);
    expect(stdout).toMatch(/cancelled/i);
  });

  it('exits 1 when user just presses Enter (default N)', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'events.ndjson'),
      JSON.stringify(makeFixtureEvents()[0]) + '\n',
      'utf8',
    );
    const { exitCode } = await runMigration(tmpDir, '\n');
    expect(exitCode).toBe(1);
  });
});
