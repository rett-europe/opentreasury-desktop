# scripts/

> **Status:** folder scaffolded — contents arrive with the first implementation PR.

Purpose: **build, packaging, release, and developer tooling** for OpenTreasury Desktop.

## Intended contents (deferred to first implementation PR)

- `dev.{ps1,sh}` — local dev runner (launches Vite + Electron in watch mode).
- `build.{ps1,sh}` — produces signed installer artifacts via `electron-builder`.
- `sign-update.{ps1,sh}` — CI-only; signs the update manifest + payload with the Ed25519
  private key from the CI vault (see [R13.1](../docs/security/security-requirements-v0.1.md)).
- `verify-release.{ps1,sh}` — verifies a published release's Ed25519 detached signature
  against the pinned public key (smoke test post-publish).
- `check-boundaries.{ps1,sh}` — grep-based CI guard that enforces the module boundaries
  declared in [ADR-002 §8](../docs/architecture/adr-002-repo-structure.md) (renderer cannot
  import from `src/main/` or `src/crypto/`; `src/crypto/**` imports only an allowlisted set;
  ULID filename patterns only).
- `gen-schemas.{ps1,sh}` — optional codegen from Zod schemas to JSON Schema / TS types
  where it helps.

## What does NOT belong here

- **Azure/Bicep/Terraform** — there is no cloud infrastructure in this project.
- **Secrets** — all secrets live in the CI vault ([R14](../docs/security/security-requirements-v0.1.md)).
- **One-off developer cleanup scripts** — keep those out of the committed tree.

## Related

- [`.github/workflows/`](../.github/workflows/) — CI pipelines that call into these scripts.
- [ADR-002 §10 Deferred](../docs/architecture/adr-002-repo-structure.md) — CI + release
  pipeline is its own future ADR.
