# Project Context

- **Owner:** Pedro (perocha)
- **Project:** OpenTreasury Desktop — Electron-based treasury management for NGOs. Desktop version of the cloud-based rett-europe/opentreasury, designed to work without complex cloud setup.
- **Stack:** Electron (frontend), rest TBD. Reference app: Angular 19 + Python FastAPI + Cosmos DB + Entra ID on Azure.
- **Created:** 2026-04-19

## Key Reference

Security considerations for Electron desktop treasury app:
- Electron hardening: contextIsolation, nodeIntegration=false, sandbox, CSP
- Local data encryption for financial records
- Auth model for desktop (no Entra ID — local or simplified auth?)
- IPC security between main/renderer processes
- Preload script security boundaries
- Auto-update security (code signing, verified sources)
- Dependency supply chain risks (npm ecosystem)
- OWASP Desktop App Security Top 10

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-04-19: Security Requirements & Threat Model v0.1 authored
- Doc: `docs/security/security-requirements-v0.1.md` — 20 numbered requirements (R1–R20), STRIDE threat model (T1–T16), 15 stack constraints (C1–C15), 8 accepted risks (AR1–AR8), 6 open questions for Pedro.
- **Confirmed data scope:** donor/member PII = names, phones, emails. Financial = amounts, accounts. Both classified 🔴 High.
- **Threat model summary:** top threats are phishing of MS accounts (T1), accidental folder oversharing (T4), npm supply-chain (T7), Electron renderer RCE (T8), tampered audit log (T13), and revoked-member key residue (T14). Out of scope: nation-state, Microsoft infrastructure compromise, physical coercion.

### 2026-04-19: Encryption at rest — algorithm & design locked
- **AEAD only.** Approved: `XChaCha20-Poly1305` (preferred — random 192-bit nonces are safe) or `AES-256-GCM` (acceptable with nonce discipline).
- **Rejected:** AES-CBC, AES-CTR w/o MAC, anything not in an audited library.
- **Full file payload encrypted.** Filenames opaque (ULID / hash) — MUST NOT leak PII.
- **AAD binds record type + record id** to prevent ciphertext substitution.
- **Library requirement:** libsodium via `sodium-native`, WebCrypto subtle, or `@noble/*`. No roll-your-own. Neo's ADR must name it.

### 2026-04-19: Key management — recommended approach
- Chose **"Shared-folder escrow with per-user wrapping"**:
  - One DEK per NGO dataset (encrypts records).
  - DEK wrapped per user in `.treasury/keys.json` in the OneDrive folder.
  - Each user: X25519 keypair in OS keychain (DPAPI / macOS Keychain / libsecret). Private key never leaves device in plaintext.
  - Adding a member = wrap DEK to their published public key in `.treasury/pubkeys/{user_id}.pub`.
  - Removing = rotate DEK, re-wrap for remaining, omit removed. Historical stays readable with old DEK (AR2).
  - Escrow changes Ed25519-signed, logged in audit trail.
  - Admin role = escrow-edit signing privilege (lives in escrow file, not app RBAC).
- **Rejected:** shared passphrase (no revocation, degrades to Teams-chat sharing); shared secret wrapping (same problem); Graph-based derivation (violates "no custom auth"); hardware tokens (unrealistic for volunteer NGOs).
- **Key insight:** "Folder ACL controls who connects; crypto membership controls who reads." Deliberately decoupled to defend against accidental oversharing (T4).

### 2026-04-19: Non-negotiables that constrain Neo's ADR-001
- Electron hardening: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strict CSP (no `unsafe-inline`, no `unsafe-eval`, no CDN), no `@electron/remote`, URL navigation allowlist.
- IPC: `contextBridge` with narrow surface, schema validation at every boundary, no dynamic dispatch, no `eval`.
- Signed installers + signed auto-update with pinned pubkey.
- Zero secrets in git (pre-commit + CI scan).
- PII never in logs (structured logger with allowlist redaction).
- Dependency policy: lockfile, `npm audit` gate, no native deps without Switch review, no unreviewed install scripts.
- Append-only hash-chained Ed25519-signed audit log. Chain break = refuse to open.
- No telemetry/analytics libraries in v1.
- Crypto agility: version byte + algorithm id on every encrypted artifact.

### 2026-04-19: Accepted risks I'll defend
- AR1 MS-account compromise = member data compromise — inherent to file-based model.
- AR2 Revoked members retain access to data they already decrypted — symmetric crypto reality.
- AR3 OneDrive server-side search doesn't work on ciphertext — price of R3.
- AR7 Insider with folder-write can delete the audit log entirely — detectable via missing file, not preventable without a server.

### 2026-04-19: Open questions I need Pedro to answer
1. Admin model — first setter-upper or explicit named admin? How many admins allowed?
2. Audit log visibility — all members vs admin-only vs export-on-request?
3. Encryption scope — any partial-encryption carve-out? (default: no, encrypt everything PII/financial)
4. Multi-device per user — supported? (default: yes, one escrow entry per device)
5. Incident response — rotate-and-accept-AR2, or burn-down-and-migrate?
6. EV code-signing cert on Windows ($300–500/yr) — willing to pay for SmartScreen trust?

## 2026-04-19 — Cross-agent note (from Scribe)
- Neo's ADR-001 (Proposed) at `docs/architecture/adr-001-tech-stack.md` — Option A recommendation awaiting your sign-off on crypto choices, OS-keychain approach, and metadata surface.
