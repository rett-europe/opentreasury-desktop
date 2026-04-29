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

// Zod schema — dataset.json structure
export const datasetSchema = z.object({
  datasetId: z.string().length(26), // ULID
  createdAt: z.string().datetime(), // ISO 8601 UTC
});

export type Dataset = z.infer<typeof datasetSchema>;

const DATASET_FILENAME = 'dataset.json';

/**
 * Load dataset.json from the data directory.
 * If the file doesn't exist, generate a new dataset ID and persist it.
 * Returns the dataset ID (never null).
 */
export async function loadDatasetId(dataDir: string): Promise<string> {
  const filePath = path.join(dataDir, DATASET_FILENAME);

  try {
    const content = await fs.readFile(filePath, 'utf-8');

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Invalid JSON — regenerate and persist
      // eslint-disable-next-line no-console
      console.warn(`[dataset] Invalid JSON in dataset.json (${filePath}) — regenerating`);
      return await createAndSaveDataset(dataDir);
    }

    const result = datasetSchema.safeParse(parsed);

    if (!result.success) {
      // Invalid dataset.json — regenerate and persist
      // eslint-disable-next-line no-console
      console.warn(
        `[dataset] Invalid dataset.json (${filePath}): ${result.error.message} — regenerating`,
      );
      return await createAndSaveDataset(dataDir);
    }

    return result.data.datasetId;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist — first launch or new data folder. Generate and persist.
      return await createAndSaveDataset(dataDir);
    }
    // Unexpected I/O error (permission denied, disk full, etc.) — propagate.
    throw err;
  }
}

/**
 * Generate a new dataset ID and save it atomically.
 */
async function createAndSaveDataset(dataDir: string): Promise<string> {
  const dataset: Dataset = {
    datasetId: newUlid(),
    createdAt: new Date().toISOString(),
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
