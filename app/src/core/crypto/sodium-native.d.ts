declare module 'sodium-native' {
  export function crypto_aead_xchacha20poly1305_ietf_encrypt(
    ciphertext: Uint8Array,
    plaintext: Uint8Array,
    aad: Uint8Array | null,
    nsec: null,
    nonce: Uint8Array,
    key: Uint8Array,
  ): void;

  export function crypto_aead_xchacha20poly1305_ietf_decrypt(
    plaintext: Uint8Array,
    nsec: null,
    ciphertext: Uint8Array,
    aad: Uint8Array | null,
    nonce: Uint8Array,
    key: Uint8Array,
  ): boolean;

  export function randombytes_buf(buf: Uint8Array): void;

  /**
   * Securely zero a buffer's bytes. Uses a compiler-barrier zero fill so the
   * write cannot be optimized away. See
   * https://libsodium.gitbook.io/doc/memory_management#zeroing-memory
   */
  export function sodium_memzero(buf: Uint8Array): void;
}
