import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Perf-budget threshold in milliseconds (median across RUNS launches).
 * Set to 1500 ms for the initial landing to give real CI data before
 * tightening.  Tune to `observed_median × 1.5` after one week of main data. */
const BUDGET_MS = 1500;

/** Number of independent Electron launches to use for the median.
 * Must be ODD so that `times[Math.floor(times.length / 2)]` is the true middle value. */
const RUNS = 3;

/** Plain sub-folder name (under the isolated userData dir) holding the seeded
 * encrypted workspace. Passed to OT_DATA_DIR; must be non-path, non-absolute. */
const DATA_DIR = 'perf-events';

/** Transactions to seed. 5 000 is the documented perf-gate dataset size. */
const SEED_TX_COUNT = 5000;

/**
 * Setup wait for the AppShell sidebar to paint after silent-unlock. This is a
 * cold-boot wait, NOT the perf budget (which is measured separately below).
 * Once the workspace is hermetically isolated (see beforeAll) the boot is fast
 * and deterministic, so 60 s is generous headroom for a slow CI runner while
 * still surfacing a true deadlock long before the 240 s global test timeout.
 * (Was 120 s — an ineffective crutch from PR #378 that masked the real
 * shared-userData contention this spec now eliminates.)
 */
const SIDEBAR_TIMEOUT_MS = 60_000;

/**
 * On headless CI there is no OS keyring, so safeStorage must use Electron's
 * `basic` fallback cipher (opt-in via --password-store=basic). Locally we use
 * the real per-user backend (DPAPI/Keychain), which silent-unlocks for free.
 */
const PASSWORD_STORE = process.env['OT_PASSWORD_STORE'] ?? (process.env['CI'] ? 'basic' : '');

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const TEST_RESULTS_DIR = join(REPO_ROOT, 'test-results');

/**
 * profile.json suppresses the ProfileSetupModal so the measurement launch lands
 * directly in AppShell once the isolated workspace silent-unlocks.
 */
const PROFILE = {
  userId: '01PERFUSER01XXXXXXXXXXXXXX',
  name: 'Perf Tester',
  role: 'Treasurer',
  ngoName: 'OpenTreasury Perf',
  identitySource: 'local' as const,
  createdAt: '2024-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/**
 * Movements nav button — 2nd item in the primary nav section.
 * Anchored to `nav[aria-label="Primary"]` (AppShell.tsx L182) for robustness
 * against sidebar restructuring; position-based within the section to stay
 * stable across i18n locales:
 *   Section 0 (shell.sections.main): panel | movements | balance
 */
const MOVEMENTS_NAV_BTN =
  'nav[aria-label="Primary"] > div:first-child > ul > li:nth-child(2) > button';

/**
 * First visible data row in the table.
 * The virtualised Table component renders padding rows with aria-hidden="true";
 * actual data rows do not carry that attribute.
 */
const FIRST_DATA_ROW = 'table.ot-table tbody tr:not([aria-hidden="true"])';

// ---------------------------------------------------------------------------
// Hermetic-isolation helpers (mirror tests/e2e/movements-filter-snapshots.spec.ts)
// ---------------------------------------------------------------------------

/** Launch args for both the headless seed and the measurement launches. */
function launchArgs(userDataDir: string): string[] {
  const args = ['.', `--user-data-dir=${userDataDir}`];
  if (PASSWORD_STORE) args.unshift(`--password-store=${PASSWORD_STORE}`);
  return args;
}

/**
 * One Electron launch: generate a real *encrypted* 5 000-tx workspace under
 * `<userDataDir>/<DATA_DIR>` and exit. Mirrors the headless-seed path that
 * scripts/perf-seed.mjs uses, but pinned to an isolated userData dir so the
 * shared default `~/.config/opentreasury-desktop` is never read or written.
 *
 * NOTE on the perf gate's historic ~50% CI hang — the real, boot-trace-proven
 * root cause is NOT shared-userData contention (isolation alone did not fix it).
 * The app appends a device *anchor* to the workspace audit chain on every
 * unlock (bootstrap.ts `fireUnlockAnchor`, fired unconditionally — read-only
 * mode does not gate it). On CI's flaky safeStorage backend that anchor is
 * sometimes signed with a key whose fingerprint does not match the persisted
 * audit signing key. The FIRST unlock of a freshly-seeded workspace always
 * paints the shell (verify-on-unlock runs before the anchor is written); a
 * SECOND unlock of the SAME workspace then re-runs verify-on-unlock against the
 * now-mutated chain, hits the key-fingerprint mismatch, fails closed, and routes
 * to the manual recovery-code prompt — so the shell never paints and the
 * sidebar wait times out. Reusing one seeded workspace across the median's
 * launches made the samples causally dependent; seeding a PRISTINE workspace
 * per run (see createSeededWorkspace) restores independence so every launch is
 * a reliable "first unlock." See docs/perf/playwright-gate.md.
 */
function seedEncryptedWorkspace(userDataDir: string): void {
  const electronBin = require('electron') as unknown as string;
  if (typeof electronBin !== 'string') {
    throw new Error('could not resolve the Electron binary path');
  }
  const args = launchArgs(userDataDir);
  // Raw spawnSync of Electron on GitHub's Ubuntu runners needs --no-sandbox
  // (the SUID chrome-sandbox helper isn't configured). Safe: this process
  // renders nothing — it only writes encrypted seed files and exits. Honors
  // OT_PERF_SEED_NO_SANDBOX=0 to opt out for local debugging.
  if (process.env['OT_PERF_SEED_NO_SANDBOX'] !== '0') {
    args.unshift('--no-sandbox');
  }
  const result = spawnSync(electronBin, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      OT_HEADLESS_SEED: '1',
      OT_HEADLESS_SEED_TX_COUNT: String(SEED_TX_COUNT),
      OT_DATA_DIR: DATA_DIR,
      OT_SEED: 'none',
      OT_PASSWORD_STORE: PASSWORD_STORE,
    },
  });
  if (result.status !== 0) {
    throw new Error(
      `headless seed exited with status=${String(result.status)} signal=${String(result.signal)}`,
    );
  }
  const dir = join(userDataDir, DATA_DIR);
  const entries = readdirSync(dir);
  const ok =
    entries.includes('events.key') &&
    entries.some((f) => /^events-[0-9A-HJKMNP-TV-Z]{26}\.ndjson$/.test(f));
  if (!ok) {
    throw new Error(`encrypted workspace not produced at ${dir} (entries: ${entries.join(', ')})`);
  }
  // device.json must live in the isolated userData so the measurement launch
  // resolves the SAME deviceId the seed wrapped the MK for (silent unlock).
  if (!readdirSync(userDataDir).includes('device.json')) {
    throw new Error(`device.json missing from isolated userData ${userDataDir}`);
  }
}

/**
 * Create a brand-new isolated userData dir, seed a PRISTINE 5 000-tx encrypted
 * workspace into it, and write the profile + app-config so a measurement launch
 * silent-unlocks straight into AppShell. Returns the new userData dir.
 *
 * Called once PER measurement run (not once for the suite) so each launch
 * unlocks a workspace with NO pre-existing audit anchor — the only state that
 * the boot-trace proved causes the second-unlock verify-on-unlock fail-closed
 * hang. The samples therefore stay causally independent.
 *
 * The isolated root lives under `os.homedir()` (NOT os.tmpdir()): the
 * production workspace path guard (validateFolderBoundary in
 * ipc/handlers/workspace.ts) rejects any dataDir outside the home directory, so
 * a /tmp userData would fail workspace:detect and hang the silent unlock. On CI
 * home is /home/runner; locally it's the user profile.
 */
function createSeededWorkspace(): string {
  const userDataDir = mkdtempSync(join(homedir(), '.ot-perf-'));
  writeFileSync(join(userDataDir, 'profile.json'), JSON.stringify(PROFILE, null, 2), 'utf8');
  seedEncryptedWorkspace(userDataDir);
  // app-config.json points the measurement launch at the freshly seeded
  // encrypted workspace so workspace:detect silent-unlocks it instead of routing
  // to the FreshSetupFlow folder picker. dataDir is absolute and under home.
  const appConfig = { version: 1, dataDir: join(userDataDir, DATA_DIR), readOnly: false };
  writeFileSync(join(userDataDir, 'app-config.json'), JSON.stringify(appConfig, null, 2), 'utf8');
  return userDataDir;
}

/**
 * Best-effort diagnostics when the sidebar never paints. Captures a screenshot,
 * a DOM/bridge probe, and a ping probe into test-results/ so a CI failure
 * finally shows the true stuck state (vs. a blind timeout). Never throws —
 * diagnostics must not mask the original TimeoutError.
 */
async function captureBootFailure(page: Page, run: number): Promise<void> {
  const tag = `run${run + 1}`;
  try {
    await page.screenshot({ path: join(TEST_RESULTS_DIR, `perf-stuck-${tag}.png`) });
  } catch {
    /* window may already be gone */
  }
  try {
    const probe = await page.evaluate(() => ({
      href: location.href,
      readyState: document.readyState,
      bodyText: document.body?.innerText?.slice(0, 500) ?? '',
      hasBridge: !!(window as unknown as { opentreasury?: unknown }).opentreasury,
    }));
    // eslint-disable-next-line no-console
    console.log(`[perf][stuck ${tag}] dom=${JSON.stringify(probe)}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(`[perf][stuck ${tag}] dom probe failed: ${String(err)}`);
  }
  try {
    const ping = await page.evaluate(async () => {
      const bridge = (window as unknown as { opentreasury?: { ping?: () => Promise<unknown> } })
        .opentreasury;
      if (!bridge?.ping) return 'no-bridge';
      return await Promise.race([
        bridge.ping(),
        new Promise((r) => setTimeout(() => r('ping-timeout'), 5_000)),
      ]);
    });
    // eslint-disable-next-line no-console
    console.log(`[perf][stuck ${tag}] ping=${JSON.stringify(ping)}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(`[perf][stuck ${tag}] ping probe failed: ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('MovementsScreen mount perf budget', () => {
  test.describe.configure({ mode: 'serial' });

  /** Per-run isolated userData dirs, tracked so afterAll cleans up any that a
   *  mid-loop failure left behind (the loop's `finally` removes them on the
   *  happy path). */
  const createdDirs = new Set<string>();

  test.beforeAll(() => {
    mkdirSync(TEST_RESULTS_DIR, { recursive: true });
  });

  test.afterAll(() => {
    for (const dir of createdDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    createdDirs.clear();
  });

  test(`MovementsScreen mounts in ≤ ${BUDGET_MS} ms (median of ${RUNS} runs)`, async () => {
    const times: number[] = [];

    for (let run = 0; run < RUNS; run++) {
      // Seed a PRISTINE workspace for THIS run. Each launch must unlock a
      // workspace with no pre-existing audit anchor; reusing one workspace makes
      // the second+ unlock fail closed on CI (see seedEncryptedWorkspace doc).
      const dir = createSeededWorkspace();
      createdDirs.add(dir);

      // Each run launches a fresh Electron process against the isolated, seeded
      // workspace. args: ['.', --user-data-dir=<iso>] makes Electron load our
      // package.json (app name → opentreasury-desktop) while sandboxing all
      // userData (config, device.json, workspace) into the isolated dir.
      const app: ElectronApplication = await electron.launch({
        args: launchArgs(dir),
        env: {
          ...process.env,
          // Resolve the seeded workspace (relative to the isolated userData).
          OT_DATA_DIR: DATA_DIR,
          // Suppress the dev-seed auto-write so the event log stays exactly what
          // the headless seed produced (avoids a slow append on first launch).
          OT_SEED: 'none',
          OT_PASSWORD_STORE: PASSWORD_STORE,
        },
      });

      // Pipe the Electron main-process stdout/stderr (boot logs + any
      // OT_BOOT_TRACE timeline) to a per-run file so a CI hang is debuggable.
      // Attach immediately — bootstrap logs fire before firstWindow().
      const mainLog = join(TEST_RESULTS_DIR, `perf-main-run${run + 1}.log`);
      const proc = app.process();
      proc.stdout?.on('data', (d: Buffer) => appendFileSync(mainLog, d));
      proc.stderr?.on('data', (d: Buffer) => appendFileSync(mainLog, d));

      try {
        const page = await app.firstWindow();
        await page.waitForLoadState('domcontentloaded');

        // Wait for the app shell nav to be present before measuring.
        try {
          await page.waitForSelector('.ot-shell__sidebar', {
            state: 'visible',
            timeout: SIDEBAR_TIMEOUT_MS,
          });
        } catch (err) {
          await captureBootFailure(page, run);
          throw err;
        }

        // ── Measure: nav click → first data row visible ───────────────────
        const t0 = Date.now();
        await page.click(MOVEMENTS_NAV_BTN);
        // Generous absolute timeout so the assertion is on the median, not on
        // a single slow run.  Budget enforcement is at the median level below.
        await page.waitForSelector(FIRST_DATA_ROW, {
          state: 'visible',
          // 30 s per-run cap: generous enough for cold Electron launches on CI
          // while still failing faster than the global test timeout.
          // Budget enforcement is at the median level below, not per-run.
          timeout: 30_000,
        });
        const elapsed = Date.now() - t0;
        // ─────────────────────────────────────────────────────────────────

        times.push(elapsed);
        // eslint-disable-next-line no-console
        console.log(`[perf] run ${run + 1}/${RUNS}: ${elapsed} ms`);
      } finally {
        await app.close();
        // Drop this run's pristine workspace now that the launch is done; on the
        // happy path afterAll then has nothing to do. Keep it on failure? No —
        // the boot diagnostics (screenshot + main-process log) are already in
        // test-results/; the encrypted workspace itself is reproducible from seed.
        rmSync(dir, { recursive: true, force: true });
        createdDirs.delete(dir);
      }
    }

    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)] as number;

    // eslint-disable-next-line no-console
    console.log(
      `[perf] times=[${times.join(', ')}] ms  ` + `median=${median} ms  budget=${BUDGET_MS} ms`,
    );

    expect(
      median,
      `MovementsScreen median mount time ${median} ms exceeds ` +
        `${BUDGET_MS} ms budget.\n` +
        `Run times: [${times.join(', ')}] ms\n` +
        `See docs/perf/playwright-gate.md for debug steps.`,
    ).toBeLessThanOrEqual(BUDGET_MS);
  });
});
