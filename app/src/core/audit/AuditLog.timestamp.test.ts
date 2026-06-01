// SPEC-028 WI-5 (#362) — `appendTimestamp` invariants on the audit log.
//
// The receipt is a SEPARATE signed entry that never mutates the anchor; its
// `after_hash` mirrors the message imprint (not the event_log_root); it is
// idempotent under the write lock; and the reserved action cannot be smuggled
// through the generic `append`.

import { describe, it, expect } from 'vitest';

import { canonicalHashHex } from '../crypto/hash.js';
import { anchorMessageImprintHex } from './timestamp/imprint.js';
import { memStore, makeAuditLog, makeMk, appendTestAnchor, newTestUlid } from './audit.testkit.js';

function receiptInput(
  anchor: { seq: number; after_hash: string | null },
  hash: string,
  imprint: string,
) {
  return {
    targetId: newTestUlid(),
    providerId: 'freetsa',
    anchorSeq: anchor.seq,
    anchorEntryHash: hash,
    eventLogRoot: anchor.after_hash!,
    imprintAlg: 'sha256' as const,
    messageImprint: imprint,
    tsaNonce: 'cafe',
    tsaToken: Buffer.from('opaque-token').toString('base64'),
    tsaGenTime: '2026-01-01T00:00:00.000Z',
    tsaSerialNumber: '2233',
  };
}

describe('AuditLog.appendTimestamp', () => {
  it('writes a well-formed receipt entry and keeps the chain valid', async () => {
    const store = memStore();
    const log = makeAuditLog(store, makeMk());
    const anchor = await appendTestAnchor(log, 'f'.repeat(64));
    const imprint = anchorMessageImprintHex(anchor);

    const receipt = await log.appendTimestamp(
      receiptInput(anchor, canonicalHashHex(anchor), imprint),
    );

    expect(receipt.action).toBe('audit.anchor.timestamped');
    expect(receipt.target_ref.type).toBe('anchor');
    expect(receipt.result).toBe('succeeded');
    expect(receipt.before_hash).toBeNull();
    expect(receipt.after_hash).toBe(imprint); // mirrors the signed digest
    expect(receipt.seq).toBeGreaterThan(anchor.seq);
    const p = receipt.payload;
    expect(p && 'timestamp_version' in p).toBe(true);

    expect((await log.verifyChain()).ok).toBe(true);
  });

  it('is idempotent: a second call for the same anchor returns the existing receipt', async () => {
    const store = memStore();
    const log = makeAuditLog(store, makeMk());
    const anchor = await appendTestAnchor(log, 'f'.repeat(64));
    const hash = canonicalHashHex(anchor);
    const imprint = anchorMessageImprintHex(anchor);

    const first = await log.appendTimestamp(receiptInput(anchor, hash, imprint));
    const second = await log.appendTimestamp(receiptInput(anchor, hash, imprint));

    expect(second.seq).toBe(first.seq);
    const receipts = (await log.readAll()).filter((e) => e.action === 'audit.anchor.timestamped');
    expect(receipts).toHaveLength(1);
  });

  it('rejects the reserved action through the generic append()', async () => {
    const log = makeAuditLog(memStore(), makeMk());
    await expect(
      log.append({
        action: 'audit.anchor.timestamped',
        result: 'succeeded',
        targetId: newTestUlid(),
        afterHash: 'a'.repeat(64),
      } as never),
    ).rejects.toThrow(/appendAnchor/);
  });

  it('never mutates the anchor entry it references', async () => {
    const store = memStore();
    const log = makeAuditLog(store, makeMk());
    const anchor = await appendTestAnchor(log, 'f'.repeat(64));
    const before = canonicalHashHex(anchor);

    await log.appendTimestamp(receiptInput(anchor, before, anchorMessageImprintHex(anchor)));

    const reloaded = (await log.readAll()).find((e) => e.seq === anchor.seq)!;
    expect(canonicalHashHex(reloaded)).toBe(before);
  });
});
