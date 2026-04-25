import { test, _electron as electron } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * Evidence-gathering spec for bugs reported on PR #15.
 * This test DOES NOT assert — it only captures evidence (screenshots + data dumps).
 *
 * Reported bugs:
 * 1. Panel + Movements screens: category/subcategory columns show raw ULID-like
 *    strings instead of human names.
 * 2. Saldo → Income-vs-Expense chart: shows text "Sin categoría" in EN locale.
 * 3. Saldo chart: bar heights look not proportional to actual income/expense numbers.
 */

const evidenceDir = path.join(process.cwd(), '.squad', 'evidence');

test.describe('Bug evidence capture (PR #15 follow-up)', () => {
  test('capture evidence for bugs #1, #2, #3', async () => {
    // Build must exist; this spec runs against the built app.
    const mainPath = path.join(process.cwd(), 'dist', 'main', 'index.js');

    // Launch Electron app
    const app = await electron.launch({
      args: [mainPath],
      env: {
        ...process.env,
        NODE_ENV: 'development',
      },
    });

    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Wait for the app to bootstrap (seed ~200 transactions)
    // The seeded data populates on empty log, so first launch should seed.
    // Give it 5 seconds to settle.
    await window.waitForTimeout(5000);

    // --- BUG #1: Panel screen category column ---
    // The app should start on Panel (Dashboard) route by default.
    // Wait for table to load.
    await window.waitForSelector('table', { timeout: 10000 });
    await window.waitForTimeout(1000);

    // Screenshot the Panel table's category column area
    const panelTable = window.locator('table').first();
    await panelTable.screenshot({
      path: path.join(evidenceDir, 'bug1-panel-category.png'),
    });

    // --- BUG #1: Movements screen category column ---
    // Navigate to Movements by clicking the nav item
    const movementsNav = window.locator('button[aria-current], nav button, aside button').filter({
      hasText: /movements|movimientos/i,
    });
    await movementsNav.first().click();
    await window.waitForTimeout(3000);

    // Screenshot the Movements table's category column area
    const movementsTable = window.locator('table').first();
    await movementsTable.screenshot({
      path: path.join(evidenceDir, 'bug1-movements-category.png'),
    });

    // --- BUG #2 & #3: Saldo screen chart ---
    // Navigate to Saldo (balance) by clicking the nav item
    const saldoNav = window.locator('button[aria-current], nav button, aside button').filter({
      hasText: /balance|saldo/i,
    });
    await saldoNav.first().click();
    await window.waitForTimeout(3000);

    // Hover over a chart bar to trigger tooltip (for bug #2)
    // The tooltip may contain "Sin categoría" hardcoded text.
    // First, find a bar group and hover it.
    const chartGroup = window.locator('[data-testid^="gbc-group-"]').first();
    await chartGroup.hover();
    await window.waitForTimeout(500);

    // Screenshot the tooltip region
    const tooltip = window.locator('[data-testid="gbc-tooltip"]');
    if (await tooltip.isVisible()) {
      await tooltip.screenshot({
        path: path.join(evidenceDir, 'bug2-saldo-tooltip.png'),
      });
    } else {
      // If no tooltip, screenshot the whole chart area
      const chart = window.locator('.ot-grouped-bar-chart').first();
      await chart.screenshot({
        path: path.join(evidenceDir, 'bug2-saldo-chart.png'),
      });
    }

    // --- BUG #3: Extract bar heights ---
    // Query all <rect> elements in the chart SVG and dump their heights.
    const rects = await window.locator('svg rect.ot-grouped-bar-chart__bar').all();
    const barData: Array<{ index: number; height: number; class: string }> = [];
    for (let i = 0; i < Math.min(rects.length, 24); i++) {
      const rect = rects[i];
      const height = await rect?.getAttribute('height');
      const className = await rect?.getAttribute('class');
      barData.push({
        index: i,
        height: parseFloat(height ?? '0'),
        class: className ?? '',
      });
    }

    // Dump bar heights to a text file
    const barHeightsDump = `
Saldo Chart Bar Heights Evidence
=================================

Extracted ${barData.length} bars from the chart SVG.

Each month group has 2 bars: current year (--current) and prior year (--prior).
Bar heights should be proportional to the income/expense amounts.

BAR DATA:
${barData.map((b) => `  [${b.index}] height=${b.height.toFixed(2)}px class="${b.class}"`).join('\n')}

If heights look identical or non-proportional (e.g., all ~100-120px despite
varying amounts), this confirms bug #3.
`.trim();

    await fs.writeFile(path.join(evidenceDir, 'bug3-bar-heights.txt'), barHeightsDump, 'utf-8');

    await app.close();
  });
});
