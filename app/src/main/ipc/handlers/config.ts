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

    const { newDir, confirmDatasetSwitch = false } = parsed.data;
    const userDataDir = deps.userDataDir();
    const candidate = path.resolve(newDir);

    // 2. Reject paths under userData. Data must NOT live in Electron's
    //    per-app userData (which is local-only and wiped on uninstall).
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

    // 5. Dataset-mismatch guard: if events.ndjson already exists in the
    //    target folder, peek the first line and confirm its datasetId matches
    //    the currently-active dataset. A foreign datasetId means the folder
    //    belongs to another workspace and we refuse to co-mingle.
    const currentDatasetId = (deps.getCurrentDatasetId ?? defaultGetCurrentDatasetId)();
    const mismatch = await detectDatasetMismatch(candidate, currentDatasetId);
    if (mismatch !== null) {
      // If there's a dataset ID mismatch and confirmDatasetSwitch is true, allow the switch.
      // Otherwise, return error with details.
      const isDatasetIdMismatch = mismatch.newDatasetId !== undefined;
      if (isDatasetIdMismatch && confirmDatasetSwitch) {
        // User confirmed — proceed with the switch
      } else {
        return {
          ok: false,
          error: {
            code: 'DATASET_MISMATCH',
            message: mismatch.error,
            details:
              isDatasetIdMismatch && mismatch.newDatasetId
                ? {
                    currentDatasetId,
                    newDatasetId: mismatch.newDatasetId,
                  }
                : undefined,
          },
        };
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
 * Returns null when no mismatch is detected (folder empty / no log / log
 * matches current datasetId). Returns a human-readable message when the
 * folder already contains events from a different dataset.
 */
async function detectDatasetMismatch(
  dir: string,
  currentDatasetId: string,
): Promise<{ error: string; newDatasetId?: string } | null> {
  const eventsPath = path.join(dir, 'events.ndjson');

  let raw: string;
  try {
    raw = await fs.readFile(eventsPath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    // Unreadable existing file — treat as foreign data; safer to refuse than
    // to silently overwrite.
    return { error: `Cannot read existing events.ndjson at ${eventsPath}: ${errMessage(err)}` };
  }

  const firstLine = raw.split('\n').find((line) => line.trim().length > 0);
  if (!firstLine) return null; // empty file

  let parsed: unknown;
  try {
    parsed = JSON.parse(firstLine);
  } catch {
    return {
      error: `Existing events.ndjson at ${eventsPath} is not valid JSON; refusing to overwrite.`,
    };
  }

  const datasetId =
    typeof parsed === 'object' && parsed !== null && 'datasetId' in parsed
      ? (parsed as { datasetId: unknown }).datasetId
      : undefined;

  if (typeof datasetId !== 'string') {
    return {
      error: `Existing events.ndjson at ${eventsPath} has no datasetId; refusing to overwrite.`,
    };
  }

  if (datasetId !== currentDatasetId) {
    return {
      error: `Folder already contains events for a different dataset (${datasetId}). Choose an empty folder.`,
      newDatasetId: datasetId,
    };
  }

  return null;
}
