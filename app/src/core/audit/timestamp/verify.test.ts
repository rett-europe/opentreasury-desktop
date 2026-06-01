// SPEC-028 WI-5 (#362) — receipt verifier tests (`verifyTimestampReceipt`).
//
// Joins a real signed `audit.anchor` entry to a hermetic TSA token and checks
// the binding end-to-end, then walks the negative matrix (wrong join, altered
// root, recomputed-imprint mismatch, untrusted root, tampered token).

import { describe, it, expect } from 'vitest';

import { verifyTimestampReceipt } from './verify.js';
import { anchorMessageImprintHex } from './imprint.js';
import { canonicalHashHex } from '../../crypto/hash.js';
import { makeTrustedToken, makeTestCa } from './tsa.testkit.js';
import { memStore, makeAuditLog, makeMk, appendTestAnchor } from '../audit.testkit.js';
import type { AuditEntry, AuditTimestampPayload } from '../types.js';

const NOW = new Date('2026-06-01T00:00:00Z');
const GEN = new Date('2026-01-01T00:00:00Z');

function nonceBig(bytes: Uint8Array): bigint {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v;
}

interface Fixture {
  readonly anchor: AuditEntry;
  readonly receipt: AuditTimestampPayload;
  readonly rootPem: string;
}

async function makeFixture(): Promise<Fixture> {
  const store = memStore();
  const mk = makeMk();
  const log = makeAuditLog(store, mk);
  const anchor = await appendTestAnchor(log, 'c'.repeat(64));

  const imprintHex = anchorMessageImprintHex(anchor);
  const imprint = Buffer.from(imprintHex, 'hex');
  const nonceBytes = Buffer.from('a1b2c3d4', 'hex');
  const { tokenDer, rootPem, genTime, serial } = makeTrustedToken({
    imprintHash: imprint,
    nonce: nonceBig(nonceBytes),
    genTime: GEN,
    serial: 0x4242n,
  });

  const receipt: AuditTimestampPayload = {
    timestamp_version: 1,
    provider_kind: 'rfc3161',
    provider_id: 'test',
    anchor_seq: anchor.seq,
    anchor_entry_hash: canonicalHashHex(anchor),
    event_log_root: anchor.after_hash!,
    imprint_alg: 'sha256',
    message_imprint: imprintHex,
    tsa_nonce: nonceBytes.toString('hex'),
    tsa_token: Buffer.from(tokenDer).toString('base64'),
    tsa_gen_time: genTime.toISOString(),
    tsa_serial_number: serial.toString(16),
  };
  return { anchor, receipt, rootPem };
}

describe('verifyTimestampReceipt — happy path', () => {
  it('verifies a receipt bound to its anchor and extracts the trusted time', async () => {
    const { anchor, receipt, rootPem } = await makeFixture();
    const res = verifyTimestampReceipt({
      receipt,
      anchorEntry: anchor,
      now: NOW,
      trustRootsPem: [rootPem],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.trustedTime.toISOString()).toBe(GEN.toISOString());
      expect(res.tsaSubject).toContain('TSA');
    }
  });
});

describe('verifyTimestampReceipt — negative matrix', () => {
  it('fails when the receipt names a different anchor seq', async () => {
    const { anchor, receipt, rootPem } = await makeFixture();
    const res = verifyTimestampReceipt({
      receipt: { ...receipt, anchor_seq: anchor.seq + 1 },
      anchorEntry: anchor,
      now: NOW,
      trustRootsPem: [rootPem],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('anchor-not-found');
  });

  it('fails when anchor_entry_hash does not match the anchor', async () => {
    const { anchor, receipt, rootPem } = await makeFixture();
    const res = verifyTimestampReceipt({
      receipt: { ...receipt, anchor_entry_hash: 'd'.repeat(64) },
      anchorEntry: anchor,
      now: NOW,
      trustRootsPem: [rootPem],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('anchor-hash-mismatch');
  });

  it('fails when the receipt event_log_root differs from the anchor', async () => {
    const { anchor, receipt, rootPem } = await makeFixture();
    const res = verifyTimestampReceipt({
      receipt: { ...receipt, event_log_root: 'e'.repeat(64) },
      anchorEntry: anchor,
      now: NOW,
      trustRootsPem: [rootPem],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('event-root-mismatch');
  });

  it('fails when the recomputed imprint does not match message_imprint', async () => {
    const { anchor, receipt, rootPem } = await makeFixture();
    const wrong = Buffer.alloc(32, 0xab).toString('hex');
    const res = verifyTimestampReceipt({
      receipt: { ...receipt, message_imprint: wrong },
      anchorEntry: anchor,
      now: NOW,
      trustRootsPem: [rootPem],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('imprint-recompute-mismatch');
  });

  it('fails (untrusted-chain) against a foreign trust root', async () => {
    const { anchor, receipt } = await makeFixture();
    const otherRoot = makeTestCa('Foreign Root').root.pem;
    const res = verifyTimestampReceipt({
      receipt,
      anchorEntry: anchor,
      now: NOW,
      trustRootsPem: [otherRoot],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('untrusted-chain');
  });

  it('fails (malformed-receipt) when tsa_nonce is not even-length hex', async () => {
    const { anchor, receipt, rootPem } = await makeFixture();
    for (const badNonce of ['', 'a1b', 'zz', 'a1b2c3d']) {
      const res = verifyTimestampReceipt({
        receipt: { ...receipt, tsa_nonce: badNonce },
        anchorEntry: anchor,
        now: NOW,
        trustRootsPem: [rootPem],
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe('malformed-receipt');
    }
  });

  it('fails when a byte of the signature in the stored token is flipped', async () => {
    const { anchor, receipt, rootPem } = await makeFixture();
    const tokenBytes = Buffer.from(receipt.tsa_token, 'base64');
    // The trailing bytes are the TSA signature; the middle of the token lands in
    // the embedded root cert, which the verifier ignores (root comes from the
    // bundled trust anchor), so flip near the end to corrupt the signature.
    tokenBytes[tokenBytes.length - 2] ^= 0xff;
    const res = verifyTimestampReceipt({
      receipt: { ...receipt, tsa_token: tokenBytes.toString('base64') },
      anchorEntry: anchor,
      now: NOW,
      trustRootsPem: [rootPem],
    });
    expect(res.ok).toBe(false);
  });
});
