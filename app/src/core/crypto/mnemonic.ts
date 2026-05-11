/**
 * BIP39 12-word English mnemonic handling.
 *
 * Switch review notes: 12 words = 128 bits entropy. The mnemonic is NOT used
 * directly as a key — it's an input to Argon2id KDF (see recoveryKey.ts).
 * This prevents offline brute-force attacks on the wordlist space.
 */

import * as bip39 from 'bip39';

/**
 * Generate a 12-word BIP39 mnemonic.
 *
 * @returns Space-separated 12 English words (128-bit entropy)
 */
export function generateMnemonic(): string {
  // bip39.generateMnemonic with no args defaults to 128 bits (12 words)
  return bip39.generateMnemonic(128);
}

/**
 * Validate a BIP39 mnemonic.
 *
 * @param words - Space-separated word string
 * @returns true if valid BIP39 mnemonic, false otherwise
 */
export function validateMnemonic(words: string): boolean {
  return bip39.validateMnemonic(words);
}

/**
 * Convert mnemonic to a seed (used as input to Argon2id, NOT directly as a key).
 *
 * BIP39 spec defines mnemonicToSeed with optional passphrase. We use empty
 * passphrase — the Argon2id salt provides workspace-specific binding.
 *
 * @param words - Space-separated 12-word mnemonic
 * @returns 64-byte seed (512 bits, per BIP39 spec)
 */
export function mnemonicToSeed(words: string): Uint8Array {
  if (!validateMnemonic(words)) {
    throw new Error('Invalid mnemonic');
  }

  // BIP39 mnemonicToSeedSync returns 64 bytes (512 bits)
  return bip39.mnemonicToSeedSync(words);
}
