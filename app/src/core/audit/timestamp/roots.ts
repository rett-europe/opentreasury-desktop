// SPEC-028 WI-5 (#362) — Bundled trust anchors for RFC-3161 timestamp tokens.
//
// These are the *trust anchors* (CA root certificates) used to validate the
// signer certificate inside a TSA timestamp token. We bundle the CA root — NOT
// the rotating TSA leaf — and accept a leaf by constraint (issuer-signature
// chain to one of these anchors + critical id-kp-timeStamping EKU + validity at
// genTime), never by pinning the leaf.
//
// Provider mapping: a `TimestampProvider` carries a `trustRootIds` list; the
// verifier resolves those to the PEM strings here. Adding/rotating a provider's
// CA means editing this file (and is covered by tests against bundled fixtures).
//
// freeTSA.org Root CA — self-signed, valid to 2041-03-07. Permits general data
// timestamping (SaaS). Redistribution of the public CA cert for verification is
// expected/permitted (it is a public key, not a secret).
//
// NORMATIVE CAVEAT (OQ4b): freeTSA is the functional, out-of-box DEFAULT only.
// Production / audit-grade / regulatory deployments SHOULD configure a QUALIFIED
// (e.g. eIDAS) or commercial TSA via a provider whose `trustRootIds` resolve to
// its own bundled anchor. See spec §11 (OQ4) and crypto-spec §8.6.
//
// PIN / PROVENANCE — this anchor is pinned by SHA-256 fingerprint and guarded by
// roots.test.ts so an accidental/ malicious cert swap fails the build:
//   Subject/Issuer : O=Free TSA, OU=Root CA, CN=www.freetsa.org (self-signed)
//   Serial         : C1E986160DA8E980
//   Not After      : 2041-03-07T01:52:13Z
//   SHA-256        : A6:37:9E:7C:EC:C0:5F:AA:3C:BF:07:60:13:D7:45:E3:
//                    27:BB:BA:A3:8C:0B:9A:F2:24:69:D4:70:1D:18:AA:BC
//   Source         : https://www.freetsa.org/files/cacert.pem
//   Verify locally : openssl x509 -in cacert.pem -noout -fingerprint -sha256

/**
 * Expected SHA-256 fingerprint of {@link FREETSA_ROOT_CA_PEM} (colon-separated
 * uppercase hex, matching Node's `X509Certificate.fingerprint256`). Pinned so a
 * cert swap is caught by `roots.test.ts`. Provenance documented in the header.
 */
export const FREETSA_ROOT_CA_SHA256 =
  'A6:37:9E:7C:EC:C0:5F:AA:3C:BF:07:60:13:D7:45:E3:27:BB:BA:A3:8C:0B:9A:F2:24:69:D4:70:1D:18:AA:BC';

/** freeTSA.org Root CA (O=Free TSA, OU=Root CA, CN=www.freetsa.org). */
export const FREETSA_ROOT_CA_PEM = `-----BEGIN CERTIFICATE-----
MIIH/zCCBeegAwIBAgIJAMHphhYNqOmAMA0GCSqGSIb3DQEBDQUAMIGVMREwDwYD
VQQKEwhGcmVlIFRTQTEQMA4GA1UECxMHUm9vdCBDQTEYMBYGA1UEAxMPd3d3LmZy
ZWV0c2Eub3JnMSIwIAYJKoZIhvcNAQkBFhNidXNpbGV6YXNAZ21haWwuY29tMRIw
EAYDVQQHEwlXdWVyemJ1cmcxDzANBgNVBAgTBkJheWVybjELMAkGA1UEBhMCREUw
HhcNMTYwMzEzMDE1MjEzWhcNNDEwMzA3MDE1MjEzWjCBlTERMA8GA1UEChMIRnJl
ZSBUU0ExEDAOBgNVBAsTB1Jvb3QgQ0ExGDAWBgNVBAMTD3d3dy5mcmVldHNhLm9y
ZzEiMCAGCSqGSIb3DQEJARYTYnVzaWxlemFzQGdtYWlsLmNvbTESMBAGA1UEBxMJ
V3VlcnpidXJnMQ8wDQYDVQQIEwZCYXllcm4xCzAJBgNVBAYTAkRFMIICIjANBgkq
hkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAtgKODjAy8REQ2WTNqUudAnjhlCrpE6ql
mQfNppeTmVvZrH4zutn+NwTaHAGpjSGv4/WRpZ1wZ3BRZ5mPUBZyLgq0YrIfQ5Fx
0s/MRZPzc1r3lKWrMR9sAQx4mN4z11xFEO529L0dFJjPF9MD8Gpd2feWzGyptlel
b+PqT+++fOa2oY0+NaMM7l/xcNHPOaMz0/2olk0i22hbKeVhvokPCqhFhzsuhKsm
q4Of/o+t6dI7sx5h0nPMm4gGSRhfq+z6BTRgCrqQG2FOLoVFgt6iIm/BnNffUr7V
DYd3zZmIwFOj/H3DKHoGik/xK3E82YA2ZulVOFRW/zj4ApjPa5OFbpIkd0pmzxzd
EcL479hSA9dFiyVmSxPtY5ze1P+BE9bMU1PScpRzw8MHFXxyKqW13Qv7LWw4sbk3
SciB7GACbQiVGzgkvXG6y85HOuvWNvC5GLSiyP9GlPB0V68tbxz4JVTRdw/Xn/XT
FNzRBM3cq8lBOAVt/PAX5+uFcv1S9wFE8YjaBfWCP1jdBil+c4e+0tdywT2oJmYB
BF/kEt1wmGwMmHunNEuQNzh1FtJY54hbUfiWi38mASE7xMtMhfj/C4SvapiDN837
gYaPfs8x3KZxbX7C3YAsFnJinlwAUss1fdKar8Q/YVs7H/nU4c4Ixxxz4f67fcVq
M2ITKentbCMCAwEAAaOCAk4wggJKMAwGA1UdEwQFMAMBAf8wDgYDVR0PAQH/BAQD
AgHGMB0GA1UdDgQWBBT6VQ2MNGZRQ0z357OnbJWveuaklzCBygYDVR0jBIHCMIG/
gBT6VQ2MNGZRQ0z357OnbJWveuakl6GBm6SBmDCBlTERMA8GA1UEChMIRnJlZSBU
U0ExEDAOBgNVBAsTB1Jvb3QgQ0ExGDAWBgNVBAMTD3d3dy5mcmVldHNhLm9yZzEi
MCAGCSqGSIb3DQEJARYTYnVzaWxlemFzQGdtYWlsLmNvbTESMBAGA1UEBxMJV3Vl
cnpidXJnMQ8wDQYDVQQIEwZCYXllcm4xCzAJBgNVBAYTAkRFggkAwemGFg2o6YAw
MwYDVR0fBCwwKjAooCagJIYiaHR0cDovL3d3dy5mcmVldHNhLm9yZy9yb290X2Nh
LmNybDCBzwYDVR0gBIHHMIHEMIHBBgorBgEEAYHyJAEBMIGyMDMGCCsGAQUFBwIB
FidodHRwOi8vd3d3LmZyZWV0c2Eub3JnL2ZyZWV0c2FfY3BzLmh0bWwwMgYIKwYB
BQUHAgEWJmh0dHA6Ly93d3cuZnJlZXRzYS5vcmcvZnJlZXRzYV9jcHMucGRmMEcG
CCsGAQUFBwICMDsaOUZyZWVUU0EgdHJ1c3RlZCB0aW1lc3RhbXBpbmcgU29mdHdh
cmUgYXMgYSBTZXJ2aWNlIChTYWFTKTA3BggrBgEFBQcBAQQrMCkwJwYIKwYBBQUH
MAGGG2h0dHA6Ly93d3cuZnJlZXRzYS5vcmc6MjU2MDANBgkqhkiG9w0BAQ0FAAOC
AgEAaK9+v5OFYu9M6ztYC+L69sw1omdyli89lZAfpWMMh9CRmJhM6KBqM/ipwoLt
nxyxGsbCPhcQjuTvzm+ylN6VwTMmIlVyVSLKYZcdSjt/eCUN+41K7sD7GVmxZBAF
ILnBDmTGJmLkrU0KuuIpj8lI/E6Z6NnmuP2+RAQSHsfBQi6sssnXMo4HOW5gtPO7
gDrUpVXID++1P4XndkoKn7Svw5n0zS9fv1hxBcYIHPPQUze2u30bAQt0n0iIyRLz
aWuhtpAtd7ffwEbASgzB7E+NGF4tpV37e8KiA2xiGSRqT5ndu28fgpOY87gD3ArZ
DctZvvTCfHdAS5kEO3gnGGeZEVLDmfEsv8TGJa3AljVa5E40IQDsUXpQLi8G+UC4
1DWZu8EVT4rnYaCw1VX7ShOR1PNCCvjb8S8tfdudd9zhU3gEB0rxdeTy1tVbNLXW
99y90xcwr1ZIDUwM/xQ/noO8FRhm0LoPC73Ef+J4ZBdrvWwauF3zJe33d4ibxEcb
8/pz5WzFkeixYM2nsHhqHsBKw7JPouKNXRnl5IAE1eFmqDyC7G/VT7OF669xM6hb
Ut5G21JE4cNK6NNucS+fzg1JPX0+3VhsYZjj7D5uljRvQXrJ8iHgr/M6j2oLHvTA
I2MLdq2qjZFDOCXsxBxJpbmLGBx9ow6ZerlUxzws2AWv2pk=
-----END CERTIFICATE-----`;

/** Stable identifier referenced by providers' `trustRootIds`. */
export const FREETSA_ROOT_ID = 'freetsa-root-ca';

const ROOTS: Readonly<Record<string, string>> = {
  [FREETSA_ROOT_ID]: FREETSA_ROOT_CA_PEM,
};

/**
 * Resolve trust-root ids to PEM strings. Unknown ids are skipped (the verifier
 * then fails closed with an untrusted chain rather than throwing).
 */
export function resolveTrustRoots(ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const pem = ROOTS[id];
    if (pem !== undefined) out.push(pem);
  }
  return out;
}

/**
 * Default mapping from a receipt's `provider_id` to the bundled trust-root ids
 * used to verify its token. Lets an offline verifier resolve trust anchors from
 * the chain alone (no provider config needed). Unknown providers map to no
 * roots, so verification fails closed.
 */
const PROVIDER_ROOT_IDS: Readonly<Record<string, readonly string[]>> = {
  freetsa: [FREETSA_ROOT_ID],
};

export function trustRootIdsForProvider(providerId: string): readonly string[] {
  return PROVIDER_ROOT_IDS[providerId] ?? [];
}
