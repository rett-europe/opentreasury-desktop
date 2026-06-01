// SPEC-028 WI-5 (#362) — Pin the bundled TSA trust anchor (OQ4b).
//
// The freeTSA root is the out-of-box default trust anchor. We pin it by SHA-256
// fingerprint so an accidental or malicious cert swap fails the build rather
// than silently widening who can mint receipts we'll accept.

import { X509Certificate } from 'node:crypto';

import { describe, it, expect } from 'vitest';

import {
  FREETSA_ROOT_CA_PEM,
  FREETSA_ROOT_CA_SHA256,
  FREETSA_ROOT_ID,
  resolveTrustRoots,
  trustRootIdsForProvider,
} from './roots.js';

describe('bundled TSA trust anchors', () => {
  it('the freeTSA root matches its pinned SHA-256 fingerprint and provenance', () => {
    const cert = new X509Certificate(FREETSA_ROOT_CA_PEM);
    expect(cert.fingerprint256).toBe(FREETSA_ROOT_CA_SHA256);
    // Self-signed root with the documented subject + serial.
    expect(cert.subject).toContain('CN=www.freetsa.org');
    expect(cert.issuer).toBe(cert.subject);
    expect(cert.serialNumber).toBe('C1E986160DA8E980');
    // Long-lived anchor (documented Not After 2041-03-07).
    expect(new Date(cert.validTo).getUTCFullYear()).toBe(2041);
  });

  it('resolves the freetsa provider to the pinned root and unknown ids to none', () => {
    expect(trustRootIdsForProvider('freetsa')).toEqual([FREETSA_ROOT_ID]);
    expect(trustRootIdsForProvider('does-not-exist')).toEqual([]);

    expect(resolveTrustRoots([FREETSA_ROOT_ID])).toEqual([FREETSA_ROOT_CA_PEM]);
    expect(resolveTrustRoots(['does-not-exist'])).toEqual([]);
  });
});
