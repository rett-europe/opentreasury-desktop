// SPEC-028 §4.3 — Change-history view-model contract tests (Zod strict boundary).

import { describe, it, expect } from 'vitest';
import {
  changeHistoryDetailSchema,
  changeHistoryRowSchema,
  auditListChangeHistoryResponseSchema,
} from './audit.js';

const ULID = '01HZZZZZZZZZZZZZZZZZZZZZZA';

const fullDetail = {
  summaryKind: 'tx.created' as const,
  amount: 150,
  currency: 'EUR' as const,
  txType: 'expense' as const,
  description: 'Office supplies',
  categoryId: ULID,
  categoryLabel: 'Operations',
  subcategoryId: null,
  subcategoryLabel: null,
  tagIds: [ULID],
  tagLabels: ['Q1'],
  status: 'pending' as const,
  reference: null,
};

const baseRow = {
  lane: 'history' as const,
  eventId: ULID,
  occurredAt: '2026-02-12T10:00:00.000Z',
  action: 'tx.created',
  actor: { kind: 'known' as const, userId: ULID },
  device: { kind: 'known' as const, deviceId: ULID },
  accountId: ULID,
  accountLabel: 'Main account',
};

describe('changeHistoryDetailSchema', () => {
  it('accepts a full tx.created snapshot detail', () => {
    expect(changeHistoryDetailSchema.parse(fullDetail)).toEqual(fullDetail);
  });

  it('accepts a full tx.updated snapshot detail', () => {
    const d = { ...fullDetail, summaryKind: 'tx.updated' as const };
    expect(changeHistoryDetailSchema.parse(d)).toEqual(d);
  });

  it('accepts label-only kinds (tx.deleted / config / flat) with no financial fields', () => {
    for (const summaryKind of ['tx.deleted', 'config', 'flat'] as const) {
      expect(changeHistoryDetailSchema.parse({ summaryKind })).toEqual({ summaryKind });
    }
  });

  it('rejects financial fields on a label-only kind (strict union member)', () => {
    expect(
      changeHistoryDetailSchema.safeParse({ summaryKind: 'tx.deleted', amount: 10 }).success,
    ).toBe(false);
  });

  it('rejects a tx.created detail missing required snapshot fields', () => {
    const { amount: _omit, ...rest } = fullDetail;
    expect(changeHistoryDetailSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an unknown extra key (strict)', () => {
    expect(changeHistoryDetailSchema.safeParse({ ...fullDetail, surprise: true }).success).toBe(
      false,
    );
  });

  it('rejects a non-EUR currency', () => {
    expect(changeHistoryDetailSchema.safeParse({ ...fullDetail, currency: 'USD' }).success).toBe(
      false,
    );
  });
});

describe('changeHistoryRowSchema', () => {
  it('accepts a row without detail/group fields (label-only degrade)', () => {
    expect(changeHistoryRowSchema.parse(baseRow)).toMatchObject(baseRow);
  });

  it('accepts a row carrying detail + null group fields', () => {
    const row = { ...baseRow, detail: fullDetail, groupId: null, groupSize: null };
    expect(changeHistoryRowSchema.parse(row)).toEqual(row);
  });

  it('accepts a bulk-group member row', () => {
    const row = { ...baseRow, detail: fullDetail, groupId: ULID, groupSize: 3 };
    expect(changeHistoryRowSchema.parse(row)).toEqual(row);
  });

  it('rejects a non-positive groupSize', () => {
    expect(
      changeHistoryRowSchema.safeParse({ ...baseRow, groupId: ULID, groupSize: 0 }).success,
    ).toBe(false);
  });

  it('rejects a malformed detail payload', () => {
    expect(
      changeHistoryRowSchema.safeParse({ ...baseRow, detail: { summaryKind: 'nope' } }).success,
    ).toBe(false);
  });
});

describe('auditListChangeHistoryResponseSchema', () => {
  it('accepts a mixed batch of plain + detailed + grouped rows', () => {
    const res = {
      rows: [
        baseRow,
        {
          ...baseRow,
          eventId: '01HZZZZZZZZZZZZZZZZZZZZZZB',
          detail: fullDetail,
          groupId: null,
          groupSize: null,
        },
        {
          ...baseRow,
          eventId: '01HZZZZZZZZZZZZZZZZZZZZZZC',
          detail: { ...fullDetail, summaryKind: 'tx.updated' as const },
          groupId: ULID,
          groupSize: 2,
        },
      ],
      totalCount: 3,
    };
    expect(auditListChangeHistoryResponseSchema.parse(res).rows).toHaveLength(3);
  });
});
