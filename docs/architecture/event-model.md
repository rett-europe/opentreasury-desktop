# Event Model

OpenTreasury Desktop is built on **event sourcing**: the application state is reconstructed by replaying an append-only log of domain events. This document describes the event schema, storage format, and lifecycle.

## Storage format: NDJSON

Events are stored in a single file at `events.ndjson` inside the dataset folder (default: `~/.config/opentreasury/dev-events/`, customizable via Preferences → Change folder). The format is **NDJSON** (newline-delimited JSON) — one JSON object per line, no nesting, no array wrapper.

### Hydration on boot

When the app starts, `app/src/main/bootstrap.ts` calls `JsonFileEventLog.load()` to:
1. Read `events.ndjson` from the resolved dataset folder.
2. Parse each line as a separate JSON object (catching parse errors and rejecting invalid events).
3. Validate each event against its Zod schema (checking type, payload shape, required fields).
4. Replay the validated event list through the reducer (`applyEvent` in `app/src/core/query/reducers.ts`) to hydrate the in-memory read model.

The read model is immutable — all changes come via new events appended to the log.

## Event envelope

Most events use a common envelope structure (defined in `app/src/core/events/schemas.ts:4-17`):

```typescript
{
  id: string,            // ULID (26-char monotonically sortable ID)
  type: string,          // Event type (e.g. 'tx.created', 'account.created')
  datasetId: string,     // ULID — which dataset owns this event
  actorDeviceId: string, // ULID — which laptop made this change
  actorUserId: string,   // ULID — user identity (trial: local or Entra ID)
  actorIdentitySource: 'local' | 'aad',
  createdAt: string,     // ISO 8601 UTC timestamp
  dekVersion: number,    // DEK (data encryption key) version; encryption deferred to M2
  version: number,       // Schema version (default: 1)
  payload: {}            // Type-specific data
}
```

Some events (especially those predating the envelope pattern) use a flat "wire" structure without the envelope — `app/src/core/events/schemas.ts` groups these with comments (e.g., "WI-15-lite — Configuración events (flat wire-style events, PascalCase type)").

### ULIDs: monotonically sortable IDs

Every event gets a ULID (26-character universal unique lexicographically sortable identifier) as its `id`. ULIDs are sortable — the app can append events knowing that `event.createdAt` order mirrors `event.id` insertion order. This property is essential for the append-only log: new events can be added by multiple writers (in future M2 multi-device mode) and the log remains consistent if each event carries its own ULID.

## Event types catalog

There are **32 event types** organised in **7 domains**. Each event appends to the log as a new record; the reducer projects it into the read model.

### Domain: tx (Transaction / Movement)

Transactions are monetary records: income or expense amounts with dates, accounts, categories, tags, and optional notes.

#### tx.created
**Purpose:** Record a new transaction (manually entered or imported).
**Payload fields** (`app/src/core/events/schemas.ts:24-41`):
- `id`: ULID of the transaction
- `date`: YYYY-MM-DD (business date, not creation timestamp)
- `type`: 'income' | 'expense'
- `amount`: number ≥ 0 (sign encoded in type, not amount)
- `currency`: 'EUR' (fixed in trial)
- `description`: string ≤ 500 chars
- `accountId`: ULID of the account this belongs to
- `categoryId`: ULID or null (optional category assignment)
- `subcategoryId`: ULID or null (child of categoryId)
- `tagIds`: ULID[] (zero or more tags)
- `status`: 'pending' | 'approved'
- `createdAt`: ISO timestamp
- `reference`: string ≤ 120 chars or null (e.g., bank reference, optional)
- `details`: string ≤ 1000 chars or null (user annotation, optional)

**Reducer** (`app/src/core/query/reducers.ts:69-95`): Appends to `readModel.transactions`; updates reference index for O(1) lookup by business reference.

#### tx.updated
**Purpose:** Modify an existing transaction (full-replacement pattern).
**Payload fields** (`app/src/core/events/schemas.ts:455-475`):
- All fields from `tx.created` (id, date, type, amount, …) — the new full state, not a delta patch.
- `updatedAt`: ISO timestamp of when the edit occurred.
- `correlationId`: ULID (optional, present only when part of a bulk-update batch).

**Reducer** (`app/src/core/query/reducers.ts:498-530`): Finds the transaction by `id`, replaces it in-place, updates the reference index.

#### tx.deleted
**Purpose:** Remove a transaction from view (soft-delete — the event stays in the log).
**Fields** (`app/src/core/events/schemas.ts:486-497`):
- `id`: ULID of this deletion event (not the transaction id)
- `txId`: ULID of the transaction being deleted
- `deletedAt`: ISO timestamp
- Plus envelope fields (datasetId, actorDeviceId, actorUserId, etc.)

**Reducer** (`app/src/core/query/reducers.ts:532-558`): Removes transaction from `readModel.transactions`, also cleans up associated notes and splits.

### Domain: account (Account configuration)

Accounts represent bank accounts or similar money pools. Configuration includes IBAN, color, active/archived status.

#### AccountCreated
**Purpose:** Establish a new account (wire-style flat event, no envelope).
**Fields** (`app/src/core/events/schemas.ts:135-152`):
- `type`: literal 'AccountCreated'
- `id`: account ULID
- `name`: string ≤ 100 (internal name, e.g., "Checking Account")
- `currency`: 'EUR' (fixed)
- `openingBalance`: number
- `sortOrder`: int ≥ 0 (display order; required per WI-23; see "Schema migration policy" in `docs/security/security-requirements-v0.1.md`)
- `bankName`, `bankNameShort`, `label`, `iban`, `color`, `isPaypal` (optional fields)
- `createdAt`: ISO timestamp

**Reducer** (`app/src/core/query/reducers.ts:109-128`): Appends to `readModel.configAccounts`.

#### AccountUpdated, AccountArchived, AccountUnarchived
**Purpose:** Modify or soft-delete an account.
**Fields** (`app/src/core/events/schemas.ts:199-238`):
- `type`: 'AccountUpdated' | 'AccountArchived' | 'AccountUnarchived'
- `id`: ULID of this event (not the account id)
- `accountId`: which account is affected
- `changes`: object with optional fields (name, bankName, label, iban, color, isPaypal) — UpdatedEvent only; Archived/Unarchived events carry archivedAt/unarchivedAt timestamps
- `updatedAt` or `archivedAt` or `unarchivedAt`: ISO timestamp

**Reducer** (`app/src/core/query/reducers.ts:170-209`): Patches or archives the account in-place.

### Domain: category (Category + Subcategory configuration)

Categories group transactions (e.g., "Salaries", "Office Rent"). Each category has zero or more subcategories.

#### CategoryCreated
**Purpose:** Establish a new category.
**Fields** (`app/src/core/events/schemas.ts:86-102`):
- `type`: 'CategoryCreated'
- `id`: ULID
- `name`: string ≤ 100
- `description`: string ≤ 300 or null
- `categoryType`: 'income' | 'expense'
- `sortOrder`: int ≥ 0 (required per WI-23)
- `isActive`: boolean (default: true)
- `subcategories`: array of { id, name, isActive } (can be empty)
- `createdAt`: ISO timestamp

**Reducer** (`app/src/core/query/reducers.ts:130-145`): Appends to `readModel.configCategories`.

#### CategoryUpdated, CategoryArchived, CategoryUnarchived
**Similar pattern to Account**, modifying a category's name, color, kind.
**Reducer** (`app/src/core/query/reducers.ts:211-246`): Patches or archives in-place.

#### SubcategoryCreated, SubcategoryUpdated, SubcategoryArchived, SubcategoryUnarchived
**Purpose:** Manage subcategories (first-class events, projected inline onto parent category).
**Key difference from accounts:** Subcategories are first-class on the event log (each carries its `parentCategoryId`) but projected into the read model as children of `ConfigCategory.subcategories[]`.
**Fields** (`app/src/core/events/schemas.ts:274-325`):
- `id`: ULID (entity id for Created; event ULID for mutations)
- `subcategoryId`: ULID (for Update/Archive/Unarchive, identifies which subcategory)
- `parentCategoryId`: ULID (always present — links to parent category)
- `name`, `color`, changes, archive timestamps per pattern

**Reducer** (`app/src/core/query/reducers.ts:248-325`): Finds parent category, mutates its subcategories array.

### Domain: tag (Tag configuration)

Tags are user-defined labels that can be applied to transactions.

#### TagCreated
**Purpose:** Define a new tag.
**Fields** (`app/src/core/events/schemas.ts:108-124`):
- `type`: 'TagCreated'
- `id`: ULID
- `name`: string ≤ 100
- `color`: string ≤ 20 (hex code) or null
- `sortOrder`: int ≥ 0 (required per WI-23)
- `isActive`: boolean
- `createdAt`: ISO timestamp

**Reducer** (`app/src/core/query/reducers.ts:147-160`): Appends to `readModel.configTags`.

#### TagUpdated, TagArchived, TagUnarchived
**Similar pattern to Account/Category.**
**Reducer** (`app/src/core/query/reducers.ts:327-361`): Patches or archives in-place.

### Domain: movement (Import)

Movement-imported events record transactions that came via CSV import (not manually entered).

#### movement.imported
**Purpose:** Record a transaction row imported from a CSV file.
**Fields** (`app/src/core/events/schemas.ts:365-389`):
- `type`: 'movement.imported' (flat wire-style event)
- `id`: ULID
- `date`, `movementType` ('income' | 'expense'), `amount`, `currency`, `description`, `accountId`, `categoryId`, `subcategoryId`, `tagIds`, `status`, `createdAt` — same as `tx.created`
- `rowHash`: string ≤ 16 chars (SHA-256 prefix of the CSV row, prevents duplicate imports)
- `sourceFileName`: name of the source CSV file
- `importBatchId`: ULID grouping all rows from one import session
- `rowIndex`: int (line number in the file)
- `reference`, `details`: optional, same as `tx.created`

**Reducer** (`app/src/core/query/reducers.ts:363-390`): Creates a Transaction record (same as `tx.created`), also records `rowHash` in `readModel.rowHashes` to prevent re-import.

#### import.mapping.updated
**Purpose:** Store the column→field mapping for a CSV import (which column is the amount, date, etc.).
**Fields** (`app/src/core/events/schemas.ts:391-399`):
- `type`: 'import.mapping.updated'
- `id`: ULID
- `accountId`: which account this mapping applies to
- `dateColumn`, `amountColumn`, `descriptionColumn`: strings (column names)
- `updatedAt`: ISO timestamp

**Reducer** (`app/src/core/query/reducers.ts:392-424`): Upserts into `readModel.importMappings`.

### Domain: tx.note (Transaction notes / annotations)

Notes are user-supplied annotations attached to a transaction (e.g., "This is a grant from WHO"). They are ephemeral commentary (no version history, hard-deleted).

#### tx.note.added
**Purpose:** Create a note on a transaction.
**Fields** (`app/src/core/events/schemas.ts:418-425`):
- `type`: 'tx.note.added'
- `id`: ULID (event id — dedupe key for the log)
- `noteId`: ULID (note entity id — stable across edits)
- `txId`: ULID (which transaction)
- `text`: string min 1, max 2000 chars
- `createdAt`: ISO timestamp

**Reducer** (`app/src/core/query/reducers.ts:427-440`): Appends note to `readModel.notes[txId][]`.

#### tx.note.edited
**Purpose:** Update a note's text (in-place, no version history).
**Fields** (`app/src/core/events/schemas.ts:429-436`):
- `type`: 'tx.note.edited'
- `id`: ULID (event ULID)
- `noteId`: ULID (which note)
- `txId`: ULID
- `text`: updated text
- `editedAt`: ISO timestamp

**Reducer** (`app/src/core/query/reducers.ts:442-453`): Finds note by `noteId`, replaces its text.

#### tx.note.deleted
**Purpose:** Remove a note (hard-delete, no soft-delete flag).
**Fields** (`app/src/core/events/schemas.ts:440-446`):
- `type`: 'tx.note.deleted'
- `id`: ULID
- `noteId`: ULID
- `txId`: ULID
- `deletedAt`: ISO timestamp

**Reducer** (`app/src/core/query/reducers.ts:455-465`): Removes note from `readModel.notes[txId][]`.

### Domain: tx.split (Transaction splits)

Splits allow a treasurer to divide a single transaction into multiple line-items, each with its own category and amount. Once split, the parent remains visible in the Movements list but aggregations use the split amounts.

#### tx.split
**Purpose:** Create or replace a split configuration for a transaction.
**Fields** (`app/src/core/events/schemas.ts:531-539`):
- `type`: 'tx.split'
- `id`: ULID
- `parentTxId`: ULID (which transaction is being split)
- `splits`: array (min 2, max 20) of split rows:
  - `splitId`: ULID (identifies this split child)
  - `amountCents`: int > 0 (amount in EUR cents, e.g., 30000 = €300.00)
  - `categoryId`, `subcategoryId`: ULID or null
  - `comment`: string ≤ 500 chars or null
  - `sortOrder`: int ≥ 0
- `createdAt`: ISO timestamp

**Reducer** (`app/src/core/query/reducers.ts:467-486`): Stores splits in `readModel.splits[parentTxId]` and marks parent in `readModel.splitParentIds`.

#### tx.split.removed
**Purpose:** Revert a transaction to un-split single-line behavior.
**Fields** (`app/src/core/events/schemas.ts:541-548`):
- `type`: 'tx.split.removed'
- `id`: ULID
- `parentTxId`: ULID
- `removedAt`: ISO timestamp

**Reducer** (`app/src/core/query/reducers.ts:488-496`): Deletes splits for this parent, removes from `splitParentIds`.

## Update and delete patterns

### Updates: append-only with replacement

When a transaction is updated, the app:
1. Creates a **new event** of type `tx.updated` with a **new ULID** as its `event.id`.
2. The event carries a **full-replacement payload** (the new state, not a delta).
3. The payload includes the original transaction's `id` field (unchanged).
4. The reducer finds the transaction by this `id` and replaces it in-place in the read model.

**Example:** If transaction `01KQ2W894ZCZEM8NTT88F2GACX` (created via `tx.created`) is edited, a new event appears:

```json
{
  "id": "01KQ2WA12B3C4D5E6F7G8H9IJ2K3",
  "type": "tx.updated",
  "datasetId": "01KQ2W894ZCZEM8NTT88F2GACX",
  "actorDeviceId": "...",
  "actorUserId": "...",
  "createdAt": "2026-04-20T14:30:00Z",
  "payload": {
    "id": "01KQ2W894ZCZEM8NTT88F2GACX",
    "date": "2026-04-20",
    "type": "expense",
    "amount": 125.50,
    "description": "Office supplies (updated)",
    ...
  }
}
```

Both events exist in the log. The `tx.updated` event's **`createdAt` timestamp marks when the edit occurred**, while the original `tx.created` event records the insertion time. The read model only stores the latest state (the transaction at index = the one updated by the most recent event).

### Deletes: soft-delete via event

When a transaction is deleted, the app:
1. Creates a new event of type `tx.deleted` with a new ULID.
2. The event carries the transaction's original `txId` (not the deletion event's id).
3. The reducer removes the transaction from `readModel.transactions`.

**Example:**

```json
{
  "id": "01KQ2WA55X6Y7Z8A9B0C1D2E3F4G5",
  "type": "tx.deleted",
  "txId": "01KQ2W894ZCZEM8NTT88F2GACX",
  "datasetId": "...",
  "deletedAt": "2026-04-21T10:00:00Z",
  ...
}
```

The original `tx.created` (or `movement.imported`) and any `tx.updated` events **remain in the log** (append-only preservation). The deletion is recorded as a separate event that the reducer uses to exclude the transaction from the read model.

This is true for all archive/unarchive patterns (AccountArchived, CategoryArchived, etc.) — the entity remains in the log but is marked with an `archivedAt` timestamp.

## Schema migration policy

When a required field is added to an event type, existing on-disk events may lack it. The bootstrap sequence handles this:

1. The schema marks the field as `.optional()` temporarily (with inline comments).
2. After parsing, a **backfill step** (in `JsonFileEventLog.load()`) injects default values for legacy events.
3. Zod validation then runs on the backfilled event (now well-formed).
4. New events written by handlers **must always include the field** (handlers remain strict).

Example: WI-23 added required `sortOrder` to account/category/tag creation events. The loader backfills missing `sortOrder` with sequential indexes (0, 1, 2, …) before validation runs. See `.squad/skills/event-schema-migration-gate/SKILL.md` for the full pattern.

## Encryption: deferred to M2

The event log **transport layer** is responsible for encryption at M2 (Milestone 2). Currently, all events are stored **plaintext**. The `dekVersion` field in each event envelope is a placeholder; the actual data encryption key (DEK) and cipher suite will be wired in M2 via ADR-002 / `docs/security/crypto-spec.md`.

For trial (M1), event content is not encrypted. Security posture relies on **folder access controls** (the dataset folder lives on OneDrive or SharePoint with configured permissions). See `docs/guides/trial-deployment.md` §6 for explicit plain-text security practices.

## Reference sources

- Event schemas: `app/src/core/events/schemas.ts`
- Reducer (event replay): `app/src/core/query/reducers.ts`
- Event log persistence: `app/src/core/eventLog/JsonFileEventLog.ts`
- Bootstrap hydration: `app/src/main/bootstrap.ts`
- IPC handlers (command wiring): `app/src/main/ipc/handlers/transaction.ts`

## See also

- `docs/architecture/dataset-and-storage.md` — dataset folders, switching datasets, safety.
- `docs/guides/trial-deployment.md` — how NGO staff use the app with shared datasets.
- `docs/security/crypto-spec.md` — encryption roadmap (M2+).
