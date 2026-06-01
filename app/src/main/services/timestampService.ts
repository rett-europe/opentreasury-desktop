// SPEC-028 WI-5 (#362) — Trusted-timestamping service (main process).
//
// Binds each `audit.anchor`'s event_log_root to an external RFC-3161 trusted
// timestamp, recorded as a SEPARATE signed `audit.anchor.timestamped` receipt
// that references the anchor. The anchor is never mutated (FR13).
//
// Two pieces, mirroring anchorService's discipline:
//   • `runTimestampOnce` — one best-effort drain: verify the chain (skip if
//     corrupt), derive pending anchors from the chain, and for each eligible
//     one request a token, FULLY verify it, then append a signed receipt. It
//     NEVER throws and NEVER blocks a write/unlock/lock (FR14/FR15).
//   • `TimestampScheduler` — drives triggers (on-unlock drain, after-new-anchor
//     drain, periodic timer while work remains). Single-flight; off the write
//     path.
//
// PII: receipts + logs carry only ULIDs, hashes, serials and counts.

import type { AuditLog } from '../../core/audit/types.js';
import { anchorMessageImprint } from '../../core/audit/timestamp/imprint.js';
import { OID } from '../../core/audit/timestamp/oids.js';
import type { TimestampProvider } from '../../core/audit/timestamp/provider.js';
import {
  findPendingAnchors,
  type TimestampRetryState,
  type PendingAnchor,
} from '../../core/audit/timestamp/queue.js';
import { verifyTimeStampToken } from '../../core/audit/timestamp/rfc3161.js';
import { resolveTrustRoots } from '../../core/audit/timestamp/roots.js';

export type TimestampLogger = (
  level: 'info' | 'warn',
  message: string,
  meta?: Record<string, unknown>,
) => void;

export interface RunTimestampDeps {
  readonly auditLog: AuditLog;
  readonly provider: TimestampProvider;
  readonly newUlid: () => string;
  readonly now: () => Date;
  /** Random nonce generator (injected for tests). */
  readonly randomNonce: () => Uint8Array;
  /** Advisory retry/backoff state, shared across drains within a process. */
  readonly retry: TimestampRetryState;
  /** Cap anchors processed per drain (bounds a long catch-up). Default: all. */
  readonly maxPerRun?: number;
  readonly log?: TimestampLogger;
}

export type TimestampOutcome =
  | { readonly status: 'idle'; readonly reason: string }
  | {
      readonly status: 'drained';
      readonly appended: number;
      readonly failed: number;
      readonly pending: number;
    };

/**
 * Perform a single best-effort drain. Wrapped so it NEVER throws and never
 * blocks a write: every failure path resolves to a typed outcome.
 */
export async function runTimestampOnce(deps: RunTimestampDeps): Promise<TimestampOutcome> {
  try {
    // Skip (do not block) a chain that would not verify — appending a receipt
    // would throw anyway. WI-3 owns fail-closed gating at unlock.
    const verdict = await deps.auditLog.verifyChain();
    if (!verdict.ok) {
      deps.log?.('warn', 'timestamp skipped: audit chain did not verify', {
        reason: verdict.reason ?? 'unknown',
      });
      return { status: 'idle', reason: `chain-${verdict.reason ?? 'unverified'}` };
    }

    const pending = findPendingAnchors(await deps.auditLog.readAll());
    if (pending.length === 0) return { status: 'idle', reason: 'no-pending' };

    const trustRootsPem = resolveTrustRoots(deps.provider.trustRootIds);
    const limit = deps.maxPerRun ?? pending.length;
    let appended = 0;
    let failed = 0;
    let processed = 0;

    for (const p of pending) {
      if (processed >= limit) break;
      if (!deps.retry.eligible(p.anchorSeq, deps.now().getTime())) continue;
      processed += 1;
      const ok = await timestampOne(deps, p, trustRootsPem);
      if (ok) appended += 1;
      else failed += 1;
    }

    const remaining = findPendingAnchors(await deps.auditLog.readAll()).length;
    return { status: 'drained', appended, failed, pending: remaining };
  } catch (err) {
    // Best-effort: swallow so a failed drain can never surface to a write path.
    deps.log?.('warn', 'timestamp drain failed', { error: String(err) });
    return { status: 'idle', reason: 'error' };
  }
}

/** Timestamp a single pending anchor. Returns true iff a receipt was appended. */
async function timestampOne(
  deps: RunTimestampDeps,
  p: PendingAnchor,
  trustRootsPem: readonly string[],
): Promise<boolean> {
  try {
    const imprint = anchorMessageImprint(p.anchorEntry);
    const nonce = deps.randomNonce();

    const res = await deps.provider.requestTimestamp({ alg: 'sha256', hash: imprint, nonce });
    if (!res.ok) {
      deps.retry.recordFailure(p.anchorSeq, res.error, deps.now().getTime());
      return false;
    }

    // Verify the token BEFORE folding it into a signed receipt. A malformed /
    // untrusted / mismatched token must never produce a receipt entry.
    const v = verifyTimeStampToken({
      tokenDer: res.tokenDer,
      expectedImprintAlgOid: OID.SHA256,
      expectedImprintHash: imprint,
      expectedNonce: nonce,
      trustRootsPem,
      now: deps.now(),
    });
    if (!v.ok) {
      deps.log?.('warn', 'timestamp token rejected', { seq: p.anchorSeq, reason: v.reason });
      deps.retry.recordFailure(p.anchorSeq, `verify-${v.reason}`, deps.now().getTime());
      return false;
    }

    // appendTimestamp re-checks for an existing receipt under the audit lock
    // (idempotent), so concurrent drains / restarts never double-append.
    const entry = await deps.auditLog.appendTimestamp({
      targetId: deps.newUlid(),
      providerId: deps.provider.id,
      anchorSeq: p.anchorSeq,
      anchorEntryHash: p.anchorEntryHash,
      eventLogRoot: p.eventLogRoot,
      imprintAlg: 'sha256',
      messageImprint: imprint.toString('hex'),
      tsaNonce: Buffer.from(nonce).toString('hex'),
      tsaToken: Buffer.from(res.tokenDer).toString('base64'),
      tsaGenTime: v.genTime.toISOString(),
      tsaSerialNumber: v.serialHex,
      tsaPolicyOid: v.tstInfo.policyOid,
    });

    deps.retry.clear(p.anchorSeq);
    deps.log?.('info', 'timestamp receipt appended', {
      anchorSeq: p.anchorSeq,
      receiptSeq: entry.seq,
      serial: v.serialHex,
    });
    return true;
  } catch (err) {
    // A throw here (e.g. transient append error) leaves the anchor pending; the
    // next drain retries. Never propagate.
    deps.retry.recordFailure(p.anchorSeq, `append-${String(err)}`, deps.now().getTime());
    deps.log?.('warn', 'timestamp append failed', { seq: p.anchorSeq, error: String(err) });
    return false;
  }
}

// --------------------------------------------------------------------------
// Scheduler
// --------------------------------------------------------------------------

/** Periodic drain cadence while pending anchors remain. */
export const DEFAULT_TIMESTAMP_INTERVAL_MS = 5 * 60 * 1000;

type TimerHandle = ReturnType<typeof setTimeout>;

export interface TimestampSchedulerOptions {
  /** Bound `runTimestampOnce` invocation. Must itself never throw. */
  readonly run: () => Promise<TimestampOutcome>;
  /** Periodic retry cadence while items remain. Default 5 min. */
  readonly intervalMs?: number;
  readonly setTimer?: (cb: () => void, ms: number) => TimerHandle;
  readonly clearTimer?: (handle: TimerHandle) => void;
}

/**
 * Drives timestamp drains strictly off the write path. `drainNow()` is awaited
 * at unlock; `onNewAnchor()` schedules a microtask drain after a fresh anchor;
 * a timer re-drains while pending items remain. Single-flight: a run in
 * progress collapses concurrent triggers.
 */
export class TimestampScheduler {
  private readonly run: () => Promise<TimestampOutcome>;
  private readonly intervalMs: number;
  private readonly setTimer: (cb: () => void, ms: number) => TimerHandle;
  private readonly clearTimer: (handle: TimerHandle) => void;

  private timer: TimerHandle | null = null;
  private running: Promise<TimestampOutcome> | null = null;
  private disposed = false;

  constructor(opts: TimestampSchedulerOptions) {
    this.run = opts.run;
    this.intervalMs = opts.intervalMs ?? DEFAULT_TIMESTAMP_INTERVAL_MS;
    this.setTimer = opts.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h));
  }

  /** Schedule a best-effort drain after a new anchor (never awaited here). */
  onNewAnchor(): void {
    if (this.disposed) return;
    queueMicrotask(() => {
      if (!this.disposed) void this.startRun();
    });
  }

  /**
   * Trigger a drain for unlock and AWAIT it. If a run is already in flight, wait
   * for it and then run once more so the drain reflects anchors added meanwhile.
   */
  async drainNow(): Promise<TimestampOutcome> {
    if (this.disposed) return { status: 'idle', reason: 'disposed' };
    const inflight = this.running;
    if (inflight !== null) {
      try {
        await inflight;
      } catch {
        // startRun never rejects; be defensive.
      }
      if (this.disposed) return { status: 'idle', reason: 'disposed' };
    }
    return this.startRun();
  }

  dispose(): void {
    this.disposed = true;
    this.disarmTimer();
  }

  private startRun(): Promise<TimestampOutcome> {
    if (this.running !== null) return this.running;
    this.disarmTimer();
    const p = (async (): Promise<TimestampOutcome> => {
      try {
        return await this.run();
      } catch (err) {
        return { status: 'idle', reason: `error-${String(err)}` };
      } finally {
        this.running = null;
      }
    })();
    this.running = p;
    // Re-arm the periodic timer if work remains after the run resolves.
    void p.then((outcome) => {
      if (this.disposed) return;
      if (outcome.status === 'drained' && outcome.pending > 0) this.armTimer();
    });
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
