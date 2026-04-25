# Decision: WI-23 Legacy Event Backfill Policy

**Date:** 2026-04-23  
**Author:** Morpheus (Backend Dev)  
**Status:** Active  
**Related:** PR #26 (WI-23 unify projections), PR #50 (WI-23 legacy backfill)

## Context

WI-23 (PR #26, sha 66987de) made `sortOrder` required on `AccountCreated`, `CategoryCreated`, `SubcategoryCreated`, and `TagCreated` events. Existing on-disk `events.ndjson` files (dev/empty data, production data) predate WI-23 and lack `sortOrder`. Boot-guard refused to load them, **making the app unbootable for anyone with pre-WI-23 data.**

### Reproduction
```bash
npm run dev:empty
# Error: [JsonFileEventLog] WI-23: malformed "AccountCreated" event at line 1 —
# [{ code: "invalid_type", expected: "number", received: "undefined", path: ["sortOrder"], message: "Required" }]
```

### Root Cause
- `JsonFileEventLog.load()` validates config events with strict Zod schemas
- Pre-WI-23 events missing `sortOrder` trigger `UNIFIED_EVENT_SCHEMA_INVALID`
- Cypher's smoke gate (PR #26) tested freshly-seeded data only — didn't catch this because the seeder was rewritten in the same PR

## Decision

**Schema migrations MUST include a backfill path for existing on-disk data.**

When adding required fields to existing event types:
1. Make the field `.optional()` in the Zod schema
2. Add a migration/backfill step in `JsonFileEventLog.load()` to assign defaults when missing
3. Document the backfill logic inline with comments (e.g., `// WI-23 legacy backfill`)
4. New event writes MUST always include the field (handlers remain strict)
5. Smoke gate MUST test both fresh-seeded data AND legacy fixtures (pre-migration shape)

## Rationale

**Why backfill instead of reject?**
- Rejecting breaks the app for existing users (unacceptable UX)
- Event log is append-only — we can't rewrite on-disk data
- Backfill at load time is non-destructive and preserves user data

**Why make schemas optional?**
- Allows Zod validation to pass for legacy events
- New writes remain strict (handlers enforce required fields at write time)
- Clear signal that the field is required going forward but tolerated on legacy reads

**Why document inline?**
- Future maintainers understand why a field is optional in the schema but required in practice
- Backfill logic is co-located with validation logic for discoverability

## Implementation (WI-23 Legacy Backfill)

**Fix approach (PR #50):**
1. Made `sortOrder` `.optional()` in event schemas (with inline comments)
2. Added backfill step in `JsonFileEventLog.load()`:
   - Tracks per-entity-type counters (`AccountCreated`, `CategoryCreated`, `SubcategoryCreated`, `TagCreated`)
   - Assigns sequential indexes (0, 1, 2...) to events missing `sortOrder`
   - Preserves existing user ordering by order-of-appearance
3. Updated WI-23 boot-guard tests to validate backfill instead of rejection

**Data safety:**
- No data destruction — only adds missing field at load time
- Does not modify on-disk `events.ndjson` (append-only contract preserved)
- Independent counters per entity type
- Preserves user's existing ordering

**Testing:**
- ✅ All 556 tests pass
- ✅ `npm run dev:empty` boots successfully (2372 events loaded)
- ✅ Lint + format checks pass

## Process Improvement

**Gap identified:** PR #26's smoke gate only tested freshly-seeded data, missing the legacy fixture case.

**Companion fix (Cypher):** Extending smoke gate to test both:
1. Fresh-seeded data (current)
2. Legacy fixtures (pre-migration event shapes)

See `.squad/skills/event-schema-migration-gate/SKILL.md` for the full pattern.

## Future Work

When migrating other event types:
- [ ] Follow the backfill pattern from WI-23
- [ ] Add both positive (fresh seed) and negative (legacy fixture) smoke tests
- [ ] Document why fields are optional in schemas (inline comments)

## References

- PR #26: WI-23 unify projections (introduced breaking change)
- PR #50: WI-23 legacy backfill (this fix)
- `.squad/skills/event-schema-migration-gate/SKILL.md`: smoke gate pattern
- `docs/security/security-requirements-v0.1.md` §"Schema migration policy": Strategy 3 precedent
