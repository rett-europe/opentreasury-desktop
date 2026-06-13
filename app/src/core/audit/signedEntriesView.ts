// SPEC-028 WI-4 (#360) — Signed-entries + verify-status projections (pure).
//
// Two pure, main-process-only projections that turn already-decrypted audit
// material into the renderer-facing view-models:
//
//   - `projectSignedEntries` → the "Registro firmado" lane: every signed,
//     hash-chained `AuditEntry` mapped to a `SignedEntryView` (anchor rows carry
//     their frontier date + device count; every anchor row carries a derived
//     external-timestamp state).
//   - `deriveVerifyStatus` → the integrity banner + per-device "anchored through"
//     chips, derived from the LAST unlock `IntegrityVerdict` (NOT a fresh verify,
//     spec §2 entry #1) enriched with anchor/timestamp facts read from the chain.
//
// No I/O, no clock, no key material — decryption already happened upstream in the
// IPC handler. Unit-tested directly.

import type { AuditAnchorPayload, AuditEntry, AuditTimestampPayload } from './types.js';
import type { IntegrityVerdict } from '../../shared/ipc-contracts/audit-integrity.js';
import type {
  AuditBanner,
  AuditDeviceStatus,
  AuditTimestampState,
  AuditVerifyStatusResponse,
  SignedEntryView,
} from '../../shared/ipc-contracts/audit.js';

function isAnchorPayload(p: AuditEntry['payload']): p is AuditAnchorPayload {
  return p !== undefined && (p as AuditAnchorPayload).anchor_version === 1;
}

function isTimestampPayload(p: AuditEntry['payload']): p is AuditTimestampPayload {
  return p !== undefined && (p as AuditTimestampPayload).timestamp_version === 1;
}

/**
 * Build the set of anchor `seq` values that have a matching external-timestamp
 * receipt (`audit.anchor.timestamped` → `payload.anchor_seq`). Used to mark each
 * anchor `timestamped` vs `pending`.
 */
function timestampedAnchorSeqs(entries: readonly AuditEntry[]): ReadonlySet<number> {
  const seqs = new Set<number>();
  for (const e of entries) {
    if (e.action === 'audit.anchor.timestamped' && isTimestampPayload(e.payload)) {
      seqs.add(e.payload.anchor_seq);
    }
  }
  return seqs;
}

export interface SignedEntriesFilter {
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

export interface SignedEntriesResult {
  readonly entries: readonly SignedEntryView[];
  readonly totalCount: number;
}

/**
 * Project signed audit entries into the "Registro firmado" view-model, newest
 * first. `totalCount` is the count BEFORE the date filter.
 */
export function projectSignedEntries(
  entries: readonly AuditEntry[],
  filter: SignedEntriesFilter = {},
): SignedEntriesResult {
  const timestamped = timestampedAnchorSeqs(entries);

  const all: SignedEntryView[] = entries.map((e) => {
    const anchor = isAnchorPayload(e.payload) ? e.payload : null;
    let timestamp_state: AuditTimestampState = 'none';
    if (e.action === 'audit.anchor') {
      timestamp_state = timestamped.has(e.seq) ? 'timestamped' : 'pending';
    }
    return {
      lane: 'signed' as const,
      seq: e.seq,
      timestamp: e.timestamp,
      action: e.action,
      result: e.result,
      actorDeviceId: e.actor_device_id,
      anchoredThrough: anchor ? anchor.observed_at : null,
      deviceCount: anchor ? anchor.device_frontiers.length : null,
      timestamp_state,
    };
  });

  const totalCount = all.length;

  const filtered = all.filter((row) => {
    const day = row.timestamp.slice(0, 10);
    if (filter.dateFrom !== undefined && day < filter.dateFrom) return false;
    if (filter.dateTo !== undefined && day > filter.dateTo) return false;
    return true;
  });

  filtered.sort((a, b) => b.seq - a.seq);

  return { entries: filtered, totalCount };
}

/**
 * Find, per device, the most recent anchor that sealed it and whether that
 * anchor carries an external timestamp. Returns a map keyed by device id.
 */
function latestAnchorByDevice(
  entries: readonly AuditEntry[],
  timestamped: ReadonlySet<number>,
): Map<string, { observedAt: string; timestamp: AuditTimestampState }> {
  const out = new Map<string, { observedAt: string; timestamp: AuditTimestampState }>();
  for (const e of entries) {
    if (e.action !== 'audit.anchor' || !isAnchorPayload(e.payload)) continue;
    const state: AuditTimestampState = timestamped.has(e.seq) ? 'timestamped' : 'pending';
    for (const f of e.payload.device_frontiers) {
      const prev = out.get(f.device_id);
      // Anchors are appended in order, so a later entry always supersedes.
      if (prev === undefined || e.payload.observed_at >= prev.observedAt) {
        out.set(f.device_id, { observedAt: e.payload.observed_at, timestamp: state });
      }
    }
  }
  return out;
}

/**
 * Map the WI-3 verdict's overall `category`/`failClosed`/`status` and the
 * unsealed-tail count to the SPEC-028 §4.1 banner enum.
 */
function deriveBanner(verdict: IntegrityVerdict | null, unsealedTailCount: number): AuditBanner {
  if (verdict === null) {
    // Defensive: no last-unlock verdict is available (should not happen on the
    // audit screen post-unlock). Surface honestly as informational-unavailable.
    return 'unavailable';
  }
  if (verdict.failClosed) {
    return verdict.category === 'tamper' ? 'integrity-error' : 'unavailable';
  }
  if (verdict.status === 'no-audit-chain' || verdict.status === 'no-anchor') {
    return 'no-anchors';
  }
  return unsealedTailCount > 0 ? 'verified-unsealed-tail' : 'verified';
}

/**
 * Derive the `audit:verifyStatus` view-model from the last-unlock verdict plus a
 * read-only pass over the (already-decrypted) audit entries. Pure: callers do
 * the decryption and pass `entries` in.
 */
export function deriveVerifyStatus(
  verdict: IntegrityVerdict | null,
  entries: readonly AuditEntry[],
  currentDeviceId: string | null,
): AuditVerifyStatusResponse {
  const timestamped = timestampedAnchorSeqs(entries);
  const anchorByDevice = latestAnchorByDevice(entries, timestamped);
  const unsealedTailCount = verdict?.summary.notYetAnchoredTotal ?? 0;

  const devices: AuditDeviceStatus[] = (verdict?.devices ?? []).map((d) => {
    const anchor = anchorByDevice.get(d.deviceId) ?? null;
    return {
      deviceId: d.deviceId,
      isCurrentDevice: currentDeviceId !== null && d.deviceId === currentDeviceId,
      status: d.status,
      anchoredThrough: anchor ? anchor.observedAt : null,
      notYetAnchored: d.notYetAnchored,
      timestamp: anchor ? anchor.timestamp : 'none',
    };
  });

  return {
    banner: deriveBanner(verdict, unsealedTailCount),
    failClosed: verdict?.failClosed ?? false,
    category: verdict?.category ?? 'unavailable',
    recovery: verdict?.recovery ?? 'retry',
    ...(verdict?.reason !== undefined ? { reason: verdict.reason } : {}),
    unsealedTailCount,
    devices,
  };
}
