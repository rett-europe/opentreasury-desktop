// config:get / config:setDataDir IPC handler — P0-3 / P1-2 trial-readiness.
//
// Exposes the loaded app config to the renderer. The config is loaded at
// bootstrap and cached in memory.
//
// `config:setDataDir` validates a candidate folder, persists it to
// app-config.json (atomic tmp → fsync → rename), and schedules an app
// relaunch so the next boot picks up the new dataDir cleanly. Events are NOT
// migrated between folders (fresh-start by design — Pedro lock).

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  configGetRequestSchema,
  type ConfigGetResponse,
  configSetDataDirRequestSchema,
  type ConfigSetDataDirResponse,
  type AppConfig,
} from '../../../shared/ipc-contracts/config.js';
import { saveAppConfig } from '../../config.js';
import {
  getAppConfig,
  getDatasetIdOrNull,
  setAppConfig,
  getEffectiveEventLogDir,
  getEffectiveEventLogDirOrNull,
} from '../../bootstrap.js';
import { CURRENT_SCHEMA_VERSION, detectFolderKind } from '../../dataset.js';

export async function handleConfigGet(raw: unknown): Promise<ConfigGetResponse> {
  // Validate request (even though it's empty, belt-and-suspenders)
  configGetRequestSchema.parse(raw);

  const config = getAppConfig();
  const effectiveDataDir = getEffectiveEventLogDir();
  return { ok: true, config, effectiveDataDir };
}

/**
 * Dependencies for the setDataDir handler. Injected so tests can stub
 * Electron's `app` (relaunch + exit + getPath) without spinning up Electron.
 */
export interface SetDataDirDeps {
  /** Returns the userData directory (where app-config.json lives). */
  userDataDir(): string;
  /** Schedule a relaunch on next exit (Electron's `app.relaunch`). */
  relaunch(): void;
  /** Exit the current process with the given code (Electron's `app.exit`). */
  exit(code: number): void;
  /** Force immediate process termination (Node's `process.exit`). */
  forceExit(code: number): void;
  /** Returns the current full app config (defaults to bootstrap.getAppConfig).
   *  Exposed for tests; production should not pass this. */
  getCurrentConfig?(): AppConfig;
  /** In-memory current dataDir resolver (defaults to bootstrap.getEffectiveEventLogDirOrNull).
   *  Returns null when bootstrap deferred the event log (first-run / onboarding).
   *  Exposed for tests; production should not pass this. */
  getCurrentDataDir?(): string | null;
  /** Current datasetId (defaults to bootstrap.getDatasetIdOrNull). Returns
   *  null when bootstrap deferred the event log (first-run / onboarding).
   *  Exposed for tests; production should not pass this. */
  getCurrentDatasetId?(): string | null;
  /** Atomic save (defaults to ../../config.js saveAppConfig). For tests. */
  saveConfig?(userDataDir: string, config: AppConfig): Promise<void>;
  /** In-memory cache update after persistence. Defaults to bootstrap.setAppConfig. */
  updateCachedConfig?(config: AppConfig): void;
}

/**
 * Factory that builds the setDataDir handler with injected dependencies.
 * In production wiring (registerIpcHandlers), pass an Electron-backed deps
 * object. Tests pass stubs.
 */
export function createConfigSetDataDirHandler(deps: SetDataDirDeps) {
  return async function handleConfigSetDataDir(raw: unknown): Promise<ConfigSetDataDirResponse> {
    // 1. Validate request shape
    const parsed = configSetDataDirRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: 'SCHEMA_INVALID',
          message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        },
      };
    }

    const { newDir, confirmDatasetSwitch = false } = parsed.data;
    const userDataDir = deps.userDataDir();
    const candidate = path.resolve(newDir);

    // 2. Reject paths under userData. Data must NOT live in Electron's
    //    per-app userData (which is local-only and wiped on uninstall).
    //    The first-run onboarding wizard offers `<Documents>/OpenTreasury`
    //    as the "Use default location" affordance, which is outside
    //    userData and therefore passes this check naturally.
    if (isUnderDir(candidate, path.resolve(userDataDir))) {
      return {
        ok: false,
        error: {
          code: 'INVALID_LOCATION',
          message: `Data folder must not be under the app's data directory (${userDataDir}) — that location is wiped on uninstall. Choose any other folder, such as Documents, a synced cloud folder, or an external drive.`,
        },
      };
    }

    // 3. Reject no-op (same as currently active dataDir).
    //    First-run state: no current dataDir means there is nothing to no-op
    //    against, so the candidate is by definition a fresh choice.
    const currentDataDir = (deps.getCurrentDataDir ?? defaultGetCurrentDataDir)();
    if (currentDataDir !== null && pathsEqual(candidate, currentDataDir)) {
      return {
        ok: false,
        error: {
          code: 'SAME_DIR',
          message: 'The selected folder is the same as the current data folder.',
        },
      };
    }

    // 4. Ensure the directory exists (mkdir -p), then verify it's writable
    //    by touching a probe file and removing it.
    try {
      await fs.mkdir(candidate, { recursive: true });
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'NOT_WRITABLE',
          message: `Cannot create folder: ${errMessage(err)}`,
        },
      };
    }

    const probePath = path.join(candidate, `.ot-write-probe-${process.pid}-${Date.now()}`);
    try {
      await fs.writeFile(probePath, 'probe', 'utf-8');
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'NOT_WRITABLE',
          message: `Folder is not writable: ${errMessage(err)}`,
        },
      };
    } finally {
      // Best-effort cleanup; ignore errors (probe may not exist if write failed).
      await fs.rm(probePath, { force: true }).catch(() => undefined);
    }

    // 5. Dataset-mismatch guard: read the target folder's canonical
    //    dataset.json. A foreign datasetId is bypassable via the renderer's
    //    confirm dialog (Pedro flow). A schemaVersion newer than this app
    //    supports, a corrupt dataset.json, or a folder containing an old
    //    events.ndjson without dataset.json are all hard refusals.
    //
    //    First-run state: when there is no current datasetId (bootstrap
    //    deferred the event log because no dataDir was configured), the
    //    "switch workspace" semantic does not apply — there is nothing to
    //    switch FROM. We still run the schema/corrupt/foreign checks because
    //    those are absolute (the target folder must be safe to open), but we
    //    skip the datasetId-mismatch check.
    const currentDatasetId = (deps.getCurrentDatasetId ?? defaultGetCurrentDatasetId)();
    const mismatch = await detectDatasetMismatch(candidate, currentDatasetId);
    if (mismatch !== null) {
      switch (mismatch.kind) {
        case 'datasetId': {
          if (confirmDatasetSwitch) {
            // User confirmed the workspace switch — proceed.
            break;
          }
          return {
            ok: false,
            error: {
              code: 'DATASET_MISMATCH',
              message: mismatch.error,
              details: {
                // `kind: 'datasetId'` is only emitted when currentDatasetId
                // is non-null (see detectDatasetMismatch — first-run state
                // skips this branch entirely), so the assertion is safe.
                currentDatasetId: currentDatasetId as string,
                newDatasetId: mismatch.newDatasetId,
                ...(mismatch.schemaVersion !== undefined
                  ? { schemaVersion: mismatch.schemaVersion }
                  : {}),
              },
            },
          };
        }
        case 'schemaTooNew': {
          // NEVER bypassable — older app cannot safely open newer-schema data.
          return {
            ok: false,
            error: {
              code: 'SCHEMA_TOO_NEW',
              message: mismatch.error,
              details: {
                folderSchemaVersion: mismatch.schemaVersion,
                appSchemaVersion: CURRENT_SCHEMA_VERSION,
              },
            },
          };
        }
        case 'corrupt': {
          return {
            ok: false,
            error: {
              code: 'DATASET_CORRUPT',
              message: mismatch.error,
            },
          };
        }
        case 'foreign': {
          // Folder has an events.ndjson but no dataset.json (legacy / random
          // folder). No datasetId to surface; user must pick an empty folder.
          return {
            ok: false,
            error: {
              code: 'DATASET_MISMATCH',
              message: mismatch.error,
            },
          };
        }
      }
    }

    // 6. Persist new dataDir to app-config.json atomically.
    //    Save the current dataDir as previousDataDir for recovery (only when
    //    there IS a current dataDir — first-run has no predecessor).
    const currentConfig = (deps.getCurrentConfig ?? defaultGetCurrentConfig)();
    const next: AppConfig = {
      ...currentConfig,
      dataDir: candidate,
      ...(currentDataDir !== null ? { previousDataDir: currentDataDir } : {}),
    };
    try {
      await (deps.saveConfig ?? saveAppConfig)(userDataDir, next);
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'WRITE_FAILED',
          message: `Failed to save app-config.json: ${errMessage(err)}`,
        },
      };
    }
    (deps.updateCachedConfig ?? setAppConfig)(next);

    // 7. Schedule relaunch — fresh boot picks up the new dataDir cleanly.
    //    Defer slightly so the IPC reply can flush before the process exits.
    setImmediate(() => {
      deps.relaunch();
      deps.exit(0);
      deps.forceExit(0); // Force process termination to guarantee clean slate
    });

    return { ok: true };
  };
}

/**
 * Production deps factory. Imports Electron's `app` lazily so unit tests that
 * import this module without Electron available (vitest's node env) don't
 * blow up at import time.
 */
export async function buildProductionSetDataDirDeps(): Promise<SetDataDirDeps> {
  const { app } = await import('electron');
  return {
    userDataDir: () => app.getPath('userData'),
    relaunch: () => app.relaunch(),
    exit: (code: number) => app.exit(code),
    forceExit: (code: number) => process.exit(code),
  };
}

// --- helpers ------------------------------------------------------------

function defaultGetCurrentConfig(): AppConfig {
  return getAppConfig();
}

function defaultGetCurrentDataDir(): string | null {
  return getEffectiveEventLogDirOrNull();
}

function defaultGetCurrentDatasetId(): string | null {
  return getDatasetIdOrNull();
}

function isUnderDir(child: string, parent: string): boolean {
  // path.relative returns '' for identical paths and a path that does NOT
  // start with '..' for descendants. Use case-insensitive compare on Windows.
  const rel = path.relative(parent, child);
  if (rel === '') return true; // identical
  if (rel.startsWith('..')) return false;
  if (path.isAbsolute(rel)) return false; // different drive on Windows
  return true;
}

function pathsEqual(a: string, b: string): boolean {
  // Windows is case-insensitive; POSIX is case-sensitive. Normalize both.
  const na = path.normalize(a);
  const nb = path.normalize(b);
  if (process.platform === 'win32') {
    return na.toLowerCase() === nb.toLowerCase();
  }
  return na === nb;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Inspect the target folder's canonical workspace identity (dataset.json) and
 * decide whether the switch is safe.
 *
 * Returns null when the folder is safe to use (empty folder, or dataset.json
 * matches current). Returns a structured mismatch otherwise. The caller maps
 * `kind` onto IPC error codes — only `kind: 'datasetId'` is bypassable via
 * `confirmDatasetSwitch`.
 *
 * First-run logic (currentDatasetId === null):
 * - EMPTY folder → ACCEPT (no dataset.json, no events) — will initialize on boot
 * - VALID_OT folder → ACCEPT (adopt the workspace identity, skip datasetId check)
 * - FOREIGN folder → REJECT (has events but no dataset.json — hard refusal)
 * - Schema-too-new → REJECT (absolute refusal, app too old)
 * - Corrupt → REJECT (absolute refusal, cannot determine identity)
 *
 * Regular-run logic (currentDatasetId !== null):
 * - EMPTY folder → ACCEPT (fresh workspace)
 * - VALID_OT + matching datasetId → ACCEPT (same workspace)
 * - VALID_OT + mismatched datasetId → REJECT unless user confirms switch
 * - FOREIGN / CORRUPT / SCHEMA_TOO_NEW → REJECT (hard refusal)
 *
 * @see docs/specs/dataset-compatibility-validation.md § Schema-Version Handshake
 * @see docs/specs/error-codes.md § DATASET_MISMATCH, SCHEMA_TOO_NEW, DATASET_CORRUPT
 */
type DatasetMismatch =
  | { kind: 'datasetId'; error: string; newDatasetId: string; schemaVersion?: number }
  | { kind: 'schemaTooNew'; error: string; newDatasetId: string; schemaVersion: number }
  | { kind: 'corrupt'; error: string }
  | { kind: 'foreign'; error: string };

async function detectDatasetMismatch(
  dir: string,
  currentDatasetId: string | null,
): Promise<DatasetMismatch | null> {
  // Classify folder state first (EMPTY / VALID_OT / FOREIGN).
  // This centralizes the dataset.json + events.ndjson existence checks.
  const folderState = await detectFolderKind(dir);

  // FOREIGN: has events.ndjson but no valid dataset.json → hard rejection.
  // This applies to both first-run and regular-run (per #206 binding decision:
  // foreign folders are never acceptable).
  // If dataset.json exists but is corrupt, return 'corrupt' kind so the caller
  // can surface DATASET_CORRUPT instead of DATASET_MISMATCH.
  if (folderState.kind === 'FOREIGN') {
    if (folderState.isCorrupt) {
      return {
        kind: 'corrupt',
        error: folderState.error ?? 'Dataset metadata is corrupted.',
      };
    }
    return {
      kind: 'foreign',
      error: folderState.error ?? 'Folder contains events but no valid dataset.json.',
    };
  }

  // EMPTY: no dataset.json, no events.ndjson → safe to initialize.
  // Accept for both first-run and regular-run.
  if (folderState.kind === 'EMPTY') {
    return null; // accept
  }

  // VALID_OT: has a valid dataset.json. Check schemaVersion and datasetId.
  const { datasetId, schemaVersion } = folderState.dataset!;

  // Schema check: folder's schemaVersion > app's CURRENT_SCHEMA_VERSION?
  // → Hard rejection (app too old; user must upgrade).
  // This applies to both first-run and regular-run.
  if (schemaVersion > CURRENT_SCHEMA_VERSION) {
    return {
      kind: 'schemaTooNew',
      error: `This folder was created with a newer version of OpenTreasury (schema v${schemaVersion}). Update the app to continue. Current app schema: v${CURRENT_SCHEMA_VERSION}.`,
      newDatasetId: datasetId,
      schemaVersion,
    };
  }

  // First-run state (currentDatasetId === null):
  // - No workspace is currently active, so any VALID_OT folder is adoptable.
  // - Skip the datasetId-mismatch check (no "current" to compare against).
  if (currentDatasetId === null) {
    return null; // accept (adopt this workspace)
  }

  // Regular-run state (currentDatasetId !== null):
  // - Check whether the target folder belongs to a different workspace.
  if (datasetId !== currentDatasetId) {
    return {
      kind: 'datasetId',
      error: `Folder belongs to a different workspace (datasetId ${datasetId}).`,
      newDatasetId: datasetId,
      schemaVersion,
    };
  }

  // Same workspace, schema OK → accept.
  return null;
}
