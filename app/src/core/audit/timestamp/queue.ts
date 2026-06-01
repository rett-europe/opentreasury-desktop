// SPEC-028 WI-5 (#362) — advisory pending-anchor queue + retry/backoff state.
//
// The SOURCE OF TRUTH for "which anchors still need a timestamp" is the audit
// chain itself: an anchor is pending iff no `audit.anchor.timestamped` entry
// references it. `findPendingAnchors` re-derives that set from the entries on
// every drain, so a lost/zeroed queue file is harmless and a crash between
// anchoring and timestamping self-heals on the next load.
//
// `TimestampRetryState` is purely advisory in-memory metadata (attempt counts +
// backoff deadlines) so a persistently unreachable TSA is retried with capped
// exponential backoff rather than hammered. It is intentionally NOT persisted:
// pending work is always reconstructable from the chain, and resetting backoff
// across a restart merely means one immediate retry, which is acceptable.

import { canonicalHashHex } from '../../crypto/hash.js';
import type { AuditEntry } from '../types.js';

export interface PendingAnchor {
  readonly anchorSeq: number;
  /** canonicalHashHex of the anchor entry — the receipt's chain-join key. */
  readonly anchorEntryHash: string;
  /** The anchor entry's `after_hash` (== event_log_root). */
  readonly eventLogRoot: string;
  /** The full anchor entry (for imprint recomputation). */
  readonly anchorEntry: AuditEntry;
}

function isAnchor(e: AuditEntry): boolean {
  return e.action === 'audit.anchor' && e.payload !== undefined && 'anchor_version' in e.payload;
}

function isReceipt(e: AuditEntry): boolean {
  return (
    e.action === 'audit.anchor.timestamped' &&
    e.payload !== undefined &&
    'timestamp_version' in e.payload
  );
}

/**
 * Derive the set of anchors that still lack a timestamp receipt. An anchor is
 * covered iff some receipt references its `{ seq, canonicalHashHex }` pair.
 */
export function findPendingAnchors(entries: readonly AuditEntry[]): PendingAnchor[] {
  const covered = new Set<string>();
  for (const e of entries) {
    if (isReceipt(e)) {
      const p = e.payload as { anchor_seq: number; anchor_entry_hash: string };
      covered.add(`${p.anchor_seq}:${p.anchor_entry_hash}`);
    }
  }

  const pending: PendingAnchor[] = [];
  for (const e of entries) {
    if (!isAnchor(e)) continue;
    const hash = canonicalHashHex(e);
    if (covered.has(`${e.seq}:${hash}`)) continue;
    pending.push({
      anchorSeq: e.seq,
      anchorEntryHash: hash,
      eventLogRoot: e.after_hash ?? '',
      anchorEntry: e,
    });
  }
  return pending;
}

export interface BackoffOptions {
  /** First-retry delay. */
  readonly baseMs: number;
  /** Maximum delay (the exponential is capped here). */
  readonly capMs: number;
}

export const DEFAULT_BACKOFF: BackoffOptions = {
  baseMs: 30_000, // 30s
  capMs: 15 * 60_000, // 15m
};

/** Capped exponential backoff: base * 2^(attempts-1), clamped to capMs. */
export function nextBackoffMs(attempts: number, opts: BackoffOptions = DEFAULT_BACKOFF): number {
  if (attempts <= 0) return 0;
  const shift = Math.min(attempts - 1, 30); // guard against overflow
  const raw = opts.baseMs * 2 ** shift;
  return Math.min(opts.capMs, raw);
}

export interface RetryRecord {
  readonly attempts: number;
  readonly lastError: string | undefined;
  readonly lastAttemptAt: number | undefined;
  readonly nextEligibleAt: number | undefined;
}

/**
 * In-memory retry/backoff bookkeeping keyed by anchor seq. Advisory only — see
 * the module header. Drains consult `eligible()` before re-attempting a known
 * failing anchor and `clear()` it on success.
 */
export class TimestampRetryState {
  private readonly meta = new Map<number, RetryRecord>();
  private readonly backoff: BackoffOptions;

  constructor(backoff: BackoffOptions = DEFAULT_BACKOFF) {
    this.backoff = backoff;
  }

  /** True if `seq` has never failed or its backoff window has elapsed. */
  eligible(seq: number, now: number): boolean {
    const r = this.meta.get(seq);
    return r === undefined || r.nextEligibleAt === undefined || now >= r.nextEligibleAt;
  }

  recordFailure(seq: number, error: string, now: number): void {
    const attempts = (this.meta.get(seq)?.attempts ?? 0) + 1;
    this.meta.set(seq, {
      attempts,
      lastError: error,
      lastAttemptAt: now,
      nextEligibleAt: now + nextBackoffMs(attempts, this.backoff),
    });
  }

  clear(seq: number): void {
    this.meta.delete(seq);
  }

  get(seq: number): RetryRecord | undefined {
    return this.meta.get(seq);
  }
}
