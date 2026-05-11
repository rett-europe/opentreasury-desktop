/**
 * Master Key generation and wrapping.
 *
 * Switch review notes: The MK is the root secret — all event encryption keys
 * derive from it. Wrapping uses the same AEAD primitive as event encryption
 * (XChaCha20-Poly1305), no separate KDF. Wrapping keys are either from
 * safeStorage (OS keychain) or Argon2id (recovery path).
 */

import { randomBytes, encrypt, decrypt } from './primitives.js';
import { generateNonce } from './nonce.js';

const MK_SIZE = 32; // 256 bits

export interface KeyWrap {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
}

/**
 * Generate a fresh Master Key.
 *
 * @returns 256-bit (32-byte) random key from CSPRNG
 */
export function generateMasterKey(): Uint8Array {
  return randomBytes(MK_SIZE);
}

/**
 * Wrap a Master Key under a wrapping key (AEAD encryption).
 *
 * @param mk - Master Key to wrap (32 bytes)
 * @param wrappingKey - Key to encrypt under (32 bytes, from safeStorage or Argon2id)
 * @returns { ciphertext, nonce } — store both; nonce is needed for unwrap
 */
export function wrapKey(mk: Uint8Array, wrappingKey: Uint8Array): KeyWrap {
  if (mk.length !== MK_SIZE) {
    throw new Error(`Master Key must be ${MK_SIZE} bytes, got ${mk.length}`);
  }
  if (wrappingKey.length !== MK_SIZE) {
    throw new Error(`Wrapping key must be ${MK_SIZE} bytes, got ${wrappingKey.length}`);
  }

  const nonce = generateNonce();
  const aad = new Uint8Array(0); // No AAD for key wraps
  const ciphertext = encrypt(mk, wrappingKey, nonce, aad);

  return { ciphertext, nonce };
}

/**
 * Unwrap a Master Key (AEAD decryption).
 *
 * @param wrap - { ciphertext, nonce } from wrapKey
 * @param wrappingKey - Key to decrypt under (32 bytes, same as used in wrapKey)
 * @returns Master Key (32 bytes)
 * @throws Error if authentication fails (wrong wrapping key or tampered ciphertext)
 */
export function unwrapKey(wrap: KeyWrap, wrappingKey: Uint8Array): Uint8Array {
  if (wrappingKey.length !== MK_SIZE) {
    throw new Error(`Wrapping key must be ${MK_SIZE} bytes, got ${wrappingKey.length}`);
  }

  const aad = new Uint8Array(0);
  const mk = decrypt(wrap.ciphertext, wrappingKey, wrap.nonce, aad);

  if (mk.length !== MK_SIZE) {
    throw new Error(`Unwrapped key size mismatch: expected ${MK_SIZE}, got ${mk.length}`);
  }

  return mk;
}
