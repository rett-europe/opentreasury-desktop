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
 * Visual-evidence + header-geometry guard for the Insights date-range header.
 *
 * Regression context (#356 → this fix): the #356 custom date-range treatment
 * stuffed the whole date-range cluster (preset chips + an always-inline From/To
 * row + the Volume/Net/#Txn toggle) into the shared `.ot-page-header`. Because
 * the inline From/To row makes the picker two rows tall and the header uses
 * `align-items: flex-end`, the "Insights" `<h1>` was pushed DOWN and the header
 * grew much taller than the other screens — so the page title no longer aligned
 * with where it sits on Dashboard / Transactions / Balance.
 *
 * The fix moves the date-range picker (popover variant) + view toggle into a
 * dedicated `.ot-insights__toolbar` BELOW the header, leaving the header with
 * the title only. This spec:
 *   1. ASSERTS the page title is at the SAME vertical position on Insights as on
 *      Transactions (both `.ot-page-header` h1 tops must match) — Pedro's exact
 *      complaint.
 *   2. ASSERTS the date-range picker is NOT inside `.ot-page-header` but inside
 *      `.ot-insights__toolbar`.
 *   3. ASSERTS opening the custom-range popover does not inflate the header or
 *      toolbar height (the popover is absolutely positioned).
 *   4. Captures evidence PNGs into `docs/ux/insights-filter-fix/`.
 *
 * Harness mirrors `movements-filter-snapshots.spec.ts` (SPEC-026 encrypted
 * isolated workspace). NOT part of CI: skipped unless `OT_SNAPSHOTS=1`:
 *
 *     npm run build
 *     $env:OT_SNAPSHOTS=1; npx playwright test tests/e2e/insights-filter-snapshots.spec.ts
 *
 * Prereq: `npm run build` (Electron loads dist/main via `args: ['.']`).
 */

const RUN_SNAPSHOTS = process.env['OT_SNAPSHOTS'] === '1';

const require = createRequire(import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const OUT_DIR = join(REPO_ROOT, 'docs', 'ux', 'insights-filter-fix');

const DATA_DIR = 'insights-filter-events';

// A modest seed is enough; the layout assertions hold regardless of tag data.
const SEED_TX_COUNT = 400;

const PASSWORD_STORE = process.env['OT_PASSWORD_STORE'] ?? (process.env['CI'] ? 'basic' : '');

// Primary sidebar order: Dashboard(1) · Transactions(2) · Balance(3) · Insights(4).
const NAV_TRANSACTIONS =
  'nav[aria-label="Primary"] > div:nth-child(1) > ul > li:nth-child(2) > button';
const NAV_INSIGHTS = 'nav[aria-label="Primary"] > div:nth-child(1) > ul > li:nth-child(4) > button';

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

type HeaderGeometry = {
  readonly h1Top: number;
  readonly headerHeight: number;
  readonly toolbarHeight: number;
  readonly pickerInHeader: boolean;
  readonly pickerInToolbar: boolean;
};

async function measureHeader(page: Page): Promise<HeaderGeometry> {
  return page.evaluate(() => {
    const header = document.querySelector('.ot-page-header');
    const h1 = header?.querySelector('h1') ?? null;
    const toolbar = document.querySelector('.ot-insights__toolbar');
    const round = (n: number): number => Math.round(n);
    return {
      h1Top: h1 ? round(h1.getBoundingClientRect().top) : -1,
      headerHeight: header ? round((header as HTMLElement).getBoundingClientRect().height) : -1,
      toolbarHeight: toolbar ? round((toolbar as HTMLElement).getBoundingClientRect().height) : -1,
      pickerInHeader: (header?.querySelector('.ot-daterange') ?? null) != null,
      pickerInToolbar: (toolbar?.querySelector('.ot-daterange') ?? null) != null,
    };
  });
}

async function readTransactionsTitleTop(page: Page): Promise<number> {
  await page.click(NAV_TRANSACTIONS);
  await page.waitForSelector('.ot-movements', { state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(200);
  return page.evaluate(() => {
    const h1 = document.querySelector('.ot-page-header h1');
    return h1 ? Math.round(h1.getBoundingClientRect().top) : -1;
  });
}

async function gotoInsights(page: Page): Promise<void> {
  await page.click(NAV_INSIGHTS);
  await page.waitForSelector('.ot-insights', { state: 'visible', timeout: 30_000 });
  await page.waitForSelector('.ot-insights__toolbar', { state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(400);
}

async function capture(page: Page, viewport: string, width: number, height: number): Promise<void> {
  await page
    .locator('.ot-page-header')
    .first()
    .screenshot({ path: join(OUT_DIR, `insights-${viewport}-header.png`) });
  await page.screenshot({
    path: join(OUT_DIR, `insights-${viewport}-full.png`),
    clip: { x: 0, y: 0, width, height: Math.min(height, 520) },
  });
}

test.describe('Insights header — title position + date-range toolbar snapshots', () => {
  test.skip(!RUN_SNAPSHOTS, 'Set OT_SNAPSHOTS=1 to capture Insights header snapshots.');
  test.describe.configure({ mode: 'serial' });

  let userDataDir: string;

  test.beforeAll(() => {
    mkdirSync(OUT_DIR, { recursive: true });
    userDataDir = mkdtempSync(join(tmpdir(), 'ot-insights-filter-'));
    writeFileSync(join(userDataDir, 'profile.json'), JSON.stringify(PROFILE, null, 2), 'utf8');
    seedEncryptedWorkspace(userDataDir);
    const appConfig = { version: 1, dataDir: join(userDataDir, DATA_DIR), readOnly: false };
    writeFileSync(join(userDataDir, 'app-config.json'), JSON.stringify(appConfig, null, 2), 'utf8');
  });

  for (const vp of VIEWPORTS) {
    test(`Insights @ ${vp.id} (${vp.width}×${vp.height}): title aligned + toolbar layout`, async () => {
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
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForSelector('.ot-shell__sidebar', { state: 'visible', timeout: 60_000 });

        // Standard page-title position taken from another screen (Transactions).
        const transactionsTitleTop = await readTransactionsTitleTop(page);

        await gotoInsights(page);
        const geo = await measureHeader(page);
        // eslint-disable-next-line no-console
        console.log(
          `[insights-filter] ${vp.id}:`,
          JSON.stringify(geo),
          `txTop=${transactionsTitleTop}`,
        );

        // (1) Title sits at the same vertical position as on other screens.
        expect(
          Math.abs(geo.h1Top - transactionsTitleTop),
          'Insights title must align with the standard page-title position',
        ).toBeLessThanOrEqual(2);
        // (2) Date-range picker lives in the toolbar, not the header.
        expect(geo.pickerInHeader, 'the date-range picker must not be in the page header').toBe(
          false,
        );
        expect(geo.pickerInToolbar, 'the date-range picker must be in the toolbar').toBe(true);

        await capture(page, vp.id, vp.width, vp.height);

        // (3) Opening the popover must not inflate the header or toolbar height.
        await page.getByRole('button', { name: /^(Custom|Personalizado)$/i }).click();
        await page.waitForSelector('.ot-daterange__popover', { state: 'visible', timeout: 10_000 });
        const openGeo = await measureHeader(page);
        // eslint-disable-next-line no-console
        console.log(`[insights-filter] ${vp.id} (popover open):`, JSON.stringify(openGeo));
        expect(
          openGeo.headerHeight,
          'the header height must not change when the popover opens',
        ).toBe(geo.headerHeight);
        expect(
          openGeo.toolbarHeight,
          'the toolbar height must not change when the popover opens',
        ).toBe(geo.toolbarHeight);
        await page
          .locator('.ot-page-header')
          .first()
          .screenshot({ path: join(OUT_DIR, `insights-${vp.id}-popover.png`) });
      } finally {
        await app.close();
      }
    });
  }
});
