// SPEC-028 WI-5 (#362) — the message imprint that the TSA signs.
//
// The imprint is a STANDARD-OID SHA-256 over the canonical JSON of the FULL
// signed anchor entry (including its Ed25519 signature). Using the standard
// digest means an independent verifier can recompute it deterministically, and
// binding over the whole entry ties the timestamp to the anchor's
// `event_log_root` AND its position in the audit chain.

import { createHash } from 'node:crypto';

import { canonicalJson } from '../../crypto/hash.js';
import type { AuditEntry } from '../types.js';

/** SHA-256 over `canonicalJson(anchorEntry)` as a Buffer. */
export function anchorMessageImprint(anchorEntry: AuditEntry): Buffer {
  return createHash('sha256').update(canonicalJson(anchorEntry), 'utf8').digest();
}

/** Same imprint as lowercase hex. */
export function anchorMessageImprintHex(anchorEntry: AuditEntry): string {
  return anchorMessageImprint(anchorEntry).toString('hex');
}
