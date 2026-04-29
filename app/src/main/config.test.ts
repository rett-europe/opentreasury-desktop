// Tests for config.ts — P0-3 trial-readiness.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  loadAppConfig,
  saveAppConfig,
  createDefaultAppConfig,
  appConfigSchema,
  type AppConfig,
} from './config.js';

describe('config.ts', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = path.join(os.tmpdir(), `ot-config-test-${Date.now()}-${Math.random()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('createDefaultAppConfig', () => {
    it('should create a valid config with defaults', () => {
      const config = createDefaultAppConfig();
      const result = appConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      expect(config.version).toBe(1);
      expect(config.dataDir).toBeNull();
      expect(config.readOnly).toBe(false);
    });
  });

  describe('loadAppConfig', () => {
    it('should return defaults when app-config.json does not exist', async () => {
      const config = await loadAppConfig(testDir);
      expect(config.version).toBe(1);
      expect(config.dataDir).toBeNull();
      expect(config.readOnly).toBe(false);
    });

    it('should load a valid config from disk', async () => {
      const validConfig: AppConfig = {
        version: 1,
        dataDir: 'C:\\MyNGO\\Treasury',
        readOnly: true,
      };

      await saveAppConfig(testDir, validConfig);
      const loaded = await loadAppConfig(testDir);

      expect(loaded).toEqual(validConfig);
    });

    it('should return defaults for invalid JSON', async () => {
      const filePath = path.join(testDir, 'app-config.json');
      await fs.writeFile(filePath, '{ invalid json }', 'utf-8');

      const loaded = await loadAppConfig(testDir);
      expect(loaded.version).toBe(1);
      expect(loaded.dataDir).toBeNull();
      expect(loaded.readOnly).toBe(false);
    });

    it('should return defaults for config with invalid fields', async () => {
      const filePath = path.join(testDir, 'app-config.json');
      await fs.writeFile(filePath, JSON.stringify({ version: 'invalid' }), 'utf-8');

      const loaded = await loadAppConfig(testDir);
      expect(loaded.version).toBe(1);
      expect(loaded.dataDir).toBeNull();
      expect(loaded.readOnly).toBe(false);
    });

    it('should apply schema defaults for partial config', async () => {
      const filePath = path.join(testDir, 'app-config.json');
      // Only version field — others should default
      await fs.writeFile(filePath, JSON.stringify({ version: 1 }), 'utf-8');

      const loaded = await loadAppConfig(testDir);
      expect(loaded.version).toBe(1);
      expect(loaded.dataDir).toBeNull();
      expect(loaded.readOnly).toBe(false);
    });

    it('should accept dataDir as absolute path', async () => {
      const config: AppConfig = {
        version: 1,
        dataDir: 'D:\\Shared\\OpenTreasury',
        readOnly: false,
      };

      await saveAppConfig(testDir, config);
      const loaded = await loadAppConfig(testDir);

      expect(loaded.dataDir).toBe('D:\\Shared\\OpenTreasury');
    });

    it('should accept dataDir as relative path', async () => {
      const config: AppConfig = {
        version: 1,
        dataDir: 'my-dataset',
        readOnly: false,
      };

      await saveAppConfig(testDir, config);
      const loaded = await loadAppConfig(testDir);

      expect(loaded.dataDir).toBe('my-dataset');
    });

    it('should accept dataDir as null', async () => {
      const config: AppConfig = {
        version: 1,
        dataDir: null,
        readOnly: true,
      };

      await saveAppConfig(testDir, config);
      const loaded = await loadAppConfig(testDir);

      expect(loaded.dataDir).toBeNull();
      expect(loaded.readOnly).toBe(true);
    });
  });

  describe('saveAppConfig', () => {
    it('should write app-config.json to disk atomically', async () => {
      const config: AppConfig = {
        version: 1,
        dataDir: 'C:\\Data\\Events',
        readOnly: false,
      };

      await saveAppConfig(testDir, config);

      const filePath = path.join(testDir, 'app-config.json');
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed).toEqual(config);
    });

    it('should overwrite existing app-config.json', async () => {
      const config1: AppConfig = {
        version: 1,
        dataDir: 'first-path',
        readOnly: false,
      };
      await saveAppConfig(testDir, config1);

      const config2: AppConfig = {
        version: 1,
        dataDir: 'second-path',
        readOnly: true,
      };
      await saveAppConfig(testDir, config2);

      const loaded = await loadAppConfig(testDir);
      expect(loaded.dataDir).toBe('second-path');
      expect(loaded.readOnly).toBe(true);
    });

    it('should throw if config is invalid', async () => {
      const invalid = {
        version: -1, // negative version should fail
        dataDir: null,
        readOnly: false,
      };

      // Type assertion to bypass TS checking — we're testing runtime validation
      await expect(saveAppConfig(testDir, invalid as AppConfig)).rejects.toThrow();
    });

    it('should not leave .tmp file after successful write', async () => {
      const config = createDefaultAppConfig();
      await saveAppConfig(testDir, config);

      const tmpPath = path.join(testDir, 'app-config.json.tmp');
      await expect(fs.access(tmpPath)).rejects.toThrow();
    });
  });

  describe('appConfigSchema', () => {
    it('should accept valid config with all fields', () => {
      const valid = {
        version: 1,
        dataDir: 'C:\\MyData',
        readOnly: true,
      };

      const result = appConfigSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should accept config with null dataDir', () => {
      const valid = {
        version: 1,
        dataDir: null,
        readOnly: false,
      };

      const result = appConfigSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should default version to 1', () => {
      const input = {
        dataDir: null,
        readOnly: false,
      };

      const result = appConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.version).toBe(1);
      }
    });

    it('should default dataDir to null', () => {
      const input = {
        version: 1,
        readOnly: false,
      };

      const result = appConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dataDir).toBeNull();
      }
    });

    it('should default readOnly to false', () => {
      const input = {
        version: 1,
        dataDir: null,
      };

      const result = appConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.readOnly).toBe(false);
      }
    });

    it('should reject negative version', () => {
      const invalid = {
        version: -1,
        dataDir: null,
        readOnly: false,
      };

      const result = appConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject zero version', () => {
      const invalid = {
        version: 0,
        dataDir: null,
        readOnly: false,
      };

      const result = appConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject non-boolean readOnly', () => {
      const invalid = {
        version: 1,
        dataDir: null,
        readOnly: 'yes',
      };

      const result = appConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject non-string dataDir (if not null)', () => {
      const invalid = {
        version: 1,
        dataDir: 123,
        readOnly: false,
      };

      const result = appConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });
});
