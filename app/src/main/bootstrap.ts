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
import { JsonFileEventLog } from '../core/eventLog/index.js';
import type { EventLog, DomainEvent } from '../core/eventLog/index.js';
import { replayEvents, getReadModel } from '../core/query/reducers.js';
import type { ReadModel } from '../core/query/types.js';
import { buildDevSeedEvents } from './devSeed.js';
import { loadProfile, type Profile } from './profile.js';

let eventLogInstance: EventLog | null = null;
let profileInstance: Profile | null = null;
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
 * Resolve the event-log directory under Electron's userData path.
 *
 * The sub-directory name defaults to `dev-events` (the historical demo-seed
 * location), but can be overridden via the `OT_DATA_DIR` env var. This lets
 * contributors run the app against an isolated data folder (e.g. a personal
 * dogfood sandbox) without wiping the demo seed — and lets them switch back
 * and forth by only changing the launch command.
 *
 * The value is treated as a plain folder name, joined relative to the
 * Electron userData path. Absolute paths and path separators are rejected to
 * keep every dataset scoped under userData.
 *
 * NOTE: app.getPath('userData') must be called AFTER app.whenReady() resolves
 * — before that the path can change (Electron initializes it as part of the
 * bootstrap sequence). initializeApp() is therefore only safe to invoke inside
 * the whenReady() callback in main/index.ts.
 */
function resolveEventLogDir(): string {
  const override = process.env['OT_DATA_DIR']?.trim();
  const subdir =
    override && !/[\\/]/.test(override) && !path.isAbsolute(override) ? override : 'dev-events';
  return path.join(app.getPath('userData'), subdir);
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
 *   2. Construct the JsonFileEventLog under %APPDATA%/opentreasury/dev-events.
 *   3. Load existing events from disk.
 *   4. If the log is empty AND NODE_ENV !== 'production', emit the dev-seed
 *      events through append() so the app has prototype-shaped data to show.
 *   5. Replay the final event list into the reducer singleton.
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

  const dir = resolveEventLogDir();
  const log = new JsonFileEventLog({ dir });

  let events = await log.load();

  if (events.length === 0 && shouldSeed()) {
    const seedEvents = buildDevSeedEvents();
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
