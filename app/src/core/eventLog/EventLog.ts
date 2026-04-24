// WI-4′ — Append-only event log interface (M1.5 vertical slice).
//
// Swappable contract so the current local-JSON adapter can be replaced by the
// OneDrive + crypto adapter in M2 (WI-4 / WI-5) without touching core/query,
// IPC handlers, or the renderer.
//
// Contract (LOCKED — shared with WI-11 command-side):
//   append(event)  → idempotent by event.id. Safe to replay the same event
//                    many times (e.g. during sync retries); only the first
//                    write is durable.
//   load()         → returns every event ever appended, in insertion order.
//                    Callers fold into reducers; reducers assume determinism.
//
// Design notes:
// - Pure interface, no Electron / fs types — implementations choose transport.
// - Errors propagate: append() rejects on write failure, load() rejects on
//   unrecoverable read failure. Per-line corruption is tolerated by concrete
//   adapters (see JsonFileEventLog for the NDJSON tail-truncation policy).

import type { DomainEvent } from '../events/schemas';

export interface EventLog {
  /** Append a single event. No-op if event.id has already been appended. */
  append(event: DomainEvent): Promise<void>;

  /**
   * Atomically append multiple events. All-or-nothing at the OS level:
   * concatenates the NDJSON lines into a single write + fsync. Events whose
   * ids have already been appended are silently skipped (idempotent).
   * Rejects on I/O failure — in that case **no** events are persisted.
   */
  appendBatch(events: readonly DomainEvent[]): Promise<void>;

  /** Load all appended events in insertion order. Empty array if the log is empty. */
  load(): Promise<DomainEvent[]>;
}

export type { DomainEvent };
