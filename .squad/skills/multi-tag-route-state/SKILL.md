# Skill: multi-tag-route-state

> Handing off filter context from one screen to another in a routerless React shell.

## When to use this skill

Two screens analyse the same underlying data with different cuts (e.g. Insights drilldown ↔ Movimientos pre-filtered list). You need a "see all transactions →" link that drops the user into the second screen with the EXACT same filter context — multi-tag intersection + date window — so the aggregates they were just looking at match the rows that show up.

The codebase has no real router yet; routes are `useState<Route>` in `App.tsx`. This skill is the lightweight pattern that mirrors what a real router would give you, without committing to one prematurely.

## The shape

Three pieces:

1. **A `Route` enum entry** for any screen that needs deep params (e.g. `'insights-detail'`). The bare route string is still navigation, but it's no longer enough to render — the screen also needs params.

2. **A separate state slice in `App.tsx`** carrying the params:

   ```ts
   type InsightsDetailState = {
     readonly tagIds: ReadonlyArray<string>;
     readonly windowStart: string; // ISO YYYY-MM-DD
     readonly windowEnd: string;
   };
   const [insightsDetail, setInsightsDetail] = useState<InsightsDetailState | null>(null);
   ```

3. **One-shot initial-filter props** on the destination screen (e.g. `MovementsScreen.initialFilters?: { tagIds, windowStart, windowEnd }`). Read once via state initialisers — subsequent prop changes do NOT re-apply. This is context-handoff data, not a controlled prop.

## The contract surface

Two callbacks bind the screens together:

- **Source → router:** the originating screen exposes a callback like `onSeeAllMovements(filters)` that the App-level wrapper translates into a state update + route switch.
- **Sidebar nav clears the handoff:** `App.tsx` zeroes both the source state slice (`insightsDetail`) and any pending handoff (`movementsInitialFilters`) when the user clicks a sidebar item, so stale context cannot reapply on a later free-form visit.

```ts
// App.tsx
const handleNavigate = useCallback((next: Route) => {
  setMovementsInitialFilters(null);
  if (next !== 'insights-detail') setInsightsDetail(null);
  setRoute(next);
}, []);
```

## Filter semantics MUST match the analytical view

If the drilldown view aggregates with AND semantics on the tag list (every requested tag must be present), Movimientos's `tagIds` filter MUST also be AND. Otherwise the aggregate the user was looking at and the row list they get pre-filtered to will disagree, which destroys the entire reason for the handoff.

## Future router migration

When a real router is introduced, the App-level state slices collapse into route params with **zero contract surface change** to the destination screens. Their `initialFilters` prop already takes plain serialisable strings; only the wiring in `App.tsx` changes.

Recommended URL contract for that day (proposed in `.squad/decisions/inbox/trinity-insights-drilldown-ui.md`):

- Repeated query params for arrays: `?tag=<id>&tag=<id>` — one entry per multi-valued item.
- ISO dates as discrete params: `?from=YYYY-MM-DD&to=YYYY-MM-DD`.
- Avoid comma-joined ids in path segments — they read poorly and don't survive bookmarks well.

## Anti-patterns

- ❌ Stuffing the params into a global context. Route-scoped state is route-scoped; lift it to App.tsx, not to a provider that lives forever.
- ❌ Persisting cross-screen handoff state to localStorage. It's one-shot. If the user reloads, they expect to see Movimientos with their persisted filters, not a stale tag intersection from three sessions ago.
- ❌ Making the destination screen "controlled" by the handoff prop. Once the user lands, they own the filters; subsequent changes to the prop must not re-apply.

## Reference implementation

- `app/src/renderer/App.tsx` — route + slice wiring.
- `app/src/renderer/screens/InsightsDetailScreen/InsightsDetailScreen.tsx` — source screen with `onSeeAllMovements`.
- `app/src/renderer/screens/MovementsScreen/MovementsScreen.tsx` — destination screen with `initialFilters` prop applied via state initialisers.
- Decision drop: `.squad/decisions/inbox/trinity-insights-drilldown-ui.md`.
