// Unit tests for pathGuard — Windows-aware path validation.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateFilePath } from './pathGuard.js';

describe('pathGuard', () => {
  const testDir = path.join(process.cwd(), 'test-path-guard');
  const validFile = path.join(testDir, 'valid.csv');
  const symlinkFile = path.join(testDir, 'symlink.csv');

  beforeEach(() => {
    // Create test directory and files
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    fs.writeFileSync(validFile, 'test,data\n1,2\n');
  });

  afterEach(() => {
    // Cleanup
    try {
      if (fs.existsSync(symlinkFile)) {
        fs.unlinkSync(symlinkFile);
      }
      if (fs.existsSync(validFile)) {
        fs.unlinkSync(validFile);
      }
      if (fs.existsSync(testDir)) {
        fs.rmdirSync(testDir);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  it('accepts valid absolute path to regular file', () => {
    const result = validateFilePath(validFile);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized).toBe(path.normalize(validFile));
    }
  });

  it('rejects UNC path (\\\\server\\share)', () => {
    const result = validateFilePath('\\\\server\\share\\file.csv');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('UNC');
    }
  });

  it('rejects device path (\\\\?\\ prefix)', () => {
    const result = validateFilePath('\\\\?\\C:\\test\\file.csv');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('UNC');
    }
  });

  it('rejects device path (\\\\.\\)', () => {
    const result = validateFilePath('\\\\.\\COM1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('UNC');
    }
  });

  it('rejects relative path', () => {
    const result = validateFilePath('./relative/file.csv');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('absolute');
    }
  });

  it('rejects path traversal (..)', () => {
    // Path that contains .. after normalization
    // On Windows, path.normalize converts / to \ but keeps .. if it's in the middle
    const pathWithDots = validFile.replace(path.basename(validFile), '..\\..\\secret.csv');
    const result = validateFilePath(pathWithDots);
    expect(result.ok).toBe(false);
    // The normalized path will contain '..' which our validator checks for
    // But if the file doesn't exist, we'll get "not found" first
    // Both are valid rejections for a malicious path
  });

  it('rejects Windows reserved device name (CON)', () => {
    const result = validateFilePath(path.join(testDir, 'CON'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('Reserved device');
    }
  });

  it('rejects Windows reserved device name (PRN)', () => {
    const result = validateFilePath(path.join(testDir, 'PRN'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('Reserved device');
    }
  });

  it('rejects Windows reserved device name (COM1)', () => {
    const result = validateFilePath(path.join(testDir, 'COM1'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('Reserved device');
    }
  });

  it('rejects Windows reserved device name with extension (NUL.txt)', () => {
    const result = validateFilePath(path.join(testDir, 'NUL.txt'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('Reserved device');
    }
  });

  it('rejects non-existent file', () => {
    const result = validateFilePath(path.join(testDir, 'nonexistent.csv'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('not found');
    }
  });

  it('rejects symlink', () => {
    // Skip on Windows if symlink creation fails (requires admin privileges)
    try {
      fs.symlinkSync(validFile, symlinkFile, 'file');
    } catch (err) {
      // If we can't create a symlink (Windows without admin), skip this test
      return;
    }

    const result = validateFilePath(symlinkFile);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('Symbolic link');
    }
  });

  it('rejects directory path', () => {
    const result = validateFilePath(testDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('not a regular file');
    }
  });
});
