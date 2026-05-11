/**
 * BIP39 12-word English mnemonic handling.
 *
 * Switch review notes: 12 words = 128 bits entropy. The mnemonic is NOT used
 * directly as a key — it's an input to Argon2id KDF (see recoveryKey.ts).
 * This prevents offline brute-force attacks on the wordlist space.
 *
 * Switch review #310 MEDIUM-1 (2026-05-11): All public entry points normalize
 * the input string before reaching `bip39`. The library applies NFKD internally
 * but does not lowercase, trim, or collapse whitespace, so a user-typed code
 * like `" Abandon  abandon ..."` would silently fail validation. Normalizing
 * here is the last line of defense regardless of what the UI does.
 */

import * as bip39 from 'bip39';

/**
 * Defensive normalization for user-typed mnemonics:
 *   - Unicode NFKD (canonical compatibility decomposition, matches BIP39 spec)
 *   - lowercase (BIP39 wordlist is all lowercase)
 *   - trim leading/trailing whitespace
 *   - collapse interior whitespace runs to a single ASCII space
 *
 * Exported for callers that need to compare mnemonics for equality (e.g.
 * "user re-typed the same code" checks). Internal callers in this module
 * always run input through this first.
 */
export function normalizeMnemonic(words: string): string {
  return words.normalize('NFKD').toLowerCase().trim().replace(/\s+/g, ' ');
}

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
 * Validate a BIP39 mnemonic. Input is normalized (NFKD + lowercase + whitespace
 * collapse) before validation so user-typed variance does not cause false
 * negatives.
 *
 * @param words - Space-separated word string (any case / whitespace)
 * @returns true if valid BIP39 mnemonic, false otherwise
 */
export function validateMnemonic(words: string): boolean {
  return bip39.validateMnemonic(normalizeMnemonic(words));
}

/**
 * Convert mnemonic to a seed (used as input to Argon2id, NOT directly as a key).
 *
 * BIP39 spec defines mnemonicToSeed with optional passphrase. We use empty
 * passphrase — the Argon2id salt provides workspace-specific binding.
 *
 * @param words - Space-separated 12-word mnemonic (any case / whitespace)
 * @returns 64-byte seed (512 bits, per BIP39 spec)
 */
export function mnemonicToSeed(words: string): Uint8Array {
  const normalized = normalizeMnemonic(words);
  if (!bip39.validateMnemonic(normalized)) {
    throw new Error('Invalid mnemonic');
  }

  // BIP39 mnemonicToSeedSync returns 64 bytes (512 bits)
  return bip39.mnemonicToSeedSync(normalized);
}
