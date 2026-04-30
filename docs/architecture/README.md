# Architecture

OpenTreasury Desktop is an **event-sourced Electron application** for small NGOs to manage treasury data without cloud infrastructure. This directory contains the technical architecture documentation.

## Quick overview

- **Event-sourced:** All state is derived from an append-only log of domain events stored in NDJSON format.
- **In-memory read model:** Events are replayed on boot to hydrate an immutable in-memory projection of the current state.
- **No external database:** The event log lives in a local or cloud-sync folder (OneDrive/SharePoint); no backend server required.
- **Single dataset per folder:** Each folder contains one `events.ndjson` log plus metadata; users can switch datasets via Preferences.

## Core concepts

**Event** — an immutable record of something that happened (transaction created, account renamed, data imported). Events carry metadata (who, when, which dataset) and a type-specific payload. See `docs/architecture/event-model.md`.

**Event log** — the append-only NDJSON file (`events.ndjson`) storing all domain events. Persisted to disk, encrypted at M2 (M1 plain-text). See `docs/architecture/event-model.md` § Storage format.

**Reducer** — a pure function that folds events into the read model. Replayed on each boot; used to project events into in-memory data structures. Code: `app/src/core/query/reducers.ts`.

**Read model** — the in-memory snapshot of current state (list of transactions, accounts, categories, tags, notes, splits, import metadata). Immutable; all changes via new events. Code: `app/src/core/query/types.ts`.

**Dataset** — a folder containing one `events.ndjson` log plus metadata. Users can switch datasets (Preferences → Change folder); each boot resolves which folder to load from. See `docs/architecture/dataset-and-storage.md`.

## Documentation

| Area | File |
| --- | --- |
| Event types, schema, storage format, update/delete patterns, encryption roadmap | [`event-model.md`](./event-model.md) |
| Dataset folders, location switching, safety, read-only mode | [`dataset-and-storage.md`](./dataset-and-storage.md) |
| Architecture decision records (tech stack, repo structure, i18n) | `adr-001-tech-stack.md`, `adr-002-repo-structure.md`, `adr-003-i18n-framework.md` |

## File structure

```
app/
├── src/
│   ├── core/
│   │   ├── eventLog/        # NDJSON event log I/O + persistence
│   │   ├── events/          # Event schema definitions (Zod)
│   │   ├── commands/        # Command handlers (business logic)
│   │   ├── query/           # Reducer + read-model types
│   │   └── crypto/          # Encryption (M2+)
│   ├── main/                # Electron main process
│   │   ├── bootstrap.ts     # Dataset folder resolution + read-model hydration
│   │   ├── config.ts        # app-config.json persistence
│   │   ├── ipc/handlers/    # IPC handlers wiring commands to the event log
│   │   └── eventLog-readonly-wrapper.ts
│   ├── preload/             # IPC bridge (preload script)
│   └── renderer/            # React UI (Electron renderer process)
```

## Key flows

### Boot sequence (app/src/main/bootstrap.ts)

1. Load `app-config.json` (or use defaults).
2. Resolve active dataset folder (env var → config → default).
3. Open `events.ndjson` from the resolved folder.
4. Parse and validate all events.
5. Replay events through the reducer to hydrate the read model.
6. Seed with demo data if the log is empty and not in production mode.

### Adding a transaction

1. **Renderer** → calls IPC `transaction:create` with user input (date, amount, description, …).
2. **Main process** → `app/src/main/ipc/handlers/transaction.ts:handleTransactionCreate()`:
   - Validates request schema (Zod).
   - Calls command `createTransaction()` with business logic (e.g., account exists?).
   - If valid, creates a new `tx.created` event with unique ULID + actor metadata.
   - Appends event to `events.ndjson` (atomic write).
   - Replays the event through the reducer.
   - Returns the event to the renderer.
3. **Renderer** receives the event + updates UI.

### Updating a transaction

1. **Renderer** → calls IPC `transaction:update` with new data + original `id`.
2. **Main process** → `app/src/main/ipc/handlers/transaction.ts:handleTransactionUpdate()`:
   - Validates request.
   - Calls command `updateTransaction()` with business logic.
   - Creates a new **`tx.updated` event** (full-replacement payload, new ULID).
   - Appends to `events.ndjson`.
   - Replays through reducer (finds transaction by original id, replaces in-place).
   - Returns the event.
3. **Renderer** updates UI.

**Both the `tx.created` and `tx.updated` events remain in the log** (append-only). The read model only reflects the latest state (replaced by the most recent update event).

### Switching datasets

1. **Renderer** → calls IPC `config:setDataDir` with new folder path.
2. **Main process** → `app/src/main/ipc/handlers/config.ts:handleConfigSetDataDir()`:
   - Validates folder (exists, writable).
   - Checks if `events.ndjson` exists; if yes, verifies `datasetId` matches current dataset (prevents mixing).
   - Writes new path to `app-config.json` atomically.
   - Calls `app.relaunch()` to restart the process.
3. **On next boot** → bootstrap resolves the new folder, loads the new `events.ndjson`, replays the read model, UI renders the new dataset.

**Old dataset stays in place.** No migration, no deletion.

## Validation layers

1. **Schema validation (Zod)** — all IPC requests validated at the boundary.
2. **Business-rule validation** — commands check invariants (e.g., account exists, amount > 0).
3. **Event persistence validation** — reducer ensures events apply to a consistent read model.

See `app/src/main/ipc/handlers/transaction.ts:64-120` for a complete example.

## Error handling

IPC handlers return discriminated unions:

```typescript
type CreateTransactionResponse = 
  | { ok: true; event: DomainEvent }
  | { ok: false; error: { code: string; message: string; field?: string } }
```

The renderer inspects `ok` and handles errors gracefully (e.g., display toast with error message).

## Testing

- **Unit tests** — commands, reducers, schema validation. Run: `npm run test`.
- **Integration tests** — command → event → read-model pipeline. Co-located in test files.
- **E2E tests** (perf-focused) — Playwright tests verifying event-sourcing scale (TODO: docs/perf/).

## Roadmap

- **M1 (Trial)** — single writer, plain-text events, basic CRUD on transactions/accounts/categories.
- **M2 (GA)** — encryption (AEAD per dataset), multi-writer conflict-free merge, Entra ID auth.
- **M3+** — mobile app, advanced analytics, audit trails.

---

See the README in the project root (`../../README.md`) for getting started, running the app, and contributing guidelines.
