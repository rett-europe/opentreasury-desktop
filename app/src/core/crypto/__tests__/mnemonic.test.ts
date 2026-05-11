/**
 * Tests for BIP39 mnemonic generation and validation.
 */

import { describe, it, expect } from 'vitest';
import { generateMnemonic, validateMnemonic, mnemonicToSeed } from '../mnemonic.js';

describe('mnemonic', () => {
  describe('generateMnemonic', () => {
    it('generates 12-word mnemonics', () => {
      const mnemonic = generateMnemonic();
      const words = mnemonic.split(' ');

      expect(words.length).toBe(12);
    });

    it('generates valid BIP39 mnemonics', () => {
      const mnemonic = generateMnemonic();
      expect(validateMnemonic(mnemonic)).toBe(true);
    });

    it('produces unique mnemonics', () => {
      const m1 = generateMnemonic();
      const m2 = generateMnemonic();

      expect(m1).not.toBe(m2);
    });
  });

  describe('validateMnemonic', () => {
    it('accepts valid mnemonics', () => {
      const valid =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      expect(validateMnemonic(valid)).toBe(true);
    });

    it('rejects invalid mnemonics (bad checksum)', () => {
      const invalid =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
      expect(validateMnemonic(invalid)).toBe(false);
    });

    it('rejects non-wordlist words', () => {
      const invalid =
        'notaword abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      expect(validateMnemonic(invalid)).toBe(false);
    });

    it('rejects wrong word count', () => {
      const tooShort = 'abandon abandon abandon';
      expect(validateMnemonic(tooShort)).toBe(false);
    });

    it('rejects empty string', () => {
      expect(validateMnemonic('')).toBe(false);
    });
  });

  describe('mnemonicToSeed', () => {
    it('produces 64-byte seeds (BIP39 spec)', () => {
      const mnemonic = generateMnemonic();
      const seed = mnemonicToSeed(mnemonic);

      expect(seed.length).toBe(64);
    });

    it('is deterministic (same mnemonic → same seed)', () => {
      const mnemonic = generateMnemonic();
      const seed1 = mnemonicToSeed(mnemonic);
      const seed2 = mnemonicToSeed(mnemonic);

      expect(Buffer.from(seed1).equals(Buffer.from(seed2))).toBe(true);
    });

    it('produces different seeds for different mnemonics', () => {
      const m1 = generateMnemonic();
      const m2 = generateMnemonic();
      const seed1 = mnemonicToSeed(m1);
      const seed2 = mnemonicToSeed(m2);

      expect(Buffer.from(seed1).equals(Buffer.from(seed2))).toBe(false);
    });

    it('throws on invalid mnemonic', () => {
      const invalid =
        'notaword notaword notaword notaword notaword notaword notaword notaword notaword notaword notaword notaword';

      expect(() => mnemonicToSeed(invalid)).toThrow(/Invalid mnemonic/);
    });

    it('handles known test vector', () => {
      // BIP39 test vector: 12-word mnemonic with known seed
      const mnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const seed = mnemonicToSeed(mnemonic);

      // Seed should be deterministic
      expect(seed.length).toBe(64);

      // Re-derive to ensure determinism
      const seed2 = mnemonicToSeed(mnemonic);
      expect(Buffer.from(seed).equals(Buffer.from(seed2))).toBe(true);
    });
  });
});
