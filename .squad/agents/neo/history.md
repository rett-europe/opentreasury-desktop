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
