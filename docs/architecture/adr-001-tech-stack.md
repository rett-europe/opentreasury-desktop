# ADR-001 — Tech Stack for OpenTreasury Desktop

- **Status:** **Accepted (with conditions)** — 2026-04-19 (Switch security review)
- **Date:** 2026-04-19
- **Authors:** Neo (Lead / Architect)
- **Reviewers required:** ~~Switch (Security — final say on encryption)~~ ✅ signed off, Pedro (decision owner) ✅ encryption-at-rest accepted
- **Supersedes:** —

---

## 1. Context

OpenTreasury Desktop is a zero-infrastructure treasury app for small NGOs. Product Vision v0.1 (`docs/product/vision.md`) fixed the hard constraints:

- **Electron shell** (Pedro's decision — not in scope for this ADR)
- **OneDrive / SharePoint folder as the data store** — "the database is a folder"
- **PII in the data** (donor names, phone numbers, emails) → **encryption at rest is a MUST-HAVE** (Pedro, 2026-04-19)
- **Offline-capable by default** — app must work with no connectivity; OneDrive syncs when it can
- **Multi-user via folder sharing** — 2–3 concurrent treasurers on different machines, eventually consistent
- **Feature parity** with cloud `rett-europe/opentreasury` (Angular 19 + FastAPI + Cosmos DB + Entra ID)
- **Spec-Driven Development** — clear traceability from `docs/specs/*` to code
- **Small team, volunteer treasurers as users** — boring tech wins (Principle 7)

The existing `prototype/` is React/JSX (in-browser Babel, no build step, no TypeScript). Pedro has explicitly said the prototype is a **UX reference, not a stack commitment.**

This ADR proposes 2–3 candidate stacks, compares them, and recommends one — subject to Switch's security review.

---

## 2. Decision Drivers

In rough priority order (tie-breakers applied top-down, per vision Principle 7 "boring wins"):

1. **Data-loss resistance under OneDrive sync conflicts** — the single hardest problem. A stack that makes conflicts trivially resolvable beats one with marginally better DX.
2. **Encryption-at-rest feasibility** — must integrate cleanly; no hand-rolled crypto.
3. **Offline-first correctness** — no hidden assumptions that "it'll be online eventually".
4. **Operational simplicity** — small team, no dedicated frontend/backend/devops split.
5. **Spec → code traceability** — schema-first tooling preferred.
6. **Cross-platform packaging** (Windows first, macOS + Linux deferred but should not be architecturally excluded).
7. **Team familiarity with existing ecosystem** (React prototype exists; re-use what's useful, don't over-index).

Non-drivers (deliberately ignored):
- Renderer performance benchmarks — this is a CRUD app with hundreds-to-low-thousands of transactions, not a 60fps game.
- Bundle size — it's a desktop install, not a SPA over a 3G link.

---

## 3. Options Considered

### Option A — React + TypeScript + Append-only JSON event log + SQLite read model + libsodium (`age`) encryption

**Stack summary**
| Layer | Choice |
|---|---|
| Renderer framework | React 18 + TypeScript |
| State management | Zustand (lightweight, no boilerplate) or Redux Toolkit if audit-store needs suit it |
| Data layer | Append-only JSON event files (`events/YYYY/MM/{uuid}.json`) + local SQLite **read model** rebuilt from events |
| Crypto | `age` (libsodium-backed, modern, audited) — encrypt each event file at write time |
| Key source | Passphrase-derived (Argon2id) **OR** OS keychain (Win DPAPI / macOS Keychain / libsecret) — Switch decides |
| Build / packaging | Vite + electron-builder (Windows NSIS + MSI, macOS DMG+notarization, Linux AppImage) |
| Test tooling | Vitest (unit), Playwright (e2e Electron), Zod runtime validators on events |
| Specs → code | **JSON Schema** (or Zod schemas) per event type in `docs/specs/` → typed via `zod-to-ts` or `json-schema-to-typescript` |

**How it handles OneDrive sync + conflicts**
- **Each transaction = one immutable JSON event file**, filename `{timestamp}-{uuid}.json` under a date-partitioned folder.
- OneDrive's conflict mode on immutable-named files is **zero-conflict by construction** — a file with a new UUID name cannot collide with another client's file.
- "Mutations" (edit, delete, approve) are **new events referencing the original UUID** (`{type: "tx.edit", targetId: X, ...}`) — event sourcing. No file is ever rewritten.
- Local SQLite is a **derived read model**: replay events on startup or on folder-change events from `chokidar`. If corrupted, delete and rebuild — it's a cache, not a source of truth.
- Deleted events can never come back as duplicates (idempotent by UUID).

**How it handles encryption at rest**
- **File-level encryption per event.** Each `{uuid}.json` is written as `{uuid}.json.age`.
- `age` gives us a stable, auditable primitive (no home-grown AES-GCM glue code).
- Key derivation: passphrase → Argon2id → X25519 key pair. Key stored in OS keychain after first unlock so treasurers don't re-enter it every launch. Keychain entry is per-folder (vault ID).
- **Metadata leak surface:** filenames (UUIDs) and folder structure are not encrypted. Acceptable — UUIDs and dates in a folder name do not leak PII. Switch must validate.
- Trade-off made explicit: **OneDrive web search / preview of donor records is broken** — this is the price of encryption. Users search inside the app, not in OneDrive UI.

**Offline story**
- All reads and writes hit the local OneDrive folder; the OS OneDrive client syncs in background.
- App never makes a network call as part of normal CRUD.
- "Last synced" indicator comes from OneDrive client metadata (Windows: attribute bits; fallback: timestamp of most-recent foreign event).

**Build / distribution story**
- `electron-builder` — mature, handles EV code signing (Windows), Apple notarization, AppImage/deb.
- Auto-update via `electron-updater` pointing at GitHub Releases (no Azure needed).
- Cross-platform: first-class on Windows, Mac supported day-one, Linux AppImage community-supported.

**Fit with Spec-Driven Development**
- JSON Schema (or Zod) is the single source of truth per event type. Specs live in `docs/specs/events/{type}.schema.json`.
- Codegen: schema → TypeScript types + runtime validators in one step. PR reviews focus on the schema diff.
- Event log is **naturally audit-friendly** — matches the cloud audit-log feature-parity requirement without separate code.

**Pros**
- Conflict-proof by design (UUID-named immutable files). This is the #1 risk from the vision, neutralized.
- Event sourcing gives us the audit log for free — matches cloud feature parity without extra work.
- React re-uses the prototype's component library mental model (don't reuse code, reuse patterns).
- `age` is a boring, audited crypto primitive. Switch-friendly.
- SQLite read model = fast filters, sorts, search locally.

**Cons / risks**
- Event sourcing has a real learning curve — more design discipline required.
- Folder of many small files can tax OneDrive on very large histories (>50k events). Mitigation: monthly archive events into a single signed bundle.
- File-level crypto means OneDrive web search is dead. Pedro and Switch must accept this explicitly.
- Rebuild-read-model on corruption is fast in theory; we must prove it at 10k-event scale early.

**Complexity rating: Medium.**

**Unknowns (validate before commit)**
- OneDrive behavior on 10k+ small files: does sync stay healthy? (Spike test required.)
- Does `age` have a maintained Node binding we're comfortable with, or do we need to shell out? (`age-encryption` JS port exists; audit posture for Switch.)
- Does Windows DPAPI or generic `keytar` meet Switch's bar for key-at-rest storage?

---

### Option B — Svelte + TypeScript + Single encrypted SQLite file (SQLCipher)

**Stack summary**
| Layer | Choice |
|---|---|
| Renderer framework | Svelte 5 (runes) + TypeScript |
| State management | Svelte stores (built-in) |
| Data layer | **Single SQLite file** in the OneDrive folder, accessed via `better-sqlite3` |
| Crypto | **SQLCipher** — SQLite with transparent AES-256 page-level encryption |
| Key source | Passphrase → PBKDF2 → SQLCipher key, cached in OS keychain |
| Build / packaging | Vite + electron-builder |
| Test tooling | Vitest, Playwright |
| Specs → code | SQL migrations as the schema spec; optional Zod validators for API-layer types |

**How it handles OneDrive sync + conflicts**
- The whole database is **one file** (`treasury.db`).
- OneDrive's conflict behavior on a single binary file that changes on every write is **catastrophic**: when two treasurers edit offline, OneDrive produces `treasury.db` + `treasury-LaptopA.db` and **the app has no way to merge them**. One user's work must be discarded or manually re-entered.
- Mitigations are all painful: soft-lock file ("in use by Alice"), SQLite export-merge tooling, or a custom "reconcile" UI. None are transparent.
- **This is the dealbreaker.** The vision principle "OneDrive is the database" assumes shared-folder semantics. SQLCipher in a shared folder is single-writer at best.

**How it handles encryption at rest**
- SQLCipher is excellent — transparent, page-level, industry-standard. **Best-in-class on this axis.**
- One key per vault, stored in OS keychain. Simple.

**Offline story** — Perfect (local file). But see conflict problem above.

**Build / distribution story** — Same as Option A. SQLCipher adds a native-build dependency (headers, platform-specific binaries) which complicates CI.

**Fit with Spec-Driven Development** — SQL migrations are specs. Workable but not as naturally traceable as JSON Schema per event type.

**Pros**
- Simplest data model — "it's just a database".
- SQLCipher is the gold standard for encrypted SQLite; Switch will likely approve it quickly.
- Fast queries out of the box (no replay, no read-model rebuild).
- Lowest conceptual overhead for future contributors.

**Cons / risks**
- **OneDrive multi-writer conflict on a single binary file is unsolvable without a custom merge layer.** This violates the core product premise.
- Native binary (`better-sqlite3` + SQLCipher) complicates cross-platform packaging — separate binaries per OS/arch.
- No natural audit log (would need to hand-build).
- "Repair the DB" when OneDrive desyncs is an ugly user experience.

**Complexity rating: Low (single machine). High (multi-writer).**

**Unknowns**
- Is there a realistic single-writer UX ("lock the file while Alice has it open")? Even if yes, this contradicts the offline-first principle.

---

### Option C — React + TypeScript + Yjs CRDT + encrypted snapshot

**Stack summary**
| Layer | Choice |
|---|---|
| Renderer framework | React 18 + TypeScript |
| State management | Yjs document as both state and persistence |
| Data layer | **Yjs CRDT** serialized to `vault.bin` in OneDrive; periodic snapshot + update log |
| Crypto | Snapshot + updates encrypted with `age` before write |
| Key source | Same as Option A — passphrase + keychain |
| Build / packaging | Vite + electron-builder |
| Test tooling | Vitest, Playwright |
| Specs → code | TypeScript interfaces; Yjs shape is the schema (weakly typed at boundaries) |

**How it handles OneDrive sync + conflicts**
- Yjs CRDT = mathematical guarantee that any two replicas **always converge to the same state**, no matter the merge order.
- When two treasurers edit offline and OneDrive produces `vault.bin` + `vault-LaptopA.bin`, we detect both, load both, merge via Yjs, write the merged state. No user-facing conflict.
- This is theoretically the **most correct** answer to the multi-writer-offline problem.

**How it handles encryption at rest**
- Encrypt the snapshot blob + each update blob. Same `age` primitive as Option A.
- Harder to do partial decrypt / paging — everything is loaded into memory.

**Offline story** — Perfect. CRDTs are designed for this.

**Build / distribution story** — Same as Option A.

**Fit with Spec-Driven Development** — Weak. Yjs shape is defined in code, not in a portable schema. Spec discipline requires us to write wrappers.

**Pros**
- Strongest correctness guarantee for multi-writer offline convergence.
- No "which version wins" question — ever.
- Yjs is mature (ProseMirror, tldraw, many production users).

**Cons / risks**
- **Huge conceptual overhead** — CRDT debugging is hard, contributor ramp-up is steep. Violates "boring tech wins".
- **No natural audit log / human-readable ledger** — the file is a CRDT binary, not inspectable. Recovery tooling is custom.
- Loading the whole vault into memory scales badly past ~100k operations.
- Schema evolution is harder (Yjs shape changes are not free).
- Opaque binary in OneDrive = Pedro's data is not "just a JSON file he can read" — violates Principle 3 ("your data, your file").

**Complexity rating: High.**

**Unknowns**
- Real-world Yjs performance at 10k+ transactions on mid-range hardware.
- Snapshot/compaction strategy without a server coordinating.

---

## 4. Comparison Matrix

| Axis | Option A — Event log + SQLite read model | Option B — SQLCipher single DB | Option C — Yjs CRDT |
|---|---|---|---|
| Renderer | React + TS | Svelte + TS | React + TS |
| State | Zustand | Svelte stores | Yjs doc |
| Data layer | JSON events + derived SQLite | Single encrypted SQLite file | Yjs CRDT binary |
| Crypto approach | File-level `age` per event | Page-level SQLCipher | Blob-level `age` |
| **Conflict strategy** | **Zero-conflict by construction (UUID files)** | **Unsolvable in shared folder** | **Automatic CRDT merge** |
| Complexity (small team) | Medium | Low single-user / High multi-user | High |
| Spec-driven fit | Strong (JSON Schema per event) | OK (SQL migrations) | Weak (code-defined) |
| Audit log | Free (event log IS the audit log) | Must hand-build | Must hand-build |
| User "owns the file" | Yes (readable JSON when decrypted) | Partial (opaque binary, but standard tool) | No (proprietary CRDT binary) |
| Cross-platform ease | High (pure JS) | Medium (native SQLCipher binary) | High (pure JS) |
| OneDrive search works on data | No (encrypted) | No (encrypted) | No (encrypted) |
| Switch-friendliness of crypto | Good (`age`, audited) | Excellent (SQLCipher) | Good (`age`) |

---

## 5. Recommendation

**Option A — React + TypeScript + append-only JSON event log + SQLite read model + `age` encryption.**

Option B is the simplest stack on one machine but its multi-writer conflict story is **incompatible with the product's core premise** — "OneDrive is the database" means multiple laptops writing offline and reconciling on sync, and a single binary SQLite file in a shared folder cannot do that safely. Option C is mathematically elegant but drops us into CRDT-debugging territory with a volunteer-staffed project and produces opaque binaries that violate the "your data, your file" principle. Option A threads the needle: UUID-named immutable event files **eliminate OneDrive conflicts by construction**, give us the audit log for free (feature parity with the cloud), use a boring audited crypto primitive (`age`), and keep the decrypted data as inspectable JSON. The derived SQLite read model keeps queries fast without making SQLite the system of record.

**This recommendation is conditional on Switch approving:**
- `age` (libsodium-backed) as the crypto primitive with Argon2id passphrase derivation,
- OS keychain (DPAPI / Keychain / libsecret via `keytar` or equivalent) as the key cache,
- Filename-level metadata (UUIDs, date-partitioned folders) as an acceptable non-secret,
- The explicit trade-off: **OneDrive web-UI search of donor data is broken by design**.

If Switch rejects file-level crypto in favor of, say, a single encrypted vault blob, we re-open the comparison (likely landing on a hybrid A+C — event log inside an encrypted container with out-of-band conflict markers). **The final ADR status moves to Accepted only after Switch's review.**

---

## 6. High-Level Architecture (Recommended Option)

```mermaid
flowchart TB
    subgraph User["User's Machine"]
        direction TB
        UI[Renderer Process<br/>React + TS<br/>Zustand store]
        MAIN[Main Process<br/>Electron<br/>File I/O + Crypto]
        KC[OS Keychain<br/>DPAPI / Keychain / libsecret]
        CACHE[(Local SQLite<br/>read model<br/>derived, rebuildable)]
    end

    subgraph OneDrive["OneDrive / SharePoint Folder<br/>(synced by OS client)"]
        direction TB
        META[vault.json<br/>vault metadata<br/>encrypted]
        EVENTS[events/YYYY/MM/<br/>{uuid}.json.age<br/>append-only event files]
        SNAPS[snapshots/<br/>YYYY-MM.bundle.age<br/>monthly archive]
    end

    TREAS[Treasurer] -- clicks --> UI
    UI <-- IPC --> MAIN
    MAIN -- derives/queries --> CACHE
    MAIN -- reads passphrase unlock --> KC
    MAIN -- writes encrypted events --> EVENTS
    MAIN -- reads + replays --> EVENTS
    MAIN -- writes/reads --> META
    MAIN -- archives monthly --> SNAPS

    OneDrive -. background sync .- CLOUD[(Microsoft 365<br/>OneDrive/SharePoint)]
    CLOUD -. delivers foreign events .- OneDrive

    style EVENTS fill:#f3edf8,stroke:#6d4d8c,stroke-width:2px
    style KC fill:#fff3cd,stroke:#856404
    style CACHE fill:#e6f4f2,stroke:#0f766e,stroke-dasharray: 4 4
```

**Reading the diagram:**
- The **renderer** never touches disk or crypto — strict IPC boundary (security hygiene for Switch to validate).
- The **local SQLite read model** is dashed because it is **derived state** — delete it anytime; the source of truth is the encrypted event files.
- **OneDrive is dumb transport** — no app logic lives in the cloud. Conflicts are resolved by filename uniqueness, not by a merge function.
- The **keychain** holds the data key only — the passphrase itself is never stored.

---

## 7. Consequences

**If accepted:**
- We commit to **event sourcing as the data model**. All features must be expressible as events. Niobe's UX specs and Link's PRDs should reflect this (e.g., "approve transaction" is a new event, not a mutation).
- Switch writes `docs/security/crypto-spec.md` defining the exact crypto choices (cipher, KDF, keychain integration, threat model). **Blocks any code that writes to disk.**
- We scaffold `app/` with Vite + Electron + React + TS + Zustand and a `packages/` structure allowing the event-schema package to be consumed by both main and renderer.
- We spike OneDrive behavior at 10k+ event files **before** locking in the date-partition scheme.

**If rejected / revised:**
- Most likely fallback is a hybrid (event log inside a single encrypted container). That re-opens Option B's conflict problem and needs a new ADR.

---

## 8. Open items blocking "Accepted" status

1. Switch's crypto review (`docs/security/crypto-spec.md`) — **required**.
2. Pedro's explicit acceptance that OneDrive web-UI search of donor data is broken by design.
3. Spike results: 10k event files in a OneDrive-synced folder — does sync stay healthy on Windows?
4. Confirm maintained Node bindings for `age` (or an equivalent audited libsodium wrapper).
5. Target OS decision from Pedro (Vision §14 Q5) — affects signing/notarization work.

---

*End of ADR-001 — **Accepted with conditions** 2026-04-19 (see §9 Security Review).*

---

## 9. Security Review — Switch (2026-04-19)

**Verdict: APPROVED WITH CONDITIONS. ADR-001 status moves from Proposed to Accepted.**

Option A threads the needle correctly: conflict-proof-by-construction event files solve the OneDrive concurrency problem without asking me to defend a single-writer binary blob, and file-level AEAD over UUID-named events is trivial to reason about. The recommendation is sound, but the implementation is bounded by the companion crypto spec published today: [`docs/security/crypto-spec.md`](../security/crypto-spec.md). That document is the bar. This ADR is Accepted only insofar as the implementation satisfies every item below. Any deviation requires a new ADR I must co-sign.

### 9.1 Supersessions of language in this ADR

Neo's §3 (Option A) is broadly approved, but the following textual choices are **superseded** by the crypto spec:

- **Crypto primitive:** `age` is **rejected as the on-disk format**. Accepted primitive is **XChaCha20-Poly1305 via libsodium (`sodium-native`)** with the envelope defined in `crypto-spec.md` §2.1 (magic + version + algorithm id + DEK version + nonce + AAD + ciphertext + tag). Rationale: we need DEK versioning, per-file AAD binding to `record_type`/`record_id`/`dataset_id`/`dek_version`, and crypto agility via a version byte — `age`'s envelope does not give us those without additional framing we'd have to specify anyway. Using libsodium directly is cleaner, audited (Cure53, NCC, Trail of Bits), and already required for Ed25519 signatures and X25519 sealed-box DEK wrapping. We end up depending on libsodium either way; dropping `age` removes a layer.
- **Key derivation:** Argon2id passphrase flow is **rejected for v1**. Device keypairs are generated from `crypto.randomBytes` and stored in the OS keychain. There is no passphrase surface. See `crypto-spec.md` §1.5.
- **Keychain library:** `keytar` is **FORBIDDEN** (deprecated upstream). Use **`@napi-rs/keyring`**. Mentioned in ADR-001 §3 Option A as "keytar or equivalent" — the equivalent is `@napi-rs/keyring`, not keytar.
- **Filename scheme:** Neo's "{timestamp}-{uuid}" is **amended** to **ULID** (or UUID v7). Timestamp-prefixed filenames leak activity patterns *and* let OneDrive search index them. ULID gives us sortable IDs without an exposed ISO timestamp prefix. Folder partitioning by year/month is acceptable (metadata surface ruling, `crypto-spec.md` §10).
- **DEK per dataset:** one DEK per NGO dataset, versioned, rotated on revocation. Confirmed. Historical files remain readable because every active device's escrow entry carries the full `wrapped_deks` history. See `crypto-spec.md` §6, §7.

### 9.2 Conditions of acceptance (binding on Neo / Morpheus / Trinity)

Each condition maps to a requirement in `security-requirements-v0.2` or an item in `crypto-spec.md` §11. Failing any blocks merge to `main`.

| # | Condition | Source |
|---|---|---|
| C1 | Encryption via `sodium-native` XChaCha20-Poly1305 with the exact envelope in `crypto-spec.md` §2.1. No `age`. No `crypto-js`. No DIY. | SR §5 C2, CS §1.1, CS §11 [AEAD-LIB] |
| C2 | AAD on every file binds `record_type`, `record_id`, `dataset_id`, `dek_version`. Tests assert decrypt fails on swap/replay. | SR R3, CS §2.1, CS §11 [AAD-BINDING] |
| C3 | Per-file 192-bit random nonces from `crypto.randomBytes`. No counters. | CS §2.1, CS §11 [NONCE] |
| C4 | Device X25519 + Ed25519 keypairs in OS keychain via `@napi-rs/keyring`. `keytar` not in the dep tree. | SR §5 C4, CS §2, CS §11 [KEYCHAIN] |
| C5 | DEK held in main-process memory only. Never crosses IPC. Never logged. Zeroed on quit. | CS §2, CS §11 [DEK-MEMORY] |
| C6 | Renderer cannot obtain key material under any code path. IPC surface schema-validated (Zod/Valibot/Ajv). | SR R11, SR R12, CS §11 [RENDERER-ISO] |
| C7 | Electron hardening: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strict CSP with **no `unsafe-inline`, no `unsafe-eval`, no CDN**, no `@electron/remote`, URL navigation allowlist. Automated check (e.g., `electronegativity`) in CI. | SR R11, SR §5 C1, C11 |
| C8 | `escrow.json` format matches `crypto-spec.md` §3 schema exactly. Canonical-JSON Ed25519 signature verified on every read. Bad sig = refuse to open. | CS §3, CS §11 [ESCROW-SIG] |
| C9 | First-setup, enrollment, revocation, and DEK rotation flows implemented per `crypto-spec.md` §4–§7. Admin must be online for enrollment approval. 6-char visual-code compare required. | CS §4–§7, CS §11 [ENROLLMENT], [ROTATION] |
| C10 | Append-only hash-chained Ed25519-signed audit log per `crypto-spec.md` §8. Chain break or bad signature = refuse to open + offer snapshot recovery. Signatures verified against `escrow.json` device pubkeys (including `revoked` entries for historical reads). | SR R5, R8; CS §8; CS §11 [AUDIT-CHAIN], [AUDIT-SIG] |
| C11 | All event/record filenames are ULID-based. No PII, no amounts, no donor names in any filename. CI grep gate enforces. | SR R3, CS §10, CS §11 [METADATA] |
| C12 | **Signed auto-updates with a pinned Ed25519 public key** (SR R13.1) — non-negotiable even in v1. Update private key lives in CI vault only. Failed signature = abort update, show visible error, no silent fallback. Installer Authenticode signing is deferred per AR9/AR10; the **update payload signature is NOT deferred**. | SR R13.1, CS §11 (implicit) |
| C13 | Signed IPC: `contextBridge.exposeInMainWorld` with narrow API surface; every message schema-validated; no dynamic dispatch; no renderer-supplied filesystem paths. | SR R12 |
| C14 | Local SQLite read model encrypted with a separate keychain-stored key (NOT the DEK). "Wipe local data" removes keychain entries and zero+unlinks cache files. | SR R6, CS §2, CS §11 [WIPE] |
| C15 | No native deps without Switch review. `sodium-native` and `@napi-rs/keyring` are pre-approved. SQLCipher is NOT required (we use plain better-sqlite3 for the *derived* cache + our own AEAD for the *source-of-truth* files). Add any other native dep = PR blocked pending review. | SR R9 |

### 9.3 Explicit accepted risks carried forward

These do not block acceptance but must be surfaced in user-facing docs and first-run wizard copy:

- **AR2** — revoked devices retain access to data they already decrypted. Built into the product model. Documented.
- **AR3** — OneDrive web-UI search does not work on encrypted data. Product-level trade-off, Pedro accepted.
- **AR9** — Windows SmartScreen warns on install (no EV cert in v1). Install guide must show the expected warning with screenshots; adoption metric triggers EV purchase revisit.
- **AR10** — macOS binary distribution **out of scope for v1**. Source-build only. Linux ships unsigned with checksum + Ed25519 detached signature.

### 9.4 On code-signing clarification (important)

The R-series requirement for signed updates is **NOT deferred** — only **commercial-CA installer signing** (Authenticode EV, Apple Developer ID) is deferred (AR9, AR10). We **continue to require**:

- Update payloads signed at CI publish time with an Ed25519 private key held in GitHub Actions secrets.
- The matching Ed25519 public key pinned inside the application binary.
- Auto-updater verifies the signature on every update check. Failed verification aborts with a visible error. No silent fallback.
- Linux AppImage/deb publishes with a detached Ed25519 signature using the same CI key; checksums in the release notes.

This gives us **end-to-end update integrity** without a paid CA. SmartScreen is cosmetic (trust display to the user at install time); update integrity is cryptographic (prevents a compromised download server or MITM from serving a malicious update). Conflating them would be a mistake.

### 9.5 Blockers resolved by this review

The ADR's own §8 listed 5 blockers. Status after this review:

1. ~~Switch's crypto review~~ ✅ **Done** — `docs/security/crypto-spec.md` published and this review.
2. ~~Pedro's acceptance of broken OneDrive-web-search on donor data~~ ✅ **Done** — AR3 accepted 2026-04-19.
3. **Spike: 10k event files in a OneDrive-synced folder** — **still open**, Neo-owned, non-blocking for crypto sign-off but required before GA. Not a security gate.
4. ~~Maintained Node bindings for `age`~~ — **moot**: `age` is no longer the primitive. `sodium-native` and `@napi-rs/keyring` are both maintained and cross-platform.
5. **Pedro: target OS decision (Vision Q5)** — **partially resolved by AR10**: v1 is Windows-first for binary distribution; macOS is source-only; Linux AppImage/deb unsigned with Ed25519 detached sig. If Pedro wants a different shape, reopen Vision Q5.

### 9.6 Summary

ADR-001 **Accepted (with conditions)** 2026-04-19. Option A is the stack. `crypto-spec.md` is the implementation bar. Morpheus and Trinity are unblocked for implementation-ticket breakdown; any ticket must cite which of C1–C15 it satisfies. Any change to crypto, keychain, or IPC boundaries requires a new ADR I co-sign.

— Switch
