/**
 * Tests for Argon2id KDF (recovery key derivation).
 */

import { describe, it, expect } from 'vitest';
import { deriveRecoveryKey, DEFAULT_ARGON2_PARAMS } from '../recoveryKey.js';
import { generateMnemonic } from '../mnemonic.js';
import { randomBytes } from '../primitives.js';

describe('recoveryKey', () => {
  describe('deriveRecoveryKey', () => {
    it('derives 32-byte keys', async () => {
      const mnemonic = generateMnemonic();
      const salt = randomBytes(16);

      const key = await deriveRecoveryKey(mnemonic, salt, DEFAULT_ARGON2_PARAMS);

      expect(key.length).toBe(32);
    });

    it('is deterministic (same inputs → same key)', async () => {
      const mnemonic = generateMnemonic();
      const salt = randomBytes(16);

      const key1 = await deriveRecoveryKey(mnemonic, salt, DEFAULT_ARGON2_PARAMS);
      const key2 = await deriveRecoveryKey(mnemonic, salt, DEFAULT_ARGON2_PARAMS);

      expect(Buffer.from(key1).equals(Buffer.from(key2))).toBe(true);
    });

    it('produces different keys for different mnemonics', async () => {
      const m1 = generateMnemonic();
      const m2 = generateMnemonic();
      const salt = randomBytes(16);

      const key1 = await deriveRecoveryKey(m1, salt, DEFAULT_ARGON2_PARAMS);
      const key2 = await deriveRecoveryKey(m2, salt, DEFAULT_ARGON2_PARAMS);

      expect(Buffer.from(key1).equals(Buffer.from(key2))).toBe(false);
    });

    it('produces different keys for different salts', async () => {
      const mnemonic = generateMnemonic();
      const salt1 = randomBytes(16);
      const salt2 = randomBytes(16);

      const key1 = await deriveRecoveryKey(mnemonic, salt1, DEFAULT_ARGON2_PARAMS);
      const key2 = await deriveRecoveryKey(mnemonic, salt2, DEFAULT_ARGON2_PARAMS);

      expect(Buffer.from(key1).equals(Buffer.from(key2))).toBe(false);
    });

    it('produces different keys for different params', async () => {
      const mnemonic = generateMnemonic();
      const salt = randomBytes(16);
      const params1 = { m: 32768, t: 2, p: 1 };
      const params2 = { m: 65536, t: 3, p: 1 };

      const key1 = await deriveRecoveryKey(mnemonic, salt, params1);
      const key2 = await deriveRecoveryKey(mnemonic, salt, params2);

      expect(Buffer.from(key1).equals(Buffer.from(key2))).toBe(false);
    });

    it('rejects invalid salt size', async () => {
      const mnemonic = generateMnemonic();
      const shortSalt = randomBytes(8);

      await expect(deriveRecoveryKey(mnemonic, shortSalt, DEFAULT_ARGON2_PARAMS)).rejects.toThrow(
        /Salt must be 16 bytes/,
      );
    });

    it('rejects invalid mnemonic', async () => {
      const invalid = 'not a valid mnemonic at all';
      const salt = randomBytes(16);

      await expect(deriveRecoveryKey(invalid, salt, DEFAULT_ARGON2_PARAMS)).rejects.toThrow(
        /Invalid mnemonic/,
      );
    });

    it('completes in reasonable time with default params', async () => {
      const mnemonic = generateMnemonic();
      const salt = randomBytes(16);

      const start = performance.now();
      await deriveRecoveryKey(mnemonic, salt, DEFAULT_ARGON2_PARAMS);
      const duration = performance.now() - start;

      // Should complete in under 2 seconds on most machines
      // (target is ~500ms, but CI can be slow)
      expect(duration).toBeLessThan(2000);
    }, 5000); // 5s timeout for slow CI

    it('handles multiple concurrent derivations', async () => {
      const mnemonic = generateMnemonic();
      const salt = randomBytes(16);

      const promises = Array.from({ length: 3 }, () =>
        deriveRecoveryKey(mnemonic, salt, { m: 16384, t: 1, p: 1 }),
      );

      const keys = await Promise.all(promises);

      // All should produce the same key (deterministic)
      expect(Buffer.from(keys[0]).equals(Buffer.from(keys[1]))).toBe(true);
      expect(Buffer.from(keys[1]).equals(Buffer.from(keys[2]))).toBe(true);
    }, 10000);
  });
});
