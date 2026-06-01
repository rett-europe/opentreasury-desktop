// SPEC-028 WI-5 (#362) — Object identifiers referenced by the RFC-3161 / CMS
// timestamp codec. Kept in one place so the parser and verifier agree.

export const OID = {
  // CMS / PKCS#7
  ID_SIGNED_DATA: '1.2.840.113549.1.7.2', // id-signedData (ContentInfo type)
  ID_CT_TST_INFO: '1.2.840.113549.1.9.16.1.4', // id-ct-TSTInfo (eContentType)
  // CMS signed attributes
  ID_CONTENT_TYPE: '1.2.840.113549.1.9.3', // id-contentType attribute
  ID_MESSAGE_DIGEST: '1.2.840.113549.1.9.4', // id-messageDigest attribute
  // Digest algorithms
  SHA256: '2.16.840.1.101.3.4.2.1',
  SHA384: '2.16.840.1.101.3.4.2.2',
  SHA512: '2.16.840.1.101.3.4.2.3',
  // Signature algorithms (RSA PKCS#1 v1.5)
  SHA256_WITH_RSA: '1.2.840.113549.1.1.11',
  SHA384_WITH_RSA: '1.2.840.113549.1.1.12',
  SHA512_WITH_RSA: '1.2.840.113549.1.1.13',
  RSA_ENCRYPTION: '1.2.840.113549.1.1.1', // generic rsaEncryption (digest from signedAttrs)
  RSASSA_PSS: '1.2.840.113549.1.1.10',
  // Signature algorithms (ECDSA)
  ECDSA_WITH_SHA256: '1.2.840.10045.4.3.2',
  ECDSA_WITH_SHA384: '1.2.840.10045.4.3.3',
  ECDSA_WITH_SHA512: '1.2.840.10045.4.3.4',
  // X.509 extensions
  EXT_KEY_USAGE: '2.5.29.15', // keyUsage
  EXT_EXTENDED_KEY_USAGE: '2.5.29.37', // extKeyUsage
  EXT_BASIC_CONSTRAINTS: '2.5.29.19', // basicConstraints
  KP_TIME_STAMPING: '1.3.6.1.5.5.7.3.8', // id-kp-timeStamping (critical EKU)
} as const;

/** Map a digest-algorithm OID to a Node `crypto` hash name. */
export function digestOidToNodeHash(oid: string): 'sha256' | 'sha384' | 'sha512' | null {
  switch (oid) {
    case OID.SHA256:
      return 'sha256';
    case OID.SHA384:
      return 'sha384';
    case OID.SHA512:
      return 'sha512';
    default:
      return null;
  }
}

export interface SignatureAlgo {
  readonly family: 'rsa' | 'ec';
  readonly hash: 'sha256' | 'sha384' | 'sha512';
}

/**
 * Map a signatureAlgorithm OID to a family + hash. The hash for RSA/ECDSA
 * "withSHAxxx" OIDs is implied by the OID itself.
 */
export function signatureOidToAlgo(oid: string): SignatureAlgo | null {
  switch (oid) {
    case OID.SHA256_WITH_RSA:
      return { family: 'rsa', hash: 'sha256' };
    case OID.SHA384_WITH_RSA:
      return { family: 'rsa', hash: 'sha384' };
    case OID.SHA512_WITH_RSA:
      return { family: 'rsa', hash: 'sha512' };
    case OID.ECDSA_WITH_SHA256:
      return { family: 'ec', hash: 'sha256' };
    case OID.ECDSA_WITH_SHA384:
      return { family: 'ec', hash: 'sha384' };
    case OID.ECDSA_WITH_SHA512:
      return { family: 'ec', hash: 'sha512' };
    default:
      return null;
  }
}
