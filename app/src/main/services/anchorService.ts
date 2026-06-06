// SPEC-028 WI-2 — Anchoring service (main process).
//
// Folds a SIGNED per-device frontier snapshot of the encrypted event log into
// the signed, hash-chained audit log as a new `audit.anchor` entry. One signed
// anchor makes the whole observed event history tamper-evident without signing
// every event.
//
// Two pieces:
//   • `runAnchorOnce` — performs a single best-effort anchor: verify the chain
//     (skip if corrupt — WI-3 owns fail-closed gating), take a STABLE frontier
//     snapshot (skip if not stable), compute the `event_log_root`, and append a
//     signed anchor entry. It NEVER throws and NEVER blocks a data write.
//   • `AnchorScheduler` — drives the triggers: on-unlock / on-lock (`anchorNow`)
//     plus N=1000 local appends OR a T=15 min timer armed on the first
//     unanchored write. Single-flight; runs strictly off the write path.
//
// PII: anchor entries and logs carry only ULIDs and hashes — never raw values.

import { computeEventLogRoot } from '../../core/audit/frontier.js';
import type { AuditLog } from '../../core/audit/types.js';
import type { FrontierSnapshotResult } from '../../core/eventLog/EncryptedMultiDeviceEventLog.js';

/** The subset of the event log the anchor service needs. */
export interface FrontierSource {
  snapshotFrontier(): Promise<FrontierSnapshotResult>;
}

export type AnchorOutcome =
  | { readonly status: 'anchored'; readonly seq: number; readonly eventLogRoot: string }
  | { readonly status: 'skipped'; readonly reason: string }
  | { readonly status: 'error'; readonly error: unknown };

export type AnchorLogger = (
  level: 'info' | 'warn',
  message: string,
  meta?: Record<string, unknown>,
) => void;

export interface RunAnchorDeps {
  readonly auditLog: AuditLog;
  readonly eventLog: FrontierSource;
  readonly newUlid: () => string;
  readonly now: () => Date;
  readonly log?: AnchorLogger;
}

/**
 * Perform a single best-effort anchor. Wrapped so it NEVER throws to the caller
 * and never blocks a write: every failure path resolves to a typed outcome.
 */
export async function runAnchorOnce(deps: RunAnchorDeps): Promise<AnchorOutcome> {
  try {
    // Fail-closed gating (refuse to open the workspace on a corrupt chain) is
    // WI-3's job. Here we merely SKIP anchoring onto a chain that wouldn't
    // verify — appending would throw anyway, and we must not block writes.
    const verdict = await deps.auditLog.verifyChain();
    if (!verdict.ok) {
      deps.log?.('warn', 'anchor skipped: audit chain did not verify', {
        reason: verdict.reason ?? 'unknown',
      });
      return { status: 'skipped', reason: `chain-${verdict.reason ?? 'unverified'}` };
    }

    const snap = await deps.eventLog.snapshotFrontier();
    if (!snap.ok) {
      // `no-events` is the common quiescent case; everything else is a refusal
      // to sign an untrustworthy snapshot (best-effort — try again next time).
      if (snap.reason !== 'no-events') {
        deps.log?.('warn', 'anchor skipped: frontier snapshot not stable', {
          reason: snap.reason,
        });
      }
      return { status: 'skipped', reason: snap.reason };
    }

    const eventLogRoot = computeEventLogRoot(snap.frontiers);
    const entry = await deps.auditLog.appendAnchor({
      action: 'audit.anchor',
      targetId: deps.newUlid(),
      observedAt: deps.now().toISOString(),
      eventLogRoot,
      deviceFrontiers: snap.frontiers,
    });

    deps.log?.('info', 'anchor appended', {
      seq: entry.seq,
      deviceCount: snap.frontiers.length,
    });
    return { status: 'anchored', seq: entry.seq, eventLogRoot };
  } catch (err) {
    // Best-effort: swallow so a failed anchor can never surface to a write path.
    deps.log?.('warn', 'anchor failed', { error: String(err) });
    return { status: 'error', error: err };
  }
}

/** Default trigger thresholds (spec OQ2 RESOLVED). */
export const DEFAULT_ANCHOR_THRESHOLD_APPENDS = 1000;
export const DEFAULT_ANCHOR_INTERVAL_MS = 15 * 60 * 1000;

type TimerHandle = ReturnType<typeof setTimeout>;

export interface AnchorSchedulerOptions {
  /** Bound `runAnchorOnce` invocation. Must itself never throw. */
  readonly run: () => Promise<AnchorOutcome>;
  /** N — local appends before a count-triggered anchor. Default 1000. */
  readonly thresholdAppends?: number;
  /** T — ms of write activity before a timer-triggered anchor. Default 15 min. */
  readonly intervalMs?: number;
  /** Injectable timer for tests. Defaults to `setTimeout`. */
  readonly setTimer?: (cb: () => void, ms: number) => TimerHandle;
  /** Injectable clear for tests. Defaults to `clearTimeout`. */
  readonly clearTimer?: (handle: TimerHandle) => void;
}

/**
 * Drives anchor triggers. `onLocalAppend(delta)` is fed from the event log under
 * its write mutex (cheap, non-throwing). Count/timer triggers run in a
 * microtask so they are strictly OFF the write path. `anchorNow()` is awaited at
 * unlock/lock. Single-flight: a run in progress collapses concurrent triggers.
 */
export class AnchorScheduler {
  private readonly run: () => Promise<AnchorOutcome>;
  private readonly thresholdAppends: number;
  private readonly intervalMs: number;
  private readonly setTimer: (cb: () => void, ms: number) => TimerHandle;
  private readonly clearTimer: (handle: TimerHandle) => void;

  private count = 0;
  private timer: TimerHandle | null = null;
  private running: Promise<AnchorOutcome> | null = null;
  private disposed = false;

  constructor(opts: AnchorSchedulerOptions) {
    this.run = opts.run;
    this.thresholdAppends = opts.thresholdAppends ?? DEFAULT_ANCHOR_THRESHOLD_APPENDS;
    this.intervalMs = opts.intervalMs ?? DEFAULT_ANCHOR_INTERVAL_MS;
    this.setTimer = opts.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h));
  }

  /**
   * Fed from the event log after each successful LOCAL append. Counts only
   * local appends (peer events arrive via sync, not here). Never throws.
   */
  onLocalAppend(delta: number): void {
    if (this.disposed || delta <= 0) return;
    this.count += delta;
    this.armTimer();
    if (this.count >= this.thresholdAppends) {
      // Off the write path: schedule, never await here.
      queueMicrotask(() => {
        if (!this.disposed) void this.startRun();
      });
    }
  }

  /**
   * Trigger an anchor for unlock/lock and AWAIT it. If a run is already in
   * flight, wait for it and then run once more so the manual anchor reflects
   * every write up to this call (important before lock wipes the MK).
   */
  async anchorNow(): Promise<AnchorOutcome> {
    if (this.disposed) return { status: 'skipped', reason: 'disposed' };
    const inflight = this.running;
    if (inflight !== null) {
      try {
        await inflight;
      } catch {
        // startRun never rejects, but be defensive.
      }
      if (this.disposed) return { status: 'skipped', reason: 'disposed' };
    }
    return this.startRun();
  }

  dispose(): void {
    this.disposed = true;
    this.disarmTimer();
  }

  private startRun(): Promise<AnchorOutcome> {
    if (this.running !== null) return this.running;
    // Reset the counter + timer when a run STARTS so appends arriving during
    // the run re-arm the next trigger (rather than being lost).
    this.count = 0;
    this.disarmTimer();
    const p = (async (): Promise<AnchorOutcome> => {
      try {
        return await this.run();
      } catch (err) {
        return { status: 'error', error: err };
      } finally {
        this.running = null;
      }
    })();
    this.running = p;
    return p;
  }

  private armTimer(): void {
    if (this.timer !== null || this.disposed) return;
    this.timer = this.setTimer(() => {
      this.timer = null;
      if (!this.disposed) void this.startRun();
    }, this.intervalMs);
  }

  private disarmTimer(): void {
    if (this.timer === null) return;
    this.clearTimer(this.timer);
    this.timer = null;
  }
}
