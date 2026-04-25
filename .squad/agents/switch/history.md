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

## Core Context

**WI-17 Orientation (2026-04-20):** Validation rules + error handling spec frozen in `.squad/decisions.md` under "WI-17 v2 — Generic Column-Mapping Importer". Neo's spec §"Dry-run validation rules" + §"Error codes" define the full validation matrix: date parsing (DD/MM auto-detect with >12 heuristic), amount parsing (multiple separators, sign conventions, currency stripping), description validation (max 500 chars), and error propagation to dry-run preview. Your tasks: (1) Review validation rules for security implications (range attacks, format-confusion edge cases); (2) finalize error messaging copy (already EN/ES from Niobe's UX spec); (3) ensure no sensitive data (filenames, row counts, column names) leaks in error output. See decisions.md §"WI-17 v2" for full spec + error catalog.

Security posture locked in v0.1: Electron hardened (contextIsolation, nodeIntegration=false, sandbox, CSP), AEAD-only at rest (XChaCha20-Poly1305 preferred; AES-256-GCM acceptable with nonce discipline), DEK in OS keychain via `@napi-rs/keyring`, no passphrase UI in v1. Financial + donor/member PII classified 🔴 High. STRIDE threat model in `docs/security/security-requirements-v0.1.md` — top threats: phishing of MS accounts, accidental folder oversharing, npm supply-chain, renderer RCE, audit-log tamper, revoked-member key residue.

Implications currently in flight: ADR-001 accepted (event-sourced JSON + age/AEAD encryption), device enrollment needs QR/6-char visual-code pairing UX. Two event shapes (enveloped with `dekVersion` + flat for WI-15 config) coexist in the NDJSON log — crypto wiring only covers enveloped events today; flat config events are currently unencrypted. Revisit when full WI-15 / multi-device lands.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-04-20: Error shape standardization for import validation (coordination note)

Dry-run errors from import pipeline now use structured shape `{ code, raw, offending? }` instead of human-readable strings. This enables:
- i18n via code lookup (eliminates hardcoded English errors in multilingual UI)
- cross-agent consistency (if date parser or duplicate detector add error codes later, rendering layer doesn't change)
- future extensibility (e.g., user-facing suggestions for Unicode whitespace issues, format ambiguity toggles)

Morpheus refactored amount parser with Unicode whitespace stripping (NBSP U+00A0, narrow NBSP U+202F, zero-width U+200B, em space U+2003, etc.) to eliminate false-positive INVALID_CHARACTERS on real bank exports. Trinity localized all error codes to ES+EN with interpolation support for `{{raw}}` and `{{offending}}` values.

**Implication for future validation:** Keep error shapes consistent across all dry-run work. If adding new validators (date format ambiguity detection, duplicate-list enrichment, etc.), emit structured errors with codes instead of strings.

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

### 2026-04-19: All 6 open questions RESOLVED by Pedro + crypto spec published + ADR-001 signed off
- **Q1 admin model:** first-setup wins, authenticated enrollment for new devices (6-char visual-code compare, admin must be online).
- **Q2 audit log visibility:** all authenticated members can read; export-on-request (decrypted JSON bundle).
- **Q3 encryption scope:** encrypt everything PII/financial. AR3 accepted.
- **Q4 multi-device:** one escrow entry **per device** (not per user). Stolen-device revocation hits one entry only.
- **Q5 incident response:** rotate-and-continue = DEFAULT. Burn-down-and-migrate = nuclear option for suspected OneDrive-side compromise / admin-device loss.
- **Q6 code-signing:** no EV cert budget → AR9 (SmartScreen warning accepted). macOS OUT of v1 binary dist → AR10. **Update payload signing is still mandatory** (Ed25519 + pinned pubkey + CI vault key) — distinct from commercial-CA installer signing.

- **Published `docs/security/crypto-spec.md` v1.0** — primitives (XChaCha20-Poly1305 via `sodium-native`; X25519 sealed-box DEK wrap; Ed25519 signatures; BLAKE2b hashing), key hierarchy (device keys in OS keychain via `@napi-rs/keyring`, DEK in main-proc memory only, per-file AAD-bound envelope), escrow schema, first-setup/enrollment/revocation/rotation flows with Mermaid, audit log crypto (hash-chain + Ed25519 per entry), incident response playbook, metadata surface ruling (acceptable — UPN leak is already known via OneDrive ACL), 15-item implementation checklist.

- **ADR-001 verdict: Accepted (with conditions).** Status moved Proposed → Accepted. Superseded `age` (Neo's original choice) with libsodium directly — cleaner envelope, we needed libsodium anyway for Ed25519/X25519. Superseded Argon2id passphrase flow (OS-keychain only for v1). Superseded `keytar` (deprecated) with `@napi-rs/keyring`. 15 numbered acceptance conditions (C1–C15) mapped to SR v0.2 + crypto-spec §11 checklist. Morpheus/Trinity unblocked.

- **security-requirements bumped to v0.2**: added "Changes from v0.1" summary, R4 amended to per-device, R13 split into R13.1 (update payload signing — still mandatory) and R13.2 (installer commercial-CA signing — deferred per AR9/AR10), §7 open questions all annotated RESOLVED, AR9 (Windows SmartScreen) and AR10 (macOS deferred) added with explicit triggers for revisit.

### 2026-04-19: Key lessons recorded
- Splitting "signed installer" from "signed update payload" was the right move. The commercial-CA problem is cosmetic/UX; update integrity is a cryptographic problem and is strictly cheaper to solve (self-signed Ed25519 + pinned pubkey). Never let a business trade-off eat a security requirement — decompose instead.
- `age` is a fine format in isolation but forces you into its envelope. When you need DEK versioning + AAD binding + crypto agility + signature-based escrow integrity, using libsodium directly is less total complexity. The cost is explicit envelope design (we did it in crypto-spec §2.1); the benefit is we don't fight `age`'s opinions on key form.
- "All members can read the audit log" turned out to be a governance feature for NGO treasurers, not a security weakness. Transparency beats admin-gated secrecy when the threat model is insider-edit, not insider-read.

## 2026-04-19 — Team update (via Scribe)
Roadmap sequences crypto-heavy work into M2 (multi-device enrollment + DEK rotation). Niobe flagged crypto error states (decryption failure, audit chain break, bad escrow signature, update signature failure) as blocker UX gap G4 — user-facing messages need your input on what's safe to say. Enrollment language (UX-002 / flow-002 step 4 approval modal) must harden against impersonation.

### 2026-04-19: v1 storage scope narrowed
- **OneDrive for Business / SharePoint only in v1.** Personal OneDrive deferred to v1.x.
- Narrows the v1 threat-model surface (no consumer-account ACL handling). Worth noting in the next `security-requirements` revision.


### 2026-04-19: app/src/crypto/ is an Electron-free module per your audit requirement. It's an empty stub now -- real implementation per crypto-spec v1.0 is upcoming.


### 2026-04-19: Scaffold GREEN -- eslint boundaries verified
eslint boundary rules are working correctly: main/preload allowlisted for electron imports via targeted override; renderer/crypto/storage/core boundaries remain enforced. No leakage of electron into UI or crypto.
### 2026-04-19 — From Scribe: UX specs batch 1 needs your ratification
- Niobe surfaced crypto-error UX copy questions in UX-001 (`bad-escrow-signature` / `damaged-treasury`) and UX-002 (pubkey mismatch escalation, 6-char code alphabet/grouping).
- Needs your ratification on user-facing copy before Draft → In Review.


## Cross-agent update (Scribe, 2026-04-19T10:34:16Z)
Three decrypt-failed UX copy strings pending your ratification: UX-003 Q9 (per-row footnote), UX-004 Q10 (Saldo banner), UX-005 Q8 (Panel banner). Wave 1 specs cannot move Draft -> In Review until you sign off.

### 2026-04-19: Crypto Error Copy Catalog v1.0 authored — Wave 1 UX ratified & UNBLOCKED
- **New doc:** `docs/security/crypto-error-copy-catalog.md` v1.0. 9 scenarios (CE-001..CE-009) covering escrow-can't-verify (BLOCKING), enrollment pending, enrollment rejected, Movements row-decrypt, Saldo view-decrypt, Panel view-decrypt, audit chain break (BLOCKING), audit bad signature (BLOCKING, merged w/ CE-006 in UI), device revoked mid-session, update signature invalid (BLOCKING).
- **Five principles codified as normative (§0):** P1 actionable-to-user / opaque-to-attacker; P2 never leak filenames/IDs/fingerprints/algo-names to UI; P3 partial failure gets partial messaging (row < view < app-wide); P4 integrity-class errors are BLOCKING (no "continue anyway"); P5 treasurer-first plain-language copy.
- **P1 is the load-bearing principle.** Every decrypt subclass (bad tag, AAD mismatch, missing DEK version, truncated ciphertext, corrupt nonce, structural envelope fail) surfaces as the same "no pudo leerse". Every signature failure surfaces as "couldn't verify". Every chain-integrity failure surfaces as "history isn't intact". Attackers probing the system learn nothing from error copy; users learn what button to press.
- **Wave 1 UX open questions RATIFIED (5 + 2):** UX-001 Q7 (CE-001 copy, ADJUSTED — Niobe's leaked mechanism), UX-002 Q1 (alphabet 30 chars `ABCDEFGHJKMNPQRSTVWXYZ23456789` + grouping `XXX-XXX`), UX-002 Q2 (elevated-audit default + 2nd-rejection soft rotation prompt; forced rotation REJECTED as DoS vector), UX-003 Q9 (approved as proposed), UX-004 Q10 (approved + "en este periodo" scope anchor), UX-005 Q8 (ADJUSTED — "KPIs" swapped for "resúmenes"/"summaries" per P5).

### 2026-04-19: Key lessons recorded
- **"Actionable to user, opaque to attacker" has teeth.** Reviewing Niobe's proposed CE-001 copy revealed an easy-to-miss leak: saying "signature doesn't match a known admin" leaks (a) WHICH layer verified, (b) the IDENTITY-trust concept, and (c) the distinction between "unknown signer" vs "bad signature". The fix was "we can't verify this treasury" — shorter, more honest, zero leakage. Whenever a copy string says *what* failed at the layer level, it's a candidate for tightening.
- **Don't let kindness to the user leak to the attacker.** The instinct to be specific ("your enrollment was declined because the codes didn't match") leaks attack telemetry. A mismatch-in-transit attacker trying to probe which devices an admin expects benefits from being told which rejection path fired. Uniform rejection messaging + differentiated back-end audit is the right split.
- **Forced rotation on a single rejection is a DoS vector.** Any automated "high-consequence" response to an unauthenticated external trigger (a pending-enrollment entry) gives an attacker a DoS lever. The right discipline: observe-once (audit), act-on-pattern (prompt on second). This matches how good intrusion-response systems work — don't trip on single anomalies.
- **"Jargon" isn't always obvious.** "KPIs" is second-nature to anyone in tech or business ops, and I nearly approved it before re-reading as a volunteer treasurer. "Resúmenes" / "summaries" is the right register. Copy review needs a persona check, not just a security check.
- **Alphabet math:** Crockford base32 already excludes I/L/O/U. "Crockford minus 0/1/I/L/O/U" = Crockford minus 0/1 = 30 chars, not 26. Small thing, but pinning the exact alphabet in a security doc means the number had better be right. Worth the second count.
- **Diagnostic bundle is the pressure-release valve.** You can maintain strict UI opacity (P1/P2) only if there's a legitimate, user-initiated path for the failure details to escape — otherwise the first time something goes wrong in production, pressure builds to loosen UI copy. User-exported JSON bundle, public-keys-only, whitelisted fields per CE-XXX, one-click export from every CE surface. No auto-upload. Keeps the security model intact AND the debuggability intact.

### 2026-04-19: Cross-agent update from Scribe
Frontend uses native `<input type="date">` pair in DateRangePicker v0.1. No crypto touchpoints yet — data is pure mock. When real storage lands, the crypto error-copy catalog strings should be wired into error surfaces here.

## 2026-04-19T16:49:03Z — Team Update: WI-1/2/3 complete, Panel-first Wave 1 shipped

**What shipped:**
- ✅ **Morpheus (WI-1/WI-2):** Event-sourced core + IPC contract
  - Zod schemas, entity types, reducers, 5 query functions
  - IPC contract locked; mock handlers ready
- ✅ **Trinity (WI-3):** Panel UI wired to IPC
  - i18n complete (ES + EN), 6 new panel keys
  - "Ver todos →" pre-filters to current month
  - CI gates passing
- ✅ **Pedro approved Q1–Q6** greenlight

**What's coming (needs your review):**
- **WI-5:** Crypto wiring (Morpheus + Switch) — DEK from keychain, event decrypt
  - Follow crypto-spec §11 implementation checklist
  - Coordinate IPC error surfaces with error-copy-catalog.md strings

## 2026-04-25 — PR #26 Security Review (WI-23 Projection Unification)

**Verdict:** APPROVED ✅ — No security blockers.

**Findings:**
- **Dual-layer validation (Defense-in-Depth):** IPC layer + boot-layer `JsonFileEventLog.load()` Zod validation. Both reject legacy events unilaterally.
- **Schema Migration Policy v0.1:** Documented, provides precedent-lock for future event shape changes. Fallback: boot-guard throws `LEGACY_EVENT_TYPE_REJECTED` → operator can rollback.
- **No new IPC surface, no data leakage vectors.**

**Non-blocking:** Handler tests still seed legacy events (acceptable — boot-guard only validates disk NDJSON, not in-memory test objects). Track follow-up sweep.

**Summary:** Architecture + threat model sound. Schema migration policy locked. Ready for merge (pending Cypher's perf-seed fix per Neo).

- **WI-6:** Wire real core/query into IPC handlers (replace mocks)

**How it unblocks you:**
- Panel MVP proves the event-sourced read path (no mutations) — lower crypto surface than Movements
- Core queries are read-only (no DEK writes, no rotation logic) — simpler review surface than WI-5 full cycle
- Error surfaces for Panel are partial-decrypt only (CE-005) — narrower than full-command error set

### 2026-04-20: WI-17 security review completed — APPROVED WITH CONDITIONS
- **Doc:** `.squad/decisions/inbox/switch-wi17-security-review.md` — pre-landing security review of the generic column-mapping importer (Excel/CSV → movements).
- **Verdict:** APPROVED WITH CONDITIONS — 4 Critical + 2 High fixes required before merge.
- **Key findings:**
  - **C1 (CRITICAL):** `xlsx` v0.18.5 has 2 HIGH-severity CVEs (CVE-2023-30533 prototype pollution CVSS 7.8, CVE-2024-22363 ReDoS CVSS 7.5). Fixed versions (0.19.3+, 0.20.2+) not published to npm — the npm package is effectively abandoned. **Mandatory fix:** Replace with `exceljs` (actively maintained, MIT, no current CVEs). Security beats the 400 KB bundle-size argument from Neo's spec.
  - **C2 (CRITICAL):** Path-traversal validation insufficient for Windows attack vectors (UNC paths `\\?\C:\`, device names `CON`/`NUL`, no confinement to dialog-returned paths). **Fix:** Add UNC/device-name checks + session-scoped file allowlist (only allow paths from `dialog.showOpenDialog`).
  - **C3 (CRITICAL):** Zip-bomb DoS risk — 10 MB `.xlsx` can decompress to 1 GB, crashing main process. **Fix:** Add post-decompression row-count cap (100k rows).
  - **C4 (CRITICAL):** IPC injection risk if `fileId` is guessable (renderer could force-read arbitrary files). **Fix:** Use ULID-based opaque session tokens, validate at every IPC boundary.
  - **H1 (HIGH):** Symlink following — `fs.statSync` follows symlinks by default. **Fix:** Use `fs.lstatSync` and reject symlinks (3-line fix, defense-in-depth for 🔴 High-classified treasury data).
  - **H2 (HIGH):** Parser safety options missing (no formula suppression, no row preview cap, no `__proto__` sanitization in Papaparse column headers). **Fix:** Add safe-mode flags.
- **Electron posture:** PASS — `contextIsolation`, `nodeIntegration: false`, `sandbox`, CSP all verified in `main/index.ts` and `preload/index.ts`. No changes needed for WI-17.
- **Dependency audit:** `npm audit --omit=dev` → 1 vulnerability (`xlsx`). After C1-FIX (switch to exceljs), expected 0 vulnerabilities. All other prod deps clean (sodium-native, @napi-rs/keyring, papaparse, zod, React).
- **Medium/Low findings:** 4 tracked for follow-up (hash collision at 4B rows, dedup memory unbounded, date-ambiguity UX, error-message info leakage). None blocking.
- **Future hardening:** 4 items deferred (import audit trail, rate limiting, CSP reminder, signed batches — already covered by WI-5 crypto wiring).

### Key lessons recorded
- **Dependency hygiene beats "lighter bundle".** Neo's spec argued for SheetJS over exceljs because "half the size, faster reads". But SheetJS has 2 known HIGH CVEs with no npm fix (versions 0.19.3+ exist only on commercial CDN). For a file parser handling untrusted user input in a treasury app, **shipping with known CVEs is non-negotiable rejection**. The 400 KB bundle cost is irrelevant next to prototype pollution + ReDoS exploitability. This is the forcing function for C1-FIX (switch to exceljs). Lesson: when a spec benchmarks libraries, always cross-check `npm audit` and GitHub advisories BEFORE the architectural lock-in.
- **Path traversal on Windows has more surface than POSIX.** The spec's normalization logic (`path.normalize` + `isAbsolute` + no `..` substring) is a good start but misses Windows-specific vectors: UNC paths (`\\?\`, `\\server\share`), device names (`CON`, `NUL`, `COM1`), and the fact that Electron's dialog returns absolute paths but a compromised renderer can send arbitrary ones. Defense-in-depth requires THREE layers: (1) syntax checks (UNC, device names), (2) normalization checks (absolute, no `..`), (3) allowlist checks (only paths from dialog). C2-FIX enforces all three. Lesson: Windows path validation is not "just add `path.normalize`" — it's a checklist.
- **Zip-bomb is a real threat for XLSX, not a theory.** A 10 MB `.xlsx` decompressing to 1 GB is trivial (repeated empty cells compress to near-zero). The spec had a 10 MB pre-decompression check via `fs.statSync` but no post-decompression cap. Since SheetJS (and exceljs) load the full workbook into memory, this is a main-process crash (DoS). C3-FIX adds a 100k row limit, which approximates 10 MB of data (100 bytes/row avg). For NGO use cases (<10k rows/year), this cap is invisible. For attackers, it closes the DoS vector. Lesson: for any parser that handles compressed formats (zip, gzip, tar), always cap BOTH pre-decompression size AND post-decompression resource (rows, memory, file count).
- **Opaque session tokens prevent IPC replay attacks.** The spec's `fileId` is an "opaque session token" but didn't specify the implementation. If Morpheus implements it as the original `filePath` (common shortcut), a compromised renderer can call `import/commit` with `fileId: "C:\evil.xlsx"` that was never staged, bypassing file-size and path checks. If it's a numeric index into an array, the renderer can race concurrent imports or send out-of-bounds indices. C4-FIX mandates ULID-based tokens + a session-scoped `Map`. This is a standard IPC-boundary hardening pattern: **any value returned to the renderer and echoed back must be unguessable and validated server-side**. Lesson: "opaque token" in a spec must translate to "cryptographically random, server-validated" in code.
- **Symlinks are edge-case but high-impact on shared machines.** The threat model (AR1: MS-account compromise, AR2: revoked members retain access) doesn't call out shared-laptop scenarios explicitly, but NGOs often share devices. If Alice can plant a symlink `C:\Users\Bob\Desktop\statement.xlsx` → `C:\secret\alice-data.xlsx`, and Bob imports it, Alice's data leaks. Electron's file dialog behavior on symlinks varies by OS (macOS Finder resolves them, Windows Explorer depends on settings). H1-FIX (reject symlinks via `fs.lstatSync`) is a 3-line defense-in-depth fix for 🔴 High-classified data. Lesson: when data classification is High, "requires filesystem access" is not a sufficient reason to defer a simple check.
- **`__proto__` in column headers is a prototype-pollution vector.** Papaparse parses CSV headers into object keys. If a malicious CSV has a column named `__proto__` and the code does `row[columnName] = value`, JavaScript's prototype is polluted. This is orthogonal to the SheetJS CVE (C1) but shows up in the same feature. H2-FIX sanitizes column names in Papaparse's `transformHeader` hook (prefix `__proto__` / `constructor` / `prototype` with `_`). Lesson: any time user input becomes an object key (CSV headers, JSON keys, query params), sanitize against prototype-pollution keywords.
- **Proportionality in threat modeling.** The task reminded me: "This is an offline desktop app for NGO use — the threat model is NOT hostile nation-state. Primary threats: user accidentally imports malicious file they received by email (worth real attention), shared-machine scenario (mild), process crash on malformed input (real quality risk)." I flagged 4 Critical, 2 High, 4 Medium, 3 Low — the Criticals are all exploitable in the "malicious email attachment" scenario (CVEs in file parsers, zip bombs, path traversal allowing arbitrary file reads). The Mediums (hash collisions at 4B rows, date-ambiguity data corruption) are quality/UX risks, not security vulnerabilities. I didn't invent theoretical attacks. This is the right calibration: block real exploits, track quality issues as follow-ups.
- **ExcelJS vs SheetJS trade-off.** After forcing C1-FIX, the new trade-off is: exceljs is 800 KB (vs 400 KB SheetJS), ~20% slower, and async (vs sync). But it's MIT-licensed, actively maintained, has no current HIGH CVEs, and the async API is actually better (non-blocking main process). The 400 KB bundle cost is <1% of a typical Electron app (renderer bundle is ~5 MB with React). The 200ms parse-time cost for a 10 MB file is invisible to users (total import flow is ~2 seconds including dry-run + commit). The security win (no known CVEs, maintained library) is non-negotiable. This is a textbook "security beats micro-optimization" decision.



### 2026-04-21: WI-21 cascade policy ruling — ARCHIVE-ONLY across all four entities
- **Doc:** .squad/decisions/inbox/switch-wi21-cascade-policy.md
- **Ruling:** Account / Category / Subcategory / Tag all get `*.updated` + `*.archived` + `*.unarchived`. No `*.deleted` in WI-21. Hard-delete deferred until (a) account-id decoupling fixed and (b) migrate-then-delete flow specified.
- **UI:** "Eliminar" → "Archivar"; confirm dialog non-destructive; `—` for usage counts; "Mostrar archivadas" toggle per tab.
- **Transactions:** references preserved on archive; no synthetic `tx.categoryReassigned` / `tx.untagged` emitted as a side effect of archiving — audit purity.

## Learnings

- **Event-sourced + audit-retained products default to archive, not delete.** In any system with replay + multi-year retention (treasury 7y), hard-delete is never the safe default even when foreign-key references are decoupled today. The decoupling is usually transient; shipping hard-delete while it holds becomes a data-loss footgun the day the decoupling is fixed. Default to archive, gate hard-delete behind an explicit migrate-then-delete flow + usage-count enforcement.
- **Reversibility earns non-destructive UX.** If the action is archive (reversible), the confirm dialog should NOT use destructive red styling — that miscommunicates risk and teaches users to fear a safe action. Reserve destructive affordances for hard-delete if/when it ships.
- **Do not emit synthetic events as side effects of admin actions.** When archiving a tag, it is tempting to emit `tx.untagged { remove }` across affected transactions to "clean up" arrays. This pollutes the audit log with events the user never authored and destroys the ability to audit who actually changed a transaction. Rule: admin config actions emit config events only; transaction events stay transactional.
- **Cascade archive-from-parent should be explicit, not automatic.** A user archiving a category should not silently archive every subcategory. Compound destructive-feeling actions deserve a second act of will — especially when each one lands as an individual audit event. Revisit only if UX friction proves it wrong in the field.
- **"Usage count blocked" does not block cascade policy.** The cascade policy question is independent of usage-count enforcement. Don't wait on a blocked input to rule on an independent design question — archive-first is safe regardless of counts.


### 2026-04-23: WI-23 unify-projections review — APPROVED with C1–C3

Reviewed Morpheus's rev-2 plan for issue #18 (collapse the `account.created` legacy projection into the WI-15-lite `AccountCreated` / `configAccounts` stream; symmetric treatment for categories and tags). Plan incorporates Neo's D1 (hard break on legacy logs, boot-guard refusal + `pre-wi23-log-compat` tag), D2 (`sortOrder` required on unified schemas, handler auto-assigns `max+1`), D3 (split `selectCategoryDirectUsage` / `selectSubcategoryUsage` — no rollup), D4 (two-PR split), and §10 (two replay invariants: ID continuity, no-orphan-transactions superset check).

**Note on provenance:** Morpheus's draft was not on origin at review time (Copilot-agent session cannot write to `.squad/decisions/inbox/` because that path is gitignored — Scribe handles inbox out-of-band). Review written against issue #18 + Neo's D1–D4 + §10 + current code reality (`reducers.ts` L79–L152, `projections/config.ts`, `events/schemas.ts` L50–L171, `devSeed.ts:703/731/751`, `queries.ts:37/146`, `createTransaction.ts:143`).

**Verdict: APPROVED** pending three conditions, all verifiable at PR review (no re-doc round-trip):

- **C1 (MUST) — SECURITY.md precedent-lock.** The WI-23 boot-guard refusal is acceptable ONLY because this predates the first real-user install (dogfood-only, Internal Alpha). SECURITY.md must state that future schema migrations on real-user logs require a forward-migration function, NOT a boot-guard. Without this note, "refuse to boot" becomes a silent precedent for every future config schema change and turns into a 🔴 High-class data-loss UX failure the first time it hits a real NGO with multi-year history.
- **C2 (MUST) — Boot-guard property tests.** §10 replay-invariant set must include (a) one refusal test per legacy event type (`account.created`, `category.created`, `tag.created`) asserting the loader rejects with a stable error, and (b) one refusal test for a malformed unified event missing the now-required `sortOrder` field on `AccountCreated` / `CategoryCreated` / `TagCreated`. Four small tests, non-negotiable.
- **C3 (STRONGLY RECOMMEND) — Ship `selectAccountReferences` in PR #2.** Usage counts alone are insufficient for the migrate-then-delete flow I deferred in WI-21. The Eliminar dialog needs the actual list of referencing tx ids, not just a count, so the user can see what `accountId: A → B` rewrite they're approving. Three-line selector (`transactions.filter(t => t.accountId === id).map(t => t.id)`) + dedicated `accounts:listReferences` IPC (don't inline into the list sidecar — O(N_transactions) payload on an O(N_entities) endpoint is wrong). Defer is acceptable IFF the decision doc commits the migrate-delete follow-up PR to carry it; the sidecar shape is forward-compatible either way.

**Other surfaces checked — all clear:**
- **Hard break (§4 of plan) approved on dogfood-only grounds.** No audit-purity regression (no synthetic events, no log rewrite), no new attack surface (single `switch (type)` + throw in the loader), reversible via the `pre-wi23-log-compat` tag for manual CSV export.
- **IPC `usage` sidecar (§5 step 10) approved.** Optional `usage?: Record<string, number>` on existing list endpoints is wire-back-compat. Neo's D3 direct-vs-sub split on categories is correct for both the UI grid and the future rollup-for-migrate-delete need (flagged §4.2 in the review doc). Docstring must be explicit: usage counts ignore `archivedAt` on the config entity.
- **No new deps, no new IPC injection surface, no new filesystem access, no prototype-pollution concern** (`sortOrder: z.number().int().nonnegative()` is safe), no crypto-adjacent change, no audit-log tampering risk.

**Non-appealable:** C1 and C2. C3 advisory.

### Learnings (WI-23 review)

- **`.squad/decisions/inbox/` is gitignored** — a Copilot-agent session cannot land decision drafts there; they vanish on session teardown. The committed channels are `.squad/decisions.md` (Scribe merges, human-driven) and each agent's `.squad/agents/<name>/history.md` (agent-owned, append-only). Agent charters still say "write to `inbox/`" because that assumes the Scribe runs on Pedro's local machine. In a coding-agent session, land rulings in the agent's own history file + the PR description.
- **Schema-migration precedent matters more than the specific migration.** Approving a boot-guard refusal once is fine. Not writing down WHY it was one-time-acceptable is how the pattern metastasizes. Every security-impacting exception to a durable principle (here: "the event log is the system of record; don't refuse to load it") must carry its own scoping note at the same moment it ships. That's C1's entire reason for existing.
- **Usage counts vs reference lists are different surfaces.** Counts are a UI feature (grid column, gating a delete button). Reference lists are a flow-control primitive (the user must see what the rewrite affects). A migrate-then-delete flow cannot be built on counts alone; it needs the id set, presented as tx summaries, with an explicit "reassign to what?" picker. Build the two selectors in one PR — the marginal cost is three lines, and the alternative is a dialog with "Are you sure you want to rewrite 47 transactions? (We won't show you which)."
- **Gitignored inbox ≠ lost decision** as long as the review lands somewhere committed. Writing to `agents/switch/history.md` is legitimate (append-only, Switch-owned) and ships with the PR. The Scribe's later merge into `decisions.md` is a convenience, not a correctness requirement.
