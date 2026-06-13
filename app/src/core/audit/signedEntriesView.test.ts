// SPEC-028 WI-4 (#360) — signed-entries + verify-status projection tests.

import { describe, expect, it } from 'vitest';
import { deriveVerifyStatus, projectSignedEntries } from './signedEntriesView.js';
import type { AuditAnchorPayload, AuditEntry, AuditTimestampPayload } from './types.js';
import type { IntegrityVerdict } from '../../shared/ipc-contracts/audit-integrity.js';
import {
  auditVerifyStatusResponseSchema,
  signedEntryViewSchema,
} from '../../shared/ipc-contracts/audit.js';

const DEV_A = '01HZDEVAAAAAAAAAAAAAAAAAAA';
const DEV_B = '01HZDEVBBBBBBBBBBBBBBBBBBB';

const sig = {
  alg: 'ed25519' as const,
  signing_device_id: DEV_A,
  key_fingerprint: 'ff'.repeat(32),
  value: 'AA==',
};

function exportEntry(seq: number, timestamp: string): AuditEntry {
  return {
    seq,
    timestamp,
    dataset_id: '01HZDATASET00000000000000A',
    actor_device_id: DEV_A,
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

function anchorEntry(
  seq: number,
  timestamp: string,
  observedAt: string,
  devices: string[],
): AuditEntry {
  const payload: AuditAnchorPayload = {
    anchor_version: 1,
    hash_alg: 'blake2b-256',
    dataset_id: '01HZDATASET00000000000000A',
    observed_at: observedAt,
    event_log_root: 'cd'.repeat(32),
    device_frontiers: devices.map((d, i) => ({
      device_id: d,
      file_name: `events-${d}.ndjson`,
      line_count: i + 1,
      last_event_id: '01HZEVT000000000000000000' + i,
      device_head_hash: 'ee'.repeat(32),
    })),
    audit_chain_prev_hash: null,
  };
  return {
    seq,
    timestamp,
    dataset_id: '01HZDATASET00000000000000A',
    actor_device_id: DEV_A,
    actor_user_identity: 'local:test',
    action: 'audit.anchor',
    result: 'succeeded',
    target_ref: { type: 'anchor', id: '01HZANC0000000000000000001' },
    before_hash: null,
    after_hash: payload.event_log_root,
    prev_entry_hash: null,
    payload,
    signature: sig,
  };
}

function timestampEntry(seq: number, timestamp: string, anchorSeq: number): AuditEntry {
  const payload: AuditTimestampPayload = {
    timestamp_version: 1,
    provider_kind: 'rfc3161',
    provider_id: 'freetsa',
    anchor_seq: anchorSeq,
    anchor_entry_hash: 'ab'.repeat(32),
    event_log_root: 'cd'.repeat(32),
    imprint_alg: 'sha256',
    message_imprint: '12'.repeat(32),
    tsa_nonce: 'aa',
    tsa_token: 'AA==',
    tsa_gen_time: timestamp,
    tsa_serial_number: 'ff',
  };
  return {
    seq,
    timestamp,
    dataset_id: '01HZDATASET00000000000000A',
    actor_device_id: DEV_A,
    actor_user_identity: 'local:test',
    action: 'audit.anchor.timestamped',
    result: 'succeeded',
    target_ref: { type: 'anchor', id: '01HZTSP0000000000000000001' },
    before_hash: null,
    after_hash: payload.message_imprint,
    prev_entry_hash: null,
    payload,
    signature: sig,
  };
}

function verdict(over: Partial<IntegrityVerdict> = {}): IntegrityVerdict {
  return {
    status: 'ok',
    failClosed: false,
    category: 'ok',
    recovery: 'none',
    devices: [{ deviceId: DEV_A, status: 'ok', notYetAnchored: 0 }],
    summary: { anchoredDeviceCount: 1, notYetAnchoredTotal: 0, newDeviceCount: 0 },
    ...over,
  };
}

describe('projectSignedEntries', () => {
  it('maps entries newest-first and reports totalCount before filtering', () => {
    const entries = [
      exportEntry(1, '2026-01-01T00:00:00.000Z'),
      exportEntry(2, '2026-02-01T00:00:00.000Z'),
    ];
    const { entries: out, totalCount } = projectSignedEntries(entries);
    expect(totalCount).toBe(2);
    expect(out.map((e) => e.seq)).toEqual([2, 1]);
    expect(out[0].lane).toBe('signed');
  });

  it('surfaces anchor frontier date + device count and pending timestamp', () => {
    const entries = [
      anchorEntry(1, '2026-02-01T00:00:00.000Z', '2026-01-31T23:00:00.000Z', [DEV_A, DEV_B]),
    ];
    const { entries: out } = projectSignedEntries(entries);
    expect(out[0].anchoredThrough).toBe('2026-01-31T23:00:00.000Z');
    expect(out[0].deviceCount).toBe(2);
    expect(out[0].timestamp_state).toBe('pending');
  });

  it('marks an anchor timestamped when a matching receipt exists', () => {
    const entries = [
      anchorEntry(1, '2026-02-01T00:00:00.000Z', '2026-01-31T23:00:00.000Z', [DEV_A]),
      timestampEntry(2, '2026-02-01T00:05:00.000Z', 1),
    ];
    const { entries: out } = projectSignedEntries(entries);
    const anchor = out.find((e) => e.action === 'audit.anchor')!;
    expect(anchor.timestamp_state).toBe('timestamped');
  });

  it('non-anchor export rows carry null anchor fields and timestamp none', () => {
    const { entries: out } = projectSignedEntries([exportEntry(1, '2026-01-01T00:00:00.000Z')]);
    expect(out[0].anchoredThrough).toBeNull();
    expect(out[0].deviceCount).toBeNull();
    expect(out[0].timestamp_state).toBe('none');
  });

  it('filters by inclusive date range', () => {
    const entries = [
      exportEntry(1, '2026-01-15T00:00:00.000Z'),
      exportEntry(2, '2026-02-15T00:00:00.000Z'),
    ];
    const { entries: out, totalCount } = projectSignedEntries(entries, {
      dateFrom: '2026-02-01',
      dateTo: '2026-02-28',
    });
    expect(totalCount).toBe(2);
    expect(out.map((e) => e.seq)).toEqual([2]);
  });

  it('produces only valid view-models (AC10 strict parse)', () => {
    const entries = [
      anchorEntry(1, '2026-02-01T00:00:00.000Z', '2026-01-31T23:00:00.000Z', [DEV_A]),
    ];
    const { entries: out } = projectSignedEntries(entries);
    for (const row of out) {
      expect(signedEntryViewSchema.strict().parse(row)).toEqual(row);
    }
  });
});

describe('deriveVerifyStatus — banner mapping', () => {
  it('verified when chain ok and nothing unsealed', () => {
    const res = deriveVerifyStatus(
      verdict(),
      [anchorEntry(1, 't', '2026-01-01T00:00:00.000Z', [DEV_A])],
      DEV_A,
    );
    expect(res.banner).toBe('verified');
    expect(res.failClosed).toBe(false);
  });

  it('verified-unsealed-tail when ok but events exist past the anchor', () => {
    const v = verdict({
      devices: [{ deviceId: DEV_A, status: 'ok', notYetAnchored: 3 }],
      summary: { anchoredDeviceCount: 1, notYetAnchoredTotal: 3, newDeviceCount: 0 },
    });
    const res = deriveVerifyStatus(v, [], DEV_A);
    expect(res.banner).toBe('verified-unsealed-tail');
    expect(res.unsealedTailCount).toBe(3);
  });

  it('no-anchors when there is no anchor yet', () => {
    const v = verdict({
      status: 'no-anchor',
      devices: [],
      summary: { anchoredDeviceCount: 0, notYetAnchoredTotal: 0, newDeviceCount: 0 },
    });
    expect(deriveVerifyStatus(v, [], DEV_A).banner).toBe('no-anchors');
  });

  it('integrity-error (blocking) on a tamper verdict', () => {
    const v = verdict({
      status: 'chain-broken',
      failClosed: true,
      category: 'tamper',
      recovery: 'restore',
      reason: 'prev-hash-mismatch',
    });
    const res = deriveVerifyStatus(v, [], DEV_A);
    expect(res.banner).toBe('integrity-error');
    expect(res.failClosed).toBe(true);
    expect(res.category).toBe('tamper');
    expect(res.reason).toBe('prev-hash-mismatch');
  });

  it('unavailable (blocking) on an unavailable verdict', () => {
    const v = verdict({
      status: 'files-unstable',
      failClosed: true,
      category: 'unavailable',
      recovery: 'retry',
    });
    expect(deriveVerifyStatus(v, [], DEV_A).banner).toBe('unavailable');
  });

  it('defensively reports unavailable (non-blocking) for a null verdict', () => {
    const res = deriveVerifyStatus(null, [], DEV_A);
    expect(res.banner).toBe('unavailable');
    expect(res.failClosed).toBe(false);
    expect(res.devices).toEqual([]);
  });
});

describe('deriveVerifyStatus — per-device chips', () => {
  it('enriches each device with anchoredThrough, current-device flag, timestamp', () => {
    const entries = [
      anchorEntry(1, '2026-02-01T00:00:00.000Z', '2026-01-31T23:00:00.000Z', [DEV_A, DEV_B]),
      timestampEntry(2, '2026-02-01T00:05:00.000Z', 1),
    ];
    const v = verdict({
      devices: [
        { deviceId: DEV_A, status: 'ok', notYetAnchored: 0 },
        { deviceId: DEV_B, status: 'ok', notYetAnchored: 2 },
      ],
      summary: { anchoredDeviceCount: 2, notYetAnchoredTotal: 2, newDeviceCount: 0 },
    });
    const res = deriveVerifyStatus(v, entries, DEV_A);
    const a = res.devices.find((d) => d.deviceId === DEV_A)!;
    const b = res.devices.find((d) => d.deviceId === DEV_B)!;
    expect(a.isCurrentDevice).toBe(true);
    expect(a.anchoredThrough).toBe('2026-01-31T23:00:00.000Z');
    expect(a.timestamp).toBe('timestamped');
    expect(b.isCurrentDevice).toBe(false);
    expect(b.notYetAnchored).toBe(2);
  });

  it('produces a valid response view-model (AC10 strict parse)', () => {
    const res = deriveVerifyStatus(
      verdict(),
      [anchorEntry(1, 't', '2026-01-01T00:00:00.000Z', [DEV_A])],
      DEV_A,
    );
    expect(auditVerifyStatusResponseSchema.strict().parse(res)).toEqual(res);
  });
});
