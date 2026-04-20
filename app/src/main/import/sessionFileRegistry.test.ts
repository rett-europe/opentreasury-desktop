// Unit tests for sessionFileRegistry — opaque file-ID tokens.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  stageFile,
  resolveFileId,
  evictFileId,
  evictExpired,
  clearAll,
} from './sessionFileRegistry.js';

describe('sessionFileRegistry', () => {
  beforeEach(() => {
    clearAll();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stages a file and returns a ULID fileId', () => {
    const fileId = stageFile('C:\\test\\file.csv');
    expect(fileId).toBeTruthy();
    expect(fileId.length).toBe(26); // ULID length
  });

  it('resolves a staged fileId to its path', () => {
    const filePath = 'C:\\test\\file.csv';
    const fileId = stageFile(filePath);
    const resolved = resolveFileId(fileId);
    expect(resolved).toBe(filePath);
  });

  it('returns null for unknown fileId', () => {
    const resolved = resolveFileId('01ARZ3NDEKTSV4RRFFQ69G5FAV');
    expect(resolved).toBeNull();
  });

  it('evicts a fileId after evictFileId call', () => {
    const filePath = 'C:\\test\\file.csv';
    const fileId = stageFile(filePath);
    evictFileId(fileId);
    const resolved = resolveFileId(fileId);
    expect(resolved).toBeNull();
  });

  it('stages multiple files with unique IDs', () => {
    const fileId1 = stageFile('C:\\test\\file1.csv');
    const fileId2 = stageFile('C:\\test\\file2.csv');
    expect(fileId1).not.toBe(fileId2);

    const resolved1 = resolveFileId(fileId1);
    const resolved2 = resolveFileId(fileId2);
    expect(resolved1).toBe('C:\\test\\file1.csv');
    expect(resolved2).toBe('C:\\test\\file2.csv');
  });

  it('returns null for expired fileId (TTL exceeded)', () => {
    const filePath = 'C:\\test\\file.csv';

    // Mock Date.now to simulate TTL expiration
    const mockNow = vi.spyOn(Date, 'now');
    const baseTime = 1000000;
    mockNow.mockReturnValue(baseTime);

    const fileId = stageFile(filePath);

    // Advance time by 31 minutes (TTL is 30 min)
    mockNow.mockReturnValue(baseTime + 31 * 60 * 1000);

    const resolved = resolveFileId(fileId);
    expect(resolved).toBeNull();
  });

  it('resolves non-expired fileId within TTL', () => {
    const filePath = 'C:\\test\\file.csv';

    const mockNow = vi.spyOn(Date, 'now');
    const baseTime = 1000000;
    mockNow.mockReturnValue(baseTime);

    const fileId = stageFile(filePath);

    // Advance time by 25 minutes (within 30 min TTL)
    mockNow.mockReturnValue(baseTime + 25 * 60 * 1000);

    const resolved = resolveFileId(fileId);
    expect(resolved).toBe(filePath);
  });

  it('evictExpired removes expired entries', () => {
    const mockNow = vi.spyOn(Date, 'now');
    const baseTime = 1000000;
    mockNow.mockReturnValue(baseTime);

    const fileId1 = stageFile('C:\\test\\file1.csv');

    // Advance time by 31 minutes
    mockNow.mockReturnValue(baseTime + 31 * 60 * 1000);

    const fileId2 = stageFile('C:\\test\\file2.csv');

    // Call evictExpired
    evictExpired();

    // fileId1 should be evicted, fileId2 should remain
    expect(resolveFileId(fileId1)).toBeNull();
    expect(resolveFileId(fileId2)).toBe('C:\\test\\file2.csv');
  });

  it('clearAll removes all staged files', () => {
    const fileId1 = stageFile('C:\\test\\file1.csv');
    const fileId2 = stageFile('C:\\test\\file2.csv');

    clearAll();

    expect(resolveFileId(fileId1)).toBeNull();
    expect(resolveFileId(fileId2)).toBeNull();
  });
});
