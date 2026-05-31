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

  // BLAKE2b generic hash (SPEC-027 audit + provenance).
  export const crypto_generichash_BYTES: number;
  export const crypto_generichash_BYTES_MIN: number;
  export const crypto_generichash_BYTES_MAX: number;
  export function crypto_generichash(out: Uint8Array, input: Uint8Array, key?: Uint8Array): void;

  // Ed25519 detached signatures (SPEC-027 audit log).
  export const crypto_sign_PUBLICKEYBYTES: number;
  export const crypto_sign_SECRETKEYBYTES: number;
  export const crypto_sign_BYTES: number;
  export function crypto_sign_keypair(publicKey: Uint8Array, secretKey: Uint8Array): void;
  export function crypto_sign_detached(
    signature: Uint8Array,
    message: Uint8Array,
    secretKey: Uint8Array,
  ): void;
  export function crypto_sign_verify_detached(
    signature: Uint8Array,
    message: Uint8Array,
    publicKey: Uint8Array,
  ): boolean;

  /**
   * Securely zero a buffer's bytes. Uses a compiler-barrier zero fill so the
   * write cannot be optimized away. See
   * https://libsodium.gitbook.io/doc/memory_management#zeroing-memory
   */
  export function sodium_memzero(buf: Uint8Array): void;
}
