# Skill — Playwright Electron screenshots for end-user guides

> **When to use:** producing the canonical PNGs Oracle embeds in
> `docs/guides/*.md`. Drives the real Electron app through a curated set of
> waypoints from a clean, deterministic state. **Not** for visual regression
> testing and **not** for marketing screenshots — those have separate skills.

## The non-negotiable launch rule

```ts
await electron.launch({
  args: ['.', `--user-data-dir=${ISOLATED_USER_DATA}`],
  env: { ...process.env, OT_SEED: 'none' },
});
```

- `'.'` makes Electron read our `package.json`, so `app.getName()` returns
  `opentreasury-desktop` and `app.getPath('userData')` resolves under the
  isolated dir below — **not** `%APPDATA%\Electron`. Passing
  `'dist/main/index.js'` (or any path) silently breaks userData resolution and
  your seeded `profile.json` becomes invisible. Verified by PR #46
  (`tests/e2e/movements-perf.spec.ts:62`) and reconfirmed in #163.
- `--user-data-dir=…` is the standard Chromium switch; Electron honours it,
  giving the spec a sandboxed userData root we can wipe / reseed per test
  without touching the dogfood install at `%APPDATA%\opentreasury-desktop`.

## Seeding strategy

1. **Isolated userData root** under `os.tmpdir()` via `fs.mkdtempSync` — gives
   each test run a private profile.json / app-config.json / cache.
2. **Absolute dataDir** under the same root, written into
   `app-config.json` (`{ version: 1, dataDir, readOnly: false }`). The
   bootstrap (`app/src/main/bootstrap.ts:131`) accepts absolute paths.
3. **Reuse `scripts/perf-seed.mjs --out=<abs>`** — its `--out` flag
   short-circuits the userData-root lookup and writes events.ndjson exactly
   where you want it. Don't re-implement the event shapes; the seeder is the
   single source of truth (mirrors `app/src/main/devSeed.ts`).
4. **profile.json** must be a literal `Profile` matching
   `app/src/shared/ipc-contracts/profile.ts` (26-char ULID, ISO `createdAt`).
   For a doc persona, hand-pick a stable Crockford-base32 string —
   determinism > authenticity for guide screenshots.
5. **Profile seeding timing**: Write `profile.json` BEFORE launching the app.
   The bootstrap loads the profile during initialization (before the first
   window opens). Seeding via IPC after launch requires a reload, which can
   cause event log hydration issues. Pre-seed the file, then set locale inline
   before the first reload to minimize bootstrap cycles.

## Locale determinism

`app/src/renderer/i18n/index.ts` reads localStorage key
**`opentreasury.locale`** (NOT `i18nextLng`). Set it BEFORE the first reload:

```ts
await page.evaluate(() => localStorage.setItem('opentreasury.locale', 'es'));
await page.reload();
await page.waitForLoadState('domcontentloaded');
```

**CRITICAL**: Minimize reloads. Each reload re-triggers bootstrap, which can
delay event log hydration. Set locale and profile in the SAME reload cycle,
not separate ones.

## Window sizing & screenshot pattern

- Set viewport via `page.setViewportSize({ width: 1800, height: 1100 })` on
  the `firstWindow()` — wider viewport (vs 1280x800) shows better content
  density, especially for tables and charts (issue #163).
- Optionally normalize zoom to `1.0` via `page.evaluate()` calling
  `window.electronAPI?.setZoomFactor?.(1.0)` for consistent scaling.
- Use `page.screenshot({ path, fullPage: true })` for guide shots; `fullPage`
  captures content below the fold (e.g. dashboard "last 12 months" chart).
- After each nav click, wait for a **content-anchored** selector
  (`[aria-labelledby^="saldo-panel-"]`), then a 300–500 ms `waitForTimeout`
  for layout / font reflow. Without the timeout, charts and currency strings
  shift a few pixels between mount and capture.

## Movements table gotcha

The MovementsScreen defaults to "Este mes" (this month) filter. If seeded data
is from a different month (e.g., April 2026), you'll see "No hay resultados".
Click the "Todo" (All) preset before screenshotting to show all movements:

```ts
await page.click(NAV_MOVEMENTS);
await page.waitForSelector('.ot-movements', { state: 'visible' });
await page.click('text=Todo'); // Select "All" time range
await page.waitForTimeout(1000);
await page.waitForSelector(FIRST_DATA_ROW, { state: 'visible' });
```

## Selectors that survive UI churn

- Sidebar nav: position-based **inside** `nav[aria-label="Primary"]` — locale
  agnostic, structurally stable. Mirrors `tests/e2e/movements-perf.spec.ts`.
- Settings (Preferencias): Use text locator `button:has-text("Preferencias")`
  from the sidebar footer, not a topbar gear icon (that selector is stale).
- Saldo expand toggles: `[data-testid="saldo-subcategories-toggle-income"]` /
  `…-expense`. Click both to cover the "expanded" waypoint.
- Profile modal: `dialog.ot-profile-setup-modal`.
- Preferences screen: `.ot-preferences` (not `.ot-settings`).

## File layout

- Spec: `tests/e2e/doc-shots.spec.ts`
- Output: `docs/guides/screenshots/NN-<slug>.png` (zero-padded prefix → file
  manager and Markdown both order them naturally)
- npm script: `"docshots": "playwright test tests/e2e/doc-shots.spec.ts"`
  (build is required first — `npm run build`)

## Confidence: high (2nd observation cycle)

Issues discovered in #163 round 2:
- Profile seeding order matters — pre-seed before launch, not via IPC after.
- Viewport 1800x1100 > 1280x800 for readable screenshots.
- Movements filter defaults to "Este mes" — click "Todo" to show all data.
- Settings nav target is `Preferencias` button in sidebar, not a topbar gear.

## Reference implementation

`tests/e2e/doc-shots.spec.ts` (PR for #163 round 2) — seven waypoints from
fresh first-launch through Settings, Spanish locale, "Maria Rodríguez" / "Casa
Esperanza" persona.
