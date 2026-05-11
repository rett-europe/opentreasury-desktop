/**
 * XChaCha20 nonce generation with same-process collision detection.
 *
 * Switch review notes: XChaCha20 nonces are 192 bits — collision probability
 * is negligible (birthday bound ~2^96). The collision set is defensive paranoia,
 * not cryptographically necessary.
 */

import { randomBytes } from './primitives.js';

const NONCE_SIZE = 24;

// Same-process collision detection set
const usedNonces = new Set<string>();

/**
 * Generate a fresh 24-byte XChaCha20 nonce.
 *
 * Asserts no collisions within the same process. This is defensive — the
 * 192-bit nonce space makes collisions astronomically unlikely, but the
 * check costs ~nothing and catches bugs (e.g., broken RNG seeding in tests).
 *
 * @returns 24 random bytes
 * @throws Error if nonce collision detected (indicates RNG failure)
 */
export function generateNonce(): Uint8Array {
  const nonce = randomBytes(NONCE_SIZE);
  const key = Buffer.from(nonce).toString('base64');

  if (usedNonces.has(key)) {
    // This should never happen with a working CSPRNG
    throw new Error('Nonce collision detected — RNG may be compromised');
  }

  usedNonces.add(key);
  return nonce;
}

/**
 * Clear the collision detection set.
 * For tests only — production code should never call this.
 */
export function _clearNonceSet(): void {
  usedNonces.clear();
}
