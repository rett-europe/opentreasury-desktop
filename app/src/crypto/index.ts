// Crypto module — pure functions, no electron, no fs (ADR-002 §4 / §2.5 / §4.1).
// Allowlisted imports: sodium-native, @napi-rs/keyring, node:crypto, node:buffer (ADR-001 C15).
//
// Nothing exported yet. Envelope, sealed-box, signatures, hash, keychain, escrow modules
// land here per crypto-spec §11 implementation checklist.
export {};
