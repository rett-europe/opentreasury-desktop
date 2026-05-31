// SPEC-027 / crypto-spec §8 — Ed25519 detached signatures via sodium-native.
//
// The audit log signs each entry with a per-device Ed25519 key. Pure: no
// Electron, no fs. Key persistence (MK-sealing) is handled by the AuditLog,
// not here.

import sodium from 'sodium-native';

export const ED25519_PUBLIC_KEY_BYTES = sodium.crypto_sign_PUBLICKEYBYTES; // 32
export const ED25519_SECRET_KEY_BYTES = sodium.crypto_sign_SECRETKEYBYTES; // 64
export const ED25519_SIGNATURE_BYTES = sodium.crypto_sign_BYTES; // 64

export interface Ed25519Keypair {
  /** 32-byte public key. */
  readonly publicKey: Uint8Array;
  /** 64-byte secret key (libsodium layout: seed||publicKey). */
  readonly secretKey: Uint8Array;
}

/** Generate a fresh Ed25519 keypair. */
export function generateEd25519Keypair(): Ed25519Keypair {
  const publicKey = Buffer.allocUnsafe(ED25519_PUBLIC_KEY_BYTES);
  const secretKey = Buffer.allocUnsafe(ED25519_SECRET_KEY_BYTES);
  sodium.crypto_sign_keypair(publicKey, secretKey);
  return { publicKey, secretKey };
}

/** Detached Ed25519 signature over `message`. Returns a 64-byte signature. */
export function signEd25519(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  if (secretKey.length !== ED25519_SECRET_KEY_BYTES) {
    throw new Error(`secret key must be ${ED25519_SECRET_KEY_BYTES} bytes`);
  }
  const sig = Buffer.allocUnsafe(ED25519_SIGNATURE_BYTES);
  sodium.crypto_sign_detached(sig, message.length > 0 ? message : Buffer.alloc(0), secretKey);
  return sig;
}

/** Verify a detached Ed25519 signature. Returns false on any mismatch. */
export function verifyEd25519(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  if (signature.length !== ED25519_SIGNATURE_BYTES) return false;
  if (publicKey.length !== ED25519_PUBLIC_KEY_BYTES) return false;
  return sodium.crypto_sign_verify_detached(
    signature,
    message.length > 0 ? message : Buffer.alloc(0),
    publicKey,
  );
}

/** Derive the public key embedded in a libsodium Ed25519 secret key. */
export function publicKeyFromSecret(secretKey: Uint8Array): Uint8Array {
  if (secretKey.length !== ED25519_SECRET_KEY_BYTES) {
    throw new Error(`secret key must be ${ED25519_SECRET_KEY_BYTES} bytes`);
  }
  // libsodium secret key layout is seed (32) || public key (32).
  return Buffer.from(secretKey.subarray(ED25519_SECRET_KEY_BYTES - ED25519_PUBLIC_KEY_BYTES));
}
