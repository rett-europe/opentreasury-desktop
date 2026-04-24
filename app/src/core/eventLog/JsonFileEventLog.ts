// WI-4′ — Local NDJSON implementation of the EventLog interface.
//
// Why NDJSON (newline-delimited JSON), not a JSON array:
//   - Append is a single `write(line + '\n')` call — no read-modify-write,
//     no lock, no array bracket juggling. Crash-safe at the line boundary.
//   - A truncated last line (power loss mid-fsync) is trivially recoverable:
//     parse line-by-line, skip malformed tail, keep everything before it.
//   - Cheap to tail for future replication (M2 OneDrive push will stream
//     from a byte offset).
//
// Idempotency:
//   - Kept in-memory per process lifetime (a Set of event.id values).
//   - On load(), the Set is seeded with every id read back from disk.
//   - Across process restarts the guarantee still holds because append()
//     is only invoked after load() hydration completes (bootstrap contract).
//   - M2 will persist the seen-set alongside the log for crash-recovery
//     idempotency; for M1.5 this is sufficient (single-writer, local-only).
//
// No Electron imports here — the adapter is pure Node so it can be unit
// tested in the `node` vitest environment without spinning up Electron
// (ADR-002 §2.4 — core stays Electron-free; path resolution happens in
// main/bootstrap.ts).

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { DomainEvent, EventLog } from './EventLog';

const EVENTS_FILENAME = 'events.ndjson';

export interface JsonFileEventLogOptions {
  /** Absolute directory path; the log file is `${dir}/events.ndjson`. */
  readonly dir: string;
}

export class JsonFileEventLog implements EventLog {
  private readonly filePath: string;
  private readonly dir: string;
  private readonly seenIds = new Set<string>();
  private initialized = false;

  constructor(options: JsonFileEventLogOptions) {
    this.dir = options.dir;
    this.filePath = path.join(options.dir, EVENTS_FILENAME);
  }

  async append(event: DomainEvent): Promise<void> {
    if (!this.initialized) {
      // Lazy init: append() before load() is legal (empty log case).
      await this.ensureDir();
      this.initialized = true;
    }

    if (this.seenIds.has(event.id)) {
      return; // idempotent — already written this process lifetime
    }

    const line = JSON.stringify(event) + '\n';

    // Open in append mode, write, fsync, close. fsync ensures the byte makes
    // it to disk before we mark the id as seen — on crash, we prefer "not
    // seen" (retry will succeed) over "seen but lost" (silent data loss).
    const handle = await fs.open(this.filePath, 'a');
    try {
      await handle.writeFile(line, { encoding: 'utf8' });
      await handle.sync();
    } finally {
      await handle.close();
    }

    this.seenIds.add(event.id);
  }

  async appendBatch(events: readonly DomainEvent[]): Promise<void> {
    if (!this.initialized) {
      await this.ensureDir();
      this.initialized = true;
    }

    // Filter out already-seen events (idempotent).
    const newEvents = events.filter((e) => !this.seenIds.has(e.id));
    if (newEvents.length === 0) return;

    // Concatenate all lines into a single string so the write + fsync is
    // one atomic OS-level operation. For small payloads (typical bulk-update
    // batch) this guarantees all-or-nothing at the filesystem level.
    const blob = newEvents.map((e) => JSON.stringify(e) + '\n').join('');

    const handle = await fs.open(this.filePath, 'a');
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
    await this.ensureDir();
    this.initialized = true;

    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, 'utf8');
    } catch (err: unknown) {
      if (isNoEnt(err)) return []; // no log yet → empty
      throw err;
    }

    if (raw.length === 0) return [];

    const lines = raw.split('\n');
    const events: DomainEvent[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined || line.length === 0) continue; // trailing newline splits produce an empty tail
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        // Malformed line. If it is the tail (no trailing newline was written
        // before a crash) we silently drop it; for interior lines we still
        // drop + continue because the only alternative — throwing — would
        // brick hydration and leave the app unusable. We surface a warning
        // so operators can investigate the log.
        // eslint-disable-next-line no-console
        console.warn(`[JsonFileEventLog] skipping malformed line ${i + 1} in ${this.filePath}`);
        continue;
      }

      // Minimal shape check — DomainEvent schema validation is deferred to
      // the reducer layer. We only require an `id` string so the idempotency
      // set stays consistent.
      const id = extractId(parsed);
      if (id === null) {
        // eslint-disable-next-line no-console
        console.warn(`[JsonFileEventLog] skipping line ${i + 1}: missing event.id`);
        continue;
      }

      events.push(parsed as DomainEvent);
      this.seenIds.add(id);
    }

    return events;
  }

  /** Exposed for debug/telemetry; not part of the public interface. */
  get absolutePath(): string {
    return this.filePath;
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }
}

function isNoEnt(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'ENOENT'
  );
}

function extractId(parsed: unknown): string | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const maybe = (parsed as { id?: unknown }).id;
  return typeof maybe === 'string' && maybe.length > 0 ? maybe : null;
}
