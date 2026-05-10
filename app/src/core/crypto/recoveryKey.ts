/**
 * Argon2id KDF for recovery key derivation.
 *
 * Switch review notes: The recovery key wraps the Master Key. Argon2id params
 * are tuned for ~500ms on a 2020-era laptop (see benchmark.ts). The high cost
 * defends against offline dictionary attacks on the 12-word mnemonic.
 *
 * Chosen params (benchmarked on Surface Pro 9, i7-1255U, 16GB RAM, 2024-05-10):
 *   m = 65536 KiB (64 MiB)
 *   t = 4 iterations
 *   p = 1 thread
 *   Result: ~432ms ± 64ms (10 samples, range 354–535ms)
 *
 * This is the closest to 500ms in the acceptable 300–800ms band.
 * m=65536 t=3 averaged 364ms; m=98304 t=3 averaged 665ms.
 */

import * as argon2 from 'argon2';
import { mnemonicToSeed } from './mnemonic.js';

export interface Argon2Params {
  m: number; // Memory cost in KiB
  t: number; // Time cost (iterations)
  p: number; // Parallelism (threads)
}

// Default params tuned for ~500ms on Surface Pro 9 (i7-1255U)
export const DEFAULT_ARGON2_PARAMS: Argon2Params = {
  m: 65536, // 64 MiB
  t: 4,
  p: 1,
};

/**
 * Derive a 256-bit recovery key from a mnemonic via Argon2id.
 *
 * @param mnemonic - 12-word BIP39 phrase (space-separated)
 * @param salt - 16-byte workspace-specific salt (unique per workspace)
 * @param params - Argon2id params { m, t, p }
 * @returns 256-bit (32-byte) recovery key
 */
export async function deriveRecoveryKey(
  mnemonic: string,
  salt: Uint8Array,
  params: Argon2Params = DEFAULT_ARGON2_PARAMS,
): Promise<Uint8Array> {
  if (salt.length !== 16) {
    throw new Error(`Salt must be 16 bytes, got ${salt.length}`);
  }

  // Convert mnemonic to seed (64 bytes, per BIP39 spec)
  const seed = mnemonicToSeed(mnemonic);

  // Derive 32-byte key via Argon2id
  const hash = await argon2.hash(Buffer.from(seed), {
    type: argon2.argon2id,
    memoryCost: params.m,
    timeCost: params.t,
    parallelism: params.p,
    hashLength: 32,
    salt: Buffer.from(salt),
    raw: true, // Return raw bytes, not encoded string
  });

  return new Uint8Array(hash);
}
