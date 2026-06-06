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
   * SPEC-028 — present only on `audit.anchor` / `audit.anchor.timestamped`
   * entries. Omitted (NOT null) for export entries so their canonical bytes —
   * and therefore their existing signatures and `prev_entry_hash` links — are
   * unchanged (`canonicalJson` drops `undefined` properties).
   */
  readonly payload?: AuditAnchorPayload;
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
  readonly action: 'audit.anchor' | 'audit.anchor.timestamped';
  readonly targetId: string; // ULID for the anchor operation
  readonly observedAt: string; // ISO 8601 UTC
  readonly eventLogRoot: string; // hex; mirrored into entry.after_hash
  readonly deviceFrontiers: readonly DeviceFrontier[];
}
