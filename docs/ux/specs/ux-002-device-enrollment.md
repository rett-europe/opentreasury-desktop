# UX-002 — Device Enrollment

> **Status:** Draft v0.1 · **Owner:** Niobe (Spec / UX Analyst) · **Date:** 2026-04-19
> **Paired PRD:** none (admin / multi-device onboarding; feeds every M1+ PRD in multi-device mode)
> **Paired flow skeleton:** [`../flows/flow-002-device-enrollment.md`](../flows/flow-002-device-enrollment.md)

**Traceability:** vision §2 ("shares with 1–3 collaborators"), §5 · ADR-001 **C6**, **C7**, **C10** (audit entry on enroll), **C13** (IPC schema) · security-requirements v0.2 **R4** (per-device key escrow), **R8** (audit log), **R11**, **R12**, **R15** · [crypto-spec §5](../../security/crypto-spec.md#5-device-enrollment-flow) (authoritative), §3 (escrow schema), §8 (audit entry `device.enrolled`) · prototype-analysis **G2**, **G9**, **UX-R1** · decisions 2026-04-19 (escrow = per-device; 6-char visual code; admin must be online).

> **Boundary:** Switch owns the crypto mechanics in [crypto-spec §5](../../security/crypto-spec.md#5-device-enrollment-flow). This spec describes only the user-visible experience. Any deviation from §5 is out of bounds here.

---

## 1. Summary

Enrollment is the two-device dance that adds a new device to an existing treasury: the new device generates keys locally and publishes a pending entry with a 6-character human-comparable code derived from its X25519 public key; an existing admin (who must be online) sees a notification, compares the code with the requester **out of band** (phone / in-person), and approves — at which point the admin wraps the current DEK to the new device's public key and writes a new `escrow.json`. OneDrive delivers the new escrow; the requester unwraps and enters the app.

## 2. User problem

A second (or third) person on the NGO needs read/write access to the treasury from their own laptop, with the same data safety guarantees as the first admin, without passwords, without a server, and with an observable defense against pubkey-substitution by someone with folder-write access.

## 3. Actors & preconditions

- **Requester** (Juan) — already has folder ACL (OneDrive share), app installed, reaches end of **[UX-001 Branch B](./ux-001-first-run-setup.md#4-happy-path-branch-a--become-first-admin)**.
- **Admin** (Maria) — `active` device entry in `escrow.json`, app running.
- **OneDrive** — transport.
- **Out-of-band channel** — phone / Teams / in-person. **Not** in the app.

**Preconditions:** folder ACL already granted to requester (separate OneDrive action, not in-app); admin online in-app at approval moment; at least one active DEK version.

## 4. Happy path

### 4.1 Sequence diagram (aligned to crypto-spec §5)

```mermaid
sequenceDiagram
    autonumber
    actor J as Juan
    participant JA as Juan's app
    participant OD as OneDrive
    participant MA as Maria's app
    actor M as Maria

    J->>JA: Click "Request enrollment" (from UX-001 Branch B)
    JA->>JA: Generate X25519 + Ed25519 keypairs → OS keychain
    JA->>JA: Compute 6-char code = BLAKE2b(X25519 pubkey)[0..6]
    JA->>OD: Write signed pending_enrollments entry (crypto-spec §3 $defs.pending_enrollment)
    JA->>J: Pending screen: code "ABC-123"; copy / TTS available
    Note over OD: OneDrive syncs
    OD->>MA: escrow.json change detected
    MA->>M: OS notification + in-app banner
    M->>J: (out of band) "Which code do you see?"
    J->>M: "ABC-123"
    M->>MA: Compare match → Approve
    MA->>MA: Wrap DEK(current) to Juan's X25519 pubkey (sealed-box)
    MA->>MA: Append Juan to devices (status=active, all wrapped_deks); remove from pending; sign
    MA->>OD: Write new escrow.json + "device.enrolled" audit entry
    Note over OD: OneDrive syncs back
    OD->>JA: escrow.json change detected
    JA->>JA: Unwrap DEK with own X25519 private key
    JA->>J: Success: "Welcome to {NGO}'s treasury"
```

### 4.2 User-visible steps — requester side (Juan)

| # | User sees | User does | System does |
|---|---|---|---|
| 1 | (from UX-001 Branch B) "This treasury belongs to {NGO}. Your device hasn't been enrolled yet." + "Request enrollment" / "How does this work?" | Click "Request enrollment" | Generate keypairs → keychain; compute code; suggest device name from OS hostname |
| 2 | **Confirm device name** (pre-filled). Copy: *"Admins see this when approving."* | Accept / edit → Continue | Write signed `pending_enrollments` entry to `escrow.json` |
| 3 | **Pending screen.** Big 6-char code `ABC-123` in a monospace, grouped `XXX-YYY`. Copy button; "Read aloud" button (TTS). Sub-copy: *"Share this code with an admin through a channel you already trust — phone, Teams, in person. They'll confirm it matches before approving."* Dim: *"You can close this window; we'll notify you when you're approved."* | wait (out-of-band readback) | Poll/watch escrow.json |
| 4 | **Success** state: "✅ You're in. Welcome to {NGO}'s treasury." | Click "Continue to dashboard" | Unwrap DEK; cache in main-proc memory; route to Panel |

### 4.3 User-visible steps — admin side (Maria)

| # | User sees | User does | System does |
|---|---|---|---|
| A | OS notification: *"OpenTreasury — Juan requests enrollment"*. In-app banner on any screen: *"Juan ({juan@ngo.org}) on device 'Juan — Laptop' requests enrollment. [Review]"* | Click Review | Open approval modal |
| B | **Approval modal.** Shows: claimed UPN, device name, request timestamp, **the 6-character code large**, copy: *"Confirm this matches what Juan is showing you. **Approve only if you contacted Juan yourself — not if they contacted you asking for approval.**"* Three actions: **Approve** / **Reject** / **Ask me later** | Compare out-of-band → Approve | Wrap DEK to Juan's X25519 pubkey; update & sign escrow; write audit `device.enrolled` |
| C | Toast: *"Juan enrolled. They'll be unlocked as soon as OneDrive syncs."* | — | — |

## 5. States

| State | Shown on | What's shown | Interactive? |
|---|---|---|---|
| `requester.idle` | requester | Branch-B explainer + Request CTA | Yes |
| `requester.device-name` | requester | name input | Yes |
| `requester.pending` | requester | big code, copy/TTS, NGO name, sub-copy | Yes (copy/TTS only) |
| `requester.success` | requester | ✅ welcome + continue CTA | Yes |
| `requester.rejected` | requester | neutral message (§6 E2) | Yes |
| `requester.stuck-no-admin` | requester | pending > N min, explanatory copy (§6 E1) | Yes (cancel) |
| `requester.self-cancel-confirm` | requester | confirm withdraw own pending | Yes |
| `admin.banner` | admin | queue banner + count | Yes |
| `admin.modal` | admin | approval modal (see 4.3 B) | Yes |
| `admin.queue-empty` | admin | (banner hidden) | — |
| `admin.mismatch-rejected` | admin | post-reject toast + audit note | No |
| `admin.offline` | both | sync indicator in-topbar shows offline → blocks end-to-end progress | Yes (via UX-005) |

## 6. Edge cases & errors

| Trigger | User sees | Recovery |
|---|---|---|
| **E1.** Admin not online | Requester stays on `pending`. After ~5 min (soft threshold) show: *"We're waiting for an admin to approve you. This can take a few minutes or a few hours — it depends on when the admin next opens the app."* | Wait; OS notification on approval |
| **E2.** Codes **don't match** → admin rejects | Requester: neutral *"Your enrollment request was rejected. If this was unexpected, contact the admin directly."* **Do NOT reveal which admin.** Admin side logs high-severity audit entry. **[Open Q2 to Switch — escalate further?]** | Requester may retry with fresh keypair |
| **E3.** Multiple simultaneous pending requests | Admin banner shows count; modal one-at-a-time with distinct code per request | Queue |
| **E4.** Pending entry stale (>N days) | **[Open Q3 to Switch — expiry policy]** Default v1: no expiry; admin rejects explicitly | — |
| **E5.** OneDrive offline on either side | UX-005 sync indicator is authoritative; enrollment blocked | Wait for sync |
| **E6.** Requester closes app on pending | Next launch, same folder → resumes same pending state with **same code** (code is deterministic from pubkey) | Automatic |
| **E7.** Only admin was revoked between request and approval | Requester stuck. Surface the orphaned-admin condition (crypto-spec §3.3) → burn-down-and-migrate is out of this spec; pointer to UX-012 | Escalate |
| **E8.** Escrow signature verification fails on requester side | Crypto-error catalog state (UX-009): *"This treasury's escrow file isn't signed by a known admin. Don't continue — contact the admin."* **[Switch copy review required]** | Halt |
| **E9.** Pubkey-substitution attack (attacker rewrites pending entry's pubkey) | Requester's displayed code (from requester's local pubkey) and admin's displayed code (from escrow's pubkey) **will not match** — this is the designed defense. Step 4.3 B copy makes the mismatch condition user-visible. | Admin rejects |
| **E10.** Requester wants to withdraw own pending entry | Confirm + remove requester-signed pending entry (requester-writable since pending is requester-signed) | Confirmed cancel. **[Open Q4 to Switch — self-cancel mechanism]** |

## 7. Accessibility

- Code display uses a large monospace-style treatment (visual token owned by Mouse), grouped `XXX-YYY`; sibling "Read aloud" button uses platform TTS with phonetic alphabet (*"Alpha, Bravo, Charlie — one, two, three"*).
- "Copy" button: keyboard-activatable; ARIA live-region confirms *"Code copied to clipboard"*.
- **Approve / Reject are NOT adjacent in tab order** — prevents fat-fingered approval. Keyboard approval requires explicit `Ctrl+Enter` shown in the UI.
- Approval modal traps focus; `Esc` triggers "Ask me later" (preserves pending), never approves or rejects.
- Banner first render uses `role="alert"`; subsequent re-renders `role="status"`.
- Approve/Reject colors + distinct icons (color is not the sole signal).
- Respects reduced-motion (no animated transitions on approval).

## 8. i18n notes

- String root: `ux.enroll.*`; sub: `requester.*`, `admin.*`, `errors.*`, `code.*`.
- **Code alphabet is locale-independent** (uppercase Crockford base32 minus `0/O/1/I/L/U` per **[Open Q1 to Switch]**); readback is phonetic in active locale.
- Admin banner includes the requester's UPN and device name verbatim — **do NOT localise UPNs**; `{upn}` and `{deviceName}` are raw interpolations.
- **ES vs EN layout risks:** approval modal's primary sentence is longer in Spanish by ~25% — wrap safely without truncation.
- **Pluralization:** admin banner count (`{count, plural, one {1 pending request} other {# pending requests}}`).
- Locale switcher is in app shell (UX-006); not exposed mid-enrollment.

## 9. Copy guidance

**Tone:** calm, instructional; security-adjacent language surfaces only where necessary. Never "public key", "wrap", "sealed-box", or "signature" in primary copy — those live in Switch-ratified error surfaces only.

| Key | ES | EN |
|---|---|---|
| `ux.enroll.requester.pending.title` | "Esperando aprobación" | "Waiting for approval" |
| `ux.enroll.requester.pending.code-label` | "Tu código de enrolamiento" | "Your enrollment code" |
| `ux.enroll.requester.pending.help` | "Comparte este código con un administrador por un canal de confianza — llamada, Teams, en persona. Lo confirmará antes de aprobarte." | "Share this code with an admin through a channel you already trust — phone, Teams, in person. They'll confirm it before approving." |
| `ux.enroll.admin.modal.title` | "Solicitud de enrolamiento" | "Enrollment request" |
| `ux.enroll.admin.modal.warning` | "Aprueba solo si tú contactaste a esta persona — no si fue ella quien te pidió aprobación." | "Approve only if you contacted this person yourself — not if they contacted you asking for approval." |
| `ux.enroll.admin.approve-button` | "Aprobar" | "Approve" |
| `ux.enroll.admin.reject-button` | "Rechazar" | "Reject" |

## 10. Out of scope

- Folder ACL management (OneDrive UI) — users do that in OneDrive, not here.
- Admin-level device revocation, DEK rotation, admin transfer → **UX-012**.
- Members-view / ACL-vs-escrow drift detection → **UX-024**.
- Crypto mechanics (sealed-box wrap, signature scheme, code derivation arithmetic) → **crypto-spec §2, §3, §5**.
- Offline / sync conflict semantics → **UX-005 / UX-018**.
- Orphaned-admin recovery → **UX-012 (mentioned here only as pointer)**.
- Post-revocation re-enrollment UI (new device_id after a stolen laptop is replaced) → covered by re-running this flow; no separate surface in v1.

## 11. Open questions

1. **Code alphabet and format** — Crockford base32 minus ambiguous chars (`0/O/1/I/L/U`); display grouping `ABC-123` (3-3) vs `AB-CD-EF` (2-2-2). Recommendation: 3-3 with no ambiguous chars. → **Switch** (code derivation also lives in crypto-spec §5). **RATIFIED 2026-04-19 by Switch — see [crypto-error-copy-catalog.md §3](../../security/crypto-error-copy-catalog.md#3-ux-002-q1--enrollment-code-alphabet-and-grouping-ratified).** Alphabet: Crockford base32 minus `0` and `1` (Crockford already excludes `I/L/O/U`) → **30 characters**, not 26 — Niobe's count was off; intent preserved. Grouping: **`XXX-XXX` (3-3)** ratified. Readback alphabet: NATO phonetic for letters + locale number-names for digits.
2. **Mismatch escalation** — when admin rejects, should we raise a higher-severity audit entry or force a DEK rotation? Recommendation: high-severity audit, no forced rotation. → **Switch**. **RATIFIED 2026-04-19 by Switch — see [crypto-error-copy-catalog.md CE-002b](../../security/crypto-error-copy-catalog.md#ce-002b--enrollment-rejected).** Default: (a) elevated audit entry only. Forced rotation (b) REJECTED — creates DoS vector. Soft admin prompt (c) ADOPTED as secondary only after a **second** rejection in the same admin session. Rationale: first mismatch most likely innocent; a pattern is suspicious. Audit entry format (`action: device.enrollment.rejected`, `severity: elevated`, `reason_class: code_mismatch | unrecognised_requester | other`) defined in CE-002b.
3. **Pending expiry policy** — silent expiry after N days, or indefinite until rejected? Recommendation: indefinite in v1. → **Switch**.
4. **Self-cancel mechanism** — can requester remove own pending entry without admin action? Pending entries are requester-signed per crypto-spec §3.1, so technically the requester can overwrite-to-absent. Need Switch's exact protocol. → **Switch**.
5. **Notification batching** — one OS notification per request, or batch if ≥3 arrive within 60s? Recommendation: per-request up to 3; batch above. → **Pedro**.
6. **Identity display reinforcement** — the UPN shown to the admin is non-authoritative (per crypto-spec §3.1: *"user_identity: display only; NOT a trust anchor"*). How do we communicate this in copy without being preachy? Proposed approach: the warning line in 4.3 B addresses it implicitly ("approve only if you contacted them"); do we need a tooltip explicitly? Recommendation: tooltip on the UPN. → **Switch + Niobe pass**.
7. **Post-revocation re-enrollment** — confirmed: new keypairs, new device_id, fresh flow; old entry stays in escrow as `revoked` for audit. Document explicitly in UX-012. → **Switch** to ratify.

## 12. Acceptance criteria

- AC1 — The 6-char code shown to the requester is **deterministic** from their local X25519 pubkey: closing and reopening the app on the same pending state produces the same code.
- AC2 — The admin modal displays a code derived from the pending entry's **escrow-resident pubkey**, not recomputed from anything else — so pubkey-substitution produces a visible mismatch (E9).
- AC3 — Reject path never reveals the rejecting admin's identity to the requester.
- AC4 — Admin approval triggers a `device.enrolled` audit entry per crypto-spec §8.2 within the same write batch as the escrow update.
- AC5 — Approve and Reject controls are not keyboard-adjacent; approve requires explicit `Ctrl+Enter` or click.
- AC6 — All user-visible strings are i18n-keyed; `es` and `en` populated on ship.
- AC7 — Escrow signature verification failure on the requester side (E8) **never** advances to the success state.
- AC8 — Renderer never receives DEK, device private keys, or wrapped DEK bytes; all crypto stays in main (C6).
- AC9 — `requester.stuck-no-admin` state appears after a configurable soft threshold (default 5 min) without progress.

## 13. Traceability matrix

| Requirement | Source | Where in this spec |
|---|---|---|
| Per-device escrow entry | security-req R4 / decisions 2026-04-19 | §4.1, AC4 |
| 6-char visual code = BLAKE2b(X25519 pubkey) | crypto-spec §5 | §4.1 step 3, §11 Q1, AC1, AC2 |
| Admin must be online | crypto-spec §5 / decisions 2026-04-19 | §3 preconditions, §6 E1 |
| Sealed-box DEK wrap | crypto-spec §1.2, §5 | §4.1 (admin side), §10 out-of-scope detail |
| `device.enrolled` audit entry | crypto-spec §8.2 | §4.3 B, AC4 |
| Pubkey-substitution defense | crypto-spec §5 ("visual fingerprint") | §6 E9, AC2 |
| Renderer isolation | ADR-001 C6, R11 | §12 AC8 |
| Schema-validated IPC | ADR-001 C13, R12 | implied (spec does not re-state) |
| Day-0 ES + EN | decisions 2026-04-19 | §8, §9, AC6 |

## 14. Status history

| Date | Status | By | Notes |
|---|---|---|---|
| 2026-04-19 | Draft v0.1 | Niobe | Expanded from flow-002 skeleton; aligned to crypto-spec §5. Batch 1 of Wave-1 UX specs. |
