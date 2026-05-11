/**
 * Switch review #310 follow-up fixes (MEDIUM-1 + MEDIUM-2).
 *
 * MEDIUM-1: Mnemonic input normalization (case / whitespace tolerance).
 * MEDIUM-2: Secret wiping via `wipe()` wrapper around `sodium_memzero`.
 *
 * These tests pin the behaviour so future refactors cannot quietly drop
 * either defense.
 */

import { describe, it, expect } from 'vitest';
import {
  validateMnemonic,
  mnemonicToSeed,
  normalizeMnemonic,
  generateMnemonic,
} from '../mnemonic.js';
import { deriveRecoveryKey } from '../recoveryKey.js';
import { wipe, randomBytes } from '../primitives.js';

const CANONICAL =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('Switch #310 MEDIUM-1: mnemonic normalization', () => {
  it('validateMnemonic accepts mixed case', () => {
    expect(
      validateMnemonic(
        'Abandon Abandon Abandon Abandon Abandon Abandon Abandon Abandon Abandon Abandon Abandon About',
      ),
    ).toBe(true);
    expect(
      validateMnemonic(
        'ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABOUT',
      ),
    ).toBe(true);
  });

  it('validateMnemonic accepts surrounding whitespace and tabs', () => {
    expect(validateMnemonic(`   ${CANONICAL}   `)).toBe(true);
    expect(validateMnemonic(`\t${CANONICAL}\n`)).toBe(true);
  });

  it('validateMnemonic accepts collapsed-whitespace separators', () => {
    const noisy = CANONICAL.split(' ').join('   '); // multi-space between words
    expect(validateMnemonic(noisy)).toBe(true);
  });

  it('mnemonicToSeed produces identical seed regardless of case/whitespace', () => {
    const a = mnemonicToSeed(CANONICAL);
    const b = mnemonicToSeed(
      `  ABANDON  abandon  Abandon  abandon  abandon  abandon  abandon  abandon  abandon  abandon  abandon  ABOUT  `,
    );
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('deriveRecoveryKey produces identical key regardless of case/whitespace', async () => {
    const salt = randomBytes(16);
    // Use small Argon2id params so the test is fast.
    const params = { m: 8192, t: 1, p: 1 };

    const k1 = await deriveRecoveryKey(CANONICAL, salt, params);
    const k2 = await deriveRecoveryKey(`  ${CANONICAL.toUpperCase()}  `, salt, params);
    expect(Buffer.from(k1).equals(Buffer.from(k2))).toBe(true);
  }, 10000);

  it('normalizeMnemonic exposes the same transform used internally', () => {
    expect(normalizeMnemonic('  ABandon  ABout  ')).toBe('abandon about');
  });

  it('generated mnemonics still round-trip after normalization', () => {
    const m = generateMnemonic();
    expect(validateMnemonic(normalizeMnemonic(`  ${m.toUpperCase()}  `))).toBe(true);
  });

  it('rejects an invalid mnemonic even after normalization (no false positives)', () => {
    expect(
      validateMnemonic(
        '  NOTAWORD notaword notaword notaword notaword notaword notaword notaword notaword notaword notaword notaword  ',
      ),
    ).toBe(false);
  });
});

describe('Switch #310 MEDIUM-2: wipe() utility', () => {
  it('zeroes a non-empty buffer in place', () => {
    const buf = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
    wipe(buf);
    expect(Array.from(buf)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('zeroes a 32-byte key-sized buffer', () => {
    const key = randomBytes(32);
    // Sanity: not all zero before wipe.
    expect(Array.from(key).some((b) => b !== 0)).toBe(true);
    wipe(key);
    expect(Array.from(key).every((b) => b === 0)).toBe(true);
  });

  it('is a no-op on an empty buffer (no throw)', () => {
    expect(() => wipe(new Uint8Array(0))).not.toThrow();
  });

  it('is idempotent (wiping twice is safe)', () => {
    const buf = Buffer.from([9, 9, 9, 9]);
    wipe(buf);
    wipe(buf);
    expect(Array.from(buf)).toEqual([0, 0, 0, 0]);
  });
});
