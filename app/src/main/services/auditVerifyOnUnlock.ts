// SPEC-028 WI-3 (#361) — Chain-verify-on-unlock (main process, fail-closed).
//
// A STANDALONE verification step run at workspace unlock/open, independent of the
// append path (today verification runs only inside `FileAuditLog.append`). It:
//   (i)  verifies the full signed audit chain (seq monotonicity, prev-hash links,
//        key fingerprint, Ed25519 signatures) via WI-2's `verifyChain` in a
//        strictly READ-ONLY mode (never generates a signing key); and
//   (ii) for the LATEST signed `audit.anchor`, recomputes each anchored per-device
//        prefix (truncated to the anchored `line_count`/`last_event_id`) and
//        compares to the signed frontier — reusing WI-2's PURE
//        `verifyAnchorAgainstFiles` (no re-implemented hashing).
//
// The verdict drives fail-closed gating: a genuine tamper/chain-break blocks the
// workspace from opening and routes to recovery (R19). Expected late peer events
// (`notYetAnchored`) and not-yet-synced material (`signing-key-missing`,
// `anchored-file-missing`, `files-unstable`) are classified distinctly so cloud-
// sync lag is messaged as "still syncing — retry," not as corruption.
//
// PII: only ULIDs + counts are logged (never raw values). Raw per-device head
// recompute is over RAW on-disk bytes — no master key is needed for that step.

import { promises as fs } from 'node:fs';
import * as nodePath from 'node:path';
import type { Stats } from 'node:fs';

import { verifyAnchorAgainstFiles } from '../../core/audit/frontier.js';
import type { AnchorVerifyResult, RawDeviceFile } from '../../core/audit/frontier.js';
import type { AuditAnchorPayload, AuditEntry, AuditLog } from '../../core/audit/types.js';
import type {
  IntegrityDevice,
  IntegrityVerdict,
} from '../../shared/ipc-contracts/audit-integrity.js';

export type IntegrityLogger = (
  level: 'info' | 'warn',
  message: string,
  meta?: Record<string, unknown>,
) => void;

export interface VerifyOnUnlockDeps {
  /** The dataset audit log (built against `<workspace>/.treasury/audit`). */
  readonly auditLog: AuditLog;
  /**
   * Read every `events-<deviceId>.ndjson` in the event-log dir as RAW bytes,
   * under a stability check. Returns the files, or `'unstable'` if any file kept
   * changing across retries (cloud sync mid-write) so the caller can classify
   * `files-unstable` rather than a spurious tamper.
   */
  readonly readDeviceFiles: () => Promise<readonly RawDeviceFile[] | 'unstable'>;
  readonly log?: IntegrityLogger;
}

/** Build the redacted view-model for an OK/no-anchor open verdict. */
function openVerdict(
  status: 'ok' | 'no-audit-chain' | 'no-anchor',
  devices: IntegrityDevice[],
  summary: IntegrityVerdict['summary'],
): IntegrityVerdict {
  return { status, failClosed: false, category: 'ok', recovery: 'none', devices, summary };
}

const EMPTY_SUMMARY: IntegrityVerdict['summary'] = {
  anchoredDeviceCount: 0,
  notYetAnchoredTotal: 0,
  newDeviceCount: 0,
};

/** A fail-closed verdict that routes to snapshot recovery (genuine tamper). */
function tamperVerdict(
  status: 'chain-broken' | 'anchor-content-mismatch',
  reason: string | undefined,
  devices: IntegrityDevice[],
  summary: IntegrityVerdict['summary'],
): IntegrityVerdict {
  return {
    status,
    failClosed: true,
    category: 'tamper',
    recovery: 'restore',
    ...(reason !== undefined ? { reason } : {}),
    devices,
    summary,
  };
}

/** A fail-closed verdict that routes to retry/sync (evidence not yet available). */
function unavailableVerdict(
  status:
    | 'signing-key-missing'
    | 'anchored-file-missing'
    | 'anchored-file-truncated'
    | 'files-unstable',
  reason: string | undefined,
  devices: IntegrityDevice[],
  summary: IntegrityVerdict['summary'],
): IntegrityVerdict {
  return {
    status,
    failClosed: true,
    category: 'unavailable',
    recovery: 'retry',
    ...(reason !== undefined ? { reason } : {}),
    devices,
    summary,
  };
}

function isAnchorEntry(entry: AuditEntry): entry is AuditEntry & { payload: AuditAnchorPayload } {
  // WI-3 / WI-5 coexistence — `find(isAnchorEntry)` selects the latest signed
  // FRONTIER anchor (whose payload carries `device_frontiers`). Timestamp
  // receipt entries (`audit.anchor.timestamped`) reference an anchor by seq
  // and do NOT carry frontier data, so they must be excluded here — otherwise
  // `verifyAnchorAgainstFiles` would receive a payload missing `device_frontiers`.
  return entry.action === 'audit.anchor' && entry.payload !== undefined;
}

/** Project WI-2's device results into the redacted renderer view-model. */
function toIntegrityDevices(result: AnchorVerifyResult): IntegrityDevice[] {
  return result.devices.map((d) => ({
    deviceId: d.device_id,
    status: d.status,
    notYetAnchored: d.notYetAnchored,
  }));
}

/**
 * Classify a failed `verifyAnchorAgainstFiles` result. Content mismatches
 * (head/last-event/malformed/root/after-hash) are DEFINITE tamper and take
 * precedence; a missing or short file alone is more likely sync lag (retry).
 */
function classifyAnchorFailure(
  result: AnchorVerifyResult,
  devices: IntegrityDevice[],
  summary: IntegrityVerdict['summary'],
): IntegrityVerdict {
  if (result.reason === 'root-mismatch' || result.reason === 'after-hash-mismatch') {
    return tamperVerdict('anchor-content-mismatch', result.reason, devices, summary);
  }
  const statuses = new Set(result.devices.map((d) => d.status));
  if (
    statuses.has('head-mismatch') ||
    statuses.has('last-event-mismatch') ||
    statuses.has('file-malformed')
  ) {
    return tamperVerdict(
      'anchor-content-mismatch',
      result.reason ?? 'device-failed',
      devices,
      summary,
    );
  }
  if (statuses.has('file-missing')) {
    return unavailableVerdict('anchored-file-missing', result.reason, devices, summary);
  }
  if (statuses.has('truncated')) {
    return unavailableVerdict('anchored-file-truncated', result.reason, devices, summary);
  }
  // Defensive: an unexpected device-failed shape — treat as tamper (fail safe).
  return tamperVerdict(
    'anchor-content-mismatch',
    result.reason ?? 'device-failed',
    devices,
    summary,
  );
}

/**
 * Run the standalone verify-on-unlock check and return a redacted verdict.
 * Never throws: any unexpected error is surfaced as a fail-closed tamper verdict
 * (fail safe — an unverifiable workspace must not open).
 */
export async function verifyOnUnlock(deps: VerifyOnUnlockDeps): Promise<IntegrityVerdict> {
  try {
    // (i) Full audit-chain verification — READ-ONLY (never creates a signing key).
    const chain = await deps.auditLog.verifyChain({ allowKeyCreation: false });
    if (!chain.ok) {
      if (chain.reason === 'signing-key-missing') {
        deps.log?.('warn', 'verify-on-unlock: signing key not present (sync-incomplete)', {});
        return unavailableVerdict('signing-key-missing', chain.reason, [], EMPTY_SUMMARY);
      }
      deps.log?.('warn', 'verify-on-unlock: audit chain did not verify', {
        reason: chain.reason ?? 'unknown',
        ...(chain.atSeq !== undefined ? { atSeq: chain.atSeq } : {}),
      });
      return tamperVerdict('chain-broken', chain.reason, [], EMPTY_SUMMARY);
    }

    // (ii) Recompute the LATEST signed anchor against on-disk per-device prefixes.
    const entries = await deps.auditLog.readAll();
    const anchor = [...entries].reverse().find(isAnchorEntry);
    if (anchor === undefined || anchor.payload === undefined) {
      const status = entries.length === 0 ? 'no-audit-chain' : 'no-anchor';
      return openVerdict(status, [], EMPTY_SUMMARY);
    }

    const files = await deps.readDeviceFiles();
    if (files === 'unstable') {
      deps.log?.('warn', 'verify-on-unlock: event files unstable mid-read (sync in progress)', {});
      return unavailableVerdict('files-unstable', 'files-unstable', [], EMPTY_SUMMARY);
    }

    const result = verifyAnchorAgainstFiles(anchor.payload, files, anchor.after_hash);
    const devices = toIntegrityDevices(result);
    const summary: IntegrityVerdict['summary'] = {
      anchoredDeviceCount: anchor.payload.device_frontiers.length,
      notYetAnchoredTotal: result.devices.reduce((n, d) => n + d.notYetAnchored, 0),
      newDeviceCount: result.newDevices.length,
    };

    if (result.ok) {
      deps.log?.('info', 'verify-on-unlock: ok', {
        anchorSeq: anchor.seq,
        anchoredDevices: summary.anchoredDeviceCount,
        notYetAnchored: summary.notYetAnchoredTotal,
        newDevices: summary.newDeviceCount,
      });
      return openVerdict('ok', devices, summary);
    }

    const verdict = classifyAnchorFailure(result, devices, summary);
    deps.log?.('warn', 'verify-on-unlock: anchor recompute failed (fail-closed)', {
      anchorSeq: anchor.seq,
      status: verdict.status,
      category: verdict.category,
      reason: result.reason ?? 'unknown',
    });
    return verdict;
  } catch (err) {
    // Fail safe: an unverifiable workspace must not open.
    deps.log?.('warn', 'verify-on-unlock: unexpected error (fail-closed)', { error: String(err) });
    return tamperVerdict('chain-broken', 'verify-error', [], EMPTY_SUMMARY);
  }
}

// ── Stable raw device-file reader ───────────────────────────────────────────

/** `events-<26-char ULID>.ndjson`. Crockford base32 (no I, L, O, U). */
const EVENTS_FILE_RE = /^events-[0-9A-HJKMNP-TV-Z]{26}\.ndjson$/;

const DEVICE_READ_RETRIES = 3;

/**
 * Read every canonical `events-<deviceId>.ndjson` in `dir` as RAW bytes under a
 * `stat → read → re-stat` stability check (mirrors WI-2's `readPeerStable`), so
 * a file being written by cloud sync mid-verify does not produce a spurious
 * tamper. Returns the files, or `'unstable'` if any file kept changing across
 * `DEVICE_READ_RETRIES` attempts. Files that disappear mid-read are skipped
 * (the anchor verifier then classifies them `file-missing`).
 */
export async function readStableDeviceFiles(
  dir: string,
): Promise<readonly RawDeviceFile[] | 'unstable'> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const out: RawDeviceFile[] = [];
  for (const fileName of names.filter((n) => EVENTS_FILE_RE.test(n)).sort()) {
    const filePath = nodePath.join(dir, fileName);
    const bytes = await readOneStable(filePath);
    if (bytes === 'unstable') return 'unstable';
    if (bytes === null) continue; // disappeared mid-read → treat as not present
    const deviceId = fileName.slice('events-'.length, -'.ndjson'.length);
    out.push({ deviceId, fileName, bytes });
  }
  return out;
}

async function readOneStable(filePath: string): Promise<Uint8Array | null | 'unstable'> {
  for (let attempt = 0; attempt < DEVICE_READ_RETRIES; attempt++) {
    let before: Stats;
    try {
      before = await fs.stat(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
    let buf: Buffer;
    try {
      buf = await fs.readFile(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
    let after: Stats;
    try {
      after = await fs.stat(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
    if (
      before.size === after.size &&
      before.mtimeMs === after.mtimeMs &&
      buf.length === after.size
    ) {
      return new Uint8Array(buf);
    }
  }
  return 'unstable';
}
