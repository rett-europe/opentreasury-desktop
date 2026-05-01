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
  getDatasetId,
  setAppConfig,
  getEffectiveEventLogDir,
} from '../../bootstrap.js';
import { CURRENT_SCHEMA_VERSION, loadDatasetMetadata } from '../../dataset.js';

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
  /** Returns the current full app config (defaults to bootstrap.getAppConfig).
   *  Exposed for tests; production should not pass this. */
  getCurrentConfig?(): AppConfig;
  /** In-memory current dataDir resolver (defaults to bootstrap.getEffectiveEventLogDir).
   *  Exposed for tests; production should not pass this. */
  getCurrentDataDir?(): string;
  /** Current datasetId (defaults to bootstrap.getDatasetId).
   *  Exposed for tests; production should not pass this. */
  getCurrentDatasetId?(): string;
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

    const { newDir, confirmDatasetSwitch = false, bypassLocationCheck = false } = parsed.data;
    const userDataDir = deps.userDataDir();
    const candidate = path.resolve(newDir);

    // 2. Reject paths under userData. Data must NOT live in Electron's
    //    per-app userData (which is local-only and wiped on uninstall).
    //    The first-run onboarding wizard (#196) explicitly offers
    //    `<userData>/my-data` as the "Use default location" affordance, and
    //    bypasses this check via `bypassLocationCheck: true`.
    if (!bypassLocationCheck && isUnderDir(candidate, path.resolve(userDataDir))) {
      return {
        ok: false,
        error: {
          code: 'INVALID_LOCATION',
          message: `Data folder must not be under the app's data directory (${userDataDir}) — that location is wiped on uninstall. Choose any other folder, such as Documents, a synced cloud folder, or an external drive.`,
        },
      };
    }

    // 3. Reject no-op (same as currently active dataDir).
    const currentDataDir = (deps.getCurrentDataDir ?? defaultGetCurrentDataDir)();
    if (pathsEqual(candidate, currentDataDir)) {
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
                currentDatasetId,
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
    //    Save the current dataDir as previousDataDir for recovery.
    const currentConfig = (deps.getCurrentConfig ?? defaultGetCurrentConfig)();
    const next: AppConfig = {
      ...currentConfig,
      dataDir: candidate,
      previousDataDir: currentDataDir, // fallback on bootstrap failure
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
  };
}

// --- helpers ------------------------------------------------------------

function defaultGetCurrentConfig(): AppConfig {
  return getAppConfig();
}

function defaultGetCurrentDataDir(): string {
  return getEffectiveEventLogDir();
}

function defaultGetCurrentDatasetId(): string {
  return getDatasetId();
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
 * NOTE: We deliberately do NOT scan events.ndjson for a datasetId here. The
 * old "first line of events.ndjson" probe was unreliable because flat
 * Configuración events (e.g. AccountCreated) don't carry a top-level
 * datasetId, which made the bypass-on-confirm path unreachable for workspaces
 * created via the configuración flow (Pedro's repro, fix/dataset-switch-bypass).
 */
type DatasetMismatch =
  | { kind: 'datasetId'; error: string; newDatasetId: string; schemaVersion?: number }
  | { kind: 'schemaTooNew'; error: string; newDatasetId: string; schemaVersion: number }
  | { kind: 'corrupt'; error: string }
  | { kind: 'foreign'; error: string };

async function detectDatasetMismatch(
  dir: string,
  currentDatasetId: string,
): Promise<DatasetMismatch | null> {
  const meta = await loadDatasetMetadata(dir);

  if (meta.status === 'corrupt') {
    return {
      kind: 'corrupt',
      error: meta.error,
    };
  }

  if (meta.status === 'ok') {
    const { datasetId, schemaVersion } = meta.dataset;

    // Schema check first — even a "matching" datasetId from a future-schema
    // folder must not be opened by an older app build.
    if (schemaVersion > CURRENT_SCHEMA_VERSION) {
      return {
        kind: 'schemaTooNew',
        error: `Folder dataset.json declares schemaVersion=${schemaVersion}; this app supports up to ${CURRENT_SCHEMA_VERSION}. Update OpenTreasury to use this folder.`,
        newDatasetId: datasetId,
        schemaVersion,
      };
    }

    if (datasetId !== currentDatasetId) {
      return {
        kind: 'datasetId',
        error: `Folder belongs to a different workspace (datasetId ${datasetId}).`,
        newDatasetId: datasetId,
        schemaVersion,
      };
    }

    return null; // matching workspace — safe to use
  }

  // meta.status === 'missing' — no dataset.json. Check whether the folder is
  // truly empty (safe) or whether it carries legacy events from before
  // dataset.json existed (foreign — must refuse without exposing a datasetId).
  const eventsPath = path.join(dir, 'events.ndjson');
  try {
    const stat = await fs.stat(eventsPath);
    if (stat.isFile() && stat.size > 0) {
      return {
        kind: 'foreign',
        error: `Folder contains events.ndjson but no dataset.json — cannot determine workspace identity. Choose an empty folder.`,
      };
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      return {
        kind: 'corrupt',
        error: `Cannot stat ${eventsPath}: ${errMessage(err)}`,
      };
    }
  }

  return null;
}
