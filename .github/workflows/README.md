# .github/workflows/

> **Status:** **CI to be added.** No workflows are committed yet.

Per [ADR-002 §10](../../docs/architecture/adr-002-repo-structure.md), CI workflows are
deferred to a dedicated ADR and PR after the repo structure is accepted and the first
`app/` source lands.

## Intended workflows (deferred)

- **`ci.yml`** — on every PR: lint, type-check, unit tests, integration tests (in-memory
  storage adapter), Electron hardening check (e.g., `electronegativity`), `npm audit`
  gate ([R9](../../docs/security/security-requirements-v0.1.md)),
  `gitleaks`/`trufflehog` secret scan
  ([R14](../../docs/security/security-requirements-v0.1.md)),
  module-boundary guard ([ADR-002 §8](../../docs/architecture/adr-002-repo-structure.md)).
- **`release.yml`** — on tag: build Windows installer, sign update payload with Ed25519
  (key from CI vault, [R13.1](../../docs/security/security-requirements-v0.1.md)), publish
  to GitHub Releases with detached signature + SHA-256 checksums
  ([AR9](../../docs/security/security-requirements-v0.1.md)).
- **`security-scheduled.yml`** — weekly: dependency audit, SBOM generation
  ([R10](../../docs/security/security-requirements-v0.1.md)).

## Constraints binding on every future workflow

- CI private keys (update-signing Ed25519) live **only** in GitHub Actions secrets.
  Never on developer machines.
- No workflow may publish an artifact that was not built in a clean runner from a
  pinned commit ([R10](../../docs/security/security-requirements-v0.1.md)).
- A failed security gate (secret leak, high/critical audit finding, boundary violation)
  MUST block merge.
