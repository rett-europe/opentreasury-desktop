// WI-4′ — main-process bootstrap: resolves the event log directory from
// Electron's userData path, constructs the JsonFileEventLog, hydrates the
// core read model, and (in dev only) seeds prototype-shaped data on first run.
//
// Exposes singletons:
//   - eventLog: the EventLog instance (IPC command handlers will call append)
//   - initializeApp(): idempotent, must be awaited before IPC handlers are
//     registered so the read model is already hydrated when the first query
//     arrives.
//
// ADR-001 C7 (sandbox): all file I/O happens here in the main process.
// ADR-002 §2.4: core/eventLog stays Electron-free; the Electron import lives
// in this bootstrap file which is main-only.

import { app } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { JsonFileEventLog } from '../core/eventLog/index.js';
import type { EventLog, DomainEvent } from '../core/eventLog/index.js';
import { replayEvents, getReadModel } from '../core/query/reducers.js';
import type { ReadModel } from '../core/query/types.js';
import { buildDevSeedEvents } from './devSeed.js';
import { loadProfile, type Profile } from './profile.js';
import { loadAppConfig, saveAppConfig, type AppConfig } from './config.js';
import { createReadOnlyEventLog } from './eventLog-readonly-wrapper.js';
import { loadDeviceId } from './device.js';
import { loadDatasetId } from './dataset.js';

// Helper for dev-seed fallback when no profile exists yet
function fakeUlid(seedKey: string): string {
  const upper = seedKey.toUpperCase().replace(/[^0-9A-HJKMNP-TV-Z]/g, '0');
  return (upper + '0'.repeat(26)).slice(0, 26);
}

let eventLogInstance: EventLog | null = null;
let profileInstance: Profile | null = null;
let appConfigInstance: AppConfig | null = null;
let deviceIdInstance: string | null = null;
let datasetIdInstance: string | null = null;
let effectiveEventLogDir: string | null = null;
let bootstrapped = false;

export function getEventLog(): EventLog {
  if (eventLogInstance === null) {
    throw new Error('[bootstrap] getEventLog() called before initializeApp() resolved');
  }
  return eventLogInstance;
}

export function getHydratedReadModel(): ReadModel {
  if (!bootstrapped) {
    throw new Error('[bootstrap] getHydratedReadModel() called before initializeApp() resolved');
  }
  return getReadModel();
}

/**
 * Get the loaded profile. Returns null if no profile exists yet (first launch).
 * The renderer's ProfileSetupModal (P1-4) handles the first-launch UX.
 */
export function getProfile(): Profile | null {
  if (!bootstrapped) {
    throw new Error('[bootstrap] getProfile() called before initializeApp() resolved');
  }
  return profileInstance;
}

/**
 * Update the in-memory profile cache after a save. Called by the profile:save
 * IPC handler after writing to disk.
 */
export function setProfile(profile: Profile | null): void {
  profileInstance = profile;
}

/**
 * Get the loaded app config.
 */
export function getAppConfig(): AppConfig {
  if (!bootstrapped || appConfigInstance === null) {
    throw new Error('[bootstrap] getAppConfig() called before initializeApp() resolved');
  }
  return appConfigInstance;
}

/**
 * Update the in-memory app config cache after a save. Called by the
 * config:setDataDir IPC handler (P1-2 #149) after writing to disk.
 */
export function setAppConfig(config: AppConfig): void {
  appConfigInstance = config;
}

/**
 * Get the loaded device ID (per-laptop stable ID).
 */
export function getDeviceId(): string {
  if (!bootstrapped || deviceIdInstance === null) {
    throw new Error('[bootstrap] getDeviceId() called before initializeApp() resolved');
  }
  return deviceIdInstance;
}

/**
 * Get the loaded dataset ID (per-data-folder stable ID).
 */
export function getDatasetId(): string {
  if (!bootstrapped || datasetIdInstance === null) {
    throw new Error('[bootstrap] getDatasetId() called before initializeApp() resolved');
  }
  return datasetIdInstance;
}

/**
 * Get the effective event log directory (the actual absolute path in use).
 * This is the resolved path after applying config, env overrides, and defaults.
 */
export function getEffectiveEventLogDir(): string {
  if (!bootstrapped || effectiveEventLogDir === null) {
    throw new Error('[bootstrap] getEffectiveEventLogDir() called before initializeApp() resolved');
  }
  return effectiveEventLogDir;
}

/**
 * Resolve the event-log directory from app config, env override, or default.
 *
 * Priority order (highest to lowest):
 *   1. appConfig.dataDir (from userData/app-config.json — user's deliberate choice via Preferences UI)
 *   2. OT_DATA_DIR env var (dev bootstrap escape hatch; only applies when appConfig.dataDir is unset)
 *   3. Default: <userData>/dev-events
 *
 * P0-3 trial-readiness changes:
 *   - Absolute paths are now allowed (for trial one-writer posture)
 *   - Validates the path exists; attempts mkdir -p if missing
 *   - Falls back to default on validation failure
 *
 * Recovery persistence (squad/recovery-persist-and-tight-allowlist):
 *   - When fallback happens, persist the recovered path to app-config.json
 *   - Set previousDataDir to the path that failed (for diagnostics)
 *   - This ensures the UI shows the effective path, not the broken one
 *
 * NOTE: app.getPath('userData') must be called AFTER app.whenReady() resolves
 * — before that the path can change (Electron initializes it as part of the
 * bootstrap sequence). initializeApp() is therefore only safe to invoke inside
 * the whenReady() callback in main/index.ts.
 *
 * Returns an object with { dir, configChanged, newConfig } where:
 *   - dir: the resolved event log directory path
 *   - configChanged: true if recovery fallback happened and config should be persisted
 *   - newConfig: the updated config (only set if configChanged is true)
 */
async function resolveEventLogDir(
  userDataDir: string,
  appConfig: AppConfig,
): Promise<{ dir: string; configChanged: boolean; newConfig?: AppConfig }> {
  const envOverride = process.env['OT_DATA_DIR']?.trim();
  const configPath = appConfig.dataDir;

  // Priority 1: appConfig.dataDir (user's deliberate choice via Preferences UI)
  if (configPath) {
    const candidate = path.isAbsolute(configPath) ? configPath : path.join(userDataDir, configPath);

    // Validate and ensure directory exists
    const validated = await validateAndCreateDir(candidate, 'app-config.json dataDir');
    if (validated) {
      // If OT_DATA_DIR env var is set AND differs from config, warn (but still use config)
      if (envOverride) {
        const envCandidate = path.isAbsolute(envOverride)
          ? envOverride
          : path.join(userDataDir, envOverride);
        const normalizedEnv = path.normalize(envCandidate).toLowerCase();
        const normalizedConfig = path.normalize(validated).toLowerCase();
        if (normalizedEnv !== normalizedConfig) {
          // eslint-disable-next-line no-console
          console.warn(
            `[bootstrap] ⚠️  OT_DATA_DIR env var (${envCandidate}) ignored — appConfig.dataDir (${validated}) takes precedence. Unset OT_DATA_DIR or update Preferences if intended.`,
          );
        }
      }
      return { dir: validated, configChanged: false };
    }

    // RECOVERY: appConfig.dataDir failed validation. Fall back to default below.
    // eslint-disable-next-line no-console
    console.warn(
      `[bootstrap] ⚠️  RECOVERY: dataDir from config failed validation (${candidate}). Falling back to default. User data is safe.`,
    );
  }

  // Priority 2: OT_DATA_DIR env var (dev bootstrap escape hatch; only when appConfig.dataDir is unset or failed)
  if (envOverride) {
    const candidate = path.isAbsolute(envOverride)
      ? envOverride
      : path.join(userDataDir, envOverride);

    // Validate and ensure directory exists
    const validated = await validateAndCreateDir(candidate, 'OT_DATA_DIR env override');
    if (validated) return { dir: validated, configChanged: false };
  }

  // Priority 3: Default (<userData>/dev-events)
  const defaultPath = path.join(userDataDir, 'dev-events');
  const validated = await validateAndCreateDir(defaultPath, 'default dev-events');
  const recoveredPath = validated ?? defaultPath;

  // If we had a configured dataDir that failed, persist the recovery state
  if (configPath) {
    const newConfig: AppConfig = {
      ...appConfig,
      dataDir: recoveredPath,
      previousDataDir: configPath,
    };
    return { dir: recoveredPath, configChanged: true, newConfig };
  }

  // Normal default path (no recovery)
  return { dir: recoveredPath, configChanged: false };
}

/**
 * Validate a directory path and create it if it doesn't exist.
 * Returns the path if valid, null if validation/creation fails.
 */
async function validateAndCreateDir(dirPath: string, source: string): Promise<string | null> {
  // Reject obvious red flags
  if (!dirPath || dirPath.includes('\0')) {
    // eslint-disable-next-line no-console
    console.warn(`[bootstrap] Invalid dataDir from ${source}: empty or contains null bytes`);
    return null;
  }

  try {
    // Check if directory exists
    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      // eslint-disable-next-line no-console
      console.warn(`[bootstrap] dataDir from ${source} exists but is not a directory: ${dirPath}`);
      return null;
    }
    return dirPath;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // Directory doesn't exist — attempt to create it
      try {
        await fs.mkdir(dirPath, { recursive: true });
        // eslint-disable-next-line no-console
        console.log(`[bootstrap] Created dataDir from ${source}: ${dirPath}`);
        return dirPath;
      } catch (mkdirErr) {
        // eslint-disable-next-line no-console
        console.warn(
          `[bootstrap] Failed to create dataDir from ${source} (${dirPath}): ${mkdirErr}`,
        );
        return null;
      }
    }
    // Other stat errors (permission denied, etc.) — log and reject
    // eslint-disable-next-line no-console
    console.warn(`[bootstrap] Failed to access dataDir from ${source} (${dirPath}): ${err}`);
    return null;
  }
}

/**
 * Decide whether to emit the prototype-shaped dev-seed when the event log is
 * empty. Seeding is suppressed when:
 *   - NODE_ENV === 'production' (existing behaviour), OR
 *   - OT_SEED is set to 'none' / '0' / 'false' (case-insensitive).
 *
 * Any other value — including unset — keeps the original demo-seed behaviour
 * so nothing changes for the default `npm run dev` workflow.
 */
function shouldSeed(): boolean {
  if (process.env['NODE_ENV'] === 'production') return false;
  const flag = process.env['OT_SEED']?.trim().toLowerCase();
  if (flag === 'none' || flag === '0' || flag === 'false') return false;
  return true;
}

/**
 * One-shot bootstrap. Safe to call multiple times (second call is a no-op).
 *
 * Steps:
 *   1. Load profile.json from userData (P0-2). If missing, profile === null
 *      and the renderer's ProfileSetupModal will show.
 *   2. Load app-config.json from userData (P0-3). If missing, use defaults.
 *   3. Construct the JsonFileEventLog under the resolved dataDir.
 *   4. Load existing events from disk.
 *   5. If the log is empty AND NODE_ENV !== 'production', emit the dev-seed
 *      events through append() so the app has prototype-shaped data to show.
 *   6. Replay the final event list into the reducer singleton.
 */
export async function initializeApp(): Promise<void> {
  if (bootstrapped) return;

  const userDataDir = app.getPath('userData');

  // P0-2: Load profile before initializing event log. If missing, the app
  // continues with profile === null; the renderer will show ProfileSetupModal.
  profileInstance = await loadProfile(userDataDir);
  if (profileInstance) {
    // eslint-disable-next-line no-console
    console.log(
      `[bootstrap] loaded profile for ${profileInstance.name} (${profileInstance.userId})`,
    );
  } else {
    // eslint-disable-next-line no-console
    console.log('[bootstrap] no profile.json found — first-launch setup required');
  }

  // P0-3: Load app config (dataDir, readOnly). If missing, use defaults.
  appConfigInstance = await loadAppConfig(userDataDir);
  // eslint-disable-next-line no-console
  console.log(
    `[bootstrap] loaded app config (dataDir: ${appConfigInstance.dataDir ?? 'default'}, readOnly: ${appConfigInstance.readOnly})`,
  );

  // P1-1: Load per-laptop device ID from userData/device.json
  deviceIdInstance = await loadDeviceId(userDataDir);
  // eslint-disable-next-line no-console
  console.log(`[bootstrap] loaded device ID: ${deviceIdInstance}`);

  const { dir, configChanged, newConfig } = await resolveEventLogDir(
    userDataDir,
    appConfigInstance,
  );
  effectiveEventLogDir = dir;

  // If recovery fallback happened, persist the recovered state to disk
  if (configChanged && newConfig) {
    try {
      await saveAppConfig(userDataDir, newConfig);
      appConfigInstance = newConfig;
      // eslint-disable-next-line no-console
      console.log(
        `[bootstrap] ✅ Persisted recovery state (dataDir: ${newConfig.dataDir}, previousDataDir: ${newConfig.previousDataDir})`,
      );
    } catch (err) {
      // Log error but continue — app can still run with in-memory config
      // eslint-disable-next-line no-console
      console.error(`[bootstrap] ❌ Failed to persist recovery state: ${err}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[bootstrap] resolved event log directory: ${dir}`);

  // If recovery fallback happened, persist the recovered state to disk
  if (configChanged && newConfig) {
    try {
      await saveAppConfig(userDataDir, newConfig);
      appConfigInstance = newConfig;
      // eslint-disable-next-line no-console
      console.log(
        `[bootstrap] ✅ Persisted recovery state (dataDir: ${newConfig.dataDir}, previousDataDir: ${newConfig.previousDataDir})`,
      );
    } catch (err) {
      // Log error but continue — app can still run with in-memory config
      // eslint-disable-next-line no-console
      console.error(`[bootstrap] ❌ Failed to persist recovery state: ${err}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[bootstrap] resolved event log directory: ${dir}`);

  // P1-1: Load per-dataset ID from <dataDir>/dataset.json
  // Best-effort: stamp the writing app's version into freshly-created
  // dataset.json files. Never override an existing appVersion.
  let appVersionForStamp: string | undefined;
  try {
    appVersionForStamp = app.getVersion();
  } catch {
    appVersionForStamp = undefined;
  }
  datasetIdInstance = await loadDatasetId(
    dir,
    appVersionForStamp !== undefined ? { appVersion: appVersionForStamp } : {},
  );
  // eslint-disable-next-line no-console
  console.log(`[bootstrap] loaded dataset ID: ${datasetIdInstance}`);
  const innerLog = new JsonFileEventLog({ dir });

  // P1-3: Wrap in read-only proxy when appConfig.readOnly === true
  const log = appConfigInstance.readOnly ? createReadOnlyEventLog(innerLog) : innerLog;

  let events = await log.load();

  if (events.length === 0 && shouldSeed()) {
    const seedEvents = buildDevSeedEvents({
      datasetId: datasetIdInstance,
      actorDeviceId: deviceIdInstance,
      actorUserId: profileInstance?.userId ?? fakeUlid('USER01'),
    });
    for (const evt of seedEvents) {
      await log.append(evt);
    }
    events = await log.load();
    // eslint-disable-next-line no-console
    console.log(`[bootstrap] dev-seed wrote ${seedEvents.length} events to ${dir} (first run)`);
  } else if (events.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`[bootstrap] starting with empty event log at ${dir} (seed suppressed)`);
  }

  // Fold disk history into the in-memory read model. queries.ts reads from
  // the same singleton — no explicit wiring required.
  replayEvents(events as DomainEvent[]);

  eventLogInstance = log;
  bootstrapped = true;

  // eslint-disable-next-line no-console
  console.log(`[bootstrap] hydrated ${events.length} events from ${dir}`);
}
