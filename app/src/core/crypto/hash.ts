// SPEC-027 / crypto-spec §8 — BLAKE2b-256 + deterministic canonical JSON.
//
// Used by the audit log (entry hashing, `prev_entry_hash`, signature payload)
// and by the export `after_hash` provenance. Pure: no Electron, no fs.

import sodium from 'sodium-native';

const HASH_BYTES = 32; // BLAKE2b-256

/**
 * BLAKE2b-256 over `input`, returned as a fresh 32-byte buffer.
 */
export function blake2b256(input: Uint8Array): Uint8Array {
  const out = Buffer.allocUnsafe(HASH_BYTES);
  sodium.crypto_generichash(out, input.length > 0 ? input : Buffer.alloc(0));
  return out;
}

/** BLAKE2b-256 over a UTF-8 string, returned as lowercase hex. */
export function blake2b256HexUtf8(input: string): string {
  return Buffer.from(blake2b256(Buffer.from(input, 'utf8'))).toString('hex');
}

/** BLAKE2b-256 over raw bytes, returned as lowercase hex. */
export function blake2b256Hex(input: Uint8Array): string {
  return Buffer.from(blake2b256(input)).toString('hex');
}

/**
 * Deterministic, canonical JSON serialization.
 *
 * Rules (must stay stable forever — hashes/signatures depend on it):
 *   - Object keys sorted ascending by UTF-16 code unit (JS default sort).
 *   - No insignificant whitespace.
 *   - Arrays preserve their given order.
 *   - `undefined` object properties are omitted; `undefined` array elements
 *     and top-level `undefined` serialize as `null` (matches JSON.stringify
 *     array behaviour and avoids ambiguity).
 *   - Numbers must be finite; non-finite numbers throw (no `NaN`/`Infinity`).
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';

  const t = typeof value;
  if (t === 'string') return JSON.stringify(value);
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') {
    if (!Number.isFinite(value as number)) {
      throw new Error('canonicalJson: non-finite number');
    }
    return JSON.stringify(value);
  }
  if (t === 'bigint') {
    throw new Error('canonicalJson: bigint is not serializable');
  }
  if (t === 'undefined') return 'null';

  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
  }

  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    const body = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',');
    return `{${body}}`;
  }

  throw new Error(`canonicalJson: unsupported type ${t}`);
}

/** BLAKE2b-256 hex of the canonical-JSON serialization of `value`. */
export function canonicalHashHex(value: unknown): string {
  return blake2b256HexUtf8(canonicalJson(value));
}
