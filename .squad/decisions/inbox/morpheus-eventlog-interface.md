# EventLog interface — LOCKED contract for WI-4′ / WI-11 / (future) WI-4

**Status:** Locked (2026-04-19)
**Author:** Morpheus (Backend)
**Scope:** WI-4′ (M1.5 local-JSON adapter) + WI-11 (command-side write path).
 Supersedes nothing. Will be honoured by the M2 OneDrive+crypto adapter (WI-4).

## Interface

```ts
// app/src/core/eventLog/EventLog.ts
export interface EventLog {
  append(event: DomainEvent): Promise<void>;  // idempotent by event.id
  load(): Promise<DomainEvent[]>;             // insertion order
}
```

Where `DomainEvent` is the discriminated union already defined in
`app/src/core/events/schemas.ts` (AccountCreated, CategoryCreated, TagCreated,
TransactionCreated — WI-11 extends as needed).

## Guarantees

- **`append` is idempotent by `event.id`.** Re-appending the same event is a
  no-op. Callers MAY retry without deduping themselves.
- **`append` is durable on resolve.** The local adapter calls `fsync`. Network
  adapters (M2 OneDrive) will resolve only after the remote has acknowledged.
- **`load` returns every event ever appended, in insertion order.** Reducers
  assume this order is deterministic across restarts.
- **`load` tolerates per-line corruption.** Malformed NDJSON lines are skipped
  with a warning; the rest of the log is returned.
- **Empty log → `load()` returns `[]`** (not a thrown error, not `undefined`).

## Non-goals (by design)

- No cursor / pagination — reducers are cheap for M1.5 volumes, and OneDrive's
  delta-token model will be hidden behind the same interface in M2.
- No query — this is a log, not a database. Query surface lives in
  `app/src/core/query/` and is populated by `replayEvents`.
- No delete — append-only. Tombstones (future) are just more events.
- No transactions / batching — callers append one event at a time.

## Contract for implementations

1. Validate nothing beyond `event.id` presence. Schema validation is the
   reducer layer's responsibility (Zod in `core/events/schemas.ts`).
2. Preserve byte-for-byte equality of serialized payloads so
   `load()[i]` deep-equals the `append()`ed event.
3. Surface I/O errors. Don't silently swallow, don't wrap in domain errors —
   callers need the original to decide retry vs. abort.

## Consumers

- **WI-4′ (this slice):** `main/bootstrap.ts` constructs a `JsonFileEventLog`
  under `app.getPath('userData')/dev-events/`, calls `load()` then
  `replayEvents(events)`. IPC read handlers in `main/ipc/handlers/panel.ts`
  then project over the hydrated read model.
- **WI-11 (command-side, in-flight):** `main/ipc/handlers/commands.ts` will
  call `eventLog.append(event)` then `applyEvent(event)` to update the live
  read model. Singleton is exported from `main/bootstrap.ts`.
- **WI-4 (M2, OneDrive + crypto):** swap the `JsonFileEventLog` constructor in
  `bootstrap.ts` for `OneDriveEventLog` + envelope encryption in the adapter.
  No other file should need to change.

## Adapter choice for M1.5: `JsonFileEventLog` / NDJSON

- One JSON object per line + trailing `\n`.
- File: `<userData>/dev-events/events.ndjson`.
- `append()` = `fs.open('a') → writeFile(line) → sync() → close()`.
- `load()` = `readFile → split('\n') → JSON.parse each → skip malformed`.
- In-memory `Set<event.id>` for idempotency; re-populated on `load()`.

## Dev-seed behaviour (bootstrap, not the adapter)

When `events.ndjson` does not exist AND `NODE_ENV !== 'production'`, bootstrap
emits prototype-shaped events (5 accounts / 8 categories / 6 tags / 30 txs)
via `append()` before hydration. Never overwrites existing events. The
adapter has no concept of seeding — seeding is a main-process concern.
