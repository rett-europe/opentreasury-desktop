# Decision: Security Review of PR #314 (Migration Script)

**Date:** 2025-07-07
**Author:** Switch (Security)
**PR:** #314 (`squad/308-migration-script`)
**Verdict:** APPROVE

## Context

One-shot terminal script `scripts/migrate-workspace.mjs` converts Pedro's 2 legacy v1 plaintext workspaces to v2 encrypted format. Dead code after migration.

## Key Finding: `wrap_safestorage` Placeholder

The migration writes `wrap_safestorage = wrap_recovery` (a placeholder, not a real OS-encrypted blob) into the migration device entry.

**Safe because:**
1. The migration device ID will never match Pedro's real device ID → app routes to `join` flow, not `unlock`.
2. Even if deviceId matched, `safeStorage.decryptString()` would throw on a foreign blob → catch routes to recovery.

**Latent risk:** No structural discriminator in the schema. Recommend a `migration_placeholder` flag or at minimum a code comment in `keyFile.ts`.

## Verification

- AAD construction: ✅ matches runtime
- BIP39 path: ✅ `generateMnemonic(128)` → 12 words
- Argon2id params: ✅ m=65536, t=4, p=1
- Atomicity: ✅ original only renamed after full verification
- File modes: ✅ 0o600 on POSIX
- Power-failure: ✅ safe (incomplete state leaves original valid)
- Gates: typecheck ✅, lint ✅, format ✅, tests ✅ (flaky unrelated timeout only)

## Decision

Approve. No blocking security issues. One medium-advisory for future hardening (discriminator tag).
