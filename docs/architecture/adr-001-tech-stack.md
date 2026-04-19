# ADR-001 — Tech Stack for OpenTreasury Desktop

- **Status:** Proposed
- **Date:** 2026-04-19
- **Authors:** Neo (Lead / Architect)
- **Reviewers required:** Switch (Security — final say on encryption), Pedro (decision owner)
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

*End of ADR-001 (Proposed).*
