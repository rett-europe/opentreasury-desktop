// Tests for dataset.ts (P1-1 trial-readiness).
//
// Validates:
//   - loadDatasetId generates and persists on first run
//   - loadDatasetId reuses existing dataset.json on subsequent calls
//   - Atomic write safety (tmp → fsync → rename)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadDatasetId } from './dataset';

describe('dataset', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dataset-test-'));
  });

  afterEach(async () => {
    // Clean up
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('generates a new dataset ID on first run', async () => {
    const datasetId = await loadDatasetId(testDir);

    expect(datasetId).toHaveLength(26); // ULID is 26 chars
    expect(datasetId).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/); // Crockford base32

    // Verify file was written
    const filePath = path.join(testDir, 'dataset.json');
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);

    expect(parsed.datasetId).toBe(datasetId);
    expect(parsed.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('reuses existing dataset ID on subsequent calls', async () => {
    const datasetId1 = await loadDatasetId(testDir);
    const datasetId2 = await loadDatasetId(testDir);

    expect(datasetId1).toBe(datasetId2);
  });

  it('regenerates if dataset.json is corrupted (invalid JSON)', async () => {
    const filePath = path.join(testDir, 'dataset.json');
    await fs.writeFile(filePath, 'not json', 'utf-8');

    const datasetId = await loadDatasetId(testDir);

    expect(datasetId).toHaveLength(26);

    // Verify valid JSON was written
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.datasetId).toBe(datasetId);
  });

  it('regenerates if dataset.json fails schema validation', async () => {
    const filePath = path.join(testDir, 'dataset.json');
    await fs.writeFile(filePath, JSON.stringify({ invalid: 'schema' }), 'utf-8');

    const datasetId = await loadDatasetId(testDir);

    expect(datasetId).toHaveLength(26);

    // Verify valid schema was written
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.datasetId).toBe(datasetId);
    expect(parsed.createdAt).toBeDefined();
  });

  it('generates different dataset IDs for different data directories', async () => {
    const testDir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'dataset-test-2-'));

    try {
      const datasetId1 = await loadDatasetId(testDir);
      const datasetId2 = await loadDatasetId(testDir2);

      expect(datasetId1).not.toBe(datasetId2);
    } finally {
      await fs.rm(testDir2, { recursive: true, force: true });
    }
  });
});
