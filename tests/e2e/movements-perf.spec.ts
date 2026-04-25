import { test, expect, _electron as electron } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

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

/** Plain sub-folder name passed to OT_DATA_DIR (must be non-path, non-absolute). */
const DATA_DIR = 'perf-events';

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
// Suite
// ---------------------------------------------------------------------------

test.describe('MovementsScreen mount perf budget', () => {
  /**
   * Seed 5 000 synthetic transactions into the perf-events folder before the
   * suite runs.  The seed script is deterministic (mulberry32 PRNG) so
   * re-running produces byte-identical output — stable across retries.
   */
  test.beforeAll(() => {
    const result = spawnSync(
      'node',
      [path.join('scripts', 'perf-seed.mjs'), '--count=5000', `--dir=${DATA_DIR}`],
      { stdio: 'inherit' },
    );
    if (result.status !== 0) {
      throw new Error(`perf:seed failed with exit code ${String(result.status)}`);
    }
  });

  test(`MovementsScreen mounts in ≤ ${BUDGET_MS} ms (median of ${RUNS} runs)`, async () => {
    const times: number[] = [];

    for (let run = 0; run < RUNS; run++) {
      // Each run launches a fresh Electron process against the seeded dataset.
      // args: ['.'] makes Electron load our package.json so it uses
      // "opentreasury-desktop" as the app name and resolves userData correctly.
      // args: ['dist/main/index.js'] would fall back to app.getName() = "Electron"
      // and write to %APPDATA%\Electron instead of %APPDATA%\opentreasury-desktop.
      const app = await electron.launch({
        args: ['.'],
        env: {
          ...process.env,
          // Point the bootstrap at the pre-seeded perf dataset.
          OT_DATA_DIR: DATA_DIR,
          // Suppress the dev-seed auto-write so the event log stays exactly
          // what perf:seed wrote (avoids a slow append on first launch).
          OT_SEED: 'none',
        },
      });

      try {
        const page = await app.firstWindow();
        await page.waitForLoadState('domcontentloaded');

        // Wait for the app shell nav to be present before measuring.
        await page.waitForSelector('.ot-shell__sidebar', { state: 'visible' });

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
