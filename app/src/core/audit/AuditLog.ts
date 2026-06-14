// SPEC-027 / crypto-spec §8 — File-backed audit log.
//
// Persists a hash-chained, Ed25519-signed, MK-encrypted append-only log. v1
// scope: export start/outcome entries. The chain is verified before every
// append and before every export (fail closed). The device signing key is
// generated lazily on first write and stored MK-sealed.
//
// Storage is abstracted behind `AuditBlobStore` so integration tests can run
// fully in memory; `createFsAuditStore` provides the production fs adapter
// with atomic temp→rename writes.
//
// On-disk blob layout (per name): nonce(24) || XChaCha20-Poly1305(ciphertext||tag).

import { promises as fs } from 'node:fs';
import * as nodePath from 'node:path';
import { decrypt, encrypt, randomBytes, wipe } from '../crypto/primitives.js';
import { blake2b256Hex, canonicalHashHex, canonicalJson } from '../crypto/hash.js';
import { anchorMessageImprintHex } from './timestamp/imprint.js';
import {
  generateEd25519Keypair,
  publicKeyFromSecret,
  signEd25519,
  verifyEd25519,
} from '../crypto/signing.js';
import type {
  AuditAnchorAppendInput,
  AuditAppendInput,
  AuditEntry,
  AuditLog,
  AuditSignature,
  AuditTimestampAppendInput,
  AuditTimestampPayload,
  AuditVerifyResult,
} from './types.js';

const CHUNK_NAME = 'current.chunk.v1';
const SIGNING_KEY_NAME = 'signing-key.v1';
const NONCE_SIZE = 24;

export interface AuditBlobStore {
  /** Returns the blob bytes, or null if the blob does not exist. */
  read(name: string): Promise<Uint8Array | null>;
  /** Atomically write the blob (temp→rename for fs-backed stores). */
  write(name: string, data: Uint8Array): Promise<void>;
}

export interface FileAuditLogDeps {
  readonly store: AuditBlobStore;
  /** Unlocked 256-bit master key (main-process only). */
  readonly mk: Uint8Array;
  readonly datasetId: string;
  readonly deviceId: string;
  readonly actorUserIdentity: string;
  readonly now: () => Date;
  /**
   * Optional process-global serialization key (rubber-duck). Multiple
   * `FileAuditLog` instances target the SAME on-disk chain — the export handler
   * and the SPEC-028 anchor service each build their own instance per call.
   * A per-instance mutex does not serialize them against each other, so two
   * appends could load the same tip and clobber one another. When `lockKey` is
   * set (production wires it to the resolved audit directory path), all appends
   * sharing that key run through one shared promise chain. Omitted in unit tests
   * (each test uses an isolated in-memory store), preserving per-instance mutex.
   */
  readonly lockKey?: string;
}

/**
 * Process-global append chains keyed by `lockKey` (audit directory path). One
 * entry per distinct audit file, so all producers (export + anchor) serialize.
 */
const sharedWriteChains = new Map<string, Promise<unknown>>();

function aad(context: string, datasetId: string): Uint8Array {
  return Buffer.from(`${context}:${datasetId}`, 'utf8');
}

function sealBlob(
  plaintext: Uint8Array,
  mk: Uint8Array,
  context: string,
  datasetId: string,
): Uint8Array {
  const nonce = randomBytes(NONCE_SIZE);
  const cipher = encrypt(plaintext, mk, nonce, aad(context, datasetId));
  return Buffer.concat([Buffer.from(nonce), Buffer.from(cipher)]);
}

function openBlob(
  blob: Uint8Array,
  mk: Uint8Array,
  context: string,
  datasetId: string,
): Uint8Array {
  if (blob.length < NONCE_SIZE) {
    throw new Error('audit blob truncated');
  }
  const nonce = blob.subarray(0, NONCE_SIZE);
  const cipher = blob.subarray(NONCE_SIZE);
  return decrypt(cipher, mk, nonce, aad(context, datasetId));
}

/** The entry object that is signed — the full entry minus its `signature`. */
function signingPayload(entry: Omit<AuditEntry, 'signature'>): string {
  return canonicalJson(entry);
}

/**
 * Strict anchor/timestamp/export invariants (rubber-duck #7 / WI-5 #3,#9).
 * Enforced inside the append critical section before signing so a malformed
 * entry can never be persisted. The `payload` shape is discriminated by
 * `action`: `audit.anchor` carries a frontier `AuditAnchorPayload`;
 * `audit.anchor.timestamped` carries an `AuditTimestampPayload`.
 */
function assertEntryInvariants(entry: Omit<AuditEntry, 'signature'>): void {
  if (entry.action === 'audit.anchor') {
    if (entry.target_ref.type !== 'anchor') {
      throw new Error('anchor entry must have target_ref.type "anchor"');
    }
    if (entry.result !== 'succeeded') {
      throw new Error('anchor entry must have result "succeeded"');
    }
    const p = entry.payload;
    if (p === undefined) {
      throw new Error('anchor entry must carry a payload');
    }
    if (!('anchor_version' in p)) {
      throw new Error('anchor entry payload must be a frontier payload');
    }
    if (p.anchor_version !== 1 || p.hash_alg !== 'blake2b-256') {
      throw new Error('anchor payload has unexpected version/hash_alg');
    }
    if (p.dataset_id !== entry.dataset_id) {
      throw new Error('anchor payload dataset_id must match the entry');
    }
    // NORMATIVE: an anchor entry's after_hash IS the event_log_root.
    if (entry.after_hash !== p.event_log_root) {
      throw new Error('anchor after_hash must equal payload.event_log_root');
    }
    if (p.audit_chain_prev_hash !== entry.prev_entry_hash) {
      throw new Error('anchor payload audit_chain_prev_hash must equal prev_entry_hash');
    }
    if (entry.before_hash !== null) {
      throw new Error('anchor entry before_hash must be null');
    }
  } else if (entry.action === 'audit.anchor.timestamped') {
    if (entry.target_ref.type !== 'anchor') {
      throw new Error('timestamp entry must have target_ref.type "anchor"');
    }
    if (entry.result !== 'succeeded') {
      throw new Error('timestamp entry must have result "succeeded"');
    }
    if (entry.before_hash !== null) {
      throw new Error('timestamp entry before_hash must be null');
    }
    const p = entry.payload;
    if (p === undefined) {
      throw new Error('timestamp entry must carry a payload');
    }
    if (!('timestamp_version' in p)) {
      throw new Error('timestamp entry payload must be a timestamp payload');
    }
    if (p.timestamp_version !== 1 || p.provider_kind !== 'rfc3161') {
      throw new Error('timestamp payload has unexpected version/provider_kind');
    }
    if (p.imprint_alg !== 'sha256') {
      throw new Error('timestamp payload imprint_alg must be "sha256"');
    }
    // NORMATIVE: a timestamp entry's after_hash IS the message_imprint (the
    // digest the TSA signed), NOT the event_log_root.
    if (entry.after_hash !== p.message_imprint) {
      throw new Error('timestamp after_hash must equal payload.message_imprint');
    }
    // The receipt must reference an EARLIER anchor entry in the same chain.
    if (!Number.isInteger(p.anchor_seq) || p.anchor_seq < 1 || p.anchor_seq >= entry.seq) {
      throw new Error('timestamp payload anchor_seq must reference an earlier entry');
    }
  } else {
    if (entry.target_ref.type !== 'export' && entry.target_ref.type !== 'report') {
      throw new Error('non-anchor entry must have target_ref.type "export" or "report"');
    }
    if (entry.payload !== undefined) {
      throw new Error('non-anchor entry must not carry a payload');
    }
  }
}

/**
 * WI-5 #3 — locate an existing `audit.anchor.timestamped` receipt for the given
 * anchor, so `appendTimestamp` is idempotent and never double-appends.
 */
function findExistingReceipt(
  entries: readonly AuditEntry[],
  anchorSeq: number,
  anchorEntryHash: string,
): AuditEntry | null {
  for (const e of entries) {
    if (e.action !== 'audit.anchor.timestamped') continue;
    const p = e.payload;
    if (p === undefined || !('timestamp_version' in p)) continue;
    if (p.anchor_seq === anchorSeq && p.anchor_entry_hash === anchorEntryHash) {
      return e;
    }
  }
  return null;
}

export class FileAuditLog implements AuditLog {
  private readonly deps: FileAuditLogDeps;
  private signingSecret: Uint8Array | null = null;
  private signingPublic: Uint8Array | null = null;
  private keyFingerprint: string | null = null;
  /**
   * Single-writer mutex (rubber-duck #1). The anchor service is a SECOND
   * producer on this chain alongside the export handler; without serialization
   * two appends can load the same tip, both compute the same `prev_entry_hash`,
   * and the second persist clobbers the first. Every append runs the whole
   * load→verify→compute-prev→sign→persist sequence under this promise chain.
   */
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(deps: FileAuditLogDeps) {
    this.deps = deps;
  }

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    // When a process-global lockKey is set, serialize across ALL FileAuditLog
    // instances targeting the same chain (export + anchor); otherwise fall back
    // to this instance's own chain (isolated tests).
    const key = this.deps.lockKey;
    const prev =
      key !== undefined ? (sharedWriteChains.get(key) ?? Promise.resolve()) : this.writeChain;
    const run = prev.then(fn, fn);
    // Keep the chain alive regardless of this run's outcome.
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    if (key !== undefined) {
      sharedWriteChains.set(key, tail);
    } else {
      this.writeChain = tail;
    }
    return run;
  }

  /**
   * Load the MK-sealed signing key from the store WITHOUT creating one. Returns
   * true if a key was loaded (or was already in memory), false if the blob is
   * absent. SPEC-028 WI-3: the standalone chain-verify-on-unlock path uses this
   * so a read-only verification never writes trust material — generating a key
   * during verify would poison the synced folder and yield a false-positive
   * `key-fingerprint-mismatch` when the chunk has synced but the key has not.
   */
  private async loadSigningKeyIfPresent(): Promise<boolean> {
    if (this.signingSecret !== null) return true;
    const existing = await this.deps.store.read(SIGNING_KEY_NAME);
    if (existing === null) return false;
    this.signingSecret = openBlob(
      existing,
      this.deps.mk,
      'audit-signing-key:v1',
      this.deps.datasetId,
    );
    this.signingPublic = publicKeyFromSecret(this.signingSecret);
    this.keyFingerprint = blake2b256Hex(this.signingPublic);
    return true;
  }

  /** Generate a fresh device signing key and persist it MK-sealed. */
  private async generateAndPersistSigningKey(): Promise<void> {
    const kp = generateEd25519Keypair();
    const sealed = sealBlob(
      kp.secretKey,
      this.deps.mk,
      'audit-signing-key:v1',
      this.deps.datasetId,
    );
    await this.deps.store.write(SIGNING_KEY_NAME, sealed);
    wipe(kp.secretKey);
    // Re-read so the persisted copy is authoritative.
    const stored = await this.deps.store.read(SIGNING_KEY_NAME);
    if (stored === null) throw new Error('audit signing key persist failed');
    this.signingSecret = openBlob(
      stored,
      this.deps.mk,
      'audit-signing-key:v1',
      this.deps.datasetId,
    );
    this.signingPublic = publicKeyFromSecret(this.signingSecret);
    this.keyFingerprint = blake2b256Hex(this.signingPublic);
  }

  private async ensureSigningKey(): Promise<void> {
    if (this.signingSecret !== null) return;
    const loaded = await this.loadSigningKeyIfPresent();
    if (!loaded) await this.generateAndPersistSigningKey();
  }

  private async loadEntries(): Promise<AuditEntry[]> {
    const blob = await this.deps.store.read(CHUNK_NAME);
    if (blob === null) return [];
    const plain = openBlob(blob, this.deps.mk, 'audit-chunk:v1', this.deps.datasetId);
    const text = Buffer.from(plain).toString('utf8');
    const lines = text.split('\n').filter((l) => l.length > 0);
    return lines.map((l) => JSON.parse(l) as AuditEntry);
  }

  private async persistEntries(entries: readonly AuditEntry[]): Promise<void> {
    const text = entries.map((e) => JSON.stringify(e)).join('\n');
    const sealed = sealBlob(
      Buffer.from(text, 'utf8'),
      this.deps.mk,
      'audit-chunk:v1',
      this.deps.datasetId,
    );
    await this.deps.store.write(CHUNK_NAME, sealed);
  }

  private verifyEntries(entries: readonly AuditEntry[]): AuditVerifyResult {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      if (entry.seq !== i + 1) {
        return { ok: false, reason: 'seq-nonmonotonic', atSeq: entry.seq };
      }
      const expectedPrev = i === 0 ? null : canonicalHashHex(entries[i - 1]!);
      if (entry.prev_entry_hash !== expectedPrev) {
        return { ok: false, reason: 'prev-hash-mismatch', atSeq: entry.seq };
      }
      if (entry.signature.key_fingerprint !== this.keyFingerprint) {
        return { ok: false, reason: 'key-fingerprint-mismatch', atSeq: entry.seq };
      }
      const { signature, ...rest } = entry;
      const payload = Buffer.from(signingPayload(rest), 'utf8');
      const sig = Buffer.from(signature.value, 'base64');
      if (!verifyEd25519(sig, payload, this.signingPublic!)) {
        return { ok: false, reason: 'signature-invalid', atSeq: entry.seq };
      }
    }
    return { ok: true };
  }

  async verifyChain(opts?: { readonly allowKeyCreation?: boolean }): Promise<AuditVerifyResult> {
    const allowKeyCreation = opts?.allowKeyCreation ?? true;
    if (allowKeyCreation) {
      await this.ensureSigningKey();
    } else {
      await this.loadSigningKeyIfPresent();
    }
    let entries: AuditEntry[];
    try {
      entries = await this.loadEntries();
    } catch {
      return { ok: false, reason: 'decrypt-failed' };
    }
    // Read-only path (allowKeyCreation:false) with no signing key on disk: a
    // fresh log with no entries is fine (nothing to verify); a populated chunk
    // without its signing key means we cannot verify the signatures — surface a
    // distinct reason so callers can treat it as "sync-incomplete," not tamper.
    if (this.signingPublic === null) {
      if (entries.length === 0) return { ok: true };
      return { ok: false, reason: 'signing-key-missing' };
    }
    return this.verifyEntries(entries);
  }

  async append(input: AuditAppendInput): Promise<AuditEntry> {
    if (input.action === 'audit.anchor' || input.action === 'audit.anchor.timestamped') {
      throw new Error('audit anchors must be appended via appendAnchor()');
    }
    const targetType = input.targetType ?? 'export';
    return this.appendCore((ctx) => ({
      seq: ctx.seq,
      timestamp: this.deps.now().toISOString(),
      dataset_id: this.deps.datasetId,
      actor_device_id: this.deps.deviceId,
      actor_user_identity: this.deps.actorUserIdentity,
      action: input.action,
      result: input.result,
      target_ref: { type: targetType, id: input.targetId },
      before_hash: input.beforeHash ?? null,
      after_hash: input.afterHash,
      prev_entry_hash: ctx.prevHash,
    }));
  }

  async appendAnchor(input: AuditAnchorAppendInput): Promise<AuditEntry> {
    return this.appendCore((ctx) => {
      const entry: Omit<AuditEntry, 'signature'> = {
        seq: ctx.seq,
        timestamp: this.deps.now().toISOString(),
        dataset_id: this.deps.datasetId,
        actor_device_id: this.deps.deviceId,
        actor_user_identity: this.deps.actorUserIdentity,
        action: input.action,
        result: 'succeeded',
        target_ref: { type: 'anchor', id: input.targetId },
        before_hash: null,
        after_hash: input.eventLogRoot,
        prev_entry_hash: ctx.prevHash,
        payload: {
          anchor_version: 1,
          hash_alg: 'blake2b-256',
          dataset_id: this.deps.datasetId,
          observed_at: input.observedAt,
          event_log_root: input.eventLogRoot,
          device_frontiers: input.deviceFrontiers,
          // Captured atomically inside the critical section (rubber-duck #2).
          audit_chain_prev_hash: ctx.prevHash,
        },
      };
      return entry;
    });
  }

  async appendTimestamp(input: AuditTimestampAppendInput): Promise<AuditEntry> {
    return this.appendCore(
      (ctx) => {
        // Defence in depth (rubber-duck #2): re-validate the receipt→anchor
        // binding INSIDE the write lock before signing, so a buggy/internal
        // caller can never persist a signed-but-invalid receipt that would make
        // `findPendingAnchors` treat the anchor as covered (and never retried)
        // while `verifyTimestampReceipt` would later reject it.
        const anchor = ctx.entries[input.anchorSeq - 1];
        if (anchor === undefined || anchor.seq !== input.anchorSeq) {
          throw new Error(`timestamp references unknown anchor_seq ${input.anchorSeq}`);
        }
        if (anchor.action !== 'audit.anchor') {
          throw new Error('timestamp anchor_seq does not reference an audit.anchor entry');
        }
        if (canonicalHashHex(anchor) !== input.anchorEntryHash) {
          throw new Error('timestamp anchor_entry_hash does not match the referenced anchor');
        }
        if (anchor.after_hash !== input.eventLogRoot) {
          throw new Error('timestamp event_log_root does not match the anchor after_hash');
        }
        if (anchorMessageImprintHex(anchor) !== input.messageImprint) {
          throw new Error('timestamp message_imprint does not match the recomputed anchor imprint');
        }

        const payload: AuditTimestampPayload = {
          timestamp_version: 1,
          provider_kind: 'rfc3161',
          provider_id: input.providerId,
          anchor_seq: input.anchorSeq,
          anchor_entry_hash: input.anchorEntryHash,
          event_log_root: input.eventLogRoot,
          imprint_alg: input.imprintAlg,
          message_imprint: input.messageImprint,
          tsa_nonce: input.tsaNonce,
          tsa_token: input.tsaToken,
          tsa_gen_time: input.tsaGenTime,
          tsa_serial_number: input.tsaSerialNumber,
          // Only set when present: `exactOptionalPropertyTypes` forbids an
          // explicit `undefined`, and canonicalJson would omit it anyway.
          ...(input.tsaPolicyOid === undefined ? {} : { tsa_policy_oid: input.tsaPolicyOid }),
        };
        const entry: Omit<AuditEntry, 'signature'> = {
          seq: ctx.seq,
          timestamp: this.deps.now().toISOString(),
          dataset_id: this.deps.datasetId,
          actor_device_id: this.deps.deviceId,
          actor_user_identity: this.deps.actorUserIdentity,
          action: 'audit.anchor.timestamped',
          result: 'succeeded',
          target_ref: { type: 'anchor', id: input.targetId },
          before_hash: null,
          // The chained entry's after_hash mirrors the digest the TSA signed.
          after_hash: input.messageImprint,
          prev_entry_hash: ctx.prevHash,
          payload,
        };
        return entry;
      },
      // WI-5 #3 — idempotent: never sign a second receipt for the same anchor.
      (entries) => findExistingReceipt(entries, input.anchorSeq, input.anchorEntryHash),
    );
  }

  /**
   * Locked append core (rubber-duck #1/#2): loads + verifies the chain,
   * optionally short-circuits to an already-persisted entry (WI-5 #3 duplicate
   * receipt guard), builds the unsigned entry via `make` (which receives the seq
   * + prev-hash computed inside the lock), validates invariants (rubber-duck
   * #7), signs, and persists — all under the single-writer mutex.
   */
  private appendCore(
    make: (ctx: {
      seq: number;
      prevHash: string | null;
      entries: readonly AuditEntry[];
    }) => Omit<AuditEntry, 'signature'>,
    shortCircuit?: (entries: readonly AuditEntry[]) => AuditEntry | null,
  ): Promise<AuditEntry> {
    return this.runExclusive(async () => {
      await this.ensureSigningKey();
      const entries = await this.loadEntries();

      // Fail closed: never append onto a corrupt chain.
      const verdict = this.verifyEntries(entries);
      if (!verdict.ok) {
        throw new Error(`audit chain verification failed: ${verdict.reason ?? 'unknown'}`);
      }

      if (shortCircuit !== undefined) {
        const existing = shortCircuit(entries);
        if (existing !== null) return existing;
      }

      const prev = entries.length > 0 ? entries[entries.length - 1]! : null;
      const unsigned = make({
        seq: entries.length + 1,
        prevHash: prev === null ? null : canonicalHashHex(prev),
        entries,
      });

      assertEntryInvariants(unsigned);

      const sigBytes = signEd25519(
        Buffer.from(signingPayload(unsigned), 'utf8'),
        this.signingSecret!,
      );
      const signature: AuditSignature = {
        alg: 'ed25519',
        signing_device_id: this.deps.deviceId,
        key_fingerprint: this.keyFingerprint!,
        value: Buffer.from(sigBytes).toString('base64'),
      };
      const entry: AuditEntry = { ...unsigned, signature };

      await this.persistEntries([...entries, entry]);
      return entry;
    });
  }

  async readAll(): Promise<readonly AuditEntry[]> {
    return this.loadEntries();
  }
}

/**
 * Production fs-backed blob store: writes under `dir`, atomically via a sibling
 * `.partial` temp file + rename. Creates `dir` on first write.
 */
export function createFsAuditStore(dir: string): AuditBlobStore {
  return {
    async read(name: string): Promise<Uint8Array | null> {
      try {
        return await fs.readFile(nodePath.join(dir, name));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
    async write(name: string, data: Uint8Array): Promise<void> {
      await fs.mkdir(dir, { recursive: true });
      const finalPath = nodePath.join(dir, name);
      const tmpPath = `${finalPath}.${process.pid}.${Date.now()}.partial`;
      await fs.writeFile(tmpPath, data, { mode: 0o600 });
      try {
        await fs.rename(tmpPath, finalPath);
      } catch (err) {
        await fs.rm(tmpPath, { force: true });
        throw err;
      }
    },
  };
}
