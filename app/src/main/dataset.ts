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

/**
 * Result of loading dataset.json metadata. Discriminated union with actionable
 * error messages for corruption scenarios.
 *
 * - `status: 'missing'` → No dataset.json found (folder may be empty or foreign)
 * - `status: 'ok'` → dataset.json parsed and validated successfully
 * - `status: 'corrupt'` → dataset.json exists but is unreadable, invalid JSON,
 *   or fails schema validation. The `error` field contains a user-actionable
 *   message indicating which corruption scenario was detected.
 *
 * @see docs/specs/error-codes.md § DATASET_CORRUPT (C1/C2/C3)
 */
export type LoadDatasetMetadataResult =
  | { status: 'missing' }
  | { status: 'ok'; dataset: Dataset }
  | {
      status: 'corrupt';
      error: string;
      errorKind: 'unreadable' | 'invalid-json' | 'schema-invalid';
    };

/**
 * Read and parse dataset.json without auto-creating or regenerating it.
 * Used by callers (e.g. dataset-mismatch detection) that need to inspect the
 * canonical workspace identity of a folder before deciding what to do.
 *
 * Returns a discriminated union with actionable error messages for corruption
 * scenarios:
 * - C1: File not found or unreadable → `{ status: 'missing' }` or `{ status: 'corrupt', errorKind: 'unreadable' }`
 * - C2: Invalid JSON → `{ status: 'corrupt', errorKind: 'invalid-json' }`
 * - C3: Schema validation fails → `{ status: 'corrupt', errorKind: 'schema-invalid' }`
 *
 * @see docs/specs/error-codes.md § DATASET_CORRUPT
 * @see docs/specs/dataset-compatibility-validation.md § Corruption Detection
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
    // C1: Unreadable (permission denied, disk I/O error, etc.)
    return {
      status: 'corrupt',
      errorKind: 'unreadable',
      error: `Cannot read dataset metadata file (${filePath}): ${err instanceof Error ? err.message : String(err)}. Ensure the folder is readable and has at least 10 KB free.`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    // C2: Invalid JSON
    return {
      status: 'corrupt',
      errorKind: 'invalid-json',
      error: `The dataset metadata file is corrupted (invalid JSON). If you have a backup, restore it. Otherwise, you may need to start fresh. ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const result = datasetSchema.safeParse(parsed);
  if (!result.success) {
    // C3: Schema validation fails
    return {
      status: 'corrupt',
      errorKind: 'schema-invalid',
      error: `The dataset metadata is incomplete or invalid: ${result.error.message}. This may indicate a disk error or incomplete write. Try restoring from a backup.`,
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

/**
 * Classification result for a folder's state. Used by dataset-mismatch
 * detection to make explicit switching decisions.
 *
 * - `EMPTY`: No dataset.json and no events.ndjson (or empty events.ndjson).
 *   Safe to initialize a new workspace.
 * - `VALID_OT`: Has a valid dataset.json with parseable schema. May or may not
 *   have events.ndjson.
 * - `FOREIGN`: Has events.ndjson but no valid dataset.json. Represents legacy
 *   or non-OT data.
 *
 * @see docs/specs/dataset-compatibility-validation.md § Folder Kind Detection
 * @see docs/specs/error-codes.md § DATASET_MISMATCH (foreign folder scenario)
 */
export type FolderKind = 'EMPTY' | 'VALID_OT' | 'FOREIGN';

export interface DetectFolderKindResult {
  kind: FolderKind;
  /** Set when kind === 'VALID_OT'; the parsed dataset.json metadata. */
  dataset?: Dataset;
  /** Set when kind === 'FOREIGN'; human-readable reason for rejection. */
  error?: string;
  /** When set, indicates dataset.json exists but is corrupt (unreadable/invalid JSON/schema fail).
   * Caller should treat as DATASET_CORRUPT error code, not DATASET_MISMATCH. */
  isCorrupt?: boolean;
}

/**
 * Classify a folder as EMPTY, VALID_OT, or FOREIGN by inspecting dataset.json
 * and events.ndjson existence/validity. Does NOT check schemaVersion or
 * datasetId match — the caller (detectDatasetMismatch) performs those checks.
 *
 * This is the canonical folder-state classifier for dataset switching and
 * first-run logic. Downstream code uses the returned `kind` to decide whether
 * to accept, reject, or confirm a folder switch.
 *
 * @param dir Absolute path to the candidate folder
 * @returns Discriminated union with the folder's classification
 *
 * @see docs/specs/dataset-compatibility-validation.md § Folder Kind Detection
 * @see docs/specs/error-codes.md § DATASET_MISMATCH (foreign folder)
 */
export async function detectFolderKind(dir: string): Promise<DetectFolderKindResult> {
  const meta = await loadDatasetMetadata(dir);

  // If dataset.json is valid and parseable, classify as VALID_OT regardless
  // of events.ndjson state (the caller will check schemaVersion/datasetId).
  if (meta.status === 'ok') {
    return { kind: 'VALID_OT', dataset: meta.dataset };
  }

  // If dataset.json is corrupt, treat as FOREIGN (not safe to open).
  // We don't auto-fix corruption — the user must restore from backup or
  // choose an empty folder. Mark isCorrupt=true so caller can surface
  // DATASET_CORRUPT error code instead of DATASET_MISMATCH.
  if (meta.status === 'corrupt') {
    return { kind: 'FOREIGN', error: meta.error, isCorrupt: true };
  }

  // meta.status === 'missing' — no dataset.json. Check whether the folder is
  // truly empty (safe to initialize) or contains legacy/foreign events.
  const eventsPath = path.join(dir, 'events.ndjson');
  try {
    const stat = await fs.stat(eventsPath);
    if (stat.isFile() && stat.size > 0) {
      // FOREIGN: has events but no dataset.json → cannot determine workspace identity.
      return {
        kind: 'FOREIGN',
        error: `Folder contains events.ndjson but no dataset.json — cannot determine workspace identity. Choose an empty folder or a folder with valid dataset.json.`,
      };
    }
  } catch (err) {
    // events.ndjson doesn't exist or is inaccessible → treat as EMPTY.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      // Stat error (permission denied, I/O error) — treat as FOREIGN to be safe.
      return {
        kind: 'FOREIGN',
        error: `Cannot stat ${eventsPath}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // No dataset.json, no (or empty) events.ndjson → EMPTY folder, safe to initialize.
  return { kind: 'EMPTY' };
}

/**
 * Optional validation: check the tail of events.ndjson to detect incomplete
 * writes (e.g., crash mid-write). Returns an advisory diagnostic (NOT a hard
 * error — the app can still boot and replay up to the truncation point).
 *
 * This is called at folder-switch time (before hydration) to surface early
 * warnings. During hydration, the JsonFileEventLog already handles line-skip
 * on malformed JSON, but this gives the user a heads-up before committing.
 *
 * @param dir Absolute path to the dataset folder
 * @returns Diagnostic info (null if no issues or file doesn't exist)
 *
 * @see docs/specs/error-codes.md § EVENTS_TRUNCATED (future hydration error)
 * @see docs/specs/dataset-compatibility-validation.md § Optional Tail Check
 */
export async function validateEventsTail(
  dir: string,
): Promise<{ incomplete: boolean; lineCount: number; error?: string } | null> {
  const eventsPath = path.join(dir, 'events.ndjson');

  try {
    const content = await fs.readFile(eventsPath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim() !== '');

    if (lines.length === 0) {
      // Empty file → no tail to check.
      return { incomplete: false, lineCount: 0 };
    }

    const lastLine = lines[lines.length - 1];
    if (!lastLine) {
      // Edge case: array is non-empty but last element is undefined
      return { incomplete: false, lineCount: lines.length };
    }

    try {
      JSON.parse(lastLine);
      // Last line is valid JSON → all good.
      return { incomplete: false, lineCount: lines.length };
    } catch (jsonErr) {
      // Last line is incomplete or malformed JSON → advisory warning.
      return {
        incomplete: true,
        lineCount: lines.length,
        error: `Last line in events.ndjson is incomplete or malformed: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}. This may indicate an incomplete write. The app will skip this line during hydration.`,
      };
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // No events.ndjson → no issue.
      return null;
    }
    // Read error → surface as advisory.
    return {
      incomplete: true,
      lineCount: -1,
      error: `Cannot read events.ndjson: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
