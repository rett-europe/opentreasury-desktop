// SPEC-026 #309 — Unit tests for the multi-wrap `events.key` v2 file
// reader/writer + v1 → v2 in-memory migration.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  loadKeyFile,
  saveKeyFile,
  migrateKeyFileV1ToV2,
  KEY_FILE_NAME,
  KEY_FILE_NOT_FOUND,
  KEY_FILE_INVALID_JSON,
  KEY_FILE_SCHEMA_INVALID,
  KEY_FILE_UNSUPPORTED_VERSION,
  type KeyFileV1,
  type KeyFileV2,
  type KeyFileError,
} from '../keyFile.js';

const ULID_A = '01JWDEVCEAAAAAAAAAAAAAAAAA';
const ULID_B = '01JWDEVCEBBBBBBBBBBBBBBBBB';

const ARGON2 = { m_kib: 65536, t: 4, p: 1 };

function makeV2(): KeyFileV2 {
  return {
    version: 2,
    devices: [
      {
        deviceId: ULID_A,
        label: "Pedro's Surface",
        wrap_safestorage: 'BASE64_WRAP_SAFESTORAGE_DEVICE_A',
        enrolled_at: '2026-05-12T11:00:00.000Z',
      },
    ],
    wrap_recovery: 'BASE64_WRAP_RECOVERY',
    salt: 'BASE64_SALT_16BYTES',
    argon2_params: ARGON2,
    created_at: '2026-05-12T10:59:00.000Z',
  };
}

function makeV1(): KeyFileV1 {
  return {
    version: 1,
    wrap_safestorage: 'BASE64_LEGACY_SAFESTORAGE',
    wrap_recovery: 'BASE64_LEGACY_RECOVERY',
    salt: 'BASE64_LEGACY_SALT',
    argon2_params: ARGON2,
    created_at: '2025-12-01T08:00:00.000Z',
  };
}

describe('keyFile (events.key v2)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ot-keyfile-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('saveKeyFile / loadKeyFile (round-trip)', () => {
    it('writes and reads back a v2 key file unchanged', async () => {
      const original = makeV2();
      await saveKeyFile(tmpDir, original);
      const { keyFile, migrated } = await loadKeyFile(tmpDir);
      expect(migrated).toBe(false);
      expect(keyFile).toEqual(original);
    });

    it('persists Argon2id params (m=65536, t=4, p=1) inside the file for forward-compat', async () => {
      const original = makeV2();
      await saveKeyFile(tmpDir, original);

      const raw = await fs.readFile(path.join(tmpDir, KEY_FILE_NAME), 'utf8');
      const parsed = JSON.parse(raw) as KeyFileV2;
      expect(parsed.argon2_params).toEqual(ARGON2);
    });

    it('writes atomically (no `.tmp` left behind on success)', async () => {
      await saveKeyFile(tmpDir, makeV2());
      const entries = await fs.readdir(tmpDir);
      expect(entries).toContain(KEY_FILE_NAME);
      expect(entries.find((e) => e.endsWith('.tmp'))).toBeUndefined();
    });

    it('fsyncs parent directory after rename on POSIX (MEDIUM-2)', async () => {
      // Force the POSIX code path even on Windows CI by patching process.platform.
      const origPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      // Spy on fs.open and count how many times it is called with the
      // directory path (the post-rename parent-dir fsync call).
      let dirOpenCount = 0;
      const origOpen = fs.open.bind(fs);
      const openSpy = vi
        .spyOn(fs, 'open')
        .mockImplementation(async (...args: Parameters<typeof fs.open>) => {
          if (String(args[0]) === tmpDir) dirOpenCount++;
          return origOpen(...args);
        });

      try {
        await saveKeyFile(tmpDir, makeV2());
        expect(dirOpenCount).toBe(1);
      } finally {
        openSpy.mockRestore();
        Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
      }
    });

    it('skips parent-directory fsync on Windows', async () => {
      const origPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

      let dirOpenCount = 0;
      const origOpen = fs.open.bind(fs);
      const openSpy = vi
        .spyOn(fs, 'open')
        .mockImplementation(async (...args: Parameters<typeof fs.open>) => {
          if (String(args[0]) === tmpDir) dirOpenCount++;
          return origOpen(...args);
        });

      try {
        await saveKeyFile(tmpDir, makeV2());
        expect(dirOpenCount).toBe(0);
      } finally {
        openSpy.mockRestore();
        Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
      }
    });

    it('refuses to write a malformed key file', async () => {
      const bad = { ...makeV2(), devices: [] } as unknown as KeyFileV2;
      await expect(saveKeyFile(tmpDir, bad)).rejects.toMatchObject({
        code: KEY_FILE_SCHEMA_INVALID,
      });
    });

    it('supports multiple devices in `devices[]`', async () => {
      const multi = makeV2();
      multi.devices.push({
        deviceId: ULID_B,
        label: "Treasurer's Laptop",
        wrap_safestorage: 'BASE64_WRAP_SAFESTORAGE_DEVICE_B',
        enrolled_at: '2026-05-13T09:30:00.000Z',
      });
      await saveKeyFile(tmpDir, multi);
      const { keyFile } = await loadKeyFile(tmpDir);
      expect(keyFile.devices).toHaveLength(2);
      expect(keyFile.devices.map((d) => d.deviceId).sort()).toEqual([ULID_A, ULID_B].sort());
    });
  });

  describe('loadKeyFile error codes', () => {
    it('throws KEY_FILE_NOT_FOUND when the file is missing', async () => {
      await expect(loadKeyFile(tmpDir)).rejects.toMatchObject({ code: KEY_FILE_NOT_FOUND });
    });

    it('throws KEY_FILE_INVALID_JSON on garbage bytes', async () => {
      await fs.writeFile(path.join(tmpDir, KEY_FILE_NAME), 'not-json{{{', 'utf8');
      await expect(loadKeyFile(tmpDir)).rejects.toMatchObject({ code: KEY_FILE_INVALID_JSON });
    });

    it('throws KEY_FILE_SCHEMA_INVALID on missing required fields', async () => {
      await fs.writeFile(
        path.join(tmpDir, KEY_FILE_NAME),
        JSON.stringify({ version: 2, devices: [] }),
        'utf8',
      );
      await expect(loadKeyFile(tmpDir)).rejects.toMatchObject({ code: KEY_FILE_SCHEMA_INVALID });
    });

    it('throws KEY_FILE_UNSUPPORTED_VERSION on a future version', async () => {
      await fs.writeFile(
        path.join(tmpDir, KEY_FILE_NAME),
        JSON.stringify({ version: 99, anything: 'goes' }),
        'utf8',
      );
      const err = await loadKeyFile(tmpDir).catch((e: unknown) => e as KeyFileError);
      expect(err.code).toBe(KEY_FILE_UNSUPPORTED_VERSION);
      expect(err.message).toMatch(/v1.*v2/);
    });
  });

  describe('v1 → v2 migration', () => {
    it('migrateKeyFileV1ToV2 carries every field across, wrapping the legacy safeStorage as devices[0]', () => {
      const v1 = makeV1();
      const fixedNow = new Date('2026-05-12T12:34:56.789Z');
      const v2 = migrateKeyFileV1ToV2(v1, {
        deviceId: ULID_A,
        label: "Pedro's Surface",
        now: fixedNow,
      });
      expect(v2).toEqual({
        version: 2,
        devices: [
          {
            deviceId: ULID_A,
            label: "Pedro's Surface",
            wrap_safestorage: v1.wrap_safestorage,
            enrolled_at: fixedNow.toISOString(),
          },
        ],
        wrap_recovery: v1.wrap_recovery,
        salt: v1.salt,
        argon2_params: v1.argon2_params,
        created_at: v1.created_at,
      });
    });

    it('loadKeyFile auto-migrates a v1 file in memory when migration context is supplied', async () => {
      const v1 = makeV1();
      await fs.writeFile(path.join(tmpDir, KEY_FILE_NAME), JSON.stringify(v1, null, 2), 'utf8');

      const fixedNow = new Date('2026-05-12T12:34:56.789Z');
      const { keyFile, migrated } = await loadKeyFile(tmpDir, {
        migration: { deviceId: ULID_A, label: "Pedro's Surface", now: fixedNow },
      });

      expect(migrated).toBe(true);
      expect(keyFile.version).toBe(2);
      expect(keyFile.devices).toHaveLength(1);
      expect(keyFile.devices[0]?.deviceId).toBe(ULID_A);
      expect(keyFile.devices[0]?.wrap_safestorage).toBe(v1.wrap_safestorage);
      expect(keyFile.wrap_recovery).toBe(v1.wrap_recovery);

      // The on-disk file must NOT be rewritten by load — caller decides.
      const onDisk = JSON.parse(await fs.readFile(path.join(tmpDir, KEY_FILE_NAME), 'utf8'));
      expect(onDisk.version).toBe(1);
    });

    it('refuses to load a v1 file when migration context is missing', async () => {
      await fs.writeFile(
        path.join(tmpDir, KEY_FILE_NAME),
        JSON.stringify(makeV1(), null, 2),
        'utf8',
      );
      const err = await loadKeyFile(tmpDir).catch((e: unknown) => e as KeyFileError);
      expect(err.code).toBe(KEY_FILE_SCHEMA_INVALID);
      expect(err.message).toMatch(/v1.*opts\.migration/);
    });

    it('migrated v2 round-trips through saveKeyFile + loadKeyFile', async () => {
      const v1 = makeV1();
      await fs.writeFile(path.join(tmpDir, KEY_FILE_NAME), JSON.stringify(v1, null, 2), 'utf8');

      const { keyFile: migrated } = await loadKeyFile(tmpDir, {
        migration: {
          deviceId: ULID_A,
          label: 'Migrated Device',
          now: new Date('2026-05-12T00:00:00.000Z'),
        },
      });

      // Persist the migrated form (this is what the real bootstrap does
      // after enrollment-time re-wrap).
      await saveKeyFile(tmpDir, migrated);

      const { keyFile: reread, migrated: rereadMigrated } = await loadKeyFile(tmpDir);
      expect(rereadMigrated).toBe(false);
      expect(reread).toEqual(migrated);
    });
  });
});
