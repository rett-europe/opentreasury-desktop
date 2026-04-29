// P1-3 trial-readiness — read-only EventLog wrapper.
//
// Blocks domain event writes (`append`, `appendBatch`) when the app is running
// in read-only mode (trial posture: one active writer per dataset, all others
// are read-only observers sharing the same OneDrive folder).
//
// Design:
//   - Transparent wrapper — implements the EventLog interface.
//   - Throws a typed ReadOnlyEventLogError on blocked operations.
//   - Forwards all read operations to the inner log unchanged.
//   - Wired into bootstrap when appConfig.readOnly === true.
//
// NOT blocked by read-only mode:
//   - app-config.json writes (otherwise users can't exit read-only mode)
//   - profile.json writes (otherwise users can't fix their profile)
//   - Any read operation (load, query, replay)
//
// See .squad/decisions/inbox/neo-trial-readiness-plan.md (Risk 4) for scope.

import type { DomainEvent, EventLog } from '../core/eventLog/EventLog';

/**
 * Error thrown when attempting to write to a read-only event log.
 * IPC handlers catch this and map to the EVENT_LOG_READONLY error code.
 */
export class ReadOnlyEventLogError extends Error {
  constructor(message?: string) {
    super(
      message ??
        'Event log is in read-only mode. Domain events cannot be written. (Change in Settings.)',
    );
    this.name = 'ReadOnlyEventLogError';
    // Maintain proper stack trace for where the error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ReadOnlyEventLogError);
    }
  }
}

/**
 * Creates a read-only wrapper around an EventLog implementation.
 * Blocks append() and appendBatch() with a ReadOnlyEventLogError.
 * All other methods forward to the inner log unchanged.
 *
 * @param inner - The underlying EventLog implementation
 * @returns A read-only EventLog that blocks writes
 */
export function createReadOnlyEventLog(inner: EventLog): EventLog {
  return {
    async append(_event: DomainEvent): Promise<void> {
      throw new ReadOnlyEventLogError();
    },

    async appendBatch(_events: readonly DomainEvent[]): Promise<void> {
      throw new ReadOnlyEventLogError();
    },

    async load(): Promise<DomainEvent[]> {
      return inner.load();
    },
  };
}
