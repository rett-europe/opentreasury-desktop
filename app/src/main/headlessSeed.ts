// SPEC-026 Option B — headless seed entry for the e2e perf gate.
//
// The renderer's workspace:detect step routes a folder containing only legacy
// plaintext `events.ndjson` to <FreshSetupFlow>, which means the old plaintext
// perf seeder (scripts/perf-seed.mjs) can no longer satisfy the perf test's
// wait for `.ot-shell__sidebar`. To fix it without re-introducing legacy
// formats, the perf seeder spawns Electron with `OT_HEADLESS_SEED=1`; this
// module runs inside that spawned process, generates a real encrypted
// workspace through the same `seedEncryptedDevWorkspace` write path used by
// `npm run dev`, then exits. The next launch (the actual perf measurement)
// silent-unlocks via safeStorage and lands in AppShell.
//
// DEV/test-only. Guarded against `app.isPackaged === true` so a packaged build
// can never enter this path even if the env var is set.

import { app, safeStorage } from 'electron';
import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { buildPerfSeedEvents } from './devSeed.js';
import { seedEncryptedDevWorkspace } from './devSeed/seedEncryptedWorkspace.js';
import { loadDeviceId } from './device.js';
import { loadDatasetId } from './dataset.js';

const DEFAULT_TX_COUNT = 5000;

/**
 * True when OT_HEADLESS_SEED is set in the environment. Cheap pre-check used
 * by main/index.ts to avoid importing this module on every launch.
 */
export function isHeadlessSeedRequested(): boolean {
  return process.env['OT_HEADLESS_SEED'] === '1';
}

interface RunHeadlessSeedOptions {
  /**
   * Override for `app.isPackaged`. Tests pass `false` explicitly; production
   * calls pass `undefined` so the live electron value is used.
   */
  isPackaged?: boolean;
}

/**
 * Run the headless seeder. Awaits `app.whenReady()` (safeStorage requires it),
 * generates an encrypted workspace under `<userData>/<OT_DATA_DIR>`, then
 * quits the app. On any failure logs to stderr and exits with a non-zero
 * code so the parent perf-seed script can surface the error in CI logs.
 */
export async function runHeadlessSeed(opts: RunHeadlessSeedOptions = {}): Promise<void> {
  const packaged = opts.isPackaged ?? app.isPackaged;
  if (packaged) {
    // Defense in depth — devKey.ts also throws under NODE_ENV=production, but
    // a packaged build with NODE_ENV unset would still bypass that guard.
    // eslint-disable-next-line no-console
    console.error('[headlessSeed] refusing to run inside a packaged build');
    process.exit(2);
    return;
  }

  const dataDirName = process.env['OT_DATA_DIR']?.trim();
  if (!dataDirName) {
    // eslint-disable-next-line no-console
    console.error('[headlessSeed] OT_DATA_DIR must be set');
    process.exit(2);
    return;
  }

  const txCount = Number.parseInt(
    process.env['OT_HEADLESS_SEED_TX_COUNT'] ?? String(DEFAULT_TX_COUNT),
    10,
  );
  if (!Number.isFinite(txCount) || txCount <= 0) {
    // eslint-disable-next-line no-console
    console.error(`[headlessSeed] invalid OT_HEADLESS_SEED_TX_COUNT=${String(txCount)}`);
    process.exit(2);
    return;
  }

  // safeStorage availability is only meaningful after whenReady().
  await app.whenReady();

  const userDataDir = app.getPath('userData');
  // Plain sub-folder under userData — matches the contract resolveEventLogDir
  // applies to non-absolute OT_DATA_DIR values.
  const dir = path.isAbsolute(dataDirName) ? dataDirName : path.join(userDataDir, dataDirName);
  await fs.mkdir(dir, { recursive: true });

  // eslint-disable-next-line no-console
  console.log(`[headlessSeed] target dir: ${dir}`);

  const deviceId = await loadDeviceId(userDataDir);
  const datasetId = await loadDatasetId(dir);

  // Diagnostic: surface the active password-store backend so CI failures
  // make it obvious whether the --password-store=basic switch landed.
  const activeStore = app.commandLine.getSwitchValue('password-store') || '<unset>';
  // eslint-disable-next-line no-console
  console.log(`[headlessSeed] password-store switch: ${activeStore}`);

  // When --password-store=basic (CI), Electron treats safeStorage as
  // "plaintext, not really encrypted" and isEncryptionAvailable() returns
  // false by design. Opt into that for headless seed runs so we can still
  // produce a workspace that silent-unlocks on the next launch (which will
  // also opt in via the same env var). This is dev/test only — guarded by
  // app.isPackaged refusal at the top of this function.
  if (activeStore === 'basic' && typeof safeStorage.setUsePlainTextEncryption === 'function') {
    safeStorage.setUsePlainTextEncryption(true);
    // eslint-disable-next-line no-console
    console.log('[headlessSeed] safeStorage.setUsePlainTextEncryption(true) — CI/basic backend');
  }

  const safeStorageAvailable = (() => {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  })();

  if (!safeStorageAvailable) {
    // The renderer's silent-unlock path requires wrap_safestorage to be
    // decryptable by safeStorage on the same machine. If the host can't
    // provide a keyring (e.g. headless Linux without gnome-keyring), the
    // perf test would land on the unlock screen instead of AppShell and
    // time out. Fail loudly so CI surfaces the misconfiguration instead of
    // silently producing a non-bootable workspace.
    // eslint-disable-next-line no-console
    console.error(
      '[headlessSeed] safeStorage.isEncryptionAvailable() returned false — ' +
        'cannot produce a silent-unlockable workspace. Set OT_PASSWORD_STORE=basic ' +
        'to force Electron to use its built-in fallback cipher on headless Linux CI.',
    );
    process.exit(3);
    // Defensive: the bundler can fold `if (cond) { ...; process.exit(3); }`
    // into a comma expression where downstream statements still evaluate.
    // `return` here is unreachable at the type level (process.exit: never)
    // but survives minification.
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`[headlessSeed] building ${txCount} tx + reference-data events`);
  const events = buildPerfSeedEvents({
    datasetId,
    actorDeviceId: deviceId,
    // No profile is available in headless mode; use a deterministic synthetic
    // userId so events still satisfy the WI-23 envelope. The renderer's
    // ProfileSetupModal is suppressed by the profile.json the parent script
    // writes alongside the seed.
    actorUserId: '01PERFUSER01XXXXXXXXXXXXXX',
    txCount,
  });

  const { mk } = await seedEncryptedDevWorkspace(
    {
      dir,
      deviceId,
      hostname: os.hostname(),
      safeStorageAvailable: true,
      safeStorageEncrypt: (plaintext: string) => safeStorage.encryptString(plaintext),
    },
    events,
  );
  // Wipe our copy of the MK; the log keeps its own.
  mk.fill(0);

  // Verify the encrypted artifacts ended up on disk before exiting — gives
  // CI a clear failure point if seedEncryptedDevWorkspace silently no-ops.
  const entries = await fs.readdir(dir);
  const hasKey = entries.includes('events.key');
  const hasDeviceLog = entries.some((f) => f.startsWith('events-') && f.endsWith('.ndjson'));
  if (!hasKey || !hasDeviceLog) {
    // eslint-disable-next-line no-console
    console.error(
      `[headlessSeed] post-seed verification failed (events.key=${hasKey}, devLog=${hasDeviceLog})`,
    );
    process.exit(4);
    return;
  }

  // eslint-disable-next-line no-console
  console.log(
    `[headlessSeed] OK — wrote ${events.length} encrypted events to ${dir} (deviceId=${deviceId})`,
  );

  app.quit();
  // app.quit() is async; force exit so we don't linger on stuck listeners.
  // The encrypted log has already flushed via append → fsync inside
  // EncryptedMultiDeviceEventLog, so this is safe.
  process.exit(0);
}
