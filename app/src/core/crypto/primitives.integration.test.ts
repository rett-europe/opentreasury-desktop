// SPEC-027 — AEAD round-trip + tamper-detection integration test (Cypher).
//
// Exercises the XChaCha20-Poly1305 primitives the export/audit pipeline relies
// on: a correct round-trip, plus the security-critical property that ANY
// tampering with the ciphertext, nonce, key, or AAD fails decryption (the audit
// chain depends on this to stay fail-closed).

import { describe, it, expect } from 'vitest';
import { decrypt, encrypt, randomBytes, wipe } from './primitives.js';

function freshKeyNonce(): { key: Uint8Array; nonce: Uint8Array } {
  return { key: randomBytes(32), nonce: randomBytes(24) };
}

describe('AEAD primitives', () => {
  it('round-trips plaintext with matching key/nonce/aad', () => {
    const { key, nonce } = freshKeyNonce();
    const aad = Buffer.from('audit-chunk:v1:dataset', 'utf8');
    const plaintext = Buffer.from('movimientos;exportados;€300,00', 'utf8');

    const cipher = encrypt(plaintext, key, nonce, aad);
    expect(Buffer.from(cipher).equals(plaintext)).toBe(false); // actually encrypted
    expect(cipher.length).toBe(plaintext.length + 16); // Poly1305 tag appended

    const recovered = decrypt(cipher, key, nonce, aad);
    expect(Buffer.from(recovered).equals(plaintext)).toBe(true);
  });

  it('fails when the ciphertext is tampered', () => {
    const { key, nonce } = freshKeyNonce();
    const aad = Buffer.from('aad', 'utf8');
    const cipher = Buffer.from(encrypt(Buffer.from('secret rows'), key, nonce, aad));
    cipher[0] ^= 0xff; // flip a byte

    expect(() => decrypt(cipher, key, nonce, aad)).toThrow();
  });

  it('fails when the authentication tag is tampered', () => {
    const { key, nonce } = freshKeyNonce();
    const aad = Buffer.from('aad', 'utf8');
    const cipher = Buffer.from(encrypt(Buffer.from('secret rows'), key, nonce, aad));
    cipher[cipher.length - 1] ^= 0x01; // corrupt the tag

    expect(() => decrypt(cipher, key, nonce, aad)).toThrow();
  });

  it('fails with the wrong key', () => {
    const { key, nonce } = freshKeyNonce();
    const aad = Buffer.from('aad', 'utf8');
    const cipher = encrypt(Buffer.from('secret rows'), key, nonce, aad);

    expect(() => decrypt(cipher, randomBytes(32), nonce, aad)).toThrow();
  });

  it('fails with a mismatched AAD (context binding)', () => {
    const { key, nonce } = freshKeyNonce();
    const cipher = encrypt(Buffer.from('secret rows'), key, nonce, Buffer.from('ctx-A'));

    expect(() => decrypt(cipher, key, nonce, Buffer.from('ctx-B'))).toThrow();
  });

  it('wipe zeroes a buffer', () => {
    const buf = randomBytes(32);
    wipe(buf);
    expect(buf.every((b) => b === 0)).toBe(true);
  });
});
