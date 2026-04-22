# Morpheus — WI-22 Saldo backend shipped

> **Date:** 2026-04-22 · **PR:** #7 · **Branch:** `wi-22/saldo-backend` → `main`

## Scope delivered (S1 + S2 + S3 from Neo's thin spec)

- **S1 — IPC contract**: `app/src/shared/ipc-contracts/saldo.ts` — frozen end of Day 1 (commit `3b6986f`). Single endpoint `saldo:get-comparison`. Zod request + response.
- **S2 — Aggregation**: `app/src/core/query/saldo.ts` — pure on-demand pass over the hydrated read model, no new events, no materialized buckets.
- **S3 — Projection**: linear pro-rata, UTC inclusive day count. `currentPeriod.currentProjectedTotal` is a REQUIRED response field (null when complete, `{income, expense}` when partial).
- **Bridge**: IPC handler (Zod both sides), `window.opentreasury.saldo.getComparison()` preload method, `renderer/services/saldoApi.ts` wrapper.

## Contract shape (frozen)

```ts
Request:  { period: 'ano' | 'trim' | 'mes', anchor: YYYY-MM-DD, currency?: 'EUR' }
Response: {
  currentPeriod: {
    start, end,
    totalIncome, totalExpense,
    netByCategory: Array<{ categoryId, categoryName, income, expense }>,
    isPartial: boolean,
    daysElapsed: number, daysInPeriod: number,
    currentProjectedTotal: { income, expense } | null,  // REQUIRED field
  },
  priorPeriod: {  // same-period-prior-year, never projected
    start, end,
    totalIncome, totalExpense,
    netByCategory,
  },
  monthlySeries: Array<{ monthIso, netIncome, netExpense }>,  // 12 / 3 / 1 buckets; NEVER projected
  kpis: {
    netDelta: number | null,       // null when prior===0
    incomeDelta: number | null,
    expenseDelta: number | null,
    biggestCategoryGrowth: { categoryId, categoryName, deltaPct } | null,
  },
}
```

## Locked semantics implemented

- **Prior = same-period-prior-year** across all granularities. abr 2026 → abr 2025, Q2 2026 → Q2 2025, 2026 → 2025. Leap-day collapse (2024-02-29 → 2023-02-28) handled explicitly.
- **Projection formula**: `projected = actual × (daysInPeriod / daysElapsed)`. Applied ONLY to `totalIncome` / `totalExpense` on `currentPeriod`. NEVER applied to per-category rows, NEVER to the monthly chart.
- **Day counting**: UTC midnight boundaries, inclusive on both ends. `daysElapsed` clamped to `[1, daysInPeriod]`.
- **KPI deltas (AC4)**: when `isPartial`, pct deltas use the PROJECTED current; otherwise raw. `prior===0` → `null`.
- **Uncategorized** transactions bucket under `categoryId=null` with fallback name `'Sin categoría'`.

## Test count delta

- Baseline: **411 pass / 9 skipped**.
- After WI-22 backend + parallel slices (Trinity chart + Niobe i18n landed on separate branches, already folded into this branch's test tree at time of run): **436 pass / 9 skipped**.
- Morpheus-authored tests (new): **25 total** = 6 (contract freeze) + 16 (aggregation + projection + KPIs) + 3 (handler integration).

## Gates

All green from repo root:

```
npm run typecheck  ✓
npm run lint       ✓
npm run format:check  (full-repo check reports 49 pre-existing non-saldo files; all saldo files are prettier-clean)
npm test           ✓  436 pass / 9 skipped
```

## Follow-ups / notes for downstream agents

1. **Trinity (S5 SaldoScreen)** — unblocked: import `getSaldoComparison` from `renderer/services/saldoApi.ts`. The `currentProjectedTotal` field is either `null` (render raw totals) or `{income, expense}` (render verbatim; do NOT recompute).
2. **Cypher (property test S2b)** — the aggregation invariant `Σ netByCategory.income === currentPeriod.totalIncome` (and same for expense) is already asserted in `saldo.test.ts`. For the Saldo ≡ Movements property: filter the same model by the period's `[start, end]` and sum — the returned totals must match.
3. **No Neo/Pedro amendments needed** — the locked semantics matched the thin spec + product spec one-for-one.

## Pattern reusability

The aggregation pattern (on-demand pass over read model + period resolver + optional projection) is a candidate skill — see `.squad/skills/read-model-aggregation/` (draft).
