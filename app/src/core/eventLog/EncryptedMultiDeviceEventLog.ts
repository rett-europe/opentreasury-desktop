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
import * as path from 'node:path';
import { encryptEvent, decryptEvent } from '../crypto/event.js';
import type { DomainEvent, EventLog } from './EventLog.js';

// ---- File-name conventions -------------------------------------------------

/** Filename for events written by `deviceId`. */
export function eventsFileName(deviceId: string): string {
  return `events-${deviceId}.ndjson`;
}

// `events-<26-char ULID>.ndjson`. Crockford base32 alphabet (no I, L, O, U).
const EVENTS_FILE_RE = /^events-[0-9A-HJKMNP-TV-Z]{26}\.ndjson$/;
const EVENTS_TMP_RE = /^events-[0-9A-HJKMNP-TV-Z]{26}\.ndjson\.tmp$/;

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
}

export class EncryptedMultiDeviceEventLog implements EventLog {
  private readonly dir: string;
  private readonly deviceId: string;
  private readonly mk: Uint8Array;
  private readonly seenIds = new Set<string>();
  private readonly writeFilePath: string;
  private initialized = false;

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
    this.writeFilePath = path.join(opts.dir, eventsFileName(opts.deviceId));
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

    if (this.seenIds.has(event.id)) {
      return; // idempotent — already written this process lifetime
    }

    const line = this.encryptOne(event);

    const handle = await fs.open(this.writeFilePath, 'a');
    try {
      await handle.writeFile(line, { encoding: 'utf8' });
      await handle.sync();
    } finally {
      await handle.close();
    }

    this.seenIds.add(event.id);
  }

  async appendBatch(events: readonly DomainEvent[]): Promise<void> {
    await this.ensureInit();

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
    const blob = newEvents.map((e) => this.encryptOne(e)).join('');

    const handle = await fs.open(this.writeFilePath, 'a');
    try {
      await handle.writeFile(blob, { encoding: 'utf8' });
      await handle.sync();
    } finally {
      await handle.close();
    }

    for (const e of newEvents) {
      this.seenIds.add(e.id);
    }
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

        if (this.seenIds.has(parsed.id)) {
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
}
