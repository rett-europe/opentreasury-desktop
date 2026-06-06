// SPEC-028 WI-2 (#358) — Pure frontier primitives for event-log anchoring.
//
// These functions are the cryptographic core behind the `audit.anchor` entry
// (see `types.ts` / crypto-spec §8.2). They are PURE: no Electron, no fs, no
// clock — they operate over raw on-disk NDJSON line bytes handed in by the
// caller. This keeps them exhaustively unit-testable and lets the same code
// run on both the compute path (build a frontier to sign) and the verify path
// (recompute a frontier from disk and compare).
//
// Design (matches spec §6.1):
//   - The merged ULID timeline across devices is NOT append-only (a late peer
//     event inserts mid-stream). But each device's own `events-<id>.ndjson`
//     file IS append-only, so we anchor a PER-DEVICE FRONTIER VECTOR plus a
//     global `event_log_root`.
//   - `device_head_hash` is a domain-separated CHAINED BLAKE2b-256 fold over
//     the RAW bytes of each complete (newline-terminated) line, including the
//     trailing `\n`:
//         h0  = BLAKE2b("OTRV-EVTLOG-DEVHEAD:v1:" + deviceId)
//         h_i = BLAKE2b(h_{i-1} ‖ rawLineBytes_i)
//     The chain is used for BOTH incremental head maintenance (extend by one
//     line) AND prefix-truncated verification, so incremental ≡ batch by
//     construction (AC8).
//   - Because the head is over RAW bytes, an anchored event file MUST NOT be
//     rewritten in place — re-anchor instead (crypto-spec §8.2 migration rule).

import { blake2b256, blake2b256HexUtf8, canonicalJson } from '../crypto/hash.js';
import type { DeviceFrontier } from './types.js';

const DEVHEAD_PREFIX = 'OTRV-EVTLOG-DEVHEAD:v1:';
const ROOT_PREFIX = 'OTRV-EVTLOG-ROOT:v1:';

const NL = 0x0a; // '\n'

/** A device's raw on-disk file, as read by the caller (own or peer). */
export interface RawDeviceFile {
  readonly deviceId: string;
  readonly fileName: string;
  /** Raw file bytes, exactly as on disk. */
  readonly bytes: Uint8Array;
}

/** A single complete (newline-terminated) line carved out of a file. */
export interface CompleteLine {
  /** Parsed `id` from the `{ "id":..., "c":... }` line. */
  readonly id: string;
  /** Raw line bytes INCLUDING the trailing `\n`. */
  readonly bytes: Uint8Array;
}

export interface SplitLinesResult {
  readonly lines: readonly CompleteLine[];
  /** Total byte length covered by the complete lines (excludes any tail). */
  readonly completeByteLength: number;
  /**
   * True when the buffer ends with an un-terminated tail (a crash mid-fsync).
   * The tail is excluded from `lines` and is NOT treated as malformed.
   */
  readonly hasTrailingPartial: boolean;
  /**
   * True when a COMPLETE line failed `{ id:string, c:string }` validation.
   * Anchoring refuses to sign a file with interior garbage (rubber-duck #4):
   * `load()` silently skips such lines, so we must never fold them into a
   * signed head where their bytes would silently diverge from the model.
   */
  readonly malformed: boolean;
  /** 1-based line number of the first malformed complete line, if any. */
  readonly malformedLineNumber?: number;
}

/** The domain-separated seed `h0` for a device's head chain. */
export function headSeed(deviceId: string): Uint8Array {
  return blake2b256(Buffer.from(DEVHEAD_PREFIX + deviceId, 'utf8'));
}

/** Extend a running head by one raw line: `h_i = BLAKE2b(h_{i-1} ‖ line)`. */
export function foldHead(prev: Uint8Array, lineBytes: Uint8Array): Uint8Array {
  return blake2b256(Buffer.concat([Buffer.from(prev), Buffer.from(lineBytes)]));
}

/**
 * Validate a single raw line as `{ id:string, c:string }` and return its `id`,
 * or null if malformed. Mirrors `parseEncryptedLine` in the event log so the
 * anchor's notion of a valid line matches the loader's exactly.
 */
function parseLineId(lineBytesWithoutNl: Uint8Array): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(lineBytesWithoutNl).toString('utf8'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const id = (parsed as { id?: unknown }).id;
  const c = (parsed as { c?: unknown }).c;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof c !== 'string' || c.length === 0) return null;
  return id;
}

/**
 * Carve a file buffer into complete (newline-terminated) lines. A trailing
 * un-terminated segment is reported via `hasTrailingPartial` and excluded.
 * Every complete line is validated as `{ id, c }`; the first malformed one
 * sets `malformed` and stops further line collection (callers refuse to sign).
 */
export function splitCompleteLines(bytes: Uint8Array): SplitLinesResult {
  const lines: CompleteLine[] = [];
  let completeByteLength = 0;
  let start = 0;
  let lineNo = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== NL) continue;
    lineNo++;
    const withNl = bytes.subarray(start, i + 1);
    const withoutNl = bytes.subarray(start, i);
    const id = parseLineId(withoutNl);
    if (id === null) {
      return {
        lines,
        completeByteLength,
        hasTrailingPartial: false,
        malformed: true,
        malformedLineNumber: lineNo,
      };
    }
    lines.push({ id, bytes: withNl });
    completeByteLength = i + 1;
    start = i + 1;
  }
  return {
    lines,
    completeByteLength,
    hasTrailingPartial: start < bytes.length,
    malformed: false,
  };
}

/** Fold a sequence of complete-line byte buffers into a head hash (hex). */
export function foldDeviceHead(deviceId: string, lineBuffers: readonly Uint8Array[]): string {
  let h = headSeed(deviceId);
  for (const buf of lineBuffers) {
    h = foldHead(h, buf);
  }
  return Buffer.from(h).toString('hex');
}

export type ComputeFrontierError = 'malformed' | 'empty';

export interface ComputeFrontierResult {
  readonly ok: boolean;
  readonly frontier?: DeviceFrontier;
  readonly error?: ComputeFrontierError;
  readonly malformedLineNumber?: number;
}

/**
 * Compute a device frontier from a full raw file buffer (the from-scratch path
 * used for peer files and for verification). Returns an error for malformed or
 * empty files so the caller can refuse to sign / classify a tamper.
 */
export function computeDeviceFrontier(file: RawDeviceFile): ComputeFrontierResult {
  const split = splitCompleteLines(file.bytes);
  if (split.malformed) {
    return split.malformedLineNumber === undefined
      ? { ok: false, error: 'malformed' }
      : { ok: false, error: 'malformed', malformedLineNumber: split.malformedLineNumber };
  }
  if (split.lines.length === 0) {
    return { ok: false, error: 'empty' };
  }
  const head = foldDeviceHead(
    file.deviceId,
    split.lines.map((l) => l.bytes),
  );
  const last = split.lines[split.lines.length - 1]!;
  return {
    ok: true,
    frontier: {
      device_id: file.deviceId,
      file_name: file.fileName,
      line_count: split.lines.length,
      last_event_id: last.id,
      device_head_hash: head,
    },
  };
}

/**
 * `event_log_root` = domain-separated BLAKE2b-256 over the canonical-JSON of
 * the frontiers sorted by `device_id`. Order-independent: the same set of
 * frontiers yields the same root regardless of read order.
 */
export function computeEventLogRoot(frontiers: readonly DeviceFrontier[]): string {
  const sorted = [...frontiers].sort((a, b) =>
    a.device_id < b.device_id ? -1 : a.device_id > b.device_id ? 1 : 0,
  );
  const canonical = sorted.map((f) => ({
    device_id: f.device_id,
    file_name: f.file_name,
    line_count: f.line_count,
    last_event_id: f.last_event_id,
    device_head_hash: f.device_head_hash,
  }));
  return blake2b256HexUtf8(ROOT_PREFIX + canonicalJson(canonical));
}

// ---- Verification path -----------------------------------------------------

export type DeviceVerifyStatus =
  | 'ok'
  | 'file-missing'
  | 'file-malformed'
  | 'truncated'
  | 'last-event-mismatch'
  | 'head-mismatch';

export interface DeviceVerifyResult {
  readonly device_id: string;
  readonly status: DeviceVerifyStatus;
  /**
   * Count of complete lines on disk BEYOND `line_count` — late/peer events
   * appended after the anchor was taken. This is expected (FR9/AC6) and is NOT
   * a tamper signal.
   */
  readonly notYetAnchored: number;
}

export interface AnchorVerifyResult {
  readonly ok: boolean;
  readonly reason?: 'root-mismatch' | 'after-hash-mismatch' | 'device-failed';
  readonly devices: readonly DeviceVerifyResult[];
  /** Device files on disk that are absent from the anchor (enrolled since). */
  readonly newDevices: readonly string[];
}

/**
 * Recompute the anchored frontier from the current on-disk files and compare
 * against a signed payload. This is the verifier function behind FR8/AC4–AC6.
 *
 * Semantics per device:
 *   - file missing                       → fail (file-missing)
 *   - a complete line is malformed       → fail (file-malformed)
 *   - fewer complete lines than anchored → fail (truncated)
 *   - id at line_count-1 ≠ last_event_id → fail (last-event-mismatch)
 *   - recomputed head ≠ device_head_hash → fail (head-mismatch)
 *   - extra lines after the prefix       → ok, reported as `notYetAnchored`
 *
 * Also re-derives `event_log_root` from the payload's frontiers and requires
 * `computedRoot === payload.event_log_root === expectedAfterHash`.
 */
export function verifyAnchorAgainstFiles(
  payload: {
    readonly event_log_root: string;
    readonly device_frontiers: readonly DeviceFrontier[];
  },
  files: readonly RawDeviceFile[],
  expectedAfterHash: string | null,
): AnchorVerifyResult {
  const byDevice = new Map<string, RawDeviceFile>();
  for (const f of files) byDevice.set(f.deviceId, f);

  const devices: DeviceVerifyResult[] = [];
  let anyDeviceFailed = false;

  for (const fr of payload.device_frontiers) {
    const file = byDevice.get(fr.device_id);
    if (file === undefined) {
      devices.push({ device_id: fr.device_id, status: 'file-missing', notYetAnchored: 0 });
      anyDeviceFailed = true;
      continue;
    }
    const split = splitCompleteLines(file.bytes);
    if (split.malformed) {
      devices.push({ device_id: fr.device_id, status: 'file-malformed', notYetAnchored: 0 });
      anyDeviceFailed = true;
      continue;
    }
    if (split.lines.length < fr.line_count) {
      devices.push({ device_id: fr.device_id, status: 'truncated', notYetAnchored: 0 });
      anyDeviceFailed = true;
      continue;
    }
    const prefix = split.lines.slice(0, fr.line_count);
    const lastAnchored = prefix[fr.line_count - 1];
    if (lastAnchored === undefined || lastAnchored.id !== fr.last_event_id) {
      devices.push({ device_id: fr.device_id, status: 'last-event-mismatch', notYetAnchored: 0 });
      anyDeviceFailed = true;
      continue;
    }
    const head = foldDeviceHead(
      fr.device_id,
      prefix.map((l) => l.bytes),
    );
    if (head !== fr.device_head_hash) {
      devices.push({ device_id: fr.device_id, status: 'head-mismatch', notYetAnchored: 0 });
      anyDeviceFailed = true;
      continue;
    }
    devices.push({
      device_id: fr.device_id,
      status: 'ok',
      notYetAnchored: split.lines.length - fr.line_count,
    });
  }

  const anchoredIds = new Set(payload.device_frontiers.map((f) => f.device_id));
  const newDevices = files.map((f) => f.deviceId).filter((d) => !anchoredIds.has(d));

  const computedRoot = computeEventLogRoot(payload.device_frontiers);
  if (computedRoot !== payload.event_log_root) {
    return { ok: false, reason: 'root-mismatch', devices, newDevices };
  }
  if (expectedAfterHash !== null && payload.event_log_root !== expectedAfterHash) {
    return { ok: false, reason: 'after-hash-mismatch', devices, newDevices };
  }
  if (anyDeviceFailed) {
    return { ok: false, reason: 'device-failed', devices, newDevices };
  }
  return { ok: true, devices, newDevices };
}

export { DEVHEAD_PREFIX, ROOT_PREFIX };
