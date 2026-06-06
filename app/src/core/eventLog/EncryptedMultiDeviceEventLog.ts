// SPEC-026 #309 — Encrypted, per-device, append-only event log.
//
// Implements the same `EventLog` interface as `JsonFileEventLog` so reducers,
// IPC handlers, and the renderer never know encryption exists (per the
// "adapter swap" design decision logged in `.squad/decisions.md`).
//
// File layout (one workspace folder, N devices ≥ 1):
//   <dir>/events-<deviceId>.ndjson     ← this device only ever writes here
//   <dir>/events-<otherDeviceId>.ndjson ← peer device's file, read-only for us
//   <dir>/events.key                    ← multi-wrap key file (see keyFile.ts)
//
// Why per-device files (not a single shared `events.ndjson`):
//   Cloud-sync providers (OneDrive / SharePoint / Dropbox) do not enforce
//   advisory locks; concurrent appends to the same file produce conflict
//   copies (`events (Pedro's Surface conflict).ndjson`). Each device writing
//   to its own file eliminates the conflict surface entirely — the spike in
//   issue #304 validated this for OneDrive specifically.
//
// On-disk line format (per encrypted event):
//   {"id":"<26-char ULID>","c":"<base64(nonce||cipher||tag)>"}\n
//
//   - `id` is in plaintext so the loader can verify the AAD without first
//     decrypting (and so dedup across files is a string compare).
//   - `c` is the result of `encryptEvent(plaintext, mk, eventId)` which binds
//     the ciphertext to `id` via AAD. An attacker who swaps the ciphertext
//     under a given id sees decryption fail at hydrate time.
//
// AAD binding (CRITICAL):
//   The AAD passed to AEAD encrypt is `event.id + ":" + deviceId` (both as
//   UTF-8 bytes). This binds each ciphertext to the event's ULID AND to the
//   specific per-device file it was written to. A ciphertext from
//   `events-{A}.ndjson` cannot be transplanted into `events-{B}.ndjson` and
//   decrypted — a mismatched deviceId causes AEAD verification failure.
//   On the read path, the deviceId is extracted from the filename (e.g.
//   `events-{deviceId}.ndjson`) and passed to `decryptEvent`.
//
// Read path:
//   `load()` globs `events-*.ndjson` in `dir`, parses each line, decrypts via
//   `decryptEvent(line.c, mk, line.id)`, dedupes by id, and merge-sorts by id
//   (ULID is lexicographically time-sortable, so a string sort yields a
//   chronological cross-device timeline). Result is fed to `replayEvents`.
//
// Write path:
//   `append(event)` opens `events-<thisDevice>.ndjson` in append mode, writes
//   one encrypted line, fsyncs, closes. Idempotent by `event.id` (in-memory
//   `seenIds` set, hydrated by `load()` per the same contract as
//   `JsonFileEventLog`).
//
// Atomicity:
//   Per-line writes use `fs.open(...,'a') + writeFile + sync + close` — the
//   POSIX append + fsync sequence is atomic at the line boundary on every
//   sane filesystem. We do NOT use the `tmp → rename` pattern for appends
//   (that pattern is reserved for full-file rewrites such as the v1→v2
//   migration in #308).
//
// Stale `.tmp` cleanup:
//   On `load()` we best-effort delete any `events-*.ndjson.tmp` siblings —
//   these are leftovers from an aborted migration (SPEC-026 §3.3). Failing
//   to delete is logged but never fatal.

import { promises as fs } from 'node:fs';
import type { Stats } from 'node:fs';
import * as path from 'node:path';
import { encryptEvent, decryptEvent } from '../crypto/event.js';
import type { DomainEvent, EventLog } from './EventLog.js';
import {
  computeDeviceFrontier,
  foldHead,
  headSeed,
  splitCompleteLines,
} from '../audit/frontier.js';
import type { DeviceFrontier } from '../audit/types.js';

// ---- File-name conventions -------------------------------------------------

/** Filename for events written by `deviceId`. */
export function eventsFileName(deviceId: string): string {
  return `events-${deviceId}.ndjson`;
}

// `events-<26-char ULID>.ndjson`. Crockford base32 alphabet (no I, L, O, U).
const EVENTS_FILE_RE = /^events-[0-9A-HJKMNP-TV-Z]{26}\.ndjson$/;
const EVENTS_TMP_RE = /^events-[0-9A-HJKMNP-TV-Z]{26}\.ndjson\.tmp$/;
// A file that LOOKS like a per-device events file (starts `events-`, ends
// `.ndjson`) but is not a canonical one — e.g. a cloud-sync conflict copy
// `events-<id> (1).ndjson` or `events-<id> (Pedro's Surface).ndjson`. The
// frontier rests on "one canonical append-only file per device id", so the
// presence of such a file makes a signed snapshot untrustworthy (rubber-duck
// #8). `.ndjson.tmp` leftovers are excluded (handled by EVENTS_TMP_RE).
const EVENTS_CONFLICT_RE = /^events-.*\.ndjson$/;

// ---- Stable error codes ----------------------------------------------------

export const ENCRYPTED_EVENT_AUTH_FAILED = 'ENCRYPTED_EVENT_AUTH_FAILED';

interface CodedError extends Error {
  code: string;
}

function makeAuthError(
  file: string,
  lineNumber: number,
  eventId: string,
  cause: Error,
): CodedError {
  const err: CodedError = Object.assign(
    new Error(
      `[EncryptedMultiDeviceEventLog] AAD or ciphertext verification failed for event id "${eventId}" at line ${lineNumber} of ${file}: ${cause.message}`,
    ),
    { code: ENCRYPTED_EVENT_AUTH_FAILED },
  );
  return err;
}

// ---- On-disk line schema ---------------------------------------------------

interface EncryptedLine {
  id: string;
  c: string;
}

function parseEncryptedLine(raw: string): EncryptedLine | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const id = (parsed as { id?: unknown }).id;
  const c = (parsed as { c?: unknown }).c;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof c !== 'string' || c.length === 0) return null;
  return { id, c };
}

function serializeEncryptedLine(id: string, ciphertextB64: string): string {
  // Note: do NOT use `JSON.stringify({id, c: ciphertextB64})` — that would
  // include the keys in undefined order on some engines. Hand-build to keep
  // a stable byte layout (`id` first, then `c`) which makes diffs in
  // version-controlled fixtures stable.
  return `{"id":${JSON.stringify(id)},"c":${JSON.stringify(ciphertextB64)}}\n`;
}

// ---- Public adapter --------------------------------------------------------

export interface EncryptedMultiDeviceEventLogOptions {
  /** Absolute path to the workspace folder (the one containing `events.key`). */
  readonly dir: string;
  /** This device's ULID. Determines the write target file. */
  readonly deviceId: string;
  /**
   * Unwrapped 256-bit Master Key. The caller (main process bootstrap) is
   * responsible for unwrapping it via safeStorage / recovery and for wiping
   * the buffer on shutdown.
   */
  readonly masterKey: Uint8Array;
  /**
   * SPEC-028 WI-2 — invoked (best-effort, under the write mutex) after a
   * successful LOCAL append/appendBatch, with the number of new events written.
   * Feeds the anchor scheduler's N=1000-local-appends trigger. Never blocks the
   * write; thrown errors are swallowed. Absent in tests ⇒ zero behaviour change.
   */
  readonly onLocalAppend?: (delta: number) => void;
}

/**
 * SPEC-028 WI-2 — result of `snapshotFrontier()`. A STABLE per-device frontier
 * vector ready to sign, or a typed refusal so the anchor service can skip
 * (best-effort) without ever blocking a write.
 */
export type FrontierSnapshotResult =
  | { readonly ok: true; readonly frontiers: readonly DeviceFrontier[] }
  | { readonly ok: false; readonly reason: FrontierSnapshotRefusal };

export type FrontierSnapshotRefusal =
  | 'own-head-untrusted' // own file malformed or has a crash-tail partial
  | 'own-size-mismatch' // own file size on disk ≠ tracked size (external edit)
  | 'peer-unstable' // a peer file kept changing mid-read
  | 'peer-malformed' // a peer file has an interior malformed line
  | 'conflict-copy' // a cloud-sync conflict copy is present
  | 'no-events'; // nothing to anchor yet

interface OwnHeadState {
  lineCount: number;
  /** Running raw 32-byte head (= headSeed when lineCount === 0). */
  head: Uint8Array;
  lastEventId: string | null;
  /** Bytes covered by complete lines (excludes any crash-tail partial). */
  byteLength: number;
}

const PEER_READ_RETRIES = 3;

export class EncryptedMultiDeviceEventLog implements EventLog {
  private readonly dir: string;
  private readonly deviceId: string;
  private readonly mk: Uint8Array;
  private readonly seenIds = new Set<string>();
  private readonly writeFilePath: string;
  private readonly onLocalAppend?: (delta: number) => void;
  private initialized = false;
  /**
   * SPEC-028 — single-writer mutex over the whole local write (seenIds check →
   * encrypt → append/fsync → fold head → seenIds.add → onLocalAppend). Without
   * it, two interleaved appends could fold the in-memory head in a different
   * order than bytes hit disk, producing a signed frontier that won't verify
   * against disk (rubber-duck #3).
   */
  private writeChain: Promise<unknown> = Promise.resolve();
  /** Incrementally-maintained head of THIS device's own append-only file. */
  private ownHead: OwnHeadState | null = null;
  /** True when the own file is malformed or ends in a crash-tail partial. */
  private ownHeadUntrusted = false;

  constructor(opts: EncryptedMultiDeviceEventLogOptions) {
    if (opts.masterKey.length !== 32) {
      throw new Error(
        `[EncryptedMultiDeviceEventLog] Master Key must be 32 bytes, got ${opts.masterKey.length}`,
      );
    }
    if (opts.deviceId.length === 0) {
      throw new Error('[EncryptedMultiDeviceEventLog] deviceId is required');
    }
    if (!EVENTS_FILE_RE.test(eventsFileName(opts.deviceId))) {
      throw new Error(
        `[EncryptedMultiDeviceEventLog] deviceId "${opts.deviceId}" is not a valid 26-char ULID`,
      );
    }
    this.dir = opts.dir;
    this.deviceId = opts.deviceId;
    this.mk = opts.masterKey;
    if (opts.onLocalAppend !== undefined) {
      this.onLocalAppend = opts.onLocalAppend;
    }
    this.writeFilePath = path.join(opts.dir, eventsFileName(opts.deviceId));
  }

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeChain.then(fn, fn);
    this.writeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Exposed for diagnostics; not part of the public interface. */
  get absoluteWritePath(): string {
    return this.writeFilePath;
  }

  /** Exposed for tests; the device-id this instance writes for. */
  get owningDeviceId(): string {
    return this.deviceId;
  }

  async append(event: DomainEvent): Promise<void> {
    await this.ensureInit();

    return this.runExclusive(async () => {
      await this.ensureOwnHead();
      if (this.seenIds.has(event.id)) {
        return; // idempotent — already written this process lifetime
      }

      const line = this.encryptOne(event);
      const lineBytes = Buffer.from(line, 'utf8');

      const handle = await fs.open(this.writeFilePath, 'a');
      try {
        await handle.writeFile(line, { encoding: 'utf8' });
        await handle.sync();
      } finally {
        await handle.close();
      }

      this.foldOwnHead([{ id: event.id, bytes: lineBytes }]);
      this.seenIds.add(event.id);
      this.notifyLocalAppend(1);
    });
  }

  async appendBatch(events: readonly DomainEvent[]): Promise<void> {
    await this.ensureInit();

    return this.runExclusive(async () => {
      await this.ensureOwnHead();
      const newEvents = events.filter((e) => !this.seenIds.has(e.id));
      if (newEvents.length === 0) return;

      // Encrypt every event first so a crypto failure aborts the batch BEFORE
      // any byte hits disk (matches `JsonFileEventLog`'s all-or-nothing
      // semantic).
      //
      // Crash safety (LOW-2): if the process dies mid-write, the last line in
      // the file may be a partial (truncated) JSON object. On the next load()
      // that line is skipped by malformed-line tolerance (parseEncryptedLine
      // returns null). Any fully-written events within the same batch that did
      // make it to disk are re-submitted on the next appendBatch call and are
      // de-duplicated by seenIds (idempotent by event.id). The combination of
      // malformed-line tolerance + idempotency makes partial-crash recovery
      // automatic and transparent to the caller.
      const lines = newEvents.map((e) => this.encryptOne(e));
      const blob = lines.join('');

      const handle = await fs.open(this.writeFilePath, 'a');
      try {
        await handle.writeFile(blob, { encoding: 'utf8' });
        await handle.sync();
      } finally {
        await handle.close();
      }

      this.foldOwnHead(
        newEvents.map((e, i) => ({ id: e.id, bytes: Buffer.from(lines[i]!, 'utf8') })),
      );
      for (const e of newEvents) {
        this.seenIds.add(e.id);
      }
      this.notifyLocalAppend(newEvents.length);
    });
  }

  async load(): Promise<DomainEvent[]> {
    await this.ensureInit();

    let entries: string[];
    try {
      entries = await fs.readdir(this.dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }

    // Best-effort cleanup of aborted-migration tmp files. Never fatal.
    await this.cleanupStaleTmpFiles(entries);

    const eventFiles = entries.filter((f) => EVENTS_FILE_RE.test(f)).sort();
    const events: DomainEvent[] = [];
    // Cross-file dedup is scoped to a single load() call so that an event
    // appended on this instance (which adds its id to `seenIds`) is still
    // returned by a subsequent load(). Otherwise the IPC handlers' guarded
    // projection (`if (after > before) apply(...)`) silently skips writes
    // and the read model goes stale until process restart.
    const loadedIds = new Set<string>();

    for (const fileName of eventFiles) {
      const filePath = path.join(this.dir, fileName);
      let raw: string;
      try {
        raw = await fs.readFile(filePath, 'utf8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw err;
      }
      if (raw.length === 0) continue;

      const lines = raw.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined || line.length === 0) continue;

        const parsed = parseEncryptedLine(line);
        if (parsed === null) {
          // Malformed line tolerance matches `JsonFileEventLog`: a partially
          // written tail line (crash mid-fsync) should not brick hydration.
          // Surface a warning so operators can investigate.
          // eslint-disable-next-line no-console
          console.warn(
            `[EncryptedMultiDeviceEventLog] skipping malformed line ${i + 1} in ${filePath}`,
          );
          continue;
        }

        if (loadedIds.has(parsed.id)) {
          // Cross-file dedup: same event id appearing in two devices' files
          // (which can happen if a recovery flow re-emits the same event)
          // is silently de-duplicated, keeping the first occurrence.
          continue;
        }

        let plaintext: string;
        try {
          // Extract the deviceId from the filename (events-{deviceId}.ndjson)
          // and pass it as part of the AAD. A ciphertext transplanted from a
          // different device's file will fail here (AAD mismatch).
          const fileDeviceId = fileName.slice('events-'.length, -'.ndjson'.length);
          plaintext = decryptEvent(parsed.c, this.mk, parsed.id, fileDeviceId);
        } catch (err) {
          // AEAD failure means tampering, wrong key, or a corrupted line —
          // throw with a stable code so the bootstrap can route the user to
          // the recovery / migration flow rather than silently dropping
          // events (which would corrupt the read model).
          throw makeAuthError(filePath, i + 1, parsed.id, err as Error);
        }

        let event: DomainEvent;
        try {
          event = JSON.parse(plaintext) as DomainEvent;
        } catch (err) {
          // Decryption succeeded but the inner JSON is broken — this is a
          // build-time bug (something wrote non-JSON plaintext) and we
          // should fail loudly.
          throw new Error(
            `[EncryptedMultiDeviceEventLog] decrypted event "${parsed.id}" at line ${i + 1} of ${filePath} is not valid JSON: ${(err as Error).message}`,
          );
        }

        if (typeof event !== 'object' || event === null || event.id !== parsed.id) {
          throw new Error(
            `[EncryptedMultiDeviceEventLog] decrypted event at line ${i + 1} of ${filePath} has id "${(event as { id?: unknown })?.id ?? '<missing>'}" but the line header claims "${parsed.id}"`,
          );
        }

        events.push(event);
        this.seenIds.add(parsed.id);
        loadedIds.add(parsed.id);
      }
    }

    // ULIDs sort lexicographically by their timestamp prefix (48 bits of ms),
    // so a plain string sort yields a chronological cross-device timeline.
    events.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    return events;
  }

  // ---- Internals -----------------------------------------------------------

  private async ensureInit(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(this.dir, { recursive: true });
    this.initialized = true;
  }

  private encryptOne(event: DomainEvent): string {
    const ciphertextB64 = encryptEvent(JSON.stringify(event), this.mk, event.id, this.deviceId);
    return serializeEncryptedLine(event.id, ciphertextB64);
  }

  private async cleanupStaleTmpFiles(entries: string[]): Promise<void> {
    for (const f of entries) {
      if (!EVENTS_TMP_RE.test(f)) continue;
      try {
        await fs.unlink(path.join(this.dir, f));
      } catch (err) {
        // ENOENT is expected: another process or a concurrent load() may have
        // removed the file between the readdir() and our unlink(). Silently
        // ignore it (LOW-1: narrow TOCTOU window, already mitigated by error
        // swallowing). Surface other errors as warnings so operators can act.
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
        // eslint-disable-next-line no-console
        console.warn(
          `[EncryptedMultiDeviceEventLog] could not remove stale tmp file ${f}: ${(err as Error).message}`,
        );
      }
    }
  }

  // ---- SPEC-028 WI-2: per-device frontier head -----------------------------

  /**
   * Lazily initialise the in-memory running head of THIS device's own
   * append-only file by reading its raw bytes once. Must be called inside the
   * write mutex so no append interleaves between the read and a subsequent
   * fold. A malformed interior line or a crash-tail partial marks the head
   * untrusted: `splitCompleteLines` would diverge from `load()`'s tolerant
   * skip, so we refuse to anchor rather than sign a head that won't verify.
   */
  private async ensureOwnHead(): Promise<void> {
    if (this.ownHead !== null) return;
    let buf: Buffer;
    try {
      buf = await fs.readFile(this.writeFilePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.ownHead = {
          lineCount: 0,
          head: headSeed(this.deviceId),
          lastEventId: null,
          byteLength: 0,
        };
        this.ownHeadUntrusted = false;
        return;
      }
      throw err;
    }

    const split = splitCompleteLines(buf);
    this.ownHeadUntrusted = split.malformed || split.hasTrailingPartial;

    let h = headSeed(this.deviceId);
    for (const l of split.lines) {
      h = foldHead(h, l.bytes);
    }
    this.ownHead = {
      lineCount: split.lines.length,
      head: h,
      lastEventId: split.lines.length > 0 ? split.lines[split.lines.length - 1]!.id : null,
      byteLength: split.completeByteLength,
    };
  }

  /**
   * Extend the in-memory own head by the exact line bytes just fsync'd. Called
   * only inside the write mutex, after a successful append, so the head stays
   * byte-identical to disk (incremental ≡ batch — AC8). No-op if the head was
   * never initialised or is untrusted.
   */
  private foldOwnHead(lines: readonly { id: string; bytes: Uint8Array }[]): void {
    if (this.ownHead === null || this.ownHeadUntrusted || lines.length === 0) return;
    let h = this.ownHead.head;
    let bytes = this.ownHead.byteLength;
    for (const l of lines) {
      h = foldHead(h, l.bytes);
      bytes += l.bytes.length;
    }
    this.ownHead = {
      lineCount: this.ownHead.lineCount + lines.length,
      head: h,
      lastEventId: lines[lines.length - 1]!.id,
      byteLength: bytes,
    };
  }

  /** Feed the anchor scheduler's local-append counter; never breaks a write. */
  private notifyLocalAppend(delta: number): void {
    if (this.onLocalAppend === undefined || delta <= 0) return;
    try {
      this.onLocalAppend(delta);
    } catch {
      // Best-effort: anchoring must NEVER block or fail a data write.
    }
  }

  /**
   * SPEC-028 WI-2 / FR7 — compute a STABLE per-device frontier vector ready to
   * be folded into a signed `audit.anchor` entry, or a typed refusal so the
   * anchor service can skip (best-effort) without blocking writes.
   *
   * Own device: served from the incrementally-maintained in-memory head (avoids
   * re-reading a 100k-line file every anchor — AC8 perf) but only after a
   * `stat()` confirms the on-disk size still matches the tracked size, guarding
   * against external edits/divergence (rubber-duck #6). Peer devices: read from
   * disk under a stat→read→re-stat stability check so a file changing mid-read
   * never yields a signed-but-unverifiable anchor (rubber-duck #3 analogue).
   *
   * NORMATIVE (AC18): an anchored event file MUST NOT be rewritten in place.
   * `device_head_hash` is taken over the raw on-disk bytes; mutating a file
   * already covered by a signed anchor would make that anchor fail to verify.
   * Migrations MUST write a new per-device file and re-anchor — never mutate.
   */
  async snapshotFrontier(): Promise<FrontierSnapshotResult> {
    await this.ensureInit();

    // Own frontier is captured inside the write mutex so the size check and the
    // in-memory head reflect the same point in time (no append interleaves).
    const own = await this.runExclusive(
      async (): Promise<
        | { kind: 'untrusted' }
        | { kind: 'size-mismatch' }
        | { kind: 'ok'; frontier: DeviceFrontier | null }
      > => {
        await this.ensureOwnHead();
        if (this.ownHeadUntrusted) return { kind: 'untrusted' };
        const head = this.ownHead!;
        let size = 0;
        try {
          size = (await fs.stat(this.writeFilePath)).size;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        }
        if (size !== head.byteLength) return { kind: 'size-mismatch' };
        const frontier: DeviceFrontier | null =
          head.lineCount > 0
            ? {
                device_id: this.deviceId,
                file_name: eventsFileName(this.deviceId),
                line_count: head.lineCount,
                last_event_id: head.lastEventId!,
                device_head_hash: Buffer.from(head.head).toString('hex'),
              }
            : null;
        return { kind: 'ok', frontier };
      },
    );

    if (own.kind === 'untrusted') return { ok: false, reason: 'own-head-untrusted' };
    if (own.kind === 'size-mismatch') return { ok: false, reason: 'own-size-mismatch' };

    let entries: string[];
    try {
      entries = await fs.readdir(this.dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') entries = [];
      else throw err;
    }

    // Conflict-copy guard (rubber-duck #8): a cloud-sync conflict copy
    // (`events-<id> (1).ndjson`) maps a second file to a device id and breaks
    // the "one canonical append-only file per device" invariant. Refuse to
    // sign rather than anchor an ambiguous frontier. `.ndjson.tmp` leftovers
    // are excluded.
    for (const f of entries) {
      if (EVENTS_TMP_RE.test(f)) continue;
      if (EVENTS_CONFLICT_RE.test(f) && !EVENTS_FILE_RE.test(f)) {
        return { ok: false, reason: 'conflict-copy' };
      }
    }

    const frontiers: DeviceFrontier[] = [];
    if (own.frontier !== null) frontiers.push(own.frontier);

    const ownFileName = eventsFileName(this.deviceId);
    const peerFiles = entries.filter((f) => EVENTS_FILE_RE.test(f) && f !== ownFileName).sort();
    for (const fileName of peerFiles) {
      const peerDeviceId = fileName.slice('events-'.length, -'.ndjson'.length);
      const stable = await this.readPeerStable(fileName);
      if (stable === 'unstable') return { ok: false, reason: 'peer-unstable' };
      if (stable === null) continue; // disappeared mid-read; treat as not present
      const result = computeDeviceFrontier({ deviceId: peerDeviceId, fileName, bytes: stable });
      if (!result.ok) {
        if (result.error === 'empty') continue; // empty peer file → nothing to anchor
        return { ok: false, reason: 'peer-malformed' };
      }
      frontiers.push(result.frontier!);
    }

    if (frontiers.length === 0) return { ok: false, reason: 'no-events' };
    return { ok: true, frontiers };
  }

  /**
   * Read a peer file under a stat→read→re-stat stability check. Returns the
   * bytes once two consecutive stats agree (size + mtime) and the read length
   * matches, `null` if the file disappeared, or `'unstable'` if it kept
   * changing across all retries (so the caller refuses to sign).
   */
  private async readPeerStable(fileName: string): Promise<Uint8Array | null | 'unstable'> {
    const filePath = path.join(this.dir, fileName);
    for (let attempt = 0; attempt < PEER_READ_RETRIES; attempt++) {
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
        return buf;
      }
    }
    return 'unstable';
  }
}
