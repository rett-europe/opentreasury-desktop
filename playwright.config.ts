import { defineConfig } from '@playwright/test';

/**
 * Playwright configuration for Electron end-to-end tests.
 *
 * Tests live in `tests/e2e/`. Each spec launches its own Electron instance
 * via `_electron.launch({ args: ['dist/main/index.js'] })`.
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

  // Electron startup + IPC bootstrap can be slow on cold CI runners.
  timeout: 120_000,

  // Electron tests spawn a full OS process per run; concurrency buys nothing
  // and makes timing measurements noisier.
  fullyParallel: false,

  // One retry on CI absorbs cold-start flakiness without hiding real regressions.
  retries: process.env['CI'] ? 1 : 0,

  reporter: [['list'], ['html', { open: 'never' }]],
});
