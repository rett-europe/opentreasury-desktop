// Dataset ID persistence (P1-1 trial-readiness).
//
// Manages the per-dataset folder ID stored in <dataDir>/dataset.json. This ID
// is stable across app launches within a given data directory and represents
// the "workspace identity" in the datasetId field of DomainEventBase.
//
// The dataset ID is a real ULID (not fake), generated on first event-log
// creation, and persisted atomically (tmp → fsync → rename) for crash safety.
//
// When the user changes dataDir (P1-2 #149), the new folder gets its own
// dataset.json — that's the workspace identity.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import { newUlid } from './ids.js';

/**
 * Current dataset.json schema version. Bumped when we introduce a
 * forward-incompatible change to on-disk layout. A folder whose dataset.json
 * declares a higher schemaVersion than this constant must NOT be opened by
 * older app builds — the user is prompted to update the app instead.
 *
 * @see docs/specs/dataset-compatibility-validation.md § Schema-Version Handshake
 *
 * IMMUTABLE FOR M1: This constant is locked at 1 for the initial release.
 * Future schema bumps (v2, v3, ...) will increment this value and require
 * migration code in app/src/core/migrations/.
 */
export const CURRENT_SCHEMA_VERSION = 1 as const;

/**
 * Zod schema validating dataset.json structure.
 *
 * @see docs/specs/dataset-compatibility-validation.md § Proposed Schema
 *
 * Matches the {@link Dataset} TypeScript interface. Used at runtime to validate
 * the on-disk dataset.json before accepting it as valid workspace metadata.
 */
export const datasetSchema = z.object({
  datasetId: z.string().length(26), // ULID
  createdAt: z.string().datetime(), // ISO 8601 UTC
  // Forward/backward-compat fields. When a legacy dataset.json (v0) is read,
  // schemaVersion is treated as 1 (default) and appVersion stays undefined —
  // we explicitly do NOT regenerate the file just to add these fields.
  schemaVersion: z.number().int().positive().default(1),
  appVersion: z.string().optional(),
});

/**
 * Dataset metadata — canonical on-disk schema for workspace identity.
 *
 * @see docs/specs/dataset-compatibility-validation.md § Proposed Schema
 */
export type Dataset = z.infer<typeof datasetSchema>;

const DATASET_FILENAME = 'dataset.json';

export interface LoadDatasetOptions {
  /** Last-writer's app version, recorded best-effort when CREATING a new dataset.json. */
  appVersion?: string;
}

export type LoadDatasetMetadataResult =
  | { status: 'missing' }
  | { status: 'ok'; dataset: Dataset }
  | { status: 'corrupt'; error: string };

/**
 * Read and parse dataset.json without auto-creating or regenerating it.
 * Used by callers (e.g. dataset-mismatch detection) that need to inspect the
 * canonical workspace identity of a folder before deciding what to do.
 */
export async function loadDatasetMetadata(dataDir: string): Promise<LoadDatasetMetadataResult> {
  const filePath = path.join(dataDir, DATASET_FILENAME);

  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { status: 'missing' };
    }
    return {
      status: 'corrupt',
      error: `Cannot read ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    return {
      status: 'corrupt',
      error: `Invalid JSON in ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const result = datasetSchema.safeParse(parsed);
  if (!result.success) {
    return {
      status: 'corrupt',
      error: `Invalid dataset.json at ${filePath}: ${result.error.message}`,
    };
  }

  return { status: 'ok', dataset: result.data };
}

/**
 * Load dataset.json from the data directory.
 * If the file doesn't exist, generate a new dataset ID and persist it.
 * Returns the dataset ID (never null).
 */
export async function loadDatasetId(
  dataDir: string,
  opts: LoadDatasetOptions = {},
): Promise<string> {
  const filePath = path.join(dataDir, DATASET_FILENAME);

  const meta = await loadDatasetMetadata(dataDir);

  if (meta.status === 'ok') {
    return meta.dataset.datasetId;
  }

  if (meta.status === 'corrupt') {
    // Invalid dataset.json — regenerate and persist (preserves prior behavior).
    // eslint-disable-next-line no-console
    console.warn(`[dataset] ${meta.error} — regenerating`);
    return await createAndSaveDataset(dataDir, opts);
  }

  // missing → first launch or new data folder. Generate and persist.
  // eslint-disable-next-line no-console
  console.log(`[dataset] No dataset.json at ${filePath} — generating new dataset ID`);
  return await createAndSaveDataset(dataDir, opts);
}

/**
 * Generate a new dataset ID and save it atomically.
 */
async function createAndSaveDataset(dataDir: string, opts: LoadDatasetOptions): Promise<string> {
  const dataset: Dataset = {
    datasetId: newUlid(),
    createdAt: new Date().toISOString(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ...(opts.appVersion !== undefined ? { appVersion: opts.appVersion } : {}),
  };

  const filePath = path.join(dataDir, DATASET_FILENAME);
  const tmpPath = `${filePath}.tmp`;

  const content = JSON.stringify(dataset, null, 2);

  // Write to .tmp, fsync, rename atomically (ADR-001 C8)
  await fs.writeFile(tmpPath, content, 'utf-8');
  const fh = await fs.open(tmpPath, 'r+');
  try {
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fs.rename(tmpPath, filePath);

  // eslint-disable-next-line no-console
  console.log(`[dataset] Generated and saved dataset ID: ${dataset.datasetId}`);

  return dataset.datasetId;
}
