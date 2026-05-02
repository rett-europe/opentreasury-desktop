import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Doc-shots harness — Issue #163 (P2-5) + #232 (locale parametrization)
// ---------------------------------------------------------------------------
// Generates the seven illustrated waypoints that Oracle embeds in the end-user
// guide under docs/guides/. Output PNGs land in docs/guides/screenshots/ and
// are committed to the repo so the markdown is immediately publishable.
//
// CRITICAL: Electron is launched with `args: ['.', `--user-data-dir=${ISO}`]`.
//   - `.` makes Electron resolve our package.json so app.getName() returns
//     "opentreasury-desktop" (NEVER pass a path to a built script — that path
//     turns into the app name and userData falls back to %APPDATA%\Electron,
//     making your seeded profile.json invisible). See PR #46 / movements-perf.
//   - `--user-data-dir=…` (Chromium switch, honoured by Electron) sandboxes
//     userData under an OS temp folder so we can freely overwrite
//     profile.json / app-config.json without touching the dogfood install.
//
// LOCALE CONTROL (Issue #232):
//   Set DOC_SHOTS_LOCALE env var (default: 'en') to generate localized shots.
//   Examples:
//     - PowerShell: $env:DOC_SHOTS_LOCALE='es'; npm run docshots
//     - Bash:       DOC_SHOTS_LOCALE=es npm run docshots
//   Output naming: EN uses `NN-slug.png` (backward-compat), other locales use
//   `NN-slug.{locale}.png` (e.g., `01-profile-setup.es.png`).
// ---------------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const SCREENSHOT_DIR = path.join(REPO_ROOT, 'docs', 'guides', 'screenshots');
const SEED_SCRIPT = path.join(REPO_ROOT, 'scripts', 'perf-seed.mjs');

// Locale parametrization — Issue #232
const LOCALE = process.env.DOC_SHOTS_LOCALE ?? 'en';
const outputName = (base: string): string =>
  LOCALE === 'en' ? `${base}.png` : `${base}.${LOCALE}.png`;

const VIEWPORT = { width: 1800, height: 1100 } as const;

// Seed a small, dataset (vs. perf's 5k) — guides only need a few-screen-worth
// of rows so the table demonstrates virtualisation without dwarfing the row
// detail. 400 keeps screenshots quick and the categories well-populated.
const SEED_TX_COUNT = 400;

// Profile fixture per acceptance criteria — Spanish NGO treasurer persona.
const PROFILE = {
  // 26-char Crockford base32 (ULID shape) — the schema enforces length 26.
  userId: '01J9MARIARODRIGUEZ00000000',
  name: 'Maria Rodríguez',
  role: 'Treasurer',
  ngoName: 'Casa Esperanza',
  identitySource: 'local' as const,
  createdAt: '2026-01-15T09:00:00.000Z',
};

// Sidebar nav selectors (mirrors movements-perf.spec.ts:32 — anchored to the
// `nav[aria-label="Primary"]` landmark for resilience against locale shifts).
const NAV_PRIMARY = 'nav[aria-label="Primary"]';
const NAV_PANEL = `${NAV_PRIMARY} > div:nth-child(1) > ul > li:nth-child(1) > button`;
const NAV_MOVEMENTS = `${NAV_PRIMARY} > div:nth-child(1) > ul > li:nth-child(2) > button`;
const NAV_BALANCE = `${NAV_PRIMARY} > div:nth-child(1) > ul > li:nth-child(3) > button`;
const NAV_INSIGHTS = `${NAV_PRIMARY} > div:nth-child(1) > ul > li:nth-child(4) > button`;

// First non-virtualised data row in the movements table.
const FIRST_DATA_ROW = 'table.ot-table tbody tr:not([aria-hidden="true"])';

interface IsolatedEnv {
  readonly userDataDir: string;
  readonly dataDir: string;
}

function makeIsolatedEnv(): IsolatedEnv {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ot-doc-shots-'));
  const dataDir = path.join(root, 'doc-events');
  fs.mkdirSync(dataDir, { recursive: true });
  return { userDataDir: root, dataDir };
}

function writeProfile(userDataDir: string): void {
  const filePath = path.join(userDataDir, 'profile.json');
  fs.writeFileSync(filePath, JSON.stringify(PROFILE, null, 2), 'utf8');
}

function deleteProfile(userDataDir: string): void {
  const filePath = path.join(userDataDir, 'profile.json');
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function writeAppConfig(userDataDir: string, dataDir: string): void {
  const filePath = path.join(userDataDir, 'app-config.json');
  const config = { version: 1, dataDir, readOnly: false };
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
}

function seedDataset(dataDir: string): void {
  const out = path.join(dataDir, 'events.ndjson');
  const result = spawnSync(
    'node',
    [SEED_SCRIPT, `--count=${String(SEED_TX_COUNT)}`, `--out=${out}`],
    { stdio: 'inherit', cwd: REPO_ROOT },
  );
  if (result.status !== 0) {
    throw new Error(`perf-seed.mjs failed with exit code ${String(result.status)}`);
  }
}

async function launchApp(userDataDir: string): Promise<ElectronApplication> {
  return electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      // Suppress the dev-seed auto-write — we already shaped the dataset
      // ourselves via perf-seed.mjs.
      OT_SEED: 'none',
    },
  });
}

async function preparePage(app: ElectronApplication): Promise<Page> {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.setViewportSize(VIEWPORT);
  // Normalize zoom to 1.0 for consistent screenshots
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).electronAPI?.setZoomFactor?.(1.0);
  });
  return page;
}

async function shoot(page: Page, file: string): Promise<void> {
  const target = path.join(SCREENSHOT_DIR, file);
  await page.screenshot({ path: target, fullPage: true });
  // eslint-disable-next-line no-console
  console.log(`[doc-shots] wrote ${path.relative(REPO_ROOT, target)}`);
}

test.describe('doc-shots — illustrated end-user guide screenshots', () => {
  // Serial: every test below mutates the same isolated userData dir and runs
  // its own Electron process. Parallel runs would race on the file system.
  test.describe.configure({ mode: 'serial' });

  let env: IsolatedEnv;

  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    env = makeIsolatedEnv();
    seedDataset(env.dataDir);
    writeAppConfig(env.userDataDir, env.dataDir);
  });

  test('01 — fresh first launch shows the profile setup modal', async () => {
    deleteProfile(env.userDataDir);

    const app = await launchApp(env.userDataDir);
    try {
      const page = await preparePage(app);
      // Modal renders inside a <dialog> element with our class.
      await page.waitForSelector('dialog.ot-profile-setup-modal', { state: 'visible' });
      // Wait one frame for the dialog backdrop to settle so the screenshot
      // doesn't catch the open animation mid-flight.
      await page.waitForTimeout(250);
      await shoot(page, outputName('01-profile-setup'));
    } finally {
      await app.close();
    }
  });

  test('02–07 — drive through the shell with the seeded profile', async () => {
    // Pre-seed the profile.json so bootstrap can load it immediately
    writeProfile(env.userDataDir);

    const app = await launchApp(env.userDataDir);
    try {
      const page = await preparePage(app);

      // Set locale before first navigation using the parametrized LOCALE variable
      await page.evaluate((locale) => {
        try {
          window.localStorage.setItem('opentreasury.locale', locale);
        } catch {
          /* ignore */
        }
      }, LOCALE);

      // Reload to apply the locale
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      // Wait for the AppShell sidebar (profile and locale should now be set)
      await page.waitForSelector('.ot-shell__sidebar', { state: 'visible' });

      // ── 02: Dashboard / Panel — header should show "Casa Esperanza" ────
      await page.click(NAV_PANEL);
      // Tenant name renders synchronously once the profile loads.
      await expect(page.locator('.ot-shell__tenant')).toHaveText(PROFILE.ngoName);
      // Allow any panel widgets to settle (charts / counters). Also give the
      // event log time to fully hydrate in the background.
      await page.waitForTimeout(2000);
      await shoot(page, outputName('02-dashboard'));

      // ── 03: Saldo (collapsed categories) ───────────────────────────────
      await page.click(NAV_BALANCE);
      // Wait for at least one category panel to render.
      await page.waitForSelector('[aria-labelledby^="saldo-panel-"]', { state: 'visible' });
      await page.waitForTimeout(400);
      await shoot(page, outputName('03-saldo'));

      // ── 04: Saldo (subcategories expanded) ─────────────────────────────
      // Toggle pills are scoped per panel; click both income and expense.
      const incomeToggle = page.locator('[data-testid="saldo-subcategories-toggle-income"]');
      const expenseToggle = page.locator('[data-testid="saldo-subcategories-toggle-expense"]');
      if (await incomeToggle.count()) await incomeToggle.first().click();
      if (await expenseToggle.count()) await expenseToggle.first().click();
      await page.waitForTimeout(400);
      await shoot(page, outputName('04-saldo-expanded'));

      // ── 05: Movements list ─────────────────────────────────────────────
      await page.click(NAV_MOVEMENTS);
      // Wait for the movements screen container
      await page.waitForSelector('.ot-movements', { state: 'visible', timeout: 10_000 });
      // Default filter is "This month" which may have no data. Click the "All" preset
      // (locale-agnostic: button[role="radio"] is structurally stable).
      const allPresetBtn = page
        .locator('button[role="radio"]')
        .filter({ has: page.locator('text=/^(All|Todo)$/i') });
      await allPresetBtn.click();
      await page.waitForTimeout(1000);
      // Now wait for data rows to appear
      await page.waitForSelector(FIRST_DATA_ROW, { state: 'visible', timeout: 10_000 });
      await page.waitForTimeout(300);
      await shoot(page, outputName('05-movements'));

      // ── 06: Insights ───────────────────────────────────────────────────
      await page.click(NAV_INSIGHTS);
      // Insights screen has its own root element; wait for the main content
      // area to swap content rather than pinning to a specific class which
      // may evolve.
      await page.waitForFunction(() => {
        const main = document.querySelector('main.ot-shell__main');
        return !!main && main.textContent !== null && main.textContent.length > 0;
      });
      await page.waitForTimeout(500);
      await shoot(page, outputName('06-insights'));

      // ── 07: Settings → Data folder row + readOnly badge area ───────────
      // Ensure we're scrolled to top so the header is visible
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
      // The settings button is in the sidebar footer (locale-aware: Preferences/Preferencias)
      const settingsBtn = page
        .locator('button')
        .filter({ has: page.locator('text=/^(Preferences|Preferencias)$/i') });
      await settingsBtn.click({ timeout: 10_000 });
      await page.waitForSelector('.ot-preferences', { state: 'visible' });
      await page.waitForTimeout(500);
      await shoot(page, outputName('07-settings-data-folder'));
    } finally {
      await app.close();
    }
  });
});
