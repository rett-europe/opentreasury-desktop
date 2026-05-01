// Tests for bootstrap.ts — specifically resolveEventLogDir path validation (P0-3).
//
// These tests focus on the relaxed path resolution logic that now accepts
// absolute paths from appConfig.dataDir and OT_DATA_DIR env var.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { AppConfig } from './config.js';

// Mock Electron so we can import the real `shouldDeferEventLog` helper from
// bootstrap.ts (which does `import { app } from 'electron'` at the top level)
// without spinning up Electron in this Node-env test file.
vi.mock('electron', () => ({
  app: {
    getPath: () => '/should/not/be/used',
    getVersion: () => '0.0.0-test',
  },
}));

// Extract the resolveEventLogDir logic for testing
// (In the actual bootstrap.ts, this is async and private)
async function testResolveEventLogDir(
  userDataDir: string,
  appConfig: AppConfig,
  envOverride?: string,
): Promise<string> {
  const originalEnv = process.env['OT_DATA_DIR'];

  try {
    if (envOverride !== undefined) {
      process.env['OT_DATA_DIR'] = envOverride;
    }

    const configPath = appConfig.dataDir;

    // Priority 1: appConfig.dataDir (user's deliberate choice via Preferences UI)
    if (configPath) {
      const candidate = path.isAbsolute(configPath)
        ? configPath
        : path.join(userDataDir, configPath);

      const validated = await validateAndCreateDir(candidate);
      if (validated) {
        // If OT_DATA_DIR env var is set AND differs, would warn (but still use config)
        return validated;
      }
    }

    // Priority 2: OT_DATA_DIR env var (dev bootstrap escape hatch; only when appConfig.dataDir is unset or failed)
    if (process.env['OT_DATA_DIR']) {
      const envValue = process.env['OT_DATA_DIR'].trim();
      const candidate = path.isAbsolute(envValue) ? envValue : path.join(userDataDir, envValue);

      const validated = await validateAndCreateDir(candidate);
      if (validated) return validated;
    }

    // Priority 3: Default
    const defaultPath = path.join(userDataDir, 'dev-events');
    const validated = await validateAndCreateDir(defaultPath);
    if (validated) return validated;

    return defaultPath;
  } finally {
    if (originalEnv !== undefined) {
      process.env['OT_DATA_DIR'] = originalEnv;
    } else {
      delete process.env['OT_DATA_DIR'];
    }
  }
}

async function validateAndCreateDir(dirPath: string): Promise<string | null> {
  if (!dirPath || dirPath.includes('\0')) {
    return null;
  }

  try {
    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      return null;
    }
    return dirPath;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      try {
        await fs.mkdir(dirPath, { recursive: true });
        return dirPath;
      } catch {
        return null;
      }
    }
    return null;
  }
}

describe('bootstrap.ts — resolveEventLogDir path resolution', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `ot-bootstrap-test-${Date.now()}-${Math.random()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('default behavior (no config, no env)', () => {
    it('should use <userData>/dev-events when dataDir is null and no env override', async () => {
      const config: AppConfig = { version: 1, dataDir: null, readOnly: false };
      const resolved = await testResolveEventLogDir(testDir, config);

      expect(resolved).toBe(path.join(testDir, 'dev-events'));
    });

    it('should create dev-events directory if it does not exist', async () => {
      const config: AppConfig = { version: 1, dataDir: null, readOnly: false };
      const resolved = await testResolveEventLogDir(testDir, config);

      const stats = await fs.stat(resolved);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('appConfig.dataDir (absolute paths)', () => {
    it('should accept absolute path from appConfig.dataDir', async () => {
      const absolutePath = path.join(testDir, 'my-absolute-dataset');
      const config: AppConfig = { version: 1, dataDir: absolutePath, readOnly: false };

      const resolved = await testResolveEventLogDir(testDir, config);
      expect(resolved).toBe(absolutePath);

      const stats = await fs.stat(resolved);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create directory from absolute dataDir if it does not exist', async () => {
      const absolutePath = path.join(testDir, 'nested', 'deep', 'dataset');
      const config: AppConfig = { version: 1, dataDir: absolutePath, readOnly: false };

      const resolved = await testResolveEventLogDir(testDir, config);
      expect(resolved).toBe(absolutePath);

      const stats = await fs.stat(resolved);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('appConfig.dataDir (relative paths)', () => {
    it('should join relative dataDir with userData', async () => {
      const config: AppConfig = { version: 1, dataDir: 'my-dataset', readOnly: false };

      const resolved = await testResolveEventLogDir(testDir, config);
      expect(resolved).toBe(path.join(testDir, 'my-dataset'));

      const stats = await fs.stat(resolved);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create relative dataDir under userData', async () => {
      const config: AppConfig = { version: 1, dataDir: 'nested/dataset', readOnly: false };

      const resolved = await testResolveEventLogDir(testDir, config);
      expect(resolved).toBe(path.join(testDir, 'nested', 'dataset'));

      const stats = await fs.stat(resolved);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('OT_DATA_DIR env var (absolute paths)', () => {
    it('should accept absolute path from OT_DATA_DIR env', async () => {
      const absolutePath = path.join(testDir, 'env-absolute-dataset');
      const config: AppConfig = { version: 1, dataDir: null, readOnly: false };

      const resolved = await testResolveEventLogDir(testDir, config, absolutePath);
      expect(resolved).toBe(absolutePath);

      const stats = await fs.stat(resolved);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create directory from absolute OT_DATA_DIR if it does not exist', async () => {
      const absolutePath = path.join(testDir, 'env-nested', 'deep');
      const config: AppConfig = { version: 1, dataDir: null, readOnly: false };

      const resolved = await testResolveEventLogDir(testDir, config, absolutePath);
      expect(resolved).toBe(absolutePath);

      const stats = await fs.stat(resolved);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('OT_DATA_DIR env var (relative paths)', () => {
    it('should join relative OT_DATA_DIR with userData', async () => {
      const config: AppConfig = { version: 1, dataDir: null, readOnly: false };

      const resolved = await testResolveEventLogDir(testDir, config, 'env-dataset');
      expect(resolved).toBe(path.join(testDir, 'env-dataset'));

      const stats = await fs.stat(resolved);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('priority order', () => {
    it('should prefer appConfig.dataDir over OT_DATA_DIR (user config wins)', async () => {
      const envPath = path.join(testDir, 'env-priority');
      const configPath = path.join(testDir, 'config-priority');
      const config: AppConfig = { version: 1, dataDir: configPath, readOnly: false };

      const resolved = await testResolveEventLogDir(testDir, config, envPath);
      // NEW: appConfig.dataDir (user's deliberate choice) wins over env var
      expect(resolved).toBe(configPath);
    });

    it('should use OT_DATA_DIR when appConfig.dataDir is not set (escape hatch)', async () => {
      const envPath = path.join(testDir, 'env-fallback');
      const config: AppConfig = { version: 1, dataDir: null, readOnly: false };

      const resolved = await testResolveEventLogDir(testDir, config, envPath);
      expect(resolved).toBe(envPath);
    });

    it('should use appConfig.dataDir when OT_DATA_DIR is not set', async () => {
      const configPath = path.join(testDir, 'config-fallback');
      const config: AppConfig = { version: 1, dataDir: configPath, readOnly: false };

      const resolved = await testResolveEventLogDir(testDir, config);
      expect(resolved).toBe(configPath);
    });

    it('should use default when both OT_DATA_DIR and appConfig.dataDir are null/unset', async () => {
      const config: AppConfig = { version: 1, dataDir: null, readOnly: false };

      const resolved = await testResolveEventLogDir(testDir, config);
      expect(resolved).toBe(path.join(testDir, 'dev-events'));
    });
  });

  describe('validation edge cases', () => {
    it('should reject empty string dataDir and fall back to default', async () => {
      const config: AppConfig = { version: 1, dataDir: '', readOnly: false };

      const resolved = await testResolveEventLogDir(testDir, config);
      expect(resolved).toBe(path.join(testDir, 'dev-events'));
    });

    it('should reject dataDir with null bytes and fall back to default', async () => {
      const config: AppConfig = { version: 1, dataDir: 'invalid\0path', readOnly: false };

      const resolved = await testResolveEventLogDir(testDir, config);
      expect(resolved).toBe(path.join(testDir, 'dev-events'));
    });

    it('should fall back to default if dataDir points to a file (not directory)', async () => {
      const filePath = path.join(testDir, 'not-a-directory.txt');
      await fs.writeFile(filePath, 'content', 'utf-8');

      const config: AppConfig = { version: 1, dataDir: filePath, readOnly: false };

      const resolved = await testResolveEventLogDir(testDir, config);
      expect(resolved).toBe(path.join(testDir, 'dev-events'));
    });
  });

  describe('OT_DATA_DIR whitespace handling', () => {
    it('should trim whitespace from OT_DATA_DIR', async () => {
      const config: AppConfig = { version: 1, dataDir: null, readOnly: false };

      const resolved = await testResolveEventLogDir(testDir, config, '  env-trimmed  ');
      expect(resolved).toBe(path.join(testDir, 'env-trimmed'));
    });
  });
});

// First-run gate (#196 / dev:empty regression). Bootstrap defers event log
// construction whenever `appConfig.dataDir === null` so the onboarding wizard
// can render against an empty in-memory read model — no leftover events from
// a prior run pollute the UI behind the wizard. The decision is encapsulated
// in `shouldDeferEventLog` so the policy can be unit-tested without Electron.
describe('bootstrap.ts — shouldDeferEventLog (onboarding gate)', () => {
  it('returns true when no dataDir is configured (fresh first-run)', async () => {
    const { shouldDeferEventLog } = await import('./bootstrap.js');
    const config: AppConfig = { version: 1, dataDir: null, readOnly: false };
    expect(shouldDeferEventLog(config)).toBe(true);
  });

  it('returns false when dataDir is set (user has chosen a folder)', async () => {
    const { shouldDeferEventLog } = await import('./bootstrap.js');
    const config: AppConfig = {
      version: 1,
      dataDir: '/some/picked/folder',
      readOnly: false,
    };
    expect(shouldDeferEventLog(config)).toBe(false);
  });
});
