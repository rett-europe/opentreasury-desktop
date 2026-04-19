# SKILL: NDJSON append-only event log for Electron apps

- **Confidence:** low (one successful application; pattern well-known outside this repo).
- **Extracted from:** WI-4′ (OpenTreasury Desktop, M1.5 storage slice).
- **Owner:** Morpheus (Backend).

## When to reach for this

You need local, crash-safe persistence for an ordered stream of small JSON
events (command/event sourcing, audit log, offline queue) in an Electron
main process, and you want the storage layer to be trivially replaceable by
a remote/encrypted adapter later.

## Shape

1. **Interface first.** Two methods: `append(event): Promise<void>` (idempotent
   by `event.id`) and `load(): Promise<Event[]>` (insertion order). No query,
   no cursor, no delete. Reducers on top, interface stays tiny.
2. **NDJSON file, not a JSON array.** `events.ndjson` with one object per
   line + `\n`. Append is `fs.open('a') → writeFile(line) → sync() → close()`
   — single syscall sequence, no read-modify-write.
3. **Crash-tolerant load.** Split on `\n`, `JSON.parse` each line, skip
   unparseable lines with a warning. A truncated tail from a mid-write crash
   is silently dropped; everything before it is fine.
4. **In-memory idempotency set.** Seed it during `load()`; check it in
   `append()`. Good enough for single-writer / load-before-write apps.
   Persist only if concurrent writers appear later.
5. **Keep the adapter Electron-free.** Constructor takes a directory path
   (string). Electron's `app.getPath('userData')` lookup happens in a thin
   main-process bootstrap file, not inside the adapter. Adapter is unit-
   testable in vitest's `node` env with `fs.mkdtemp` tmp dirs.
6. **Hydrate before handlers.** Call `load()` inside `app.whenReady()` and
   feed into reducers BEFORE registering IPC handlers, so the first query
   sees real data.
7. **Dev-seed belongs in bootstrap, not the adapter.** Gate on
   `NODE_ENV !== 'production'` AND empty log. Emit real domain events, never
   shortcut-write read-model rows.

## What locks the contract

- `event.id` must be the sole idempotency key.
- Payloads are preserved byte-for-byte (JSON round-trip). No schema validation
  inside the log — leave that to the reducer / event-schema layer.
- Empty log → `load()` returns `[]`, never throws.

## Known limits / follow-ups

- Single-writer only. Concurrent appenders would need file locking.
- Full rescan on load — fine up to ~10^5 events; add a snapshot checkpoint
  above that.
- `event.id` dedup is per-process after first `load()`; fine when
  `load` always precedes `append` but fragile if that invariant is broken.

## Reference implementation

`app/src/core/eventLog/JsonFileEventLog.ts` + `app/src/main/bootstrap.ts` in
this repo. Unit tests at `app/src/core/eventLog/JsonFileEventLog.test.ts`
cover the four canonical cases: round-trip, missing file, idempotency,
truncated-tail crash recovery.
