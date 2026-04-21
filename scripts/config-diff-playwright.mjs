/* eslint-disable no-console */
// Playwright-driven side-by-side capture of the PR#2 prototype vs the current
// app for the three Configuración screens. Prototype runs from a tiny static
// server; the current app renders via Vite dev server, with window.opentreasury
// stubbed so the renderer can boot outside Electron.
//
// Screenshots are written under
// .squad/decisions/inbox/playwright-config-diff/*.png (kept by Scribe; only
// .md files are deleted on archival).

import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.squad', 'decisions', 'inbox', 'playwright-config-diff', 'round4');
fs.mkdirSync(OUT, { recursive: true });

const PROTOTYPE_PORT = 4567;
const PROTOTYPE_DIR = path.join(ROOT, 'prototype');

function serveStatic(port, dir) {
  const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.jsx': 'application/javascript; charset=utf-8', // served as text for Babel
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
  };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const target = url === '/' ? '/OpenTreasury Prototype.html' : url;
    const abs = path.join(dir, target);
    fs.readFile(abs, (err, data) => {
      if (err) {
        res.statusCode = 404;
        res.end('not found: ' + target);
        return;
      }
      res.setHeader('Content-Type', MIME[path.extname(abs).toLowerCase()] ?? 'text/plain');
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

const PROTO_ROUTES = [
  { id: 'cuentas', label: 'Cuentas' },
  { id: 'categorias', label: 'Categorías' },
  { id: 'etiquetas', label: 'Etiquetas' },
];

async function capturePrototype(page, baseUrl) {
  for (const r of PROTO_ROUTES) {
    await page.goto(baseUrl + '/', { waitUntil: 'networkidle' });
    // Babel needs a moment to compile the JSX scripts.
    await page.waitForFunction(() => typeof window.CuentasScreen === 'function', {
      timeout: 10_000,
    });
    // Navigate via sidebar click — prototype uses in-page routing.
    await page.evaluate((id) => {
      const items = Array.from(document.querySelectorAll('.nav-item'));
      const label = { cuentas: 'Cuentas', categorias: 'Categorías', etiquetas: 'Etiquetas' }[id];
      const match = items.find((el) => el.textContent.trim() === label);
      match?.click();
    }, r.id);
    await page.waitForTimeout(400);
    const file = path.join(OUT, `prototype-${r.id}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log('prototype', r.id, '->', path.relative(ROOT, file));
  }
}

const CURRENT_ROUTES = ['cuentas', 'categorias', 'etiquetas'];

async function captureCurrent(page, devUrl) {
  // Seed window.opentreasury with an in-memory mock BEFORE the bundle loads.
  // Data matches prototype so visual parity is testable.
  const mockData = {
    accounts: [
      {
        id: '01H',
        name: 'Unicaja',
        bankName: 'Unicaja Banco',
        currency: 'EUR',
        openingBalance: 18023.06,
        createdAt: '2024-01-01T00:00:00Z',
      },
      {
        id: '02H',
        name: 'Caixa 5315',
        bankName: 'CaixaBank',
        currency: 'EUR',
        openingBalance: -110.56,
        createdAt: '2024-01-01T00:00:00Z',
      },
      {
        id: '03H',
        name: 'PayPal',
        bankName: 'PayPal',
        currency: 'EUR',
        openingBalance: 281.1,
        createdAt: '2024-01-01T00:00:00Z',
      },
    ],
    categories: [
      { id: 'c1', name: 'Actividades', kind: 'expense', createdAt: '2024-01-01T00:00:00Z' },
      { id: 'c2', name: 'Administrativo', kind: 'expense', createdAt: '2024-01-01T00:00:00Z' },
      { id: 'c3', name: 'Cuotas', kind: 'income', createdAt: '2024-01-01T00:00:00Z' },
      { id: 'c4', name: 'Donaciones', kind: 'income', createdAt: '2024-01-01T00:00:00Z' },
      { id: 'c5', name: 'Eventos', kind: 'income', createdAt: '2024-01-01T00:00:00Z' },
      { id: 'c6', name: 'Gastos', kind: 'expense', createdAt: '2024-01-01T00:00:00Z' },
      { id: 'c7', name: 'Subvenciones', kind: 'income', createdAt: '2024-01-01T00:00:00Z' },
      { id: 'c8', name: 'Teaming', kind: 'income', createdAt: '2024-01-01T00:00:00Z' },
    ],
    tags: [
      { id: 't1', name: 'Día Enfermedades Raras', createdAt: '2024-01-01T00:00:00Z' },
      { id: 't2', name: 'Calendarios 2026', createdAt: '2024-01-01T00:00:00Z' },
      { id: 't3', name: 'Gala Benéfica 2026', createdAt: '2024-01-01T00:00:00Z' },
    ],
  };

  await page.addInitScript((data) => {
    const stub = {
      ping: async () => ({ ok: true, ts: Date.now() }),
      panel: {
        getAccounts: async () => ({ accounts: data.accounts }),
        getAccountBalances: async () => ({ balances: [] }),
        getMonthKPIs: async () => ({ totals: { income: 0, expense: 0, net: 0 } }),
        getAccountSparklines: async () => ({ series: [] }),
        queryRecentTransactions: async () => ({ transactions: [] }),
      },
      transaction: {
        create: async () => ({ ok: false, error: { code: 'INTERNAL', message: 'stub' } }),
        update: async () => ({ ok: false, error: { code: 'INTERNAL', message: 'stub' } }),
        delete: async () => ({ ok: false, error: { code: 'INTERNAL', message: 'stub' } }),
        note: {
          add: async () => ({ ok: false, error: 'stub' }),
          list: async () => ({ notes: [] }),
          edit: async () => ({ ok: false, error: 'stub' }),
          delete: async () => ({ ok: false, error: 'stub' }),
        },
      },
      movements: { list: async () => [] },
      accounts: {
        list: async () => ({ accounts: data.accounts }),
        create: async () => ({ ok: false, error: { code: 'INTERNAL', message: 'stub' } }),
      },
      categories: {
        list: async () => ({ categories: data.categories }),
        create: async () => ({ ok: false, error: { code: 'INTERNAL', message: 'stub' } }),
      },
      tags: {
        list: async () => ({ tags: data.tags }),
        create: async () => ({ ok: false, error: { code: 'INTERNAL', message: 'stub' } }),
      },
      import: {
        getPathForFile: () => '',
        stageFile: async () => ({ ok: false }),
        dryRun: async () => ({ ok: false }),
        commit: async () => ({ ok: false }),
        getLastMapping: async () => ({ mapping: null }),
      },
    };
    Object.defineProperty(window, 'opentreasury', { value: stub, writable: false });
  }, mockData);

  for (const id of CURRENT_ROUTES) {
    await page.goto(devUrl, { waitUntil: 'networkidle' });
    // PR#2 parity — each config sub-route is now a top-level sidebar item.
    const label = { cuentas: 'Cuentas', categorias: 'Categorías', etiquetas: 'Etiquetas' }[id];
    await page.evaluate((l) => {
      const btns = Array.from(document.querySelectorAll('.ot-shell__nav-item'));
      const match = btns.find((b) => b.textContent?.trim() === l);
      match?.click();
    }, label);
    await page.waitForTimeout(500);
    const file = path.join(OUT, `current-${id}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log('current', id, '->', path.relative(ROOT, file));
  }
}

async function main() {
  const protoServer = await serveStatic(PROTOTYPE_PORT, PROTOTYPE_DIR);
  console.log('prototype serving at http://localhost:' + PROTOTYPE_PORT);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Prototype capture
  try {
    await capturePrototype(page, `http://localhost:${PROTOTYPE_PORT}`);
  } catch (e) {
    console.error('prototype capture failed:', e.message);
  }

  // Current app capture
  const devUrl = process.env.DEV_URL || 'http://localhost:5173/';
  try {
    await captureCurrent(page, devUrl);
  } catch (e) {
    console.error('current capture failed (dev server not reachable?):', e.message);
  }

  await browser.close();
  protoServer.close();
  console.log('done — screenshots in', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
