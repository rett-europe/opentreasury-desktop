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
import {
  generateEd25519Keypair,
  publicKeyFromSecret,
  signEd25519,
  verifyEd25519,
} from '../crypto/signing.js';
import type {
  AuditAppendInput,
  AuditEntry,
  AuditLog,
  AuditSignature,
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
}

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

export class FileAuditLog implements AuditLog {
  private readonly deps: FileAuditLogDeps;
  private signingSecret: Uint8Array | null = null;
  private signingPublic: Uint8Array | null = null;
  private keyFingerprint: string | null = null;

  constructor(deps: FileAuditLogDeps) {
    this.deps = deps;
  }

  private async ensureSigningKey(): Promise<void> {
    if (this.signingSecret !== null) return;
    const existing = await this.deps.store.read(SIGNING_KEY_NAME);
    if (existing !== null) {
      const secret = openBlob(existing, this.deps.mk, 'audit-signing-key:v1', this.deps.datasetId);
      this.signingSecret = secret;
    } else {
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
    }
    this.signingPublic = publicKeyFromSecret(this.signingSecret);
    this.keyFingerprint = blake2b256Hex(this.signingPublic);
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

  async verifyChain(): Promise<AuditVerifyResult> {
    await this.ensureSigningKey();
    let entries: AuditEntry[];
    try {
      entries = await this.loadEntries();
    } catch {
      return { ok: false, reason: 'decrypt-failed' };
    }
    return this.verifyEntries(entries);
  }

  async append(input: AuditAppendInput): Promise<AuditEntry> {
    await this.ensureSigningKey();
    const entries = await this.loadEntries();

    // Fail closed: never append onto a corrupt chain.
    const verdict = this.verifyEntries(entries);
    if (!verdict.ok) {
      throw new Error(`audit chain verification failed: ${verdict.reason ?? 'unknown'}`);
    }

    const prev = entries.length > 0 ? entries[entries.length - 1]! : null;
    const unsigned: Omit<AuditEntry, 'signature'> = {
      seq: entries.length + 1,
      timestamp: this.deps.now().toISOString(),
      dataset_id: this.deps.datasetId,
      actor_device_id: this.deps.deviceId,
      actor_user_identity: this.deps.actorUserIdentity,
      action: input.action,
      result: input.result,
      target_ref: { type: 'export', id: input.targetId },
      before_hash: input.beforeHash ?? null,
      after_hash: input.afterHash,
      prev_entry_hash: prev === null ? null : canonicalHashHex(prev),
    };

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
