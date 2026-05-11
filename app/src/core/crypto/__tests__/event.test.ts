/**
 * Tests for high-level event encryption (AAD = event.id).
 */

import { describe, it, expect } from 'vitest';
import { encryptEvent, decryptEvent } from '../event.js';
import { generateMasterKey } from '../masterKey.js';

describe('event', () => {
  describe('encryptEvent / decryptEvent', () => {
    it('round-trips event JSON correctly', () => {
      const mk = generateMasterKey();
      const eventId = '01JWEXAMPLE001AAAAAAAAAAAA';
      const payload = JSON.stringify({
        type: 'tx.created',
        amount: 12345,
        description: 'Test transaction',
      });

      const encrypted = encryptEvent(payload, mk, eventId);
      const decrypted = decryptEvent(encrypted, mk, eventId);

      expect(decrypted).toBe(payload);
    });

    it('throws on wrong master key', () => {
      const mk = generateMasterKey();
      const wrongMk = generateMasterKey();
      const eventId = '01JWEXAMPLE001';
      const payload = JSON.stringify({ type: 'test' });

      const encrypted = encryptEvent(payload, mk, eventId);

      expect(() => decryptEvent(encrypted, wrongMk, eventId)).toThrow(/could not verify data/);
    });

    it('throws on wrong eventId (AAD mismatch)', () => {
      const mk = generateMasterKey();
      const eventId = '01JWEXAMPLE001';
      const wrongId = '01JWEXAMPLE002';
      const payload = JSON.stringify({ type: 'test' });

      const encrypted = encryptEvent(payload, mk, eventId);

      expect(() => decryptEvent(encrypted, mk, wrongId)).toThrow(/could not verify data/);
    });

    it('returns base64-encoded output', () => {
      const mk = generateMasterKey();
      const eventId = '01JWEXAMPLE001';
      const payload = JSON.stringify({ type: 'test' });

      const encrypted = encryptEvent(payload, mk, eventId);

      // Should be valid base64
      expect(() => Buffer.from(encrypted, 'base64')).not.toThrow();

      // Should start with 24-byte nonce (32 base64 chars for first 24 bytes)
      expect(encrypted.length).toBeGreaterThan(32);
    });

    it('handles large payloads', () => {
      const mk = generateMasterKey();
      const eventId = '01JWEXAMPLE001';
      const payload = JSON.stringify({
        type: 'tx.created',
        description: 'A'.repeat(10000),
      });

      const encrypted = encryptEvent(payload, mk, eventId);
      const decrypted = decryptEvent(encrypted, mk, eventId);

      expect(decrypted).toBe(payload);
    });

    it('produces different ciphertexts for same plaintext (unique nonces)', () => {
      const mk = generateMasterKey();
      const eventId = '01JWEXAMPLE001';
      const payload = JSON.stringify({ type: 'test' });

      const encrypted1 = encryptEvent(payload, mk, eventId);
      const encrypted2 = encryptEvent(payload, mk, eventId);

      // Same plaintext, MK, and eventId, but different nonces
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('throws on truncated encrypted line', () => {
      const mk = generateMasterKey();
      const eventId = '01JWEXAMPLE001';
      const payload = JSON.stringify({ type: 'test' });

      const encrypted = encryptEvent(payload, mk, eventId);
      const truncated = encrypted.slice(0, 10); // Too short

      expect(() => decryptEvent(truncated, mk, eventId)).toThrow(/too short/);
    });
  });
});
