# Pull Request

<!--
  Thanks for contributing to OpenTreasury Desktop. Please complete every section
  below. PRs missing required references (spec, ADR conditions, security checklist)
  will be asked for revisions before review.
-->

## Summary

<!-- One or two sentences. What does this PR change, and why? -->

## Branch discipline

- [ ] Branched from `main` (trunk-based — no direct commits to `main`; see team
      decision 2026-04-19).
- [ ] Branch name follows the convention in
      [ADR-002 §7.1](../docs/architecture/adr-002-repo-structure.md): `feat/…`,
      `fix/…`, `docs/…`, `chore/…`, or `sec/…`.

## Spec reference

<!-- Every non-trivial change is traceable to a spec. -->

- **Feature spec:** <!-- link to docs/specs/NNN-...md or "N/A — see rationale below" -->
- **PRD (if applicable):** <!-- docs/product/prds/... -->
- **Spec status at merge time:** <!-- Draft / In Review / Accepted -->
  *(Implementation PRs MUST cite a spec in **Accepted** status — see
  [`docs/specs/README.md`](../docs/specs/README.md).)*

If **N/A**, justify (typo fix, dependency bump, ADR-only change, etc.):

> …

## ADR conditions satisfied

<!-- Cite every ADR-001 condition (C1–C15) and any other ADR this PR's implementation
     must satisfy. See docs/architecture/adr-001-tech-stack.md §9.2. -->

- [ ] **ADR-001 conditions:** C…, C…
- [ ] **ADR-002 (repo structure):** module boundaries respected (renderer does not
      import from `src/main/` or `src/crypto/`).
- [ ] **Other ADRs:** <!-- ADR-003, … -->

## Security checklist

<!-- Required on every PR. If the box does not apply, write "N/A" and one-line why. -->

- [ ] No plaintext PII or financial data in committed files or logs
      ([R1](../docs/security/security-requirements-v0.1.md),
       [R15](../docs/security/security-requirements-v0.1.md)).
- [ ] No secrets, keys, tokens, or signing material in the diff
      ([R14](../docs/security/security-requirements-v0.1.md)).
- [ ] AEAD envelope unchanged OR change is reviewed in
      [`crypto-spec.md`](../docs/security/crypto-spec.md) §2.1
      ([C1](../docs/architecture/adr-001-tech-stack.md),
       [C2](../docs/architecture/adr-001-tech-stack.md)).
- [ ] Electron hardening unchanged OR loosening reviewed by Switch
      ([R11](../docs/security/security-requirements-v0.1.md),
       [C7](../docs/architecture/adr-001-tech-stack.md)).
- [ ] New IPC channels are schema-validated at the preload/main boundary
      ([R12](../docs/security/security-requirements-v0.1.md),
       [C13](../docs/architecture/adr-001-tech-stack.md)).
- [ ] New native dependency? Switch approval obtained (pre-approved: `sodium-native`,
      `@napi-rs/keyring`; anything else blocks merge until reviewed —
      [R9](../docs/security/security-requirements-v0.1.md),
      [C15](../docs/architecture/adr-001-tech-stack.md)).
- [ ] New user-entered or imported data path validated with Zod
      ([R17](../docs/security/security-requirements-v0.1.md)).
- [ ] Filenames for encrypted artifacts are ULID/opaque; no PII or amounts in names
      ([R3](../docs/security/security-requirements-v0.1.md),
       [C11](../docs/architecture/adr-001-tech-stack.md)).
- [ ] Switch review requested (required for any PR touching `src/crypto/**`,
      `src/main/windows/**`, `src/preload/**`, IPC contracts, audit log, escrow, or
      update/release tooling).

## Tests

- [ ] Unit tests added / updated.
- [ ] Integration tests added / updated (where the feature crosses core + crypto +
      storage).
- [ ] E2E coverage considered (if a user-visible flow changed).
- [ ] All lint/format/type-check/test gates pass locally.

## Traceability

<!-- After merge, update the spec's Status History table with this PR's commit SHA
     and move the spec to Implemented when fully shipped in this PR. -->

- [ ] Spec `## Status History` updated with this PR's commit (at merge time).
- [ ] If this PR changes an ADR condition's enforcement, note in the ADR.

## Notes for reviewers

<!-- Anything specific you want reviewers to focus on: risky area, perf note, a
     pending follow-up, a decision worth revisiting later, etc. -->
