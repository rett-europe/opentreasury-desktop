// SPEC-028 WI-4 (#360) — Audit IPC handler integration test.
//
// Round-trips the three read-only audit handlers over a REAL encrypted audit log
// (in-memory blob store, real MK + Ed25519 signing) plus a seeded event stream:
//   - listSigned       → returns the exported + anchored signed entries.
//   - verifyStatus     → enriches the last-unlock verdict with the anchor's
//                        "anchored through" date for the current device.
//   - listChangeHistory→ projects the seeded events with honest attribution
//                        (real actor for an enveloped event, unknown for a flat
//                        config event), proving no raw envelope crosses IPC.

import { describe, it, expect, beforeEach } from 'vitest';
import { createAuditHandlers } from './audit.js';
import { FileAuditLog, type AuditBlobStore } from '../../../core/audit/AuditLog.js';
import { randomBytes } from '../../../core/crypto/primitives.js';
import type { AuditLog } from '../../../core/audit/types.js';
import type { IntegrityVerdict } from '../../../shared/ipc-contracts/audit-integrity.js';
import {
  auditListChangeHistoryResponseSchema,
  auditListSignedResponseSchema,
  auditVerifyStatusResponseSchema,
} from '../../../shared/ipc-contracts/audit.js';
import type { DomainEvent } from '../../../core/events/schemas.js';
import type { ReadModel } from '../../../core/query/types.js';
import type { ActiveWorkspace } from '../../workspace-session.js';

const DEVICE = '01HZDEVAAAAAAAAAAAAAAAAAAA';
const USER = '01HZUSERAAAAAAAAAAAAAAAAAA';
const ACCT = '01HZACCT1111111111111111AA';
const DATASET = '01HZDATASET00000000000000A';

function memStore(): AuditBlobStore {
  const dump = new Map<string, Uint8Array>();
  return {
    async read(name) {
      return dump.get(name) ?? null;
    },
    async write(name, data) {
      dump.set(name, Uint8Array.from(data));
    },
  };
}

function readModel(): ReadModel {
  return {
    transactions: [],
    configAccounts: [
      {
        id: ACCT,
        name: 'Caja',
        label: 'Caja · BBVA',
        currency: 'EUR',
        openingBalance: 0,
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    configCategories: [],
    configTags: [],
    importMappings: [],
    rowHashes: new Set(),
    notes: new Map(),
    transactionsByReference: new Map(),
    splits: new Map(),
    splitParentIds: new Set(),
  } as unknown as ReadModel;
}

function seededEvents(): DomainEvent[] {
  const txCreated = {
    id: '01HZEVT0000000000000000001',
    type: 'tx.created',
    datasetId: DATASET,
    actorDeviceId: DEVICE,
    actorUserId: USER,
    actorIdentitySource: 'local',
    createdAt: '2026-02-10T10:00:00.000Z',
    dekVersion: 1,
    version: 1,
    payload: { accountId: ACCT },
  };
  const flatConfig = {
    type: 'AccountUpdated',
    id: '01HZEVT0000000000000000002',
    accountId: ACCT,
    changes: { label: 'Renamed' },
    updatedAt: '2026-02-11T09:00:00.000Z',
  };
  return [txCreated, flatConfig] as unknown as DomainEvent[];
}

const verdict: IntegrityVerdict = {
  status: 'ok',
  failClosed: false,
  category: 'ok',
  recovery: 'none',
  devices: [{ deviceId: DEVICE, status: 'ok', notYetAnchored: 0 }],
  summary: { anchoredDeviceCount: 1, notYetAnchoredTotal: 0, newDeviceCount: 0 },
};

let ws: ActiveWorkspace;
let store: AuditBlobStore;

function makeAuditLog(): AuditLog {
  return new FileAuditLog({
    store,
    mk: ws.mk,
    datasetId: DATASET,
    deviceId: ws.deviceId,
    actorUserIdentity: 'local:test',
    now: () => new Date('2026-02-12T00:00:00.000Z'),
  });
}

function handlers() {
  return createAuditHandlers({
    getActiveWorkspace: () => ws,
    getEventLog: () => ({ load: async () => seededEvents() }),
    getReadModel: () => readModel(),
    getDatasetId: () => DATASET,
    getDeviceId: () => DEVICE,
    getLastUnlockVerdict: () => verdict,
    getActorUserIdentity: () => 'local:test',
    createAuditLog: () => makeAuditLog(),
  });
}

beforeEach(async () => {
  store = memStore();
  ws = { folderPath: '/tmp/ws-audit', deviceId: DEVICE, mk: randomBytes(32) } as ActiveWorkspace;

  // Seed a real, signed + encrypted audit chain: an export entry then an anchor.
  const log = makeAuditLog();
  await log.append({
    action: 'export.csv',
    result: 'succeeded',
    targetId: '01HZEXP0000000000000000001',
    afterHash: 'ab'.repeat(32),
  });
  await log.appendAnchor({
    action: 'audit.anchor',
    targetId: '01HZANC0000000000000000001',
    observedAt: '2026-02-11T23:00:00.000Z',
    eventLogRoot: 'cd'.repeat(32),
    deviceFrontiers: [
      {
        device_id: DEVICE,
        file_name: `events-${DEVICE}.ndjson`,
        line_count: 2,
        last_event_id: '01HZEVT0000000000000000002',
        device_head_hash: 'ee'.repeat(32),
      },
    ],
  });
});

describe('audit IPC round-trip over a seeded encrypted workspace', () => {
  it('listSigned returns the export + anchor entries decrypted from the chain', async () => {
    const res = await handlers().listSigned({});
    expect(auditListSignedResponseSchema.strict().parse(res)).toEqual(res);
    expect(res.totalCount).toBe(2);
    const actions = res.entries.map((e) => e.action).sort();
    expect(actions).toEqual(['audit.anchor', 'export.csv']);
    const anchor = res.entries.find((e) => e.action === 'audit.anchor')!;
    expect(anchor.anchoredThrough).toBe('2026-02-11T23:00:00.000Z');
    expect(anchor.deviceCount).toBe(1);
    expect(anchor.timestamp_state).toBe('pending');
  });

  it('verifyStatus enriches the verdict with the anchor frontier date', async () => {
    const res = await handlers().verifyStatus({});
    expect(auditVerifyStatusResponseSchema.strict().parse(res)).toEqual(res);
    expect(res.banner).toBe('verified');
    expect(res.devices).toHaveLength(1);
    expect(res.devices[0].deviceId).toBe(DEVICE);
    expect(res.devices[0].isCurrentDevice).toBe(true);
    expect(res.devices[0].anchoredThrough).toBe('2026-02-11T23:00:00.000Z');
  });

  it('listChangeHistory projects events with honest attribution', async () => {
    const res = await handlers().listChangeHistory({});
    expect(auditListChangeHistoryResponseSchema.strict().parse(res)).toEqual(res);
    expect(res.totalCount).toBe(2);
    const attributed = res.rows.find((r) => r.action === 'tx.created')!;
    const flat = res.rows.find((r) => r.action === 'AccountUpdated')!;
    expect(attributed.actor).toEqual({ kind: 'known', userId: USER });
    expect(attributed.device).toEqual({ kind: 'known', deviceId: DEVICE });
    expect(attributed.accountLabel).toBe('Caja · BBVA');
    expect(flat.actor).toEqual({ kind: 'unknown', reason: 'flat' });
    expect(flat.device).toEqual({ kind: 'unknown' });
  });
});
