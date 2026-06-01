// SPEC-028 WI-2 (#358) — Pure frontier primitive tests.
//
// Exercises the cryptographic core behind `audit.anchor` (frontier.ts): the
// per-device chained head, the order-independent event-log root, and the
// verification recompute path. All inputs are raw NDJSON line bytes; no fs, no
// clock, no Electron. Mirrors spec §9.1 (AC4–AC6, AC8).

import { describe, it, expect } from 'vitest';
import {
  splitCompleteLines,
  foldDeviceHead,
  headSeed,
  foldHead,
  computeDeviceFrontier,
  computeEventLogRoot,
  verifyAnchorAgainstFiles,
  type RawDeviceFile,
} from './frontier.js';
import type { DeviceFrontier } from './types.js';

const DEV_A = '01JWDEVCEAAAAAAAAAAAAAAAAA';
const DEV_B = '01JWDEVCEBBBBBBBBBBBBBBBBB';

/** Build a canonical encrypted-line shape `{ id, c }` as bytes incl. `\n`. */
function line(id: string, c = 'cipher'): Uint8Array {
  return Buffer.from(`${JSON.stringify({ id, c })}\n`, 'utf8');
}

/** Concatenate line buffers into one file buffer. */
function file(...lines: Uint8Array[]): Uint8Array {
  return Buffer.concat(lines.map((l) => Buffer.from(l)));
}

function rawFile(deviceId: string, fileName: string, bytes: Uint8Array): RawDeviceFile {
  return { deviceId, fileName, bytes };
}

describe('splitCompleteLines', () => {
  it('carves complete newline-terminated lines and reports their ids', () => {
    const buf = file(line('id-1'), line('id-2'), line('id-3'));
    const split = splitCompleteLines(buf);
    expect(split.malformed).toBe(false);
    expect(split.hasTrailingPartial).toBe(false);
    expect(split.lines.map((l) => l.id)).toEqual(['id-1', 'id-2', 'id-3']);
    expect(split.completeByteLength).toBe(buf.length);
  });

  it('excludes a trailing un-terminated partial (crash tail) without flagging malformed', () => {
    const complete = file(line('id-1'), line('id-2'));
    const buf = Buffer.concat([complete, Buffer.from('{"id":"id-3","c":"par', 'utf8')]);
    const split = splitCompleteLines(buf);
    expect(split.malformed).toBe(false);
    expect(split.hasTrailingPartial).toBe(true);
    expect(split.lines.map((l) => l.id)).toEqual(['id-1', 'id-2']);
    expect(split.completeByteLength).toBe(complete.length);
  });

  it('flags an interior malformed complete line and stops collecting', () => {
    const buf = file(line('id-1'), Buffer.from('not json\n', 'utf8'), line('id-3'));
    const split = splitCompleteLines(buf);
    expect(split.malformed).toBe(true);
    expect(split.malformedLineNumber).toBe(2);
    expect(split.lines.map((l) => l.id)).toEqual(['id-1']);
  });

  it('rejects a complete line missing the `c` field', () => {
    const bad = Buffer.from(`${JSON.stringify({ id: 'id-1' })}\n`, 'utf8');
    expect(splitCompleteLines(bad).malformed).toBe(true);
  });
});

describe('foldDeviceHead — incremental ≡ batch (AC8)', () => {
  it('matches a one-line-at-a-time fold against a batch fold', () => {
    const lines = [line('id-1'), line('id-2'), line('id-3'), line('id-4')];
    const batch = foldDeviceHead(DEV_A, lines);

    let h = headSeed(DEV_A);
    for (const l of lines) h = foldHead(h, l);
    const incremental = Buffer.from(h).toString('hex');

    expect(incremental).toBe(batch);
  });

  it('a prefix head equals the head computed from scratch over that prefix', () => {
    const lines = [line('id-1'), line('id-2'), line('id-3')];
    const prefixHead = foldDeviceHead(DEV_A, lines.slice(0, 2));
    const fromScratch = foldDeviceHead(DEV_A, [lines[0]!, lines[1]!]);
    expect(prefixHead).toBe(fromScratch);
  });

  it('is sensitive to a single-byte change in any line', () => {
    const base = foldDeviceHead(DEV_A, [line('id-1'), line('id-2')]);
    const tampered = foldDeviceHead(DEV_A, [line('id-1'), line('id-2', 'CIPHER')]);
    expect(tampered).not.toBe(base);
  });

  it('is domain-separated by device id', () => {
    const lines = [line('id-1')];
    expect(foldDeviceHead(DEV_A, lines)).not.toBe(foldDeviceHead(DEV_B, lines));
  });
});

describe('computeEventLogRoot', () => {
  const fa: DeviceFrontier = {
    device_id: DEV_A,
    file_name: `events-${DEV_A}.ndjson`,
    line_count: 2,
    last_event_id: 'id-2',
    device_head_hash: foldDeviceHead(DEV_A, [line('id-1'), line('id-2')]),
  };
  const fb: DeviceFrontier = {
    device_id: DEV_B,
    file_name: `events-${DEV_B}.ndjson`,
    line_count: 1,
    last_event_id: 'id-9',
    device_head_hash: foldDeviceHead(DEV_B, [line('id-9')]),
  };

  it('is independent of the input order', () => {
    expect(computeEventLogRoot([fa, fb])).toBe(computeEventLogRoot([fb, fa]));
  });

  it('changes when any device head changes', () => {
    const fb2: DeviceFrontier = { ...fb, device_head_hash: 'deadbeef' };
    expect(computeEventLogRoot([fa, fb2])).not.toBe(computeEventLogRoot([fa, fb]));
  });

  it('changes when a device frontier is added', () => {
    expect(computeEventLogRoot([fa])).not.toBe(computeEventLogRoot([fa, fb]));
  });
});

describe('computeDeviceFrontier', () => {
  it('builds a frontier over a well-formed file', () => {
    const buf = file(line('id-1'), line('id-2'));
    const res = computeDeviceFrontier(rawFile(DEV_A, `events-${DEV_A}.ndjson`, buf));
    expect(res.ok).toBe(true);
    expect(res.frontier).toMatchObject({
      device_id: DEV_A,
      line_count: 2,
      last_event_id: 'id-2',
    });
  });

  it('refuses an empty file', () => {
    const res = computeDeviceFrontier(rawFile(DEV_A, 'f', new Uint8Array(0)));
    expect(res.ok).toBe(false);
    expect(res.error).toBe('empty');
  });

  it('refuses a malformed file', () => {
    const buf = file(line('id-1'), Buffer.from('garbage\n', 'utf8'));
    const res = computeDeviceFrontier(rawFile(DEV_A, 'f', buf));
    expect(res.ok).toBe(false);
    expect(res.error).toBe('malformed');
    expect(res.malformedLineNumber).toBe(2);
  });
});

describe('verifyAnchorAgainstFiles — recompute path (AC4–AC6)', () => {
  const fileNameA = `events-${DEV_A}.ndjson`;
  const fileNameB = `events-${DEV_B}.ndjson`;

  function anchorOf(files: RawDeviceFile[]): {
    event_log_root: string;
    device_frontiers: DeviceFrontier[];
  } {
    const frontiers = files.map((f) => computeDeviceFrontier(f).frontier!);
    return { event_log_root: computeEventLogRoot(frontiers), device_frontiers: frontiers };
  }

  it('verifies a faithful snapshot (happy path)', () => {
    const files = [
      rawFile(DEV_A, fileNameA, file(line('id-1'), line('id-2'))),
      rawFile(DEV_B, fileNameB, file(line('id-9'))),
    ];
    const payload = anchorOf(files);
    const res = verifyAnchorAgainstFiles(payload, files, payload.event_log_root);
    expect(res.ok).toBe(true);
    expect(res.devices.every((d) => d.status === 'ok')).toBe(true);
    expect(res.devices.every((d) => d.notYetAnchored === 0)).toBe(true);
  });

  it('detects a one-byte edit inside an anchored line as head-mismatch', () => {
    const files = [rawFile(DEV_A, fileNameA, file(line('id-1'), line('id-2')))];
    const payload = anchorOf(files);
    const tampered = [rawFile(DEV_A, fileNameA, file(line('id-1'), line('id-2', 'TAMPER')))];
    const res = verifyAnchorAgainstFiles(payload, tampered, payload.event_log_root);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('device-failed');
    expect(res.devices[0]!.status).toBe('head-mismatch');
  });

  it('detects truncation below the anchored line count', () => {
    const files = [rawFile(DEV_A, fileNameA, file(line('id-1'), line('id-2'), line('id-3')))];
    const payload = anchorOf(files);
    const truncated = [rawFile(DEV_A, fileNameA, file(line('id-1'), line('id-2')))];
    const res = verifyAnchorAgainstFiles(payload, truncated, payload.event_log_root);
    expect(res.ok).toBe(false);
    expect(res.devices[0]!.status).toBe('truncated');
  });

  it('detects a missing device file', () => {
    const files = [rawFile(DEV_A, fileNameA, file(line('id-1')))];
    const payload = anchorOf(files);
    const res = verifyAnchorAgainstFiles(payload, [], payload.event_log_root);
    expect(res.ok).toBe(false);
    expect(res.devices[0]!.status).toBe('file-missing');
  });

  it('detects a last_event_id mismatch when an anchored line is swapped', () => {
    const files = [rawFile(DEV_A, fileNameA, file(line('id-1'), line('id-2')))];
    const payload = anchorOf(files);
    // Same line_count but the second line carries a different id.
    const swapped = [rawFile(DEV_A, fileNameA, file(line('id-1'), line('id-X')))];
    const res = verifyAnchorAgainstFiles(payload, swapped, payload.event_log_root);
    expect(res.ok).toBe(false);
    expect(res.devices[0]!.status).toBe('last-event-mismatch');
  });

  it('treats extra tail lines as notYetAnchored, not tamper (late-peer FR9/AC6)', () => {
    const files = [rawFile(DEV_A, fileNameA, file(line('id-1'), line('id-2')))];
    const payload = anchorOf(files);
    const grown = [rawFile(DEV_A, fileNameA, file(line('id-1'), line('id-2'), line('id-3')))];
    const res = verifyAnchorAgainstFiles(payload, grown, payload.event_log_root);
    expect(res.ok).toBe(true);
    expect(res.devices[0]!.status).toBe('ok');
    expect(res.devices[0]!.notYetAnchored).toBe(1);
  });

  it('reports a device enrolled after the anchor as newDevices (not tamper)', () => {
    const anchored = [rawFile(DEV_A, fileNameA, file(line('id-1')))];
    const payload = anchorOf(anchored);
    const withNew = [...anchored, rawFile(DEV_B, fileNameB, file(line('id-9')))];
    const res = verifyAnchorAgainstFiles(payload, withNew, payload.event_log_root);
    expect(res.ok).toBe(true);
    expect(res.newDevices).toEqual([DEV_B]);
  });

  it('fails when the after_hash does not equal the recomputed root', () => {
    const files = [rawFile(DEV_A, fileNameA, file(line('id-1')))];
    const payload = anchorOf(files);
    const res = verifyAnchorAgainstFiles(payload, files, 'a'.repeat(64));
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('after-hash-mismatch');
  });

  it('fails when the payload root has been forged to not match its frontiers', () => {
    const files = [rawFile(DEV_A, fileNameA, file(line('id-1')))];
    const payload = anchorOf(files);
    const forged = { ...payload, event_log_root: 'b'.repeat(64) };
    const res = verifyAnchorAgainstFiles(forged, files, null);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('root-mismatch');
  });
});
