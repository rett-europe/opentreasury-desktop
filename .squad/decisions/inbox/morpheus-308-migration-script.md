# Decision Note: Issue #308 — One-shot Migration Script

**Date:** 2026-05-11
**Author:** Morpheus
**Related issue:** #308
**Branch:** `squad/308-migration-script`
**Status:** Implemented (draft PR, awaiting review)

---

## Context

Pedro has 2 legacy v1 (plaintext) workspaces. The originally-planned in-app
migration UX (wizard in `app/src/core/crypto/migration.ts`) was **dropped** per
the 2026-05-11 rescope directive in `.squad/decisions.md`.

A one-shot terminal script ships instead. After Pedro's 2 workspaces are
migrated, this code path is effectively dead.

## Decisions Made

### 1. Script is self-contained `.mjs` — crypto logic inlined

**Decision:** Mirror `app/src/core/crypto/` primitives directly in
`scripts/migrate-workspace.mjs` rather than importing from TypeScript source.

**Rationale:** TypeScript `.ts` modules cannot be directly `import`-ed from a
plain Node `.mjs` script without a build step. The script needs to run with
`node scripts/migrate-workspace.mjs` with no pre-build. Inlining 5 small helper
functions (150 lines total) is less risk than adding a build dependency for a
one-shot tool.

**Constraint:** Any changes to the crypto primitives in `app/src/core/crypto/`
must be mirrored in the script. Functions are annotated with `mirrors: <file>`.

### 2. Migration device `wrap_safestorage` = recovery key wrap (placeholder)

**Decision:** The `devices[0].wrap_safestorage` in the generated `events.key` is
set to the same base64 value as `wrap_recovery` (MK wrapped under the Argon2id
recovery key).

**Rationale:** The `keyFileV2Schema` requires `devices.min(1)` and each device
entry must have a `wrap_safestorage` string. The script runs without Electron's
`safeStorage` API, so there is no legitimate safeStorage KEK to use. The
recovery key wrap is a valid stopgap: Pedro can open the workspace using the
recovery code on first launch, after which the app creates a proper
device-specific safeStorage wrap.

**Security implication (noted for Switch review):** The migration device entry
in `events.key` has its safeStorage field populated with recovery-derived
material, which is by design a lower-security path. However, the actual
protection comes from the recovery key (Argon2id-hardened). Pedro should
re-enroll his device in the app immediately after migration so a proper
safeStorage-wrapped entry replaces this placeholder.

### 3. `.pre-encryption.bak` is never auto-deleted

**Decision:** The original `events.ndjson` is renamed to
`events.ndjson.pre-encryption.bak` and **never deleted by the script or the
app**. Pedro deletes it manually after verifying the encrypted data.

**Rationale:** This is a one-way data migration. Erring on the side of
preserving the plaintext backup protects against bugs in this one-shot script.
Pedro is technically capable of deleting the file once he confirms the app works
correctly.

### 4. Key file written LAST (crash-safety)

**Decision:** `events.key` is written after the encrypted event file is fully
written, fsynced, and read-back verified.

**Rationale:** Per SPEC-026 §3.3, the key file is the "seal" of the migration.
A crash after the key file is written but before the events file is complete
would leave the workspace in an inconsistent state. Writing the key file last
ensures that if the script crashes mid-migration, the workspace remains in v1
state (recoverable by re-running the script).

### 5. ULID generation inlined

**Decision:** ULID generation is implemented inline in the script using BigInt
arithmetic. No `ulid` npm package is added.

**Rationale:** The `ulid` package is not in `package.json`. Adding it for a
one-shot migration script is unnecessary overhead. The inline implementation
(50 lines) matches the Crockford base32 spec and produces valid 26-char ULIDs.
