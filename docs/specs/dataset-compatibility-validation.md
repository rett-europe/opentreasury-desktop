# Dataset Compatibility & Validation: Design Specification

**Issue:** #206  
**Status:** ✅ Approved — Ready for implementation  
**Author:** Niobe (Spec/UX Analyst)  
**Date:** 2026-05-03  
**Audience:** Pedro, Trinity (implementer), Morpheus (implementer), Neo (decomposer)

---

## Problem Statement

OpenTreasury Desktop currently has basic dataset folder detection and mismatch guards, but lacks a **comprehensive schema version handshake**, **corruption detection framework**, and **forward-compatibility plan**. When a user switches datasets or the app boots, we need to:

1. **Establish `dataset.json` as the authoritative metadata source** for `datasetId`, `schemaVersion`, `appVersion`, and `createdAt` (currently implemented but undocumented).
2. **Define schema-version rules** — when to accept, migrate, or reject a dataset based on app version vs. folder version.
3. **Detect and surface corruption early** — at switch time, not during hydration, so users see actionable error messages.
4. **Classify folder states** — empty (new workspace), valid OT workspace, or foreign (non-OT data).
5. **Plan for forward compatibility** — how schema bumps will work, where migration code lives, and how to test old/new schema interop.

This spec establishes the **single source of truth** for these decisions so implementation can proceed with confidence.

---

## Goals & Non-Goals

### Goals
- ✅ Document `dataset.json` as the authoritative metadata file and its canonical schema.
- ✅ Define the schema-version handshake: rules for accept/migrate/reject/upgrade decisions.
- ✅ Specify error codes, detection points, and user-facing copy for each error state.
- ✅ Establish a corruption-detection framework (what to check, when to check, how to surface).
- ✅ Define a folder-kind detection state machine (empty, valid OT, foreign).
- ✅ Outline a migration framework (no implementation — just the shape and where code will live).
- ✅ Provide acceptance criteria and work decomposition for Neo.

### Non-Goals
- ❌ Implement schema migrations, error handling, or any code.
- ❌ Design the visual error dialogs (that's Mouse's job).
- ❌ Implement multi-device sync or CRDT conflict resolution (that's M2).
- ❌ Specify encryption or secrets storage (that's Switch's job).
- ❌ Define the export/import workflow in detail (Pedro owns that).

---

## Proposed Schema

### dataset.json Structure & TypeScript Interface

**File location:** `<dataDir>/dataset.json`

**Purpose:** The single source of truth for workspace identity, schema version, and creation timestamp.

```typescript
/**
 * Canonical dataset metadata file — created on first event-log initialization,
 * never deleted or migrated.
 *
 * This is the AUTHORITATIVE record for:
 * - datasetId: stable ULID uniquely identifying this workspace
 * - schemaVersion: forward-compat sentinel; bumped on breaking schema changes
 * - appVersion: best-effort app version that created/last touched this dataset
 * - createdAt: ISO 8601 UTC timestamp of dataset creation
 *
 * CRITICAL RULE: Do NOT regenerate or mutate this file after creation.
 * It is append-only metadata. If it is missing or corrupt, the dataset is unrecoverable.
 */
export interface Dataset {
  /**
   * Stable ULID (26 chars, base32) uniquely identifying this dataset / workspace.
   * Generated once at creation; never changes.
   * Used to prevent accidental co-mingling of events from different datasets.
   * 
   * Example: "01HQEP4JR2TNJYBSY5AX75XG16"
   */
  datasetId: string; // length: 26

  /**
   * ISO 8601 UTC timestamp when this dataset.json was first created.
   * Example: "2026-04-20T12:34:56.789Z"
   */
  createdAt: string; // datetime format

  /**
   * Schema version of the dataset folder structure and events format.
   * Bumped when forward-incompatible changes are introduced.
   * 
   * CURRENT_SCHEMA_VERSION = 1 (defined in app/src/main/dataset.ts)
   * 
   * Rules:
   * - folder.schemaVersion > app.CURRENT_SCHEMA_VERSION => REJECT (app too old; upgrade required)
   * - folder.schemaVersion < app.CURRENT_SCHEMA_VERSION => MIGRATE (if migration available) or REJECT
   * - folder.schemaVersion === app.CURRENT_SCHEMA_VERSION => ACCEPT (silent switch)
   * 
   * When reading a legacy dataset.json (created before schemaVersion was added),
   * this field is treated as 1 (default). No file regeneration occurs; we silently
   * assume backward-compat.
   */
  schemaVersion: number; // positive integer, default: 1

  /**
   * Best-effort app version that created or last updated this dataset.json.
   * Recorded at creation time (via loadDatasetId(dir, { appVersion: ... })).
   * 
   * OPTIONAL — may be absent in legacy dataset.json files.
   * 
   * Use case: In future, audit trails or recovery flows may want to know
   * which app version wrote the last event. This field is informational only
   * (not enforced in the handshake).
   * 
   * Example: "0.1.0-beta.3"
   */
  appVersion?: string;
}

/**
 * Zod validation schema (from app/src/main/dataset.ts)
 */
export const datasetSchema = z.object({
  datasetId: z.string().length(26),
  createdAt: z.string().datetime(),
  schemaVersion: z.number().int().positive().default(1),
  appVersion: z.string().optional(),
});

export const CURRENT_SCHEMA_VERSION = 1;
```

### Backward Compatibility Rules

**Legacy dataset.json (v0 / absent `schemaVersion`)**
- When read, treat as `schemaVersion: 1` (default value).
- Do NOT regenerate the file just to add `schemaVersion` or `appVersion`.
- The app proceeds as if the file had declared `{ schemaVersion: 1 }`.

**Migration Path from v0 → v1+**
- A v0 dataset (missing `schemaVersion` field) is assumed to be v1-compatible.
- When a future schema v2 is introduced, a v0 dataset must undergo migration.
- The migration code (e.g., `app/src/core/migrations/v0-to-v1.ts` or later) handles the transition.
- **Do NOT auto-regenerate the file** — migrations are opt-in and explicit.

---

## Schema-Version Handshake

The handshake runs when a user switches datasets or the app boots to a new folder. It answers: **"Can I safely open this folder's events?"**

### Decision Tree

```
┌─ Load <dataDir>/dataset.json
│
├─ MISSING: No dataset.json in folder
│  │
│  ├─ Check: Does events.ndjson exist and is non-empty?
│  │  ├─ YES → "Foreign folder" (legacy events, no identity) → REJECT
│  │  └─ NO  → "Empty folder" (new workspace) → ACCEPT
│  │
│  └─ (First-run state: above always accepts because currentDatasetId === null)
│
├─ CORRUPT: dataset.json exists but cannot be parsed or fails schema
│  │
│  └─ → ERROR: DATASET_CORRUPT → REJECT (not bypassable)
│
└─ OK: dataset.json parsed and schema-valid
   │
   ├─ Check: folder.schemaVersion > app.CURRENT_SCHEMA_VERSION?
   │  ├─ YES → ERROR: SCHEMA_TOO_NEW → REJECT (app is outdated; upgrade required)
   │  └─ NO  (continue)
   │
   ├─ Check: currentDatasetId !== null AND folder.datasetId !== currentDatasetId?
   │  ├─ YES → ERROR: DATASET_MISMATCH (workspace switch) → REJECT (or CONFIRM on user bypass)
   │  ├─ NO  (folder matches OR first-run state)
   │  └─ (Continue)
   │
   ├─ Check: folder.schemaVersion < app.CURRENT_SCHEMA_VERSION?
   │  ├─ YES → Check: Is migration available from v{N} to v{N+1}...v{CURRENT}?
   │  │  ├─ YES → MIGRATE (optional; user confirms → run migrations → accept)
   │  │  └─ NO  → ERROR: SCHEMA_TOO_OLD_NO_MIGRATION → REJECT
   │  └─ NO  (folder.schemaVersion === app.CURRENT_SCHEMA_VERSION)
   │
   └─ ACCEPT (silent switch; proceed to hydrate)
```

### Handshake Rules (Detailed)

#### Rule 1: SCHEMA_TOO_NEW (app is outdated)
- **When:** `folder.schemaVersion > app.CURRENT_SCHEMA_VERSION`
- **Why:** A newer app (or newer data format) was used on this dataset. This app is too old to safely interpret the data.
- **Action:** REJECT (not bypassable)
- **Detect at:** Dataset switch time (`config:setDataDir` → `detectDatasetMismatch()`)
- **Surface at:** Renderer's folder-picker modal
- **User copy:** "This folder was created with a newer version of OpenTreasury. Update the app to continue. [Check for updates]"

#### Rule 2: SCHEMA_TOO_OLD_NO_MIGRATION (folder version < app version, but no migration path)
- **When:** `folder.schemaVersion < app.CURRENT_SCHEMA_VERSION` AND no migration chain is defined or available
- **Why:** The folder uses an old data format. We don't know how to upgrade it safely.
- **Action:** REJECT (not bypassable; may be allowed in future if migration is added)
- **Detect at:** Dataset switch time
- **Surface at:** Renderer's folder-picker modal
- **User copy:** "This folder uses an older data format (v{folderVersion}). Automatic upgrade not yet available. Contact support or use a newer app version that supports this format."

#### Rule 3: SCHEMA_MIGRATION_AVAILABLE (optional upgrade offered)
- **When:** `folder.schemaVersion < app.CURRENT_SCHEMA_VERSION` AND migration(s) exist from v{N} → v{N+1}...v{CURRENT}
- **Why:** We can upgrade the folder safely. User is given the option.
- **Action:** OFFER migration (user confirms in dialog → run migration chain → accept)
- **Detect at:** Dataset switch time
- **Surface at:** Renderer's folder-picker modal with "Upgrade folder" button
- **User copy:** 
  - **Prompt:** "This folder uses an older data format (v{folderVersion}) but can be upgraded to v{CURRENT}. Upgrading is optional — you can keep using it as-is, or upgrade now for new features. [Keep as-is] [Upgrade folder]"
  - **On migrate start:** "Upgrading folder… this may take a moment."
  - **On migrate success:** "Folder upgraded to v{CURRENT}. The backup is saved to `{backupPath}`."
  - **On migrate fail:** "Upgrade failed: {detailError}. Your original data is untouched."

#### Rule 4: DATASET_MISMATCH (datasetId differs)
- **When:** `currentDatasetId !== null` AND `folder.datasetId !== currentDatasetId`
- **Why:** User is trying to switch to a workspace with a different identity (prevents accidental co-mingling of data).
- **Action:** REJECT (bypassable via `confirmDatasetSwitch` flag)
- **Detect at:** Dataset switch time
- **Surface at:** Renderer's folder-picker modal with workspace-switch confirmation dialog
- **User copy:**
  - **Prompt:** "Switch workspace? You are currently using workspace `{currentDatasetId.slice(0,8)}...` ({currentEventCount} transactions). The selected folder contains workspace `{newDatasetId.slice(0,8)}...` ({newEventCount} transactions). All data remains on disk — this just changes which workspace is active. [Cancel] [Switch workspace]"
  - **Detail message (optional):** "If you selected this folder by mistake, click Cancel. If you meant to switch to this workspace, click 'Switch workspace'."

#### Rule 5: DATASET_MISMATCH (foreign — legacy events without dataset.json)
- **When:** `meta.status === 'missing'` AND `events.ndjson` exists and is non-empty
- **Why:** The folder contains events but no dataset.json, meaning it's either:
  - Pre-dataset.json legacy OT data (no identity recorded), or
  - Non-OT data (incompatible event format)
- **Action:** REJECT (not bypassable — we cannot determine workspace identity)
- **Detect at:** Dataset switch time
- **Surface at:** Renderer's folder-picker modal
- **User copy:** "Cannot determine workspace identity. This folder contains events but no dataset.json metadata file. Please choose an empty folder or a folder with a valid dataset.json file."

#### Rule 6: SILENT ACCEPT (no action needed)
- **When:** 
  - Empty folder (no dataset.json, no events.ndjson), OR
  - `folder.datasetId === currentDatasetId` (same workspace, safe to continue), OR
  - `folder.schemaVersion === app.CURRENT_SCHEMA_VERSION` (version match)
- **Why:** Nothing to validate — the folder is safe to use.
- **Action:** Accept silently (no dialog; proceed to hydration)

---

## Corruption Detection & Integrity Checking

### Detection Points (When to Check)

Corruption checks happen at **two phases:**

1. **Metadata phase (early, before hydration):** Check `dataset.json` and folder structure.
   - Location: `config:setDataDir` handler → `detectDatasetMismatch()`
   - Goal: Fail fast before loading events
   - Surface: Error dialog in folder-picker modal

2. **Hydration phase (during event replay):** Check events.ndjson line-by-line.
   - Location: `JsonFileEventLog.load()` → event parsing
   - Goal: Catch file-level corruption (truncated lines, invalid JSON)
   - Surface: Error on app boot; user must switch folders or restore from backup

### Corruption Detectable States

#### C1: dataset.json Missing or Unreadable
- **Sign:** `loadDatasetMetadata()` returns `{ status: 'corrupt' }`
- **Cause:** File I/O error, permission denied, or disk issue
- **Check code:** `loadDatasetMetadata()` in `app/src/main/dataset.ts`
- **Surface:** `DATASET_CORRUPT` error code
- **UX Copy:** "Cannot read the dataset metadata file ({path}). {detailError}. Ensure the folder is readable and has at least 10 KB free."

#### C2: dataset.json Invalid JSON
- **Sign:** File exists but `JSON.parse()` fails
- **Cause:** File corruption, incomplete write (crash mid-fsync), or user manual edit
- **Check code:** `loadDatasetMetadata()` catches `JSON.parse()` exception
- **Surface:** `DATASET_CORRUPT` error code
- **UX Copy:** "The dataset metadata file is corrupted (invalid JSON). If you have a backup, restore it. Otherwise, you may need to start fresh. {errorDetail}"

#### C3: dataset.json Schema Validation Fails
- **Sign:** JSON parses but Zod schema validation fails (missing required field, wrong type)
- **Cause:** Incomplete write (missing `datasetId` field), app version mismatch, or user manual edit
- **Check code:** `datasetSchema.safeParse()` in `loadDatasetMetadata()`
- **Surface:** `DATASET_CORRUPT` error code
- **UX Copy:** "The dataset metadata is incomplete or invalid. {detailError}. This may indicate a disk error or incomplete write. Try restoring from a backup."

#### C4: events.ndjson Zero-Byte (Empty File)
- **Sign:** `stat(events.ndjson).size === 0`
- **Cause:** New workspace (expected), or file was truncated / overwritten (unexpected)
- **Check code:** No explicit check needed — handled by `load()` returning `[]`
- **Surface:** No error (empty dataset is valid)
- **UX Copy:** N/A (empty is normal; no notification)

#### C5: events.ndjson Truncated (Incomplete Last Line)
- **Sign:** Last line in file is incomplete JSON (e.g., `{"type":"Account.Created","id":"01HQ...` without closing `}` or newline)
- **Cause:** Process crash during `writeFile()` + `fsync()`, or power loss mid-write
- **Check code:** `JsonFileEventLog.load()` wraps `JSON.parse()` in try-catch and skips malformed lines with a console warning
- **Surface:** 
  - Recoverable: Last event is silently dropped; app continues (see log warning in console)
  - If entire file is corrupted: Raises error during hydration
- **UX Copy:** 
  - **At boot (if recoverable):** Console warning logged; no user notification (transparent recovery)
  - **At boot (if unrecoverable):** "Failed to load events: {errorDetail}. Please restore from backup or switch folders."

#### C6: events.ndjson Mid-File Corruption (Invalid JSON, Interior Line)
- **Sign:** `JSON.parse()` fails on a line that is NOT the last line (indicates real corruption, not incomplete write)
- **Cause:** Disk corruption, file system error, or concurrent write conflict
- **Check code:** `JsonFileEventLog.load()` tries `JSON.parse()` on every line; skips malformed ones
- **Surface:** 
  - Console warning for skipped line
  - If entire file becomes unreadable, hydration fails
- **UX Copy:** 
  - **Console:** `[JsonFileEventLog] skipping malformed line 42 in {path}`
  - **At boot (if hydration fails):** "Failed to load events from disk. Some data may be lost. Restore from backup or start fresh. {detailError}"

#### C7: events.ndjson Hydration Failure (Read Model Divergence)
- **Sign:** Events parse OK but replay into read model fails (e.g., event references non-existent account, invalid state transition)
- **Cause:** 
  - Logic bug in reducer
  - Manually edited events.ndjson (user modified JSON)
  - Incomplete migration (missing event field after schema change)
- **Check code:** Error thrown during `replayEvents()` in bootstrap
- **Surface:** App fails to boot; user cannot recover without code changes
- **UX Copy:** "Failed to hydrate the dataset. This indicates a data integrity issue. Contact support with the error details: {stackTrace}"

#### C8: events.ndjson Last-Event Timestamp Chronological (Useful for Validation)
- **Sign:** Not a corruption per se, but can indicate that writes are out of order or clock-skewed
- **Check code:** OPTIONAL manifest could track `lastEventId`, `lastEventTimestamp`, `eventCount`
- **Surface:** Advisory only (not a hard rejection)
- **UX Copy:** N/A

### Optional Manifest File (Cheap Proofs)

To enable fast corruption detection without re-parsing events.ndjson, we can introduce an optional `dataset-manifest.json`:

```typescript
interface DatasetManifest {
  /** ISO 8601 UTC timestamp when manifest was last written */
  manifestAt: string;
  
  /** Total number of lines in events.ndjson (lines > 0, excluding trailing newline) */
  eventCount: number;
  
  /** ULID of the last event appended (deterministic proof of file integrity) */
  lastEventId: string;
  
  /** SHA256 or CRC32 of the last event JSON (or full file hash for belt-and-suspenders) */
  lastEventHash?: string;
  
  /** Optional: app version when this manifest was written */
  appVersion?: string;
}
```

**When to write manifest:**
- After every `append()` or `appendBatch()` in `JsonFileEventLog`
- Atomically with the events append (same tmp → fsync → rename pattern)

**When to use manifest:**
- At dataset switch time: compute actual eventCount and lastEventId from events.ndjson tail, compare to manifest
  - If mismatch: warn user ("Dataset may be corrupted; run integrity check")
  - If match: proceed (cheap proof)
- At app boot: same check

**Benefit:** Without re-parsing the entire events.ndjson, we can quickly spot file truncation or corruption.

**Non-blocking:** If manifest is missing or outdated, the app still works; we just lose the optimization. This is not a hard requirement for M1.

---

## Folder Kind Detection

### States & Transitions

A dataset folder can exist in one of three mutually-exclusive states:

```
┌─────────────────────────────────────────────────────────┐
│ START: User selects a folder via file picker            │
└────────────────────┬────────────────────────────────────┘
                     │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
    EMPTY       VALID_OT    FOREIGN
    ─────       ────────    ───────
    No files    Has dataset.json  Events but no dataset.json
    or empty    + events.ndjson   (legacy or non-OT data)
    events.ndjson
```

### State: EMPTY
- **Detection:** 
  - No `dataset.json` in folder, AND
  - No `events.ndjson` OR `events.ndjson` has zero bytes
- **Meaning:** Fresh workspace — no data exists yet
- **Action:** 
  - If first-run (currentDatasetId === null): ACCEPT (adopt folder as new workspace)
  - If switching (currentDatasetId !== null): ACCEPT (new workspace with same dataset ID)
- **Next step:** Create new `dataset.json` with fresh datasetId on first event append

### State: VALID_OT
- **Detection:**
  - `dataset.json` exists and parses successfully AND
  - `dataset.json` schema validates (Zod check passes)
- **Meaning:** This is an OpenTreasury workspace — we know its identity
- **Action:** 
  - Run schema-version checks (see Handshake)
  - Check datasetId match (see Handshake)
  - Proceed based on handshake outcome
- **Next step:** Accept or reject based on handshake rules

### State: FOREIGN
- **Detection:**
  - No `dataset.json` (or corrupt `dataset.json`), AND
  - `events.ndjson` exists and has size > 0
- **Meaning:** Events exist, but we cannot determine workspace identity (pre-dataset.json legacy or non-OT data)
- **Action:** REJECT (not bypassable)
  - We cannot safely open this folder because we don't know if the events belong to the current workspace or a foreign one
  - User must choose an empty folder or provide the correct `dataset.json`
- **Next step:** Error dialog; user picks different folder

### First-Run Special Case (Onboarding Pending)

When the app boots without a configured `dataDir` (first-run or fresh install):

- **Bootstrap state:** `isOnboardingPending() === true`
- **currentDatasetId:** `null` (not yet set)
- **Folder validation:**
  - EMPTY: ✅ ACCEPT (will be first workspace)
  - VALID_OT: ✅ ACCEPT (adopt existing workspace — no DATASET_MISMATCH check)
  - FOREIGN: ❌ REJECT (cannot open legacy events without dataset.json, even on first-run)
  - CORRUPT: ❌ REJECT (cannot proceed with corrupt metadata)
  - SCHEMA_TOO_NEW: ❌ REJECT (still refuse — app is too old)

**Rationale:** On first-run, we skip the datasetId-mismatch check (because there's no "current" workspace to mismatch against), but we still enforce absolute refusals: corruption, foreign legacy events, and schema incompatibility.

---

## Error Catalogue

### Error Codes (Authoritative Reference)

Each error code appears in the IPC response (`ConfigSetDataDirResponse.error.code`) and maps to a specific failure mode.

| Code | When Raised | Bypassable | Detect Point | User-Facing Copy |
|------|-------------|-----------|--------------|------------------|
| `SCHEMA_INVALID` | Request payload fails schema check | No | Validation (early) | "Invalid request. Please try again." |
| `INVALID_LOCATION` | Folder path is under userData | No | Validation | "Data folder cannot be in the app's local folder (${userData}). Choose a cloud folder or external drive." |
| `SAME_DIR` | New folder equals current folder | No | Validation | "The selected folder is the same as the current one." |
| `NOT_WRITABLE` | Cannot write to folder (perms, disk full, etc.) | No | Validation | "Cannot write to the selected folder: {errMessage}. Check permissions and disk space." |
| `DATASET_MISMATCH` | datasetId differs OR foreign events without dataset.json | Yes (datasetId only; foreign is hard reject) | Handshake | "Switch workspace? [details]: Current workspace: {currentId}; New workspace: {newId}. [Cancel] [Switch workspace]" |
| `SCHEMA_TOO_NEW` | folder.schemaVersion > app.CURRENT_SCHEMA_VERSION | No | Handshake | "This folder requires a newer app. Update OpenTreasury to continue." |
| `SCHEMA_TOO_OLD_NO_MIGRATION` | folder.schemaVersion < app.CURRENT_SCHEMA_VERSION AND no migration | No | Handshake | "This folder uses an older format that cannot be upgraded automatically. Contact support or use a compatible app version." |
| `SCHEMA_MIGRATION_AVAILABLE` | folder.schemaVersion < app.CURRENT_SCHEMA_VERSION AND migration exists | Partial (user confirms migration) | Handshake | "This folder uses an older format. Upgrade now? [Keep as-is] [Upgrade folder]" |
| `DATASET_CORRUPT` | dataset.json unreadable, unparseable, or schema-invalid | No | Handshake | "The dataset metadata is corrupted. {detailError}. Restore from backup or choose another folder." |
| `WRITE_FAILED` | Cannot persist new appConfig | No | Persistence | "Failed to save configuration: {errMessage}. Try again." |

### Error Details Object

For certain codes, the IPC response includes a `details` object with machine-readable context:

```typescript
export interface ConfigSetDataDirResponse {
  ok: false;
  error: {
    code: string; // one of the above
    message: string; // user-facing copy
    details?: {
      // For DATASET_MISMATCH / SCHEMA_TOO_NEW / etc.
      currentDatasetId?: string;
      newDatasetId?: string;
      schemaVersion?: number; // folder's schemaVersion
      folderSchemaVersion?: number;
      appSchemaVersion?: number;
    };
  };
}
```

---

## Migration Framework Outline

(Implementation details are NOT in this spec; this section defines the **shape** for future code.)

### Migration Architecture

**Location:** `app/src/core/migrations/`

**Structure:**

```
app/src/core/migrations/
├── index.ts                    # Exports migration chain orchestrator
├── v0-to-v1.ts                 # Migrate from implicit v0 (no schemaVersion) to v1
├── v1-to-v2.ts                 # (Future) Migrate from v1 to v2
├── v2-to-v3.ts                 # (Future) Migrate from v2 to v3
├── types.ts                     # Migration result types, error codes
└── test/
    ├── v0-to-v1.test.ts
    └── chain.test.ts
```

### Migration Orchestrator Interface

```typescript
/**
 * Orchestrate a chain of migrations from sourceVersion to targetVersion.
 * Runs each migration sequentially (v0→v1→v2→...→targetVersion).
 * On failure, rolls back and leaves original events untouched.
 */
export interface Migration {
  sourceVersion: number;
  targetVersion: number;
  name: string; // e.g., "v0 to v1: Add sortOrder to config events"
  
  /**
   * Test whether this migration can be run safely.
   * Returns { ok: true } or { ok: false; reason: string }.
   */
  canRun(events: DomainEvent[]): Promise<{ ok: boolean; reason?: string }>;
  
  /**
   * Perform the migration. Returns migrated events.
   * May throw on unrecoverable error.
   */
  run(events: DomainEvent[]): Promise<DomainEvent[]>;
}

export async function migrateDataset(
  dir: string,
  from: number,
  to: number,
): Promise<MigrationResult> {
  // 1. Back up original events.ndjson to events.ndjson.backup-{timestamp}
  // 2. Load events
  // 3. For each migration from→to: run migration, validate result
  // 4. Write migrated events to events.ndjson.tmp
  // 5. Fsync + rename to events.ndjson
  // 6. Return success with backup path
  // On failure: restore from backup, surface error
}

export type MigrationResult =
  | { ok: true; backupPath: string; migrationsRun: string[] }
  | { ok: false; error: string; backupPath?: string };
```

### Migration Trigger

**When migrations are offered:**
1. User switches to a folder with `schemaVersion < CURRENT_SCHEMA_VERSION`
2. Handshake detects older schema and checks if migration chain exists
3. If migration(s) available: show optional "Upgrade folder" dialog
4. User clicks "Upgrade" → run `migrateDataset()` → persist result

**When migrations are required (future):**
- In a future schema, we may mark a migration as **required** (no fallback).
- Older app versions would REJECT on startup if required migrations have not been run.
- New app versions would auto-run required migrations on boot.

### Backward Compatibility Testing

**Test matrix (for each new schema):**

```typescript
describe('Schema migration', () => {
  // Can old app read new-schema data? (backward compat)
  describe('old app + new schema', () => {
    it('rejects folder with schemaVersion > app.CURRENT_SCHEMA_VERSION', () => {
      // Create dataset.json with schemaVersion = 2
      // Boot with CURRENT_SCHEMA_VERSION = 1
      // Expect: SCHEMA_TOO_NEW error
    });
  });
  
  // Can new app read old-schema data? (forward compat)
  describe('new app + old schema', () => {
    it('silently accepts schemaVersion = 1 when app.CURRENT = 2', () => {
      // Create dataset.json with schemaVersion = 1
      // Boot with CURRENT_SCHEMA_VERSION = 2
      // Expect: silent accept (migrations run if available)
    });
  });
  
  // Migration correctness
  describe('v1 to v2 migration', () => {
    it('preserves all events and adds new required fields', () => {
      // Load v1 events
      // Run v1-to-v2 migration
      // Assert: all events present, new fields added, no data loss
    });
  });
});
```

### Schema Bumping Checklist (For Future PRs)

When introducing a breaking change:

- [ ] Increment `CURRENT_SCHEMA_VERSION` in `app/src/main/dataset.ts`
- [ ] Write migration code in `app/src/core/migrations/v{N}-to-v{N+1}.ts`
- [ ] Add migration to orchestrator (`index.ts`)
- [ ] Add migration tests (old→new, new→old, edge cases)
- [ ] Add bootstrap test for "old schema detected" → migration offered scenario
- [ ] Update ADR or architecture doc with the breaking change rationale
- [ ] Document the change in release notes
- [ ] Test with "legacy dataset" (created with v1) on new app build

---

## Acceptance Criteria

### Functional Requirements

1. **dataset.json as authoritative metadata**
   - ✅ `dataset.json` is created on first event append (current behavior, formalize)
   - ✅ `dataset.json` is never regenerated or mutated after creation
   - ✅ Zod schema validates `dataset.json` structure
   - ✅ `datasetId` is a 26-char ULID
   - ✅ `createdAt` is ISO 8601 UTC
   - ✅ `schemaVersion` defaults to 1 for legacy datasets
   - ✅ `appVersion` is optional; recorded at creation if available

2. **Schema-version handshake**
   - ✅ Handshake runs at dataset-switch time (before hydration)
   - ✅ Accept: folder.schemaVersion === app.CURRENT_SCHEMA_VERSION
   - ✅ Migrate (offer): folder.schemaVersion < app.CURRENT_SCHEMA_VERSION (if migration available)
   - ✅ Reject: folder.schemaVersion > app.CURRENT_SCHEMA_VERSION (SCHEMA_TOO_NEW)
   - ✅ Reject: folder.schemaVersion < app.CURRENT_SCHEMA_VERSION (if no migration) (SCHEMA_TOO_OLD_NO_MIGRATION)
   - ✅ First-run adopts VALID_OT folders without DATASET_MISMATCH check

3. **Corruption detection**
   - ✅ Detect corrupt dataset.json (unreadable, unparseable, schema-invalid)
   - ✅ Detect truncated events.ndjson (malformed last line)
   - ✅ Detect foreign events (events.ndjson exists without dataset.json)
   - ✅ Surface errors at switch time (not hydration time)
   - ✅ Console warnings for recovered corruption (e.g., skipped lines)

4. **Folder-kind classification**
   - ✅ EMPTY: no dataset.json, no events.ndjson (or zero bytes)
   - ✅ VALID_OT: dataset.json exists and parses
   - ✅ FOREIGN: events.ndjson exists without dataset.json
   - ✅ First-run allows EMPTY + VALID_OT; rejects FOREIGN, CORRUPT, SCHEMA_TOO_NEW

5. **Error codes & UX copy**
   - ✅ Error codes map 1:1 to `ConfigSetDataDirResponse.error.code`
   - ✅ User-facing copy is actionable (tells user what went wrong + what to do)
   - ✅ Copy is tailored to NGO administrative staff (non-technical language)
   - ✅ Details object includes machine-readable context (datasetId, schemaVersion, etc.)

6. **Migration framework shape**
   - ✅ Migrations live in `app/src/core/migrations/`
   - ✅ Migration interface includes `sourceVersion`, `targetVersion`, `canRun()`, `run()`
   - ✅ Orchestrator handles sequential migration chains
   - ✅ Backup + restore pattern (atomic write protection)
   - ✅ Test matrix covers old-app/new-schema, new-app/old-schema, migration correctness

### Non-Functional Requirements

- ✅ Handshake completes in <500ms (no noticeable UI lag)
- ✅ Corruption detection does not re-parse entire events.ndjson unless necessary
- ✅ Error messages are clear, actionable, and <200 chars (fit in dialog)
- ✅ Backward compat: app continues to work with legacy dataset.json (missing schemaVersion/appVersion)
- ✅ Forward compat: spec is designed so future schema bumps are predictable and testable

### Documentation Requirements

- ✅ TypeScript interface for `Dataset` (in this spec)
- ✅ Error catalogue with codes, causes, and user copy (in this spec)
- ✅ State machine for folder-kind detection (in this spec)
- ✅ Migration framework outline (in this spec)
- ✅ Inline code comments explaining why certain checks exist
- ✅ ADR for schema-version strategy (to be written if not already)
- ✅ Bootstrap hydration logic documented (already done in `docs/architecture/dataset-and-storage.md`)

---

## Work Decomposition (For Neo)

The following are the implementation work items that should be broken into sub-issues for Morpheus and Trinity.

### Phase 1: Formalize & Document (High Priority)
**Goal:** Establish the contract between spec and code.

1. **Update `app/src/main/dataset.ts`**
   - Ensure `Dataset` TypeScript interface matches spec exactly
   - Add JSDoc comments referencing this spec section (Proposed Schema)
   - Ensure Zod schema matches interface
   - Add `CURRENT_SCHEMA_VERSION = 1` constant (already done; just formalize)

2. **Update `app/src/main/ipc/handlers/config.ts`**
   - Update `detectDatasetMismatch()` JSDoc to reference this spec (Handshake section)
   - Ensure all error codes (`DATASET_MISMATCH`, `SCHEMA_TOO_NEW`, `DATASET_CORRUPT`, etc.) match the Error Catalogue
   - Add inline comments explaining why each check exists and what spec rule it enforces

3. **Document error catalogue**
   - Create or update `docs/specs/error-codes.md` or extend this spec
   - Map each error code to its use in code (grep for error-code strings)
   - Ensure IPC contract types in `app/src/shared/ipc-contracts/config.ts` include all codes

### Phase 2: Corruption Detection (Medium Priority)
**Goal:** Detect and surface corruption at switch time.

4. **Enhance `loadDatasetMetadata()` return type & error classification**
   - Already returns `{ status: 'corrupt' | 'ok' | 'missing' }` (good!)
   - Ensure `status: 'corrupt'` includes actionable `error` message (file not found vs. bad JSON vs. schema fail)

5. **Expand `detectDatasetMismatch()` to classify folder kinds**
   - Rename or create new helper `detectFolderKind()` that returns `{ kind: 'EMPTY' | 'VALID_OT' | 'FOREIGN' }`
   - Update `detectDatasetMismatch()` to use `detectFolderKind()` internally
   - Add explicit first-run logic (currentDatasetId === null): skip datasetId check, still enforce absolute refusals

6. **Optional: events.ndjson tail validation at switch time**
   - Add check: can we read the last line of events.ndjson? (early detection of truncation)
   - Surface as advisory warning (not hard rejection) if last line is incomplete
   - Log line count for future manifest validation

### Phase 3: Migration Framework (Low Priority for M1, Medium for M2)
**Goal:** Establish the shape and test infrastructure for future schema bumps.

7. **Create migration framework structure**
   - Create `app/src/core/migrations/index.ts` with empty orchestrator scaffold
   - Define `Migration` interface and `MigrationResult` type
   - Add JSDoc referencing this spec (Migration Framework section)

8. **Add tests for future migrations**
   - Create `app/src/core/migrations/test/chain.test.ts`
   - Add test helpers for "old schema dataset" setup
   - Add test matrix template (old-app/new-schema, new-app/old-schema, migration correctness)

9. **Document schema-bumping checklist**
   - Create `docs/guides/schema-bumping.md` with checklist from this spec
   - Include examples of breaking vs. non-breaking changes
   - Add release-notes guidance (e.g., "Users on v0.1 must update app to v0.2 before using this folder")

### Phase 4: UX Integration (For Mouse, Based on Spec)
**Goal:** Surface errors to users with spec-compliant copy.

10. **Update folder-picker modal (Onboarding + Preferences screens)**
    - Show appropriate error dialog for each error code (DATASET_MISMATCH, SCHEMA_TOO_NEW, etc.)
    - Use user-facing copy from Error Catalogue
    - For DATASET_MISMATCH: show "Switch workspace?" dialog with currentDatasetId, newDatasetId, confirmDatasetSwitch flag
    - For SCHEMA_MIGRATION_AVAILABLE: show "Upgrade folder?" dialog with option to defer

11. **Update boot error page**
    - If hydration fails (e.g., corrupted events.ndjson), show actionable error
    - "Failed to load dataset: {detailError}. Restore from backup or contact support."

---

## Resolved Decisions (Approved by Pedro — 2026-05-02)

### Decision 1: Migration Optionality

**Question:** When a folder uses an older schema, should migration be optional, required on new-schema write, or auto-required after N versions?

**Decision:** Optional for M1 (good UX, no forced actions); required for M2+ (cleaner state).

_Approved by Pedro 2026-05-02 — adopting Niobe's recommendation._

**Rationale:** M1 prioritizes user choice and minimal friction. Users can read old-schema datasets without mandatory upgrades. Future schema versions (M2+) will reassess this based on complexity of supporting multiple schema versions in production.

---

### Decision 2: Manifest File

**Question:** Should we add an optional `dataset-manifest.json` for fast corruption checks?

**Decision:** Ship M1 without it; add in M2 when replication needs cheap proofs.

_Approved by Pedro 2026-05-02 — adopting Niobe's recommendation._

**Rationale:** The manifest file adds maintenance overhead (sync across devices, backup compatibility) that outweighs M1's corruption-detection benefits. We can detect corruption via JSON schema validation on dataset.json and event parsing; manifest becomes valuable in M2 when multi-device sync requires distributed integrity proofs.

---

### Decision 3: appVersion Field

**Question:** Is best-effort recording of app version sufficient, or do we need a strict history?

**Decision:** Current approach is sufficient for M1; enhance in M2 if audit trail is needed.

_Approved by Pedro 2026-05-02 — adopting Niobe's recommendation._

**Rationale:** Recording `appVersion` once at creation (immutable metadata) satisfies M1's goal of detecting incompatibility. An `appVersionHistory` array would add complexity without clear M1 use case. If audit requirements arise in M2, this can be added as a non-breaking schema extension.

---

### Decision 4: Backward Compatibility Chain

**Question:** If a future v3 is released and a v1 dataset attempts to auto-upgrade v1→v2→v3, should we run both migrations in sequence or require explicit per-version approval?

**Decision:** Run sequentially without interruption; user just clicks once.

_Approved by Pedro 2026-05-02 — adopting Niobe's recommendation._

**Rationale:** Sequential migration (v1→v2→v3 in one operation) provides better UX — one confirmation dialog, then automatic progress. This requires robust migration orchestration in the migration framework, but the spec already accounts for this (see Migration Framework section). Error handling at any step will halt and surface actionable feedback.

---

### Decision 5: First-Run Repair Option

**Question:** Should we offer a "repair" option for legacy events.ndjson without dataset.json?

**Decision:** Hard reject for M1 (safer); consider repair UX for M2 based on user feedback.

_Approved by Pedro 2026-05-02 — adopting Niobe's recommendation._

**Rationale:** M1 enforces strict handshake rules to minimize risk of data loss or corruption. Auto-generating dataset.json for foreign folders is risky without user intent confirmation and cannot be undone safely. M2 can add guided repair workflows once we have production telemetry on how often users encounter foreign datasets.

---

### Decision 6: SCHEMA_TOO_OLD Error UX

**Question:** Should SCHEMA_TOO_OLD_NO_MIGRATION error be surfaced as "contact support" or "automatic migration coming"?

**Decision:** "Contact support" unless we have a roadmap date; avoid false hope.

_Approved by Pedro 2026-05-02 — adopting Niobe's recommendation._

**Rationale:** Accuracy and trust matter more than optimistic messaging. If we commit to a migration timeline, we communicate that in release notes and support docs. If we're unsure, suggesting "contact support" sets realistic expectations and allows support team to escalate and track demand.

---


## Appendices

### A: Related ADRs & Docs

- **ADR-001 C7 (Sandbox):** All file I/O in main process
- **ADR-002 §2.4 (Repo Structure):** Core stays Electron-free
- `docs/architecture/dataset-and-storage.md` — current dataset and storage model
- `docs/security/security-requirements-v0.1.md` — legacy event-type migration strategy (Strategy-3)
- `docs/guides/trial-deployment.md` — user-facing dataset setup & troubleshooting

### B: TypeScript Types (For Reference)

**ConfigSetDataDirResponse** (from `app/src/shared/ipc-contracts/config.ts`):

```typescript
export type ConfigSetDataDirResponse =
  | { ok: true }
  | {
      ok: false;
      error: {
        code:
          | 'SCHEMA_INVALID'
          | 'INVALID_LOCATION'
          | 'SAME_DIR'
          | 'NOT_WRITABLE'
          | 'DATASET_MISMATCH'
          | 'SCHEMA_TOO_NEW'
          | 'SCHEMA_TOO_OLD_NO_MIGRATION'
          | 'SCHEMA_MIGRATION_AVAILABLE'
          | 'DATASET_CORRUPT'
          | 'WRITE_FAILED';
        message: string;
        details?: {
          currentDatasetId?: string;
          newDatasetId?: string;
          schemaVersion?: number;
          folderSchemaVersion?: number;
          appSchemaVersion?: number;
        };
      };
    };
```

### C: File Structure (Canonical Locations)

```
<dataDir>/
├── dataset.json              # Metadata (AUTHORITATIVE)
├── events.ndjson             # Event log (append-only)
├── events.ndjson.backup-*    # (Optional) backup from failed migration
└── dataset-manifest.json     # (Optional, future) integrity checksum

<userData>/
└── app-config.json           # App config (separate from dataset)
```

### D: Bootstrap Flow (Reference)

1. Load `app-config.json` from userData
2. Resolve event-log directory (env var → appConfig.dataDir → default)
3. If `appConfig.dataDir === null`: defer everything (onboarding pending)
4. Else: load `dataset.json` (or create if missing)
5. Validate schema version (handshake rules)
6. Load `events.ndjson`
7. Replay events into read model
8. Mark app as hydrated; IPC handlers ready

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-03 | 1.0 | Initial spec: dataset.json schema, handshake rules, error catalogue, migration framework outline, work decomposition |

---

## Sign-Off

**Spec written by:** Niobe (Spec/UX Analyst)  
**Reviewed by:** Pedro (owner)  
**Approved by:** Pedro (owner) — 2026-05-02  
**Decision dates:** All open questions resolved and locked in — see Resolved Decisions section.

*All decisions are binding for M1 implementation. This spec is now ready for implementation decomposition.*
