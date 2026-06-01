import { randomBytes, createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { buildTimeStampRequest, verifyTimeStampToken } from './rfc3161.js';
import { Rfc3161HttpProvider } from './provider.js';
import { FREETSA_ROOT_CA_PEM } from './roots.js';
import { OID } from './oids.js';

// Network-gated smoke test against the real freeTSA endpoint. Run manually:
//   LIVE_TSA=1 npx vitest run app/src/core/audit/timestamp/_live.test.ts
describe.runIf(process.env.LIVE_TSA === '1')('live freeTSA RFC-3161', () => {
  it('builds a request, gets a token, and verifies it', async () => {
    const hash = createHash('sha256').update('hello-wi5').digest();
    const nonce = randomBytes(16);
    const provider = new Rfc3161HttpProvider({
      id: 'freetsa',
      url: 'https://freetsa.org/tsr',
      trustRootIds: ['freetsa-root-ca'],
      timeoutMs: 20000,
    });
    const res = await provider.requestTimestamp({ alg: 'sha256', hash, nonce });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const v = verifyTimeStampToken({
      tokenDer: res.tokenDer,
      expectedImprintAlgOid: OID.SHA256,
      expectedImprintHash: hash,
      expectedNonce: nonce,
      trustRootsPem: [FREETSA_ROOT_CA_PEM],
      now: new Date(),
    });
    if (!v.ok) throw new Error('verify failed: ' + v.reason + ' ' + (v.detail ?? ''));
    expect(v.ok).toBe(true);
    expect(v.genTime instanceof Date).toBe(true);
    // eslint-disable-next-line no-console
    console.log(
      'LIVE genTime=',
      v.genTime.toISOString(),
      'serial=',
      v.serialHex,
      'tsa=',
      v.tsaSubject.replace(/\n/g, ' '),
    );

    // Round-trip the request builder + response parser on the same token.
    const req = buildTimeStampRequest({ hash, nonce });
    expect(req.length).toBeGreaterThan(0);
  });
});
