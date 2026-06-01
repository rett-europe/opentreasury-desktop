// SPEC-028 WI-5 (#362) — RFC-3161 token verification tests.
//
// Drives `verifyTimeStampToken` against hermetic tokens minted by tsa.testkit
// (a local CA + TSA leaf, no network). Covers the happy path plus the full
// negative-fixture matrix the plan calls for. Also smoke-tests request building
// and response parsing.

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';

import { buildTimeStampRequest, parseTimeStampResp, verifyTimeStampToken } from './rfc3161.js';
import { OID } from './oids.js';
import {
  buildTimeStampResp,
  buildRejectedResp,
  makeTestCa,
  makeTrustedToken,
} from './tsa.testkit.js';

const NOW = new Date('2026-06-01T00:00:00Z');
const GEN = new Date('2026-01-01T00:00:00Z');

function imprintOf(s: string): Buffer {
  return createHash('sha256').update(s).digest();
}

describe('buildTimeStampRequest', () => {
  it('produces a parseable DER SEQUENCE carrying the imprint and a nonce', () => {
    const hash = imprintOf('hello');
    const req = buildTimeStampRequest({ hash, nonce: Uint8Array.of(1, 2, 3, 4) });
    expect(req[0]).toBe(0x30); // SEQUENCE
    expect(req.length).toBeGreaterThan(hash.length);
  });
});

describe('parseTimeStampResp', () => {
  it('extracts a granted status + embedded token', () => {
    const hash = imprintOf('x');
    const { tokenDer } = makeTrustedToken({ imprintHash: hash, nonce: 7n });
    const resp = buildTimeStampResp(tokenDer, 0);
    const parsed = parseTimeStampResp(resp);
    expect(parsed.granted).toBe(true);
    expect(parsed.status).toBe(0);
    expect(parsed.tokenDer).not.toBeNull();
  });

  it('reports a non-granted status with no token', () => {
    const parsed = parseTimeStampResp(buildRejectedResp(2));
    expect(parsed.granted).toBe(false);
    expect(parsed.tokenDer).toBeNull();
  });
});

describe('verifyTimeStampToken — happy path', () => {
  it('verifies a well-formed token and extracts the trusted genTime + serial', () => {
    const hash = imprintOf('anchor-bytes');
    const { tokenDer, rootPem, genTime, serial } = makeTrustedToken({
      imprintHash: hash,
      nonce: 0xabcdn,
      genTime: GEN,
      serial: 0x99n,
    });
    const res = verifyTimeStampToken({
      tokenDer,
      expectedImprintAlgOid: OID.SHA256,
      expectedImprintHash: hash,
      expectedNonce: bytesOf(0xabcdn),
      trustRootsPem: [rootPem],
      now: NOW,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.genTime.toISOString()).toBe(genTime.toISOString());
      expect(BigInt('0x' + res.serialHex)).toBe(serial);
      expect(res.tsaSubject).toContain('TSA');
    }
  });

  it('does NOT mutate the input token, so re-verification still succeeds (regression)', () => {
    const hash = imprintOf('reverify');
    const { tokenDer, rootPem } = makeTrustedToken({ imprintHash: hash, nonce: 3n });
    const snapshot = Buffer.from(tokenDer);
    const opts = {
      tokenDer,
      expectedImprintAlgOid: OID.SHA256,
      expectedImprintHash: hash,
      expectedNonce: bytesOf(3n),
      trustRootsPem: [rootPem],
      now: NOW,
    };
    expect(verifyTimeStampToken(opts).ok).toBe(true);
    // The signedAttrs re-tag must not corrupt the caller's bytes.
    expect(Buffer.compare(Buffer.from(tokenDer), snapshot)).toBe(0);
    expect(verifyTimeStampToken(opts).ok).toBe(true);
  });

  it('accepts a token whose TSA cert is expired NOW but was valid at genTime', () => {
    const hash = imprintOf('old');
    const ca = makeTestCa();
    const { tokenDer, rootPem } = makeTrustedToken({
      imprintHash: hash,
      nonce: 1n,
      genTime: new Date('2020-06-01T00:00:00Z'),
      ca,
      leafOptions: {
        notBefore: new Date('2020-01-01T00:00:00Z'),
        notAfter: new Date('2021-01-01T00:00:00Z'),
      },
    });
    const res = verifyTimeStampToken({
      tokenDer,
      expectedImprintAlgOid: OID.SHA256,
      expectedImprintHash: hash,
      expectedNonce: bytesOf(1n),
      trustRootsPem: [rootPem],
      now: NOW, // far after the leaf expired
    });
    expect(res.ok).toBe(true);
  });
});

describe('verifyTimeStampToken — negative fixtures', () => {
  const hash = imprintOf('payload');

  function verify(
    tokenDer: Uint8Array,
    rootPem: string,
    overrides = {},
  ): ReturnType<typeof verifyTimeStampToken> {
    return verifyTimeStampToken({
      tokenDer,
      expectedImprintAlgOid: OID.SHA256,
      expectedImprintHash: hash,
      expectedNonce: bytesOf(5n),
      trustRootsPem: [rootPem],
      now: NOW,
      ...overrides,
    });
  }

  it('rejects a wrong outer contentType', () => {
    const { tokenDer, rootPem } = makeTrustedToken({
      imprintHash: hash,
      nonce: 5n,
      tokenOverrides: { contentTypeOid: '1.2.840.113549.1.7.1' }, // id-data
    });
    expect(failReason(verify(tokenDer, rootPem))).toBe('wrong-content-type');
  });

  it('rejects a wrong eContentType', () => {
    const { tokenDer, rootPem } = makeTrustedToken({
      imprintHash: hash,
      nonce: 5n,
      tokenOverrides: { eContentTypeOid: '1.2.840.113549.1.7.1' },
    });
    expect(failReason(verify(tokenDer, rootPem))).toBe('wrong-econtent-type');
  });

  it('rejects multiple SignerInfos', () => {
    const { tokenDer, rootPem } = makeTrustedToken({
      imprintHash: hash,
      nonce: 5n,
      tokenOverrides: { duplicateSignerInfo: true },
    });
    expect(failReason(verify(tokenDer, rootPem))).toBe('multiple-signers');
  });

  it('rejects a missing message-digest attribute', () => {
    const { tokenDer, rootPem } = makeTrustedToken({
      imprintHash: hash,
      nonce: 5n,
      tokenOverrides: { omitMessageDigest: true },
    });
    expect(failReason(verify(tokenDer, rootPem))).toBe('bad-message-digest-attr');
  });

  it('rejects a wrong message-digest value', () => {
    const { tokenDer, rootPem } = makeTrustedToken({
      imprintHash: hash,
      nonce: 5n,
      tokenOverrides: { wrongMessageDigest: true },
    });
    expect(failReason(verify(tokenDer, rootPem))).toBe('bad-message-digest-attr');
  });

  it('rejects a token whose eContent was modified after signing', () => {
    const { tokenDer, rootPem } = makeTrustedToken({
      imprintHash: hash,
      nonce: 5n,
      tokenOverrides: { tamperEContent: true },
    });
    expect(failReason(verify(tokenDer, rootPem))).toBe('bad-message-digest-attr');
  });

  it('rejects a corrupted signature', () => {
    const { tokenDer, rootPem } = makeTrustedToken({
      imprintHash: hash,
      nonce: 5n,
      tokenOverrides: { corruptSignature: true },
    });
    // No token cert verifies the broken signature.
    expect(failReason(verify(tokenDer, rootPem))).toBe('signature-invalid');
  });

  it('rejects an untrusted root (signer chains to a different CA)', () => {
    const { tokenDer } = makeTrustedToken({ imprintHash: hash, nonce: 5n });
    const otherRootPem = makeTestCa('Some Other Root').root.pem;
    expect(failReason(verify(tokenDer, otherRootPem))).toBe('untrusted-chain');
  });

  it('rejects a leaf missing the timeStamping EKU', () => {
    const { tokenDer, rootPem } = makeTrustedToken({
      imprintHash: hash,
      nonce: 5n,
      leafOptions: { withEku: false },
    });
    expect(failReason(verify(tokenDer, rootPem))).toBe('missing-timestamping-eku');
  });

  it('rejects a leaf whose timeStamping EKU is not critical', () => {
    const { tokenDer, rootPem } = makeTrustedToken({
      imprintHash: hash,
      nonce: 5n,
      leafOptions: { ekuCritical: false },
    });
    expect(failReason(verify(tokenDer, rootPem))).toBe('missing-timestamping-eku');
  });

  it('rejects a cert that is not yet valid at genTime', () => {
    const { tokenDer, rootPem } = makeTrustedToken({
      imprintHash: hash,
      nonce: 5n,
      genTime: new Date('2026-01-01T00:00:00Z'),
      leafOptions: {
        notBefore: new Date('2027-01-01T00:00:00Z'),
        notAfter: new Date('2030-01-01T00:00:00Z'),
      },
    });
    expect(failReason(verify(tokenDer, rootPem))).toBe('cert-expired-at-gentime');
  });

  it('rejects a genTime implausibly far in the future', () => {
    const { tokenDer, rootPem } = makeTrustedToken({
      imprintHash: hash,
      nonce: 5n,
      genTime: new Date('2027-01-01T00:00:00Z'), // ~7 months past NOW
    });
    expect(failReason(verify(tokenDer, rootPem))).toBe('gentime-in-future');
  });

  it('rejects an imprint that does not match the submitted hash', () => {
    const { tokenDer, rootPem } = makeTrustedToken({ imprintHash: hash, nonce: 5n });
    const res = verify(tokenDer, rootPem, { expectedImprintHash: imprintOf('different') });
    expect(failReason(res)).toBe('imprint-mismatch');
  });

  it('rejects a nonce mismatch', () => {
    const { tokenDer, rootPem } = makeTrustedToken({ imprintHash: hash, nonce: 5n });
    const res = verify(tokenDer, rootPem, { expectedNonce: bytesOf(9999n) });
    expect(failReason(res)).toBe('nonce-mismatch');
  });

  it('rejects truncated DER', () => {
    const { tokenDer, rootPem } = makeTrustedToken({ imprintHash: hash, nonce: 5n });
    expect(failReason(verify(tokenDer.subarray(0, tokenDer.length - 20), rootPem))).toBe(
      'malformed-token',
    );
  });
});

// --- helpers ---------------------------------------------------------------

function failReason(res: ReturnType<typeof verifyTimeStampToken>): string {
  return res.ok ? '<<ok>>' : res.reason;
}

/** Big-endian minimal bytes of a positive bigint (matches bytesToBigUint). */
function bytesOf(v: bigint): Uint8Array {
  let hex = v.toString(16);
  if (hex.length % 2 === 1) hex = '0' + hex;
  return Buffer.from(hex, 'hex');
}
