/**
 * High-level event encryption with AAD = `eventId + ":" + deviceId`.
 *
 * Each event is independently encrypted. The AAD binds the ciphertext to both
 * the event's ULID AND the device file it was written to, preventing a
 * cross-device ciphertext transplant: a line from `events-{A}.ndjson` cannot
 * be copied into `events-{B}.ndjson` and successfully decrypted. Format:
 *   base64(nonce || ciphertext || tag)
 *
 * AAD format (UTF-8 bytes): `"{eventId}:{deviceId}"`
 *
 * The nonce is prepended (not AAD) so we can decrypt without storing it
 * separately. XChaCha20 nonces are 24 bytes; safe to transmit in the clear.
 */

import { encrypt, decrypt } from './primitives.js';
import { generateNonce } from './nonce.js';

/**
 * Encrypt an event payload.
 *
 * @param plaintext - Event JSON string
 * @param mk - Master Key (32 bytes)
 * @param eventId - Event ULID (bound into AAD)
 * @param deviceId - Device ULID that owns the file (bound into AAD)
 * @returns base64-encoded (nonce || ciphertext || tag)
 */
export function encryptEvent(
  plaintext: string,
  mk: Uint8Array,
  eventId: string,
  deviceId: string,
): string {
  const plaintextBytes = Buffer.from(plaintext, 'utf8');
  const nonce = generateNonce();
  // AAD = "<eventId>:<deviceId>" — binds ciphertext to both event identity
  // and the specific device file. Changing either component fails decryption.
  const aad = Buffer.from(`${eventId}:${deviceId}`, 'utf8');

  const ciphertext = encrypt(plaintextBytes, mk, nonce, aad);

  // Prepend nonce to ciphertext for storage
  const combined = Buffer.concat([nonce, ciphertext]);
  return combined.toString('base64');
}

/**
 * Decrypt an event payload.
 *
 * @param line - base64-encoded (nonce || ciphertext || tag) from encryptEvent
 * @param mk - Master Key (32 bytes, same as used for encryption)
 * @param eventId - Event ULID (must match the AAD used during encryption)
 * @param deviceId - Device ULID of the file the line was read from (must match)
 * @returns Event JSON string
 * @throws Error if AAD mismatch, wrong key, or tampered ciphertext
 */
export function decryptEvent(
  line: string,
  mk: Uint8Array,
  eventId: string,
  deviceId: string,
): string {
  const combined = Buffer.from(line, 'base64');

  if (combined.length < 24) {
    throw new Error('Invalid encrypted event: too short to contain nonce');
  }

  const nonce = combined.subarray(0, 24);
  const ciphertext = combined.subarray(24);
  const aad = Buffer.from(`${eventId}:${deviceId}`, 'utf8');

  const plaintext = decrypt(ciphertext, mk, nonce, aad);
  return Buffer.from(plaintext).toString('utf8');
}
