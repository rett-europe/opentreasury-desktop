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
5. **Delete profile.json** before the "first-launch" waypoint to render the
   `<dialog class="ot-profile-setup-modal">`; recreate it before any other
   waypoint or AppShell will park on the modal forever.

## Locale determinism

`app/src/renderer/i18n/index.ts` reads localStorage key
**`opentreasury.locale`** (NOT `i18nextLng`). After the first window opens:

```ts
await page.evaluate(() => localStorage.setItem('opentreasury.locale', 'es'));
await page.reload();
```

…then re-wait for `.ot-shell__sidebar`. Without this, navigator detection
yields whatever the OS / CI runner is set to and screenshots drift between
environments.

## Window sizing & screenshot pattern

- Set viewport via `page.setViewportSize({ width: 1280, height: 800 })` on
  the `firstWindow()` — works on Electron pages just like Chromium.
- Use `page.screenshot({ path, fullPage: true })` for guide shots; `fullPage`
  captures content below the fold (e.g. dashboard "last 12 months" chart).
- After each nav click, wait for a **content-anchored** selector
  (`[aria-labelledby^="saldo-panel-"]`, `table.ot-table tbody tr:not([aria-hidden="true"])`)
  and then a 300–500 ms `waitForTimeout` for layout / font reflow. Without
  the timeout, charts and currency strings shift a few pixels between mount
  and capture.

## Selectors that survive UI churn

- Sidebar nav: position-based **inside** `nav[aria-label="Primary"]` — locale
  agnostic, structurally stable. Mirrors `tests/e2e/movements-perf.spec.ts`.
- Settings gear: `.ot-shell__icon-btn` (it is the only one in the topbar).
- Saldo expand toggles: `[data-testid="saldo-subcategories-toggle-income"]` /
  `…-expense`. Click both to cover the "expanded" waypoint.
- Profile modal: `dialog.ot-profile-setup-modal`.

## File layout

- Spec: `tests/e2e/doc-shots.spec.ts`
- Output: `docs/guides/screenshots/NN-<slug>.png` (zero-padded prefix → file
  manager and Markdown both order them naturally)
- npm script: `"docshots": "playwright test tests/e2e/doc-shots.spec.ts"`
  (build is required first — `npm run build`)

## Reference implementation

`tests/e2e/doc-shots.spec.ts` (PR for #163) — seven waypoints from fresh
first-launch through Settings, Spanish locale, "Maria Rodríguez" / "Casa
Esperanza" persona.
