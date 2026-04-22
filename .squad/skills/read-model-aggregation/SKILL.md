# Skill — Read-Model Aggregation (On-Demand, No Materialized Buckets)

> **Draft** · Extracted from WI-22 Saldo backend (2026-04-22, Morpheus).
> Sibling to `.squad/skills/server-derived-fields/SKILL.md` — that skill is about the IPC surface; this one is about the aggregation strategy behind it.

## Problem

Every new comparison / report / analytics screen reaches a fork in the road on day one:

1. **Pre-materialize buckets** in the read-model reducer so queries are instant, OR
2. **Aggregate on-demand** in a pure function that reads the current read model.

Path (1) scales well under load but doubles the reducer's surface area: every new event (`tx.created`, `tx.updated`, `tx.deleted`, `CategoryArchived`, …) must know how to invalidate the bucket it contaminates. Path (2) is trivially correct by construction — totals are always consistent with the event log because they're derived from it on every call — at the cost of `O(n)` per query.

## Pattern

**Default to on-demand aggregation, as a pure function that takes `{ readModel, request, now }` and returns a fully-computed response. Only escalate to materialized buckets when a measured benchmark fails.**

Concretely:

- Put the aggregation function in `core/query/<feature>.ts`, co-located with `queries.ts`.
- Signature: `getXComparison(request, deps): Response` where `deps = { getReadModel?, now? }` so tests inject a fixture model and a frozen clock.
- Make the function deterministic: no `Date.now()`, no `Math.random()`, no reads from module-level state other than what `deps` gives you.
- For period-vs-period features: build a `resolvePeriodRange(period, anchor)` helper returning `{ start, end }` ISO strings, and a `shiftPriorYear(range)` helper for the comparison window. Test those two helpers in isolation — boundary math is where the bugs live.
- Aggregate `totals` and `byCategory` (or whichever dimension) **in the same pass**. Then expose both in the response so downstream consumers can't cause them to drift (`Σ rows.income === totals.income` is structural, not an assertion).
- Scan the transactions exactly once with a lexical date-range compare (`tx.date >= range.start && tx.date <= range.end`) — `YYYY-MM-DD` compares correctly as a string.
- Return arrays in a **stable, deterministic order** — typically `net desc → name asc → id asc`. The IPC boundary is the Schelling point for order; don't push this to the renderer.

## When to apply

- Any comparison / KPI / rollup screen where the dataset is `<10k` entities.
- Any feature where the reducer surface is stable and you don't want to destabilize it.
- Any feature where correctness > raw latency and the measured hot path is IPC + paint, not aggregation.

## When NOT to apply

- You have a hard p95 budget that a micro-benchmark proves on-demand can't meet.
- The aggregation is called on every keystroke / hover / cursor move — that's what caches are for, not reducers.
- You legitimately need incremental updates (live dashboards ticking per second) — build a cache layer on top of the on-demand function, don't move logic into the reducer.

## Anti-patterns

- **Reducer inlining.** Adding `monthlyBuckets: Map<string, Bucket>` to your read model for one screen. You've just doubled the invalidation surface for that screen's lifetime. Resist.
- **Stateful helpers.** `const cache = new Map()` at module scope that grows forever. Make your aggregation pure and let callers memoize if they need to.
- **Split passes.** One pass over transactions for totals, another for per-category, a third for monthly. Now drift is possible. One pass. One truth.
- **Timezone drift.** Don't compare `tx.date` (a YYYY-MM-DD string) against `new Date()` (local-time). Normalize to UTC ISO strings on both sides.

## Example skeleton (WI-22)

```ts
// core/query/saldo.ts
export function getSaldoComparison(
  request: SaldoComparisonRequest,
  deps: { getReadModel?: () => ReadModel; now?: () => Date } = {},
): SaldoComparisonResponse {
  const model = deps.getReadModel?.() ?? getReadModel();
  const now = deps.now?.() ?? new Date();

  const currentRange = resolvePeriodRange(request.period, request.anchor);
  const priorRange = shiftPriorYear(currentRange);

  const currentAgg = aggregateTotals(model, currentRange);
  const priorAgg = aggregateTotals(model, priorRange);

  const monthlySeries = buildMonthlySeries(model, currentRange);
  const projection = computeProjection(
    currentRange,
    currentAgg.totalIncome,
    currentAgg.totalExpense,
    now,
  );

  return { currentPeriod, priorPeriod, monthlySeries, kpis };
}
```

IPC handler is a one-liner pass-through + Zod response parse. Registration site re-validates with Zod (belt-and-suspenders, ADR-001 C13).

## Trade-offs

- **Cost:** `O(n)` per query. At 1k events Saldo measured `<5 ms` in-process. IPC + React paint dominate.
- **Benefit:** Reducer stays stable. No invalidation bugs. Tests are pure and fast.
- **Escape hatch:** If benchmarks fail, add a memoizing cache layer on the _function_ — never push logic into the reducer.

## Related

- `.squad/skills/server-derived-fields/SKILL.md` — the IPC-surface sibling pattern. This skill is the "what computes the derived field"; that skill is the "where it travels to".
- WI-22 backend PR #7 — canonical reference implementation (`app/src/core/query/saldo.ts`).
- Neo's thin spec (`neo-wi22-saldo-thinspec.md` §2) — the original "on-demand vs materialized" decision matrix.
