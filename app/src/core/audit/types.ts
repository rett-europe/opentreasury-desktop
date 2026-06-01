// SPEC-027 / crypto-spec §8 — Audit log types.
//
// A thin-but-real audit foundation scoped to export (v1). Entries are
// hash-chained (BLAKE2b-256 `prev_entry_hash`), Ed25519-signed, and persisted
// MK-encrypted. The entry shape mirrors crypto-spec §8.2 with the `result`
// field added for export start/outcome (OQ3 resolved: failures logged on-chain).

/**
 * Audit actions. The crypto-spec §8.2 enum lists the full set. Keep this union
 * in sync as new audited actions land.
 *
 * - `export.csv` / `export.xlsx` — SPEC-027 export start/outcome entries.
 * - `audit.anchor` — SPEC-028 WI-2: a signed per-device frontier snapshot of
 *   the encrypted event log folded into this audit chain (FR4/FR4a/FR5).
 * - `audit.anchor.timestamped` — an anchor additionally covered by an external
 *   RFC 3161 timestamp (WI-5 / #362). Action string reserved now (AC15); the
 *   TSA round-trip is implemented by a sibling WI.
 * - `audit.export` — export of the audit log itself (evidence package, WI-4).
 *   Reserved now; surfaced by a sibling WI.
 */
export type AuditAction =
  | 'export.csv'
  | 'export.xlsx'
  | 'audit.anchor'
  | 'audit.anchor.timestamped'
  | 'audit.export';

/**
 * Append-only lifecycle. `started` is written before the first plaintext byte
 * (FR18); a `succeeded`/`failed` completion entry follows with the same
 * `target_ref.id`. Signed entries are never mutated.
 */
export type AuditResult = 'started' | 'succeeded' | 'failed';

export interface AuditTargetRef {
  readonly type: 'export' | 'anchor';
  readonly id: string; // ULID for the export operation / anchor
}

/**
 * SPEC-028 §6.1 — a single device's append-only frontier within an anchor.
 *
 * The merged ULID timeline across devices is NOT append-only (a late peer event
 * inserts mid-stream), but each device's own `events-<deviceId>.ndjson` file IS
 * append-only. The anchor therefore records a per-device frontier vector so the
 * observed history is tamper-evident while remaining incrementally maintainable.
 *
 * `device_head_hash` is a domain-separated chained BLAKE2b-256 fold over the RAW
 * on-disk NDJSON line bytes (each complete line incl. its trailing `\n`) up to
 * `line_count`. Because it is computed over raw bytes, an anchored event file
 * MUST NOT be rewritten in place (re-anchor instead — see crypto-spec §8.2).
 */
export interface DeviceFrontier {
  readonly device_id: string;
  readonly file_name: string;
  /** Number of complete (newline-terminated) lines covered by this frontier. */
  readonly line_count: number;
  /** ULID `id` of the last covered line (= line at index `line_count - 1`). */
  readonly last_event_id: string;
  /** Hex chained BLAKE2b-256 fold over the first `line_count` raw lines. */
  readonly device_head_hash: string;
}

/**
 * SPEC-028 §6.1 — the SIGNED anchor payload. Carried on the `AuditEntry` and
 * therefore covered by the entry's Ed25519 signature. `event_log_root` is a
 * domain-separated BLAKE2b-256 over the canonical-JSON of the device frontiers
 * sorted by `device_id` (order-independent), and is mirrored into the entry's
 * `after_hash`. `audit_chain_prev_hash` is the `prev_entry_hash` of the entry
 * carrying this payload, captured inside the audit append critical section so a
 * verifier can bind the anchor to its position in the chain.
 */
export interface AuditAnchorPayload {
  readonly anchor_version: 1;
  readonly hash_alg: 'blake2b-256';
  readonly dataset_id: string;
  readonly observed_at: string; // ISO 8601 UTC
  readonly event_log_root: string; // hex
  readonly device_frontiers: readonly DeviceFrontier[];
  readonly audit_chain_prev_hash: string | null;
}

export interface AuditSignature {
  readonly alg: 'ed25519';
  readonly signing_device_id: string;
  /** Hex BLAKE2b-256 of the signing public key (provenance). */
  readonly key_fingerprint: string;
  /** Base64 signature over canonical-JSON of the entry with `signature` omitted. */
  readonly value: string;
}

/**
 * SPEC-028 WI-5 (#362) — the SIGNED timestamp-receipt payload. Carried on a
 * separate `audit.anchor.timestamped` entry that references the `audit.anchor`
 * it timestamps; the original anchor is NEVER mutated (FR13). The receipt binds
 * an external RFC 3161 trusted-timestamp token to the exact anchor entry.
 *
 * `message_imprint` is the digest the TSA actually signed: a STANDARD-OID
 * SHA-256 over the canonical-JSON of the FULL signed anchor entry. A verifier
 * recomputes `SHA-256(canonicalJson(anchorEntry))` and compares — binding the
 * timestamp to the anchor's `event_log_root` AND its position in the chain.
 * `anchor_entry_hash` (BLAKE2b-256 `canonicalHashHex` of the anchor entry) is a
 * convenient chain-join key. The trusted time is re-derived from the token at
 * verify time; `tsa_gen_time` is advisory only.
 */
export interface AuditTimestampPayload {
  readonly timestamp_version: 1;
  readonly provider_kind: 'rfc3161';
  readonly provider_id: string; // e.g. 'freetsa'
  readonly anchor_seq: number; // seq of the anchor entry this receipt covers
  readonly anchor_entry_hash: string; // hex BLAKE2b-256 canonicalHashHex(anchorEntry)
  readonly event_log_root: string; // hex; == the anchor entry's after_hash
  readonly imprint_alg: 'sha256'; // standard OID the TSA + verifier agree on
  readonly message_imprint: string; // hex SHA-256 over canonicalJson(anchorEntry)
  readonly tsa_nonce: string; // hex random nonce sent in the TimeStampReq
  readonly tsa_token: string; // base64 DER RFC 3161 TimeStampToken (CMS)
  readonly tsa_gen_time: string; // ISO 8601 UTC; advisory (re-derived on verify)
  readonly tsa_serial_number: string; // hex
  readonly tsa_policy_oid?: string;
}

export interface AuditEntry {
  readonly seq: number; // monotonic, starts at 1
  readonly timestamp: string; // ISO 8601 UTC
  readonly dataset_id: string;
  readonly actor_device_id: string;
  readonly actor_user_identity: string;
  readonly action: AuditAction;
  readonly result: AuditResult;
  readonly target_ref: AuditTargetRef;
  readonly before_hash: string | null;
  readonly after_hash: string | null;
  readonly prev_entry_hash: string | null; // null only for the genesis entry
  /**
   * SPEC-028 — present only on anchor / timestamp entries; omitted (NOT null)
   * for export entries so their canonical bytes — and therefore their existing
   * signatures and `prev_entry_hash` links — are unchanged (`canonicalJson`
   * drops `undefined` properties). Discriminated by `action`:
   *   - `audit.anchor`             → `AuditAnchorPayload` (frontier snapshot)
   *   - `audit.anchor.timestamped` → `AuditTimestampPayload` (TSA receipt)
   */
  readonly payload?: AuditAnchorPayload | AuditTimestampPayload;
  readonly signature: AuditSignature;
}

export interface AuditAppendInput {
  readonly action: AuditAction;
  readonly result: AuditResult;
  readonly targetId: string;
  readonly afterHash: string | null;
  readonly beforeHash?: string | null;
  /** Target type for the entry. Defaults to `'export'` for back-compat. */
  readonly targetType?: 'export' | 'anchor';
}

export interface AuditVerifyResult {
  readonly ok: boolean;
  /** Stable reason code when `ok` is false. */
  readonly reason?:
    | 'seq-nonmonotonic'
    | 'prev-hash-mismatch'
    | 'signature-invalid'
    | 'key-fingerprint-mismatch'
    | 'signing-key-missing'
    | 'decrypt-failed';
  /** seq of the first failing entry, when applicable. */
  readonly atSeq?: number;
}

export interface AuditLog {
  /**
   * Append a signed, hash-chained entry. Verifies the existing chain first and
   * THROWS (fail closed) if the chain is corrupt — callers must treat a throw
   * as "block the export".
   */
  append(input: AuditAppendInput): Promise<AuditEntry>;
  /**
   * SPEC-028 WI-2 — append a signed `audit.anchor` entry. The payload's
   * `audit_chain_prev_hash` is filled in atomically with the entry's
   * `prev_entry_hash` inside the append critical section, so the signed body
   * binds the anchor to its chain position. `after_hash` mirrors
   * `eventLogRoot`. Verifies the existing chain first and THROWS if corrupt.
   */
  appendAnchor(input: AuditAnchorAppendInput): Promise<AuditEntry>;
  /**
   * SPEC-028 WI-5 — append a signed `audit.anchor.timestamped` receipt entry
   * referencing the `audit.anchor` it covers. The original anchor is never
   * mutated. Idempotent: if a receipt for the same `{ anchorSeq,
   * anchorEntryHash }` already exists, the existing entry is returned without
   * signing a duplicate (checked inside the append critical section). Verifies
   * the existing chain first and THROWS if corrupt.
   */
  appendTimestamp(input: AuditTimestampAppendInput): Promise<AuditEntry>;
  /**
   * Verify the full chain (seq monotonicity, prev-hash links, signatures). When
   * `allowKeyCreation` is false (SPEC-028 WI-3 read-only verify-on-unlock), a
   * missing signing key is NOT created — verification of a populated chunk
   * without its key returns `reason: 'signing-key-missing'` instead.
   */
  verifyChain(opts?: { readonly allowKeyCreation?: boolean }): Promise<AuditVerifyResult>;
  /** Decrypt and return all entries in order (diagnostics/tests). */
  readAll(): Promise<readonly AuditEntry[]>;
}

/**
 * SPEC-028 WI-2 — input to `AuditLog.appendAnchor`. Everything except
 * `audit_chain_prev_hash` (which is captured inside the critical section).
 */
export interface AuditAnchorAppendInput {
  readonly action: 'audit.anchor';
  readonly targetId: string; // ULID for the anchor operation
  readonly observedAt: string; // ISO 8601 UTC
  readonly eventLogRoot: string; // hex; mirrored into entry.after_hash
  readonly deviceFrontiers: readonly DeviceFrontier[];
}

/**
 * SPEC-028 WI-5 — input to `AuditLog.appendTimestamp`. The resulting entry's
 * `after_hash` mirrors `messageImprint` (the digest the TSA signed), distinct
 * from an anchor entry whose `after_hash` mirrors `eventLogRoot`.
 */
export interface AuditTimestampAppendInput {
  readonly targetId: string; // ULID for the timestamp operation
  readonly providerId: string;
  readonly anchorSeq: number;
  readonly anchorEntryHash: string; // hex
  readonly eventLogRoot: string; // hex; == covered anchor entry's after_hash
  readonly imprintAlg: 'sha256';
  readonly messageImprint: string; // hex; mirrored into entry.after_hash
  readonly tsaNonce: string; // hex
  readonly tsaToken: string; // base64 DER
  readonly tsaGenTime: string; // ISO 8601 UTC (advisory)
  readonly tsaSerialNumber: string; // hex
  readonly tsaPolicyOid?: string;
}
