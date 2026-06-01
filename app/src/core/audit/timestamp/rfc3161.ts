// SPEC-028 WI-5 (#362) — RFC-3161 timestamp request builder + token verifier.
//
// This module is pure (bytes in / structured result out). It performs the
// mechanical ASN.1 (via ./der) and delegates ALL cryptography to Node's
// built-in `crypto` (`X509Certificate`, `crypto.verify`, `crypto.createHash`).
//
// Responsibilities:
//   - buildTimeStampRequest(): DER `TimeStampReq` (with nonce, certReq=true).
//   - parseTimeStampResp(): pull PKIStatus + the embedded TimeStampToken.
//   - verifyTimeStampToken(): full RFC-3161 / RFC-5652 verification profile —
//       * eContentType === id-ct-TSTInfo
//       * exactly one SignerInfo
//       * signedAttrs carries content-type (=== id-ct-TSTInfo) and
//         message-digest (=== hash(eContent))
//       * TSA signature verifies over DER(signedAttrs) re-tagged as SET OF
//       * signer leaf chains to a *bundled* trust anchor via real issuer
//         signature checks, with CA basicConstraints on issuers
//       * signer leaf carries the critical id-kp-timeStamping EKU
//       * every cert in the path is valid at `genTime` (NOT `now`)
//       * messageImprint (alg + bytes) === the submitted imprint
//       * nonce === the submitted nonce (when one was sent)
//     Returns the trusted `genTime` on success or a typed failure reason.
//
// Revocation (v1 policy): NO live CRL/OCSP. Trust is bounded by the bundled
// anchors + validity-at-genTime. This is documented in the verification report.

import { createHash, timingSafeEqual, verify as cryptoVerify, X509Certificate } from 'node:crypto';

import {
  children,
  content,
  DerError,
  encodeNull,
  encodeOctetString,
  encodeOid,
  encodeSequence,
  encodeTlv,
  encodeUintBig,
  expectSequence,
  expectSet,
  parseTlv,
  readBoolean,
  readGeneralizedTime,
  readOid,
  readUintBig,
  TAG,
  tlv,
  type DerNode,
} from './der.js';
import { digestOidToNodeHash, OID, signatureOidToAlgo } from './oids.js';

// --------------------------------------------------------------------------
// Request building
// --------------------------------------------------------------------------

export interface BuildRequestOptions {
  /** Digest algorithm OID for the message imprint (default SHA-256). */
  readonly hashAlgOid?: string;
  /** The message-imprint digest bytes. */
  readonly hash: Uint8Array;
  /** Random nonce bytes (recommended; replay/substitution defence). */
  readonly nonce: Uint8Array;
  /** Ask the TSA to return its certificate chain (default true). */
  readonly certReq?: boolean;
  /** Optional requested TSA policy OID. */
  readonly reqPolicyOid?: string;
}

/**
 * Build a DER-encoded RFC-3161 `TimeStampReq`.
 *
 *   TimeStampReq ::= SEQUENCE {
 *     version        INTEGER { v1(1) },
 *     messageImprint MessageImprint,
 *     reqPolicy      TSAPolicyId OPTIONAL,
 *     nonce          INTEGER OPTIONAL,
 *     certReq        BOOLEAN DEFAULT FALSE,
 *     extensions [0] IMPLICIT Extensions OPTIONAL }
 */
export function buildTimeStampRequest(opts: BuildRequestOptions): Uint8Array {
  const hashAlgOid = opts.hashAlgOid ?? OID.SHA256;
  const certReq = opts.certReq ?? true;

  const algId = encodeSequence(encodeOid(hashAlgOid), encodeNull());
  const messageImprint = encodeSequence(algId, encodeOctetString(opts.hash));

  const items: Uint8Array[] = [encodeUintBig(1n), messageImprint];
  if (opts.reqPolicyOid !== undefined) items.push(encodeOid(opts.reqPolicyOid));
  // nonce as a positive INTEGER (ensure non-empty / non-negative)
  items.push(encodeUintBig(bytesToBigUint(opts.nonce)));
  if (certReq) items.push(encodeTlv(TAG.BOOLEAN, Uint8Array.of(0xff)));

  return encodeSequence(...items);
}

function bytesToBigUint(b: Uint8Array): bigint {
  let v = 0n;
  for (const byte of b) v = (v << 8n) | BigInt(byte);
  // Guarantee a positive nonce even if the random bytes were all zero.
  return v === 0n ? 1n : v;
}

// --------------------------------------------------------------------------
// Response parsing
// --------------------------------------------------------------------------

export interface ParsedResp {
  /** PKIStatus integer (0 granted, 1 grantedWithMods, ...). */
  readonly status: number;
  /** True when status is granted (0) or grantedWithMods (1). */
  readonly granted: boolean;
  /** The embedded TimeStampToken (CMS ContentInfo) DER, when present. */
  readonly tokenDer: Uint8Array | null;
  /** Optional human-readable status text (best effort). */
  readonly statusText: string | null;
}

/**
 * Parse a DER `TimeStampResp` into status + embedded token bytes.
 *
 *   TimeStampResp ::= SEQUENCE { status PKIStatusInfo, timeStampToken TimeStampToken OPTIONAL }
 *   PKIStatusInfo ::= SEQUENCE { status PKIStatus, statusString PKIFreeText OPTIONAL, failInfo BIT STRING OPTIONAL }
 */
export function parseTimeStampResp(der: Uint8Array): ParsedResp {
  const root = parseTlv(der, 0);
  const top = expectSequence(root);
  if (top.length < 1) throw new DerError('TimeStampResp: empty');
  const statusInfo = expectSequence(top[0]!);
  const status = Number(readUintBig(statusInfo[0]!));

  let statusText: string | null = null;
  if (statusInfo.length >= 2 && statusInfo[1]!.tag === TAG.SEQUENCE) {
    try {
      const strs = children(statusInfo[1]!);
      statusText = strs.map((s) => Buffer.from(content(s)).toString('utf8')).join('; ');
    } catch {
      statusText = null;
    }
  }

  let tokenDer: Uint8Array | null = null;
  if (top.length >= 2) {
    // timeStampToken is a CMS ContentInfo (SEQUENCE). Keep its full TLV bytes.
    tokenDer = tlv(top[1]!).slice();
  }

  return { status, granted: status === 0 || status === 1, tokenDer, statusText };
}

// --------------------------------------------------------------------------
// Token verification
// --------------------------------------------------------------------------

export interface TstInfo {
  readonly version: number;
  readonly policyOid: string;
  readonly imprintAlgOid: string;
  readonly imprintHash: Uint8Array;
  readonly serialNumber: bigint;
  readonly genTime: Date;
  readonly nonce: bigint | null;
}

export type VerifyFailureReason =
  | 'malformed-token'
  | 'wrong-content-type'
  | 'wrong-econtent-type'
  | 'multiple-signers'
  | 'missing-signed-attrs'
  | 'bad-content-type-attr'
  | 'bad-message-digest-attr'
  | 'unsupported-signature-alg'
  | 'signature-invalid'
  | 'signer-cert-not-found'
  | 'untrusted-chain'
  | 'cert-expired-at-gentime'
  | 'missing-timestamping-eku'
  | 'imprint-mismatch'
  | 'nonce-mismatch'
  | 'gentime-in-future';

export interface VerifyOptions {
  readonly tokenDer: Uint8Array;
  readonly expectedImprintAlgOid: string;
  readonly expectedImprintHash: Uint8Array;
  readonly expectedNonce?: Uint8Array;
  /** Bundled trust-anchor certificates (PEM). */
  readonly trustRootsPem: readonly string[];
  /** Wall-clock reference for the future-skew check. */
  readonly now: Date;
  /** Allowed clock skew for `genTime` vs `now` (default 24h). */
  readonly maxFutureSkewMs?: number;
}

export type VerifyResult =
  | {
      readonly ok: true;
      readonly tstInfo: TstInfo;
      readonly genTime: Date;
      readonly serialHex: string;
      readonly tsaSubject: string;
    }
  | { readonly ok: false; readonly reason: VerifyFailureReason; readonly detail?: string };

const DEFAULT_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;
const MAX_CHAIN_DEPTH = 8;

export function verifyTimeStampToken(opts: VerifyOptions): VerifyResult {
  try {
    return verifyInner(opts);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: 'malformed-token', detail };
  }
}

function verifyInner(opts: VerifyOptions): VerifyResult {
  const fail = (reason: VerifyFailureReason, detail?: string): VerifyResult => ({
    ok: false,
    reason,
    ...(detail === undefined ? {} : { detail }),
  });

  // ContentInfo ::= SEQUENCE { contentType OID, content [0] EXPLICIT SignedData }
  const ci = expectSequence(parseTlv(opts.tokenDer, 0));
  if (readOid(ci[0]!) !== OID.ID_SIGNED_DATA) return fail('wrong-content-type');
  const ciContent = ci[1]!; // [0] EXPLICIT
  if (!(ciContent.cls === 2 && ciContent.tagNumber === 0))
    return fail('malformed-token', 'no content');
  const signedData = expectSequence(children(ciContent)[0]!);

  // SignedData ::= SEQUENCE { version, digestAlgorithms SET, encapContentInfo,
  //   certificates [0] IMPLICIT OPTIONAL, crls [1] IMPLICIT OPTIONAL, signerInfos SET }
  // version @0, digestAlgorithms @1 (SET), encapContentInfo @2 (SEQUENCE).
  const encap = expectSequence(signedData[2]!);
  if (readOid(encap[0]!) !== OID.ID_CT_TST_INFO) return fail('wrong-econtent-type');
  // eContent [0] EXPLICIT OCTET STRING
  const eContentCtx = encap[1];
  if (eContentCtx === undefined || !(eContentCtx.cls === 2 && eContentCtx.tagNumber === 0)) {
    return fail('malformed-token', 'no eContent');
  }
  const eContentOctet = children(eContentCtx)[0]!;
  if (eContentOctet.tag !== TAG.OCTET_STRING)
    return fail('malformed-token', 'eContent not OCTET STRING');
  const tstInfoDer = content(eContentOctet).slice();

  // Collect optional certificates [0] IMPLICIT and the final signerInfos SET.
  let certSet: DerNode | null = null;
  let signerInfos: DerNode | null = null;
  for (let i = 3; i < signedData.length; i++) {
    const n = signedData[i]!;
    if (n.cls === 2 && n.tagNumber === 0 && n.constructed)
      certSet = n; // [0] certificates
    else if (n.tag === TAG.SET) signerInfos = n; // signerInfos
  }
  if (signerInfos === null) return fail('malformed-token', 'no signerInfos');

  const signerInfoNodes = expectSet(signerInfos);
  if (signerInfoNodes.length !== 1) return fail('multiple-signers');
  const si = expectSequence(signerInfoNodes[0]!);

  // SignerInfo: version@0, sid@1, digestAlgorithm@2, [signedAttrs [0]]@?, sigAlg, signature
  const digestAlg = expectSequence(si[2]!);
  const digestHash = digestOidToNodeHash(readOid(digestAlg[0]!));
  if (digestHash === null) return fail('unsupported-signature-alg', 'digest');

  let idx = 3;
  let signedAttrsNode: DerNode | null = null;
  if (si[idx] !== undefined && si[idx]!.cls === 2 && si[idx]!.tagNumber === 0) {
    signedAttrsNode = si[idx]!;
    idx += 1;
  }
  if (signedAttrsNode === null) return fail('missing-signed-attrs');
  const sigAlg = expectSequence(si[idx]!);
  idx += 1;
  const signatureNode = si[idx]!;
  if (signatureNode === undefined || signatureNode.tag !== TAG.OCTET_STRING) {
    return fail('malformed-token', 'no signature');
  }
  const signatureBytes = content(signatureNode).slice();

  const algo = signatureOidToAlgo(readOid(sigAlg[0]!));
  if (algo === null) return fail('unsupported-signature-alg', readOid(sigAlg[0]!));

  // --- signed attributes -------------------------------------------------
  const attrs = parseAttributes(signedAttrsNode);
  const contentTypeAttr = attrs.get(OID.ID_CONTENT_TYPE);
  if (contentTypeAttr === undefined) return fail('bad-content-type-attr', 'missing');
  if (readOid(parseTlv(contentTypeAttr, 0)) !== OID.ID_CT_TST_INFO) {
    return fail('bad-content-type-attr', 'mismatch');
  }
  const messageDigestAttr = attrs.get(OID.ID_MESSAGE_DIGEST);
  if (messageDigestAttr === undefined) return fail('bad-message-digest-attr', 'missing');
  const mdNode = parseTlv(messageDigestAttr, 0);
  if (mdNode.tag !== TAG.OCTET_STRING) return fail('bad-message-digest-attr', 'not OCTET STRING');
  const expectedEContentDigest = createHash(digestHash).update(tstInfoDer).digest();
  if (!safeEqual(content(mdNode), expectedEContentDigest)) {
    return fail('bad-message-digest-attr', 'value mismatch');
  }

  // --- TSA signature over DER(signedAttrs) re-tagged as SET OF -----------
  // signedAttrs is stored as [0] IMPLICIT; for signature input it must be
  // re-encoded as an explicit SET OF (tag 0x31) with identical content.
  const signedAttrsForVerify = retagToSet(signedAttrsNode);

  // Identify the signer cert: the token cert whose public key verifies the
  // signature over signedAttrsForVerify (authoritative — no fragile DN match).
  const tokenCerts = certSet === null ? [] : parseCertificates(certSet);
  if (tokenCerts.length === 0) return fail('signer-cert-not-found', 'no certs in token');

  let signerCert: X509Certificate | null = null;
  for (const cert of tokenCerts) {
    if (verifySignature(algo, cert.publicKey, signedAttrsForVerify, signatureBytes)) {
      signerCert = cert;
      break;
    }
  }
  if (signerCert === null) return fail('signature-invalid');

  // --- parse TSTInfo -----------------------------------------------------
  const tst = parseTstInfo(tstInfoDer);

  // --- future-skew check on genTime -------------------------------------
  const skew = opts.maxFutureSkewMs ?? DEFAULT_FUTURE_SKEW_MS;
  if (tst.genTime.getTime() > opts.now.getTime() + skew) return fail('gentime-in-future');

  // --- imprint + nonce binding ------------------------------------------
  if (tst.imprintAlgOid !== opts.expectedImprintAlgOid) {
    return fail('imprint-mismatch', 'alg');
  }
  if (!safeEqual(tst.imprintHash, opts.expectedImprintHash)) {
    return fail('imprint-mismatch', 'hash');
  }
  if (opts.expectedNonce !== undefined) {
    if (tst.nonce === null) return fail('nonce-mismatch', 'absent');
    if (tst.nonce !== bytesToBigUint(opts.expectedNonce)) return fail('nonce-mismatch');
  }

  // --- signer cert: critical timeStamping EKU ---------------------------
  const eku = getExtendedKeyUsage(signerCert.raw);
  if (eku === null || !eku.critical || !eku.oids.includes(OID.KP_TIME_STAMPING)) {
    return fail('missing-timestamping-eku');
  }

  // --- chain to a bundled trust anchor, valid at genTime ----------------
  const anchors = opts.trustRootsPem.map((pem) => new X509Certificate(pem));
  const chainResult = buildAndVerifyChain(signerCert, tokenCerts, anchors, tst.genTime);
  if (!chainResult.ok) return fail(chainResult.reason, chainResult.detail);

  return {
    ok: true,
    tstInfo: tst,
    genTime: tst.genTime,
    serialHex: tst.serialNumber.toString(16),
    tsaSubject: signerCert.subject,
  };
}

// --------------------------------------------------------------------------
// TSTInfo
// --------------------------------------------------------------------------

function parseTstInfo(der: Uint8Array): TstInfo {
  // TSTInfo ::= SEQUENCE { version INTEGER, policy OID, messageImprint,
  //   serialNumber INTEGER, genTime GeneralizedTime, accuracy OPTIONAL,
  //   ordering BOOLEAN DEFAULT FALSE, nonce INTEGER OPTIONAL, tsa [0] OPTIONAL,
  //   extensions [1] IMPLICIT OPTIONAL }
  const seq = expectSequence(parseTlv(der, 0));
  const version = Number(readUintBig(seq[0]!));
  const policyOid = readOid(seq[1]!);
  const imprint = expectSequence(seq[2]!);
  const imprintAlg = expectSequence(imprint[0]!);
  const imprintAlgOid = readOid(imprintAlg[0]!);
  const imprintHashNode = imprint[1]!;
  if (imprintHashNode.tag !== TAG.OCTET_STRING)
    throw new DerError('TSTInfo imprint not OCTET STRING');
  const imprintHash = content(imprintHashNode).slice();
  const serialNumber = readUintBig(seq[3]!);
  const genTime = readGeneralizedTime(seq[4]!);

  // Optional fields after genTime: scan for the first INTEGER (nonce). accuracy
  // is a SEQUENCE, ordering a BOOLEAN, tsa a [0] tag, extensions a [1] tag.
  let nonce: bigint | null = null;
  for (let i = 5; i < seq.length; i++) {
    if (seq[i]!.tag === TAG.INTEGER) {
      nonce = readUintBig(seq[i]!);
      break;
    }
  }

  return { version, policyOid, imprintAlgOid, imprintHash, serialNumber, genTime, nonce };
}

// --------------------------------------------------------------------------
// CMS helpers
// --------------------------------------------------------------------------

/** Parse a SignedAttributes node into a map: attrType OID → first value TLV. */
function parseAttributes(signedAttrsNode: DerNode): Map<string, Uint8Array> {
  const map = new Map<string, Uint8Array>();
  for (const attr of children(signedAttrsNode)) {
    const parts = expectSequence(attr);
    const oid = readOid(parts[0]!);
    const valueSet = expectSet(parts[1]!);
    if (valueSet.length >= 1 && !map.has(oid)) {
      map.set(oid, tlv(valueSet[0]!).slice());
    }
  }
  return map;
}

/** Re-encode an implicit [0] signedAttrs node as an explicit SET OF (0x31). */
function retagToSet(signedAttrsNode: DerNode): Uint8Array {
  const full = tlv(signedAttrsNode).slice();
  full[0] = TAG.SET; // 0xA0 -> 0x31 (content + length unchanged)
  return full;
}

/** Parse the certificates [0] IMPLICIT set; keep X.509 Certificate SEQUENCEs. */
function parseCertificates(certSet: DerNode): X509Certificate[] {
  const out: X509Certificate[] = [];
  for (const node of children(certSet)) {
    if (node.tag === TAG.SEQUENCE) {
      try {
        out.push(new X509Certificate(Buffer.from(tlv(node))));
      } catch {
        // Skip attribute certs / unparseable entries.
      }
    }
  }
  return out;
}

function verifySignature(
  algo: { family: 'rsa' | 'ec'; hash: 'sha256' | 'sha384' | 'sha512' },
  publicKey: import('node:crypto').KeyObject,
  data: Uint8Array,
  signature: Uint8Array,
): boolean {
  try {
    return cryptoVerify(algo.hash, data, publicKey, signature);
  } catch {
    return false;
  }
}

// --------------------------------------------------------------------------
// X.509 extension parsing (EKU)
// --------------------------------------------------------------------------

interface Eku {
  readonly critical: boolean;
  readonly oids: string[];
}

/** Extract the ExtendedKeyUsage extension from a certificate DER, if present. */
function getExtendedKeyUsage(certDer: Buffer): Eku | null {
  const ext = findExtension(certDer, OID.EXT_EXTENDED_KEY_USAGE);
  if (ext === null) return null;
  const seq = expectSequence(parseTlv(ext.value, 0));
  const oids = seq.map((n) => readOid(n));
  return { critical: ext.critical, oids };
}

interface RawExtension {
  readonly critical: boolean;
  readonly value: Uint8Array; // inner extnValue OCTET STRING contents
}

/** Walk a Certificate DER to find an extension by OID. */
function findExtension(certDer: Buffer, oid: string): RawExtension | null {
  // Certificate ::= SEQUENCE { tbsCertificate SEQUENCE, sigAlg, sigValue }
  const cert = expectSequence(parseTlv(certDer, 0));
  const tbs = expectSequence(cert[0]!);
  // Find the [3] EXPLICIT extensions wrapper.
  let extsWrapper: DerNode | null = null;
  for (const node of tbs) {
    if (node.cls === 2 && node.tagNumber === 3) {
      extsWrapper = node;
      break;
    }
  }
  if (extsWrapper === null) return null;
  const extsSeq = expectSequence(children(extsWrapper)[0]!);
  for (const extNode of extsSeq) {
    const parts = expectSequence(extNode);
    const extOid = readOid(parts[0]!);
    if (extOid !== oid) continue;
    let critical = false;
    let valueIdx = 1;
    if (parts[1]!.tag === TAG.BOOLEAN) {
      critical = readBoolean(parts[1]!);
      valueIdx = 2;
    }
    const valueOctet = parts[valueIdx]!;
    if (valueOctet.tag !== TAG.OCTET_STRING) throw new DerError('extnValue not OCTET STRING');
    return { critical, value: content(valueOctet).slice() };
  }
  return null;
}

// --------------------------------------------------------------------------
// Certificate chain verification
// --------------------------------------------------------------------------

type ChainResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'untrusted-chain' | 'cert-expired-at-gentime';
      readonly detail?: string;
    };

function validAt(cert: X509Certificate, at: Date): boolean {
  const from = new Date(cert.validFrom);
  const to = new Date(cert.validTo);
  const t = at.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

function sameCert(a: X509Certificate, b: X509Certificate): boolean {
  return a.raw.equals(b.raw);
}

/**
 * Build a path from `leaf` to a bundled trust anchor. Every issuer step is
 * verified by a real signature check (`leaf.verify(issuer.publicKey)`) and a
 * name check (`leaf.checkIssued(issuer)`); issuers must be CAs; every cert in
 * the path must be valid at `at` (genTime).
 */
function buildAndVerifyChain(
  leaf: X509Certificate,
  intermediates: readonly X509Certificate[],
  anchors: readonly X509Certificate[],
  at: Date,
): ChainResult {
  if (!validAt(leaf, at)) return { ok: false, reason: 'cert-expired-at-gentime', detail: 'leaf' };

  let current = leaf;
  const path: X509Certificate[] = [leaf];

  for (let depth = 0; depth < MAX_CHAIN_DEPTH; depth++) {
    // Is `current` directly issued by a trust anchor?
    const anchor = anchors.find((a) => issued(current, a));
    if (anchor !== undefined) {
      if (!validAt(anchor, at))
        return { ok: false, reason: 'cert-expired-at-gentime', detail: 'anchor' };
      return { ok: true };
    }
    // Otherwise step up through an intermediate CA from the token.
    const issuer = intermediates.find(
      (c) =>
        !sameCert(c, current) && !path.some((p) => sameCert(p, c)) && c.ca && issued(current, c),
    );
    if (issuer === undefined) return { ok: false, reason: 'untrusted-chain' };
    if (!validAt(issuer, at))
      return { ok: false, reason: 'cert-expired-at-gentime', detail: 'intermediate' };
    path.push(issuer);
    current = issuer;
  }
  return { ok: false, reason: 'untrusted-chain', detail: 'chain too long' };
}

/** True iff `subject` was issued by `issuer` (name match + signature check). */
function issued(subject: X509Certificate, issuer: X509Certificate): boolean {
  try {
    return subject.checkIssued(issuer) && subject.verify(issuer.publicKey);
  } catch {
    return false;
  }
}

// --------------------------------------------------------------------------
// utilities
// --------------------------------------------------------------------------

function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export { bytesToBigUint as __bytesToBigUintForTest };
