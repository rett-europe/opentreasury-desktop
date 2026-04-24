# MovementsScreen perf investigation — 2026-04-24

> Phase 1 deliverable for issue #39. Neo (Lead) research pass. Phase 2 fixes
> will split across Morpheus / Trinity / Cypher per the ownership plan.

## TL;DR

- **Data layer is not the bottleneck at 2.5k.** Total main-process cost for a
  cold `movements:list` round (read + parse + replay + handler + zod) is
  **~35 ms at 2,500 rows**, ~77 ms at 5k, ~246 ms at 10k. That fits well
  inside a "first paint" budget and cannot explain the "feels sluggish"
  observation on its own.
- **The renderer is.** `<Table>` renders every row to the DOM — no
  virtualisation. At 2,500 rows × ~10 columns ≈ 25k cells, every mount,
  filter change, or sort toggle pays full React reconciliation. This is the
  prime suspect for what Pedro saw and the #1 fix.
- **A latent O(N²) is waiting.** The `tx.created` reducer branch rebuilds
  the transactions array (spread) AND the `transactionsByReference` index
  from scratch on every event. Replay cost is 11× going from 2.5k to 10k
  (should be 4× if linear). Harmless at 2.5k (16 ms), painful by 20k.
- Two of the four original "where to look" hypotheses are **wrong**:
  `JsonFileEventLog` is not re-read per IPC call, and the movements handler
  is not re-reducing the log. They read the hydrated in-memory read model.

## Measurements

See [`measurements-2026-04-24.md`](./measurements-2026-04-24.md) for the raw
table (regenerate with `npm run perf:measure`). Excerpt:

| N tx   | load()  | replayEvents | movements:list | zod.parse | **Total**   |
| -----: | ------: | -----------: | -------------: | --------: | ----------: |
|  1,000 |  3.8 ms |  **5.0 ms**  |        0.70 ms |    5.7 ms | **15 ms**   |
|  2,500 |  8.0 ms |  **16 ms**   |         1.9 ms |    5.8 ms | **35 ms**   |
|  5,000 |   15 ms |  **48 ms**   |         3.7 ms |     10 ms | **77 ms**   |
| 10,000 |   30 ms |  **181 ms**  |         8.6 ms |     25 ms | **246 ms**  |

Host: Linux x64, Node v20.20.2. Numbers on a Windows laptop will differ but
the scaling characteristic will not.

**Missing from the table — renderer cost.** Not measurable in this sandbox
(no Electron / no browser). Trinity sub-issue will add React DevTools
Profiler numbers and a Playwright-driven mount-time budget.

## Root causes (ranked)

### P0 — `<Table>` is not virtualised

**File:** [`app/src/renderer/components/Table/Table.tsx`](../../app/src/renderer/components/Table/Table.tsx) lines 111–160.

```tsx
<tbody>
  {rows.map((row) => { ... return <tr>...{columns.map(...)}</tr>; })}
</tbody>
```

Full `<tbody>` render of every row. At 2,500 rows × the 10 columns defined
in `MovementsScreen.tsx` (L467–L626), React has to mount ~25,000 cell
elements on first paint, then reconcile them on every `filteredRows` /
`sortedRows` / `selected` change. Every per-row render also calls
`Intl.DateTimeFormat.format(new Date(…))` and `Intl.NumberFormat.format(…)`
— cheap per call, but N× each change.

This is the architectural smell the issue calls out. Fix = row
virtualisation (e.g. `@tanstack/react-virtual`, which keeps the current
`<table>` semantics). Expected impact at 2.5k: ~25 ms first paint instead
of hundreds.

### P1 — Reducer `tx.created` handler is O(N²)

**File:** [`app/src/core/query/reducers.ts`](../../app/src/core/query/reducers.ts) lines 49–77.

```ts
case 'tx.created': {
  const nextTransactions: readonly Transaction[] = [
    ...readModel.transactions,        // ← spread entire array per event
    { …payload },
  ];
  readModel = {
    ...readModel,
    transactions: nextTransactions,
    transactionsByReference: indexByReference(nextTransactions), // ← full rescan
  };
  …
}
```

Spreading `readModel.transactions` on each event makes replay O(N²) in
array copies. The harness confirms this: going from 2.5k → 10k tx, replay
time jumps from 16 ms to 181 ms — an 11.3× increase for a 4× data growth.

Workarounds already live elsewhere in the same file (array pushes/mutation
into a fresh array at the top of `replayEvents`) so the fix is localised.

### P2 — `transactionsByReference` index rebuilt per event

**File:** [`app/src/core/query/reducers.ts`](../../app/src/core/query/reducers.ts) lines 33–46 (`indexByReference`) and lines 72–76 (call site inside `tx.created`).

`indexByReference` iterates the entire transactions array to build a fresh
`Map<reference, Transaction[]>`. Called from inside the `tx.created` branch
on every event — so replay pays O(N) index rebuild × O(N) events = second
O(N²) factor stacked on P1. Updates and deletes take the same hit.

Fix = incremental maintenance (add/remove a single entry) inside the
relevant reducer branches, not a full rescan.

### P3 — Zod response `.parse` scales with N at the IPC boundary

**File:** [`app/src/main/ipc/handlers.ts`](../../app/src/main/ipc/handlers.ts) line 257 (`movementsListResponseSchema.parse(response)`).
**Schema:** [`app/src/shared/ipc-contracts/movements.ts`](../../app/src/shared/ipc-contracts/movements.ts) line 66 (`z.array(movementRecordSchema)`).

25 ms at 10k — not catastrophic, but it's ~10 % of the data-layer budget at
that scale for what is defensively a belt-and-suspenders check. Worth
revisiting when the runway narrows. Note: this is one parse; the renderer
side of the IPC bridge may do a second parse too — needs grep in the
preload layer to confirm.

Fix options (keep for Phase 2 judgement): switch to `safeParse` in prod
and skip the array validation, sample-validate in dev, or rely on the
already-validated request and the handler contract.

## Hypotheses that turned out to be **not** a problem

Keeping these here so the next perf pass doesn't re-chase the same ghosts.

- **"`JsonFileEventLog.read()` on every IPC query?"** No. `load()` is called
  exactly once at app start ([`app/src/main/bootstrap.ts` L97](../../app/src/main/bootstrap.ts)) and its
  output is folded into the in-memory `ReadModel` singleton. IPC handlers
  all go through `getReadModel()` — grep for `getEventLog()` in the
  handlers directory confirms only append-path uses.
- **"`movements:list` re-reduces the full event log per call?"** No. The
  handler ([`app/src/main/ipc/handlers/movements.ts`](../../app/src/main/ipc/handlers/movements.ts) L20–L57) reads
  `deps.getReadModel().transactions` directly. Filter + sort + slice + map
  at 10k rows is 8.6 ms — a non-issue.
- **"Name resolution in `mapMovementRecord` is O(N·M)?"** No. The call site
  ([`MovementsScreen.tsx`](../../app/src/renderer/screens/MovementsScreen/MovementsScreen.tsx) L222–L233) builds `accountsMap` /
  `categoryNameById` / `subcategoryNameById` once, then does O(1) lookups
  per row.
- **"Per-row formatters re-created?"** No. `currencyFmt` / `dateFmt` /
  `monthFmt` are memoised ([`MovementsScreen.tsx` L313, L381–L385](../../app/src/renderer/screens/MovementsScreen/MovementsScreen.tsx)) and
  `tagColor` is a stable `useCallback`.

## Proposed Phase 2 decomposition

Per Pedro's ownership plan — each of these is a concrete, single-target
sub-issue suitable for either in-squad work or a Copilot cloud agent spawn
once filed.

### #39-a — ⚛️ Trinity: virtualise `<Table>` row rendering

- **Target file:** `app/src/renderer/components/Table/Table.tsx`.
- **AC:**
  - Add row virtualisation (proposal: `@tanstack/react-virtual`) that keeps
    the existing `<table>` semantics, sort indicators, sticky header, and
    sticky footer.
  - `MovementsScreen.mount` at 5k rows ≤ **200 ms** from IPC response to
    first paint (Windows / mid-range laptop; Cypher's Playwright test
    enforces the budget — see #39-c).
  - No regressions to the existing `Table.test.tsx` or `MovementsScreen.test.tsx`.
- **Out of scope:** formatter hoisting (already done), filter memoisation
  audit (already done — see MovementsScreen L324–L353, L374–L377).

### #39-b — 🔧 Morpheus: fix O(N²) reducer for `tx.created` + reference index

- **Target files:** `app/src/core/query/reducers.ts` (L33–L46, L49–L77;
  apply the same pattern to `tx.updated` / `tx.deleted` for consistency).
- **AC:**
  - Replay at 10k tx ≤ **60 ms** (baseline: 181 ms). Benchmarked via
    `npm run perf:measure --sizes=10000`.
  - `transactionsByReference` maintained incrementally (add/remove a
    single bucket per event — no full rescan).
  - Full `reducers.test.ts` / `queries.test.ts` / property tests still green.
- **Out of scope:** persistence / snapshotting (separate conversation).

### #39-c — 🧪 Cypher: Playwright perf budget for `MovementsScreen`

- **Target files:** `tests/e2e/movements-perf.spec.ts` (new), Playwright
  config scaffold (`playwright.config.ts` — not yet in repo; needs to land
  with this sub-issue).
- **AC:**
  - `npm run perf:seed -- --count=5000 --dir=perf-events` + launch with
    `OT_DATA_DIR=perf-events`.
  - Test fails if `MovementsScreen` mount (navigate → first row visible)
    exceeds **500 ms** median across 3 runs.
  - Wired into CI so regressions fail loudly. Gate on `main` only initially
    (PRs can be flakier on GH runners) — revisit after a week of data.
- **Depends on:** #39-a landing first (otherwise the budget is unmeetable).
- **Why not done in Phase 1:** Playwright is not yet configured in the
  repo (`tests/e2e/smoke.spec.ts` is `test.skip`; no `playwright.config.ts`
  exists). Wiring it up is a meaningful chunk of Cypher's real work and
  belongs with the budget test, not ahead of it.

### #39-d (optional) — 🔧 Morpheus: Zod IPC-boundary strategy

- **Target files:** `app/src/main/ipc/handlers.ts` (L257 and its ~30
  sibling `schema.parse(response)` calls), optionally preload layer.
- **AC:** Document the call — either keep the parse (preferred for
  correctness) with an explicit "worth 10–25 ms at 10k" note in the ADR,
  or swap to `safeParse` + sampled validation in dev, drop in prod. No
  regression in contract-breakage detection.
- **Priority:** P3. Only worth the effort if #39-a and #39-b don't get us
  under the budget at 10k.

## How to reproduce

```bash
# Measure (no app launch required):
npm run perf:measure                # defaults to sizes 1k/2.5k/5k/10k, 5 trials

# Run the real app against a larger seeded dataset:
npm run perf:seed -- --count=5000 --dir=perf-events
OT_DATA_DIR=perf-events npm run dev
```

The seed script is deterministic (mulberry32 PRNG, constant seed) — two
runs produce byte-identical output, which keeps the benchmark stable.
Output files live under `%APPDATA%/opentreasury-desktop/<dir>/events.ndjson`
(or the macOS / Linux equivalents) and match `.gitignore`'s `*.ndjson` so
nothing leaks into the repo.
