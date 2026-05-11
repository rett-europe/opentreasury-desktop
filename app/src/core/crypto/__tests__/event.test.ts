/**
 * Tests for high-level event encryption (AAD = eventId + ":" + deviceId).
 */

import { describe, it, expect } from 'vitest';
import { encryptEvent, decryptEvent } from '../event.js';
import { generateMasterKey } from '../masterKey.js';

const DEVICE_A = '01JWDEVCEAAAAAAAAAAAAAAAAA';
const DEVICE_B = '01JWDEVCEBBBBBBBBBBBBBBBBB';

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

      const encrypted = encryptEvent(payload, mk, eventId, DEVICE_A);
      const decrypted = decryptEvent(encrypted, mk, eventId, DEVICE_A);

      expect(decrypted).toBe(payload);
    });

    it('throws on wrong master key', () => {
      const mk = generateMasterKey();
      const wrongMk = generateMasterKey();
      const eventId = '01JWEXAMPLE001';
      const payload = JSON.stringify({ type: 'test' });

      const encrypted = encryptEvent(payload, mk, eventId, DEVICE_A);

      expect(() => decryptEvent(encrypted, wrongMk, eventId, DEVICE_A)).toThrow(
        /could not verify data/,
      );
    });

    it('throws on wrong eventId (AAD mismatch)', () => {
      const mk = generateMasterKey();
      const eventId = '01JWEXAMPLE001';
      const wrongId = '01JWEXAMPLE002';
      const payload = JSON.stringify({ type: 'test' });

      const encrypted = encryptEvent(payload, mk, eventId, DEVICE_A);

      expect(() => decryptEvent(encrypted, mk, wrongId, DEVICE_A)).toThrow(/could not verify data/);
    });

    it('throws on wrong deviceId — cross-device transplant rejection (MEDIUM-1)', () => {
      // An attacker copying a ciphertext from events-A.ndjson into
      // events-B.ndjson sees decryption fail because deviceId is part of AAD.
      const mk = generateMasterKey();
      const eventId = '01JWEXAMPLE001';
      const payload = JSON.stringify({ type: 'test' });

      const encrypted = encryptEvent(payload, mk, eventId, DEVICE_A);

      expect(() => decryptEvent(encrypted, mk, eventId, DEVICE_B)).toThrow(/could not verify data/);
    });

    it('returns base64-encoded output', () => {
      const mk = generateMasterKey();
      const eventId = '01JWEXAMPLE001';
      const payload = JSON.stringify({ type: 'test' });

      const encrypted = encryptEvent(payload, mk, eventId, DEVICE_A);

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

      const encrypted = encryptEvent(payload, mk, eventId, DEVICE_A);
      const decrypted = decryptEvent(encrypted, mk, eventId, DEVICE_A);

      expect(decrypted).toBe(payload);
    });

    it('produces different ciphertexts for same plaintext (unique nonces)', () => {
      const mk = generateMasterKey();
      const eventId = '01JWEXAMPLE001';
      const payload = JSON.stringify({ type: 'test' });

      const encrypted1 = encryptEvent(payload, mk, eventId, DEVICE_A);
      const encrypted2 = encryptEvent(payload, mk, eventId, DEVICE_A);

      // Same plaintext, MK, eventId, and deviceId, but different nonces
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('throws on truncated encrypted line', () => {
      const mk = generateMasterKey();
      const eventId = '01JWEXAMPLE001';
      const payload = JSON.stringify({ type: 'test' });

      const encrypted = encryptEvent(payload, mk, eventId, DEVICE_A);
      const truncated = encrypted.slice(0, 10); // Too short

      expect(() => decryptEvent(truncated, mk, eventId, DEVICE_A)).toThrow(/too short/);
    });
  });
});
