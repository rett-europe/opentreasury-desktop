/**
 * Tests for crypto primitives (XChaCha20-Poly1305 AEAD).
 */

import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, randomBytes } from '../primitives.js';

describe('primitives', () => {
  describe('encrypt / decrypt', () => {
    it('round-trips plaintext correctly', () => {
      const plaintext = Buffer.from('Hello, OpenTreasury!', 'utf8');
      const key = randomBytes(32);
      const nonce = randomBytes(24);
      const aad = Buffer.from('event-id-123', 'utf8');

      const ciphertext = encrypt(plaintext, key, nonce, aad);
      const decrypted = decrypt(ciphertext, key, nonce, aad);

      expect(Buffer.from(decrypted).toString('utf8')).toBe('Hello, OpenTreasury!');
    });

    it('throws on wrong key', () => {
      const plaintext = Buffer.from('secret data', 'utf8');
      const key = randomBytes(32);
      const wrongKey = randomBytes(32);
      const nonce = randomBytes(24);
      const aad = new Uint8Array(0);

      const ciphertext = encrypt(plaintext, key, nonce, aad);

      expect(() => decrypt(ciphertext, wrongKey, nonce, aad)).toThrow(/could not verify data/);
    });

    it('throws on AAD mismatch', () => {
      const plaintext = Buffer.from('sensitive', 'utf8');
      const key = randomBytes(32);
      const nonce = randomBytes(24);
      const aad = Buffer.from('event-A', 'utf8');
      const wrongAad = Buffer.from('event-B', 'utf8');

      const ciphertext = encrypt(plaintext, key, nonce, aad);

      expect(() => decrypt(ciphertext, key, nonce, wrongAad)).toThrow(/could not verify data/);
    });

    it('throws on tampered ciphertext', () => {
      const plaintext = Buffer.from('integrity check', 'utf8');
      const key = randomBytes(32);
      const nonce = randomBytes(24);
      const aad = new Uint8Array(0);

      const ciphertext = encrypt(plaintext, key, nonce, aad);

      // Flip a bit in the ciphertext
      ciphertext[0] ^= 0x01;

      expect(() => decrypt(ciphertext, key, nonce, aad)).toThrow(/could not verify data/);
    });

    it('rejects invalid key size', () => {
      const plaintext = Buffer.from('test', 'utf8');
      const shortKey = randomBytes(16);
      const nonce = randomBytes(24);
      const aad = new Uint8Array(0);

      expect(() => encrypt(plaintext, shortKey, nonce, aad)).toThrow(/Key must be 32 bytes/);
    });

    it('rejects invalid nonce size', () => {
      const plaintext = Buffer.from('test', 'utf8');
      const key = randomBytes(32);
      const shortNonce = randomBytes(12);
      const aad = new Uint8Array(0);

      expect(() => encrypt(plaintext, key, shortNonce, aad)).toThrow(/Nonce must be 24 bytes/);
    });

    it('handles empty AAD', () => {
      const plaintext = Buffer.from('no aad', 'utf8');
      const key = randomBytes(32);
      const nonce = randomBytes(24);
      const aad = new Uint8Array(0);

      const ciphertext = encrypt(plaintext, key, nonce, aad);
      const decrypted = decrypt(ciphertext, key, nonce, aad);

      expect(Buffer.from(decrypted).toString('utf8')).toBe('no aad');
    });
  });

  describe('randomBytes', () => {
    it('generates requested length', () => {
      const bytes = randomBytes(32);
      expect(bytes.length).toBe(32);
    });

    it('produces different outputs on successive calls', () => {
      const a = randomBytes(32);
      const b = randomBytes(32);

      expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    });

    it('handles zero length', () => {
      const bytes = randomBytes(0);
      expect(bytes.length).toBe(0);
    });
  });
});
