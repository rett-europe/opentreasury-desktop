# Flow 002 — Device Enrollment (new device joins existing treasury)

> **Status:** Skeleton v0.1 · **Owner:** Niobe (UX) · **Date:** 2026-04-19
> **Type:** Flow skeleton — establishes shape; full spec follows in Wave 2 (UX-002 + UX-012).
> **Traceability:** [CS §5 — Device Enrollment Flow](../../security/crypto-spec.md#5-device-enrollment-flow); [R4](../../security/security-requirements-v0.1.md#r4--key-management-per-device-keys-with-escrow-file--resolved-v02); [R20](../../security/security-requirements-v0.1.md#r20--first-run-security-posture-wizard); [prototype-analysis G2, G9](../prototype-analysis-v1.md#g2--no-device-enrollment--pairing-ux), [UX-R1](../prototype-analysis-v1.md#ux-r1--enrollment-flow-is-confusing-and-users-bypass-it); vision §2 "shares with 1–3 collaborators".

> **Switch-owned boundary:** the mechanics of the 6-character visual code (derivation from BLAKE2b of the device's X25519 pubkey) are specified in CS §5. This document describes only how the USER experiences the mechanism.

---

## 1. Actors

- **Juan** — new member. Has been added to the OneDrive folder by Maria. Installing OpenTreasury on his laptop now.
- **Juan's app** — requestor side.
- **Maria** — existing admin of the treasury, already enrolled and active. App may or may not be running.
- **Maria's app** — approver side.
- **OneDrive** — the transport. Delivers `escrow.json` changes in both directions.
- **Out-of-band channel** — phone call / Teams / in-person — how Maria and Juan compare the 6-char code. NOT in-app.

---

## 2. Preconditions

- Maria is already a treasurer (flow-001 Branch A complete); her device entry is `active` in `escrow.json`.
- Maria has added Juan to the OneDrive folder (ACL) — Juan can read/write files. This is a separate OneDrive action, not in-app.
- Juan has installed the app; this flow begins at flow-001 step 4 → Branch B ("this treasury belongs to {NGO}, your device isn't enrolled").
- Per CS §5: Maria MUST be online (running the app) to approve. There is no async / offline-approval in v1.

---

## 3. Happy Path — The Two-Device Dance

### 3.1 Sequence (Mermaid)

```mermaid
sequenceDiagram
    autonumber
    actor Juan
    participant JApp as Juan's App
    participant OD as OneDrive Folder
    participant MApp as Maria's App
    actor Maria

    Juan->>JApp: Point at shared folder
    JApp->>OD: Read escrow.json — not enrolled
    JApp->>JApp: Generate device keys, compute visual code
    JApp->>Juan: "Pending enrollment — share code XXX-YYY with an admin"
    JApp->>OD: Write pending_enrollments entry (signed by Juan)

    Note over OD: OneDrive syncs change

    OD->>MApp: escrow.json changed
    MApp->>Maria: Notification + in-app banner:<br/>"Juan requests enrollment. Code: ABC-123"
    Maria->>Juan: (out-of-band) "What code do you see?"
    Juan->>Maria: "ABC-123"
    Maria->>MApp: Codes match → Approve
    MApp->>MApp: Wrap DEK to Juan's pubkey; update escrow; sign
    MApp->>OD: Write new escrow.json + audit entry

    Note over OD: OneDrive syncs change back

    OD->>JApp: escrow.json changed
    JApp->>JApp: Unwrap DEK with local private key
    JApp->>Juan: "Welcome. Treasury unlocked."
```

### 3.2 Step-by-step (user-visible)

| # | Who | User sees | User does | System does |
|---|---|---|---|---|
| 1 | Juan | (handed off from flow-001 step 4) "This treasury belongs to {NGO}. Your device hasn't been enrolled yet." + "Request enrollment" primary button; "How does this work?" link. | Clicks "Request enrollment" | Generates device keypairs (X25519 + Ed25519), stores in keychain; computes 6-char visual code from BLAKE2b(X25519 pubkey); chooses device name (suggested from OS) |
| 2 | Juan | "Pending approval" screen: big 6-character code displayed (e.g., `ABC-123` — letters/digits, disambiguated no 0/O/1/I). Copy button. "Read aloud" (accessibility) button. Copy also includes NGO name + Juan's claimed user identity (UPN / email). Copy below: "Share this code with an admin through a channel you already trust — phone, Teams, in person. They'll confirm it matches before approving." + dim "You can close this window; we'll notify you when you're approved." |  (waits) | Writes `pending_enrollments` entry to `escrow.json` (Juan-signed with his Ed25519 key); keeps a poll/watch on the file |
| 3 | Maria | OS notification: "OpenTreasury · Juan requests enrollment"; opening app shows prominent banner on any screen: "Juan (juan@ngo.org) requests enrollment on device 'Juan — Laptop'. [Review]" | Clicks "Review" | Opens an approval modal |
| 4 | Maria | Approval modal: Juan's claimed identity (UPN); device name; timestamp of request; **the same 6-character code**, displayed large. Copy: "Confirm this code matches what Juan is showing you. **Approve only if you reached out to Juan yourself — not if they contacted you asking for approval.**" Primary `Approve`; Secondary `Reject`; tertiary `Ask me later`. | Compares code out-of-band with Juan, confirms match, clicks `Approve` | Wraps DEK(current version) to Juan's X25519 pubkey via sealed-box; sets Juan's entry `status=active`, appends `wrapped_deks` entries for all DEK versions Maria has; removes Juan from `pending_enrollments`; signs new `escrow.json` with her Ed25519 key; writes to folder; writes `device.enrolled` audit entry (encrypted with current DEK) |
| 5 | Maria | Toast: "Juan enrolled. They'll be unlocked as soon as OneDrive syncs." | — | — |
| 6 | Juan | (either automatic via file-watcher or on manual retry) Pending screen transitions to a success state: "✅ You're in. Welcome to {NGO}'s treasury." | Clicks "Continue to dashboard" | Reads new `escrow.json`, finds own device entry with wrapped DEK, unwraps, caches in main-process memory; routes to Panel (empty-state-aware per UX-010) |

### 3.3 Success criteria

- Wall-clock time (step 1 → step 6) dominated by OneDrive sync latency (target: <60s when both apps are online).
- Neither user sees technical terminology ("sealed-box", "wrapped DEK", "escrow signature"). The code is the only mental overhead.
- Both users understand what approval means: *"I am adding this device to the trusted set. This device will be able to read all treasury data."*

---

## 4. Key Edge Cases / Error Paths

- **E1 — Admin is not online when Juan requests.** Juan's pending screen stays; expected. Copy: "We're waiting for an admin to approve you. This can take a few minutes or a few hours — it depends on when the admin next opens the app." OS notification on Juan's side when approval lands. *(No in-app-to-OneDrive "poke the admin" channel; out of scope for v1.)*
- **E2 — Codes DON'T match.** Maria clicks `Reject`. Juan's pending entry is removed; Juan sees "Your enrollment request was rejected. If this was unexpected, contact the admin." Security copy: do NOT reveal which admin rejected. Log to audit. **This is a genuine attack signal** (someone tried to enroll while impersonating Juan); Switch may want a higher-severity treatment.
- **E3 — Multiple pending enrollments at once.** Maria's banner shows a queue; modal is one-at-a-time. Each has its own code.
- **E4 — Juan's enrollment expires or is stale.** *(Expiration policy not defined by CS §5 — open question.)* If a user's pending entry is, say, >7 days old, should the app silently expire it? (Recommendation: no expiration in v1; admin rejects explicitly.)
- **E5 — OneDrive sync is broken on either side.** Sync indicator (UX-005) surfaces the lag / offline state. Enrollment can't progress until sync recovers.
- **E6 — Juan closes the app on the pending screen.** Next launch, same folder, detects own `pending_enrollments` entry → returns to the same pending screen with the same code. Code does not rotate. *(Open question: rotate on re-open? CS §5 implies not.)*
- **E7 — Admin was revoked between request and approval.** Another admin (if exists) can still approve. With only one admin revoked: Juan is stuck; orphaned-admin path (CS §3.3 burn-down-and-migrate).
- **E8 — Escrow.json arrives on Juan's side but signature verification fails.** Error path in UX-009 catalog: do NOT silently accept; show "This treasury's escrow file signature doesn't match an expected admin. Don't proceed — contact the admin."
- **E9 — Juan's pending entry is present but his PUBLIC KEY has been tampered with by a man-in-the-middle who can write to the folder.** The 6-char code Maria sees is derived from the tampered pubkey; the code Juan sees is derived from his real pubkey — **they will not match**. This is the designed defense. Copy in step 4 must make this explicit: "If the codes don't match, the request may have been tampered with. Reject." — Switch copy review mandatory.
- **E10 — Juan clicks `Reject` on his own pending state by navigating to Settings.** *(Self-cancel)*. Allowed; sends a signed `pending_enrollment_cancelled` (if CS supports) or simply writes a new escrow without Juan's pending entry (requires admin rewrite — no). **Open question:** can Juan remove his own pending entry, or does only an admin touch the escrow? (CS §3 implies admin writes; Juan can re-write his OWN pending entry by self-signed addition. Self-cancel may require a separate file or just expire. Switch decides.)

---

## 5. Admin-side affordances (UX-012 neighbor)

- Pending queue also visible in Settings → Members → Pending (not just the banner). Allows Maria to defer review.
- Approved and revoked devices listed, each with `Revoke` affordance (admin-only).
- DEK rotation and admin transfer live here too (UX-012 spec).

---

## 6. Accessibility Notes

- **The 6-character code** is displayed in a large monospace-like treatment (visual treatment in Mouse's domain), grouped `XXX-YYY` for reading. "Read aloud" button uses the platform TTS to speak the code phonetically ("Alpha, Bravo, Charlie — one, two, three") for users with visual impairment or for phone readback where letters can be ambiguous.
- **Copy button** is keyboard accessible (Enter/Space activates); has an ARIA live-region confirmation ("Code copied to clipboard").
- **Approval modal** traps focus; `Esc` does NOT approve or reject (it triggers "Ask me later" which keeps the pending state visible).
- **Banner** has a role=alert announcement on first render; subsequent re-renders are role=status.
- **Approve and Reject buttons** are NOT adjacent with a single tab between them — this avoids a fat-finger / wrong-tab approval. `Approve` requires either pointer click OR explicit Ctrl+Enter shortcut shown in the UI.
- **Color is not the only difference** between Approve (green-ish) and Reject (red-ish) — they carry distinct icons.

---

## 7. Open Questions

1. **Code format**: 6 characters base32-truncated from BLAKE2b — per CS §5. Confirm exact alphabet (disambiguate `0/O`, `1/I/l`) with Switch. Display format: `ABC-123` (3-3) or `AB-CD-EF` (2-2-2)?
2. **Pending expiration:** CS §5 is silent. Do we let pending requests persist indefinitely until rejected? (Recommendation: yes for v1.)
3. **Self-cancel:** can Juan withdraw his own pending request, or must an admin reject? (Technical: CS admin-signs escrow; self-cancel needs a mechanism.) — Switch.
4. **Queue notifications:** do we batch ("3 pending enrollments") or one notification per request? (Recommendation: one per request; batch if ≥3 within 60s.)
5. **Can Maria pre-approve by email / QR scan outside the app?** (Recommendation: no. v1 scope is "admin must be online in-app.")
6. **Code mismatch — does this escalate?** Should a detected mismatch trigger a heightened audit log entry, a forced DEK rotation, or just a simple reject? — Switch.
7. **Post-revocation re-enrollment:** if Maria revokes Juan's device then later Juan buys a new laptop — is it a fresh enrollment? (Yes — new device_id, new keypairs, new pending request. Escrow keeps the old `revoked` entry for audit continuity.)
8. **Multiple admins** (future): CS §3.3 says one admin in v1. If v1.x adds co-admins, does any admin approve, or does it require quorum? (Future work.)
9. **Juan's identity display** — we show the UPN (maria@ngo.org) for display; Maria SHOULD trust it only because she reached out to Juan, not because the UPN field says so. How do we reinforce this in copy without being preachy? — Switch + Niobe pass.

---

*End of flow-002 skeleton. Full UX-002 + UX-012 specs to be written in Wave 2 per ux-spec-plan.md.*
