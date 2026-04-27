# Trinity — Insights drilldown UI (PR 4b/4)

**Date:** 2026-05-03
**Author:** Trinity (Frontend Developer)
**Branch:** `squad/insights-drilldown-ui`
**Pairs with:** Morpheus's `squad/insights-drilldown-ipc` (PR 4a/4) — depends on those contracts being on `main`.

This is a contract-relevant decision drop covering frontend choices on URL/router state and the
Movimientos cross-screen handoff. None of these block Morpheus's work; they document things future
contributors (and a future router migration) need to know.

## D1 — Drilldown route is encoded as Route + state slice, not a real URL

The renderer still has no router (`App.tsx` uses `useState<Route>` plus per-feature state slices).
Spec §4.1 calls for `?tag=...` query params; we don't have them yet.

**Decision:** Add `'insights-detail'` to the `Route` union and carry `{ tagIds: string[],
windowStart: string, windowEnd: string }` in a separate `insightsDetail` state slice in `App.tsx`.
`onTagsChange([])` returns the user to the landing route. Sidebar navigation clears the slice so
state can't bleed across visits. When a real router lands, this collapses into route params with
zero contract surface change.

**URL serialization (proposed for the future router):** `?tag=<id>&tag=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD`.
Multi-tag uses repeated `tag` params (matches Morpheus's IPC contract `tagIds: string[]`). The
shorthand `:tagIdsSerialized` from the original task brief was rejected — comma-joined IDs in a
path segment are awkward to navigate to from anywhere outside the landing screen; repeated query
params are more idiomatic.

## D2 — Movimientos cross-screen filter handoff (OQ-3)

Spec §4.2 + OQ-3 require the drilldown footer link to drop the user into Movimientos with both
the active tag intersection AND date range pre-applied. Movimientos previously accepted neither.

**Decision:** Add an optional `initialFilters?: { tagIds?: string[], windowStart?: string,
windowEnd?: string }` prop to `MovementsScreen`. Values are applied on first mount only (via
state initializers); subsequent prop changes do not re-apply. This is one-shot context-handoff
data, not a controlled prop.

**Tag filter semantics:** AND (a movement must carry every requested tag). This matches the
intersection semantics of the drilldown view itself.

**Date filter:** When both `windowStart` and `windowEnd` are present, the date filter initializes
to `kind: 'custom'`. Otherwise it falls back to `loadPersistedDateFilter()` (existing behaviour).
The custom range is intentionally NOT persisted (existing rule, see `movementsDateFilter.ts`).

**Sidebar nav clears the handoff:** `App.tsx` zeros `movementsInitialFilters` when the user
navigates via the sidebar so a stale handoff can't reapply on a later free-form visit.

## D3 — Provisional handling deferred to no-op

The original task brief allowed scaffolding against a best-guess IPC shape. By the time
Trinity sat down to build, Morpheus's branch already contained the final contracts on
`squad/insights-drilldown-ipc` (commit `c4bf4f8`). Trinity's branch is therefore based on
Morpheus's tip, not on `main`, and uses the actual `insights:label-*` types. The merge order
remains: Morpheus's PR lands on `main` first, then Trinity rebases.

## D4 — `archived` tag filter for combiner

§7 Q4 says archived tags appear on the landing but are NOT shown in the combiner dropdown.
`TagRecord` exposes `archivedAt?: string` (not a boolean `archived`); the combiner filters on
`!tag.archivedAt`. No new contract; just calling out the field name for whoever lands the next
"hide archived" filter elsewhere.
