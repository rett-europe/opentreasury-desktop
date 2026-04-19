# Project Context

- **Owner:** Pedro (perocha)
- **Project:** OpenTreasury Desktop — Electron-based treasury management for NGOs. Desktop version of the cloud-based rett-europe/opentreasury, designed to work without complex cloud setup.
- **Stack:** Electron (frontend), rest TBD. Reference app: Angular 19 + Python FastAPI + Cosmos DB + Entra ID on Azure.
- **Created:** 2026-04-19

## Key Reference

The cloud version (rett-europe/opentreasury) features:
- Transaction management with categories, subcategories, and tags
- Multi-account support (bank accounts + PayPal)
- Excel/CSV import from bank exports, Excel export for accounting
- Dashboard with account balances and monthly summary
- RBAC (Admin / Viewer)
- Audit trail, soft deletes
- Multi-language support (Spanish + English)

The desktop version aims to replicate this functionality without requiring Azure infrastructure.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-04-19: Product Vision v0.1 exists (team context)
Link drafted `docs/product/vision.md`. Core bet: **OneDrive is the database** — no Azure, no backend, no custom auth (folder ACLs = auth). 7 principles established. Three high-risk architecture items are explicitly routed to me: (1) OneDrive concurrency/conflict resolution, (2) file corruption + snapshot strategy, (3) tech stack (Electron + framework TBD, Tauri on the table). Scope/principles are now decided team context — architecture work must align with the vision. Open questions Q1/Q3 block my ADR work (tech stack, data file format).

### 2026-04-19: ADR-001 tech stack proposed
Wrote `docs/architecture/adr-001-tech-stack.md` (Proposed). Three options evaluated:
- **A**: React + TS + append-only JSON event log (UUID files) + derived SQLite read model + `age` file-level crypto
- **B**: Svelte + TS + SQLCipher single DB file
- **C**: React + TS + Yjs CRDT + encrypted blob

**Recommended: A.** Core insight: the OneDrive conflict problem is solved **by filename, not by a merge function**. UUID-named immutable files per event = zero conflicts by construction. Event sourcing also gives the audit log for free (matches cloud parity). Option B is a non-starter because a single binary SQLite file in a shared OneDrive folder cannot survive multi-writer offline edits — OneDrive will produce `treasury-LaptopA.db` duplicates and we have no merge function. Option C is correct but too complex for volunteer contributors and produces opaque binaries that violate "your data, your file".

**Tension to watch:** File-level encryption kills OneDrive web-UI search of donor data. This is explicit in the ADR — Pedro must accept it. If Switch forces a single encrypted container instead, the conflict story regresses toward Option B territory and the ADR needs revision.

**Gates before ADR→Accepted:** Switch writes `docs/security/crypto-spec.md` covering `age` + Argon2id + OS keychain (DPAPI/Keychain/libsecret). Also need a OneDrive spike at 10k+ event files before committing to date-partition scheme.

**Lesson to carry forward:** When OneDrive is the transport, never design a data model that requires two writers to modify the same byte range of the same file. Design so writes land in different *files*, always.

## 2026-04-19 — Cross-agent note (from Scribe)
- Switch's Security Requirements v0.1 is live at `docs/security/security-requirements-v0.1.md`.
- ADR-001 must satisfy the 15 stack constraints in §5 before moving from Proposed to Accepted.

### 2026-04-19: ADR-001 Accepted — security conditions locked
Switch signed off ADR-001 with conditions C1–C15. Option A confirmed with spec adjustments: `sodium-native` XChaCha20-Poly1305 envelope supersedes `age`; OS-keychain only (no Argon2id passphrase in v1); `@napi-rs/keyring` instead of deprecated `keytar`; ULID filenames replace timestamp scheme. Crypto spec at `docs/security/crypto-spec.md` is the implementation bar. One non-blocking spike remains on me: 10k event files OneDrive stress test before GA. May file a short ADR addendum for the filename + sodium-native supersession for cleanliness.


### 2026-04-19: ADR-002 Proposed — repo structure
Published `docs/architecture/adr-002-repo-structure.md` (Status: Proposed) and scaffolded the folders: `docs/ux/`, `docs/design/`, `docs/specs/` (with README + _template.md), `scripts/`, `.github/workflows/` + `.github/ISSUE_TEMPLATE/` + `pull_request_template.md`.

**Chosen layout (high level):**
- Single `app/` package (flat, no monorepo tool for now). Structure *described* in ADR, *not scaffolded on disk* — premature until Pedro answers the package-manager + monorepo-tool questions.
- Inside `app/src/`: `main/` + `preload/` + `renderer/` as physical filesystem boundaries; `shared/` for IPC + event Zod schemas (pure TS, no Electron); `core/` event-sourced domain (Electron-free, fs-free, testable under plain Node); `crypto/` pure-function module with only `sodium-native` + `@napi-rs/keyring` imports allowed; `storage/` adapter interface + OneDrive-folder node:fs impl + in-memory impl for tests; `read-model/` SQLite cache with its own keychain key distinct from the DEK (C14).
- Module boundaries enforced by ESLint `import/no-restricted-paths` + TS project references + CI grep (belt and suspenders).
- Mermaid dependency diagram in ADR §4.2 documents allowed vs forbidden edges.

**SDD layout locked:** `docs/` split into `product/` (Link), `architecture/` (me — ADRs), `security/` (Switch), `ux/` (Niobe), `design/` (Mouse), `specs/` (feature technical specs with mandatory `## Traceability` section tying each spec back to PRDs + ADRs + C1–C15 + R1–R20 + crypto-spec §-numbers).

**PR template enforces:** branch discipline (trunk-based), spec ref with status (Accepted required for implementation PRs), ADR-001 conditions cited, full security checklist, tests, status-history update.

**Deliberately deferred:** `app/` source tree, CI workflows (their own ADR), CODE_OF_CONDUCT / CONTRIBUTING, `docs/guides/`.

**Open questions awaiting Pedro (block Proposed → Accepted):**
1. Package manager — npm (recommended) / pnpm / yarn
2. Monorepo tool — none (recommended) / Nx / Turborepo
3. TS strictness — strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes (recommended)
4. `app/` vs `apps/opentreasury-desktop/` — flat `app/` recommended
5. Tests — hybrid (co-located unit, separate integration+e2e) recommended

**Lesson carried forward:** structure decisions are cheap to write and expensive to retrofit. Putting module boundaries in the filesystem (not just convention) means renderer-leaks and crypto-imports get caught by `tsc` before code review instead of in a post-mortem.

## 2026-04-19 — Team update (via Scribe)
Link's roadmap v1 + PRDs 001–003 and Niobe's UX plan both depend on ADR-002 being Accepted. Your 5 open questions to Pedro (package manager, monorepo tool, TS strictness, app/ layout, tests layout) block acceptance.

### 2026-04-19: ADR-002 Accepted — all 5 questions resolved
Pedro resolved all 5 open questions. Locked-in decisions:
1. **Package manager:** npm (parity with cloud opentreasury).
2. **Monorepo tool:** none — single `app/` with `tsc -b` project references.
3. **TS strictness:** `strict: true` + `noUncheckedIndexedAccess: true` + `exactOptionalPropertyTypes: true` — all three on.
4. **Top folder:** flat `app/` (not `apps/opentreasury-desktop/`).
5. **Tests:** hybrid — co-located `*.test.ts` for units, `tests/integration/` + `tests/e2e/` separate.

Updated `docs/architecture/adr-002-repo-structure.md`: Status Proposed → Accepted (Decided 2026-04-19), §9 open questions annotated RESOLVED inline (kept for traceability), §4 language moved from "recommended/TBD" to definitive, added §11 Implementation Next Steps, added Changelog.

**Next step:** Scaffold the `app/` source tree in a dedicated follow-up PR — NOT part of this ADR commit. That PR lands: `app/package.json` (npm), `app/tsconfig.base.json` + per-subproject configs with project references, ESLint with `import/no-restricted-paths`, Vitest for unit tests (proposed), Playwright for E2E, CI grep/lint for §4.1 import boundaries. Downstream work (Link's PRDs, Niobe's UX spec plan, Morpheus/Trinity implementation ticketing) is now fully unblocked.

**Lesson:** Keeping the "Options Considered" / "Open Questions" sections in the ADR *after* acceptance (with RESOLVED markers) pays for itself the first time someone asks "why npm and not pnpm?" six months later. Don't delete the reasoning trail — annotate it.

### 2026-04-19: Roadmap + PRDs updated by Link
- i18n framework selection is now an **M0 deliverable** (was M3). Need a short ADR or spec note before M0 kicks off — candidates: `i18next`/`react-i18next` vs FormatJS/`react-intl`.
- Storage scope narrowed: **OneDrive for Business / SharePoint only** in v1; Personal deferred to v1.x.
- ADR-002 repo structure ACCEPTED (my own decision, captured in decisions.md).

