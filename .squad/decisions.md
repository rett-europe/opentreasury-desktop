# Squad Decisions

## Active Decisions

### 2026-04-19: Project scope — OpenTreasury Desktop
**By:** Pedro (project owner)
**What:** Build a desktop Electron app that replicates the functionality of rett-europe/opentreasury without requiring complex cloud setup (Azure, Cosmos DB, Entra ID). Tech stack beyond Electron is TBD.
**Why:** NGOs need simpler deployment — download and run, no Azure subscription required.

### 2026-04-19: Switch has FINAL SAY on security
**By:** Pedro (project owner)
**What:** Switch (Security Engineer) has final say on all security decisions — non-negotiable. Always adopt the most secure option.
**Why:** Financial data for NGOs requires rigorous security posture.

### 2026-04-19: Transaction list starts empty
**By:** Pedro (project owner)
**What:** Transaction list page starts EMPTY — user must select a date range (or preset) before data loads. No auto-loading on page open.
**Why:** UX decision from the cloud version — prevents overwhelming users with stale data.

### 2026-04-19: Product Vision v0.1 established (Link)
**By:** Link (PM), requested by Pedro
**What:** Product Vision document written at `docs/product/vision.md`.

**Core vision statement:**
> OpenTreasury Desktop is a zero-infrastructure treasury app for small NGOs — a cross-platform desktop app that turns a shared OneDrive/SharePoint folder into a fully-functional, multi-user treasury ledger. No Azure. No database to run. No IT department required.

**Scope-out / explicit deferrals (v1 will NOT include):**
- Custom authentication / user accounts — OneDrive folder permissions ARE the auth layer
- Role-Based Access Control (RBAC) — folder ACLs replace it
- Multi-tenant cloud SaaS, hosted backend, any network database
- Real-time collaborative editing (Google Docs-style)
- Mobile app, bank API integrations (PSD2), payroll, tax filing
- PDF/Excel export, reports module, attachments, recurring tx → v1.x
- Budgets/forecasts, multi-currency, bank feeds → Later

**Product principles (tie-breakers for future decisions):**
1. OneDrive is the database
2. Permissions = folder permissions (no app-level user system)
3. Spec before code (mirrors cloud repo `docs/specs/` discipline)
4. Feature parity through adaptation, not code translation
5. Offline-capable by default
6. Secure by default; Switch has final say on security
7. Boring technology wins

**Success metrics (privacy-respecting, no cloud telemetry):**
Time-to-first-transaction ≤10min, setup success ≥90%, ≥10 real NGO deployments in 3 months, ZERO data-loss incidents (hard floor), ≥95% auto-resolved sync conflicts, ≥80% cloud feature parity.

**Risks flagged (deferred to Neo/Switch):**
- OneDrive concurrency/conflict resolution (🔴 High, Neo)
- File corruption / snapshot strategy (🔴 High, Neo + Switch)
- Encryption at rest vs. OneDrive search trade-off (🔴 High, **Switch final say**)
- SharePoint vs OneDrive Personal vs Business API differences
- Tech stack decision (React/Angular/Svelte + Electron vs Tauri)
- Tamper-evident audit log without a server

**Repo structure proposed** (mirrors cloud repo, minus api/infra/deploy):
`docs/product/`, `docs/specs/`, `docs/architecture/`, `docs/ux/`, `docs/security/`, `docs/guides/`, `app/`, `prototype/` (kept as reference), `scripts/`, `installers/`, `tests/`.

**Open questions for Pedro (block next step — PRDs + tech stack ADR):**
1. Tech stack beyond Electron — preference or let Neo propose options?
2. OneDrive Personal + SharePoint/Business both, or pick one?
3. Data file format — folder of append-only JSON files acceptable? (huge merge-conflict implication)
4. Encryption at rest — required despite breaking OneDrive search? (Switch final say, needs business input)
5. Target OS v1 — Windows only, or Win+Mac+Linux?
6. Language — Spanish+English, or Spanish-only with i18n scaffold?
7. Prototype as v1 UX contract, or free to depart?
8. Proposed repo structure approved?

**Why:** Pedro requested a vision-first, spec-driven foundation mirroring the cloud repo's operating model. This locks down the product shape so PRDs, ADRs, and specs can be written against a stable reference.

### 2026-04-19: Neo proposes tech stack via ADR-001
**By:** Neo (Lead/Architect), requested by Pedro
**What:** ADR-001 written at `docs/architecture/adr-001-tech-stack.md` — Status: Proposed. Three options evaluated:
- **Option A** — React + TS + append-only JSON event log (UUID-named, immutable) + derived SQLite read model + `age` file-level encryption
- **Option B** — Svelte + TS + single SQLCipher DB file
- **Option C** — React + TS + Yjs CRDT + encrypted snapshot blob

**Recommendation:** Option A. Rationale: UUID-named immutable event files are zero-conflict by construction on OneDrive (the #1 risk from vision), give us the audit log for free (cloud feature parity), use boring audited crypto (`age`), and keep decrypted data inspectable (Principle 3: "your data, your file"). Option B's single binary file cannot survive multi-writer offline edits on a shared folder — dealbreaker. Option C is correct but too complex for a volunteer-staffed project and produces opaque binaries.

**Explicit trade-off accepted in the proposal:** OneDrive web-UI search of donor data is broken by design (file-level encryption). Pedro must accept this; Switch must validate.

**Status:** Proposed — **not yet Accepted.** Switch's security review of crypto choices (`age` + Argon2id + OS keychain) is a hard gate before acceptance. Pedro must also answer Vision Q5 (target OS) before installer work starts.

**Why:** Tech stack must be locked before any `app/` scaffolding, first PRDs, or feature specs. ADR exists so decision + rationale are reviewable before code is written.

### 2026-04-19: Security Requirements & Threat Model v0.1 (Switch)
**By:** Switch (Security Engineer, final say), requested by Pedro
**What:** Security Requirements & Threat Model v0.1 at `docs/security/security-requirements-v0.1.md`.

**Non-negotiable constraints Neo's ADR-001 MUST satisfy (full list in §5 of the doc):**

1. **Encryption at rest is mandatory.** AEAD only — `XChaCha20-Poly1305` (preferred) or `AES-256-GCM`. No plaintext PII or financial data in the OneDrive folder, ever. Filenames opaque (no PII leakage).
2. **No roll-your-own crypto.** Audited library required — libsodium via `sodium-native`, WebCrypto subtle, or `@noble/*`. Stack ADR must name the library and its auditors.
3. **Electron hardening:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strict CSP (no `unsafe-inline`, no `unsafe-eval`, no CDN), no `@electron/remote`, URL navigation allowlist, external links via `shell.openExternal` only.
4. **IPC discipline:** `contextBridge` with narrow API surface, schema-validated (Zod/Valibot/Ajv) at every boundary, no dynamic dispatch, no `eval`.
5. **Signed installers + signed auto-updates only** with pinned public key. Unsigned update = abort with visible error.
6. **Zero secrets in git.** Pre-commit + CI scan (`gitleaks` / `trufflehog`). Signing keys only in CI vault.
7. **PII never in logs.** Structured logger with allowlist redaction; lint rule against `console.log(obj)` of record data.
8. **Dependency policy:** lockfile required, `npm audit` gate in CI, no native deps without Switch review, no unreviewed install scripts.
9. **Append-only audit log, hash-chained, Ed25519-signed per entry.** Chain break at load time = refuse to open + point at snapshot recovery.
10. **Snapshots** of the encrypted dataset, minimum daily on active days.
11. **Identity = Microsoft account (OneDrive).** Folder ACL is the authorization boundary. No custom auth. This is a product constraint we harden against, not override.
12. **No telemetry/analytics libraries in v1** (no Sentry, no PostHog, etc.) without explicit Switch sign-off.
13. **Crypto agility:** version byte + algorithm id on every encrypted artifact.

**Recommended key-management approach (R4 in the doc): "Shared-folder escrow with per-user wrapping"**

- One **DEK** per NGO dataset, encrypts all records.
- DEK stored **wrapped per user** in `.treasury/keys.json` in the OneDrive folder.
- Each user has an **X25519 keypair** generated on first launch, stored in the **OS keychain** (DPAPI / macOS Keychain / libsecret). Private key never leaves the device in plaintext.
- Adding a member: an existing member wraps the DEK to the new member's published public key (from `.treasury/pubkeys/{user_id}.pub`).
- Removing a member: rotate DEK, re-wrap for remaining members, omit the removed user. Historical records stay readable with the old DEK (rotation-aware, accepted risk AR2).
- Escrow file changes are Ed25519-signed and logged in the audit trail.
- **Admin role = escrow-edit signing privilege** (lives in the escrow file, not app-level RBAC).

**Alternatives explicitly rejected:**
- (a) Shared passphrase everyone knows — no revocation, degrades to Teams-chat sharing. ❌
- (b) Per-user key wrapped by a shared secret — same distribution problem. ❌
- (d) Microsoft Graph-based key derivation — requires app reg + OAuth, violates "no custom auth". ❌ (revisit v2)
- (e) Hardware tokens — unrealistic for volunteer NGOs. ❌ (deferred)

**Accepted risks (v1), documented in §6:**
- AR1: MS-account compromise = compromised member's data access (inherent to file-based model).
- AR2: Revoked members retain access to data they already decrypted (symmetric crypto reality).
- AR3: OneDrive server-side search does not work on encrypted content (in-app search does).
- AR7: Insider with folder-write can delete the audit log entirely (detectable, not preventable without a server).
- Full list in the doc — see §6.

**Open security questions for Pedro (block v0.2 sign-off, see §7):**
1. Escrow admin model — first-setup member becomes admin, or explicit named admin? How many admins simultaneously?
2. Audit log visibility — all members, admins only, or export-on-request?
3. Encryption scope — any fields Pedro wants left searchable by OneDrive? (default: encrypt everything PII/financial, accept AR3)
4. Multi-device per user — support one user on multiple laptops? (default: yes, one escrow entry per device)
5. Incident response expectation — "remove user → rotate → accept AR2" acceptable, or "burn it all down, migrate to new dataset"?
6. EV code-signing cert on Windows (~$300–500/yr) — willing to pay? Without it, SmartScreen warns non-technical treasurers on every install.

**Why:** Pedro tasked Switch with setting the security constraints v1 must meet. Encryption at rest is mandatory; identity stays Microsoft; folder ACL is authorization; custom auth is out. Neo's ADR-001 is now constrained by §5 of this document. Switch has final say per team decision 2026-04-19.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
- Switch has FINAL SAY on all security decisions
