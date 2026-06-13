// SPEC-028 WI-4 (#360) — change-history projection tests.

import { describe, expect, it } from 'vitest';
import { projectChangeHistory } from './changeHistory.js';
import type { ChangeHistoryRow } from '../../shared/ipc-contracts/audit.js';
import { changeHistoryRowSchema } from '../../shared/ipc-contracts/audit.js';
import type { DomainEvent } from '../events/schemas.js';

const DEV_A = '01HZDEVAAAAAAAAAAAAAAAAAAA';
const _DEV_B = '01HZDEVBBBBBBBBBBBBBBBBBBB';
const USER_A = '01HZUSERAAAAAAAAAAAAAAAAAA';
const ACCT_1 = '01HZACCT1111111111111111AA';
const ACCT_2 = '01HZACCT2222222222222222BB';

function txCreated(over: Partial<Record<string, unknown>> = {}): DomainEvent {
  return {
    id: (over.id as string) ?? '01HZEVT0000000000000000001',
    type: 'tx.created',
    datasetId: '01HZDATASET00000000000000A',
    actorDeviceId: DEV_A,
    actorUserId: USER_A,
    actorIdentitySource: 'local',
    createdAt: (over.createdAt as string) ?? '2026-02-10T10:00:00.000Z',
    dekVersion: 1,
    version: 1,
    payload: { accountId: ACCT_1, ...((over.payload as object) ?? {}) },
    ...over,
  } as unknown as DomainEvent;
}

// A flat WI-21 config event (no actor/device on the wire).
function accountUpdated(over: Partial<Record<string, unknown>> = {}): DomainEvent {
  return {
    type: 'AccountUpdated',
    id: (over.id as string) ?? '01HZEVT0000000000000000002',
    accountId: ACCT_2,
    changes: { label: 'Renamed' },
    updatedAt: (over.updatedAt as string) ?? '2026-02-11T09:00:00.000Z',
    ...over,
  } as unknown as DomainEvent;
}

describe('projectChangeHistory — attribution honesty (§3.4)', () => {
  it('attributes an enveloped tx.created event to its real actor + device', () => {
    const { rows } = projectChangeHistory([txCreated()]);
    expect(rows).toHaveLength(1);
    expect(rows[0].actor).toEqual({ kind: 'known', userId: USER_A });
    expect(rows[0].device).toEqual({ kind: 'known', deviceId: DEV_A });
    expect(rows[0].accountId).toBe(ACCT_1);
    expect(rows[0].action).toBe('tx.created');
    expect(rows[0].lane).toBe('history');
  });

  it('renders a flat config event with unknown(flat) actor AND device', () => {
    const { rows } = projectChangeHistory([accountUpdated()]);
    expect(rows[0].actor).toEqual({ kind: 'unknown', reason: 'flat' });
    expect(rows[0].device).toEqual({ kind: 'unknown' });
    expect(rows[0].accountId).toBe(ACCT_2);
  });

  it('marks an attributed event with a missing actor as pre-coverage, never inferred', () => {
    const { rows } = projectChangeHistory([txCreated({ actorUserId: '' })]);
    expect(rows[0].actor).toEqual({ kind: 'unknown', reason: 'pre-coverage' });
  });

  it('treats a PROFILE_PENDING placeholder actor as pre-coverage', () => {
    const { rows } = projectChangeHistory([txCreated({ actorUserId: 'PROFILE_PENDING_XYZ' })]);
    expect(rows[0].actor).toEqual({ kind: 'unknown', reason: 'pre-coverage' });
  });

  it('NEVER infers actor/device from another event in the same batch', () => {
    const { rows } = projectChangeHistory([txCreated(), accountUpdated()]);
    const flat = rows.find((r) => r.action === 'AccountUpdated')!;
    expect(flat.actor).toEqual({ kind: 'unknown', reason: 'flat' });
    expect(flat.device).toEqual({ kind: 'unknown' });
  });
});

describe('projectChangeHistory — ordering, filters, labels', () => {
  it('returns rows newest-first and reports totalCount before filtering', () => {
    const events = [
      txCreated({ id: '01HZEVT000000000000000000A', createdAt: '2026-01-01T00:00:00.000Z' }),
      txCreated({ id: '01HZEVT000000000000000000B', createdAt: '2026-03-01T00:00:00.000Z' }),
    ];
    const { rows, totalCount } = projectChangeHistory(events);
    expect(totalCount).toBe(2);
    expect(rows[0].occurredAt).toBe('2026-03-01T00:00:00.000Z');
    expect(rows[1].occurredAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('applies an inclusive date-range filter on the date portion', () => {
    const events = [
      txCreated({ id: '01HZEVT000000000000000000C', createdAt: '2026-02-01T23:59:59.000Z' }),
      txCreated({ id: '01HZEVT000000000000000000D', createdAt: '2026-02-15T12:00:00.000Z' }),
      txCreated({ id: '01HZEVT000000000000000000E', createdAt: '2026-03-01T00:00:00.000Z' }),
    ];
    const { rows, totalCount } = projectChangeHistory(events, {
      dateFrom: '2026-02-01',
      dateTo: '2026-02-28',
    });
    expect(totalCount).toBe(3);
    expect(rows.map((r) => r.eventId)).toEqual([
      '01HZEVT000000000000000000D',
      '01HZEVT000000000000000000C',
    ]);
  });

  it('filters by account id', () => {
    const { rows } = projectChangeHistory([txCreated(), accountUpdated()], {
      accountIds: [ACCT_2],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].accountId).toBe(ACCT_2);
  });

  it('device filter excludes unknown-device (flat) rows', () => {
    const { rows } = projectChangeHistory([txCreated(), accountUpdated()], {
      deviceIds: [DEV_A],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].device).toEqual({ kind: 'known', deviceId: DEV_A });
  });

  it('resolves an account label via the injected resolver', () => {
    const { rows } = projectChangeHistory(
      [txCreated()],
      {},
      {
        accountLabelById: (id) => (id === ACCT_1 ? 'Main · BBVA' : null),
      },
    );
    expect(rows[0].accountLabel).toBe('Main · BBVA');
  });

  it('drops events without a usable timestamp rather than guessing', () => {
    const { rows, totalCount } = projectChangeHistory([
      txCreated({ createdAt: undefined, payload: {} }),
    ]);
    expect(totalCount).toBe(0);
    expect(rows).toHaveLength(0);
  });
});

describe('projectChangeHistory — AC10 no-leak guard', () => {
  it('every row is a valid view-model with no extra (non-schema) fields', () => {
    const events = [txCreated(), accountUpdated()];
    const { rows } = projectChangeHistory(events);
    for (const row of rows) {
      // strict parse fails if any non-view-model property leaked through.
      const parsed = changeHistoryRowSchema.strict().parse(row);
      expect(parsed).toEqual(row);
      // belt: no raw envelope fields present.
      const keys = Object.keys(row as ChangeHistoryRow);
      expect(keys).not.toContain('payload');
      expect(keys).not.toContain('datasetId');
      expect(keys).not.toContain('dekVersion');
    }
  });
});
