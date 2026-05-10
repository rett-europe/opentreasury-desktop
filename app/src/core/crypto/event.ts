/**
 * High-level event encryption with AAD = event.id.
 *
 * Switch review notes: Each event is independently encrypted. The AAD binds
 * the ciphertext to the event's ULID — prevents an attacker from swapping
 * encrypted events across files or reordering them. Format is:
 *   base64(nonce || ciphertext || tag)
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
 * @param eventId - Event ULID (used as AAD to bind ciphertext to event ID)
 * @returns base64-encoded (nonce || ciphertext || tag)
 */
export function encryptEvent(plaintext: string, mk: Uint8Array, eventId: string): string {
  const plaintextBytes = Buffer.from(plaintext, 'utf8');
  const nonce = generateNonce();
  const aad = Buffer.from(eventId, 'utf8');

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
 * @returns Event JSON string
 * @throws Error if AAD mismatch, wrong key, or tampered ciphertext
 */
export function decryptEvent(line: string, mk: Uint8Array, eventId: string): string {
  const combined = Buffer.from(line, 'base64');

  if (combined.length < 24) {
    throw new Error('Invalid encrypted event: too short to contain nonce');
  }

  const nonce = combined.subarray(0, 24);
  const ciphertext = combined.subarray(24);
  const aad = Buffer.from(eventId, 'utf8');

  const plaintext = decrypt(ciphertext, mk, nonce, aad);
  return Buffer.from(plaintext).toString('utf8');
}
