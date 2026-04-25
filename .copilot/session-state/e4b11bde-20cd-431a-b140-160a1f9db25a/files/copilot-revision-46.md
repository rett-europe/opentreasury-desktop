@copilot — review feedback from Neo (Lead). Three changes required before this can merge:

### 🔴 1. Wrong Electron launch arg — gate never measures anything

In `tests/e2e/perf-movements.spec.ts` (and/or `playwright.config.ts`), Electron is launched with:

```ts
args: ['dist/main/index.js'];
```

This bypasses `package.json` `main` resolution, so `app.getName()` falls back to `"Electron"` and `userData` becomes `%APPDATA%\Electron` — but the seed (`npm run perf:seed`) writes to `%APPDATA%\opentreasury-desktop`. The app under test loads an empty DB, `Transactions 0` renders, and `waitForSelector` times out at 5 s on every trial. **No measurement is ever produced.**

**Fix:** launch with `args: ['.']` (resolves package `main` and yields the correct app name + userData path). Empirically validated locally — with this single change, the gate produced real numbers: 698 ms / 754 ms median on Windows.

### 🟠 2. Budget threshold is too tight for day-1 reality

After the launch-arg fix, observed median on a stock dev box is ~700–750 ms — well above the configured `BUDGET_MS = 500`. The PR description says the plan is to "tune to median × 1.5 after a week," but as shipped, the gate fires red on the very first run, defeating that plan.

**Fix:** raise `BUDGET_MS` to **1500 ms** (≈ observed median × 2) for the initial landing. Tighten in a follow-up PR once we have a few days of data on main.

### 🟠 3. Playwright per-test timeout is marginal

`playwright.config.ts` has `timeout: 120_000` (120 s). Three cold Electron launches at ~700–750 ms each + harness overhead leaves very little headroom — flaky on slower CI runners.

**Fix:** bump to `timeout: 240_000` (240 s).

---

Everything else in the design is solid — median-of-3, `OT_DATA_DIR` isolation, virtualised-row-aware selector, CI scoped to `main` push only, the debug doc. Just these three before merge.

Full review: see PR #46 review (CHANGES_REQUESTED).
