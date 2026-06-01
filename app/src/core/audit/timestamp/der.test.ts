// SPEC-028 WI-5 (#362) — strict-DER reader unit tests.
//
// Focused coverage for the two strictness rules the RFC-3161 verifier leans on:
// no trailing bytes after a top-level value, and calendar-valid GeneralizedTime
// (no silent normalisation of impossible dates like Feb 31).

import { describe, it, expect } from 'vitest';

import { DerError, parseSingleTlv, parseTlv, readGeneralizedTime, TAG } from './der.js';

/** Build a GeneralizedTime TLV over an ASCII time string. */
function genTimeTlv(s: string): Uint8Array {
  const body = Buffer.from(s, 'ascii');
  return Uint8Array.of(TAG.GENERALIZED_TIME, body.length, ...body);
}

describe('parseSingleTlv', () => {
  it('parses a value that consumes the whole buffer', () => {
    const der = Uint8Array.of(TAG.OCTET_STRING, 0x02, 0xaa, 0xbb);
    const node = parseSingleTlv(der, 'octets');
    expect(node.end).toBe(der.length);
  });

  it('rejects trailing bytes after the top-level value', () => {
    const der = Uint8Array.of(TAG.OCTET_STRING, 0x02, 0xaa, 0xbb, 0x99);
    expect(() => parseSingleTlv(der, 'octets')).toThrow(DerError);
  });
});

describe('readGeneralizedTime', () => {
  it('parses a valid UTC GeneralizedTime', () => {
    const node = parseTlv(genTimeTlv('20260115102030Z'), 0);
    expect(readGeneralizedTime(node).toISOString()).toBe('2026-01-15T10:20:30.000Z');
  });

  it('parses fractional seconds', () => {
    const node = parseTlv(genTimeTlv('20260115102030.5Z'), 0);
    expect(readGeneralizedTime(node).toISOString()).toBe('2026-01-15T10:20:30.500Z');
  });

  it('rejects a calendar-invalid date that Date.UTC would normalise (Feb 31)', () => {
    const node = parseTlv(genTimeTlv('20260231000000Z'), 0);
    expect(() => readGeneralizedTime(node)).toThrow(DerError);
  });

  it('rejects an out-of-range month', () => {
    const node = parseTlv(genTimeTlv('20261301000000Z'), 0);
    expect(() => readGeneralizedTime(node)).toThrow(DerError);
  });

  it('rejects a non-UTC (missing Z) time', () => {
    const node = parseTlv(genTimeTlv('20260115102030'), 0);
    expect(() => readGeneralizedTime(node)).toThrow(DerError);
  });
});
