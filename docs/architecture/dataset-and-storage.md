# Dataset and Storage

OpenTreasury Desktop stores all application state in a **dataset folder** — a directory containing an `events.ndjson` event log and related metadata files. This document describes the dataset model, folder structure, and the workflow for switching datasets.

## What is a "dataset"?

A **dataset** is the collection of events and configuration files for a single treasury or organization. It includes:

- **`events.ndjson`** — the append-only event log (all movements, accounts, categories, tags, splits, notes, imports).
- **`dataset-id`** — a stable ULID that uniquely identifies this dataset across all devices and time.
- **Device/identity state files** (future M2) — per-device credentials, device IDs, encryption keys.

Each dataset is entirely self-contained in a single folder. All state is derived from the event log; there is no separate database file, no external sync service required.

## Default location

By default, the dataset folder lives at:

```
Windows:  %APPDATA%\opentreasury\dev-events\
macOS:    ~/Library/Application Support/opentreasury/dev-events/
Linux:    ~/.config/opentreasury/dev-events/
```

This is a **local folder** (Electron's `userData` path). In trial and production, users are expected to change this location to **OneDrive, SharePoint, or similar cloud sync target** so the data can be shared with teammates.

## Custom dataset location

Users can change the dataset location via **Preferences → Change folder** (UI wired by PR #176–178, Preferences overhaul). The app:

1. Prompts the user to select a folder using the OS file picker.
2. Validates the folder path (must exist, must be writable).
3. Checks if the folder already contains an `events.ndjson`.
4. If it does, verifies that the existing events belong to the **same dataset** (by checking the `datasetId` field in the first event).
5. Writes the new path to `app-config.json` in userData.
6. **Restarts the app** to cleanly load the new dataset.

On the next boot, the app hydrates from the new location.

### IPC handler implementation

The logic lives in `app/src/main/ipc/handlers/config.ts:createConfigSetDataDirHandler()`. The handler:

1. **Validates request** — ensure the path is well-formed.
2. **Rejects paths under userData** — trial posture is external folders (OneDrive/SharePoint), not local Electron paths.
3. **Rejects no-ops** — refuses if the new path equals the current path.
4. **Ensures directory exists** — creates the folder if missing.
5. **Tests writability** — writes and deletes a probe file to confirm access.
6. **Checks for dataset mismatch** — if `events.ndjson` already exists, peeks the first line and confirms its `datasetId` matches the currently-active dataset. **Refuses to co-mingle different datasets** (`app/src/main/ipc/handlers/config.ts:243-283`).
7. **Persists new path** — writes to `app-config.json` atomically (tmp → fsync → rename).
8. **Schedules relaunch** — exits the current process so the next boot picks up the new path cleanly.

**Idempotency:** If the folder already contains `events.ndjson` from the same dataset (same `datasetId`), the app allows it and replays all existing events. New events appended by this app will merge naturally because each event carries a unique `id` (ULID) and the log dedupes by `id`.

### Bootstrap flow: resolving the active dataset folder

On boot, `app/src/main/bootstrap.ts:resolveEventLogDir()` applies this priority:

1. **OT_DATA_DIR env var** (if set and absolute path or relative to userData).
2. **appConfig.dataDir** (from `app-config.json`).
3. **Default** (`<userData>/dev-events/`).

The resolver also validates the chosen folder exists and is writable, creating it if needed. See `app/src/main/bootstrap.ts:143-218`.

## What happens to the previous dataset?

When the user switches to a new folder, **the previous dataset is left in place, untouched**. No migration, no deletion. This is by design:

- The old folder remains accessible (e.g., if it's on OneDrive, it still syncs).
- The user can manually archive, back up, or delete the old folder if desired.
- If they switch back, all old events are still there.

**No data loss. No automatic cleanup.**

Example timeline:
1. User has dataset A at `C:\Users\Maria\OneDrive\treasury-data\`.
2. User selects dataset B at `C:\Users\Maria\Documents\treasury-archive\`.
3. App restarts, loads dataset B's events.ndjson.
4. User can still access dataset A (it exists on disk).
5. Later, user switches back to A; all events replay as before.

## Re-hydration on boot

When the app starts, the bootstrap sequence:

1. Resolves the active dataset folder (via the priority rules above).
2. Opens `events.ndjson` and parses all events.
3. Validates each event against its Zod schema (type, payload shape).
4. Replays the event list through the reducer to construct the in-memory read model.
5. The UI queries the read model directly (no additional I/O).

This process is **synchronous and fast** — even with ~2,000 events, the app boots in under 1 second on modern hardware. See `app/src/main/bootstrap.ts:249-300`.

## Read-only mode

The app can operate in **read-only mode** if the event log is on a file system the user cannot write to. This mode is useful for:

- **Audit trails** — archive an old dataset as read-only so users can review past data but not edit it.
- **Shared viewing** — multiple users querying the same read-only dataset.

The bootstrap detects read-only status by attempting a probe write (same technique as the dataset-change handler). If the write fails, the app wraps the event log with `createReadOnlyEventLog()` (`app/src/main/eventLog-readonly-wrapper.ts`), which:

1. Allows `load()` and `getEvents()` calls (reads).
2. Rejects `append()` calls with a `ReadOnlyEventLogError`.

IPC handlers (transaction create/update/delete, account/category changes) catch this error and return `EVENT_LOG_READONLY` to the UI (`app/src/main/ipc/handlers/transaction.ts:124-131`). The UI can then display a message like "This dataset is read-only; you cannot make changes."

## Safety considerations

### Dataset mismatch guard

If the user points to a folder that already contains `events.ndjson` from a **different dataset** (different `datasetId`), the app **refuses** with error `DATASET_MISMATCH`. This prevents accidental co-mingling of data from two separate organizations or workspaces.

Example:
- Folder A has dataset X with 500 transactions for NGO Alpha.
- User switches to folder A but the app's current context is dataset Y (NGO Beta).
- App peeks the first event in A, sees `datasetId = X`, and rejects: "Folder already contains events for a different dataset."

This is a **data integrity safeguard**. See `app/src/main/ipc/handlers/config.ts:145-157`.

### One-writer model

During trial, the app is designed for **one writer per dataset** (one laptop actively making changes). Multiple devices can read the same dataset (read-only copies), but only one should append new events at a time. This avoids CRDT/merge complexity for M1.

**In M2**, multi-writer support (via conflict-free merge semantics) will be added. For now:
- If two laptops try to append simultaneously (racing writes), the event log will reject duplicates (by ULID dedupe) but may diverge.
- Users are advised (in `docs/guides/trial-deployment.md` §3) to designate one writer per dataset.

### Conflict files

If a user modifies the dataset folder on two devices simultaneously (e.g., two OneDrive clients syncing), the folder may contain conflict files like `events (Device 1).ndjson`. The app does not automatically handle these; the user must manually resolve them (see `docs/guides/trial-deployment.md` §7 for troubleshooting steps).

## Persistence: atomic writes

When the app appends events to `events.ndjson`, the write is **atomic**:

1. Write to a temporary file (`events.ndjson.tmp`).
2. Flush to disk (fsync).
3. Rename the temp file to replace the original.

This prevents partial writes if the process crashes mid-append. See the event log implementation in `app/src/core/eventLog/JsonFileEventLog.ts`.

## Configuration: app-config.json

The dataset location (and future settings like encryption key path, identity provider URL) are persisted in:

```
Windows:  %APPDATA%\opentreasury\app-config.json
macOS:    ~/Library/Application Support/opentreasury/app-config.json
Linux:    ~/.config/opentreasury/app-config.json
```

This file is **separate from the dataset folder** so the app can bootstrap before deciding which dataset to load. Its schema is defined in `app/src/main/config.ts`.

## Reference sources

- Bootstrap folder resolution: `app/src/main/bootstrap.ts:143-218`
- Dataset-change handler: `app/src/main/ipc/handlers/config.ts:68-184`
- Event log implementation: `app/src/core/eventLog/JsonFileEventLog.ts`
- Read-only wrapper: `app/src/main/eventLog-readonly-wrapper.ts`

## See also

- `docs/architecture/event-model.md` — event storage format and types.
- `docs/guides/trial-deployment.md` — how NGO staff set up and manage datasets.
