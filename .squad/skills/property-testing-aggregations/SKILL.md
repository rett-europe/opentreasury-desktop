# Skill — Property testing read-model aggregations

> **Status:** Draft (one instance shipped — WI-22 saldo) · **Owner:** Cypher
> **Last applied:** 2026-04-22, commit `255b0f8`

## When to reach for this skill

Any time a feature computes **totals / groupings / projections** by looping
over the hydrated read model. Examples in this codebase:

- Panel's KPI strip (income / expense / net month-over-month)
- Movements' filtered-list totals
- Saldo's comparison panels + monthly chart + KPI deltas ← first applied here
- Future: budget overlays, account-level balances, tag pivots

If the spec contains words like "sum of", "group by", "per period", "same
period prior year", or "projected from partial period" — that's an
aggregation that deserves a property test.

## The pattern (battle-tested once)

### 1. Generator yields EVENT logs, not entities

```ts
type GenEvent =
  | { kind: 'create'; entity: ... }
  | { kind: 'update'; id: string; patch: ... }
  | { kind: 'delete'; id: string };
```

Why events: closer to what the reducer actually sees. Catches bugs where an
updated/deleted tx still leaks into aggregation. Generating entities directly
skips that entire class of bug.

### 2. Project events inline in the test file

Don't import the production reducer. Write a 15-line inline projector
(`create` adds, `update` merges, `delete` removes). The point is that **the
test deliberately does NOT share code with the unit under test** — duplication
IS the test.

### 3. Brute-force reference in the same file

```ts
function refAggregate(entities, start, end) {
  let x = 0;
  for (const e of entities) if (e.date >= start && e.date <= end) x += ...;
  return x;
}
```

One loop, one range check. No cleverness. If the production aggregation and
the reference disagree, one of them is wrong — and ref is the obvious one.

### 4. Integer-only arithmetic in assertions

Generate monetary amounts as **integer cents**. Compare with
`Math.round(x * 100) === cents`. Avoids float-tolerance wobble when your
production code rounds per-row then sums (or sums then rounds).

Works because: `round2` applied to a 2dp number is idempotent, so
`round2(cents/100) === cents/100` always.

### 5. Fuzz the "now" clock too

A partial-period projection is only exercised if the generator produces a
"now" that falls inside the current period. Generate `now` as a random date
in the same range as the event dates — this covers `isPartial=true`,
`isPartial=false`, `daysElapsed=1`, and `daysElapsed=daysInPeriod` across
runs without explicit effort.

### 6. Pair property blocks with deterministic boundary tests

Property tests are statistical — 120 runs doesn't guarantee leap day 2024
was hit. Add explicit unit tests for:

- **UTC period boundary** (tx exactly at start/end ISO)
- **Leap-day collapse** (Feb 29 → Feb 28 in prior year)
- **Projection at extremes** (daysElapsed=1 and daysElapsed=total)
- **Empty period** (0 events — often where bugs hide, e.g. divide-by-zero)
- **Spec-locked semantics** (e.g. same-month-prior-year vs
  prior-calendar-month — pin the decision explicitly)

## Canonical implementation

See `app/src/core/query/saldo.property.test.ts` for a working example
covering 8 invariants + 6 boundaries with ~510 total runs in <2s.

## fast-check tips learned

- Use `import * as fc from 'fast-check'`, not default import (avoids
  `import/no-named-as-default-member` ESLint warning at max-warnings 0).
- `fc.option(arb, { nil: null, freq: 4 })` — ~25% null, 75% value. Good for
  nullable foreign keys (categoryId, subcategoryId).
- `fc.array(arb, { maxLength: N })` — cap at N to keep runs fast. 500 is
  the documented upper bound for saldo; actual runs average ~50 events.
- `{ numRuns: 120 }` is a reasonable default. Bump to 150+ for the most
  important invariant (for saldo, that's I8 — Saldo ≡ Movements).

## What this skill does NOT replace

- **Deterministic unit tests** for known edge cases. Property tests don't
  provide a friendly failure surface; unit tests do.
- **E2E tests** through the IPC boundary. Property tests hit the pure
  aggregation function directly — they don't catch bridge/wire-format bugs.
- **Performance benchmarks.** Neo's thin-spec §2 calls for a 150 ms-at-1k
  cold aggregation gate; that's a separate perf test, not a property test.

## Runtime budget

A 510-run saldo property suite finishes in ~1.6 s on a Windows dev box.
Property tests should stay under 5 s total per file to preserve the
sub-minute unit-test gate.
