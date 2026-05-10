# Keaton — History

## 2026-05-10: SPEC-026 Multi-User Redesign — Decisions Locked

**Context:** Pedro's two directives (security non-negotiable, multi-user HARD requirement) and Keaton's earlier encryption-refined recommendation converged into a unified multi-user architecture redesign.

**Key decisions made:**
- **Per-device event files** (`events-{deviceId}.ndjson`) — no write conflicts on cloud sync
- **Multi-wrap key model** — shared recovery wrap + per-device safeStorage wraps
- **Recovery code as team secret** — trusted board only; no device revocation in v1
- **Workspace folder location** — user picks at first launch (folder picker)
- **Read model** — rebuild on every launch for v1 (safe, no cache)
- **Estimate:** 14–18 working days (up from 10–12)

**Next:** Niobe rewrites SPEC-026 as single coherent v2 spec. Trinity + Morpheus break ground on implementation. Switch reviews crypto sign-off.

**Artifact:** `.squad/decisions/inbox/keaton-spec-026-multiuser-redesign.md`

---

## 2026-05-10: Encryption Timing Analysis (Pedro's question)

**Context:** Pedro asked whether encryption should land before the trial expands, given plaintext `events.ndjson` and upcoming membership feature (PII — names, member IDs, payment history). Trial.3.7 just shipped; real data in use.

**Key findings from decisions.md review:**
- Switch's security requirements (2026-04-19) declared encryption at rest **mandatory** for v1 — AEAD only, XChaCha20-Poly1305 via `sodium-native`, OS keychain via `@napi-rs/keyring`.
- Encryption was explicitly deferred to M2 in the M1.5 vertical-slice decision (2026-04-19): "ship local-JSON event log now; defer OneDrive + crypto to M2."
- Full crypto spec exists (`docs/security/crypto-spec.md` v1.0) with 15-item implementation checklist, key hierarchy, escrow model.
- The `EventLog` interface was designed for adapter swappability — crypto wraps the adapter, not the domain.
- Trial posture is single-writer, local folder, no multi-device concurrency.

**Recommendation delivered:** Option D (Hybrid) — ship `safeStorage`-wrapped event log NOW as a minimal trial-hardening step (days, not weeks), defer full AEAD + key rotation + recovery to M2. Ship encryption before or with membership, never after. See `.squad/decisions/inbox/keaton-encryption-timing.md`.

**Open questions flagged for Pedro:**
1. Recovery story — must users be able to recover data if OS keystore is wiped?
2. Membership timeline — is it next after current trial stabilization?
3. BitLocker/FileVault — can trial users be required to enable OS disk encryption?

## 2026-05-10: Encryption Refined — NGO Usability Constraints (Pedro's feedback)

**Context:** Pedro pushed back on the Phase 1/Phase 2 hybrid. Key feedback: NGOs can't be told to enable BitLocker ("Mandarin Chinese"), keystore-wipe data loss is unshippable, and membership is weeks away — encryption must land first.

**What changed:** All three open questions from the original analysis were answered negatively. BitLocker is not an option. Keystore wipe must be survivable. Membership timeline is tight. This invalidated the pure `safeStorage` Phase 1 as a standalone step.

**Revised recommendation:** Single unified design (no phasing). Master key generated at first-run, wrapped two ways: (1) `safeStorage` for invisible daily use, (2) recovery code (24-word mnemonic, Argon2id-derived) for disaster recovery. Per-event AEAD with XChaCha20-Poly1305 via sodium-native. Mandatory first-run setup with recovery code confirmation. Recovery flow for new-machine/reinstall scenarios. ~10-12 working days estimated.

**Key design choices:**
- Crypto-spec v1.0 primitives reused, but simplified key management (single MK instead of full device-keypair hierarchy). Upgrade path to full hierarchy is additive.
- No skip on recovery code setup — opinion: block, not warn-and-allow.
- Encrypted events.ndjson is safely portable to USB/cloud backups.
- "Export decrypted" escape hatch included for data portability.

**Deviation from crypto-spec:** Single MK instead of per-device X25519 keypairs + escrow.json. This is a deliberate single-device subset. When multi-device/OneDrive lands (M2), MK becomes the DEK in the full hierarchy. Switch should review.

**Awaiting Pedro's confirmation on:** (1) No-skip policy on recovery code, (2) 24 vs 12 word mnemonic length, (3) include "export decrypted" in v1.

See `.squad/decisions/inbox/keaton-encryption-ngo-refined.md`.

## Learnings

### 2026-05-10: Multi-user pivot — single-device assumption invalidated

**What broke:** The entire SPEC-026 design (and my keaton-encryption-ngo-refined.md proposal) assumed single-device, single-user. Pedro's directive made multi-user shared workspace (2–5 users, cloud-synced folder) a HARD requirement from day one. No phasing allowed — "single-device first, multi-user later" is explicitly rejected.

**Two problems surfaced:**
1. **Multi-device key wrapping:** One safeStorage wrap per workspace doesn't work when multiple devices need silent unlock. Solution: `events.key` v2 with a `devices[]` array of per-device safeStorage wraps. Recovery code becomes the shared team enrollment secret.
2. **Concurrent writes via cloud sync:** OneDrive/SharePoint/Dropbox don't do byte-level merge — they produce conflict copies. A single `events.ndjson` file is a write-conflict magnet with multiple users.

**Key design decision: per-device event files.** Each device writes only to `events-{deviceId}.ndjson`. Read model merge-sorts all files by ULID on load. Zero write conflicts by construction. This was enabled by a critical discovery: the event envelope schema (`app/src/core/events/schemas.ts`) already has `actorDeviceId` and `actorUserId` as ULID fields — per-device identity was baked into the data model from the start (P0-1 trial-readiness work).

**AAD binding change:** Line-index as AAD doesn't work across multiple files. Changed to event.id (ULID) — globally unique, immutable, and the natural identity for binding ciphertext to event identity.

**Estimate impact:** 10–12 days → 14–18 days. Main cost drivers: per-device file I/O (glob + merge-sort), multi-wrap key management, join-flow UX, and cloud-sync integration testing.

**Riskiest unknown:** Actual OneDrive/SharePoint behavior with per-device files. Needs early smoke testing on real cloud sync, not mocks.

See `.squad/decisions/inbox/keaton-spec-026-multiuser-redesign.md`.
