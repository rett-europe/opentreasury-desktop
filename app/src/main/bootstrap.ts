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
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { JsonFileEventLog } from '../core/eventLog/index.js';
import type { EventLog, DomainEvent } from '../core/eventLog/index.js';
import { EncryptedMultiDeviceEventLog } from '../core/eventLog/EncryptedMultiDeviceEventLog.js';
import { replayEvents, getReadModel } from '../core/query/reducers.js';
import type { ReadModel } from '../core/query/types.js';
import { createRehydrateReadModelFromDisk, type RehydrateResult } from './query/rehydrate.js';
import { buildDevSeedEvents } from './devSeed.js';
import { loadProfile, type Profile } from './profile.js';
import { loadOrgProfile, createDefaultOrgProfile } from './orgProfile.js';
import type { OrgProfile } from '../shared/ipc-contracts/org-profile.js';
import { loadAppConfig, saveAppConfig, type AppConfig } from './config.js';
import { createReadOnlyEventLog } from './eventLog-readonly-wrapper.js';
import { loadDeviceId } from './device.js';
import { loadDatasetId } from './dataset.js';
import { newUlid } from './ids.js';
import { bootTrace } from './bootTrace.js';
import { FileAuditLog, createFsAuditStore } from '../core/audit/AuditLog.js';
import {
  runAnchorOnce,
  AnchorScheduler,
  type AnchorOutcome,
  type AnchorLogger,
} from './services/anchorService.js';
import {
  verifyOnUnlock,
  readStableDeviceFiles,
  type IntegrityLogger,
} from './services/auditVerifyOnUnlock.js';
import type { IntegrityVerdict } from '../shared/ipc-contracts/audit-integrity.js';
import {
  runTimestampOnce,
  TimestampScheduler,
  type TimestampOutcome,
  type TimestampLogger,
} from './services/timestampService.js';
import { Rfc3161HttpProvider, type TimestampProvider } from '../core/audit/timestamp/provider.js';
import { TimestampRetryState } from '../core/audit/timestamp/queue.js';
import { getActiveWorkspace, clearActiveWorkspace } from './workspace-session.js';

// Helper for dev-seed fallback when no profile exists yet
function fakeUlid(seedKey: string): string {
  const upper = seedKey.toUpperCase().replace(/[^0-9A-HJKMNP-TV-Z]/g, '0');
  return (upper + '0'.repeat(26)).slice(0, 26);
}

let eventLogInstance: EventLog | null = null;
let profileInstance: Profile | null = null;
let orgProfileInstance: OrgProfile = createDefaultOrgProfile();
let appConfigInstance: AppConfig | null = null;
let deviceIdInstance: string | null = null;
let datasetIdInstance: string | null = null;
let effectiveEventLogDir: string | null = null;
let bootstrapped = false;
let onboardingPending = false;
let encryptedWorkspacePending = false;
let bootstrapError: BootstrapError | null = null;

// SPEC-028 WI-2 — the anchor scheduler. Created lazily once the encrypted event
// log is installed; persists across lock/unlock (the event log instance is
// reused on re-unlock with the same device, and the scheduler resolves its
// audit/event-log/workspace dependencies lazily at run time).
let anchorScheduler: AnchorScheduler | null = null;

// SPEC-028 WI-5 — trusted-timestamping pipeline. The provider + retry state are
// process-global (no MK needed); the scheduler resolves its audit log lazily at
// run time (like the anchor scheduler), so it adapts across lock/unlock. The
// default provider is freeTSA.org RFC-3161 (OQ4 — see plan); it is swappable
// behind the `TimestampProvider` interface.
const DEFAULT_TSA_ID = 'freetsa';
const DEFAULT_TSA_URL = 'https://freetsa.org/tsr';
const DEFAULT_TSA_ROOT_IDS = ['freetsa-root-ca'] as const;

let timestampScheduler: TimestampScheduler | null = null;
let timestampProvider: TimestampProvider | null = null;
const timestampRetry = new TimestampRetryState();

/**
 * Boot error details surfaced when bootstrap/hydration fails fatally.
 */
export interface BootstrapError {
  code: string;
  message: string;
  filePath?: string;
  folderSchemaVersion?: number;
  appSchemaVersion?: number;
}

/**
 * True when bootstrap completed in "wizard-pending" mode — `appConfig.dataDir`
 * was null, so we deliberately skipped event-log construction and hydration.
 * IPC registration uses this to skip handlers that depend on the event log
 * (everything writing through `getEventLog()`); the renderer is gated on
 * `app:needsOnboarding` and only renders the onboarding wizard in this state.
 *
 * Once the user picks a folder via the wizard, `config:setDataDir` persists
 * the choice and relaunches the process — the next bootstrap finds a non-null
 * `dataDir` and `onboardingPending` returns false.
 */
export function isOnboardingPending(): boolean {
  return onboardingPending;
}

/**
 * Returns the bootstrap error if boot failed, null otherwise.
 */
export function getBootstrapError(): BootstrapError | null {
  return bootstrapError;
}

/**
 * Pure helper: should bootstrap defer event-log construction? Returns true
 * when no `dataDir` has been deliberately persisted (first-run state). Kept
 * separate from `initializeApp` so unit tests can exercise the predicate
 * without spinning up Electron.
 */
export function shouldDeferEventLog(appConfig: AppConfig): boolean {
  return appConfig.dataDir === null;
}

export function getEventLog(): EventLog {
  if (eventLogInstance === null) {
    let detail: string;
    if (onboardingPending) {
      detail =
        '[bootstrap] getEventLog() unavailable while onboarding wizard is pending — register data IPC handlers only after the user picks a folder';
    } else if (encryptedWorkspacePending) {
      detail =
        '[bootstrap] getEventLog() unavailable for an encrypted workspace before unlock — wait for workspace:unlock / confirmSetup / enroll / recover to install the encrypted event log';
    } else {
      detail = '[bootstrap] getEventLog() called before initializeApp() resolved';
    }
    throw new Error(detail);
  }
  return eventLogInstance;
}

/**
 * SPEC-026 — true when bootstrap detected an encrypted workspace (`events.key`
 * exists in dataDir) and deliberately deferred event-log construction until the
 * workspace is unlocked. Stays true until `installEncryptedEventLog()` runs.
 */
export function isEncryptedWorkspacePending(): boolean {
  return encryptedWorkspacePending;
}

export function getHydratedReadModel(): ReadModel {
  if (!bootstrapped) {
    throw new Error('[bootstrap] getHydratedReadModel() called before initializeApp() resolved');
  }
  return getReadModel();
}

/**
 * Re-read the on-disk event log and rebuild the in-memory read model. Used
 * by the `query:rehydrate` IPC handler so the renderer can pick up events
 * appended by another desktop instance against the same shared workspace
 * (see `query/rehydrate.ts` for the full rationale and concurrency notes).
 *
 * Returns a discriminated union so callers can surface a toast on failure
 * without throwing across the IPC boundary. Concurrent callers share a
 * single in-flight `eventLog.load()`; once that flight settles, the next
 * call starts a fresh one.
 *
 * Re-binds the rehydrate closure whenever the underlying event log instance
 * changes (e.g. after `installEncryptedEventLog`) so we always pull from the
 * currently installed log rather than a stale reference.
 */
let rehydrateForLog: EventLog | null = null;
let rehydrateImpl: (() => Promise<RehydrateResult>) | null = null;

export async function rehydrateFromDisk(): Promise<RehydrateResult> {
  if (eventLogInstance === null) {
    let detail: string;
    if (onboardingPending) {
      detail = 'event log unavailable — onboarding wizard is pending';
    } else if (encryptedWorkspacePending) {
      detail = 'event log unavailable — encrypted workspace is locked';
    } else {
      detail = 'event log unavailable — bootstrap has not completed';
    }
    return {
      ok: false,
      error: { code: 'no_event_log', message: detail },
    };
  }

  if (rehydrateImpl === null || rehydrateForLog !== eventLogInstance) {
    rehydrateForLog = eventLogInstance;
    rehydrateImpl = createRehydrateReadModelFromDisk({
      eventLog: eventLogInstance,
      replayEvents,
    });
  }

  return rehydrateImpl();
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
 * Get the loaded organisation profile (SPEC-030 WI-4). Always returns a value
 * (a default empty profile when org-profile.json is absent). Read by the
 * settings form and, later, the report builder via getOrgProfileViewModel.
 */
export function getOrgProfile(): OrgProfile {
  if (!bootstrapped) {
    throw new Error('[bootstrap] getOrgProfile() called before initializeApp() resolved');
  }
  return orgProfileInstance;
}

/** Update the in-memory org-profile cache after a save. */
export function setOrgProfile(profile: OrgProfile): void {
  orgProfileInstance = profile;
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
 * Null-tolerant variant for callers that legitimately run during the
 * onboarding-pending state (e.g., `config:setDataDir` validating its first
 * write). Returns null when the event log was deferred.
 */
export function getEffectiveEventLogDirOrNull(): string | null {
  return effectiveEventLogDir;
}

/**
 * Null-tolerant variant of `getDatasetId`. Returns null when bootstrap
 * deferred the event log (onboarding pending).
 */
export function getDatasetIdOrNull(): string | null {
  return datasetIdInstance;
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
 *   - isPackaged === true (packaged production builds), OR
 *   - NODE_ENV === 'production' (explicit production flag), OR
 *   - OT_SEED is set to 'none' / '0' / 'false' (case-insensitive).
 *
 * Any other value — including unset — keeps the original demo-seed behaviour
 * so nothing changes for the default `npm run dev` workflow.
 *
 * @param isPackaged - Typically from `app.isPackaged` in Electron main process.
 */
export function shouldSeed(isPackaged: boolean): boolean {
  if (isPackaged) return false;
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
 *
 * #242: If hydration fails (corrupt dataset.json, events.ndjson, schema
 * version mismatch), the error is caught and stored in `bootstrapError`.
 * The renderer queries `app:bootStatus` and shows BootErrorPage if needed.
 */
export async function initializeApp(): Promise<void> {
  if (bootstrapped) return;

  try {
    await initializeAppUnsafe();
  } catch (err) {
    // Catch fatal bootstrap errors and store them for the renderer.
    // eslint-disable-next-line no-console
    console.error('[bootstrap] Fatal error during bootstrap:', err);

    const message = err instanceof Error ? err.message : String(err);

    // Try to infer error code from the error message
    let code = 'HYDRATION_FAILED';
    if (message.includes('dataset.json') || message.includes('dataset metadata')) {
      code = 'DATASET_CORRUPT';
    } else if (message.includes('schema version')) {
      code = 'SCHEMA_TOO_NEW';
    }

    bootstrapError = {
      code,
      message,
      ...(effectiveEventLogDir ? { filePath: effectiveEventLogDir } : {}),
    };

    // Mark as bootstrapped so we don't retry
    bootstrapped = true;

    // Re-throw so main/index.ts knows bootstrap failed
    throw err;
  }
}

async function initializeAppUnsafe(): Promise<void> {
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

  // SPEC-030 WI-4: Load the (non-sensitive) org profile. Always resolves to a
  // value — a default empty profile when org-profile.json is absent.
  orgProfileInstance = await loadOrgProfile(userDataDir);

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

  // First-run gate (#196 / dev:empty regression): when no `dataDir` is
  // configured, defer event-log construction and hydration until the user
  // picks a folder via the onboarding wizard. Without this, bootstrap would
  // synthesize `<userData>/dev-events`, hydrate any leftover events from a
  // previous run, and write a fresh `dataset.json` BEFORE the renderer ever
  // gets to ask `app:needsOnboarding` — a dirty read model would be live
  // behind the wizard. Skipping the data path keeps the wizard authoritative.
  //
  // The renderer is already gated on `app:needsOnboarding` (App.tsx) and
  // refuses to mount the main UI in this state; IPC registration matches by
  // skipping every write/query handler that depends on `getEventLog()`.
  // After the wizard finishes, `config:setDataDir` persists the choice and
  // relaunches — next boot finds a non-null `dataDir` and proceeds normally.
  if (shouldDeferEventLog(appConfigInstance)) {
    onboardingPending = true;
    bootstrapped = true;
    // eslint-disable-next-line no-console
    console.log(
      '[bootstrap] no dataDir configured — onboarding wizard pending; event log + hydration deferred until the user picks a folder',
    );
    return;
  }

  const { dir, configChanged, newConfig } = await resolveEventLogDir(
    userDataDir,
    appConfigInstance,
  );
  effectiveEventLogDir = dir;
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

  // SPEC-026 — If this workspace is encrypted (events.key exists), defer
  // event-log construction until workspace:unlock / confirmSetup / enroll /
  // recover installs the encrypted log via installEncryptedEventLog(). The
  // plaintext JsonFileEventLog cannot read events-<deviceId>.ndjson files,
  // so building it here would hydrate 0 events and the renderer would see
  // an empty dashboard forever (the production bug fixed alongside this
  // change).
  let isEncryptedWorkspace = false;
  try {
    await fs.access(path.join(dir, 'events.key'));
    isEncryptedWorkspace = true;
  } catch {
    isEncryptedWorkspace = false;
  }

  if (isEncryptedWorkspace) {
    encryptedWorkspacePending = true;
    bootstrapped = true;
    // eslint-disable-next-line no-console
    console.log(
      `[bootstrap] encrypted workspace detected at ${dir} — event log construction deferred until unlock`,
    );
    return;
  }

  // SPEC-026 cleanup (.squad/decisions.md D3 / Pedro directive 2026-05-13):
  // when seeding is enabled AND the folder is genuinely empty, route the dev
  // seed through the production EncryptedMultiDeviceEventLog write path so
  // every dev launch exercises real crypto. The old behavior (plaintext
  // events.ndjson) re-poisoned empty workspaces and forced MigrationScreen on
  // every relaunch — that legacy state no longer exists; this is what
  // replaces it.
  let entriesAtDir: string[] = [];
  try {
    entriesAtDir = await fs.readdir(dir);
  } catch {
    /* folder may not exist yet — empty by definition for our purposes */
  }
  const DEVICE_FILE_RE = /^events-[0-9A-HJKMNP-TV-Z]{26}\.ndjson$/;
  const folderHasAnyEventArtifact =
    entriesAtDir.includes('events.ndjson') ||
    entriesAtDir.includes('events.key') ||
    entriesAtDir.some((f) => DEVICE_FILE_RE.test(f));

  if (!folderHasAnyEventArtifact && shouldSeed(app.isPackaged)) {
    // Dynamic import keeps the dev-seed module (and its DEV_RECOVERY_MNEMONIC)
    // out of the static import graph; the devKey.ts module also throws at
    // load if NODE_ENV === 'production' (defense in depth).
    const { seedEncryptedDevWorkspace } = await import('./devSeed/seedEncryptedWorkspace.js');
    const { safeStorage } = await import('electron');

    const seedEvents = buildDevSeedEvents({
      datasetId: datasetIdInstance,
      actorDeviceId: deviceIdInstance,
      actorUserId: profileInstance?.userId ?? fakeUlid('USER01'),
    });

    const safeStorageAvailable = (() => {
      try {
        return safeStorage.isEncryptionAvailable();
      } catch {
        return false;
      }
    })();

    const { mk, log: encryptedLog } = await seedEncryptedDevWorkspace(
      {
        dir,
        deviceId: deviceIdInstance,
        hostname: os.hostname(),
        safeStorageAvailable,
        safeStorageEncrypt: (plaintext: string) => safeStorage.encryptString(plaintext),
      },
      seedEvents,
    );

    const eventsAfterSeed = await encryptedLog.load();
    replayEvents(eventsAfterSeed as DomainEvent[]);

    eventLogInstance = encryptedLog;
    bootstrapped = true;
    encryptedWorkspacePending = false;

    // Wipe our copy of the MK — the log holds its own copy internally.
    mk.fill(0);

    // eslint-disable-next-line no-console
    console.log(
      `[bootstrap] dev-seed wrote ${seedEvents.length} encrypted events to ${dir} (first run)`,
    );
    return;
  }

  const innerLog = new JsonFileEventLog({ dir });

  // P1-3: Wrap in read-only proxy when appConfig.readOnly === true
  const log = appConfigInstance.readOnly ? createReadOnlyEventLog(innerLog) : innerLog;

  const events = await log.load();

  if (events.length === 0) {
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

/**
 * SPEC-026 — Construct the encrypted, per-device event log once the workspace
 * is unlocked (master key in hand) and hydrate the read model from it.
 *
 * Called by the workspace IPC handlers (confirmSetup / enroll / unlock /
 * recover) immediately after they set the active workspace session. After
 * this returns, `getEventLog()` returns the encrypted log instance and the
 * in-memory read model reflects every decrypted event from every
 * `events-<deviceId>.ndjson` in the workspace.
 *
 * Idempotent: if the encrypted log is already installed for this `deviceId`
 * and `dir`, returns immediately without re-loading.
 *
 * The `mk` argument is copied internally — the caller retains ownership of
 * the original buffer (including the right to wipe it).
 *
 * Returns the number of events hydrated (useful for logging / diagnostics).
 */
export async function installEncryptedEventLog(deviceId: string, mk: Uint8Array): Promise<number> {
  if (!bootstrapped) {
    throw new Error(
      '[bootstrap] installEncryptedEventLog() called before initializeApp() resolved',
    );
  }
  if (effectiveEventLogDir === null) {
    throw new Error(
      '[bootstrap] installEncryptedEventLog() called without an effective event log dir — onboarding not yet completed',
    );
  }

  const dir = effectiveEventLogDir;

  bootTrace('install:start', { deviceId });

  // SPEC-028 WI-3 — STANDALONE chain-verify-on-unlock (fail-closed). Runs BEFORE
  // hydrating the read model, installing the log, or anchoring (and before the
  // already-installed early-return below), so a tampered/broken workspace never
  // "opens." A fail-closed verdict throws `WorkspaceIntegrityError`; the unlock
  // handlers catch it, tear the workspace back down, and route to recovery.
  bootTrace('verify:start');
  const verdict = await verifyWorkspaceIntegrityOnUnlock(deviceId, mk);
  bootTrace('verify:end', { failClosed: verdict.failClosed });
  lastUnlockIntegrityVerdict = verdict;
  if (verdict.failClosed) {
    throw new WorkspaceIntegrityError(verdict);
  }

  const existing = eventLogInstance;
  if (existing instanceof EncryptedMultiDeviceEventLog && existing.owningDeviceId === deviceId) {
    // Already installed (e.g., re-unlock without an intervening lock). Skip
    // rehydration to avoid double-replaying events into the read model. The
    // active workspace was just (re)set by the caller, so still fire a
    // best-effort unlock anchor (SPEC-028 OQ2 "on unlock" trigger).
    fireUnlockAnchor();
    bootTrace('install:end', { alreadyInstalled: true });
    return 0;
  }

  // Own our own copy of the MK so the caller can wipe theirs without breaking
  // the log's future append/load operations.
  const mkCopy = new Uint8Array(mk);
  const log = new EncryptedMultiDeviceEventLog({
    dir,
    deviceId,
    masterKey: mkCopy,
    // SPEC-028 WI-2 — feed local-append deltas to the anchor scheduler. The
    // scheduler is created just below (after load); until then the optional
    // chain is a no-op. Counting only LOCAL appends is correct — peer events
    // arrive via sync, not through this log's append path.
    onLocalAppend: (delta: number) => {
      anchorScheduler?.onLocalAppend(delta);
    },
  });

  bootTrace('load:start');
  const events = await log.load();
  bootTrace('load:end', { count: events.length });
  bootTrace('replay:start', { count: events.length });
  replayEvents(events as DomainEvent[]);
  bootTrace('replay:end');

  eventLogInstance = log;
  encryptedWorkspacePending = false;

  // SPEC-028 WI-2 — create the anchor scheduler once. It resolves its audit
  // log, frontier source, and workspace lazily at run time, so it transparently
  // adapts across lock/unlock without needing to be torn down and rebuilt.
  if (anchorScheduler === null) {
    anchorScheduler = new AnchorScheduler({
      run: () => runAnchorForActiveWorkspace(),
    });
  }

  // SPEC-028 WI-5 — create the timestamp provider + scheduler once. Like the
  // anchor scheduler they persist across lock/unlock and resolve the audit log
  // lazily at run time.
  if (timestampProvider === null) {
    timestampProvider = new Rfc3161HttpProvider({
      id: DEFAULT_TSA_ID,
      url: DEFAULT_TSA_URL,
      trustRootIds: DEFAULT_TSA_ROOT_IDS,
    });
  }
  if (timestampScheduler === null) {
    timestampScheduler = new TimestampScheduler({
      run: () => runTimestampForActiveWorkspace(),
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    `[bootstrap] installed encrypted event log for device ${deviceId} — hydrated ${events.length} events from ${dir}`,
  );

  // SPEC-026 — Data IPC handlers were deferred at startup because the
  // workspace was locked. Register them now so the renderer's queries after
  // unlock find live IPC channels. Dynamic import avoids the circular
  // dependency between bootstrap.ts and ipc/handlers.ts.
  try {
    const { registerDataIpcHandlersIfDeferred } = await import('./ipc/handlers.js');
    bootTrace('register:start');
    registerDataIpcHandlersIfDeferred();
    bootTrace('register:end');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[bootstrap] failed to register deferred data IPC handlers: ${(err as Error).message}`,
    );
  }

  // SPEC-028 WI-2 — fire a best-effort "on unlock" anchor now that the read
  // model is hydrated. Fire-and-forget: never block install on anchoring.
  fireUnlockAnchor();

  bootTrace('install:end', { count: events.length });
  return events.length;
}

/**
 * SPEC-028 WI-2 — structured logger for the anchor pipeline. Anchor metadata is
 * ULIDs/hashes/counts only (no raw values), so it is safe to log.
 */
const anchorLog: AnchorLogger = (level, message, meta) => {
  const suffix = meta === undefined ? '' : ` ${JSON.stringify(meta)}`;
  // eslint-disable-next-line no-console
  console[level === 'warn' ? 'warn' : 'log'](`[anchor] ${message}${suffix}`);
};

// ── SPEC-028 WI-3 — chain-verify-on-unlock (fail-closed) ────────────────────

/** ULIDs/hashes/counts only — safe to log (R15). */
const integrityLog: IntegrityLogger = (level, message, meta) => {
  const suffix = meta === undefined ? '' : ` ${JSON.stringify(meta)}`;
  // eslint-disable-next-line no-console
  console[level === 'warn' ? 'warn' : 'log'](`[integrity] ${message}${suffix}`);
};

/**
 * Thrown by `installEncryptedEventLog` when verify-on-unlock fails closed. The
 * unlock IPC handlers catch it, call `lockWorkspaceAfterIntegrityFailure()`, and
 * surface the carried verdict to the renderer (UX `AUD-0.integrity-error`).
 */
export class WorkspaceIntegrityError extends Error {
  readonly verdict: IntegrityVerdict;
  constructor(verdict: IntegrityVerdict) {
    super(`workspace integrity verification failed: ${verdict.status}`);
    this.name = 'WorkspaceIntegrityError';
    this.verdict = verdict;
  }
}

/** The verdict from the most recent unlock verify (for the Audit viewer OK path). */
let lastUnlockIntegrityVerdict: IntegrityVerdict | null = null;

export function getLastUnlockIntegrityVerdict(): IntegrityVerdict | null {
  return lastUnlockIntegrityVerdict;
}

/**
 * Run the standalone verify-on-unlock check for the active workspace. Builds a
 * READ-ONLY `FileAuditLog` against the same `<folderPath>/.treasury/audit` path
 * exports/anchors use, and recomputes the latest anchor against the on-disk
 * event files in `effectiveEventLogDir`. The audit log gets its OWN master-key
 * copy (wiped when done) so a concurrent lock wiping the session MK cannot race
 * the verify. Returns a redacted verdict; never throws (the service maps any
 * error to a fail-closed verdict).
 */
async function verifyWorkspaceIntegrityOnUnlock(
  deviceId: string,
  mk: Uint8Array,
): Promise<IntegrityVerdict> {
  const ws = getActiveWorkspace();
  // Without an active workspace or dataset id we cannot locate the audit chain.
  // This should not happen on the unlock paths (they set the workspace first);
  // treat it as "nothing to verify yet" rather than fail-closing a setup race.
  if (ws === null || datasetIdInstance === null || effectiveEventLogDir === null) {
    return {
      status: 'no-audit-chain',
      failClosed: false,
      category: 'ok',
      recovery: 'none',
      devices: [],
      summary: { anchoredDeviceCount: 0, notYetAnchoredTotal: 0, newDeviceCount: 0 },
    };
  }

  const eventDir = effectiveEventLogDir;
  const actor = profileInstance?.userId ?? deviceId;
  const auditDir = path.resolve(ws.folderPath, '.treasury', 'audit');
  const auditMk = new Uint8Array(mk);
  const auditLog = new FileAuditLog({
    store: createFsAuditStore(auditDir),
    mk: auditMk,
    datasetId: datasetIdInstance,
    deviceId,
    actorUserIdentity: actor,
    now: () => new Date(),
    lockKey: auditDir,
  });
  try {
    return await verifyOnUnlock({
      auditLog,
      readDeviceFiles: () => readStableDeviceFiles(eventDir),
      log: integrityLog,
    });
  } finally {
    auditMk.fill(0);
  }
}

/**
 * SPEC-028 WI-3 — genuinely tear the workspace back down after a fail-closed
 * integrity verdict so it is NOT left readable in memory (important on the
 * re-unlock path where `eventLogInstance` + the hydrated read model already
 * exist). Resets the event-log instance, clears the read model, disposes the
 * anchor scheduler, re-marks the encrypted workspace pending, and wipes the
 * session master key. After this, `getEventLog()` throws and data IPC is blocked
 * until a clean unlock re-installs the log.
 */
export function lockWorkspaceAfterIntegrityFailure(): void {
  // Dispose the captured log instance FIRST: it owns its own MK copy (see the
  // `mkCopy` at install), so wiping the session key via clearActiveWorkspace()
  // below does NOT neutralise it. Any already-registered data IPC handler still
  // holds this reference; dispose() zeroes its MK and makes every op throw, so a
  // tampered workspace cannot keep being read/written through the stale instance.
  if (eventLogInstance instanceof EncryptedMultiDeviceEventLog) {
    eventLogInstance.dispose();
  }
  eventLogInstance = null;
  rehydrateForLog = null;
  rehydrateImpl = null;
  replayEvents([]);
  encryptedWorkspacePending = true;
  if (anchorScheduler !== null) {
    anchorScheduler.dispose();
    anchorScheduler = null;
  }
  clearActiveWorkspace();
}

/**
 * SPEC-028 WI-2 — resolve the current audit log + frontier source from the
 * active workspace and run a single best-effort anchor. Returns a typed
 * `skipped` outcome (never throws) when the workspace is locked or the event
 * log is unavailable. The audit log is built fresh per run against the SAME
 * `<folderPath>/.treasury/audit` path that exports use, so anchors and exports
 * share one signed, hash-chained file.
 */
async function runAnchorForActiveWorkspace(): Promise<AnchorOutcome> {
  const ws = getActiveWorkspace();
  if (ws === null) {
    return { status: 'skipped', reason: 'no-active-workspace' };
  }
  const log = eventLogInstance;
  if (!(log instanceof EncryptedMultiDeviceEventLog)) {
    return { status: 'skipped', reason: 'no-frontier-source' };
  }
  if (datasetIdInstance === null) {
    return { status: 'skipped', reason: 'no-dataset-id' };
  }
  const actor = profileInstance?.userId ?? ws.deviceId;
  // Defensive MK copy (rubber-duck): a concurrent `workspace:lock` wipes
  // `ws.mk` in place. If an in-flight anchor still referenced that buffer when
  // it was zeroed, it could seal/persist the audit chunk under a zeroed key and
  // corrupt the log. The lock-time anchor (anchorNowBeforeLock) races a timeout,
  // so this overlap is real. Give the audit log its OWN key copy and wipe it
  // once the run resolves; the session buffer can be wiped independently.
  const auditMk = new Uint8Array(ws.mk);
  const auditDir = path.resolve(ws.folderPath, '.treasury', 'audit');
  const auditLog = new FileAuditLog({
    store: createFsAuditStore(auditDir),
    mk: auditMk,
    datasetId: datasetIdInstance,
    deviceId: ws.deviceId,
    actorUserIdentity: actor,
    now: () => new Date(),
    lockKey: auditDir,
  });
  try {
    const outcome = await runAnchorOnce({
      auditLog,
      eventLog: log,
      newUlid,
      now: () => new Date(),
      log: anchorLog,
    });
    // SPEC-028 WI-5 — a fresh anchor needs an external timestamp. Schedule a
    // best-effort drain (off the write path; never awaited here).
    if (outcome.status === 'anchored') timestampScheduler?.onNewAnchor();
    return outcome;
  } finally {
    auditMk.fill(0);
  }
}

/**
 * SPEC-028 WI-5 — structured logger for the timestamp pipeline. Carries only
 * ULIDs/hashes/serials/counts (no raw values), so it is safe to log.
 */
const timestampLog: TimestampLogger = (level, message, meta) => {
  const suffix = meta === undefined ? '' : ` ${JSON.stringify(meta)}`;
  // eslint-disable-next-line no-console
  console[level === 'warn' ? 'warn' : 'log'](`[timestamp] ${message}${suffix}`);
};

/**
 * SPEC-028 WI-5 — resolve the current audit log from the active workspace and
 * run a single best-effort timestamp drain. Returns a typed `idle` outcome
 * (never throws) when the workspace is locked, the provider is unavailable, or
 * nothing is pending. Builds the audit log fresh per run against the SAME
 * `<folderPath>/.treasury/audit` path that anchors + exports use.
 */
async function runTimestampForActiveWorkspace(): Promise<TimestampOutcome> {
  const provider = timestampProvider;
  if (provider === null) return { status: 'idle', reason: 'no-provider' };
  const ws = getActiveWorkspace();
  if (ws === null) return { status: 'idle', reason: 'no-active-workspace' };
  if (datasetIdInstance === null) return { status: 'idle', reason: 'no-dataset-id' };

  const actor = profileInstance?.userId ?? ws.deviceId;
  // Defensive MK copy (same rationale as the anchor path): a concurrent lock
  // wipes `ws.mk` in place; give the audit log its own key and wipe it after.
  const auditMk = new Uint8Array(ws.mk);
  const auditDir = path.resolve(ws.folderPath, '.treasury', 'audit');
  const auditLog = new FileAuditLog({
    store: createFsAuditStore(auditDir),
    mk: auditMk,
    datasetId: datasetIdInstance,
    deviceId: ws.deviceId,
    actorUserIdentity: actor,
    now: () => new Date(),
    lockKey: auditDir,
  });
  try {
    return await runTimestampOnce({
      auditLog,
      provider,
      newUlid,
      now: () => new Date(),
      randomNonce: () => randomBytes(16),
      retry: timestampRetry,
      log: timestampLog,
    });
  } finally {
    auditMk.fill(0);
  }
}

/**
 * SPEC-028 WI-2 — fire a best-effort unlock anchor without awaiting it. Never
 * throws (the scheduler/run path swallows all errors). Also kicks a timestamp
 * drain so anchors left un-timestamped in a previous session (e.g. offline TSA)
 * are picked up on unlock.
 *
 * #379: the timestamp drain runs AFTER the anchor resolves (still non-blocking,
 * never throwing). The anchor write path creates and persists the audit signing
 * key on a fresh chain; running the drain concurrently let its preflight race
 * the anchor and (historically, via key-creating preflights) persist a divergent
 * key. Serializing guarantees the anchor's persisted key + entry are on disk
 * before the timestamp path reads them.
 */
function fireUnlockAnchor(): void {
  void sequenceUnlockSideEffects(
    anchorScheduler === null ? undefined : () => anchorScheduler!.anchorNow(),
    timestampScheduler === null ? undefined : () => timestampScheduler!.drainNow(),
  );
}

/**
 * #379 — order the two unlock side-effects so the timestamp drain runs strictly
 * AFTER the anchor settles. Best-effort: never throws, and a rejected/failed
 * anchor still triggers the drain. Extracted (and exported) so the ordering
 * contract is unit-testable without bootstrapping the whole main process.
 */
export function sequenceUnlockSideEffects(
  anchorNow: (() => Promise<unknown>) | undefined,
  drainNow: (() => Promise<unknown>) | undefined,
): Promise<void> {
  const anchor = anchorNow === undefined ? Promise.resolve() : anchorNow();
  return Promise.resolve(anchor)
    .catch(() => undefined)
    .then(() => {
      if (drainNow === undefined) return;
      void Promise.resolve(drainNow()).catch(() => undefined);
    });
}

/**
 * SPEC-028 WI-5 — accessor for the timestamp scheduler (null until the encrypted
 * event log is installed). Exposed for diagnostics/tests.
 */
export function getTimestampScheduler(): TimestampScheduler | null {
  return timestampScheduler;
}

/**
 * SPEC-028 WI-2 — accessor for the anchor scheduler (null until the encrypted
 * event log is installed). Exposed for diagnostics/tests.
 */
export function getAnchorScheduler(): AnchorScheduler | null {
  return anchorScheduler;
}

/**
 * SPEC-028 WI-2 — run a BOUNDED, best-effort anchor before the workspace locks
 * and the master key is wiped. Awaited by `workspace:lock`. Resolves on timeout
 * or error so locking is never blocked by anchoring.
 */
export async function anchorNowBeforeLock(timeoutMs = 5000): Promise<void> {
  const sched = anchorScheduler;
  if (sched === null) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  try {
    await Promise.race([sched.anchorNow().then(() => undefined), timeout]);
  } catch {
    // anchorNow never rejects, but be defensive — never block the lock.
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
