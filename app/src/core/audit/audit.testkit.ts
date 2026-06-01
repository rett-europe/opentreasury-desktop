// SPEC-028 WI-5 (#362) — TEST-ONLY audit fixtures.
//
// In-memory `FileAuditLog` + a helper to append a real signed `audit.anchor`
// entry, shared by the WI-5 receipt/verify/queue/service tests. Excluded from
// the production build via tsconfig (`**/*.testkit.ts`).

import { FileAuditLog, type AuditBlobStore, type FileAuditLogDeps } from './AuditLog.js';
import { randomBytes } from '../crypto/primitives.js';
import type { AuditEntry, DeviceFrontier } from './types.js';

export const TEST_DATASET = '01HDATASETZZZZZZZZZZZZZZZA';
export const TEST_DEVICE = '01JWDEVCEAAAAAAAAAAAAAAAAA';

export function memStore(): AuditBlobStore {
  const dump = new Map<string, Uint8Array>();
  const store: AuditBlobStore & { dump: Map<string, Uint8Array> } = {
    dump,
    async read(name) {
      return dump.get(name) ?? null;
    },
    async write(name, data) {
      dump.set(name, Uint8Array.from(data));
    },
  };
  return store;
}

export function makeAuditLog(
  store: AuditBlobStore,
  mk: Uint8Array,
  opts: { lockKey?: string } = {},
): FileAuditLog {
  let clock = Date.parse('2026-01-01T00:00:00.000Z');
  const deps: FileAuditLogDeps = {
    store,
    mk,
    datasetId: TEST_DATASET,
    deviceId: TEST_DEVICE,
    actorUserIdentity: 'treasurer@example.org',
    now: () => new Date(clock++),
    ...(opts.lockKey === undefined ? {} : { lockKey: opts.lockKey }),
  };
  return new FileAuditLog(deps);
}

export function makeMk(): Uint8Array {
  return randomBytes(32);
}

let ulidSeq = 0;
export function newTestUlid(): string {
  ulidSeq += 1;
  const body = `01HANCHOR${String(ulidSeq).padStart(4, '0')}`;
  const sanitized = body.toUpperCase().replace(/[^0-9A-HJKMNP-TV-Z]/g, '0');
  return (sanitized + '0'.repeat(26)).slice(0, 26);
}

const SAMPLE_FRONTIER: DeviceFrontier = {
  device_id: TEST_DEVICE,
  file_name: `events-${TEST_DEVICE}.ndjson`,
  line_count: 3,
  last_event_id: '01JEV0000000000000000000AA',
  device_head_hash: 'a'.repeat(64),
};

/** Append a real signed `audit.anchor` entry and return it. */
export async function appendTestAnchor(
  log: FileAuditLog,
  eventLogRoot = 'b'.repeat(64),
  observedAt = '2026-01-01T00:00:00.000Z',
): Promise<AuditEntry> {
  return log.appendAnchor({
    action: 'audit.anchor',
    targetId: newTestUlid(),
    observedAt,
    eventLogRoot,
    deviceFrontiers: [SAMPLE_FRONTIER],
  });
}
