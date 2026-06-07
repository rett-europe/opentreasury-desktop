import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Visual-evidence + scroll-geometry guard for the Movements filter bar.
 *
 * Regression context (#356 → this fix): PR #356 swapped the Movements
 * custom-range *popover* for the shared DateRangePicker's *always-inline*
 * From/To row, adding a third row to the calm two-row filter bar. That taller
 * bar pushed the chrome above the table past the virtualised table's
 * `maxHeight: calc(100vh - 440px)` budget, so BOTH the inner table scroller and
 * the page-level `.ot-shell__main` scrolled — two vertical scrollbars — and the
 * "Todo" all-toggle floated off to the right.
 *
 * This spec seeds a virtualised dataset (400 rows > the 100-row threshold),
 * navigates to Movements, switches to the "Todo" (all-time) range so rows are
 * present, and:
 *   1. ASSERTS the double-scrollbar is gone — `.ot-shell__main` must not scroll
 *      vertically while the inner `.ot-table-wrap--virtual` owns the scroll.
 *   2. Captures `movements-<viewport>-filter.png` (filter-bar close-up) and
 *      `movements-<viewport>-full.png` (page) into `docs/ux/movements-filter-fix/`
 *      as the before/after visual evidence Pedro reviews.
 *
 * Harness (SPEC-026 encrypted-workspace model):
 *   - Everything runs under an ISOLATED `--user-data-dir` temp folder so a
 *     developer's real (possibly locked) dogfood install at
 *     `%APPDATA%/opentreasury-desktop` is never read or written.
 *   - A first "headless seed" Electron launch (`OT_HEADLESS_SEED=1`) writes a
 *     real *encrypted* workspace under `<tmp>/<OT_DATA_DIR>` via the same
 *     seedEncryptedDevWorkspace path `npm run dev` uses.
 *   - The measurement launch silent-unlocks that workspace via safeStorage
 *     (DPAPI on Windows / Keychain on macOS as the same OS user; `basic`
 *     fallback on headless CI) and lands directly in AppShell.
 *
 * NOT part of CI: skipped unless `OT_SNAPSHOTS=1`. Run manually (PowerShell):
 *
 *     npm run build
 *     $env:OT_SNAPSHOTS=1; npx playwright test tests/e2e/movements-filter-snapshots.spec.ts
 *
 * Prereq: `npm run build` (Electron loads dist/main via `args: ['.']`).
 */

const RUN_SNAPSHOTS = process.env['OT_SNAPSHOTS'] === '1';

const require = createRequire(import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const OUT_DIR = join(REPO_ROOT, 'docs', 'ux', 'movements-filter-fix');

// Relative data-dir name resolved under the isolated userData root.
const DATA_DIR = 'movements-filter-events';

// Rows above the 100-row virtualisation threshold so the table mounts its
// virtualised (`.ot-table-wrap--virtual`) inner scroller — the surface that the
// #356 regression caused to double up with the page scrollbar.
const SEED_TX_COUNT = 400;

// On headless CI there is no OS keyring, so safeStorage must use Electron's
// `basic` fallback cipher (opt-in via --password-store=basic). Locally we use
// the real per-user backend (DPAPI/Keychain), which silent-unlocks for free.
const PASSWORD_STORE = process.env['OT_PASSWORD_STORE'] ?? (process.env['CI'] ? 'basic' : '');

const NAV_MOVEMENTS =
  'nav[aria-label="Primary"] > div:nth-child(1) > ul > li:nth-child(2) > button';
// Virtualised data rows do not carry aria-hidden (padding rows do).
const FIRST_DATA_ROW = 'table.ot-table tbody tr:not([aria-hidden="true"])';

const VIEWPORTS = [
  { id: 'wide', width: 1600, height: 1000 },
  { id: 'narrow', width: 1100, height: 800 },
] as const;

const PROFILE = {
  userId: '01J9MARIARODRIGUEZ00000000',
  name: 'Maria Rodríguez',
  role: 'Treasurer',
  ngoName: 'Casa Esperanza',
  identitySource: 'local' as const,
  createdAt: '2026-01-15T09:00:00.000Z',
};

function launchArgs(userDataDir: string): string[] {
  const args = ['.', `--user-data-dir=${userDataDir}`];
  if (PASSWORD_STORE) args.unshift(`--password-store=${PASSWORD_STORE}`);
  return args;
}

/**
 * First Electron launch: generate a real encrypted workspace under
 * `<userDataDir>/<DATA_DIR>` and exit. Mirrors scripts/perf-seed.mjs --dir mode
 * but pinned to the isolated userData dir so the dogfood install is untouched.
 */
function seedEncryptedWorkspace(userDataDir: string): void {
  const electronBin = require('electron') as unknown as string;
  if (typeof electronBin !== 'string') {
    throw new Error('could not resolve the Electron binary path');
  }
  const result = spawnSync(electronBin, launchArgs(userDataDir), {
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
}

type Geometry = {
  readonly mainScrolls: boolean;
  readonly innerScrollerExists: boolean;
  readonly innerScrolls: boolean;
  readonly filterBarHeight: number;
};

async function measure(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const TOL = 2; // sub-pixel / scrollbar tolerance
    const main = document.querySelector('.ot-shell__main');
    const inner =
      document.querySelector('.ot-table-wrap--virtual') ?? document.querySelector('.ot-table-wrap');
    const overflows = (el: Element | null): boolean =>
      el != null && el.scrollHeight - el.clientHeight > TOL;
    const bar = document.querySelector('.ot-filter-bar');
    const barHeight = bar ? (bar as HTMLElement).getBoundingClientRect().height : 0;
    return {
      mainScrolls: main != null && main.scrollHeight - main.clientHeight > TOL,
      innerScrollerExists: inner != null,
      innerScrolls: overflows(inner),
      filterBarHeight: Math.round(barHeight),
    };
  });
}

async function gotoMovements(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.waitForLoadState('domcontentloaded');
  try {
    await page.waitForSelector('.ot-shell__sidebar', { state: 'visible', timeout: 60_000 });
  } catch (err) {
    const body = await page.evaluate(() => document.body.innerText.slice(0, 600));
    // eslint-disable-next-line no-console
    console.log(`[debug] no sidebar @ ${width}x${height}. body:\n${body}`);
    throw err;
  }
  await page.click(NAV_MOVEMENTS);
  await page.waitForSelector('.ot-movements', { state: 'visible', timeout: 30_000 });
  // The default "Este mes" range may have no seeded rows; switch to "Todo"
  // (all-time) so the virtualised table is populated and owns a scroll context.
  await page.getByRole('button', { name: /^(All time|Todo)$/i }).click();
  await page.waitForSelector(FIRST_DATA_ROW, { state: 'visible', timeout: 30_000 });
  // Let custom fonts / layout settle so heights measure stably.
  await page.waitForTimeout(400);
}

async function capture(page: Page, viewport: string, width: number, height: number): Promise<void> {
  const filterBar = page.locator('.ot-filter-bar');
  await filterBar.screenshot({ path: join(OUT_DIR, `movements-${viewport}-filter.png`) });
  const box = await filterBar.boundingBox();
  const bottom = box ? Math.ceil(box.y + box.height + 360) : height;
  await page.screenshot({
    path: join(OUT_DIR, `movements-${viewport}-full.png`),
    clip: { x: 0, y: 0, width, height: Math.min(height, bottom) },
  });
}

test.describe('Movements filter bar — layout + scroll-containment snapshots', () => {
  test.skip(!RUN_SNAPSHOTS, 'Set OT_SNAPSHOTS=1 to capture Movements filter snapshots.');
  test.describe.configure({ mode: 'serial' });

  let userDataDir: string;

  test.beforeAll(() => {
    mkdirSync(OUT_DIR, { recursive: true });
    userDataDir = mkdtempSync(join(tmpdir(), 'ot-mov-filter-'));
    // profile.json suppresses the ProfileSetupModal so the measurement launch
    // lands directly in AppShell once the workspace silent-unlocks.
    writeFileSync(join(userDataDir, 'profile.json'), JSON.stringify(PROFILE, null, 2), 'utf8');
    seedEncryptedWorkspace(userDataDir);
    // app-config.json points the (non-headless) measurement launch at the
    // freshly seeded encrypted workspace so workspace:detect silent-unlocks it
    // instead of routing to the FreshSetupFlow folder picker. Mirrors the
    // app-config.json that scripts/perf-seed.mjs writes for movements-perf.
    const appConfig = { version: 1, dataDir: join(userDataDir, DATA_DIR), readOnly: false };
    writeFileSync(join(userDataDir, 'app-config.json'), JSON.stringify(appConfig, null, 2), 'utf8');
  });

  for (const vp of VIEWPORTS) {
    test(`Movements @ ${vp.id} (${vp.width}×${vp.height}): single scroll context + evidence`, async () => {
      const app: ElectronApplication = await electron.launch({
        args: launchArgs(userDataDir),
        env: {
          ...process.env,
          OT_DATA_DIR: DATA_DIR,
          OT_SEED: 'none',
          OT_PASSWORD_STORE: PASSWORD_STORE,
        },
      });
      try {
        const page = await app.firstWindow();
        await gotoMovements(page, vp.width, vp.height);

        const geo = await measure(page);
        // eslint-disable-next-line no-console
        console.log(`[movements-filter] ${vp.id}:`, JSON.stringify(geo));

        // The double-scrollbar regression guard: the page itself must NOT scroll;
        // only the inner virtualised table scroller owns the vertical scroll.
        expect(geo.mainScrolls, 'the page-level .ot-shell__main must not scroll').toBe(false);
        expect(geo.innerScrollerExists, 'the virtualised table scroller must be present').toBe(
          true,
        );
        expect(geo.innerScrolls, 'the inner table scroller must own the scroll').toBe(true);

        await capture(page, vp.id, vp.width, vp.height);

        // Opening the custom-range popover must NOT re-introduce a page scroll
        // context: the popover is absolutely positioned, so it can never inflate
        // the filter-bar height the way the #356 always-inline row did.
        await page.getByRole('button', { name: /^(Custom|Personalizado)$/i }).click();
        await page.waitForSelector('.ot-daterange__popover', { state: 'visible', timeout: 10_000 });
        const openGeo = await measure(page);
        // eslint-disable-next-line no-console
        console.log(`[movements-filter] ${vp.id} (popover open):`, JSON.stringify(openGeo));
        expect(
          openGeo.mainScrolls,
          'the page must not scroll while the custom-range popover is open',
        ).toBe(false);
        await page
          .locator('.ot-filter-bar')
          .screenshot({ path: join(OUT_DIR, `movements-${vp.id}-popover.png`) });
      } finally {
        await app.close();
      }
    });
  }
});
