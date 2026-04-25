import { defineConfig } from '@playwright/test';

/**
 * Playwright configuration for Electron end-to-end tests.
 *
 * Tests live in `tests/e2e/`. Each spec launches its own Electron instance
 * via `_electron.launch({ args: ['.'] })` so Electron picks up our
 * package.json (name → opentreasury-desktop) and resolves userData correctly.
 *
 * Prerequisites:
 *   npm run build          — produces dist/main/index.js + dist/renderer/
 *   npm run build:preload  — produces dist/preload/index.cjs
 *   (vite build already covers all three via vite-plugin-electron)
 *
 * OT_DATA_DIR override:
 *   Each spec passes `OT_DATA_DIR` in its own `electron.launch` env block so
 *   different tests can target different datasets (e.g. perf-events vs the
 *   default dev-events). The config does not set a global default; see each
 *   spec for details.
 *
 * See docs/perf/playwright-gate.md for the perf-budget rationale.
 */
export default defineConfig({
  testDir: './tests/e2e',

  // Three Electron cold-launches at ~40 s each requires headroom well above
  // 120 s.  240 s gives a full third launch plus margin for slow CI runners.
  timeout: 240_000,

  // Electron tests spawn a full OS process per run; concurrency buys nothing
  // and makes timing measurements noisier.  workers: 1 makes this explicit at
  // the config level and protects against a second project being added later.
  fullyParallel: false,
  workers: 1,

  // One retry on CI absorbs cold-start flakiness without hiding real regressions.
  retries: process.env['CI'] ? 1 : 0,

  reporter: [['list'], ['html', { open: 'never' }]],
});
