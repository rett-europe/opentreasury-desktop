// Rehydrate the in-memory read model from the on-disk event log.
//
// Why this exists: the main process keeps a single `ReadModel` that is built
// once at boot (see `bootstrap.ts`) and thereafter only mutated by the local
// instance's write handlers via `applyEvent`. When two desktop instances
// share an encrypted workspace (per-device `events-<deviceId>.ndjson` files
// + shared `events.key`), neither instance learns about the other's writes
// until it restarts. `rehydrateReadModelFromDisk` re-reads every device file
// from disk and re-projects the model so a renderer-driven refresh actually
// surfaces remote edits.
//
// Concurrency: callers may invoke this from any IPC handler. We single-flight
// concurrent calls — every caller that arrives while a previous rehydrate is
// in flight observes the same promise — so a frantic Refresh-button operator
// does not trigger N parallel `load()` calls (which would all merge-and-decrypt
// every NDJSON line N times for no benefit). Once the in-flight rehydrate
// resolves, a fresh call starts a new flight, picking up any events written
// after the previous load began.
//
// Atomic swap (from any concurrent IPC's point of view): once `eventLog.load()`
// resolves, `replayEvents()` runs synchronously without an `await` between
// the two — JavaScript's single-threaded event loop guarantees no other IPC
// handler observes a half-rebuilt read model. The known caveat is that any
// write handler whose `applyEvent` ran during the `await load()` micro-task
// gap will be wiped when `replayEvents` swaps the model; that race is logged
// as a follow-up (would need a shared async mutex across all read-model
// mutations), not addressed here.

import type { DomainEvent } from '../../core/eventLog/EventLog.js';

/**
 * Successful rehydrate outcome. `eventCount` is the number of events the
 * event log returned from disk (post-merge across all device files), and
 * `durationMs` is wall-clock time from when this caller's flight started
 * (or joined an in-flight one) to when the model swap completed.
 */
export interface RehydrateSuccess {
  ok: true;
  eventCount: number;
  durationMs: number;
}

/**
 * Failed rehydrate outcome. The renderer surfaces `message` to the user via
 * a toast; `code` is stable so callers can branch on specific failure modes
 * later (e.g. distinguish I/O failure from decryption failure) without
 * pattern-matching on free-form English.
 */
export interface RehydrateFailure {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type RehydrateResult = RehydrateSuccess | RehydrateFailure;

export interface RehydrateDeps {
  /** Re-reads every event from disk. For the encrypted multi-device log this
   * merges all device NDJSON files in their canonical order. */
  readonly eventLog: { load: () => Promise<DomainEvent[]> };
  /** Atomically swaps the in-memory read model. Must NOT be async — see the
   * file header note about atomic swap. */
  readonly replayEvents: (events: DomainEvent[]) => void;
  /** Override the clock for deterministic durationMs assertions in tests. */
  readonly now?: () => number;
}

/**
 * Factory: returns a single-flight rehydrate function bound to the given
 * dependencies. Each factory invocation gets its own in-flight slot, so a
 * stale closure (e.g. one captured before `installEncryptedEventLog` swapped
 * the log) cannot prevent a fresh rehydrate against the new dependencies.
 */
export function createRehydrateReadModelFromDisk(
  deps: RehydrateDeps,
): () => Promise<RehydrateResult> {
  const now = deps.now ?? ((): number => Date.now());
  let inflight: Promise<RehydrateResult> | null = null;

  return function rehydrateReadModelFromDisk(): Promise<RehydrateResult> {
    if (inflight !== null) {
      return inflight;
    }
    const started = now();
    const promise: Promise<RehydrateResult> = (async () => {
      try {
        const events = await deps.eventLog.load();
        deps.replayEvents(events);
        return {
          ok: true,
          eventCount: events.length,
          durationMs: now() - started,
        };
      } catch (err) {
        return {
          ok: false,
          error: {
            code: 'rehydrate_failed',
            message: err instanceof Error ? err.message : String(err),
          },
        };
      }
    })();

    const finished: Promise<RehydrateResult> = promise.finally(() => {
      // Reset only if no follow-up call has replaced `inflight` already
      // (defensive — assignment happens before any awaited continuation so
      // the simple equality check is safe).
      if (inflight === finished) {
        inflight = null;
      }
    });
    inflight = finished;

    return inflight;
  };
}
