// SPEC-028 WI-4 (#360) — change-history projection tests.

import { describe, expect, it } from 'vitest';
import { projectChangeHistory } from './changeHistory.js';
import type { ChangeHistoryRow } from '../../shared/ipc-contracts/audit.js';
import { changeHistoryRowSchema } from '../../shared/ipc-contracts/audit.js';
import type { DomainEvent } from '../events/schemas.js';
import {
  configAccountCreatedEventSchema,
  configCategoryDeletedEventSchema,
} from '../events/schemas.js';

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

// A legacy WI-21 config event (no actor/device on the wire) — #388 classifies
// these as pre-coverage (attribution-capable type, fields absent), never flat.
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

  it('renders a legacy config event (no actor) as unknown(pre-coverage), never flat', () => {
    const { rows } = projectChangeHistory([accountUpdated()]);
    expect(rows[0].actor).toEqual({ kind: 'unknown', reason: 'pre-coverage' });
    expect(rows[0].device).toEqual({ kind: 'unknown' });
    expect(rows[0].accountId).toBe(ACCT_2);
  });

  it('attributes a config event that carries actorUserId + actorDeviceId (#388)', () => {
    const { rows } = projectChangeHistory([
      accountUpdated({ actorUserId: USER_A, actorDeviceId: DEV_A }),
    ]);
    expect(rows[0].actor).toEqual({ kind: 'known', userId: USER_A });
    expect(rows[0].device).toEqual({ kind: 'known', deviceId: DEV_A });
    expect(rows[0].action).toBe('AccountUpdated');
  });

  it('marks a config delete event with no actor fields as pre-coverage (#388)', () => {
    const legacyDelete = {
      type: 'CategoryDeleted',
      id: '01HZEVT0000000000000000009',
      categoryId: ACCT_2,
      deletedAt: '2026-02-12T09:00:00.000Z',
    } as unknown as DomainEvent;
    const { rows } = projectChangeHistory([legacyDelete]);
    expect(rows[0].actor).toEqual({ kind: 'unknown', reason: 'pre-coverage' });
    expect(rows[0].device).toEqual({ kind: 'unknown' });
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
    const legacy = rows.find((r) => r.action === 'AccountUpdated')!;
    expect(legacy.actor).toEqual({ kind: 'unknown', reason: 'pre-coverage' });
    expect(legacy.device).toEqual({ kind: 'unknown' });
  });

  it('keeps a genuinely flat event (tx.note.added) as unknown(flat)', () => {
    const note = {
      type: 'tx.note.added',
      id: '01HZEVT0000000000000000010',
      txId: '01HZTX00000000000000000001',
      createdAt: '2026-02-13T09:00:00.000Z',
    } as unknown as DomainEvent;
    const { rows } = projectChangeHistory([note]);
    expect(rows[0].actor).toEqual({ kind: 'unknown', reason: 'flat' });
    expect(rows[0].device).toEqual({ kind: 'unknown' });
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

// #388 — backward-compat: the optional actor/device fields must not break
// replay of NDJSON logs written before this slice, and must round-trip when
// present so the audit projection can attribute them.
describe('config event schema round-trip — #388 actor/device backward-compat', () => {
  it('parses a legacy AccountCreated event with NO actor fields', () => {
    const legacy = {
      type: 'AccountCreated',
      id: '01HZACCT1111111111111111AA',
      name: 'Caja',
      currency: 'EUR',
      openingBalance: 0,
      sortOrder: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const parsed = configAccountCreatedEventSchema.parse(legacy);
    expect(parsed.actorUserId).toBeUndefined();
    expect(parsed.actorDeviceId).toBeUndefined();
    // The change-history projection reads it as pre-coverage (capable type,
    // no fields) — never flat.
    const { rows } = projectChangeHistory([parsed as unknown as DomainEvent]);
    expect(rows[0].actor).toEqual({ kind: 'unknown', reason: 'pre-coverage' });
    expect(rows[0].device).toEqual({ kind: 'unknown' });
  });

  it('round-trips an AccountCreated event WITH actor + device fields', () => {
    const stamped = {
      type: 'AccountCreated',
      id: '01HZACCT2222222222222222BB',
      name: 'Nómina',
      currency: 'EUR',
      openingBalance: 100,
      sortOrder: 1,
      createdAt: '2026-06-01T00:00:00.000Z',
      actorUserId: USER_A,
      actorDeviceId: DEV_A,
    };
    const parsed = configAccountCreatedEventSchema.parse(stamped);
    expect(parsed.actorUserId).toBe(USER_A);
    expect(parsed.actorDeviceId).toBe(DEV_A);
    const { rows } = projectChangeHistory([parsed as unknown as DomainEvent]);
    expect(rows[0].actor).toEqual({ kind: 'known', userId: USER_A });
    expect(rows[0].device).toEqual({ kind: 'known', deviceId: DEV_A });
  });

  it('parses a legacy CategoryDeleted event with NO actor fields', () => {
    const legacy = {
      type: 'CategoryDeleted',
      id: '01HZEVT0000000000000000099',
      categoryId: '01HZCAT00000000000000000AA',
      deletedAt: '2026-01-01T00:00:00.000Z',
    };
    const parsed = configCategoryDeletedEventSchema.parse(legacy);
    expect(parsed.actorUserId).toBeUndefined();
    expect(parsed.actorDeviceId).toBeUndefined();
  });
});
