# Playwright perf-budget gate — MovementsScreen

> **Issue:** #39-c · **Owner:** Cypher · **Priority:** P0

## What this gate does

A Playwright test (`tests/e2e/movements-perf.spec.ts`) launches the real Electron
binary against a seeded 5 000-transaction dataset and measures how long it takes
for the first data row to become visible in the Movements screen after clicking
the nav item.

The test runs **3 independent Electron launches** and asserts that the **median
mount time is ≤ 1 500 ms**.  Using the median rather than the minimum absorbs
single-run cold-start noise without hiding a genuine regression across all runs.

CI only triggers this job on **pushes to `main`** (not on PRs) — see *Revisiting
the gate* below.

---

## Budget rationale

| Threshold | Reasoning |
|-----------|-----------|
| **1 500 ms** | Conservative starting point to let the gate collect real CI data before tightening. Once stable (≥ 1 week of `main` data), tune down to `observed_median × 1.5`. |
| 3 runs | Enough for a stable median on CI runners; keeps the job under ~5 min. |

The 1 500 ms budget is intentionally generous for the first landing.  After a
week of data from real CI runs, adjust it to `observed_median × 1.5` so it gates
genuine regressions while remaining flake-resistant on slow runners.

**Why not P50 across more runs?**  Each run spawns a full Electron process, which
takes ~10–40 s per launch on CI.  Three runs keep the job manageable; more runs
can be added if the variance turns out to be high.

---

## How to reproduce locally

```bash
# 1. Build the app (renderer + main + preload).
npm run build

# 2. Install Playwright (only needed once).
npx playwright install

# 3. Seed 5 000 synthetic transactions.
npm run perf:seed -- --count=5000 --dir=perf-events

# 4. Run the perf spec only.
npx playwright test movements-perf

# Run the full e2e suite (smoke + perf):
npm run e2e
```

---

## Debugging a CI failure

### 1 — Read the median and individual run times

The test prints each run time and the median to stdout:

```
[perf] run 1/3: 312 ms
[perf] run 2/3: 289 ms
[perf] run 3/3: 418 ms
[perf] times=[289, 312, 418] ms  median=312 ms  budget=1500 ms
```

If the median exceeds 1 500 ms, look for **all three runs** being slow (genuine
regression) versus **one outlier** inflating the median (runner flakiness).

### 2 — Check for a renderer regression

The #1 suspect is a change that un-virtualises the Movements table or forces a
full DOM re-render.  Confirm by:

```bash
# Local measurement with React DevTools Profiler:
npm run dev
# Open DevTools → Profiler → record → click Movimientos
```

Check `Table.tsx` — the `virtualise` prop must be `true` for the Movements
table (see `MovementsScreen.tsx`).

### 3 — Check for a data-layer regression

Run the data-layer harness to isolate main-process cost:

```bash
npm run perf:measure -- --sizes=5000 --trials=5
```

Expected at 5 000 rows (post #39-b fix): **≤ 80 ms** total main-process cost
(`load` + `replayEvents` + `movements:list` + `zod.parse`).

### 4 — Check the seed

Confirm the perf-events dataset exists and has the right size:

```bash
# Linux / macOS
ls -lh ~/.config/opentreasury-desktop/perf-events/events.ndjson

# Windows
dir %APPDATA%\opentreasury-desktop\perf-events\events.ndjson
```

A 5 000-transaction seed (+ reference data) is ~3.5 MiB.

---

## Revisiting the gate

After ≥ 1 week of stable data on `main`:

1. Collect the median values logged by CI runs.
2. Compute `p75 × 1.5` from the collected medians.
3. Update `BUDGET_MS` in `tests/e2e/movements-perf.spec.ts`.
4. If variance is low (all runs within ±20 ms of the median), change the CI
   `if:` condition to also fire on PRs — edit `.github/workflows/ci.yml` and
   remove the `github.event_name == 'push'` guard.

---

## Related

- `tests/e2e/movements-perf.spec.ts` — the gate itself
- `playwright.config.ts` — Playwright project config (timeout, retries)
- `scripts/perf-seed.mjs` — deterministic 5 k-transaction seed
- `docs/perf/movements-investigation-2026-04-24.md` — root-cause analysis
- Issue #39-a (virtualisation) — prerequisite for the budget to be meetable
