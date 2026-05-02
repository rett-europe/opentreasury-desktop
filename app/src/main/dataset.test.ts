// Tests for dataset.ts (P1-1 trial-readiness).
//
// Validates:
//   - loadDatasetId generates and persists on first run
//   - loadDatasetId reuses existing dataset.json on subsequent calls
//   - Atomic write safety (tmp → fsync → rename)
//   - loadDatasetMetadata corruption detection (C1/C2/C3)
//   - detectFolderKind classification (EMPTY/VALID_OT/FOREIGN)
//   - validateEventsTail advisory diagnostics

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  loadDatasetId,
  loadDatasetMetadata,
  detectFolderKind,
  validateEventsTail,
  CURRENT_SCHEMA_VERSION,
} from './dataset';

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

  // --- loadDatasetMetadata corruption detection (C1/C2/C3) ---

  it('loadDatasetMetadata returns corrupt (C1: unreadable) for permission errors', async () => {
    const filePath = path.join(testDir, 'dataset.json');
    // Write a valid file first
    await fs.writeFile(
      filePath,
      JSON.stringify({
        datasetId: '01HZZZZZZZZZZZZZZZZZZZZZZA',
        createdAt: '2025-01-01T00:00:00.000Z',
      }),
      'utf-8',
    );

    // Make the file unreadable (only on Unix-like systems with chmod support)
    if (process.platform !== 'win32') {
      await fs.chmod(filePath, 0o000);
      const meta = await loadDatasetMetadata(testDir);
      expect(meta.status).toBe('corrupt');
      if (meta.status === 'corrupt') {
        expect(meta.errorKind).toBe('unreadable');
        expect(meta.error).toContain('Cannot read dataset metadata file');
      }
      // Restore permissions for cleanup
      await fs.chmod(filePath, 0o644);
    }
  });

  it('loadDatasetMetadata returns corrupt (C2: invalid-json) for malformed JSON', async () => {
    const filePath = path.join(testDir, 'dataset.json');
    await fs.writeFile(filePath, 'not valid json {]', 'utf-8');

    const meta = await loadDatasetMetadata(testDir);
    expect(meta.status).toBe('corrupt');
    if (meta.status === 'corrupt') {
      expect(meta.errorKind).toBe('invalid-json');
      expect(meta.error).toContain('corrupted (invalid JSON)');
    }
  });

  it('loadDatasetMetadata returns corrupt (C3: schema-invalid) for missing required fields', async () => {
    const filePath = path.join(testDir, 'dataset.json');
    await fs.writeFile(
      filePath,
      JSON.stringify({ invalid: 'schema', createdAt: '2025-01-01T00:00:00.000Z' }),
      'utf-8',
    );

    const meta = await loadDatasetMetadata(testDir);
    expect(meta.status).toBe('corrupt');
    if (meta.status === 'corrupt') {
      expect(meta.errorKind).toBe('schema-invalid');
      expect(meta.error).toContain('incomplete or invalid');
    }
  });

  it('loadDatasetMetadata returns corrupt (C3: schema-invalid) for invalid datasetId length', async () => {
    const filePath = path.join(testDir, 'dataset.json');
    await fs.writeFile(
      filePath,
      JSON.stringify({ datasetId: 'TOO_SHORT', createdAt: '2025-01-01T00:00:00.000Z' }),
      'utf-8',
    );

    const meta = await loadDatasetMetadata(testDir);
    expect(meta.status).toBe('corrupt');
    if (meta.status === 'corrupt') {
      expect(meta.errorKind).toBe('schema-invalid');
    }
  });

  // --- detectFolderKind classification ---

  it('detectFolderKind returns EMPTY for a truly empty folder', async () => {
    const result = await detectFolderKind(testDir);
    expect(result.kind).toBe('EMPTY');
    expect(result.dataset).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it('detectFolderKind returns EMPTY when events.ndjson is empty or missing', async () => {
    // Create an empty events.ndjson
    await fs.writeFile(path.join(testDir, 'events.ndjson'), '', 'utf-8');
    const result = await detectFolderKind(testDir);
    expect(result.kind).toBe('EMPTY');
  });

  it('detectFolderKind returns VALID_OT for folder with valid dataset.json', async () => {
    const filePath = path.join(testDir, 'dataset.json');
    const dataset = {
      datasetId: '01HZZZZZZZZZZZZZZZZZZZZZZA',
      createdAt: '2025-01-01T00:00:00.000Z',
      schemaVersion: 1,
    };
    await fs.writeFile(filePath, JSON.stringify(dataset), 'utf-8');

    const result = await detectFolderKind(testDir);
    expect(result.kind).toBe('VALID_OT');
    expect(result.dataset).toBeDefined();
    expect(result.dataset?.datasetId).toBe('01HZZZZZZZZZZZZZZZZZZZZZZA');
  });

  it('detectFolderKind returns VALID_OT even if events.ndjson is missing', async () => {
    const filePath = path.join(testDir, 'dataset.json');
    await fs.writeFile(
      filePath,
      JSON.stringify({
        datasetId: '01HZZZZZZZZZZZZZZZZZZZZZZA',
        createdAt: '2025-01-01T00:00:00.000Z',
      }),
      'utf-8',
    );

    const result = await detectFolderKind(testDir);
    expect(result.kind).toBe('VALID_OT');
  });

  it('detectFolderKind returns FOREIGN for folder with events.ndjson but no dataset.json', async () => {
    const eventsPath = path.join(testDir, 'events.ndjson');
    await fs.writeFile(eventsPath, '{"id":"evt1","type":"test"}\n', 'utf-8');

    const result = await detectFolderKind(testDir);
    expect(result.kind).toBe('FOREIGN');
    expect(result.error).toContain('contains events.ndjson but no dataset.json');
  });

  it('detectFolderKind returns FOREIGN when dataset.json is corrupt (invalid JSON)', async () => {
    const filePath = path.join(testDir, 'dataset.json');
    await fs.writeFile(filePath, 'not json', 'utf-8');

    const result = await detectFolderKind(testDir);
    expect(result.kind).toBe('FOREIGN');
    expect(result.isCorrupt).toBe(true);
    expect(result.error).toContain('corrupted');
  });

  it('detectFolderKind returns FOREIGN when dataset.json is corrupt (schema fail)', async () => {
    const filePath = path.join(testDir, 'dataset.json');
    await fs.writeFile(filePath, JSON.stringify({ invalid: 'schema' }), 'utf-8');

    const result = await detectFolderKind(testDir);
    expect(result.kind).toBe('FOREIGN');
    expect(result.isCorrupt).toBe(true);
    expect(result.error).toContain('incomplete or invalid');
  });

  // --- validateEventsTail advisory diagnostics ---

  it('validateEventsTail returns null when events.ndjson does not exist', async () => {
    const result = await validateEventsTail(testDir);
    expect(result).toBeNull();
  });

  it('validateEventsTail returns incomplete: false for empty events.ndjson', async () => {
    await fs.writeFile(path.join(testDir, 'events.ndjson'), '', 'utf-8');
    const result = await validateEventsTail(testDir);
    expect(result).toMatchObject({ incomplete: false, lineCount: 0 });
  });

  it('validateEventsTail returns incomplete: false when last line is valid JSON', async () => {
    await fs.writeFile(
      path.join(testDir, 'events.ndjson'),
      '{"id":"evt1","type":"test"}\n{"id":"evt2","type":"test"}\n',
      'utf-8',
    );
    const result = await validateEventsTail(testDir);
    expect(result).toMatchObject({ incomplete: false, lineCount: 2 });
  });

  it('validateEventsTail returns incomplete: true when last line is malformed JSON', async () => {
    await fs.writeFile(
      path.join(testDir, 'events.ndjson'),
      '{"id":"evt1","type":"test"}\n{"id":"evt2","type":"incomplete',
      'utf-8',
    );
    const result = await validateEventsTail(testDir);
    expect(result).toMatchObject({ incomplete: true, lineCount: 2 });
    expect(result?.error).toContain('incomplete or malformed');
  });

  it('validateEventsTail counts lines correctly (ignores blank lines)', async () => {
    await fs.writeFile(
      path.join(testDir, 'events.ndjson'),
      '{"id":"evt1","type":"test"}\n\n{"id":"evt2","type":"test"}\n\n',
      'utf-8',
    );
    const result = await validateEventsTail(testDir);
    expect(result).toMatchObject({ incomplete: false, lineCount: 2 });
  });
});
