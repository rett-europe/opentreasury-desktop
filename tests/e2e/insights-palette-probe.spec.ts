import { test, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Palette P1 diagnostic probe for PR #142.
 *
 * Captures computed CSS custom property values and SVG stroke attributes
 * on the Insights Detail screen to diagnose whether Palette P1 is
 * actually rendering at runtime. Also captures a donut-only screenshot.
 *
 * Run manually:
 *     $env:OT_SNAPSHOTS=1; npx playwright test tests/e2e/insights-palette-probe.spec.ts
 */

const RUN = process.env['OT_SNAPSHOTS'] === '1';
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const OUT_DIR = join(REPO_ROOT, 'docs', 'ux', 'insights-diag-20260429');

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

function fakeUlid(seedKey: string): string {
  const upper = String(seedKey)
    .toUpperCase()
    .replace(/[^0-9A-HJKMNP-TV-Z]/g, '0');
  return (upper + '0'.repeat(26)).slice(0, 26);
}

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
  {
    key: 'CATSUB',
    name: 'Subvenciones',
    type: 'income' as const,
    subs: ['Públicas', 'Privadas'],
  },
];

const ACCOUNT = { key: 'ACCSCN', bankName: 'Unicaja Banco', label: 'Snapshot' };
const TAG = { key: 'TAGPRB', name: 'PaletteProbe', color: 'oklch(0.78 0.10 280)' };

type TxSpec = {
  readonly catKey: string;
  readonly subIdx: number;
  readonly type: 'expense' | 'income';
  readonly amount: number;
  readonly date: string;
};

const TXS: ReadonlyArray<TxSpec> = [
  { catKey: 'CATGAS', subIdx: 0, type: 'expense', amount: 1200, date: '2026-01-05' },
  { catKey: 'CATGAS', subIdx: 1, type: 'expense', amount: 380, date: '2026-01-12' },
  { catKey: 'CATGAS', subIdx: 2, type: 'expense', amount: 220, date: '2026-02-03' },
  { catKey: 'CATADM', subIdx: 0, type: 'expense', amount: 140, date: '2026-02-18' },
  { catKey: 'CATADM', subIdx: 1, type: 'expense', amount: 540, date: '2026-03-04' },
  { catKey: 'CATACT', subIdx: 0, type: 'expense', amount: 460, date: '2026-03-15' },
  { catKey: 'CATCUO', subIdx: 0, type: 'income', amount: 800, date: '2026-01-08' },
  { catKey: 'CATCUO', subIdx: 1, type: 'income', amount: 240, date: '2026-01-20' },
  { catKey: 'CATDON', subIdx: 0, type: 'income', amount: 650, date: '2026-02-02' },
  { catKey: 'CATDON', subIdx: 1, type: 'income', amount: 1400, date: '2026-02-14' },
  { catKey: 'CATEVT', subIdx: 0, type: 'income', amount: 420, date: '2026-03-01' },
  { catKey: 'CATSUB', subIdx: 0, type: 'income', amount: 980, date: '2026-03-22' },
];

function writeEventLog(): { dataDir: string } {
  const dataDir = 'ux-palette-probe';
  const outPath = join(userDataRoot(), dataDir, 'events.ndjson');
  const events: Array<Record<string, unknown>> = [];
  let ord = 0;
  const baseTs = Date.parse('2026-01-01T08:00:00.000Z');
  const iso = (off: number): string => new Date(baseTs + off * 60_000).toISOString();
  const datasetId = fakeUlid('DATPRB');
  const deviceId = fakeUlid('DEVPRB');

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
    createdAt: iso(ord++),
  });

  for (const cat of CATEGORIES) {
    const catId = fakeUlid(cat.key);
    events.push({
      type: 'CategoryCreated',
      id: catId,
      name: cat.name,
      kind: cat.type,
      sortOrder: CATEGORIES.indexOf(cat),
      createdAt: iso(ord++),
    });
    cat.subs.forEach((subName, i) => {
      events.push({
        type: 'SubcategoryCreated',
        id: fakeUlid(`${cat.key}S${i}`),
        parentCategoryId: catId,
        name: subName,
        createdAt: iso(ord++),
      });
    });
  }

  events.push({
    type: 'TagCreated',
    id: fakeUlid(TAG.key),
    name: TAG.name,
    color: TAG.color,
    sortOrder: 0,
    createdAt: iso(ord++),
  });

  TXS.forEach((tx, i) => {
    const cat = CATEGORIES.find((c) => c.key === tx.catKey)!;
    const createdAt = `${tx.date}T12:00:${String(i % 60).padStart(2, '0')}.000Z`;
    events.push({
      id: fakeUlid(`EVTPRB${String(i).padStart(4, '0')}`),
      type: 'tx.created',
      datasetId,
      actorDeviceId: deviceId,
      createdAt,
      dekVersion: 0,
      version: 1,
      payload: {
        id: fakeUlid(`TXPRB${String(i).padStart(4, '0')}`),
        date: tx.date,
        type: tx.type,
        amount: tx.amount,
        currency: 'EUR',
        description: `probe #${String(i).padStart(3, '0')}`,
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
  writeFileSync(outPath, events.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
  return { dataDir };
}

const NAV_PRIMARY = 'nav[aria-label="Primary"]';
const INSIGHTS_NAV_BTN = `${NAV_PRIMARY} > div:first-child > ul > li:nth-child(4) > button`;
const TAG_CARD = '.ot-tag-card.ot-tag-card--clickable';
const RANKED_TABLE = '.ot-subcategory-ranked';
const DONUT_ROW = '.ot-insights-detail__donut-row';

test.describe('Palette P1 diagnostic probe', () => {
  test.skip(!RUN, 'Set OT_SNAPSHOTS=1 to run palette probe.');

  test('capture computed tokens + donut strokes on Insights Detail', async () => {
    const { dataDir } = writeEventLog();
    let app: ElectronApplication | null = null;
    try {
      app = await electron.launch({
        args: ['.'],
        env: { ...process.env, OT_DATA_DIR: dataDir, OT_SEED: 'none' },
      });
      const page = await app.firstWindow();
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.waitForLoadState('domcontentloaded');
      await page.waitForSelector('.ot-shell__sidebar', { state: 'visible' });

      // Navigate to Insights → Detail
      await page.click(INSIGHTS_NAV_BTN);
      await page.waitForSelector(TAG_CARD, { state: 'visible', timeout: 30_000 });
      await page.locator(TAG_CARD).first().click();
      await page.waitForSelector(RANKED_TABLE, { state: 'visible', timeout: 30_000 });
      await page.waitForSelector(DONUT_ROW, { state: 'visible', timeout: 10_000 });
      await page.waitForTimeout(500);

      // 1. Computed token values from the .ot-insights-detail container
      const computedTokens = await page.evaluate(() => {
        const detail = document.querySelector('.ot-insights-detail');
        const root = document.documentElement;

        const getVar = (el: Element | null, name: string) =>
          el ? getComputedStyle(el).getPropertyValue(name).trim() : '';

        const tokens: Record<string, string> = {};
        for (let i = 0; i <= 7; i++) {
          tokens[`--color-donut-${i} (on .ot-insights-detail)`] = getVar(
            detail,
            `--color-donut-${i}`,
          );
          tokens[`--color-donut-${i} (on :root)`] = getVar(root, `--color-donut-${i}`);
        }
        tokens['--color-donut-otras (on .ot-insights-detail)'] = getVar(
          detail,
          '--color-donut-otras',
        );
        tokens['--color-donut-otras (on :root)'] = getVar(root, '--color-donut-otras');
        return tokens;
      });

      // 2. SVG circle stroke values
      const circleStrokes = await page.evaluate(() => {
        const circles = Array.from(document.querySelectorAll('.ot-donut-chart__segment'));
        return circles.map((c, i) => ({
          index: i,
          strokeAttr: c.getAttribute('stroke') ?? '',
          computedStroke: getComputedStyle(c).stroke,
        }));
      });

      // 3. Cross-check: are strokes CSS var references or resolved?
      const crossCheck = circleStrokes.map((c) => ({
        ...c,
        isCssVar: c.strokeAttr.startsWith('var('),
        isResolved: !c.strokeAttr.startsWith('var('),
      }));

      const diagnostics = {
        timestamp: new Date().toISOString(),
        probe: 'insights-palette-probe',
        branch: 'squad/trinity-subcategory-ranked-tables',
        phase: 'post-fix (screen-scoped P1)',
        computedTokens,
        circleStrokes: crossCheck,
        verdict: {
          p1OnDetail: computedTokens['--color-donut-3 (on .ot-insights-detail)'],
          p1OnRoot: computedTokens['--color-donut-3 (on :root)'],
          p1Expected: 'oklch(0.78 0.16 95)',
          detailHasP1: computedTokens['--color-donut-3 (on .ot-insights-detail)'].includes('0.78'),
          rootIsEmpty:
            computedTokens['--color-donut-3 (on :root)'] === '' ||
            computedTokens['--color-donut-3 (on :root)'] === undefined,
        },
      };

      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(
        join(OUT_DIR, 'computed-tokens.json'),
        JSON.stringify(diagnostics, null, 2) + '\n',
        'utf8',
      );

      // 4. Screenshot: donut only
      const donut = page.locator(DONUT_ROW);
      await donut.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await donut.screenshot({ path: join(OUT_DIR, 'donut-only.png') });

      // 5. Full page screenshot
      await page.screenshot({ path: join(OUT_DIR, 'fullpage.png'), fullPage: true });

      console.log('[probe] Diagnostics written to', OUT_DIR);
      console.log('[probe] Verdict:', JSON.stringify(diagnostics.verdict, null, 2));
    } finally {
      if (app) await app.close();
    }
  });

  test('verify tokens do NOT leak to non-insights screen', async () => {
    const { dataDir } = writeEventLog();
    let app: ElectronApplication | null = null;
    try {
      app = await electron.launch({
        args: ['.'],
        env: { ...process.env, OT_DATA_DIR: dataDir, OT_SEED: 'none' },
      });
      const page = await app.firstWindow();
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.waitForLoadState('domcontentloaded');
      await page.waitForSelector('.ot-shell__sidebar', { state: 'visible' });

      // Stay on the default screen (Panel/Movements) — NOT Insights Detail.
      // Verify --color-donut-3 is NOT defined on :root.
      const rootDonut3 = await page.evaluate(() => {
        return getComputedStyle(document.documentElement)
          .getPropertyValue('--color-donut-3')
          .trim();
      });

      const result = {
        screen: 'non-insights (default)',
        '--color-donut-3 on :root': rootDonut3,
        isLeaking: rootDonut3 !== '',
      };

      writeFileSync(
        join(OUT_DIR, 'non-insights-check.json'),
        JSON.stringify(result, null, 2) + '\n',
        'utf8',
      );

      console.log('[probe] Non-insights check:', JSON.stringify(result, null, 2));
    } finally {
      if (app) await app.close();
    }
  });
});
