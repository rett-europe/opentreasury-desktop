import { test, expect, _electron as electron } from '@playwright/test';

// ---------------------------------------------------------------------------
// Export (CSV / XLSX) — E2E spec — SPEC-027
// ---------------------------------------------------------------------------
// Drives the packaged Electron binary (`npm run build` first; dist/main/index.cjs
// must exist) and exercises the export flow through the renderer + the
// `window.opentreasury.export` preload bridge (prepare / run / reveal /
// onProgress), mirroring the IPC-driven pattern in `readonly-mode.spec.ts`.
//
// Coverage (per SPEC-027 §10 acceptance criteria + the kickoff brief):
//   - HP   happy path: filtered CSV export writes a real file
//   - HP   happy path: filtered XLSX export writes a real .xlsx
//   - GATE mandatory-filter gating (FR23/AC18): unfiltered / date-only blocked
//   - SEC  encrypted-workspace hard-block (FR14): EXPORT_DEST_INSIDE_WORKSPACE
//   - SEC  rate-limit (FR24): 4th export in 15 min → EXPORT_RATE_LIMITED
//   - SEC  lockout (FR25): 5 confirmation mistypes → EXPORT_LOCKED_OUT (5 min)
//   - FMT  CSV uses `;` separator + UTF-8 BOM + CRLF (FR9/FR10)
//   - FMT  XLSX single-sheet output opens as a valid workbook (FR11)
//
// 📌 Most cases are authored as `test.skip` because driving them end-to-end
//    requires two harness seams that are NOT yet wired for E2E (tracked):
//      1. An UNLOCKED encrypted workspace in the launched binary — export needs
//         `getActiveWorkspace()` to return an in-memory master key. Unlike the
//         plaintext `dataDir` path used by readonly-mode.spec.ts, this requires
//         creating + unlocking a real `.treasury` workspace via the
//         workspace:create / workspace:unlock IPC (or an `OT_SEED`-style seam).
//      2. A STUBBED OS save dialog — `export:run` calls the native
//         `dialog.showSaveDialog`, which Playwright cannot drive. The handler
//         already injects `showSaveDialog` for unit/integration tests; expose
//         the same seam to the packaged binary behind an env flag
//         (e.g. `OT_E2E_EXPORT_DEST=<dir>`) so the dialog resolves to a
//         test-controlled path without user interaction.
//
//    The full prepare→run pipeline (happy path, gating, hard-block, rate-limit,
//    lockout, CSV `;`, xlsx) is already covered with real crypto + the real
//    handler in `app/src/main/ipc/handlers/export.integration.test.ts`; these
//    E2E cases validate the same behaviour through the packaged renderer once
//    the two seams land.
//
// Related: SPEC-027 (docs/specs/027-export.md), UX spec
// (docs/ux/specs/spec-027-export.md), crypto-spec §8 audit, Issue #351.
// ---------------------------------------------------------------------------

test.describe('Export (CSV/XLSX) — packaged binary boot', () => {
  // This one DOES run: it proves the export feature is wired into the packaged
  // app — the Export nav entry renders and the preload bridge is exposed.
  test('Export nav entry is present and the export bridge is exposed', async () => {
    const app = await electron.launch({
      args: ['.'],
      env: { ...process.env, OT_SEED: 'none' },
    });
    try {
      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');

      // Preload bridge surface check — prepare/run/reveal/onProgress exist.
      const bridge = await page.evaluate(() => {
        // @ts-expect-error — preload exposes window.opentreasury
        const e = window.opentreasury?.export;
        return {
          hasPrepare: typeof e?.prepare === 'function',
          hasRun: typeof e?.run === 'function',
          hasReveal: typeof e?.reveal === 'function',
          hasOnProgress: typeof e?.onProgress === 'function',
        };
      });
      expect(bridge.hasPrepare).toBe(true);
      expect(bridge.hasRun).toBe(true);
      expect(bridge.hasReveal).toBe(true);
      expect(bridge.hasOnProgress).toBe(true);

      await app.close();
    } catch (err) {
      await app.close();
      throw err;
    }
  });

  // -------------------------------------------------------------------------
  // Mandatory-filter gating (FR23 / AC18) — can be driven at the IPC boundary
  // without the save dialog, because `prepare` rejects BEFORE showing it.
  // 📌 Skipped pending the unlocked-workspace harness seam (see header note 1).
  // -------------------------------------------------------------------------
  test.skip('GATE-01: date-only request is rejected with EXPORT_MIN_FILTERS', async () => {
    // Steps:
    // 1. Launch the binary with a seeded + unlocked workspace (1+ accounts/tx).
    // 2. await window.opentreasury.export.prepare({
    //      format: 'csv', locale: 'es',
    //      filters: { dateFrom: '2025-01-01', dateTo: '2025-12-31' } })
    //
    // Assertions:
    // - result.ok === false
    // - result.code === 'EXPORT_MIN_FILTERS'  (no save dialog was shown)
  });

  test.skip('GATE-02: Export button is aria-disabled until date + 1 filter set', async () => {
    // Steps (renderer-level, ux-006 app-shell):
    // 1. Navigate to /export (Export nav entry).
    // 2. Screen starts empty (date-range-first) — Export button aria-disabled.
    // 3. Pick a date range only → button still aria-disabled, accessible hint
    //    visible in an aria-live="polite" region (AC18 copy).
    // 4. Add one account filter → button becomes enabled.
    //
    // Assertions:
    // - button[aria-disabled="true"] in states (1)-(3); enabled in (4)
    // - hint text matches i18n key for the "select one more filter" banner
  });

  // -------------------------------------------------------------------------
  // Happy paths — require BOTH harness seams (unlocked workspace + dialog stub).
  // -------------------------------------------------------------------------
  test.skip('HP-01: filtered CSV export writes a real file (`;` + BOM + CRLF)', async () => {
    // Steps:
    // 1. Launch with seeded+unlocked workspace and OT_E2E_EXPORT_DEST=<tmp dir>.
    // 2. prepare({ format: 'csv', locale: 'es',
    //      filters: { dateFrom, dateTo, accountIds: [acc] } }) → { ok, token }
    // 3. run({ confirmationToken: token }) → { ok: true, basename, rowCount }
    // 4. Read <tmp dir>/<basename> from disk.
    //
    // Assertions:
    // - run.ok === true, run.rowCount matches the seeded matching rows
    // - file starts with UTF-8 BOM ('\ufeff')
    // - header + rows are `;`-separated, lines end with CRLF
    // - 13 columns per FR11
    // - audit chunk now contains a started + succeeded entry for action
    //   'export.csv' (verify via a debug IPC or by reopening the chunk)
  });

  test.skip('HP-02: filtered XLSX export writes a valid single-sheet workbook', async () => {
    // Steps: as HP-01 with format: 'xlsx'.
    // Assertions:
    // - run.ok === true, basename ends with '.xlsx'
    // - file is a valid zip/xlsx (exceljs can read it back)
    // - one worksheet, header row present, text cells written as strings
    //   (formula-injection neutralized: '=', '+', '-', '@' prefixed)
    // - audit action recorded as 'export.xlsx'
  });

  // -------------------------------------------------------------------------
  // Encrypted-workspace hard-block (FR14) — no "Save anyway".
  // -------------------------------------------------------------------------
  test.skip('SEC-01: saving inside the workspace is hard-blocked', async () => {
    // Steps:
    // 1. Stub the save dialog to return a path INSIDE the unlocked workspace
    //    root (e.g. <workspace>/.treasury/leak.csv or <workspace>/leak.csv).
    // 2. prepare(...) then run(...).
    //
    // Assertions:
    // - prepare (or run) → { ok: false, code: 'EXPORT_DEST_INSIDE_WORKSPACE' }
    // - NO file is written anywhere under the workspace root
    // - NO "save anyway" affordance is offered by the renderer
  });

  // -------------------------------------------------------------------------
  // Rate-limit (FR24) + lockout (FR25).
  // -------------------------------------------------------------------------
  test.skip('SEC-02: 4th export within 15 min is EXPORT_RATE_LIMITED', async () => {
    // Steps:
    // 1. Stub dialog to a tmp dir; perform 3 successful prepare→run cycles.
    // 2. Attempt a 4th prepare within the same 15-min window.
    //
    // Assertions:
    // - cycles 1-3: run.ok === true
    // - 4th prepare → { ok: false, code: 'EXPORT_RATE_LIMITED', retryAfterMs>0 }
    // - throttle persists across an app relaunch (MK-encrypted gate state)
  });

  test.skip('SEC-03: 5 confirmation mistypes lock the gate for 5 minutes', async () => {
    // Steps:
    // 1. In the confirm modal, type the wrong confirmation word 5 times.
    //
    // Assertions:
    // - after the 5th mistype: run → { ok:false, code:'EXPORT_LOCKED_OUT' }
    // - confirm control disabled with an accessible countdown hint
    // - a correct confirmation BEFORE the threshold resets the mistype counter
    // - the typed input never appears in any log/diagnostic (AC19)
  });
});
