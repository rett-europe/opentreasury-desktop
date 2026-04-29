// Tests for profile.ts — P0-2 trial-readiness.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadProfile, saveProfile, createDefaultProfile, profileSchema } from './profile.js';

describe('profile.ts', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = path.join(os.tmpdir(), `ot-profile-test-${Date.now()}-${Math.random()}`);
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

  describe('createDefaultProfile', () => {
    it('should create a valid profile with ULID and empty fields', () => {
      const profile = createDefaultProfile();
      const result = profileSchema.safeParse(profile);
      expect(result.success).toBe(true);
      expect(profile.userId).toHaveLength(26);
      expect(profile.name).toBe('');
      expect(profile.role).toBe('');
      expect(profile.ngoName).toBe('');
      expect(profile.identitySource).toBe('local');
      expect(profile.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should generate unique ULIDs on each call', () => {
      const profile1 = createDefaultProfile();
      const profile2 = createDefaultProfile();
      expect(profile1.userId).not.toBe(profile2.userId);
    });
  });

  describe('loadProfile', () => {
    it('should return null when profile.json does not exist', async () => {
      const profile = await loadProfile(testDir);
      expect(profile).toBeNull();
    });

    it('should load a valid profile from disk', async () => {
      const validProfile = createDefaultProfile();
      validProfile.name = 'Ana Costa';
      validProfile.role = 'Treasurer';
      validProfile.ngoName = 'RETT Portugal';

      await saveProfile(testDir, validProfile);
      const loaded = await loadProfile(testDir);

      expect(loaded).toEqual(validProfile);
    });

    it('should return null for invalid JSON', async () => {
      const filePath = path.join(testDir, 'profile.json');
      await fs.writeFile(filePath, '{ invalid json }', 'utf-8');

      const loaded = await loadProfile(testDir);
      expect(loaded).toBeNull();
    });

    it('should return null for profile missing required fields', async () => {
      const filePath = path.join(testDir, 'profile.json');
      await fs.writeFile(filePath, JSON.stringify({ name: 'John' }), 'utf-8');

      const loaded = await loadProfile(testDir);
      expect(loaded).toBeNull();
    });

    it('should return null for profile with invalid userId (not 26 chars)', async () => {
      const filePath = path.join(testDir, 'profile.json');
      const invalid = {
        userId: 'SHORT',
        name: 'Ana',
        role: 'Treasurer',
        ngoName: 'RETT',
        identitySource: 'local',
        createdAt: new Date().toISOString(),
      };
      await fs.writeFile(filePath, JSON.stringify(invalid), 'utf-8');

      const loaded = await loadProfile(testDir);
      expect(loaded).toBeNull();
    });
  });

  describe('saveProfile', () => {
    it('should write profile.json to disk atomically', async () => {
      const profile = createDefaultProfile();
      profile.name = 'Maria Silva';
      profile.role = 'Viewer';
      profile.ngoName = 'NGO Example';

      await saveProfile(testDir, profile);

      const filePath = path.join(testDir, 'profile.json');
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed).toEqual(profile);
    });

    it('should overwrite existing profile.json', async () => {
      const profile1 = createDefaultProfile();
      profile1.name = 'First Name';
      await saveProfile(testDir, profile1);

      const profile2 = createDefaultProfile();
      profile2.name = 'Second Name';
      await saveProfile(testDir, profile2);

      const loaded = await loadProfile(testDir);
      expect(loaded?.name).toBe('Second Name');
    });

    it('should throw if profile is invalid', async () => {
      const invalid = {
        userId: 'TOO_SHORT',
        name: 'Ana',
        role: 'Treasurer',
        ngoName: 'RETT',
        identitySource: 'local',
        createdAt: new Date().toISOString(),
      };

      // Type assertion to bypass TS checking — we're testing runtime validation
      await expect(saveProfile(testDir, invalid as Profile)).rejects.toThrow();
    });

    it('should not leave .tmp file after successful write', async () => {
      const profile = createDefaultProfile();
      profile.name = 'Test User';
      await saveProfile(testDir, profile);

      const tmpPath = path.join(testDir, 'profile.json.tmp');
      await expect(fs.access(tmpPath)).rejects.toThrow();
    });
  });

  describe('profile schema', () => {
    it('should accept valid profile with all fields', () => {
      const valid = {
        userId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        name: 'Pedro Rocha',
        role: 'Administrator',
        ngoName: 'RETT Europe',
        identitySource: 'local' as const,
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      const result = profileSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should accept identitySource: aad', () => {
      const valid = {
        userId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        name: 'Ana Costa',
        role: 'Treasurer',
        ngoName: 'RETT Portugal',
        identitySource: 'aad' as const,
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      const result = profileSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should accept empty name (first-launch state)', () => {
      const valid = {
        userId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        name: '',
        role: '',
        ngoName: '',
        identitySource: 'local',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      const result = profileSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject invalid identitySource', () => {
      const invalid = {
        userId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        name: 'Ana',
        role: 'Treasurer',
        ngoName: 'RETT',
        identitySource: 'google',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      const result = profileSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should default identitySource to local if not provided', () => {
      const input = {
        userId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        name: 'Ana',
        role: 'Treasurer',
        ngoName: 'RETT',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      const result = profileSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.identitySource).toBe('local');
      }
    });
  });
});
