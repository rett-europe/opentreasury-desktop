/**
 * XChaCha20-Poly1305 AEAD primitives via sodium-native.
 *
 * Switch review notes: This wraps libsodium's AEAD primitives with strict
 * input validation. All functions throw on invalid input (wrong key/nonce size).
 */

import sodium from 'sodium-native';

const KEY_SIZE = 32; // 256 bits
const NONCE_SIZE = 24; // XChaCha20 nonce
const TAG_SIZE = 16; // Poly1305 tag

/**
 * Encrypt plaintext with XChaCha20-Poly1305 AEAD.
 *
 * @param plaintext - Data to encrypt
 * @param key - 256-bit (32-byte) encryption key
 * @param nonce - 24-byte nonce (MUST be unique per key)
 * @param aad - Additional authenticated data (not encrypted, but authenticated)
 * @returns ciphertext || tag (combined, length = plaintext.length + 16)
 */
export function encrypt(
  plaintext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
  aad: Uint8Array,
): Uint8Array {
  if (key.length !== KEY_SIZE) {
    throw new Error(`Key must be ${KEY_SIZE} bytes, got ${key.length}`);
  }
  if (nonce.length !== NONCE_SIZE) {
    throw new Error(`Nonce must be ${NONCE_SIZE} bytes, got ${nonce.length}`);
  }

  const ciphertext = Buffer.allocUnsafe(plaintext.length + TAG_SIZE);

  sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    ciphertext,
    plaintext.length > 0 ? plaintext : Buffer.alloc(0),
    aad.length > 0 ? aad : null,
    null,
    nonce,
    key,
  );

  return ciphertext;
}

/**
 * Decrypt ciphertext with XChaCha20-Poly1305 AEAD.
 *
 * @param ciphertext - Encrypted data (includes 16-byte tag)
 * @param key - 256-bit (32-byte) encryption key
 * @param nonce - 24-byte nonce (same as used for encryption)
 * @param aad - Additional authenticated data (must match encryption)
 * @returns plaintext
 * @throws Error if authentication fails (wrong key, tampered ciphertext, or AAD mismatch)
 */
export function decrypt(
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
  aad: Uint8Array,
): Uint8Array {
  if (key.length !== KEY_SIZE) {
    throw new Error(`Key must be ${KEY_SIZE} bytes, got ${key.length}`);
  }
  if (nonce.length !== NONCE_SIZE) {
    throw new Error(`Nonce must be ${NONCE_SIZE} bytes, got ${nonce.length}`);
  }
  if (ciphertext.length < TAG_SIZE) {
    throw new Error(`Ciphertext too short (must include ${TAG_SIZE}-byte tag)`);
  }

  const plaintextLen = ciphertext.length - TAG_SIZE;
  const plaintext = Buffer.allocUnsafe(Math.max(1, plaintextLen)); // sodium-native requires non-zero buffer

  const result = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    plaintext,
    null,
    ciphertext,
    aad.length > 0 ? aad : null,
    nonce,
    key,
  );

  if (!result) {
    throw new Error('Decryption failed: could not verify data');
  }

  return plaintext.subarray(0, plaintextLen);
}

/**
 * Generate cryptographically secure random bytes.
 *
 * @param len - Number of bytes to generate
 * @returns Random bytes from libsodium CSPRNG
 */
export function randomBytes(len: number): Uint8Array {
  const buf = Buffer.allocUnsafe(len);
  sodium.randombytes_buf(buf);
  return buf;
}
