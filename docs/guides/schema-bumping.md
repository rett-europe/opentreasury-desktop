# Schema Bumping Guide

**Audience:** Developers bumping `CURRENT_SCHEMA_VERSION` in `app/src/main/dataset.ts`.  
**Status:** Living document — update this checklist as we learn from real schema migrations.  
**Related Spec:** [`dataset-compatibility-validation.md`](../specs/dataset-compatibility-validation.md)

---

## When to Bump the Schema Version

Bump `CURRENT_SCHEMA_VERSION` in `app/src/main/dataset.ts` when making **forward-incompatible** changes to the on-disk event format or structure.

### Breaking Changes (require schema bump)

- ✅ Adding a **required** field to event payloads
- ✅ Renaming an existing field (old apps won't know the new name)
- ✅ Changing a field's type (e.g., `string` → `number`)
- ✅ Removing a field that old app versions depend on
- ✅ Changing event type names (e.g., `TransactionCreated` → `TransactionCreatedV2`)
- ✅ Splitting one event type into multiple types
- ✅ Changing the structure of `events.ndjson` (e.g., adding metadata rows)

### Non-Breaking Changes (no schema bump needed)

- ❌ Adding an **optional** field with a default (old apps ignore it; new apps use it)
- ❌ Adding a new event type (old apps skip unknown types)
- ❌ Fixing typos in user-facing strings (not part of schema)
- ❌ Changing internal logic without altering event structure

**Rule of thumb:** If an older app would fail to read or correctly interpret events written by the new app, bump the schema.

---

## Checklist for Schema Bumps

Use this checklist when bumping the schema version (e.g., v1 → v2).

### 1. Update `CURRENT_SCHEMA_VERSION`

**File:** `app/src/main/dataset.ts`

```typescript
/**
 * Current dataset.json schema version. Bumped when we introduce a
 * forward-incompatible change to on-disk layout.
 */
export const CURRENT_SCHEMA_VERSION = 2 as const; // was: 1
```

**Commit message:** Include the schema bump in the feature commit message (e.g., `feat(schema): add sortOrder to config events (v1→v2)`).

---

### 2. Author the Migration

**File:** `app/src/core/migrations/v1-to-v2.ts` (or `vN-to-vN+1.ts`)

Use this template:

```typescript
// Migration from schema v1 to v2 — adds sortOrder to config events.
//
// Breaking change: config events now require a `sortOrder` field. Older apps
// do not know about this field and will not write it. This migration backfills
// `sortOrder: 0` for all existing config events.
//
// @see docs/specs/dataset-compatibility-validation.md § Migration Framework

import type { Migration } from './types.js';
import type { DomainEvent } from '../event-log/types.js';

export const v1ToV2: Migration = {
  sourceVersion: 1,
  targetVersion: 2,
  name: 'v1 to v2: Add sortOrder to config events',

  async canRun(events: readonly DomainEvent[]) {
    // Pre-flight check: ensure all events are v1 format (no v2 fields present)
    const hasV2Fields = events.some((e) => 'sortOrder' in (e.payload as object));
    if (hasV2Fields) {
      return { ok: false, reason: 'Some events already have v2 fields. Migration not needed.' };
    }
    return { ok: true };
  },

  async run(events: readonly DomainEvent[]) {
    return events.map((e) => {
      if (e.eventType.startsWith('Config')) {
        // Add sortOrder field to config events
        return {
          ...e,
          payload: { ...e.payload, sortOrder: 0 },
        };
      }
      return e; // Non-config events unchanged
    });
  },
};
```

**Key points:**

- `canRun()` validates pre-conditions (e.g., no v2 fields already present).
- `run()` transforms events in-memory. Orchestrator handles backup and persistence.
- Document the **breaking change** and **why** the migration is needed in the file header.

---

### 3. Register the Migration

**File:** `app/src/core/migrations/index.ts`

Import and register the migration in the global `migrationRegistry`:

```typescript
import { v1ToV2 } from './v1-to-v2.js';

export const migrationRegistry: MigrationRegistry = new Map([
  ['1->2', v1ToV2],
  // Future: ['2->3', v2ToV3],
]);
```

---

### 4. Write Tests

**File:** `app/src/core/migrations/test/v1-to-v2.test.ts`

Test the migration logic in isolation:

```typescript
import { describe, it, expect } from 'vitest';
import { v1ToV2 } from '../v1-to-v2.js';
import type { DomainEvent } from '../../event-log/types.js';

describe('v1 to v2 migration', () => {
  it('adds sortOrder to config events', async () => {
    const v1Events: DomainEvent[] = [
      {
        eventId: 'evt1',
        eventType: 'ConfigAccountCreated',
        eventVersion: 1,
        datasetId: 'ds1',
        actorDeviceId: 'dev1',
        actorUserId: 'usr1',
        actorIdentitySource: 'local',
        createdAt: '2026-01-01T00:00:00Z',
        payload: { name: 'Cash' },
      },
    ];

    const result = await v1ToV2.run(v1Events);

    expect(result[0].payload).toHaveProperty('sortOrder', 0);
  });

  it('leaves non-config events unchanged', async () => {
    const v1Events: DomainEvent[] = [
      {
        eventId: 'evt2',
        eventType: 'TransactionCreated',
        eventVersion: 1,
        datasetId: 'ds1',
        actorDeviceId: 'dev1',
        actorUserId: 'usr1',
        actorIdentitySource: 'local',
        createdAt: '2026-01-01T00:00:00Z',
        payload: { amount: 100 },
      },
    ];

    const result = await v1ToV2.run(v1Events);

    expect(result[0].payload).not.toHaveProperty('sortOrder');
  });
});
```

**Also test the full chain:**

Update `app/src/core/migrations/test/chain.test.ts` to include real migrations in the multi-hop test (replace mocks with actual registered migrations).

---

### 5. Update Error Code Catalogue

**File:** `docs/specs/error-codes.md`

Ensure the error codes `SCHEMA_TOO_OLD_NO_MIGRATION` and `SCHEMA_MIGRATION_AVAILABLE` are up-to-date with the new migration path.

Example update:

```markdown
### `SCHEMA_MIGRATION_AVAILABLE`

**When:** `folder.schemaVersion < app.CURRENT_SCHEMA_VERSION` AND migration(s) exist from `v{N} → v{N+1} ... → v{CURRENT}`

**Example:** Folder is v1, app is v2, migration v1→v2 is registered.
```

---

### 6. Validate

Run the full test suite and validation commands:

```bash
cd C:\rettx\opentreasury-desktop
npm run typecheck  # ✅ No type errors
npm run lint       # ✅ No lint errors
npm run format:check # ✅ No format errors
npm run test       # ✅ All tests pass (including new migration tests)
```

**Manual fixture test:**

1. Create a test folder with v1 events (`dataset.json` with `schemaVersion: 1`).
2. Boot the app with `CURRENT_SCHEMA_VERSION = 2`.
3. Switch to the test folder.
4. Verify:
   - Migration is offered (not forced).
   - User clicks "Upgrade" → migration runs → backup created.
   - Events are upgraded correctly → folder now has `schemaVersion: 2`.

---

### 7. Update Release Notes

**File:** `CHANGELOG.md` or GitHub release notes

Include a clear, actionable migration notice:

```markdown
## v0.2.0 — Schema v2

### ⚠️ Breaking Changes

**Data folder schema upgrade required.**

This release introduces schema v2, which adds `sortOrder` to configuration events. If you have an existing data folder from v0.1 (schema v1):

- The app will detect the older schema and offer to upgrade the folder.
- **Upgrading is optional** — you can keep using v0.1 until you're ready.
- A backup (`events.ndjson.backup-{timestamp}`) will be created before upgrading.
- **Downgrading:** If you need to revert to v0.1 after upgrading, restore the backup file manually.

**What changed:** Config events (accounts, categories, tags) now include a `sortOrder` field for custom ordering. Existing events are backfilled with `sortOrder: 0`.
```

**Template (copy this for future bumps):**

```markdown
## v{X.Y.Z} — Schema v{N}

### ⚠️ Breaking Changes

**Data folder schema upgrade required.**

This release introduces schema v{N}, which [describe change]. If you have an existing data folder from v{X-1.Y.Z} (schema v{N-1}):

- The app will detect the older schema and offer to upgrade the folder.
- **Upgrading is optional** — you can keep using the older app version until you're ready.
- A backup will be created before upgrading.
- **Downgrading:** If you need to revert after upgrading, restore the backup file manually.

**What changed:** [Describe transformation in user-facing terms.]
```

---

### 8. Pre-Merge Checklist

Before merging the PR:

- [ ] `CURRENT_SCHEMA_VERSION` incremented in `dataset.ts`
- [ ] Migration file created (`vN-to-vN+1.ts`) and registered in `index.ts`
- [ ] Migration has both `canRun()` and `run()` logic
- [ ] Unit tests for the migration exist and pass
- [ ] `chain.test.ts` updated to test multi-hop scenarios (if applicable)
- [ ] Error code catalogue (`error-codes.md`) updated if error messages changed
- [ ] Manual fixture upgrade tested (create v1 folder → upgrade to v2 → verify correctness)
- [ ] Release notes drafted with migration UX copy
- [ ] All validation commands pass (`typecheck`, `lint`, `format:check`, `test`)

---

## Sequential Migration Example (v1 → v3)

If a user on schema v1 upgrades to an app with schema v3, the migration chain walks v1 → v2 → v3:

```typescript
// Registered migrations
migrationRegistry.set('1->2', v1ToV2);
migrationRegistry.set('2->3', v2ToV3);

// User clicks "Upgrade folder" on a v1 dataset
const result = await runMigrations(events, 1, 3);

// Orchestrator runs:
// 1. v1ToV2.canRun(events) ✅
// 2. v1ToV2.run(events) → v2Events
// 3. v2ToV3.canRun(v2Events) ✅
// 4. v2ToV3.run(v2Events) → v3Events
// 5. Write v3Events to events.ndjson
// 6. Update dataset.json: schemaVersion = 3
```

**Key decision:** User clicks "Upgrade" **once**. The orchestrator walks the full chain without additional prompts (per #206 binding decision).

---

## Common Pitfalls

### 1. Forgetting to update `dataset.json`

After running migrations, the caller (e.g., `config:setDataDir` handler) must update `dataset.json` to reflect the new schema version:

```typescript
const result = await runMigrations(events, 1, 2);
if (result.ok) {
  // Persist migrated events
  await fs.writeFile('events.ndjson', ...);
  
  // Update dataset.json
  const dataset = await loadDatasetMetadata(dataDir);
  dataset.schemaVersion = 2;
  await fs.writeFile('dataset.json', JSON.stringify(dataset, null, 2));
}
```

### 2. Not backing up before migration

The orchestrator does **not** create backups — that's the caller's job:

```typescript
// Caller must back up before calling runMigrations()
const backupPath = `${dataDir}/events.ndjson.backup-${Date.now()}`;
await fs.copyFile(`${dataDir}/events.ndjson`, backupPath);

const result = await runMigrations(events, 1, 2);
if (!result.ok) {
  console.error('Migration failed, backup preserved at:', backupPath);
}
```

### 3. Breaking migration chains

If you ship v2 without a `1->2` migration, users on v1 will see `SCHEMA_TOO_OLD_NO_MIGRATION`. Always ship the migration in the same release as the schema bump.

---

## Future: Required Migrations

For M1, all migrations are **optional** (per #206 binding decision). In future releases (M2+), we may introduce **required** migrations:

- Older app versions would reject the folder on boot if a required migration has not been run.
- Newer app versions would auto-run required migrations on first boot.

When that time comes, update this guide with:

- How to mark a migration as "required" (e.g., `required: true` in `Migration` interface).
- UX flow for auto-migrations (progress indicator, error handling).

---

## See Also

- **Spec:** [`dataset-compatibility-validation.md`](../specs/dataset-compatibility-validation.md) § Migration Framework
- **Error Catalogue:** [`error-codes.md`](../specs/error-codes.md)
- **Migration Types:** `app/src/core/migrations/types.ts`
- **Migration Orchestrator:** `app/src/core/migrations/index.ts`
- **Test Matrix:** `app/src/core/migrations/test/chain.test.ts`
