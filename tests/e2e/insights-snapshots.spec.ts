import { test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Visual-evidence harness for the Insights drilldown layout.
 *
 * NOT part of CI. Intentionally skipped unless `OT_SNAPSHOTS=1` is set in the
 * environment so `npm run e2e` keeps its current scope. Run manually:
 *
 *     OT_SNAPSHOTS=1 npx playwright test tests/e2e/insights-snapshots.spec.ts
 *     # (PowerShell)
 *     $env:OT_SNAPSHOTS=1; npx playwright test tests/e2e/insights-snapshots.spec.ts
 *
 * Captures the new SubcategoryRankedTable component (Concept A) into
 * `docs/ux/insights-after/`. The legacy diverging-chart "before" snapshots
 * live at `docs/ux/insights-current-state/` and are preserved untouched as
 * the migration PR's reference for visual diff. Each test seeds its own
 * deterministic NDJSON event log under a unique `OT_DATA_DIR`, launches
 * Electron with `args: ['.']` (so userData resolves to
 * `%APPDATA%/opentreasury-desktop` on Windows), navigates to the drilldown
 * via the lone seeded tag, and captures:
 *   - `<dataset>-<viewport>-full.png`  : donut row + ranked tables together
 *   - `<dataset>-<viewport>-bars.png`  : focused close-up of the ranked tables
 *
 * Production code is NOT touched. This file lives in `tests/e2e/` so the
 * existing Playwright config (`testDir: './tests/e2e'`) discovers it, but the
 * `test.skip()` guard keeps it inert in CI.
 */

// ---------------------------------------------------------------------------
// Skip-in-CI guard
// ---------------------------------------------------------------------------
const RUN_SNAPSHOTS = process.env['OT_SNAPSHOTS'] === '1';

// ---------------------------------------------------------------------------
// Output paths
// ---------------------------------------------------------------------------
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const OUT_DIR_BEFORE = join(REPO_ROOT, 'docs', 'ux', 'insights-current-state');
const OUT_DIR_AFTER = join(REPO_ROOT, 'docs', 'ux', 'insights-after');
const OUT_DIR = OUT_DIR_AFTER;

// ---------------------------------------------------------------------------
// userData root resolution (mirrors scripts/perf-seed.mjs)
// ---------------------------------------------------------------------------
function userDataRoot(): string {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
    name: string;
    build?: { productName?: string };
  };
  const appFolder = pkg.build?.productName ?? pkg.name;
  switch (platform()) {
    case 'win32':
      return join(process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming'), appFolder);
    case 'darwin':
      return join(homedir(), 'Library', 'Application Support', appFolder);
    default:
      return join(process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'), appFolder);
  }
}

// ---------------------------------------------------------------------------
// ULID-shape id helper (matches devSeed.fakeUlid / perf-seed.fakeUlid)
// ---------------------------------------------------------------------------
function fakeUlid(seedKey: string): string {
  const upper = String(seedKey)
    .toUpperCase()
    .replace(/[^0-9A-HJKMNP-TV-Z]/g, '0');
  return (upper + '0'.repeat(26)).slice(0, 26);
}

// ---------------------------------------------------------------------------
// Dataset shapes
// ---------------------------------------------------------------------------
type TxSpec = {
  readonly catKey: string;
  readonly subIdx: number;
  readonly type: 'expense' | 'income';
  readonly amount: number; // EUR (will be encoded as cents-equivalent decimal)
  readonly date: string; // YYYY-MM-DD, must be within thisYear() window
};

type DatasetShape = {
  readonly id: 'normal' | 'skewed' | 'sparse';
  readonly label: string;
  readonly txs: ReadonlyArray<TxSpec>;
};

// Categories used across all shapes (subset of the perf-seed master list so
// shape-generators can refer to subcategory indices the same way).
const CATEGORIES = [
  {
    key: 'CATGAS',
    name: 'Gastos',
    type: 'expense' as const,
    subs: ['Alquiler', 'Suministros', 'Transporte', 'Comunicación', 'Comisiones'],
  },
  {
    key: 'CATADM',
    name: 'Administrativo',
    type: 'expense' as const,
    subs: ['Material oficina', 'Servicios profesionales', 'Seguros', 'Comisiones'],
  },
  {
    key: 'CATACT',
    name: 'Actividades',
    type: 'expense' as const,
    subs: ['Talleres', 'Terapias', 'Formación'],
  },
  {
    key: 'CATCUO',
    name: 'Cuotas',
    type: 'income' as const,
    subs: ['Cuota Socio Anual', 'Cuota Socio Mensual', 'Cuota Familia'],
  },
  {
    key: 'CATDON',
    name: 'Donaciones',
    type: 'income' as const,
    subs: ['Individuales', 'Empresas', 'Anónimas'],
  },
  {
    key: 'CATEVT',
    name: 'Eventos',
    type: 'income' as const,
    subs: ['Galas benéficas', 'Mercadillos', 'Carreras solidarias', 'Charlas'],
  },
  { key: 'CATSUB', name: 'Subvenciones', type: 'income' as const, subs: ['Públicas', 'Privadas'] },
];

const ACCOUNT = { key: 'ACCSCN', bankName: 'Unicaja Banco', label: 'Snapshot' };
const TAG = { key: 'TAGSCN', name: 'Snapshot', color: 'oklch(0.78 0.10 280)' };

// All transactions land in the first quarter of the current year so they fall
// inside the `thisYear()` window the App computes for the drilldown.
const D = (mm: string, dd: string): string => `2026-${mm}-${dd}`;

const NORMAL: DatasetShape = {
  id: 'normal',
  label: 'normal — typical month, 6–10 categories on each side',
  txs: [
    // Expenses — 8 distinct subcategories with amounts in a reasonable spread.
    { catKey: 'CATGAS', subIdx: 0, type: 'expense', amount: 1200, date: D('01', '05') },
    { catKey: 'CATGAS', subIdx: 1, type: 'expense', amount: 380, date: D('01', '12') },
    { catKey: 'CATGAS', subIdx: 2, type: 'expense', amount: 220, date: D('02', '03') },
    { catKey: 'CATGAS', subIdx: 3, type: 'expense', amount: 95, date: D('02', '11') },
    { catKey: 'CATADM', subIdx: 0, type: 'expense', amount: 140, date: D('02', '18') },
    { catKey: 'CATADM', subIdx: 1, type: 'expense', amount: 540, date: D('03', '04') },
    { catKey: 'CATADM', subIdx: 2, type: 'expense', amount: 310, date: D('03', '09') },
    { catKey: 'CATACT', subIdx: 0, type: 'expense', amount: 460, date: D('03', '15') },
    // Incomes — 7 distinct subcategories.
    { catKey: 'CATCUO', subIdx: 0, type: 'income', amount: 800, date: D('01', '08') },
    { catKey: 'CATCUO', subIdx: 1, type: 'income', amount: 240, date: D('01', '20') },
    { catKey: 'CATDON', subIdx: 0, type: 'income', amount: 650, date: D('02', '02') },
    { catKey: 'CATDON', subIdx: 1, type: 'income', amount: 1400, date: D('02', '14') },
    { catKey: 'CATEVT', subIdx: 0, type: 'income', amount: 420, date: D('03', '01') },
    { catKey: 'CATEVT', subIdx: 1, type: 'income', amount: 180, date: D('03', '11') },
    { catKey: 'CATSUB', subIdx: 0, type: 'income', amount: 980, date: D('03', '22') },
  ],
};

const SKEWED: DatasetShape = {
  id: 'skewed',
  label: 'skewed — one mega expense category dominates',
  txs: [
    // A single subcategory absorbs ~85% of expense magnitude.
    { catKey: 'CATGAS', subIdx: 0, type: 'expense', amount: 12000, date: D('01', '05') },
    { catKey: 'CATGAS', subIdx: 1, type: 'expense', amount: 60, date: D('01', '15') },
    { catKey: 'CATGAS', subIdx: 2, type: 'expense', amount: 35, date: D('02', '02') },
    { catKey: 'CATGAS', subIdx: 3, type: 'expense', amount: 12, date: D('02', '12') },
    { catKey: 'CATADM', subIdx: 0, type: 'expense', amount: 180, date: D('02', '20') },
    { catKey: 'CATADM', subIdx: 2, type: 'expense', amount: 540, date: D('03', '04') },
    { catKey: 'CATACT', subIdx: 1, type: 'expense', amount: 95, date: D('03', '14') },
    // Incomes — modest, roughly even.
    { catKey: 'CATCUO', subIdx: 0, type: 'income', amount: 600, date: D('01', '08') },
    { catKey: 'CATDON', subIdx: 0, type: 'income', amount: 720, date: D('02', '06') },
    { catKey: 'CATEVT', subIdx: 0, type: 'income', amount: 540, date: D('02', '22') },
    { catKey: 'CATSUB', subIdx: 0, type: 'income', amount: 480, date: D('03', '17') },
  ],
};

const SPARSE: DatasetShape = {
  id: 'sparse',
  label: 'sparse — only 2–3 entries on each side',
  txs: [
    { catKey: 'CATGAS', subIdx: 0, type: 'expense', amount: 480, date: D('01', '12') },
    { catKey: 'CATADM', subIdx: 1, type: 'expense', amount: 320, date: D('02', '18') },
    { catKey: 'CATCUO', subIdx: 0, type: 'income', amount: 600, date: D('01', '22') },
    { catKey: 'CATDON', subIdx: 0, type: 'income', amount: 850, date: D('03', '02') },
  ],
};

const SHAPES: ReadonlyArray<DatasetShape> = [NORMAL, SKEWED, SPARSE];

// ---------------------------------------------------------------------------
// NDJSON event-log writer (mirrors devSeed / perf-seed envelope shape)
// ---------------------------------------------------------------------------
function writeEventLogForShape(shape: DatasetShape): { dataDir: string; outPath: string } {
  const dataDir = `ux-snapshot-${shape.id}`;
  const outPath = join(userDataRoot(), dataDir, 'events.ndjson');

  const events: Array<Record<string, unknown>> = [];
  let envOrdinal = 0;
  const baseTs = Date.parse('2026-01-01T08:00:00.000Z');
  const envIso = (offset: number): string => new Date(baseTs + offset * 60_000).toISOString();
  const datasetId = fakeUlid('DATASCN');
  const deviceId = fakeUlid('DEVSCN');

  // Account.
  events.push({
    type: 'AccountCreated',
    id: fakeUlid(ACCOUNT.key),
    name: ACCOUNT.label,
    bankName: ACCOUNT.bankName,
    label: ACCOUNT.label,
    color: 'oklch(0.72 0.11 265)',
    currency: 'EUR',
    openingBalance: 0,
    sortOrder: 0,
    createdAt: envIso(envOrdinal++),
  });

  // Categories + subcategories.
  for (const cat of CATEGORIES) {
    const catId = fakeUlid(cat.key);
    events.push({
      type: 'CategoryCreated',
      id: catId,
      name: cat.name,
      kind: cat.type,
      sortOrder: CATEGORIES.indexOf(cat),
      createdAt: envIso(envOrdinal++),
    });
    cat.subs.forEach((subName, i) => {
      events.push({
        type: 'SubcategoryCreated',
        id: fakeUlid(`${cat.key}S${i}`),
        parentCategoryId: catId,
        name: subName,
        createdAt: envIso(envOrdinal++),
      });
    });
  }

  // Tag.
  events.push({
    type: 'TagCreated',
    id: fakeUlid(TAG.key),
    name: TAG.name,
    color: TAG.color,
    sortOrder: 0,
    createdAt: envIso(envOrdinal++),
  });

  // Transactions — every tx tagged with TAG so the InsightsScreen surfaces a
  // single TagCard whose drilldown contains the full distribution.
  shape.txs.forEach((tx, i) => {
    const cat = CATEGORIES.find((c) => c.key === tx.catKey);
    if (!cat) throw new Error(`Unknown catKey ${tx.catKey} in shape ${shape.id}`);
    const createdAt = `${tx.date}T12:00:${String(i % 60).padStart(2, '0')}.000Z`;
    events.push({
      id: fakeUlid(`EVT${shape.id.toUpperCase()}${String(i).padStart(4, '0')}`),
      type: 'tx.created',
      datasetId,
      actorDeviceId: deviceId,
      createdAt,
      dekVersion: 0,
      version: 1,
      payload: {
        id: fakeUlid(`TX${shape.id.toUpperCase()}${String(i).padStart(4, '0')}`),
        date: tx.date,
        type: tx.type,
        amount: tx.amount,
        currency: 'EUR',
        description: `${shape.id} #${String(i).padStart(3, '0')}`,
        accountId: fakeUlid(ACCOUNT.key),
        categoryId: fakeUlid(cat.key),
        subcategoryId: fakeUlid(`${cat.key}S${tx.subIdx}`),
        tagIds: [fakeUlid(TAG.key)],
        status: 'approved',
        createdAt,
      },
    });
  });

  mkdirSync(join(userDataRoot(), dataDir), { recursive: true });
  // Wipe any prior run's log so re-runs are stable.
  try {
    rmSync(outPath, { force: true });
  } catch {
    /* ignore */
  }
  writeFileSync(outPath, events.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');

  return { dataDir, outPath };
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------
const NAV_PRIMARY = 'nav[aria-label="Primary"]';
// Section 0 of the primary nav: panel | movements | balance | insights.
// Insights is the 4th item.
const INSIGHTS_NAV_BTN = `${NAV_PRIMARY} > div:first-child > ul > li:nth-child(4) > button`;
const TAG_CARD = '.ot-tag-card.ot-tag-card--clickable';
const RANKED_TABLE = '.ot-subcategory-ranked';
const DONUT_ROW = '.ot-insights-detail__donut-row';

async function navigateAndCapture(
  page: Page,
  shapeId: string,
  viewport: 'wide' | 'narrow',
  width: number,
  height: number,
): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('.ot-shell__sidebar', { state: 'visible' });

  await page.click(INSIGHTS_NAV_BTN);
  await page.waitForSelector(TAG_CARD, { state: 'visible', timeout: 30_000 });

  // There is exactly one seeded tag → first card is "Snapshot".
  await page.locator(TAG_CARD).first().click();

  // Wait for the drilldown to finish loading: ranked-table panel present.
  await page.waitForSelector(RANKED_TABLE, { state: 'visible', timeout: 30_000 });
  await page.waitForSelector(DONUT_ROW, { state: 'visible', timeout: 10_000 });
  // Allow a beat for fonts/layout to settle so labels measure correctly.
  await page.waitForTimeout(400);

  // ── Combined screenshot (donut row + ranked tables together) ────────────
  const donut = page.locator(DONUT_ROW);
  const bars = page.locator(RANKED_TABLE);

  // Scroll donut into view, then compute a clip that spans both blocks.
  await donut.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const donutBox = await donut.boundingBox();
  const barsBox = await bars.boundingBox();
  if (donutBox && barsBox) {
    const top = Math.max(0, Math.floor(donutBox.y - 16));
    const bottomEdge = Math.ceil(barsBox.y + barsBox.height + 16);
    const left = Math.max(0, Math.floor(Math.min(donutBox.x, barsBox.x) - 8));
    const right = Math.ceil(Math.max(donutBox.x + donutBox.width, barsBox.x + barsBox.width) + 8);
    const clip = {
      x: left,
      y: top,
      width: Math.min(width - left, right - left),
      // Cap the clip so it never spills past the viewport (Playwright would
      // throw "clip area is out of viewport bounds").
      height: Math.min(height - top, bottomEdge - top),
    };
    await page.screenshot({
      path: join(OUT_DIR, `${shapeId}-${viewport}-full.png`),
      clip,
    });
  } else {
    // Fallback — if either box couldn't be measured, fall back to fullPage.
    await page.screenshot({
      path: join(OUT_DIR, `${shapeId}-${viewport}-full.png`),
      fullPage: true,
    });
  }

  // ── Bars-only close-up ──────────────────────────────────────────────────
  await bars.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await bars.screenshot({
    path: join(OUT_DIR, `${shapeId}-${viewport}-bars.png`),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
const VIEWPORTS = [
  { id: 'wide', width: 1600, height: 1000 },
  { id: 'narrow', width: 900, height: 1100 },
] as const;

test.describe('Insights drilldown — Concept A ranked-tables snapshots', () => {
  test.skip(!RUN_SNAPSHOTS, 'Set OT_SNAPSHOTS=1 to capture insights snapshots.');
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    mkdirSync(OUT_DIR, { recursive: true });
    // Keep the legacy "before" directory in place; the diverging-chart PNGs
    // captured into it before the revert remain the canonical "before" state
    // for the migration PR. We never write into it from this spec post-revert.
    void OUT_DIR_BEFORE;
  });

  for (const shape of SHAPES) {
    for (const vp of VIEWPORTS) {
      test(`${shape.id} dataset @ ${vp.id} (${vp.width}×${vp.height})`, async () => {
        const { dataDir } = writeEventLogForShape(shape);
        let app: ElectronApplication | null = null;
        try {
          app = await electron.launch({
            args: ['.'],
            env: {
              ...process.env,
              OT_DATA_DIR: dataDir,
              // OT_SEED=none so the bootstrap doesn't append the demo events
              // on top of our deterministic dataset.
              OT_SEED: 'none',
            },
          });
          const page = await app.firstWindow();
          await navigateAndCapture(page, shape.id, vp.id, vp.width, vp.height);
        } finally {
          if (app) await app.close();
        }
      });
    }
  }
});
