---
name: "period-selector-ipc-binding"
description: "Bind a segmented-control period selector to an IPC refetch with a tagged-union state machine — no cancellation tokens, no debounce, deterministic anchor derivation."
domain: "renderer-state"
confidence: "high"
source: "earned"
---

## Context

Use this pattern for any screen where a small set of mutually-exclusive user choices (period, granularity, account) must drive an idempotent IPC query and re-render the whole screen against the returned payload. Examples in this codebase: `SaldoScreen` (`Año | Trimestre | Mes`), Movements type filter (`All | Income | Expense`).

Signals you want this pattern:
- The user's choice is a small enum (≤ 5 values).
- Each change triggers one IPC call; there is no Apply button.
- The response is large enough to warrant a loading/error/loaded state machine.
- Query params can be derived deterministically from `(choice, now)` — no hidden dependencies.

## Patterns

1. **Segmented control = `role="radiogroup"` with chip buttons.** Reuse the `ot-filter-bar__chip` CSS the Movements filter already uses. Arrow-key traversal comes from the native semantics + keyboard focus on the active chip.

2. **Local state is the choice, not the data.** Store only `useState<Enum>('default')` in the screen. The data is derived:
   ```ts
   const [period, setPeriod] = useState<SaldoPeriod>('ano');
   const [state, setState] = useState<ScreenState>({ kind: 'loading' });
   useEffect(() => { void fetchData(period); }, [period, fetchData]);
   ```

3. **Tagged-union screen state.** One `ScreenState = { kind: 'loading' } | { kind: 'loaded'; data } | { kind: 'error'; message }` is cleaner than three booleans. TypeScript narrows perfectly and tests can drive each branch independently.

4. **Deterministic anchor derivation.** Never trust a raw `new Date()` inside a component. Wrap it in a pure helper you can unit-test:
   ```ts
   function computeAnchor(period: SaldoPeriod, now: Date): string { ... }
   ```
   Call site: `computeAnchor(period, new Date())`. If tests ever need to pin time, inject `now`.

5. **Refetch is `useCallback` wrapping a try/catch.** No `AbortController` needed at this scale — React's rerender overwrite + last-write-wins is fine because users don't change the period 10× per second. If the query becomes expensive, add an in-flight guard before complicating the code.

6. **Server-derived fields rendered verbatim.** If the backend computes a projection/delta, the renderer picks (projected vs raw) but never multiplies. Any local math — `classifyDelta`, `(current - prior) / |prior|` — is for presentation only (glyph, a11y label).

7. **Default choice in one place.** `useState<SaldoPeriod>('ano')` — no shadow default in the options array, no "is this checked?" compare against a const scattered across files.

## Examples

- `app/src/renderer/screens/SaldoScreen/SaldoScreen.tsx` — full implementation: `PeriodSelector` component + `useEffect([period, fetchData])` + tagged-union state + `computeAnchor()` helper.
- `app/src/renderer/screens/MovementsScreen/MovementsScreen.tsx:612-656` — the segmented-control chip primitive the selector is cloned from.

## Anti-Patterns

- ❌ Storing both the choice AND a cached response in parallel: makes it easy for them to drift. Keep one source of truth + a `useEffect`.
- ❌ Computing the IPC anchor inside JSX: `new Date()` on every render creates a new object and breaks `useEffect` dependency stability.
- ❌ Using a `<select>` for a 3-choice period: violates the consistency Pedro called out (2026-04-19 category-screen feedback). Segmented control is the locked primitive.
- ❌ Recomputing projections on the renderer because "the contract didn't include a projected field": if it doesn't, amend the contract rather than duplicating math across Morpheus and Trinity.
- ❌ Adding an `AbortController` before you have evidence of a race. Premature.
