# docs(architecture): refresh event model and dataset/storage technical docs

## Reported by Pedro

Pedro identified a gap: developers shouldn't need to dig through event schema definitions in code to understand how the system works. The event-sourced architecture is the core of the app, but the documentation didn't explain it clearly.

## Pedro's three questions answered

### Q1: What types of events exist in `events.ndjson`?

There are **32 event types** organised in **7 domains**:

1. **tx** (transactions) — 4 types: `tx.created`, `tx.updated`, `tx.deleted`, plus note events
2. **account** (bank account config) — 4 types: `AccountCreated`, `AccountUpdated`, `AccountArchived`, `AccountUnarchived`
3. **category** (income/expense categories) — 4 types: `CategoryCreated`, `CategoryUpdated`, `CategoryArchived`, `CategoryUnarchived`
4. **subcategory** (nested categories) — 4 types: `SubcategoryCreated`, `SubcategoryUpdated`, `SubcategoryArchived`, `SubcategoryUnarchived`
5. **tag** (user-defined labels) — 4 types: `TagCreated`, `TagUpdated`, `TagArchived`, `TagUnarchived`
6. **tx.note** (annotations) — 3 types: `tx.note.added`, `tx.note.edited`, `tx.note.deleted`
7. **movement** (CSV imports) — 2 types: `movement.imported`, `import.mapping.updated`
8. **tx.split** (split transactions) — 2 types: `tx.split`, `tx.split.removed`

Each event carries metadata (who, when, which dataset, which device) and a type-specific payload. The reducer projects events into an in-memory read model. See `app/src/core/events/schemas.ts` for the full schema definitions and `app/src/core/query/reducers.ts` for how each event is applied.

### Q2: When a transaction is updated, is a NEW event created? Is it related to the original by `id`?

**Yes, a new event is created.** This is the core event-sourcing pattern:

1. A new event of type `tx.updated` is created with a **new ULID** as its `event.id` (unique in the log).
2. The event payload includes the transaction's **original `id`** (unchanged) so the reducer knows which transaction to update.
3. Both the original `tx.created` and the new `tx.updated` event **remain in the log** (append-only).
4. The reducer finds the transaction by its original `id`, then **replaces it in-place** in the read model.

**Example:** Transaction `01KQ2W894ZCZEM8NTT88F2GACX` is created, then edited. Two events appear in `events.ndjson`:

```json
{"type":"tx.created","id":"01KQ2W894ZCZEM8NTT88F2GACX","payload":{"id":"01KQ2W894ZCZEM8NTT88F2GACX","date":"2026-04-20","description":"Office supplies","amount":100,...}}
{"type":"tx.updated","id":"01KQ2WA12B3C4D5E6F7G8H9IJ2K3","payload":{"id":"01KQ2W894ZCZEM8NTT88F2GACX","date":"2026-04-20","description":"Office supplies (corrected)","amount":125.50,...}}
```

Both events exist forever. The `tx.updated` event's `createdAt` tells us when the edit happened. See `app/src/core/events/schemas.ts:479-484` (event schema) and `app/src/core/query/reducers.ts:498-530` (reducer logic).

**Delete** follows the same pattern: a new `tx.deleted` event is appended with the original transaction's `txId`, and the reducer removes the transaction from the read model. The original `tx.created` stays in the log. See `app/src/core/query/reducers.ts:532-558`.

### Q3: If Pedro changes the dataset location (Preferences → Change folder), what happens?

The app follows this flow (implemented in `app/src/main/ipc/handlers/config.ts:68-184`):

1. **User selects a new folder** via the OS file picker.
2. **App validates:**
   - The folder exists and is writable (tests with a probe file).
   - The folder is NOT under Electron's userData (enforces external storage — OneDrive/SharePoint for trial).
   - If `events.ndjson` already exists in the new folder, the app **peeks the first event** and verifies its `datasetId` matches the currently-active dataset (prevents mixing data from different organizations).
3. **App writes the new path** to `app-config.json` atomically (temp file → fsync → rename).
4. **App restarts** — calls `app.relaunch()` and `app.exit(0)` so the next boot picks up the new folder cleanly.
5. **On next boot** (via `app/src/main/bootstrap.ts:143-174`), the app resolves the dataset folder (checking env var, then `app-config.json`, then defaults), opens `events.ndjson` from the new location, and replays all events.

**What happens to the old dataset?** The old folder is **left in place, untouched**. No migration, no deletion. If it's on OneDrive, it keeps syncing. Users can manually archive or back it up if needed. If they switch back later, all events are still there.

**Empty vs existing folder:**

- **Empty folder:** A fresh dataset is created (first event written on next save).
- **Existing folder (same dataset):** New events append naturally (deduped by ULID).
- **Existing folder (different dataset):** App rejects with error `DATASET_MISMATCH`.

See `app/src/main/ipc/handlers/config.ts:243-283` for the mismatch detection logic.

## Files added/updated

- **`docs/architecture/event-model.md`** (NEW) — 450-line canonical reference for event types, storage format, update/delete patterns, encryption roadmap.
- **`docs/architecture/dataset-and-storage.md`** (NEW) — 290-line guide to dataset folders, switching, safety, read-only mode.
- **`docs/architecture/README.md`** (NEW) — 220-line index for the architecture doc set, with file structure and key flows.
- **`README.md`** (UPDATED) — added "How it works" paragraph linking to the new architecture docs.

## Findings flagged for follow-up

🚧 **Dataset mismatch handling:** When switching to a folder that contains `events.ndjson` from a different dataset, the app currently returns an error (`DATASET_MISMATCH`). This is safe but could be confusing if a user accidentally picks the wrong folder. Consider adding a confirmation dialog: "This folder has events for a different workspace. Are you sure?" This would help distinguish between "I picked the wrong folder" (cancel) and "I want to start fresh here" (which is not yet possible without manual deletion).

🚧 **No bulk migration tool:** If a user has events in folder A and wants to copy them to folder B, there's no built-in export/import. The current workaround is to manually copy `events.ndjson`. In M2 (when multi-device sync is stable), consider adding an "Export dataset" feature so users can safely archive old datasets.

---

**Related PRs:** #176, #177, #178 (Preferences screen overhaul + sidebar IA + profile save fix).

**CI/Validation:** `npm run format:check` passed (markdown formatting).
