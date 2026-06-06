// Regression tests for workspace IPC security fixes (Switch review PR #315).
//
// HIGH-1: Path traversal via folderPath
// MEDIUM-1: pendingSetups TTL + cap
// MEDIUM-2: workspace:lock handler
// LOW-2: error message sanitization

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { createWorkspaceHandlers, validateFolderBoundary } from './workspace.js';
import type { WorkspaceDeps } from './workspace.js';
import { _resetWorkspaceSession, getActiveWorkspace } from '../../workspace-session.js';

function makeDeps(overrides?: Partial<WorkspaceDeps>): WorkspaceDeps {
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
    deviceId: () => '01JWDEVCEAAAAAAAAAAAAAAAAA',
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

describe('workspace security (PR #315 regression)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ot-sec-'));
    _resetWorkspaceSession();
  });

  afterEach(async () => {
    _resetWorkspaceSession();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── HIGH-1: validateFolderBoundary unit tests ─────────────────────────────

  describe('validateFolderBoundary', () => {
    it('allows a path directly under homeDir', () => {
      const home = '/home/pedro';
      const result = validateFolderBoundary('/home/pedro/workspaces/my-org', home);
      expect(result.ok).toBe(true);
    });

    it('allows homeDir itself', () => {
      const home = '/home/pedro';
      const result = validateFolderBoundary('/home/pedro', home);
      expect(result.ok).toBe(true);
    });

    it('rejects a path outside homeDir', () => {
      const home = '/home/pedro';
      const result = validateFolderBoundary('/etc/passwd', home);
      expect(result.ok).toBe(false);
    });

    it('rejects UNC paths', () => {
      const result = validateFolderBoundary('\\\\server\\share\\evil', 'C:\\Users\\pedro');
      expect(result.ok).toBe(false);
    });

    it('rejects Windows device path \\\\?\\', () => {
      const result = validateFolderBoundary('\\\\?\\C:\\Windows\\Temp\\evil', 'C:\\Users\\pedro');
      expect(result.ok).toBe(false);
    });

    it('rejects a traversal attempt "../../etc"', () => {
      const home = '/home/pedro';
      const result = validateFolderBoundary('../../etc', home);
      expect(result.ok).toBe(false);
    });
  });

  // ── HIGH-1: workspace:create rejects traversal paths ─────────────────────

  describe('workspace:create path traversal rejection', () => {
    it('rejects folderPath = "../../etc"', async () => {
      const deps = makeDeps({ homeDir: () => path.dirname(tmpDir) });
      const h = createWorkspaceHandlers(deps);
      const res = await h.handleCreate({ folderPath: '../../etc' });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe('invalid_path');
    });

    it('rejects C:\\Windows\\Temp\\evil on Windows-like path', () => {
      const result = validateFolderBoundary('C:\\Windows\\Temp\\evil', 'C:\\Users\\pedro');
      expect(result.ok).toBe(false);
    });

    it('rejects a UNC path via handleCreate', async () => {
      const deps = makeDeps({ homeDir: () => path.dirname(tmpDir) });
      const h = createWorkspaceHandlers(deps);
      const res = await h.handleCreate({ folderPath: '\\\\server\\share\\workspace' });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe('invalid_path');
    });

    it('allows a valid path under homeDir', async () => {
      const home = path.dirname(tmpDir);
      const deps = makeDeps({ homeDir: () => home });
      const h = createWorkspaceHandlers(deps);
      const res = await h.handleCreate({ folderPath: tmpDir });
      expect(res.ok).toBe(true);
    });
  });

  // ── HIGH-1: workspace:detect rejects traversal paths ─────────────────────

  describe('workspace:detect path traversal rejection', () => {
    it('rejects folderPath outside homeDir', async () => {
      const deps = makeDeps({ homeDir: () => path.dirname(tmpDir) });
      const h = createWorkspaceHandlers(deps);
      const res = await h.handleDetect({ folderPath: '/etc' });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe('invalid_path');
    });
  });

  // ── MEDIUM-1: pendingSetups TTL ───────────────────────────────────────────

  describe('pendingSetups TTL', () => {
    it('setup token is rejected after TTL expires', async () => {
      vi.useFakeTimers();
      try {
        const deps = makeDeps({ homeDir: () => path.dirname(tmpDir) });
        const h = createWorkspaceHandlers(deps);

        const createRes = await h.handleCreate({ folderPath: tmpDir });
        if (!createRes.ok) throw new Error('create failed');

        // Advance time past the 5-minute TTL
        vi.advanceTimersByTime(5 * 60 * 1000 + 100);

        const res = await h.handleConfirmSetup({
          setupToken: createRes.setupToken,
          confirmWords: { '1': 'anything' },
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error.code).toBe('invalid_setup_token');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ── MEDIUM-2: workspace:lock ──────────────────────────────────────────────

  describe('workspace:lock', () => {
    it('clears the active workspace session', async () => {
      const deps = makeDeps({ homeDir: () => path.dirname(tmpDir) });
      const h = createWorkspaceHandlers(deps);

      // First create and confirm a workspace to establish a session
      const createRes = await h.handleCreate({ folderPath: tmpDir });
      if (!createRes.ok) throw new Error('create failed');
      const words = createRes.mnemonic.split(' ');
      const confirmRes = await h.handleConfirmSetup({
        setupToken: createRes.setupToken,
        confirmWords: { '1': words[0]!, '2': words[1]!, '3': words[2]! },
      });
      if (!confirmRes.ok) throw new Error('confirm failed');

      // Workspace should now be active
      expect(getActiveWorkspace()).not.toBeNull();

      // Lock it
      const lockRes = await h.handleLock({});
      expect(lockRes.ok).toBe(true);

      // Session should be cleared
      expect(getActiveWorkspace()).toBeNull();
    });

    it('returns ok even when no workspace is active', async () => {
      const deps = makeDeps({ homeDir: () => path.dirname(tmpDir) });
      const h = createWorkspaceHandlers(deps);
      const res = await h.handleLock({});
      expect(res.ok).toBe(true);
    });
  });

  // ── LOW-2: error message sanitization ────────────────────────────────────

  describe('error message sanitization', () => {
    it('does not leak absolute Windows paths in error messages', async () => {
      const deps = makeDeps({ homeDir: () => path.dirname(tmpDir) });
      const h = createWorkspaceHandlers(deps);
      // A non-directory file triggers a folder_error; the fs message on Windows
      // would normally embed the full path — verify it's stripped.
      const filePath = path.join(tmpDir, 'notadir.txt');
      await fs.writeFile(filePath, 'x');
      const res = await h.handleCreate({ folderPath: filePath });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        // The sanitized message should NOT contain a drive-letter path like C:\...
        expect(res.error.message).not.toMatch(/[A-Za-z]:\\/);
      }
    });
  });
});
