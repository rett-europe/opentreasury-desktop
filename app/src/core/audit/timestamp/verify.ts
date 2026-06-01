// SPEC-028 WI-5 (#362) — pure verification of an `audit.anchor.timestamped`
// receipt against the `audit.anchor` it covers.
//
// This is the verifier a third party (or a future evidence-bundle checker)
// runs. It does NOT re-check the audit chain's own Ed25519 signatures /
// prev-hash links — `AuditLog.verifyChain()` owns that, and a mutated receipt
// entry fails there. Here we check the *binding* between the receipt, the
// anchor, and the external TSA token.
//
// What a passing result proves: the anchored `event_log_root` existed no later
// than the returned `trustedTime` (the token's genTime). What it does NOT
// prove: that the key-holder did not fabricate a fresh consistent history going
// forward, nor any per-device identity. (SPEC-028 §8.1.)

import { canonicalHashHex } from '../../crypto/hash.js';
import type { AuditEntry, AuditTimestampPayload } from '../types.js';
import { anchorMessageImprint } from './imprint.js';
import { OID } from './oids.js';
import { verifyTimeStampToken, type VerifyFailureReason } from './rfc3161.js';
import { resolveTrustRoots, trustRootIdsForProvider } from './roots.js';

export type ReceiptFailureReason =
  | 'anchor-not-found' // no anchor entry at receipt.anchor_seq (caller-supplied)
  | 'anchor-action-mismatch' // referenced entry is not an audit.anchor
  | 'anchor-hash-mismatch' // canonicalHashHex(anchor) != anchor_entry_hash
  | 'event-root-mismatch' // anchor.after_hash != receipt.event_log_root
  | 'imprint-recompute-mismatch' // SHA-256(canonicalJson(anchor)) != message_imprint
  | 'no-trust-roots' // provider/roots not recognised → fail closed
  | 'unsupported-imprint-alg'
  | 'malformed-receipt' // base64/hex fields unparseable
  | VerifyFailureReason; // propagated token-level failures

export interface VerifyReceiptInput {
  readonly receipt: AuditTimestampPayload;
  /** The anchor entry referenced by `receipt.anchor_seq` (located by the caller). */
  readonly anchorEntry: AuditEntry;
  /** Wall-clock reference for the genTime future-skew check. */
  readonly now: Date;
  /**
   * Trust-anchor PEMs. Defaults to the bundle mapped from `receipt.provider_id`
   * so an offline verifier needs nothing but the chain.
   */
  readonly trustRootsPem?: readonly string[];
  readonly maxFutureSkewMs?: number;
}

export type VerifyReceiptResult =
  | {
      readonly ok: true;
      /** Trusted time re-derived from the token (NOT the advisory tsa_gen_time). */
      readonly trustedTime: Date;
      readonly tsaSubject: string;
      readonly serialHex: string;
    }
  | { readonly ok: false; readonly reason: ReceiptFailureReason; readonly detail?: string };

const IMPRINT_ALG_OID: Readonly<Record<string, string>> = {
  sha256: OID.SHA256,
};

/** Verify a timestamp receipt's binding to its anchor and its TSA token. */
export function verifyTimestampReceipt(input: VerifyReceiptInput): VerifyReceiptResult {
  const { receipt, anchorEntry, now } = input;

  // 1. The referenced entry must be the anchor it claims to cover.
  if (anchorEntry.action !== 'audit.anchor') {
    return { ok: false, reason: 'anchor-action-mismatch' };
  }
  if (anchorEntry.seq !== receipt.anchor_seq) {
    return {
      ok: false,
      reason: 'anchor-not-found',
      detail: `seq ${anchorEntry.seq} != ${receipt.anchor_seq}`,
    };
  }

  // 2. Join key: the receipt references THIS exact anchor entry's bytes.
  if (canonicalHashHex(anchorEntry) !== receipt.anchor_entry_hash) {
    return { ok: false, reason: 'anchor-hash-mismatch' };
  }

  // 3. Redundant event-root bind.
  if (anchorEntry.after_hash !== receipt.event_log_root) {
    return { ok: false, reason: 'event-root-mismatch' };
  }

  // 4. Recompute the imprint the TSA signed.
  const imprint = anchorMessageImprint(anchorEntry);
  if (imprint.toString('hex') !== receipt.message_imprint) {
    return { ok: false, reason: 'imprint-recompute-mismatch' };
  }

  // 5. Decode token + nonce.
  const imprintAlgOid = IMPRINT_ALG_OID[receipt.imprint_alg];
  if (imprintAlgOid === undefined) {
    return { ok: false, reason: 'unsupported-imprint-alg', detail: receipt.imprint_alg };
  }
  let tokenDer: Uint8Array;
  let nonce: Uint8Array;
  try {
    tokenDer = Buffer.from(receipt.tsa_token, 'base64');
    nonce = Buffer.from(receipt.tsa_nonce, 'hex');
    if (tokenDer.length === 0)
      return { ok: false, reason: 'malformed-receipt', detail: 'empty token' };
  } catch (err) {
    return {
      ok: false,
      reason: 'malformed-receipt',
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  // 6. Resolve trust roots (default: from provider id).
  const rootsPem =
    input.trustRootsPem ?? resolveTrustRoots(trustRootIdsForProvider(receipt.provider_id));
  if (rootsPem.length === 0) {
    return { ok: false, reason: 'no-trust-roots', detail: receipt.provider_id };
  }

  // 7. Full RFC-3161 / CMS token verification.
  const tokenResult = verifyTimeStampToken({
    tokenDer,
    expectedImprintAlgOid: imprintAlgOid,
    expectedImprintHash: imprint,
    expectedNonce: nonce,
    trustRootsPem: rootsPem,
    now,
    ...(input.maxFutureSkewMs === undefined ? {} : { maxFutureSkewMs: input.maxFutureSkewMs }),
  });
  if (!tokenResult.ok) {
    return {
      ok: false,
      reason: tokenResult.reason,
      ...(tokenResult.detail === undefined ? {} : { detail: tokenResult.detail }),
    };
  }

  return {
    ok: true,
    trustedTime: tokenResult.genTime,
    tsaSubject: tokenResult.tsaSubject,
    serialHex: tokenResult.serialHex,
  };
}
