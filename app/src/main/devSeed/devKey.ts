// =============================================================================
// DEV-ONLY. Do not ship to production. Do not import outside dev-seed code.
// =============================================================================
//
// SPEC-026 cleanup — see .squad/decisions.md D3 / Pedro directive 2026-05-13.
//
// The dev-seed flow writes through the production EncryptedMultiDeviceEventLog
// so every `npm run dev` launch exercises the real crypto path (catches
// regressions Switch would otherwise miss). To make that work without dragging
// the user through a 12-word setup wizard on every launch, the dev workspace's
// recovery code is a hard-coded constant — the canonical BIP39 test mnemonic
// (`abandon abandon ... about`). It is a valid 12-word phrase by construction
// (the BIP39 spec ships it as a known-good test vector), so it satisfies the
// same validateMnemonic + Argon2id derivation path real recovery uses.
//
// Security implications (Cypher review pending — work item #5 of Keaton plan):
//   - This mnemonic must NEVER be present in a production bundle. The
//     `assertDevEnvironment()` call below throws at module load if NODE_ENV is
//     'production', a defense-in-depth backstop on top of bundler tree-shaking.
//   - Any workspace whose recovery code is this constant is, by definition, a
//     dev-only throwaway. Users running real treasury data through dev-seed
//     would be vulnerable to anyone with this repo — that is the intended
//     containment.
//   - The constant is exported deliberately (not re-derived) so test code can
//     reproduce the same MK without invoking dev-seed.
//
// Provenance: BIP39 test vector — see
// https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki and
// `bip39/test/vectors.json`. This is the lowest-entropy valid 12-word phrase
// in the BIP39 test suite; picking a known test vector keeps the intent
// unambiguous to anyone grepping for "dev mnemonic".

/**
 * Throws if this module is loaded under a production NODE_ENV. Defense in
 * depth: even if the bundler fails to tree-shake the dev-seed path out of a
 * packaged build, importing this file at runtime aborts immediately so the
 * dev mnemonic can never reach production users.
 */
function assertDevEnvironment(): void {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(
      '[devSeed/devKey] DEV-ONLY module loaded under NODE_ENV=production. ' +
        'This is a build/bundling bug — dev-seed code must be tree-shaken from ' +
        'production builds. Refusing to expose the dev recovery code.',
    );
  }
}

assertDevEnvironment();

/**
 * 12-word BIP39 dev-only recovery code.
 *
 * DO NOT use this for any workspace containing real data. Anyone with access
 * to this repository can derive the recovery key and decrypt the workspace.
 */
export const DEV_RECOVERY_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
