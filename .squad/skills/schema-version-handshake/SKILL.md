# Skill: Schema-Version Handshake

**Pattern:** Safe folder-opening logic for multi-version compatibility  
**First used:** #206 (Dataset compatibility & validation)  
**Reusability:** High — applies to any file format or folder structure with versioned schemas

## Problem

When opening a data folder (or file), how do you safely determine whether the data format is compatible with the current app?

Common scenarios:
- User upgrades app (new app, old data)
- User downgrades app (old app, new data from different device)
- User opens data created by incompatible tool
- User imports data from another source

Simple version checks (`folder.version < app.version` → accept) are insufficient because:
- Going backward in versions is not always safe
- Migrations may not exist for all version pairs
- Some schema changes are non-breaking; others are breaking

## Solution: 6-Rule Handshake

A handshake determines if a folder is safe to open by answering: **"Can I safely interpret this data?"**

### The 6 Rules (Decision Tree)

```
1. Check: folder.schemaVersion > app.CURRENT_SCHEMA_VERSION?
   → YES: REJECT (app too old; user must upgrade)
   → NO: continue

2. Check: folder.schemaVersion < app.CURRENT_SCHEMA_VERSION?
   → NO: ACCEPT (version match; silent, no dialog)
   → YES: continue to rule 3

3. Check: Does a migration path exist from folder.schemaVersion → app.CURRENT_SCHEMA_VERSION?
   → NO: REJECT (app cannot upgrade this old format)
   → YES: OFFER migration (user confirms → run migration)

4. Check: folder is corrupt (metadata unreadable, unparseable, schema-invalid)?
   → YES: REJECT (hard; not bypassable)
   → NO: continue

5. Check: folder contains foreign data (events without metadata)?
   → YES: REJECT (cannot determine workspace identity)
   → NO: continue

6. Check: folder datasetId matches current workspace?
   → NO: REJECT (bypassable via explicit user confirmation)
   → YES: ACCEPT (silent)
```

### Error Codes (Canonical Mapping)

| Rule | Error Code | Bypassable | UX Action |
|------|-----------|-----------|-----------|
| 1 | `SCHEMA_TOO_NEW` | No | "Update app" dialog |
| 3 (no migration) | `SCHEMA_TOO_OLD_NO_MIGRATION` | No | "Contact support" dialog |
| 3 (migration available) | `SCHEMA_MIGRATION_AVAILABLE` | Partial (confirm migration) | "Upgrade folder?" dialog |
| 4 | `DATASET_CORRUPT` | No | "Restore from backup" dialog |
| 5 | `DATASET_MISMATCH` (foreign) | No | "Choose different folder" dialog |
| 6 | `DATASET_MISMATCH` (datasetId) | Yes (via flag) | "Switch workspace?" dialog |

## Implementation Pattern

### Structure

```typescript
// Orchestrator (entry point)
async function handleOpenFolder(folderPath: string): Promise<HandshakeResult> {
  const metadata = await loadMetadata(folderPath);
  return performHandshake(metadata, currentAppState);
}

// Handshake decision engine
async function performHandshake(
  metadata: FolderMetadata | null,
  currentAppState: AppState,
): Promise<HandshakeResult> {
  // Rule 4: Corruption check
  if (metadata === null || metadata.isCorrupt) {
    return { ok: false, code: 'METADATA_CORRUPT', ... };
  }

  // Rule 1: Schema too new
  if (metadata.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return { ok: false, code: 'SCHEMA_TOO_NEW', ... };
  }

  // Rule 3: Schema too old (migration?)
  if (metadata.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const migration = findMigrationPath(metadata.schemaVersion, CURRENT_SCHEMA_VERSION);
    if (!migration) {
      return { ok: false, code: 'SCHEMA_TOO_OLD_NO_MIGRATION', ... };
    }
    // Migration available: return special code allowing user opt-in
    return { ok: false, code: 'SCHEMA_MIGRATION_AVAILABLE', migration, ... };
  }

  // Rule 5: Foreign data check
  if (await hasEventsWithoutMetadata(folderPath)) {
    return { ok: false, code: 'DATASET_MISMATCH_FOREIGN', ... };
  }

  // Rule 6: Workspace identity check
  if (currentAppState.datasetId !== null && metadata.datasetId !== currentAppState.datasetId) {
    return { ok: false, code: 'DATASET_MISMATCH', needsConfirm: true, ... };
  }

  // All checks passed
  return { ok: true };
}
```

### Testing Matrix

For any new schema version, test these scenarios:

```typescript
describe('Schema-version handshake', () => {
  // Old app + new schema
  describe('app.CURRENT < folder.schemaVersion', () => {
    it('rejects with SCHEMA_TOO_NEW', () => {
      // Simulate: folder v2, app v1
      // Expect: SCHEMA_TOO_NEW, not bypassable
    });
  });

  // New app + old schema (with migration)
  describe('app.CURRENT > folder.schemaVersion (migration available)', () => {
    it('returns SCHEMA_MIGRATION_AVAILABLE', () => {
      // Simulate: folder v1, app v2, migration v1→v2 exists
      // Expect: SCHEMA_MIGRATION_AVAILABLE (user can confirm)
    });

    it('runs migration on user confirm', () => {
      // Simulate: user clicks "Upgrade folder"
      // Expect: migration runs, folder updated to v2, app continues
    });
  });

  // New app + old schema (no migration)
  describe('app.CURRENT > folder.schemaVersion (no migration)', () => {
    it('rejects with SCHEMA_TOO_OLD_NO_MIGRATION', () => {
      // Simulate: folder v0, app v2, no migration v0→v2
      // Expect: SCHEMA_TOO_OLD_NO_MIGRATION, not bypassable
    });
  });

  // Corruption
  describe('corrupted metadata', () => {
    it('rejects with METADATA_CORRUPT', () => {
      // Simulate: metadata file unparseable or schema-invalid
      // Expect: METADATA_CORRUPT, not bypassable
    });
  });

  // Version match
  describe('version match', () => {
    it('accepts silently', () => {
      // Simulate: folder v1, app v1, valid metadata
      // Expect: ok: true (no dialog)
    });
  });
});
```

## Variants & Extensions

### Optional: Manifest for Fast Validation

To avoid re-parsing entire data files on every open, use a lightweight manifest:

```json
{
  "schemaVersion": 1,
  "datasetId": "01HQ...",
  "eventCount": 1234,
  "lastEventId": "01HQ...",
  "lastEventHash": "sha256(...)"
}
```

On open, validate manifest against actual data (one quick scan). If mismatch, data is corrupted.

### Conditional: First-Run Adoption

When there is no current app state (first-run, onboarding):
- Skip rule 6 (datasetId check) — we are adopting the first workspace
- Still enforce rules 1, 3, 4, 5 (absolute refusals)

This allows "open existing workspace" flow in onboarding without confusing users with "switch workspace?" dialog.

## Real-World Example: OpenTreasury Desktop (#206)

**Context:** NGO data folder with `dataset.json` + `events.ndjson`

**Handshake in action:**

```
User selects: C:\Users\Maria\OneDrive\treasury-data\

1. Load C:\Users\Maria\OneDrive\treasury-data\dataset.json
   ✓ Parses OK; schemaVersion = 1

2. Check: 1 > CURRENT_SCHEMA_VERSION (1)?
   ✗ No

3. Check: 1 < CURRENT_SCHEMA_VERSION (1)?
   ✗ No (version match!)

4. Check: metadata corrupt?
   ✗ No (parsed + schema-valid)

5. Check: events without metadata?
   ✗ No (dataset.json exists)

6. Check: datasetId match?
   ✓ Yes (current = "01HQ...", folder = "01HQ...")

→ ACCEPT (silent; no dialog)
```

**Alternate scenario: older schema**

```
User selects: C:\backup\treasury-v0\  (old backup with schemaVersion = 0)

1. Load metadata
   ✓ Parses OK; schemaVersion = 0

2. Check: 0 > CURRENT (1)?
   ✗ No

3. Check: 0 < CURRENT (1)?
   ✓ Yes (older schema!)

   → Check migration: v0 → v1 available?
   ✓ Yes (migration code exists)

   → OFFER: "Upgrade folder?" dialog
   → User clicks "Upgrade"
   → Run migration (back up original, update events, update metadata)
   → Continue with hydration

→ ACCEPT (after migration)
```

## See Also

- Issue: #206 (Dataset compatibility & validation)
- Spec: `docs/specs/dataset-compatibility-validation.md`
- Implementation: `app/src/main/ipc/handlers/config.ts:detectDatasetMismatch()`
- Testing: `app/src/main/ipc/handlers/config.test.ts`
