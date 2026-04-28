# Skill — Electron UI snapshot harness via Playwright

> **When to use:** capturing visual evidence (PNGs) of a real Electron screen
> against multiple seeded datasets and viewports — for redesign reviews, bug
> reports, or "this is what we shipped" documentation. **Not** for visual
> regression testing in CI.

## Pattern

1. **Skip in CI by default** so the harness ships alongside real specs without
   slowing them down:

   ```ts
   const RUN_SNAPSHOTS = process.env['OT_SNAPSHOTS'] === '1';
   test.describe('…', () => {
     test.skip(!RUN_SNAPSHOTS, 'Set OT_SNAPSHOTS=1 to capture snapshots.');
     test.describe.configure({ mode: 'serial' });
     // …
   });
   ```

2. **Launch Electron with `args: ['.']`, NEVER `args: ['dist/main/index.js']`.**
   Only the `.` form makes Electron read our `package.json`, picking up
   `name: "opentreasury-desktop"` so `app.getName()` resolves userData to
   `%APPDATA%/opentreasury-desktop` (not `%APPDATA%/Electron`).

3. **One deterministic seed per dataset.** Mirror the on-disk envelope shape
   from `app/src/main/devSeed.ts` / `scripts/perf-seed.mjs` (event types,
   `fakeUlid`, `payload` envelope) and write directly into
   `<userDataRoot>/<OT_DATA_DIR>/events.ndjson`. Pass `OT_SEED=none` so the
   bootstrap doesn't append the demo seed on top.

4. **userDataRoot resolution** (Windows / macOS / Linux) lives in
   `scripts/perf-seed.mjs`; copy the function verbatim into the spec rather
   than spawning the seeder, because snapshots usually need shaped data the
   PRNG can't produce.

5. **ESM gotcha.** Playwright runs specs as ES modules — `__dirname` is not
   defined. Use:

   ```ts
   import { dirname, resolve } from 'node:path';
   import { fileURLToPath } from 'node:url';
   const HERE = dirname(fileURLToPath(import.meta.url));
   const REPO_ROOT = resolve(HERE, '..', '..');
   ```

6. **Set Playwright viewport on the firstWindow page**:

   ```ts
   await page.setViewportSize({ width: 1600, height: 1000 });
   ```

   This works on the Electron `BrowserWindow` page just like on a Chromium
   browser context.

7. **Two-screenshot strategy** for sections of a page:

   - **Combined clip** — use `boundingBox()` of the top and bottom locators to
     compute a `clip` rect for `page.screenshot({ clip })`. Cap the clip's
     `width`/`height` to `viewport - {x,y}` to avoid the
     "_clip area is out of viewport bounds_" error.
   - **Element close-up** — `locator.screenshot()` is more robust than a
     manually computed clip when you only want one element.

8. **Wait for layout to settle before measuring boxes.** Empirically a 150–
   400 ms `waitForTimeout` after `scrollIntoViewIfNeeded()` produces stable
   bounding boxes; without it, custom-font reflow can shift label widths a
   few pixels between measure and screenshot.

9. **Output location.** PNGs in `docs/ux/<topic>/` are committable when the
   task is "show me what we shipped"; ephemeral working folders are fine for
   one-off bug repros. Add a `README.md` index alongside the PNGs with a
   one-line caption per file — the index, not the filenames, is what
   reviewers actually scan.

## Repo conventions used

- `playwright.config.ts` already has `testDir: './tests/e2e'`,
  `fullyParallel: false`, `workers: 1` — perfect for serial Electron launches.
  Don't override.
- File naming for produced PNGs: `<dataset>-<viewport>-<view>.png` (e.g.
  `normal-wide-full.png`, `skewed-narrow-bars.png`). Predictable, sortable,
  greppable in PR comments.

## Reference implementation

`tests/e2e/insights-snapshots.spec.ts` (PR-#141 follow-up) — three dataset
shapes (normal/skewed/sparse) × two viewports (1600 / 900) × two views
(full/bars). All output committed under `docs/ux/insights-current-state/`.
