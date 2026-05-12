// Unit tests for workspace IPC handlers (SPEC-026 #301).
//
// Tests the handler logic without Electron by injecting stub WorkspaceDeps.
// Integration tests (workspace.integration.test.ts) exercise the full
// crypto pipeline end-to-end in a real temp directory.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createWorkspaceHandlers } from './workspace.js';
import type { WorkspaceDeps } from './workspace.js';
import { _resetWorkspaceSession } from '../../workspace-session.js';
import { saveKeyFile } from '../../../core/eventLog/keyFile.js';
import type { KeyFileV2 } from '../../../core/eventLog/keyFile.js';

const DEVICE_A = '01JWDEVCEAAAAAAAAAAAAAAAAA';
const DEVICE_B = '01JWDEVCEBBBBBBBBBBBBBBBBB';

/** Build a minimal WorkspaceDeps stub — safeStorage is a trivially reversible XOR. */
function makeDeps(overrides?: Partial<WorkspaceDeps>): WorkspaceDeps {
  // Trivial symmetric cipher for testing: XOR each byte with 0xAB.
  const trivialEncrypt = (plain: string): Buffer => {
    const buf = Buffer.from(plain, 'utf8');
    for (let i = 0; i < buf.length; i++) buf[i] = (buf[i] ?? 0) ^ 0xab;
    return buf;
  };
  const trivialDecrypt = (cipher: Buffer): string => {
    const out = Buffer.allocUnsafe(cipher.length);
    for (let i = 0; i < cipher.length; i++) out[i] = (cipher[i] ?? 0) ^ 0xab;
    return out.toString('utf8');
  };

  return {
    deviceId: () => DEVICE_A,
    isEncryptionAvailable: () => true,
    safeStorageEncrypt: trivialEncrypt,
    safeStorageDecrypt: trivialDecrypt,
    hostname: () => 'TestMachine',
    now: () => new Date('2026-05-12T12:00:00.000Z'),
    homeDir: () => os.homedir(),
    getConfiguredDataDir: () => null,
    ...overrides,
  };
}

describe('workspace handlers', () => {
  let tmpDir: string;
  let deps: WorkspaceDeps;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ot-ws-'));
    deps = makeDeps({ homeDir: () => path.dirname(tmpDir) });
    _resetWorkspaceSession();
  });

  afterEach(async () => {
    _resetWorkspaceSession();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── workspace:detect ────────────────────────────────────────────────────

  describe('handleDetect', () => {
    it('returns fresh for an empty folder', async () => {
      const h = createWorkspaceHandlers(deps);
      const res = await h.handleDetect({ folderPath: tmpDir });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.state).toBe('fresh');
        expect(res.folderPath).toBe(tmpDir);
      }
    });

    it('returns error when no folderPath and no previously detected path', async () => {
      const h = createWorkspaceHandlers(deps);
      const res = await h.handleDetect({});
      expect(res.ok).toBe(false);
    });

    it('falls back to getConfiguredDataDir when folderPath omitted and no last-detected path (cold-start fix)', async () => {
      // Cold-start scenario: renderer calls detect() with no folderPath, the
      // in-memory lastDetectedFolderPath is unset, but appConfig.dataDir has
      // already been resolved by bootstrap and is exposed via getConfiguredDataDir.
      // Detect must use it instead of returning `no_folder`.
      const depsWithConfig = makeDeps({
        homeDir: () => path.dirname(tmpDir),
        getConfiguredDataDir: () => tmpDir,
      });
      const h = createWorkspaceHandlers(depsWithConfig);
      const res = await h.handleDetect({});
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.folderPath).toBe(tmpDir);
        expect(res.state).toBe('fresh');
      }
    });

    it('returns join when events.key exists and device not enrolled', async () => {
      const kf: KeyFileV2 = {
        version: 2,
        devices: [
          {
            deviceId: DEVICE_B,
            label: 'Other',
            wrap_safestorage: 'x',
            enrolled_at: '2026-05-12T12:00:00.000Z',
          },
        ],
        wrap_recovery: 'x',
        salt: Buffer.alloc(16).toString('base64'),
        argon2_params: { m_kib: 65536, t: 4, p: 1 },
        created_at: '2026-05-12T12:00:00.000Z',
      };
      await saveKeyFile(tmpDir, kf);
      const h = createWorkspaceHandlers(deps);
      const res = await h.handleDetect({ folderPath: tmpDir });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.state).toBe('join');
    });
  });

  // ── workspace:create ────────────────────────────────────────────────────

  describe('handleCreate', () => {
    it('returns a 12-word mnemonic and a setup token', async () => {
      const h = createWorkspaceHandlers(deps);
      const res = await h.handleCreate({ folderPath: tmpDir });
      expect(res.ok).toBe(true);
      if (res.ok) {
        const words = res.mnemonic.split(' ');
        expect(words).toHaveLength(12);
        expect(res.setupToken).toHaveLength(26); // ULID
      }
    });

    it('returns distinct mnemonics on successive calls (non-deterministic)', async () => {
      const h = createWorkspaceHandlers(deps);
      const r1 = await h.handleCreate({ folderPath: tmpDir });
      const r2 = await h.handleCreate({ folderPath: tmpDir });
      if (r1.ok && r2.ok) {
        expect(r1.mnemonic).not.toBe(r2.mnemonic);
        expect(r1.setupToken).not.toBe(r2.setupToken);
      }
    });

    it('returns error for an invalid folder path (non-directory)', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      await fs.writeFile(filePath, 'hello');
      const h = createWorkspaceHandlers(deps);
      const res = await h.handleCreate({ folderPath: filePath });
      expect(res.ok).toBe(false);
    });
  });

  // ── workspace:confirmSetup ─────────────────────────────────────────────

  describe('handleConfirmSetup', () => {
    it('rejects an unknown setup token', async () => {
      const h = createWorkspaceHandlers(deps);
      const res = await h.handleConfirmSetup({
        setupToken: '01UNKNOWNTOKEN00000000000A',
        confirmWords: { '1': 'abandon' },
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe('invalid_setup_token');
    });

    it('rejects wrong confirmation words', async () => {
      const h = createWorkspaceHandlers(deps);
      const createRes = await h.handleCreate({ folderPath: tmpDir });
      if (!createRes.ok) throw new Error('create failed');

      const res = await h.handleConfirmSetup({
        setupToken: createRes.setupToken,
        confirmWords: { '1': 'wrong' },
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe('confirmation_mismatch');
    });

    it('succeeds with correct challenge words and writes events.key', async () => {
      const h = createWorkspaceHandlers(deps);
      const createRes = await h.handleCreate({ folderPath: tmpDir });
      if (!createRes.ok) throw new Error('create failed');

      const words = createRes.mnemonic.split(' ');
      const confirmWords: Record<string, string> = {
        '1': words[0]!,
        '6': words[5]!,
        '12': words[11]!,
      };

      const res = await h.handleConfirmSetup({
        setupToken: createRes.setupToken,
        confirmWords,
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.event.type).toBe('workspace.created');
        expect(res.event.workspaceId).toHaveLength(26);
      }

      // events.key should now exist on disk.
      const keyFilePath = path.join(tmpDir, 'events.key');
      const stat = await fs.stat(keyFilePath);
      expect(stat.isFile()).toBe(true);
    });

    it('sets up token is consumed after confirmSetup', async () => {
      const h = createWorkspaceHandlers(deps);
      const createRes = await h.handleCreate({ folderPath: tmpDir });
      if (!createRes.ok) throw new Error('create failed');

      const words = createRes.mnemonic.split(' ');
      const confirmWords = { '1': words[0]!, '2': words[1]!, '3': words[2]! };

      await h.handleConfirmSetup({ setupToken: createRes.setupToken, confirmWords });

      // Second call with same token should fail.
      const res2 = await h.handleConfirmSetup({ setupToken: createRes.setupToken, confirmWords });
      expect(res2.ok).toBe(false);
    });

    it('invokes installEncryptedEventLog with the device id and master key after success', async () => {
      const calls: Array<{ deviceId: string; mkLength: number }> = [];
      const h = createWorkspaceHandlers(
        makeDeps({
          homeDir: () => path.dirname(tmpDir),
          installEncryptedEventLog: async (deviceId, mk) => {
            calls.push({ deviceId, mkLength: mk.length });
          },
        }),
      );
      const createRes = await h.handleCreate({ folderPath: tmpDir });
      if (!createRes.ok) throw new Error('create failed');
      const words = createRes.mnemonic.split(' ');
      const confirmRes = await h.handleConfirmSetup({
        setupToken: createRes.setupToken,
        confirmWords: { '1': words[0]!, '2': words[1]!, '3': words[2]! },
      });
      expect(confirmRes.ok).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.deviceId).toBe(DEVICE_A);
      expect(calls[0]!.mkLength).toBe(32);
    });
  });

  // ── workspace:unlock ─────────────────────────────────────────────────────

  describe('handleUnlock', () => {
    it('returns error when safeStorage is unavailable', async () => {
      const h = createWorkspaceHandlers(makeDeps({ isEncryptionAvailable: () => false }));
      const res = await h.handleUnlock({});
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('needs-recovery');
        expect(res.error.needsRecovery).toBe(true);
      }
    });

    it('returns error when no workspace folder has been detected', async () => {
      const h = createWorkspaceHandlers(deps);
      const res = await h.handleUnlock({});
      expect(res.ok).toBe(false);
    });
  });

  // ── workspace:enroll ──────────────────────────────────────────────────────

  describe('handleEnroll', () => {
    it('rejects an invalid mnemonic format', async () => {
      const h = createWorkspaceHandlers(deps);
      const res = await h.handleEnroll({
        folderPath: tmpDir,
        mnemonic: 'not a valid mnemonic at all',
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe('invalid_mnemonic');
    });

    it('rejects when events.key does not exist', async () => {
      const h = createWorkspaceHandlers(deps);
      // Use a real BIP39 mnemonic to pass format validation.
      const mnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const res = await h.handleEnroll({ folderPath: tmpDir, mnemonic });
      expect(res.ok).toBe(false);
    });
  });

  // ── workspace:recover ─────────────────────────────────────────────────────

  describe('handleRecover', () => {
    it('rejects an invalid mnemonic format', async () => {
      const h = createWorkspaceHandlers(deps);
      // Detect must be called first to set last folder path.
      await h.handleDetect({ folderPath: tmpDir });
      const res = await h.handleRecover({ mnemonic: 'not valid' });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe('invalid_mnemonic');
    });

    it('rejects when events.key does not exist', async () => {
      const h = createWorkspaceHandlers(deps);
      await h.handleDetect({ folderPath: tmpDir });
      const mnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const res = await h.handleRecover({ mnemonic });
      expect(res.ok).toBe(false);
    });
  });
});
