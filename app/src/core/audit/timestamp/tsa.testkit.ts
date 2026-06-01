// SPEC-028 WI-5 (#362) — TEST-ONLY harness that mints a hermetic RFC-3161 TSA.
//
// Builds, entirely in-process, a self-signed CA + a TSA leaf certificate (with a
// critical id-kp-timeStamping EKU) and assembles CMS `TimeStampToken`s over a
// caller-supplied message imprint. This lets the verifier be exercised against
// fully controlled good/bad tokens — no network, no fixtures — and DOUBLY
// validates the in-tree DER encoder (`der.ts`) against Node's own X.509/ASN.1
// parser (`crypto.X509Certificate`, which must accept every cert we emit).
//
// Excluded from the production build via tsconfig (`**/*.testkit.ts`).

import {
  createHash,
  generateKeyPairSync,
  sign,
  X509Certificate,
  type KeyObject,
} from 'node:crypto';

import {
  concat,
  encodeBoolean,
  encodeNull,
  encodeOctetString,
  encodeOid,
  encodeSequence,
  encodeTlv,
  encodeUintBig,
  TAG,
} from './der.js';
import { OID } from './oids.js';

const CN_OID = '2.5.4.3';
const BIT_STRING = 0x03;
const CTX0_CONSTRUCTED = 0xa0; // [0] constructed (EXPLICIT / IMPLICIT container)
const CTX3_CONSTRUCTED = 0xa3; // [3] constructed (X.509 extensions)

// --------------------------------------------------------------------------
// Low-level DER helpers (test-side encoders layered on der.ts)
// --------------------------------------------------------------------------

function encodeSet(...items: Uint8Array[]): Uint8Array {
  return encodeTlv(TAG.SET, concat(items));
}

function encodeUtf8(s: string): Uint8Array {
  return encodeTlv(TAG.UTF8_STRING, Buffer.from(s, 'utf8'));
}

function encodeGeneralizedTime(d: Date): Uint8Array {
  const pad = (n: number, l = 2): string => String(n).padStart(l, '0');
  const s =
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  return encodeTlv(TAG.GENERALIZED_TIME, Buffer.from(s, 'ascii'));
}

function encodeName(cn: string): Uint8Array {
  const atv = encodeSequence(encodeOid(CN_OID), encodeUtf8(cn));
  return encodeSequence(encodeSet(atv));
}

/** ECDSA-with-SHA256 AlgorithmIdentifier (no parameters). */
function ecdsaSha256AlgId(): Uint8Array {
  return encodeSequence(encodeOid(OID.ECDSA_WITH_SHA256));
}

/** SHA-256 AlgorithmIdentifier (with explicit NULL params). */
function sha256AlgId(): Uint8Array {
  return encodeSequence(encodeOid(OID.SHA256), encodeNull());
}

function encodeExtension(oid: string, critical: boolean, innerValue: Uint8Array): Uint8Array {
  const items: Uint8Array[] = [encodeOid(oid)];
  if (critical) items.push(encodeBoolean(true));
  items.push(encodeOctetString(innerValue));
  return encodeSequence(...items);
}

/** basicConstraints cA=TRUE (critical) — used for the CA root. */
export function extBasicConstraintsCa(): Uint8Array {
  return encodeExtension(OID.EXT_BASIC_CONSTRAINTS, true, encodeSequence(encodeBoolean(true)));
}

/**
 * extKeyUsage = id-kp-timeStamping (plus any `extraOids`). `critical` controls
 * the criticality flag. RFC 3161 mandates a TSA leaf carry ONLY the
 * timestamping EKU; `extraOids` exists so tests can prove the verifier rejects
 * broader-purpose certs.
 */
export function extTimeStampingEku(
  critical: boolean,
  extraOids: readonly string[] = [],
): Uint8Array {
  return encodeExtension(
    OID.EXT_EXTENDED_KEY_USAGE,
    critical,
    encodeSequence(encodeOid(OID.KP_TIME_STAMPING), ...extraOids.map((o) => encodeOid(o))),
  );
}

function sha256(data: Uint8Array): Buffer {
  return createHash('sha256').update(data).digest();
}

function flipMiddleByte(b: Uint8Array): Uint8Array {
  const m = Uint8Array.from(b);
  const i = Math.floor(m.length / 2);
  m[i] = (m[i]! ^ 0xff) & 0xff;
  return m;
}

// --------------------------------------------------------------------------
// Certificate minting
// --------------------------------------------------------------------------

export interface KeyPair {
  readonly publicKey: KeyObject;
  readonly privateKey: KeyObject;
}

export function makeEcKeyPair(): KeyPair {
  return generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
}

export interface IssueCertOptions {
  readonly subjectCN: string;
  readonly subjectKey: KeyObject; // public key of the subject
  readonly issuerCN: string;
  readonly issuerKey: KeyObject; // private key that signs the cert
  readonly serial: bigint;
  readonly notBefore: Date;
  readonly notAfter: Date;
  readonly extensions: readonly Uint8Array[];
}

export interface MintedCert {
  readonly der: Buffer;
  readonly pem: string;
  readonly x509: X509Certificate;
}

function derToPem(der: Buffer): string {
  const b64 = der
    .toString('base64')
    .replace(/(.{64})/g, '$1\n')
    .replace(/\n$/, '');
  return `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----`;
}

export function issueCert(opts: IssueCertOptions): MintedCert {
  const spki = opts.subjectKey.export({ type: 'spki', format: 'der' });
  const version = encodeTlv(CTX0_CONSTRUCTED, encodeUintBig(2n)); // [0] EXPLICIT v3
  const sigAlg = ecdsaSha256AlgId();
  const validity = encodeSequence(
    encodeGeneralizedTime(opts.notBefore),
    encodeGeneralizedTime(opts.notAfter),
  );
  const extensions = encodeTlv(CTX3_CONSTRUCTED, encodeSequence(...opts.extensions));
  const tbs = encodeSequence(
    version,
    encodeUintBig(opts.serial),
    sigAlg,
    encodeName(opts.issuerCN),
    validity,
    encodeName(opts.subjectCN),
    spki,
    extensions,
  );
  const signature = sign('sha256', tbs, opts.issuerKey);
  const certDer = encodeSequence(
    tbs,
    sigAlg,
    encodeTlv(BIT_STRING, concat([Uint8Array.of(0x00), signature])),
  );
  const der = Buffer.from(certDer);
  return { der, pem: derToPem(der), x509: new X509Certificate(der) };
}

export interface TestCa {
  readonly rootKey: KeyPair;
  readonly root: MintedCert;
  /** Issue a TSA leaf signed by this CA. */
  issueTsaLeaf(opts?: Partial<TsaLeafOptions>): { cert: MintedCert; key: KeyPair };
}

export interface TsaLeafOptions {
  readonly subjectCN: string;
  readonly serial: bigint;
  readonly notBefore: Date;
  readonly notAfter: Date;
  /** Include the timeStamping EKU at all. */
  readonly withEku: boolean;
  /** Mark the EKU critical (required by the verifier). */
  readonly ekuCritical: boolean;
  /** Extra EKU OIDs alongside timeStamping (RFC 3161 forbids these on a TSA). */
  readonly extraEkuOids: readonly string[];
}

const DEFAULT_NOT_BEFORE = new Date('2020-01-01T00:00:00Z');
const DEFAULT_NOT_AFTER = new Date('2035-01-01T00:00:00Z');

export function makeTestCa(rootCN = 'OpenTreasury Test Root CA'): TestCa {
  const rootKey = makeEcKeyPair();
  const root = issueCert({
    subjectCN: rootCN,
    subjectKey: rootKey.publicKey,
    issuerCN: rootCN,
    issuerKey: rootKey.privateKey,
    serial: 1n,
    notBefore: DEFAULT_NOT_BEFORE,
    notAfter: DEFAULT_NOT_AFTER,
    extensions: [extBasicConstraintsCa()],
  });

  return {
    rootKey,
    root,
    issueTsaLeaf(o = {}): { cert: MintedCert; key: KeyPair } {
      const key = makeEcKeyPair();
      const withEku = o.withEku ?? true;
      const ekuCritical = o.ekuCritical ?? true;
      const exts = withEku ? [extTimeStampingEku(ekuCritical, o.extraEkuOids ?? [])] : [];
      const cert = issueCert({
        subjectCN: o.subjectCN ?? 'OpenTreasury Test TSA',
        subjectKey: key.publicKey,
        issuerCN: rootCN,
        issuerKey: rootKey.privateKey,
        serial: o.serial ?? 0x1234n,
        notBefore: o.notBefore ?? DEFAULT_NOT_BEFORE,
        notAfter: o.notAfter ?? DEFAULT_NOT_AFTER,
        extensions: exts,
      });
      return { cert, key };
    },
  };
}

// --------------------------------------------------------------------------
// TimeStampToken (CMS SignedData) minting
// --------------------------------------------------------------------------

export interface BuildTokenOptions {
  /** The message-imprint digest the TSA "signs" (must match the verifier's). */
  readonly imprintHash: Uint8Array;
  readonly imprintAlgOid?: string; // default OID.SHA256
  readonly nonce: bigint;
  readonly serial?: bigint;
  readonly genTime: Date;
  readonly policyOid?: string;
  readonly signerCert: Buffer; // leaf DER
  readonly signerKey: KeyObject; // leaf private key
  readonly extraCerts?: readonly Buffer[]; // typically [root.der]

  // -------- corruption knobs (negative fixtures) --------
  /** Override the outer ContentInfo contentType OID. */
  readonly contentTypeOid?: string;
  /** Override the eContentType OID. */
  readonly eContentTypeOid?: string;
  /** Omit the message-digest signed attribute entirely. */
  readonly omitMessageDigest?: boolean;
  /** Put a wrong (random) value in the message-digest attribute. */
  readonly wrongMessageDigest?: boolean;
  /** Embed a mutated eContent so its digest no longer matches the attribute. */
  readonly tamperEContent?: boolean;
  /** Emit two SignerInfos. */
  readonly duplicateSignerInfo?: boolean;
  /** Flip a byte of the signature so it no longer verifies. */
  readonly corruptSignature?: boolean;
  /** Omit the signed attributes ([0] block) entirely. */
  readonly omitSignedAttrs?: boolean;
}

/** Build a DER CMS `TimeStampToken` (ContentInfo). */
export function buildTimeStampToken(opts: BuildTokenOptions): Buffer {
  const imprintAlgOid = opts.imprintAlgOid ?? OID.SHA256;
  const messageImprint = encodeSequence(
    encodeSequence(encodeOid(imprintAlgOid), encodeNull()),
    encodeOctetString(opts.imprintHash),
  );
  const tstItems: Uint8Array[] = [
    encodeUintBig(1n),
    encodeOid(opts.policyOid ?? '1.2.3.4.1'),
    messageImprint,
    encodeUintBig(opts.serial ?? 0x1234n),
    encodeGeneralizedTime(opts.genTime),
    encodeUintBig(opts.nonce),
  ];
  const tstInfoDer = encodeSequence(...tstItems);
  const eContent = opts.tamperEContent ? flipMiddleByte(tstInfoDer) : tstInfoDer;

  // --- signed attributes ---
  const ctAttr = encodeSequence(
    encodeOid(OID.ID_CONTENT_TYPE),
    encodeSet(encodeOid(OID.ID_CT_TST_INFO)),
  );
  const attrs: Uint8Array[] = [ctAttr];
  if (!opts.omitMessageDigest) {
    const digest = opts.wrongMessageDigest ? sha256(Buffer.from('wrong')) : sha256(tstInfoDer);
    attrs.push(
      encodeSequence(encodeOid(OID.ID_MESSAGE_DIGEST), encodeSet(encodeOctetString(digest))),
    );
  }
  const signedAttrsContent = concat(attrs);
  const signedAttrsForSign = encodeTlv(TAG.SET, signedAttrsContent); // 0x31 for signing
  const signedAttrsInToken = encodeTlv(CTX0_CONSTRUCTED, signedAttrsContent); // [0] IMPLICIT

  let signature = sign('sha256', signedAttrsForSign, opts.signerKey);
  if (opts.corruptSignature) signature = flipMiddleByte(signature);

  // --- SignerInfo ---
  const issuerAndSerial = encodeSequence(
    encodeName('OpenTreasury Test Root CA'),
    encodeUintBig(opts.serial ?? 0x1234n),
  );
  const siItems: Uint8Array[] = [encodeUintBig(1n), issuerAndSerial, sha256AlgId()];
  if (!opts.omitSignedAttrs) siItems.push(signedAttrsInToken);
  siItems.push(ecdsaSha256AlgId(), encodeOctetString(signature));
  const si = encodeSequence(...siItems);
  const signerInfos = opts.duplicateSignerInfo ? encodeSet(si, si) : encodeSet(si);

  // --- encapContentInfo ---
  const encap = encodeSequence(
    encodeOid(opts.eContentTypeOid ?? OID.ID_CT_TST_INFO),
    encodeTlv(CTX0_CONSTRUCTED, encodeOctetString(eContent)), // [0] EXPLICIT OCTET STRING
  );

  // --- certificates [0] IMPLICIT ---
  const certs = [opts.signerCert, ...(opts.extraCerts ?? [])];
  const certSet = encodeTlv(CTX0_CONSTRUCTED, concat(certs));

  const digestAlgorithms = encodeSet(sha256AlgId());
  const signedData = encodeSequence(
    encodeUintBig(3n),
    digestAlgorithms,
    encap,
    certSet,
    signerInfos,
  );
  const contentInfo = encodeSequence(
    encodeOid(opts.contentTypeOid ?? OID.ID_SIGNED_DATA),
    encodeTlv(CTX0_CONSTRUCTED, signedData), // [0] EXPLICIT
  );
  return Buffer.from(contentInfo);
}

/** Wrap a token in a granted `TimeStampResp`. */
export function buildTimeStampResp(tokenDer: Uint8Array, status = 0): Buffer {
  const statusInfo = encodeSequence(encodeUintBig(BigInt(status)));
  return Buffer.from(encodeSequence(statusInfo, tokenDer));
}

/** Build a `TimeStampResp` carrying only a non-granted status (no token). */
export function buildRejectedResp(status = 2): Buffer {
  const statusInfo = encodeSequence(encodeUintBig(BigInt(status)));
  return Buffer.from(encodeSequence(statusInfo));
}

// --------------------------------------------------------------------------
// One-shot convenience: a trusted CA + leaf + good token over an imprint
// --------------------------------------------------------------------------

export interface TrustedTokenResult {
  readonly ca: TestCa;
  readonly leaf: MintedCert;
  readonly tokenDer: Buffer;
  readonly rootPem: string;
  readonly genTime: Date;
  readonly nonce: bigint;
  readonly serial: bigint;
}

export interface MakeTrustedTokenOptions {
  readonly imprintHash: Uint8Array;
  readonly nonce: bigint;
  readonly genTime?: Date;
  readonly serial?: bigint;
  readonly ca?: TestCa;
  readonly leafOptions?: Partial<TsaLeafOptions>;
  readonly tokenOverrides?: Partial<BuildTokenOptions>;
}

export function makeTrustedToken(o: MakeTrustedTokenOptions): TrustedTokenResult {
  const ca = o.ca ?? makeTestCa();
  const { cert: leaf, key } = ca.issueTsaLeaf(o.leafOptions ?? {});
  const genTime = o.genTime ?? new Date('2026-01-01T00:00:00Z');
  const serial = o.serial ?? 0x2233n;
  const tokenDer = buildTimeStampToken({
    imprintHash: o.imprintHash,
    nonce: o.nonce,
    genTime,
    serial,
    signerCert: leaf.der,
    signerKey: key.privateKey,
    extraCerts: [ca.root.der],
    ...(o.tokenOverrides ?? {}),
  });
  return { ca, leaf, tokenDer, rootPem: ca.root.pem, genTime, nonce: o.nonce, serial };
}
