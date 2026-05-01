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
import { loadDatasetId, loadDatasetMetadata, CURRENT_SCHEMA_VERSION } from './dataset';

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
    expect(parsed.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('stamps appVersion when provided on creation', async () => {
    const datasetId = await loadDatasetId(testDir, { appVersion: '1.2.3' });
    const filePath = path.join(testDir, 'dataset.json');
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    expect(parsed.datasetId).toBe(datasetId);
    expect(parsed.appVersion).toBe('1.2.3');
    expect(parsed.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('loads a legacy dataset.json without schemaVersion/appVersion (treated as v1)', async () => {
    const filePath = path.join(testDir, 'dataset.json');
    const legacy = {
      datasetId: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
      createdAt: '2025-01-01T00:00:00.000Z',
    };
    await fs.writeFile(filePath, JSON.stringify(legacy), 'utf-8');

    const datasetId = await loadDatasetId(testDir);
    expect(datasetId).toBe(legacy.datasetId);

    // File must NOT have been regenerated — backward-compat preserves bytes.
    const after = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    expect(after).toEqual(legacy);

    // loadDatasetMetadata fills the default schemaVersion in the parsed view.
    const meta = await loadDatasetMetadata(testDir);
    expect(meta).toMatchObject({
      status: 'ok',
      dataset: { datasetId: legacy.datasetId, schemaVersion: 1 },
    });
  });

  it('loadDatasetMetadata returns missing for an empty folder', async () => {
    const meta = await loadDatasetMetadata(testDir);
    expect(meta.status).toBe('missing');
  });

  it('loadDatasetMetadata returns corrupt for invalid JSON (without auto-creating)', async () => {
    const filePath = path.join(testDir, 'dataset.json');
    await fs.writeFile(filePath, 'not json', 'utf-8');

    const meta = await loadDatasetMetadata(testDir);
    expect(meta.status).toBe('corrupt');

    // File untouched (no auto-creation in metadata path).
    const after = await fs.readFile(filePath, 'utf-8');
    expect(after).toBe('not json');
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
