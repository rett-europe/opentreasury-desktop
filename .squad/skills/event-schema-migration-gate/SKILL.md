# Skill: Event Schema Migration Gate

**Owner:** Cypher (Tester)  
**Created:** 2026-04-23  
**Last Updated:** 2026-04-23  

## Purpose

Prevent event schema migrations from silently breaking event producers (seed scripts, IPC handlers) by adding load-replay smoke tests that run on every PR.

## When to Use

Apply this skill whenever:
1. Adding required fields to existing event types (e.g., `sortOrder` in WI-23)
2. Changing event type names (e.g., `account.created` → `AccountCreated`)
3. Changing event envelope shapes (e.g., nested payload → flat)
4. Adding boot-guard validation rules (e.g., reject legacy event types)

## Pattern

### 1. Update ALL Event Producers

When modifying an event schema, update every producer:
- Main seeder (`app/src/main/devSeed.ts`)
- Perf seeder (`scripts/perf-seed.mjs`)
- IPC handlers that emit those event types (`app/src/main/ipc/handlers/*.ts`)
- Test fixtures (if any)

**Gotcha:** Don't just update the schema Zod definition. Producers won't fail at compile-time if they emit events missing required fields (Zod validation happens at runtime in the EventLog).

### 2. Add Load-Replay Smoke Test

Create a test that:
1. Generates seed data (use small N for speed: 100 tx is plenty)
2. Loads through the actual `EventLog` implementation (exercises boot-guard + Zod validation)
3. Validates the new required fields are present
4. Runs on PR branches (not just `main`)

**Test structure:**
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { JsonFileEventLog, LEGACY_EVENT_TYPE_REJECTED } from './JsonFileEventLog.js';

describe('Event log load-replay smoke', () => {
  let tempDir: string;
  let eventsFile: string;

  beforeAll(async () => {
    // Create temp dir in project (NOT /tmp per instructions)
    tempDir = join(process.cwd(), '.test-seed-' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });
    eventsFile = join(tempDir, 'events.ndjson');

    // Run seed with small count
    execSync(`npm run perf:seed -- --count=100 --out="${eventsFile}"`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should load seeded events without boot-guard rejection', async () => {
    const log = new JsonFileEventLog({ dir: tempDir });

    let events;
    try {
      events = await log.load();
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && err.code === LEGACY_EVENT_TYPE_REJECTED) {
        throw new Error(
          `Boot-guard rejected legacy event: ${err.message}\n` +
            'Fix the seeder to emit unified schema events.'
        );
      }
      throw err;
    }

    expect(events.length).toBeGreaterThan(0);
  });

  it('should validate required fields on config events', async () => {
    const log = new JsonFileEventLog({ dir: tempDir });
    const events = await log.load();

    const accountEvents = events.filter((e) => e.type === 'AccountCreated');
    for (const evt of accountEvents) {
      expect(evt).toHaveProperty('sortOrder');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(typeof (evt as any).sortOrder).toBe('number');
    }
  });
});
```

**File location:** Place in `app/src/core/eventLog/` (co-located with `JsonFileEventLog.ts`). Vitest config picks up all `app/src/**/*.test.ts` files, so it runs on `npm test`.

### 3. Add Boot-Guard Validation (If Breaking)

If the schema change is breaking (legacy events should be refused):

1. **Add rejection logic in `JsonFileEventLog.load()`:**
   ```typescript
   const LEGACY_EVENT_TYPES = new Set(['account.created', 'category.created', 'tag.created']);

   async load(): Promise<DomainEvent[]> {
     // ... line-by-line parse ...
     const parsed = JSON.parse(line);
     
     if (LEGACY_EVENT_TYPES.has(parsed.type)) {
       const err = new Error(
         `Refused legacy event type: ${parsed.type}. ` +
         'Run migration script to convert old events to unified schema.'
       );
       (err as any).code = LEGACY_EVENT_TYPE_REJECTED;
       throw err;
     }
     
     // ... Zod validation ...
   }
   ```

2. **Add negative test case:**
   ```typescript
   it('should reject events with legacy type names', async () => {
     const legacyDir = join(process.cwd(), '.test-legacy-' + Date.now());
     await fs.mkdir(legacyDir, { recursive: true });

     const legacyEventsFile = join(legacyDir, 'events.ndjson');
     const legacyEvent = {
       id: '01234567890123456789012345',
       type: 'account.created',
       // ... legacy shape ...
     };

     await fs.writeFile(legacyEventsFile, JSON.stringify(legacyEvent) + '\n', 'utf8');

     const log = new JsonFileEventLog({ dir: legacyDir });
     await expect(log.load()).rejects.toThrow(/account\.created/);

     await fs.rm(legacyDir, { recursive: true, force: true });
   });
   ```

### 4. Wire into CI

If using the default vitest config (`include: ['app/src/**/*.test.ts']`), the test auto-runs on `npm test`, which `.github/workflows/ci.yml` calls on every PR.

**No additional CI wiring needed** — just place the test in the right location (`app/src/`).

## Example: WI-23 Schema Migration

**Problem:** WI-23 unified three event types and added required `sortOrder` field:
- `account.created` → `AccountCreated` (flat, with `sortOrder`)
- `category.created` → `CategoryCreated` (flat, with `sortOrder`)
- `tag.created` → `TagCreated` (flat, with `sortOrder`)

**Applied pattern:**
1. Updated `devSeed.ts` to emit unified shapes (already done in WI-23)
2. Updated `perf-seed.mjs` to emit unified shapes (PR #26 fix)
3. Added `event-log-smoke.test.ts` with 5 test cases:
   - Load-replay validation
   - `sortOrder` validation for each config event type
   - Legacy event rejection test
4. Boot-guard already present in `JsonFileEventLog.ts` (lines 19-52)

**Outcome:**
- All 552 tests pass (+5 new)
- Future PRs that change config event schemas will fail if they forget to update seeders
- Boot-guard exercised on every PR (not just when manually running the app)

## Key Learnings

**Why load-replay, not just unit-test the schema?**  
Unit tests of Zod schemas don't catch producer bugs. Load-replay exercises the full path:
1. Seed script generates events
2. Events written to NDJSON
3. `JsonFileEventLog.load()` reads + validates (boot-guard + Zod)
4. Events populate read model

This catches:
- Producer emitting wrong shape (e.g., nested payload when flat expected)
- Missing required fields (e.g., forgot `sortOrder`)
- Boot-guard rules (e.g., legacy type rejection)

**Why small seed count (100 tx)?**  
Boot-guard + Zod validation happens event-by-event. 100 tx + 44 ref-data (144 total) is enough to exercise all event types. Larger counts just add redundant overhead (~4s vs ~30s+).

**Why temp dir in project, not /tmp?**  
Per instructions, `/tmp` is forbidden. Use `join(process.cwd(), '.test-seed-' + Date.now())` for temp files. These are gitignored (`.test-seed-*` pattern) and cleaned in `afterAll`.

**What if temp cleanup fails?**  
Rare (test framework guarantees `afterAll` runs). If it does fail, `.test-seed-*` dirs are gitignored and cleaned on next test run (new timestamp).

## Antipatterns

**❌ Only update the Zod schema, forget the producers**  
Producers won't fail at compile-time. Runtime Zod validation will fail, but only when the event is loaded (too late).

**❌ Only update `devSeed.ts`, forget `perf-seed.mjs`**  
Perf harness becomes unusable. CI won't catch it unless the perf gate runs (main only). Load-replay test prevents this.

**❌ Run full perf-seed (2500 tx) in CI**  
Too slow (~30s+). Use small count (100 tx) for smoke test, large count only for actual perf benchmarks.

**❌ Skip negative test case (legacy rejection)**  
Boot-guard logic may drift over time. Explicitly test that legacy events ARE rejected to prevent regressions.

**❌ Use `/tmp` for temp files**  
Forbidden per instructions. Use `join(process.cwd(), '.test-seed-...')`.

## Reusable Checklist

When migrating event schemas:

- [ ] Update Zod schema definitions (`app/src/core/events/schemas.ts`)
- [ ] Update `app/src/main/devSeed.ts` to emit new shape
- [ ] Update `scripts/perf-seed.mjs` to emit new shape
- [ ] Update IPC handlers that emit those event types
- [ ] Add boot-guard validation if breaking (reject legacy events)
- [ ] Add load-replay smoke test in `app/src/core/eventLog/*.test.ts`:
  - [ ] Positive case: load seed, validate new required fields
  - [ ] Negative case (if breaking): verify legacy events rejected
- [ ] Run `npm test` locally — smoke test should pass
- [ ] Run `npm run perf:seed` locally — events should load cleanly
- [ ] Push PR — CI runs smoke test on every branch

## References

- Decision: `.squad/decisions/inbox/cypher-pr26-load-replay-gate.md`
- Test implementation: `app/src/core/eventLog/event-log-smoke.test.ts`
- Boot-guard: `app/src/core/eventLog/JsonFileEventLog.ts` lines 19-52
- WI-23 schema migration policy: `docs/security/security-requirements-v0.1.md` §"Schema migration policy" Strategy 3
