/**
 * Crypto core module — XChaCha20-Poly1305 AEAD, Argon2id KDF, BIP39 mnemonics.
 *
 * Public API surface for OpenTreasury encryption-at-rest (SPEC-026).
 * All functions are Electron-free (pure Node) for easy testing and security review.
 */

export { encrypt, decrypt, randomBytes, wipe } from './primitives.js';
export { generateNonce } from './nonce.js';
export { generateMasterKey, wrapKey, unwrapKey, type KeyWrap } from './masterKey.js';
export { encryptEvent, decryptEvent } from './event.js';
export {
  generateMnemonic,
  validateMnemonic,
  mnemonicToSeed,
  normalizeMnemonic,
} from './mnemonic.js';
export { deriveRecoveryKey, DEFAULT_ARGON2_PARAMS, type Argon2Params } from './recoveryKey.js';
