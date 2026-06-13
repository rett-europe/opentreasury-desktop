// SPEC-028 WI-4 (#360) — Audit IPC handler unit tests.
//
// Inject fake deps (no Electron, no fs). Asserts the three read-only handlers
// validate their request, surface the LAST unlock verdict (never re-verify),
// project the two lanes, and emit only view-model fields (AC10).

import { describe, expect, it, vi } from 'vitest';
import { createAuditHandlers, type AuditHandlerDeps } from './audit.js';
import type { AuditEntry, AuditLog } from '../../../core/audit/types.js';
import type { IntegrityVerdict } from '../../../shared/ipc-contracts/audit-integrity.js';
import {
  auditListChangeHistoryResponseSchema,
  auditListSignedResponseSchema,
  auditVerifyStatusResponseSchema,
} from '../../../shared/ipc-contracts/audit.js';
import type { DomainEvent } from '../../../core/events/schemas.js';
import type { ReadModel } from '../../../core/query/types.js';
import type { ActiveWorkspace } from '../../workspace-session.js';

const DEV = '01HZDEVAAAAAAAAAAAAAAAAAAA';
const USER = '01HZUSERAAAAAAAAAAAAAAAAAA';
const ACCT = '01HZACCT1111111111111111AA';
const DATASET = '01HZDATASET00000000000000A';

const sig = {
  alg: 'ed25519' as const,
  signing_device_id: DEV,
  key_fingerprint: 'ff'.repeat(32),
  value: 'AA==',
};

function exportEntry(seq: number): AuditEntry {
  return {
    seq,
    timestamp: '2026-02-10T10:00:00.000Z',
    dataset_id: DATASET,
    actor_device_id: DEV,
    actor_user_identity: 'local:test',
    action: 'export.csv',
    result: 'succeeded',
    target_ref: { type: 'export', id: '01HZEXP0000000000000000001' },
    before_hash: null,
    after_hash: 'ab'.repeat(32),
    prev_entry_hash: null,
    signature: sig,
  };
}

function fakeAuditLog(entries: AuditEntry[]): AuditLog {
  return {
    append: vi.fn(),
    appendAnchor: vi.fn(),
    appendTimestamp: vi.fn(),
    verifyChain: vi.fn(),
    readAll: async () => entries,
  } as unknown as AuditLog;
}

function txEvent(): DomainEvent {
  return {
    id: '01HZEVT0000000000000000001',
    type: 'tx.created',
    datasetId: DATASET,
    actorDeviceId: DEV,
    actorUserId: USER,
    actorIdentitySource: 'local',
    createdAt: '2026-02-10T10:00:00.000Z',
    dekVersion: 1,
    version: 1,
    payload: { accountId: ACCT },
  } as unknown as DomainEvent;
}

const readModel = {
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

const verdict: IntegrityVerdict = {
  status: 'ok',
  failClosed: false,
  category: 'ok',
  recovery: 'none',
  devices: [{ deviceId: DEV, status: 'ok', notYetAnchored: 0 }],
  summary: { anchoredDeviceCount: 1, notYetAnchoredTotal: 0, newDeviceCount: 0 },
};

const ws: ActiveWorkspace = {
  folderPath: '/tmp/ws',
  deviceId: DEV,
  mk: new Uint8Array(32),
} as ActiveWorkspace;

function makeDeps(over: Partial<AuditHandlerDeps> = {}): AuditHandlerDeps {
  return {
    getActiveWorkspace: () => ws,
    getEventLog: () => ({ load: async () => [txEvent()] }),
    getReadModel: () => readModel,
    getDatasetId: () => DATASET,
    getDeviceId: () => DEV,
    getLastUnlockVerdict: () => verdict,
    getActorUserIdentity: () => 'local:test',
    createAuditLog: () => fakeAuditLog([exportEntry(1)]),
    ...over,
  };
}

describe('createAuditHandlers — verifyStatus', () => {
  it('surfaces the LAST unlock verdict without re-verifying', async () => {
    const verifyChain = vi.fn();
    const handlers = createAuditHandlers(
      makeDeps({ createAuditLog: () => ({ ...fakeAuditLog([]), verifyChain }) as AuditLog }),
    );
    const res = await handlers.verifyStatus({});
    expect(auditVerifyStatusResponseSchema.strict().parse(res)).toEqual(res);
    expect(res.banner).toBe('verified');
    expect(res.devices[0].isCurrentDevice).toBe(true);
    expect(verifyChain).not.toHaveBeenCalled();
  });

  it('returns a non-blocking unavailable banner when no workspace is unlocked', async () => {
    const handlers = createAuditHandlers(
      makeDeps({ getActiveWorkspace: () => null, getLastUnlockVerdict: () => null }),
    );
    const res = await handlers.verifyStatus({});
    expect(res.banner).toBe('unavailable');
    expect(res.failClosed).toBe(false);
    expect(res.devices).toEqual([]);
  });

  it('rejects a malformed request', async () => {
    const handlers = createAuditHandlers(makeDeps());
    await expect(handlers.verifyStatus({ unexpected: true })).rejects.toThrow();
  });
});

describe('createAuditHandlers — listSigned', () => {
  it('projects signed entries and validates the view-model', async () => {
    const handlers = createAuditHandlers(makeDeps());
    const res = await handlers.listSigned({});
    expect(auditListSignedResponseSchema.strict().parse(res)).toEqual(res);
    expect(res.totalCount).toBe(1);
    expect(res.entries[0].action).toBe('export.csv');
    expect(res.entries[0].lane).toBe('signed');
  });

  it('returns empty when no workspace is unlocked', async () => {
    const handlers = createAuditHandlers(makeDeps({ getActiveWorkspace: () => null }));
    const res = await handlers.listSigned({});
    expect(res).toEqual({ entries: [], totalCount: 0 });
  });
});

describe('createAuditHandlers — listChangeHistory', () => {
  it('projects change history with resolved account labels (AC10 strict)', async () => {
    const handlers = createAuditHandlers(makeDeps());
    const res = await handlers.listChangeHistory({});
    expect(auditListChangeHistoryResponseSchema.strict().parse(res)).toEqual(res);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].accountLabel).toBe('Caja · BBVA');
    expect(res.rows[0].actor).toEqual({ kind: 'known', userId: USER });
    // AC10: no raw envelope fields leak.
    expect(Object.keys(res.rows[0])).not.toContain('payload');
  });

  it('passes through filters to the projection', async () => {
    const handlers = createAuditHandlers(makeDeps());
    const res = await handlers.listChangeHistory({ dateFrom: '2027-01-01' });
    expect(res.totalCount).toBe(1);
    expect(res.rows).toHaveLength(0);
  });
});
