# ARCH-005a — Per-label YoY projection / IPC mini-spec (#69)

> **Status:** DRAFT v0.1 — *spec only, M2-prep, not for implementation until Niobe & Pedro sign off* · **Owner:** Morpheus (data / projection / IPC) · **Date:** 2026-04-26
> **Tracks:** GitHub issue #69 (`priority:v1`) — inaugural view of the `Análisis / Insights` section, scheduled for **M4**.
> **Pairs with:** [UX-005 — Insights section IA](../../ux/specs/ux-005-insights-section-ia.md) · [UX-005a — Per-label YoY sketch](../../ux/specs/ux-005a-label-yoy-sketch.md)
> **Precedent:** [`app/src/shared/ipc-contracts/saldo.ts`](../../../app/src/shared/ipc-contracts/saldo.ts) (contract style) · [`app/src/core/query/saldo.ts`](../../../app/src/core/query/saldo.ts) (projection style) · [`app/src/shared/ipc-contracts/tags.ts`](../../../app/src/shared/ipc-contracts/tags.ts) (label model)

---

## 0. Purpose & non-goals

**Purpose:** lock the projection / IPC contract that the M4 view in #69 will consume so that, when M4 opens, implementation starts straight from this spec — no discovery round, no ad-hoc shape negotiation between the renderer and the read model.

**Non-goals (this doc):**

- No code changes. No new IPC handler is registered as part of this spec — it documents the *future* handler.
- No UX decisions: those live in UX-005a; cross-refs only.
- No new event types. The projection is a pure read-model aggregation, exactly like Saldo.
- No materialized buckets, no caching layer (see §4).

## 1. IPC contract sketch

### 1.1 Channel name

```
insights:label-yoy
```

Constant: `IPC_INSIGHTS_LABEL_YOY` (mirrors `IPC_SALDO_GET_COMPARISON` from `saldo.ts`). The dotted "namespace:verb" form (`insights:…`) matches every other contract in `app/src/shared/ipc-contracts/`. The `insights:` prefix opens the namespace for the I-2…I-6 views in UX-005 §3 without renaming this one later.

Suggested file: `app/src/shared/ipc-contracts/insights-label-yoy.ts` (one file per view, not a single mega `insights.ts`, so the contract grows the way `saldo.ts` / `panel.ts` / `movements.ts` already do).

### 1.2 Request shape

```ts
import { z } from 'zod';

export const insightsLabelYoYRequestSchema = z.object({
  // Calendar years to include in the comparison window. MUST be:
  //  - non-empty
  //  - sorted ascending (server is tolerant; renderer should send sorted)
  //  - contiguous (no gaps); spec rejects [2023, 2025]
  //  - between 1 and 5 entries inclusive
  // The CURRENT calendar year MAY be present; if it is, it is treated as the
  // YTD bucket (see §3 and Open Q1).
  // Default surface choice (spec for renderer): last 3 full calendar years +
  // current YTD (4 entries). User can extend to the full 5 (5 entries, still
  // including the YTD year). 1-year requests are technically valid but
  // produce a degenerate single-bar grid — the renderer is expected to
  // refuse them at the control level, not the wire level.
  years: z.array(z.number().int().min(1900).max(2999)).min(1).max(5),

  // Optional account scope. When omitted, aggregates across ALL non-archived
  // accounts (see Open Q3). When present, only transactions whose
  // `accountId === accountId` contribute. Archived accounts are NEVER
  // implicitly included even when `accountId` is omitted.
  accountId: z.string().min(1).optional(),

  // Min number of transactions a label needs in the FULL window (sum across
  // all years in `years`) to qualify for the grid. Pedro-locked default = 3.
  // Labels below the threshold are excluded entirely (NOT rolled into
  // `Otras`) to avoid the long-tail-dominates-Otras trap UX-005a §Q3 flagged.
  minTxCount: z.number().int().min(1).max(100).optional().default(3),

  // Top-N rule. Pedro-locked default = 8 + `Otras` bucket. The server
  // returns AT MOST `topN + 1` rows: the `topN` highest-ranked qualifying
  // labels, plus one synthetic `Otras` row that aggregates the qualifying
  // tail (labels that passed `minTxCount` but lost the Top-N cut).
  // Ranking metric = `windowNetCentsAbs` (see §2).
  topN: z.number().int().min(1).max(50).optional().default(8),

  // Whether archived labels (`TagArchived` event applied) with ≥1
  // transaction in the window are eligible for the grid. Pedro-locked
  // default = true. Archived labels carry `archived: true` in the response
  // so the renderer can apply the muted style + "(archivada)" sublabel
  // (UX-005a §3).
  includeArchived: z.boolean().optional().default(true),

  // Currency is fixed to EUR for v1, mirrored from saldo.ts. Present for
  // forward-compat; server rejects anything else.
  currency: z.literal('EUR').optional(),
});

export type InsightsLabelYoYRequest = z.infer<typeof insightsLabelYoYRequestSchema>;
```

### 1.3 Response shape

This is a **query**, not a mutation, so the WI-19 `{ ok: true, event } | { ok: false, error }` discriminated union does NOT apply (per the brief and per `saldo.ts`, which also returns a plain data object for queries). Errors that genuinely belong on the wire are surfaced via the standard IPC rejection channel (validation failures, internal errors) — same as Saldo.

```ts
export const insightsLabelYoYByYearSchema = z.object({
  year: z.number().int().min(1900).max(2999),
  // Integer cents. Non-negative. `incomeCents` and `expenseCents` are stored
  // separately (NOT a single signed `netCents`) so the renderer can show the
  // income / expense split without re-deriving sign from a net. Mirrors
  // SaldoCategoryNet's `income` / `expense` split.
  incomeCents: z.number().int().nonnegative(),
  expenseCents: z.number().int().nonnegative(),
  // Convenience derived field: `incomeCents - expenseCents`. Server-derived
  // (server-derived-fields pattern, per saldo.ts) so the renderer never
  // recomputes it locally.
  netCents: z.number().int(), // signed
  // Number of DISTINCT transactions that contributed to this (label, year)
  // tile. A multi-label transaction counts once per label-tile (see §3).
  txCount: z.number().int().nonnegative(),
  // True when `year === currentCalendarYear(server-tz)` AND the year is not
  // yet complete. The renderer uses this to apply the YTD hatched-bar
  // treatment (UX-005a §Q4). NEVER projected — Saldo precedent.
  isYtd: z.boolean(),
});
export type InsightsLabelYoYByYear = z.infer<typeof insightsLabelYoYByYearSchema>;

export const insightsLabelYoYRowSchema = z.object({
  // Label identity. `labelId === null` is reserved for the synthetic `Otras`
  // bucket; all real labels have a non-null id.
  labelId: z.string().nullable(),
  // Display name. For `Otras`, the server emits the literal string `"Otras"`
  // (the renderer is free to i18n-key it via `insights.labelYoY.otras`).
  // For deleted labels (no TagRecord found despite events referencing them),
  // emit `null` and let the renderer resolve to a localized "Sin nombre".
  labelName: z.string().nullable(),
  // True iff the label has a `TagArchived` event applied AND no subsequent
  // `TagUnarchived`. Always `false` for the `Otras` bucket.
  archived: z.boolean(),
  // One entry per year in the request `years` array, in the same order.
  // Years where the label has zero transactions still emit a row with
  // zero cents and zero count (so the renderer keeps tile alignment —
  // UX-005a §Q6). Length === request.years.length.
  byYear: z.array(insightsLabelYoYByYearSchema),
  // Sum of `byYear[].txCount`. Used by the renderer for the
  // `min N transactions` empty-state copy and for the rank tooltip.
  windowTxCount: z.number().int().nonnegative(),
  // Sum of `|byYear[].netCents|` across the window. This is the ranking
  // metric for Top-N. Stored as an unsigned integer (nonnegative).
  // Naming: `…CentsAbs` (NOT `…Cents`) to make the absolute-value
  // semantics obvious at the call site.
  windowNetCentsAbs: z.number().int().nonnegative(),
});
export type InsightsLabelYoYRow = z.infer<typeof insightsLabelYoYRowSchema>;

export const insightsLabelYoYResponseSchema = z.object({
  // Echo of the resolved request after defaults are applied. Lets the
  // renderer render its filter chips without tracking pre/post-default
  // state separately (same trick Saldo uses for `currentPeriod.start/end`).
  resolvedRequest: z.object({
    years: z.array(z.number().int()),
    accountId: z.string().nullable(),
    minTxCount: z.number().int(),
    topN: z.number().int(),
    includeArchived: z.boolean(),
  }),
  // The grid rows. Length is AT MOST `topN + 1` (the +1 is `Otras`).
  // Sorted by `windowNetCentsAbs` descending. The `Otras` row, when
  // present, is ALWAYS last regardless of its own magnitude (so the
  // renderer doesn't have to special-case sort).
  rows: z.array(insightsLabelYoYRowSchema),
  // Counts for the section-level footer (UX-005a §Q6: "Etiquetas
  // inactivas" footer). NOT included in `rows`.
  excluded: z.object({
    // Labels that exist but had zero transactions in the entire window.
    inactiveCount: z.number().int().nonnegative(),
    // Labels that had transactions but failed `minTxCount`. Their tx
    // counts are NOT folded into `Otras` (see §1.2 minTxCount note).
    belowMinTxCount: z.number().int().nonnegative(),
    // Labels that qualified but lost the Top-N cut and ARE folded into
    // `Otras` (so the renderer can phrase the `Otras` tooltip honestly:
    // "Resto de N etiquetas").
    foldedIntoOtras: z.number().int().nonnegative(),
  }),
  // Diagnostic: the wall-clock window the server actually used. Useful for
  // the YTD bar end-date label and for QA. ISO YYYY-MM-DD, inclusive.
  windowStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  windowEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type InsightsLabelYoYResponse = z.infer<typeof insightsLabelYoYResponseSchema>;
```

### 1.4 Error shapes

Queries piggy-back on the existing IPC rejection plumbing — no `{ ok: false, error }` envelope. The error families the projection MUST surface as Zod-validated rejection payloads (so the renderer can branch on `code` like it does for tags):

```ts
export const insightsLabelYoYErrorCodeSchema = z.enum([
  'SCHEMA_INVALID',       // Zod parse of the request failed.
  'YEARS_NOT_CONTIGUOUS', // request.years has a gap.
  'ACCOUNT_NOT_FOUND',    // accountId doesn't resolve in the read model.
  'INTERNAL',
]);
```

This mirrors the shape of `tagErrorCodeSchema` from `tags.ts` so the renderer's error-toast helper is identical across surfaces.

## 2. Per-label response row shape — call-outs

The schema in §1.3 is the source of truth; this section calls out the **non-obvious** decisions worth flagging before sign-off.

| Decision | Rationale |
|---|---|
| Cents are integers on the wire (`*Cents: number().int()`). | Repo convention — see `transaction-splits.ts` (`amountCents: z.number().int().positive()`, comment "Integer cents (e.g. 30000 = €300.00) eliminate floating-point drift"). Saldo's `saldo.ts` predates that convention and uses `number().nonnegative()` floats; the new contract aligns with the newer convention rather than the older one. |
| `byYear` is a positional array, not a dict keyed by year. | Matches `saldo.monthlyIncome` / `monthlyExpense` (positional 12-element arrays). Wire is smaller, schema is simpler, ordering is unambiguous. |
| Empty (label, year) tiles are emitted with zero values, not omitted. | UX-005a §Q6 requires the empty bar with the "Sin movimientos en {{year}}" tooltip; omitting the entry would force the renderer to backfill. |
| `Otras` is server-synthesized (one row, `labelId === null`). | Matches the Saldo convention where `categoryId === null` is a meaningful bucket. The renderer never has to compose `Otras` itself. |
| `archived` is per-row, not per-year. | A label is either currently archived or not — per-year archive state would require time-travelling tag events, which we don't have and don't need for v1. |
| Ranking metric = `windowNetCentsAbs` (sum of absolute net per year, then summed). | Matches Pedro-locked "ranked by total magnitude across the window" (§Q2). Using `incomeCents + expenseCents` instead would double-count refunds; using signed `netCents` would let income/expense cancel and demote labels with high churn. |
| `resolvedRequest.accountId` is `string \| null`, NOT `string \| undefined`. | Wire convention from `saldo.ts` (`categoryId: z.string().nullable()`) — `undefined` doesn't survive JSON serialization, `null` does. |

## 3. Aggregation algorithm sketch (prose)

Run on demand against the hydrated read model — no new events, no materialized buckets, exact same shape as `app/src/core/query/saldo.ts` ("one O(n) pass over `model.transactions` at ≤1k-event scale is <5 ms and the IPC round trip dominates").

Pseudo-prose (NOT a code commitment):

1. **Validate request.** Zod-parse → reject with `SCHEMA_INVALID`. Apply defaults (`minTxCount=3`, `topN=8`, `includeArchived=true`). Verify `years` is contiguous → reject `YEARS_NOT_CONTIGUOUS`.
2. **Resolve window boundaries.** `windowStart = ${min(years)}-01-01`, `windowEnd = ${max(years)}-12-31`. If the current calendar year is in `years`, set `windowEnd` to today (server tz; see Open Q1) — this is the YTD partial-year case.
3. **Build label index.** Walk `model.tags` (read model). Capture `labelId → { name, archived }`. Skip archived labels iff `includeArchived === false`.
4. **Filter transactions.** Single pass over `model.transactions`. Drop tx where:
   - `tx.date < windowStart || tx.date > windowEnd`
   - `accountId` is set AND `tx.accountId !== accountId`
   - `tx.tagIds.length === 0` (no labels → no contribution to *any* tile)
5. **Aggregate into a `(labelId, year) → { incomeCents, expenseCents, txCount, txIdSet }` map.** For each surviving tx:
   - Resolve `year = year(tx.date)` (server tz, see Open Q1).
   - For EACH `labelId` in `tx.tagIds` (the multi-label rule):
     - If amount > 0 → `incomeCents += amount`, else `expenseCents += -amount`.
     - `txCount += 1`. (Same tx counted in DIFFERENT label tiles, but only ONCE per (label, year) tile thanks to `txIdSet`-dedup against split rows or duplicate tag refs on a single tx.)
   - **The "amount counts in each tile" rule is by design** (UX-005a §3 / Pedro lock). A €100 tx tagged `Eventos` + `Patrocinadores` contributes €100 to the `Eventos` tile *and* €100 to the `Patrocinadores` tile. `sum(tiles) ≠ grand total` — the renderer is responsible for the disclaimer copy (UX-005a §3, §4 test 3).
6. **Per-label row assembly.** For each labelId encountered:
   - Build the positional `byYear[]` array, padding zero entries for years with no contribution.
   - Compute `netCents = incomeCents - expenseCents`, `isYtd = (year === currentYear) && (windowEnd < ${year}-12-31)`.
   - Compute `windowTxCount = sum(byYear[].txCount)`, `windowNetCentsAbs = sum(|byYear[].netCents|)`.
7. **Apply `minTxCount` filter.** Drop rows where `windowTxCount < minTxCount`. Bump `excluded.belowMinTxCount`.
8. **Top-N selection.** Sort surviving rows by `windowNetCentsAbs` desc. Take the first `topN`. The remainder folds into a single synthetic `Otras` row:
   - `labelId = null`, `labelName = "Otras"`, `archived = false`.
   - Fold `byYear` element-wise (sum cents, sum txCount, OR `isYtd`).
   - Recompute `windowTxCount` / `windowNetCentsAbs` on the folded series.
   - Bump `excluded.foldedIntoOtras` by the count of folded labels.
   - Emit the `Otras` row only when `excluded.foldedIntoOtras > 0`.
9. **`excluded.inactiveCount`** = labels with zero qualifying transactions in the window.
10. **Return** `{ resolvedRequest, rows, excluded, windowStart, windowEnd }`. Sorted: real labels by `windowNetCentsAbs` desc; `Otras` always last.

Complexity: `O(T · L̄)` where `T = |transactions in window|` and `L̄` = average labels per tx (typically ≤2). Memory is bounded by `|labels| × |years|` (≤ 5 × ~100 in realistic NGO datasets).

## 4. Performance budget guess

Saldo's projection comment is the load-bearing precedent: *"one O(n) pass over `model.transactions` at ≤1k-event scale is <5 ms and the IPC round trip dominates"* (`app/src/core/query/saldo.ts:5`).

This view is the same shape with two extra dimensions (label-fan-out and year-fan-out), but the per-tx work is still constant-bounded.

| Scale | Target end-to-end (request → response, IPC included) | Notes |
|---|---|---|
| 1 year × 50 labels × 1 k tx (today's NGO dataset, realistic) | **< 25 ms** | Dominated by IPC round trip. |
| 5 years × 100 labels × 10 k tx (5-year power-user) | **< 200 ms** | The brief's own number. The aggregation itself should be < 50 ms; budget headroom is for serialization of ~500 `byYear` entries. |
| 5 years × 500 labels × 100 k tx (theoretical ceiling, NOT a v1 SLO) | < 1 s | If we ever hit this we revisit with a materialized aggregate, not before. |

**No caching, no materialized buckets in v1.** Reasons: (a) Saldo doesn't have one and is fine; (b) the projection runs once per view open and once per filter change, not per tick; (c) materialization would couple us to event replay timing in ways the M4 schedule doesn't have room to debug.

The M4 implementation MUST add a perf assertion in tests (`docs/perf/` precedent) at the 5-year × 100-label × 10k-event mark.

## 5. Open questions for Pedro / Niobe

The questions Pedro's lock did NOT cover, surfaced here so they're answered before M4 opens (not during):

1. **Year-boundary timezone.** "Year 2025" = `2025-01-01..2025-12-31` in *which* timezone? Saldo uses UTC inclusive day-count for projection (`saldo.ts` comment §Locked semantics) but bucket boundaries are taken from the user-supplied anchor date as-is. For YoY, a transaction on `2024-12-31T23:30:00+01:00` (Madrid) is in 2024 locally and 2025 in UTC — different bucket, different bar. **Recommendation: server tz = the OS local tz the desktop app is running in** (Madrid in practice for our user). Needs explicit Pedro confirmation because it's the kind of decision people only notice when the chart "looks wrong" in January.
2. **YTD definition for the partial-year bar.** Pedro locked "3 full calendar years + current YTD". Is "YTD" = `Jan 1 → today inclusive` (server tz, today's date)? Or `Jan 1 → end of last fully-closed month` (a more stable comparison that doesn't move daily)? **Recommendation: today inclusive** (matches Saldo's `daysElapsed` semantic), but confirm with Niobe because it interacts with the YTD bar visual treatment.
3. **Account scope when `accountId` is omitted.** Two reasonable defaults: (a) all non-archived accounts (current spec assumption, matches Saldo), or (b) all accounts including archived (for historical fidelity in a multi-year window where an account may have been archived mid-window). **Recommendation: (a) — non-archived only —** with a follow-up enhancement to optionally include archived accounts via an explicit flag. UX-005 §4 says Insights does NOT inherit Saldo's filters; this is the place to lock the *default*.
4. **`Otras` interaction with `minTxCount`.** Spec says labels failing `minTxCount` are dropped, NOT folded into `Otras` (rationale: avoid the long-tail-dominates-Otras trap from UX-005a §Q3). Confirm this is what Pedro meant — alternative reading is "include in Otras but not as top-N candidates".
5. **`labelId === null` collision.** We use `null` for the synthetic `Otras` bucket. Do any pre-existing tx events carry an explicit `null` tagId from older imports that we'd accidentally bucket as `Otras`? Quick read-model audit needed at M4 open. (Saldo has the same convention for `categoryId === null` and survives, so likely fine.)
6. **Multi-currency.** v1 assumes EUR-only (mirroring `saldo.ts`). When (if) the app gains multi-currency, this contract needs a `currency` discriminator on each `byYear` entry, not just the top-level request — flagging now so the v1 contract doesn't pretend the question doesn't exist.

## 6. Cross-references & status

- **UX parent:** [UX-005 — Insights section IA](../../ux/specs/ux-005-insights-section-ia.md)
- **UX feature:** [UX-005a — Per-label YoY sketch](../../ux/specs/ux-005a-label-yoy-sketch.md)
- **Issue:** [#69](https://github.com/rett-europe/opentreasury-desktop/issues/69)
- **IPC precedent:** [`app/src/shared/ipc-contracts/saldo.ts`](../../../app/src/shared/ipc-contracts/saldo.ts)
- **Projection precedent:** [`app/src/core/query/saldo.ts`](../../../app/src/core/query/saldo.ts)
- **Label model:** [`app/src/shared/ipc-contracts/tags.ts`](../../../app/src/shared/ipc-contracts/tags.ts)

---

**Status: DRAFT.** This spec graduates to v1.0 when **both** Niobe (UX) and Pedro (PM) sign off on §5's open questions. Until then, it is not an implementation reference.
