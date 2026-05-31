// SPEC-027 / crypto-spec §8 — Audit log types.
//
// A thin-but-real audit foundation scoped to export (v1). Entries are
// hash-chained (BLAKE2b-256 `prev_entry_hash`), Ed25519-signed, and persisted
// MK-encrypted. The entry shape mirrors crypto-spec §8.2 with the `result`
// field added for export start/outcome (OQ3 resolved: failures logged on-chain).

/**
 * Audit actions. v1 ships only the export pair; the crypto-spec §8.2 enum
 * lists the full future set. Keep this union in sync as new audited actions
 * land.
 */
export type AuditAction = 'export.csv' | 'export.xlsx';

/**
 * Append-only lifecycle. `started` is written before the first plaintext byte
 * (FR18); a `succeeded`/`failed` completion entry follows with the same
 * `target_ref.id`. Signed entries are never mutated.
 */
export type AuditResult = 'started' | 'succeeded' | 'failed';

export interface AuditTargetRef {
  readonly type: 'export';
  readonly id: string; // ULID for the export operation
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
  readonly signature: AuditSignature;
}

export interface AuditAppendInput {
  readonly action: AuditAction;
  readonly result: AuditResult;
  readonly targetId: string;
  readonly afterHash: string | null;
  readonly beforeHash?: string | null;
}

export interface AuditVerifyResult {
  readonly ok: boolean;
  /** Stable reason code when `ok` is false. */
  readonly reason?:
    | 'seq-nonmonotonic'
    | 'prev-hash-mismatch'
    | 'signature-invalid'
    | 'key-fingerprint-mismatch'
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
  /** Verify the full chain (seq monotonicity, prev-hash links, signatures). */
  verifyChain(): Promise<AuditVerifyResult>;
  /** Decrypt and return all entries in order (diagnostics/tests). */
  readAll(): Promise<readonly AuditEntry[]>;
}
