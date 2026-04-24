# `docs/perf/` — perf investigations & measurements

Benchmark artifacts and root-cause write-ups for scale/latency issues. Each
investigation lands as `<area>-investigation-<YYYY-MM-DD>.md` with a
companion `<area>-measurements-<YYYY-MM-DD>.md` that the harness regenerates.

## Harness

Two scripts, wired into `package.json`:

```bash
# Seed N synthetic tx.created events into an NDJSON file.
# Default output: <userData>/perf-events/events.ndjson — launch the app with
# OT_DATA_DIR=perf-events to consume it.
npm run perf:seed -- --count=5000 [--dir=perf-events] [--out=<path>] [--seed=<int>]

# Measure data-layer cost (file read → reducer → handler → zod) at multiple
# transaction counts. Uses the REAL source modules via vite-node; no
# re-implementation.
npm run perf:measure [-- --sizes=1000,2500,5000,10000 --trials=5 --report=<md-path>]
```

Both scripts are deterministic (shared mulberry32 PRNG, constant seed) so
re-running produces byte-identical NDJSON and stable timings.

## Investigations

- [`movements-investigation-2026-04-24.md`](./movements-investigation-2026-04-24.md)
  — Phase 1 of issue #39 (MovementsScreen slowness at ~2.5k tx). Ranked root
  causes with file:line evidence; Phase 2 sub-issue decomposition.
- [`measurements-2026-04-24.md`](./measurements-2026-04-24.md) — raw output
  of `npm run perf:measure` on the date above (Linux / Node 20).
