# Skill — Server-Derived Fields in IPC Contracts

> **Draft** · Extracted from WI-22 Saldo thin spec (2026-04-22, Neo).

## Problem

Whenever the same derived value (projection, computed total, formatted label, rollup) would otherwise be computed on **both** sides of the IPC boundary — main process for some purposes (tests, exports) and renderer for display — you get:

- Float-order-of-operations drift (`a/b*c` vs `a*c/b`).
- Timezone / rounding inconsistency (main uses UTC, renderer uses `new Date()` local).
- Double surface area for property tests.
- Silent bugs when one side adds an edge case the other side misses.

## Pattern

**Push every derived field to the server response as a required field. The renderer renders it verbatim — never recomputes.**

Concretely:

- If you have a raw input `x` and a formula `f(x)`, the Zod response schema includes both `x` and `f(x)` as required fields.
- The renderer destructures `f(x)` and displays it. It must not call `f` itself.
- If `f(x) === x` when a condition is false (e.g., projection of a complete period), server returns `x` in that field. Renderer stays branchless.

## When to apply

- Any aggregation screen (Saldo, Panel, future reports).
- Any screen where totals / projections / deltas are displayed alongside their raw inputs.
- Anywhere a property test would otherwise need to run on both main and renderer.

## When NOT to apply

- Pure presentational formatting that depends on active locale (`Intl.NumberFormat`, `Intl.DateTimeFormat`). Locale lives in the renderer; main doesn't know it. Format in the renderer; send raw numbers + ISO dates over the wire.
- Derived fields that change per-interaction (hover state, selection). Those are client state.

## Example (WI-22)

```ts
// ❌ ANTI-PATTERN: renderer recomputes projection
const projected = row.currentTotal / response.elapsedFraction;

// ✅ PATTERN: server returns projection pre-computed
const projected = row.currentProjectedTotal; // always present, equals currentTotal if period complete
```

Schema:

```ts
categoryBreakdownRowSchema = z.object({
  currentTotal: z.number(),
  currentProjectedTotal: z.number(), // REQUIRED, not optional
  // ...
});
```

## Trade-offs

- **Response size.** 2× fields for the projected set. For <500 rows this is irrelevant.
- **Schema verbosity.** Accepted cost. Explicit is safer than clever.
- **Server complexity.** Formula lives in one place. Net reduction.

## Related

- `.squad/skills/config-screen-pattern/` — sibling pattern for CRUD config screens.
- WI-22 thin spec: `.squad/decisions/inbox/neo-wi22-saldo-thinspec.md` §5, §8 risk 1.
