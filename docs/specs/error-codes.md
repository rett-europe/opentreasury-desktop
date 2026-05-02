# Dataset Compatibility & Validation: Error Code Catalogue

**Parent Issue:** #206  
**Related Spec:** [`dataset-compatibility-validation.md`](./dataset-compatibility-validation.md)  
**Status:** ✅ Defined (implementation pending in #239–#241)  
**Audience:** Morpheus (implementer), Trinity (error dialogs), Cypher (test cases)

---

## Purpose

This document is the **authoritative reference** for all error codes surfaced during dataset folder validation, schema-version handshake, and corruption detection. Each error code is linked to:

- **When it fires** (detection logic)
- **Where it's detected** (code location)
- **How it's surfaced** (IPC contract, error dialog)
- **User-facing copy** (guidance for Trinity's error dialogs)
- **Bypassability** (whether the user can override the rejection)

All error codes are defined as discriminated-union members in the IPC contract types (`app/src/shared/ipc-contracts/config.ts`).

---

## Error Code Summary Table

| Code | Fires When | Bypassable | Detect Point | Implementation Status |
|------|-----------|-----------|--------------|----------------------|
| `SCHEMA_INVALID` | Request payload fails Zod validation | No | IPC handler (early) | ✅ Implemented (P1-2 #149) |
| `INVALID_LOCATION` | Folder path is under userData | No | Path validation | ✅ Implemented (P1-2 #149) |
| `SAME_DIR` | New folder equals current folder | No | Path validation | ✅ Implemented (P1-2 #149) |
| `NOT_WRITABLE` | Cannot write to folder (perms, disk full) | No | Write test | ✅ Implemented (P1-2 #149) |
| `DATASET_MISMATCH` | datasetId differs OR foreign events without dataset.json | Partial (datasetId only) | Handshake | ⚙️ TBD: #239 (Morpheus) |
| `SCHEMA_TOO_NEW` | folder.schemaVersion > app.CURRENT_SCHEMA_VERSION | No | Handshake | ⚙️ TBD: #239 (Morpheus) |
| `SCHEMA_TOO_OLD_NO_MIGRATION` | folder.schemaVersion < app.CURRENT AND no migration | No | Handshake | ⚙️ TBD: #240 (Morpheus) |
| `SCHEMA_MIGRATION_AVAILABLE` | folder.schemaVersion < app.CURRENT AND migration exists | Partial (user confirms) | Handshake | ⚙️ TBD: #240 (Morpheus) |
| `DATASET_CORRUPT` | dataset.json unreadable, unparseable, or schema-invalid | No | Metadata load | ⚙️ TBD: #239 (Morpheus) |
| `WRITE_FAILED` | Cannot persist new appConfig | No | Persistence | ✅ Implemented (P1-2 #149) |

---

## Error Code Details

### `SCHEMA_INVALID`

**When:** Request payload (e.g., `config:setDataDir`) fails Zod schema validation.

**Why:** Invalid input from renderer — typically a programming bug, not a user error.

**Code Location:**
- **Detection:** `app/src/main/ipc/handlers/config.ts:handleSetDataDir()` (Zod parse at entry)
- **IPC contract:** `configSetDataDirErrorCodeSchema` in `app/src/shared/ipc-contracts/config.ts`

**Bypassable:** No (hard rejection)

**User-Facing Copy:**
```
Invalid request. Please try again.
```

**Technical Detail (optional):**
```
The request payload did not match the expected schema. This is likely a bug in the app. Please report it to support with these details: {zodErrorMessage}
```

---

### `INVALID_LOCATION`

**When:** The selected folder path is under `app.getPath('userData')` (violates external-data requirement).

**Why:** Data must be stored in a user-controlled, cloud-backed location (OneDrive, Dropbox, external drive), not in the app's internal storage.

**Code Location:**
- **Detection:** `app/src/main/ipc/handlers/config.ts:handleSetDataDir()` (path comparison)
- **IPC contract:** `configSetDataDirErrorCodeSchema`

**Bypassable:** No (hard rejection)

**User-Facing Copy:**
```
Data folder cannot be in the app's local folder ({userDataDir}). Choose a cloud folder or external drive.
```

**Detail Message (optional):**
```
OpenTreasury stores your financial data in a folder you choose, so you can back it up and sync it across devices. The folder must be outside the app's internal storage (e.g., in OneDrive, Dropbox, or on an external drive).
```

---

### `SAME_DIR`

**When:** The selected folder path is identical to the currently-active `dataDir`.

**Why:** No-op switch — user picked the same folder they're already using.

**Code Location:**
- **Detection:** `app/src/main/ipc/handlers/config.ts:handleSetDataDir()` (path normalization + equality check)
- **IPC contract:** `configSetDataDirErrorCodeSchema`

**Bypassable:** No (silent rejection; not an error, just a no-op)

**User-Facing Copy:**
```
The selected folder is the same as the current one.
```

---

### `NOT_WRITABLE`

**When:** The selected folder cannot be created (if missing) or written to (permission denied, disk full, read-only filesystem).

**Why:** The app must be able to write `dataset.json` and `events.ndjson` to the folder. If it can't, the folder is unusable.

**Code Location:**
- **Detection:** `app/src/main/ipc/handlers/config.ts:handleSetDataDir()` (write test: `mkdir -p` + `writeFile` + `unlink`)
- **IPC contract:** `configSetDataDirErrorCodeSchema`

**Bypassable:** No (hard rejection)

**User-Facing Copy:**
```
Cannot write to the selected folder: {errMessage}. Check permissions and disk space.
```

**Technical Detail (optional):**
```
The app attempted to create a test file in {folderPath} but failed with error: {errMessage}. Ensure the folder exists, is writable, and has at least 10 KB of free space.
```

---

### `DATASET_MISMATCH`

**When:**
1. **datasetId mismatch:** `currentDatasetId !== null` AND `folder.datasetId !== currentDatasetId` (workspace switch)
2. **Foreign folder:** No `dataset.json` (or corrupt) AND `events.ndjson` exists and is non-empty (legacy or non-OT data)

**Why:**
1. **datasetId mismatch:** User is trying to switch to a different workspace. We block this by default to prevent accidental co-mingling of events from different datasets.
2. **Foreign folder:** The folder contains events but no workspace identity metadata. We cannot safely determine if these events belong to the current workspace or a different one, so we reject the folder outright.

**Code Location:**
- **Detection:** `app/src/main/ipc/handlers/config.ts:detectDatasetMismatch()` (TBD: #239)
- **IPC contract:** `configSetDataDirErrorCodeSchema`

**Bypassable:**
- **datasetId mismatch:** YES (via `confirmDatasetSwitch: true`)
- **Foreign folder:** NO (hard rejection)

**User-Facing Copy:**

**Scenario 1: datasetId mismatch (bypassable)**
```
Switch workspace?

You are currently using workspace `{currentDatasetId.slice(0,8)}...` ({currentEventCount} transactions).
The selected folder contains workspace `{newDatasetId.slice(0,8)}...` ({newEventCount} transactions).

All data remains on disk — this just changes which workspace is active.

[Cancel] [Switch workspace]
```

**Scenario 2: Foreign folder (hard rejection)**
```
Cannot determine workspace identity.

This folder contains events but no dataset.json metadata file. Please choose an empty folder or a folder with a valid dataset.json file.
```

---

### `SCHEMA_TOO_NEW`

**When:** `folder.schemaVersion > app.CURRENT_SCHEMA_VERSION`

**Why:** The folder was created (or last touched) by a newer version of OpenTreasury. This app build is too old to safely interpret the data format.

**Code Location:**
- **Detection:** `app/src/main/ipc/handlers/config.ts:detectDatasetMismatch()` → schema-version handshake (TBD: #239)
- **IPC contract:** `configSetDataDirErrorCodeSchema`

**Bypassable:** No (hard rejection)

**User-Facing Copy:**
```
This folder was created with a newer version of OpenTreasury.

Update the app to continue.

[Check for updates]
```

**Technical Detail (optional):**
```
Folder schema version: v{folderSchemaVersion}
Current app schema version: v{appSchemaVersion}
```

---

### `SCHEMA_TOO_OLD_NO_MIGRATION`

**When:** `folder.schemaVersion < app.CURRENT_SCHEMA_VERSION` AND no migration chain is defined or available from `v{N} → v{N+1} ... → v{CURRENT}`

**Why:** The folder uses an old data format, but we don't have migration code to upgrade it safely.

**Code Location:**
- **Detection:** `app/src/main/ipc/handlers/config.ts:detectDatasetMismatch()` → migration lookup (TBD: #240)
- **IPC contract:** `configSetDataDirErrorCodeSchema`

**Bypassable:** No (hard rejection; may become bypassable in future if migration is added)

**User-Facing Copy:**
```
This folder uses an older data format (v{folderSchemaVersion}).

Automatic upgrade not yet available. Contact support or use a newer app version that supports this format.
```

**Technical Detail (optional):**
```
Folder schema version: v{folderSchemaVersion}
Current app schema version: v{appSchemaVersion}
```

---

### `SCHEMA_MIGRATION_AVAILABLE`

**When:** `folder.schemaVersion < app.CURRENT_SCHEMA_VERSION` AND migration(s) exist from `v{N} → v{N+1} ... → v{CURRENT}`

**Why:** We can upgrade the folder safely. User is given the option to run migrations now (optional; not required).

**Code Location:**
- **Detection:** `app/src/main/ipc/handlers/config.ts:detectDatasetMismatch()` → migration lookup (TBD: #240)
- **IPC contract:** `configSetDataDirErrorCodeSchema`

**Bypassable:** Partial (user confirms in dialog → migration runs → accept; OR user declines → keep old schema)

**User-Facing Copy:**

**Prompt:**
```
This folder uses an older data format (v{folderSchemaVersion}) but can be upgraded to v{appSchemaVersion}.

Upgrading is optional — you can keep using it as-is, or upgrade now for new features.

[Keep as-is] [Upgrade folder]
```

**On migration start:**
```
Upgrading folder… this may take a moment.
```

**On migration success:**
```
Folder upgraded to v{appSchemaVersion}.

The backup is saved to:
{backupPath}
```

**On migration failure:**
```
Upgrade failed: {detailError}.

Your original data is untouched.
```

---

### `DATASET_CORRUPT`

**When:** One of the following corruption scenarios is detected:

1. **C1: dataset.json Missing or Unreadable** — File I/O error, permission denied, or disk issue
2. **C2: dataset.json Invalid JSON** — `JSON.parse()` fails
3. **C3: dataset.json Schema Validation Fails** — Zod validation fails (missing required field, wrong type)

**Why:** The dataset metadata file is corrupted, incomplete, or malformed. We cannot safely determine the workspace identity or schema version.

**Code Location:**
- **Detection:** `app/src/main/dataset.ts:loadDatasetMetadata()` (TBD: #239 — error surfacing)
- **IPC contract:** `configSetDataDirErrorCodeSchema`

**Bypassable:** No (hard rejection)

**User-Facing Copy:**

**C1: Unreadable**
```
Cannot read the dataset metadata file ({path}).

{detailError}

Ensure the folder is readable and has at least 10 KB free.
```

**C2: Invalid JSON**
```
The dataset metadata file is corrupted (invalid JSON).

If you have a backup, restore it. Otherwise, you may need to start fresh.

{errorDetail}
```

**C3: Schema validation fails**
```
The dataset metadata is incomplete or invalid.

{detailError}

This may indicate a disk error or incomplete write. Try restoring from a backup.
```

---

### `WRITE_FAILED`

**When:** Persisting the new `app-config.json` fails (disk full, permission denied, etc.)

**Why:** After validating the new folder, we must save the new `dataDir` to `app-config.json`. If this write fails, the folder switch is aborted.

**Code Location:**
- **Detection:** `app/src/main/ipc/handlers/config.ts:handleSetDataDir()` → `saveAppConfig()` catch block
- **IPC contract:** `configSetDataDirErrorCodeSchema`

**Bypassable:** No (hard rejection)

**User-Facing Copy:**
```
Failed to save configuration: {errMessage}.

Try again.
```

---

## IPC Contract Mapping

All error codes are defined in `app/src/shared/ipc-contracts/config.ts` as part of the `configSetDataDirErrorCodeSchema` Zod enum:

```typescript
export const configSetDataDirErrorCodeSchema = z.enum([
  'SCHEMA_INVALID',
  'SAME_DIR',
  'INVALID_LOCATION',
  'NOT_WRITABLE',
  'DATASET_MISMATCH',
  'SCHEMA_TOO_NEW',
  'SCHEMA_TOO_OLD_NO_MIGRATION',
  'SCHEMA_MIGRATION_AVAILABLE',
  'DATASET_CORRUPT',
  'WRITE_FAILED',
]);

export type ConfigSetDataDirErrorCode = z.infer<typeof configSetDataDirErrorCodeSchema>;
```

The `configSetDataDirResponseSchema` is a discriminated union:

```typescript
export const configSetDataDirResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: configSetDataDirErrorCodeSchema,
      message: z.string(),
      details: z
        .object({
          currentDatasetId: z.string().optional(),
          newDatasetId: z.string().optional(),
          schemaVersion: z.number().int().optional(),
          folderSchemaVersion: z.number().int().optional(),
          appSchemaVersion: z.number().int().optional(),
        })
        .optional(),
    }),
  }),
]);
```

**Renderer access:**
```typescript
import type { ConfigSetDataDirResponse } from '@/shared/ipc-contracts/config';

const result: ConfigSetDataDirResponse = await ipcRenderer.invoke('config:setDataDir', { newDir });

if (!result.ok) {
  switch (result.error.code) {
    case 'SCHEMA_TOO_NEW':
      // Show "Update app" dialog
      break;
    case 'DATASET_MISMATCH':
      // Show "Switch workspace?" confirmation dialog
      break;
    case 'DATASET_CORRUPT':
      // Show corruption error dialog
      break;
    // ...
  }
}
```

---

## Hydration-Phase Error Codes (Future)

The above codes are surfaced at **dataset switch time** (IPC handler `config:setDataDir`). Additional error codes will be needed for **hydration-phase failures** (during app boot when replaying events):

| Code | When | Where |
|------|------|-------|
| `EVENTS_TRUNCATED` | Last line in `events.ndjson` is incomplete JSON | `JsonFileEventLog.load()` (recoverable; log warning) |
| `EVENTS_CORRUPT_INTERIOR` | Mid-file JSON parse error (not last line) | `JsonFileEventLog.load()` (skip line; log warning) |
| `HYDRATION_FAILED` | Replay into read model fails (logic error, invalid state transition) | `bootstrap.ts:replayEvents()` (fatal; app cannot boot) |

**Implementation:** TBD in #242 (Trinity, boot hydration error page)

---

## See Also

- **Parent Spec:** [`dataset-compatibility-validation.md`](./dataset-compatibility-validation.md)
- **IPC Contract:** `app/src/shared/ipc-contracts/config.ts`
- **Dataset Schema:** `app/src/main/dataset.ts`
- **Handshake Logic:** `app/src/main/ipc/handlers/config.ts:detectDatasetMismatch()` (TBD: #239)
- **Migration Framework:** `app/src/core/migrations/` (TBD: #240)
- **Error Dialogs:** `app/src/renderer/components/dialogs/` (TBD: #241)
