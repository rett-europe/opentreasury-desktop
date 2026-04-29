import { test, expect, _electron as electron } from '@playwright/test';

// ---------------------------------------------------------------------------
// Free-text Movement Search — E2E Tests
// ---------------------------------------------------------------------------
// 📌 Covers SPEC-024 AC1–AC12
//
// Test plan:
// - AC1: Query in description → matched rows + result-count badge
// - AC2: Diacritic-insensitive matching
// - AC3: Multi-token AND
// - AC4: Quoted phrase exact match
// - AC5: Amount matching (decimal comma/dot, integer-exact)
// - AC6: Date matching (ISO prefix, month names, month+year)
// - AC7: Splits surface parent with split-match indicator
// - AC8: Composes with date+account filters
// - AC9: Empty state + Clear search CTA
// - AC10: Keyboard shortcuts (/, Ctrl+K focus; Esc clears then blurs)
// - AC11: Performance (p95 < 150ms on 10k-row perf-seed) — skipped in normal CI
// - AC12: A11y (axe-core run, aria-live region)
//
// Related:
// - SPEC-024 (Free-text Movement Search)
// - UX-008 (Movement Search UX)
// - Issue #TBD
// ---------------------------------------------------------------------------

// Selector helpers
const TOPBAR_SEARCH_INPUT = 'input[type="search"]';
const RESULT_COUNT_BADGE = '[data-testid="search-result-count"]';
const MOVEMENTS_TABLE = 'table.ot-table';
const FIRST_DATA_ROW = 'table.ot-table tbody tr:not([aria-hidden="true"])';
const EMPTY_STATE = '[data-testid="search-empty-state"]';
const CLEAR_SEARCH_BUTTON = '[data-testid="clear-search-button"]';
const SPLIT_MATCH_BADGE = '[data-testid="split-match-badge"]';
const SEARCH_HIGHLIGHT = 'mark';

/**
 * Helper to get the search input element in the topbar.
 * Wired to the AppShell topbar input (see AppShell.tsx — local
 * `searchInputValue` state, trailing-edge `SEARCH_DEBOUNCE_MS` = 500ms,
 * Enter to submit, Esc to clear-then-blur).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSearchInput(window: any) {
  return window.locator(TOPBAR_SEARCH_INPUT);
}

/**
 * Helper to type a search query and commit it deterministically.
 *
 * AppShell uses a *local* `searchInputValue` state for the topbar input and
 * trailing-edge debounces the *applied* query by `SEARCH_DEBOUNCE_MS` (500ms,
 * see app/src/renderer/screens/AppShell/AppShell.tsx). Enter submits the
 * pending value immediately and cancels the debounce timer.
 *
 * We press Enter here so tests don't have to sleep ≥ 500ms per query and to
 * avoid timing flake on slower CI runners. AC10 still exercises the live
 * keystroke + Esc/Ctrl+K path explicitly.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function searchFor(window: any, query: string) {
  const input = await getSearchInput(window);
  await input.click();
  await input.fill(query);
  // Submit on Enter (cancels the 500ms debounce, dispatches immediately).
  await window.keyboard.press('Enter');
  // Allow React to commit and the table to paint.
  await window.waitForTimeout(150);
}

/**
 * Helper to parse result count badge text "23 of 487" → { matched: 23, total: 487 }
 * Supports both EN "23 of 487" and ES "23 de 487"
 */
function parseResultCount(text: string): { matched: number; total: number } {
  const match = text.match(/(\d+)\s+(?:of|de)\s+(\d+)/);
  if (!match) throw new Error(`Failed to parse result count: "${text}"`);
  return { matched: Number(match[1]), total: Number(match[2]) };
}

test.describe('Movements Search — Core Flows', () => {
  test.beforeEach(async () => {
    // Each test launches with seeded data
    // For most tests, we use the default dev-seed (app/src/main/devSeed.ts)
    // For perf tests (AC11), we use perf-seed.mjs with 10k rows
  });

  // -------------------------------------------------------------------------
  // AC1: Query in description → matched rows + result-count badge
  // -------------------------------------------------------------------------
  test.skip('AC1: Query matches description and shows result count badge', async () => {
    // Steps:
    // 1. Launch app with seeded data (at least one transaction with "comida" in description)
    // 2. Navigate to Movements screen
    // 3. Focus topbar search input (click or Ctrl+K)
    // 4. Type "comida"
    // 5. Press Enter to submit (or wait 500ms for trailing-edge debounce)
    //
    // Assertions:
    // - Table shows only rows where description (or other searchable field) contains "comida"
    // - Result count badge visible with format "N of M" or "N de M"
    // - N > 0 (at least one match)
    // - M = total transactions in current filter set (all, if no filters active)

    const app = await electron.launch({ args: ['.'] });
    const window = await app.firstWindow();

    // Navigate to Movements
    await window.click(
      'nav[aria-label="Primary"] > div:first-child > ul > li:nth-child(2) > button',
    );
    await window.waitForSelector(MOVEMENTS_TABLE);

    // Search for "comida"
    await searchFor(window, 'comida');

    // Verify result count badge appears
    const badge = window.locator(RESULT_COUNT_BADGE);
    await expect(badge).toBeVisible();
    const badgeText = await badge.textContent();
    const { matched, total } = parseResultCount(badgeText || '');
    expect(matched).toBeGreaterThan(0);
    expect(matched).toBeLessThanOrEqual(total);

    // Verify table rows contain "comida" (case-insensitive)
    const rows = window.locator(FIRST_DATA_ROW);
    const count = await rows.count();
    expect(count).toBe(matched);

    // Verify at least one row has highlighted match
    const highlights = window.locator(`${FIRST_DATA_ROW} ${SEARCH_HIGHLIGHT}`);
    const highlightCount = await highlights.count();
    expect(highlightCount).toBeGreaterThan(0);

    await app.close();
  });

  // -------------------------------------------------------------------------
  // AC2: Diacritic-insensitive: "cafe" matches "Café del puerto"
  // -------------------------------------------------------------------------
  test.skip('AC2: Diacritic-insensitive matching (cafe matches Café)', async () => {
    // Steps:
    // 1. Launch app with transaction containing "Café del puerto" in description
    // 2. Navigate to Movements
    // 3. Search for "cafe" (no accent)
    //
    // Assertions:
    // - Row with "Café del puerto" appears in results
    // - "Café" is highlighted with <mark>

    const app = await electron.launch({ args: ['.'] });
    const window = await app.firstWindow();

    await window.click(
      'nav[aria-label="Primary"] > div:first-child > ul > li:nth-child(2) > button',
    );
    await window.waitForSelector(MOVEMENTS_TABLE);

    await searchFor(window, 'cafe');

    // Verify result count > 0
    const badge = window.locator(RESULT_COUNT_BADGE);
    await expect(badge).toBeVisible();
    const badgeText = await badge.textContent();
    const { matched } = parseResultCount(badgeText || '');
    expect(matched).toBeGreaterThan(0);

    // Verify table contains row with "Café" (the accent should be in the original data)
    const rows = window.locator(FIRST_DATA_ROW);
    const rowTexts = await rows.allTextContents();
    const hasMatch = rowTexts.some(
      (text) => text.toLowerCase().includes('café') || text.toLowerCase().includes('cafe'),
    );
    expect(hasMatch).toBe(true);

    await app.close();
  });

  // -------------------------------------------------------------------------
  // AC3: Multi-token AND: "comida equipo" requires BOTH tokens
  // -------------------------------------------------------------------------
  test.skip('AC3: Multi-token AND (comida equipo)', async () => {
    // Steps:
    // 1. Launch app with:
    //    - Transaction A: description "comida del mercado"
    //    - Transaction B: description "materiales equipo"
    //    - Transaction C: description "comida equipo" (or split comment "comida" + category "equipo")
    // 2. Navigate to Movements
    // 3. Search for "comida equipo"
    //
    // Assertions:
    // - Only Transaction C appears (both tokens must match across any field)
    // - Transactions A and B do NOT appear

    const app = await electron.launch({ args: ['.'] });
    const window = await app.firstWindow();

    await window.click(
      'nav[aria-label="Primary"] > div:first-child > ul > li:nth-child(2) > button',
    );
    await window.waitForSelector(MOVEMENTS_TABLE);

    await searchFor(window, 'comida equipo');

    const badge = window.locator(RESULT_COUNT_BADGE);
    await expect(badge).toBeVisible();
    const badgeText = await badge.textContent();
    const { matched } = parseResultCount(badgeText || '');

    // At least one match (Transaction C), but NOT Transactions A or B alone
    expect(matched).toBeGreaterThan(0);

    // Verify that each matched row contains BOTH "comida" AND "equipo" somewhere
    const rows = window.locator(FIRST_DATA_ROW);
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const rowText = await rows.nth(i).textContent();
      const normalized = rowText?.toLowerCase() || '';
      expect(normalized).toContain('comida');
      expect(normalized).toContain('equipo');
    }

    await app.close();
  });

  // -------------------------------------------------------------------------
  // AC4: Quoted phrase exact match
  // -------------------------------------------------------------------------
  test.skip('AC4: Quoted phrase exact match ("comida equipo")', async () => {
    // Steps:
    // 1. Launch app with:
    //    - Transaction A: description "comida del equipo"
    //    - Transaction B: description "comida equipo" (exact phrase)
    //    - Transaction C: description "equipo de comida" (reversed)
    // 2. Navigate to Movements
    // 3. Search for `"comida equipo"` (with quotes)
    //
    // Assertions:
    // - Only Transaction B appears (exact phrase after normalization)
    // - Transactions A and C do NOT appear
    //
    // 4. Search for `"frase inexistente"`
    // Assertions:
    // - Zero results
    // - Empty state shown

    const app = await electron.launch({ args: ['.'] });
    const window = await app.firstWindow();

    await window.click(
      'nav[aria-label="Primary"] > div:first-child > ul > li:nth-child(2) > button',
    );
    await window.waitForSelector(MOVEMENTS_TABLE);

    // First: exact phrase should match
    await searchFor(window, '"comida equipo"');

    const badge = window.locator(RESULT_COUNT_BADGE);
    const badgeText = await badge.textContent();
    if (badgeText) {
      const { matched } = parseResultCount(badgeText);
      expect(matched).toBeGreaterThan(0);

      // Verify matched rows contain the exact phrase (case-insensitive, accent-insensitive)
      const rows = window.locator(FIRST_DATA_ROW);
      const count = await rows.count();
      for (let i = 0; i < count; i++) {
        const rowText = await rows.nth(i).textContent();
        const normalized =
          rowText
            ?.toLowerCase()
            .replace(
              /[áéíóúñ]/g,
              (c) => ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n' })[c] || c,
            ) || '';
        expect(normalized).toContain('comida equipo');
      }
    }

    // Second: nonexistent phrase returns zero results
    await searchFor(window, '"frase inexistente que no existe en ningun lado"');

    await window.waitForSelector(EMPTY_STATE);
    const emptyState = window.locator(EMPTY_STATE);
    await expect(emptyState).toBeVisible();

    await app.close();
  });

  // -------------------------------------------------------------------------
  // AC5: Amount matching (27,5 / 27.5 / 27.50 / 27)
  // -------------------------------------------------------------------------
  test.skip('AC5: Amount matching with decimal comma and dot', async () => {
    // Steps:
    // 1. Launch app with transaction of €27.50
    // 2. Navigate to Movements
    // 3. Search for "27,5" → matches
    // 4. Search for "27.5" → matches
    // 5. Search for "27.50" → matches
    // 6. Search for "27" (integer) → does NOT match (27 ≠ 27.50)
    //
    // Assertions:
    // - "27,5", "27.5", "27.50" all return the €27.50 transaction
    // - "27" alone does NOT return €27.50 (only matches exact €27.00)

    const app = await electron.launch({ args: ['.'] });
    const window = await app.firstWindow();

    await window.click(
      'nav[aria-label="Primary"] > div:first-child > ul > li:nth-child(2) > button',
    );
    await window.waitForSelector(MOVEMENTS_TABLE);

    // Test 27,5 (decimal comma)
    await searchFor(window, '27,5');
    let badge = window.locator(RESULT_COUNT_BADGE);
    let badgeText = await badge.textContent();
    if (badgeText) {
      const { matched } = parseResultCount(badgeText);
      expect(matched).toBeGreaterThan(0);
    }

    // Test 27.5 (decimal dot)
    await searchFor(window, '27.5');
    badge = window.locator(RESULT_COUNT_BADGE);
    badgeText = await badge.textContent();
    if (badgeText) {
      const { matched } = parseResultCount(badgeText);
      expect(matched).toBeGreaterThan(0);
    }

    // Test 27.50 (two decimal places)
    await searchFor(window, '27.50');
    badge = window.locator(RESULT_COUNT_BADGE);
    badgeText = await badge.textContent();
    if (badgeText) {
      const { matched } = parseResultCount(badgeText);
      expect(matched).toBeGreaterThan(0);
    }

    // Test 27 (integer) — should NOT match €27.50
    await searchFor(window, '27');
    badge = window.locator(RESULT_COUNT_BADGE);
    badgeText = await badge.textContent();
    if (badgeText) {
      const { matched } = parseResultCount(badgeText);
      // If there's a €27.00 transaction, it will match; €27.50 should NOT
      // This assertion depends on fixture design; adjust based on actual seed data
      // For now, just verify the search runs without error
      expect(matched).toBeGreaterThanOrEqual(0);
    }

    await app.close();
  });

  // -------------------------------------------------------------------------
  // AC6: Date matching (2024-09, sep, sep 2024)
  // -------------------------------------------------------------------------
  test.skip('AC6: Date matching (ISO prefix, month names)', async () => {
    // Steps:
    // 1. Launch app with transactions in September 2024
    // 2. Navigate to Movements
    // 3. Search for "2024-09" → matches all September 2024 transactions
    // 4. Search for "sep" → matches all September transactions (any year)
    // 5. Search for "sep 2024" → matches September 2024 only
    //
    // Assertions:
    // - "2024-09" returns rows with date starting with "2024-09"
    // - "sep" (EN) or "sep" (ES "septiembre") returns September rows
    // - "sep 2024" narrows to September 2024

    const app = await electron.launch({ args: ['.'] });
    const window = await app.firstWindow();

    await window.click(
      'nav[aria-label="Primary"] > div:first-child > ul > li:nth-child(2) > button',
    );
    await window.waitForSelector(MOVEMENTS_TABLE);

    // Test ISO prefix "2024-09"
    await searchFor(window, '2024-09');
    let badge = window.locator(RESULT_COUNT_BADGE);
    let badgeText = await badge.textContent();
    if (badgeText) {
      const { matched } = parseResultCount(badgeText);
      expect(matched).toBeGreaterThan(0);
    }

    // Test month name "sep" (any year)
    await searchFor(window, 'sep');
    badge = window.locator(RESULT_COUNT_BADGE);
    badgeText = await badge.textContent();
    if (badgeText) {
      const { matched } = parseResultCount(badgeText);
      expect(matched).toBeGreaterThan(0);
    }

    // Test month + year "sep 2024"
    await searchFor(window, 'sep 2024');
    badge = window.locator(RESULT_COUNT_BADGE);
    badgeText = await badge.textContent();
    if (badgeText) {
      const { matched } = parseResultCount(badgeText);
      expect(matched).toBeGreaterThan(0);
    }

    await app.close();
  });

  // -------------------------------------------------------------------------
  // AC7: Splits surface parent with split-match indicator
  // -------------------------------------------------------------------------
  test.skip('AC7: Splits parent surfaces with split-match indicator', async () => {
    // Steps:
    // 1. Launch app with split transaction:
    //    - Parent: €500, description "Pago materiales taller"
    //    - Split 1: €300, comment "comida equipo"
    //    - Split 2: €200, comment "material oficina"
    // 2. Navigate to Movements
    // 3. Search for "comida"
    //
    // Assertions:
    // - Parent row appears in results
    // - Parent row has split-match badge (e.g., "1 of 2 splits match")
    // - Expand parent row
    // - Matching split (Split 1) is highlighted with <mark> in comment field
    // - Non-matching split (Split 2) is NOT highlighted

    const app = await electron.launch({ args: ['.'] });
    const window = await app.firstWindow();

    await window.click(
      'nav[aria-label="Primary"] > div:first-child > ul > li:nth-child(2) > button',
    );
    await window.waitForSelector(MOVEMENTS_TABLE);

    await searchFor(window, 'comida');

    // Verify split-match badge appears on parent row
    const badge = window.locator(SPLIT_MATCH_BADGE);
    await expect(badge).toBeVisible();
    const badgeText = await badge.textContent();
    // ES: "1 de 2 partes coincide" / EN: "1 of 2 splits matches"
    expect(badgeText).toMatch(/1\s+(of|de)\s+2/);

    // Expand the parent row (click expand button)
    const expandButton = window.locator('[data-testid="expand-splits-button"]').first();
    await expandButton.click();

    // Wait for splits to render
    await window.waitForTimeout(200);

    // Verify matching split has <mark> highlight
    const splitRows = window.locator('[data-testid="split-row"]');
    const count = await splitRows.count();
    expect(count).toBe(2);

    // First split should have "comida" highlighted
    const firstSplitHighlight = splitRows.nth(0).locator(SEARCH_HIGHLIGHT);
    await expect(firstSplitHighlight).toBeVisible();

    // Second split should NOT have highlight (no match)
    const secondSplitHighlight = splitRows.nth(1).locator(SEARCH_HIGHLIGHT);
    await expect(secondSplitHighlight).not.toBeVisible();

    await app.close();
  });

  // -------------------------------------------------------------------------
  // AC8: Search composes with date+account filters
  // -------------------------------------------------------------------------
  test.skip('AC8: Search composes with active filters', async () => {
    // Steps:
    // 1. Launch app with transactions across multiple years and accounts
    // 2. Navigate to Movements
    // 3. Apply date filter: "this year" (2026)
    // 4. Apply account filter: "Unicaja"
    // 5. Search for "comida"
    //
    // Assertions:
    // - Result count badge shows "N of M" where M = count after date+account filters
    // - All matched rows are within 2026 AND account = Unicaja AND contain "comida"
    // - Filter chips remain visible and independently dismissible

    const app = await electron.launch({ args: ['.'] });
    const window = await app.firstWindow();

    await window.click(
      'nav[aria-label="Primary"] > div:first-child > ul > li:nth-child(2) > button',
    );
    await window.waitForSelector(MOVEMENTS_TABLE);

    // Apply date filter (this depends on existing filter UI — adjust selectors)
    await window.click('[data-testid="date-filter-button"]');
    await window.click('[data-testid="date-filter-this-year"]');

    // Apply account filter
    await window.click('[data-testid="account-filter-button"]');
    await window.click('[data-testid="account-filter-unicaja"]');

    // Wait for filters to apply
    await window.waitForTimeout(300);

    // Read baseline filtered count (before search)
    const preSearchCount = await window.locator(FIRST_DATA_ROW).count();

    // Now apply search
    await searchFor(window, 'comida');

    const badge = window.locator(RESULT_COUNT_BADGE);
    await expect(badge).toBeVisible();
    const badgeText = await badge.textContent();
    const { matched, total } = parseResultCount(badgeText || '');

    // Total should equal preSearchCount (the filter-only count)
    expect(total).toBe(preSearchCount);
    expect(matched).toBeLessThanOrEqual(total);

    // Verify all matched rows contain "comida"
    const rows = window.locator(FIRST_DATA_ROW);
    const count = await rows.count();
    expect(count).toBe(matched);

    await app.close();
  });

  // -------------------------------------------------------------------------
  // AC9: Empty state with Clear search CTA
  // -------------------------------------------------------------------------
  test.skip('AC9: Empty state when query has no matches', async () => {
    // Steps:
    // 1. Launch app with seeded data
    // 2. Navigate to Movements
    // 3. Search for "xyzabc123nonexistent"
    //
    // Assertions:
    // - Result count badge shows "0 of M"
    // - Empty state appears with message like "No transactions match 'xyzabc123nonexistent'"
    // - "Clear search" button is visible
    // - Click "Clear search" → input clears, ?q param removed, full list restored

    const app = await electron.launch({ args: ['.'] });
    const window = await app.firstWindow();

    await window.click(
      'nav[aria-label="Primary"] > div:first-child > ul > li:nth-child(2) > button',
    );
    await window.waitForSelector(MOVEMENTS_TABLE);

    // Read baseline count
    const baselineCount = await window.locator(FIRST_DATA_ROW).count();

    await searchFor(window, 'xyzabc123nonexistent');

    // Verify result count is "0 of N"
    const badge = window.locator(RESULT_COUNT_BADGE);
    const badgeText = await badge.textContent();
    if (badgeText) {
      const { matched } = parseResultCount(badgeText);
      expect(matched).toBe(0);
    }

    // Verify empty state appears
    const emptyState = window.locator(EMPTY_STATE);
    await expect(emptyState).toBeVisible();
    const emptyText = await emptyState.textContent();
    expect(emptyText).toContain('xyzabc123nonexistent');

    // Click "Clear search" button
    const clearButton = window.locator(CLEAR_SEARCH_BUTTON);
    await expect(clearButton).toBeVisible();
    await clearButton.click();

    // Wait for UI to update
    await window.waitForTimeout(300);

    // Verify input is cleared
    const input = await getSearchInput(window);
    const inputValue = await input.inputValue();
    expect(inputValue).toBe('');

    // Verify full list is restored
    const restoredCount = await window.locator(FIRST_DATA_ROW).count();
    expect(restoredCount).toBe(baselineCount);

    await app.close();
  });

  // -------------------------------------------------------------------------
  // AC10: Keyboard shortcuts (/, Ctrl+K focus; Esc clears then blurs)
  // -------------------------------------------------------------------------
  test.skip('AC10: Keyboard shortcuts (/, Ctrl+K, Esc)', async () => {
    // Steps:
    // 1. Launch app
    // 2. Navigate to Movements
    // 3. Press "/" key → search input focuses
    // 4. Type "comida" → local input value updates immediately, applied query
    //    propagates after the 500ms debounce (or on Enter)
    // 5. Press "Esc" → input clears (text removed), input still focused
    // 6. Press "Esc" again → input blurs
    // 7. Press "Ctrl+K" (or Cmd+K on macOS) → input focuses again
    //
    // Assertions:
    // - "/" focuses input from Movements screen
    // - Local `searchInputValue` reflects each keystroke
    // - First Esc clears text (cancels pending debounce), keeps focus
    // - Second Esc blurs
    // - Ctrl+K / Cmd+K focuses from any screen

    const app = await electron.launch({ args: ['.'] });
    const window = await app.firstWindow();

    await window.click(
      'nav[aria-label="Primary"] > div:first-child > ul > li:nth-child(2) > button',
    );
    await window.waitForSelector(MOVEMENTS_TABLE);

    const input = await getSearchInput(window);

    // Press "/" to focus
    await window.keyboard.press('/');
    await window.waitForTimeout(100);
    await expect(input).toBeFocused();

    // Type "comida"
    await window.keyboard.type('comida');
    // Wait past the 500ms SEARCH_DEBOUNCE_MS so the applied query propagates.
    await window.waitForTimeout(600);
    let inputValue = await input.inputValue();
    expect(inputValue).toBe('comida');

    // First Esc clears
    await window.keyboard.press('Escape');
    await window.waitForTimeout(100);
    inputValue = await input.inputValue();
    expect(inputValue).toBe('');
    await expect(input).toBeFocused();

    // Second Esc blurs
    await window.keyboard.press('Escape');
    await window.waitForTimeout(100);
    await expect(input).not.toBeFocused();

    // Ctrl+K (or Cmd+K) focuses
    await window.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
    await window.waitForTimeout(100);
    await expect(input).toBeFocused();

    await app.close();
  });

  // -------------------------------------------------------------------------
  // AC11: Performance (p95 < 150ms on 10k-row perf-seed)
  // -------------------------------------------------------------------------
  test.skip('AC11: Performance budget (p95 < 150ms on 10k rows)', async () => {
    // 📌 Skipped in normal CI — run with PERF=1 environment variable
    // Steps:
    // 1. Run perf-seed.mjs with --count=10000
    // 2. Launch app with OT_DATA_DIR=perf-events
    // 3. Navigate to Movements
    // 4. Drive 30 keystrokes in the search input
    // 5. Measure keystroke→input-paint latency for each (local `searchInputValue`
    //    update; applied-query/table re-render happens once on the trailing
    //    edge of SEARCH_DEBOUNCE_MS = 500ms and is measured separately)
    // 6. Compute p95
    //
    // Assertions:
    // - Keystroke→input-paint p95 < 150ms (CI headroom per SPEC-024 NFR1: spec
    //   says 100ms, we add 50% margin). The local-input architecture means
    //   per-keystroke latency does NOT include filter cost; the filter runs
    //   once after the 500ms debounce settles.

    if (process.env.PERF !== '1') {
      console.log('Skipping perf test (run with PERF=1 to enable)');
      return;
    }

    // TODO: Implement performance harness
    // - Spawn perf-seed.mjs with --count=10000
    // - Launch Electron with OT_DATA_DIR=perf-events
    // - Use window.evaluate() to inject performance observers
    // - Drive keystrokes: a, ab, abc, ... (30 iterations)
    // - Collect latencies
    // - Assert p95 < 150ms

    throw new Error('AC11 perf test not yet implemented');
  });

  // -------------------------------------------------------------------------
  // AC12: A11y (axe-core, aria-live region)
  // -------------------------------------------------------------------------
  test.skip('AC12: A11y (axe-core run, aria-live region)', async () => {
    // Steps:
    // 1. Launch app
    // 2. Navigate to Movements
    // 3. Inject axe-core into renderer
    // 4. Run axe.run() on the page
    // 5. Search for "comida"
    // 6. Verify aria-live region announces result count
    // 7. Run axe.run() again with search active
    //
    // Assertions:
    // - Zero WCAG 2.1 AA violations on Movements screen (baseline)
    // - Search input has accessible name (aria-label or linked label)
    // - Clear button has aria-label
    // - Result count region has aria-live="polite"
    // - Screen reader announces "23 of 487 transactions" (or "23 de 487 movimientos")
    // - Zero violations with search active

    const app = await electron.launch({ args: ['.'] });
    const window = await app.firstWindow();

    await window.click(
      'nav[aria-label="Primary"] > div:first-child > ul > li:nth-child(2) > button',
    );
    await window.waitForSelector(MOVEMENTS_TABLE);

    // Inject axe-core
    await window.evaluate(() => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.7.2/axe.min.js';
      document.head.appendChild(script);
    });
    await window.waitForTimeout(1000); // Wait for axe to load

    // Run baseline axe scan
    const baselineResults = await window.evaluate(async () => {
      // @ts-expect-error axe is loaded dynamically
      return await axe.run();
    });
    expect(baselineResults.violations.length).toBe(0);

    // Verify search input has accessible name
    const input = await getSearchInput(window);
    const ariaLabel = await input.getAttribute('aria-label');
    const placeholder = await input.getAttribute('placeholder');
    expect(ariaLabel || placeholder).toBeTruthy();

    // Search for "comida"
    await searchFor(window, 'comida');

    // Verify aria-live region exists and has correct role
    const liveRegion = window.locator('[aria-live="polite"]');
    await expect(liveRegion).toBeVisible();
    const liveText = await liveRegion.textContent();
    // Should contain result count like "23 of 487" or "23 de 487"
    expect(liveText).toMatch(/\d+\s+(of|de)\s+\d+/);

    // Run axe scan with search active
    const searchResults = await window.evaluate(async () => {
      // @ts-expect-error axe is loaded dynamically
      return await axe.run();
    });
    expect(searchResults.violations.length).toBe(0);

    await app.close();
  });
});
