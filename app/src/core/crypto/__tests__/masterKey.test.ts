/**
 * Tests for Master Key generation and wrapping.
 */

import { describe, it, expect } from 'vitest';
import { generateMasterKey, wrapKey, unwrapKey } from '../masterKey.js';
import { randomBytes } from '../primitives.js';

describe('masterKey', () => {
  describe('generateMasterKey', () => {
    it('generates 32-byte keys', () => {
      const mk = generateMasterKey();
      expect(mk.length).toBe(32);
    });

    it('produces unique keys', () => {
      const mk1 = generateMasterKey();
      const mk2 = generateMasterKey();

      expect(Buffer.from(mk1).equals(Buffer.from(mk2))).toBe(false);
    });
  });

  describe('wrapKey / unwrapKey', () => {
    it('round-trips a master key', () => {
      const mk = generateMasterKey();
      const wrappingKey = randomBytes(32);

      const wrap = wrapKey(mk, wrappingKey);
      const unwrapped = unwrapKey(wrap, wrappingKey);

      expect(Buffer.from(unwrapped).equals(Buffer.from(mk))).toBe(true);
    });

    it('throws on wrong wrapping key', () => {
      const mk = generateMasterKey();
      const wrappingKey = randomBytes(32);
      const wrongKey = randomBytes(32);

      const wrap = wrapKey(mk, wrappingKey);

      expect(() => unwrapKey(wrap, wrongKey)).toThrow(/could not verify data/);
    });

    it('throws on tampered ciphertext', () => {
      const mk = generateMasterKey();
      const wrappingKey = randomBytes(32);

      const wrap = wrapKey(mk, wrappingKey);

      // Tamper with the ciphertext
      const tamperedWrap = {
        ...wrap,
        ciphertext: Buffer.from(wrap.ciphertext),
      };
      tamperedWrap.ciphertext[0] ^= 0x01;

      expect(() => unwrapKey(tamperedWrap, wrappingKey)).toThrow(/could not verify data/);
    });

    it('rejects invalid master key size', () => {
      const shortMk = randomBytes(16);
      const wrappingKey = randomBytes(32);

      expect(() => wrapKey(shortMk, wrappingKey)).toThrow(/Master Key must be 32 bytes/);
    });

    it('rejects invalid wrapping key size', () => {
      const mk = generateMasterKey();
      const shortKey = randomBytes(16);

      expect(() => wrapKey(mk, shortKey)).toThrow(/Wrapping key must be 32 bytes/);
    });

    it('produces unique nonces for each wrap', () => {
      const mk = generateMasterKey();
      const wrappingKey = randomBytes(32);

      const wrap1 = wrapKey(mk, wrappingKey);
      const wrap2 = wrapKey(mk, wrappingKey);

      // Same MK and wrapping key, but nonces should differ
      expect(Buffer.from(wrap1.nonce).equals(Buffer.from(wrap2.nonce))).toBe(false);
    });
  });
});
