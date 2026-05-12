# SPEC-026 — Security Review (Ship Gate)

> **Reviewer:** Switch (Security Engineer) · **Date:** 2026-05-12
> **Spec:** [`docs/specs/026-encryption-at-rest.md`](../specs/026-encryption-at-rest.md)
> **Issue:** [#306](https://github.com/rett-europe/opentreasury-desktop/issues/306)
> **Release reviewed:** `v0.1.0-trial.3.8` (commit `9f86c17`)
> **Status of feature:** Shipped — `trial.3.8` live; 2 production workspaces encrypted.

---

## 1. Executive Summary

SPEC-026 ships a defensible, well-bounded encryption-at-rest implementation.
Crypto primitives (XChaCha20-Poly1305, Argon2id, BIP39) are used correctly,
the Master Key never touches disk or the IPC boundary in plaintext, AAD is
bound to both `eventId` and the device filename, and nonces are sourced from
libsodium's CSPRNG with a defensive in-process collision check. Electron is
hardened per ADR-001 C7 (sandbox + contextIsolation + nodeIntegration off +
strict CSP + navigation lock). The onboarding flow is structurally
unbypassable: the data IPC handlers are not registered until
`installEncryptedEventLog` runs, and `getEventLog()` throws an explicit error
if any code path tries to query the workspace before unlock — so the renderer
cannot reach a populated dashboard without completing setup / unlock /
recovery. No critical or high-severity findings.

## 2. Verdict

### ✅ APPROVED — SHIP

Verdict applies to the encryption core, key file format, workspace lifecycle
IPC, and the bootstrap unlock gate as of `v0.1.0-trial.3.8`. The conditions
below are **non-blocking follow-ups** — none of them put the shipped trial
workspaces at risk.

**Follow-up conditions (non-blocking, must be tracked):**

1. **Export-decrypted (AC8) is not yet implemented.** When implemented, the
   handler MUST require recovery-code re-entry and MUST derive the unwrap via
   the Argon2id path, never via `safeStorage`. Add this as an issue before
   the feature lands. (Finding #4.)
2. **Spec/code drift on Argon2id `t` parameter.** Spec §4.1 says `t=3`; the
   shipped code uses `t=4` (`DEFAULT_ARGON2_PARAMS`, benchmark ~432 ms).
   Update the spec to match the shipped value so future reviewers don't
   chase a phantom regression. (Finding #5.)
3. **`usedNonces` set is unbounded.** Defensive only; not a security issue,
   but log it as a low-priority memory hygiene item. (Finding #7.)

---

## 3. Checklist (from issue #306)

| # | Item | Verdict | Notes |
|---|------|---------|-------|
| 1 | Crypto primitives match spec (XChaCha20-Poly1305 / Argon2id / BIP39) | ✅ VERIFIED | `primitives.ts`, `recoveryKey.ts`, `mnemonic.ts`. Libsodium-backed; key/nonce sizes enforced. |
| 2 | No MK leaks in logs, telemetry, or IPC | ✅ VERIFIED | No `console.*` call references `mk`, `masterKey`, `wrap_*`, or the mnemonic contents. The only mnemonic crossing IPC is the one shown to the user post-`workspace:create` (acknowledged MEDIUM-3, necessary). |
| 3 | Nonces are 24-byte CSPRNG | ✅ VERIFIED | `nonce.ts` calls `sodium.randombytes_buf`; collision-detection set asserts uniqueness within process. |
| 4 | AAD binding prevents event-swapping between devices | ✅ VERIFIED | `event.ts` uses `${eventId}:${deviceId}` on both encrypt and decrypt; `EncryptedMultiDeviceEventLog` extracts `deviceId` from the filename on load. Cross-device transplant test green. |
| 5 | Recovery code re-entry enforced on export | ⚠️ GAP (deferred) | Export-decrypted handler is **not implemented yet** (no `exportDecrypted` IPC channel in the codebase). AC8 is unmet because the feature doesn't ship in `trial.3.8`. Not a regression — the spec was never claimed shipped on this point. See Finding #4. |
| 6 | No skip path in onboarding — dashboard unreachable without confirmation | ✅ VERIFIED | `bootstrap.ts` early-returns when `events.key` exists (no `eventLog`); `getEventLog()` throws; data IPC handlers are deferred until `installEncryptedEventLog` runs. `workspace:confirmSetup` only persists the key file after all 3 challenge words match. |

---

## 4. High-Priority Verification (from issue body)

| # | Claim | Verdict | Evidence |
|---|------|---------|----------|
| 1 | MK never touches disk in plaintext | ✅ VERIFIED | Persisted only as (a) `wrap_safestorage` per device (OS keychain encrypted) and (b) `wrap_recovery` (Argon2id-derived KEK XChaCha20-wrapped). No third write path exists. |
| 2 | MK never crosses the IPC boundary | ✅ VERIFIED | Renderer surface returns `{ ok: true }` after unlock; MK is held only in main-process `workspace-session.ts` and `pendingSetups`. Renderer-side mocks confirm no MK in any response schema. |
| 3 | Nonces are 24 bytes from CSPRNG, never derived from content, never re-used | ✅ VERIFIED | `nonce.ts` is the single source. No code path passes a deterministic value to `crypto_aead_xchacha20poly1305_ietf_encrypt`. |
| 4 | AAD = `eventId:deviceId` identical encrypt/decrypt | ✅ VERIFIED | `event.ts:38`, `event.ts:71`; `EncryptedMultiDeviceEventLog.ts:293-294` derives `fileDeviceId` from the filename and feeds it to `decryptEvent`. Test `cross-device transplant: line copied from events-A into events-B fails to decrypt` is green. |
| 5 | Argon2id params persisted in `events.key` for forward-compat | ✅ VERIFIED | `keyFile.ts` Zod-validates `argon2_params`; `workspace:enroll` / `workspace:recover` re-derive using the stored params, not `DEFAULT_ARGON2_PARAMS`. Test `persists Argon2id params (m=65536, t=4, p=1) inside the file for forward-compat` is green. |
| 6 | Recovery code never logged | ✅ VERIFIED | Greps for `console.*` + mnemonic-adjacent identifiers return only metadata logs (e.g. word count mismatch warnings); no content. |
| 7 | safeStorage failure → recovery-only path; no silent empty-workspace fallback | ✅ VERIFIED | `workspace:unlock` returns `needs-recovery` when `safeStorage.decryptString` throws or `isEncryptionAvailable` is false. Bootstrap defers event-log construction when `events.key` exists, so the renderer cannot reach a populated read model without a successful unlock or recover. |
| 8 | Cannot reach dashboard before recovery-code confirmation | ✅ VERIFIED | `confirmSetup` is the only path that writes `events.key`; no `events.key` means the renderer routes to setup; failing challenge words returns `confirmation_mismatch` and leaves pendingSetups intact. |

---

## 5. Findings

> Severity scale: **Critical** (must fix before ship), **High**, **Medium**,
> **Low**, **Info**.

### 5.1 Critical / High

None. The shipped trial is sound for the documented threat model.

### 5.2 Medium / Low / Info

#### Finding #1 — `workspace:create` returns the mnemonic to the renderer (Info, acknowledged risk)

- **File:** `app/src/main/ipc/handlers/workspace.ts:380`
- **Description:** Fresh-setup requires showing the 12 words on-screen, so the
  mnemonic crosses the IPC boundary by design. Acknowledged in the code as
  MEDIUM-3 with mitigation: a 5-minute TTL + 10-entry cap on `pendingSetups`,
  buffer wipe on eviction/confirm.
- **Recommended fix:** None — the alternative (rendering in main and pushing
  HTML to renderer) is worse. Keep the mitigations.
- **Owner:** N/A (accepted residual risk).

#### Finding #2 — Recovery-code strings in renderer cannot be wiped (Info)

- **File:** `app/src/renderer/components/onboarding/*` and the IPC payload for
  `workspace:enroll` / `workspace:recover`.
- **Description:** Users type the mnemonic into React inputs (immutable JS
  strings) which the renderer ships to main as a JSON string. Both the
  renderer copy and the deserialized string in main are non-wipeable. Within
  the published threat model (memory inspection is out of scope), this is
  fine.
- **Recommended fix:** None for v1. If a future hardening pass wants to
  reduce window, switch the IPC payload to a `Uint8Array` of UTF-8 bytes that
  main can wipe after Argon2id consumes it.
- **Owner:** Future hardening (Switch + Morpheus).

#### Finding #3 — `pendingSetups` Map could theoretically leak across overlapping flows (Low)

- **File:** `app/src/main/ipc/handlers/workspace.ts:121`
- **Description:** The cap is 10 entries with FIFO eviction. A renderer
  storming `workspace:create` (rate-limit cap 10/min) would still cycle
  entries; eviction `wipe()`s the MK so memory is correct, but a stale token
  on the renderer side would silently 404 on confirm. Acceptable; the user
  re-runs setup.
- **Recommended fix:** None mandatory. Optional improvement: surface a
  `setup_token_evicted` error so the renderer can show a clearer message
  than "invalid_setup_token".
- **Owner:** Niobe / Morpheus (UX polish).

#### Finding #4 — Export-decrypted (AC8) not implemented (Medium)

- **File:** No file — feature absent.
- **Description:** SPEC-026 §7 / AC8 requires that "Export decrypted data"
  re-prompt for the 12-word recovery code, even when `safeStorage` could
  unlock silently. No `exportDecrypted` IPC channel exists in the codebase.
- **Recommended fix:** When the feature lands, implementation MUST:
  1. Take the mnemonic as the request payload (not piggyback on the active
     session MK).
  2. Re-derive via `deriveRecoveryKey` against the stored salt + params.
  3. Compare the unwrap output against the active MK only as a sanity check
     — never trust safeStorage-derived MK for this code path.
  4. Wipe the recovery key and any intermediate buffers in `finally`.
- **Owner:** Morpheus / Niobe (feature implementation); Switch (sign-off).

#### Finding #5 — Spec/code drift on Argon2id `t` (Medium, docs only)

- **File:** `docs/specs/026-encryption-at-rest.md:92-93`
  vs. `app/src/core/crypto/recoveryKey.ts:29-33`.
- **Description:** Spec §4.1 documents `t = 3`; the shipped code and the
  benchmark comment use `t = 4`. The persisted `argon2_params` in
  `events.key` correctly stores the **runtime** value (`t = 4`), so already-
  encrypted workspaces are unaffected. The risk is reviewer confusion and
  future "fix" PRs that revert to `t = 3` and brick already-encrypted
  recovery wraps.
- **Recommended fix:** Update spec to `t = 4` (or whichever Keaton's final
  benchmark sign-off chose). Add a one-line note: "params are workspace-
  immutable, persisted in `events.key.argon2_params`."
- **Owner:** Oracle / Niobe (docs).

#### Finding #6 — `validateFolderBoundary` `includes('..')` is dead code after `path.resolve` (Low, Info)

- **File:** `app/src/main/ipc/handlers/workspace.ts:214`
- **Description:** `path.resolve` already collapses `..` segments. A literal
  filename containing `..` (e.g. `~/My..Folder`) would be erroneously
  rejected by this check. Edge case — unlikely to bite real users — but the
  guard adds no security value.
- **Recommended fix:** Remove the `includes('..')` check; rely on
  `startsWith(homeWithSep)` (which is the actual boundary).
- **Owner:** Keaton / Switch (cleanup PR, post-trial).

#### Finding #7 — Per-process `usedNonces` Set is unbounded (Low, Info)

- **File:** `app/src/core/crypto/nonce.ts:14`
- **Description:** The defensive collision-detection Set grows monotonically
  for the process lifetime. For a desktop app this is bounded by user
  behaviour, but a long-lived dev session writing thousands of events would
  accumulate ~`(24 + overhead) * N` bytes.
- **Recommended fix:** Optional. Replace with a probabilistic structure
  (Bloom filter) or simply drop the check on the grounds that 192-bit
  XChaCha20 nonce collisions are astronomically improbable. Lowest priority.
- **Owner:** Morpheus (post-trial cleanup).

#### Finding #8 — `cleanupStaleTmpFiles` swallows non-ENOENT errors as warnings (Low, Info)

- **File:** `app/src/core/eventLog/EncryptedMultiDeviceEventLog.ts:346-363`
- **Description:** Reasonable behaviour — tmp files contain only ciphertext;
  failure to delete is operational debt, not a security issue. Noted because
  the same pattern recurs and is worth a future log/metrics pass.
- **Owner:** Cypher (telemetry hookup, future).

---

## 6. Threat Model Summary

### 6.1 Threats SPEC-026 explicitly protects against

| Threat | Mitigation in shipped code |
|--------|-----------------------------|
| Stolen laptop, no full-disk encryption | Both wraps required to read events; `safeStorage` (DPAPI/Keychain/libsecret) is per-OS-user; recovery wrap is Argon2id-hard (m=64 MiB, t=4). |
| OneDrive / Dropbox cloud-store leak of the workspace folder | All event files are ciphertext; `events.key` only contains wrapped material + Argon2id params + salt. |
| Other OS user on a shared PC | safeStorage is per-OS-user; that user has no enrolled device entry and no recovery code. |
| Tampering with a single ciphertext line | AEAD authentication fails → `ENCRYPTED_EVENT_AUTH_FAILED`, surfaced to the user, never silently dropped. |
| Cross-device ciphertext transplant (moving a line from `events-A.ndjson` into `events-B.ndjson`) | AAD `eventId:deviceId` mismatch → AEAD verification fails. Test-covered. |
| `events.key` race during enrollment | Atomic `tmp → fsync → rename`; multi-device merge logic for OneDrive conflict copies. |
| Schema version skew (future build downgrade) | `loadKeyFile` returns `KEY_FILE_UNSUPPORTED_VERSION`; bootstrap refuses to mount. |
| Renderer reading dashboard pre-unlock | Bootstrap defers event-log construction; data IPC handlers not registered; `getEventLog()` throws with a clear message. |
| Bypass of recovery-code confirmation in fresh setup | `confirmSetup` is the only writer of `events.key`; rejects if any of the 3 challenge words mismatch; the in-memory MK is wiped on TTL eviction. |
| Support-bundle / screenshot leakage of file paths | File contents are opaque ciphertext; path-only leak reveals nothing exploitable. Error messages run through `sanitizeFsError`. |

### 6.2 Threats explicitly OUT OF SCOPE for SPEC-026 v1

Documented in spec §3 "Out of scope" and re-affirmed here. Pedro must
communicate these to board users:

- **Malware running as the same OS user while the app is open** — can call
  the same APIs the legitimate user can. Defence is OS-level (Defender,
  ATP), not application-level.
- **Memory inspection of the running process** — keys live in process
  memory in the clear during AEAD operations. `wipe()` is best-effort.
- **Side-channel attacks** (timing, power, cache).
- **Compromised electron-builder / npm supply chain** — addressed
  separately by code-signing and dependency review, not by SPEC-026.
- **Coercion / compelled disclosure of the recovery code.**
- **Per-user revocation, key rotation, and re-encryption after a user
  leaves the team.** Spec §2 documents this as v1 non-goal — same trust
  model as a shared Excel password. Pedro: this needs to be on the README
  for any board considering OpenTreasury for sensitive workspaces.
- **Compromise of another enrolled device.** Removing a device's entry
  from `devices[]` prevents future silent unlocks but does not invalidate
  the MK or any copies the attacker already exfiltrated.

### 6.3 Residual risk acknowledged by the implementation

- **Mnemonic crosses the IPC boundary** (in plaintext JSON) on `workspace:
  create` (display), `workspace:enroll` (join), `workspace:recover`. This
  is unavoidable in a desktop app where the renderer is the UI. Mitigated
  by IPC contextIsolation, sandbox, CSP, and the 5-minute pending-setup
  TTL.
- **JS strings holding the mnemonic cannot be securely wiped** — finding
  #2 above. Within scope of the published threat model (memory inspection
  is out of scope), accepted.

---

## 7. Test Coverage Notes

Strong coverage in `app/src/core/crypto/__tests__/` and
`app/src/core/eventLog/__tests__/`:

- AEAD round-trip, AAD mismatch, tampered ciphertext, wrong-key decrypt,
  cross-device transplant rejection — all green.
- Nonce uniqueness, mnemonic normalization (Switch #310 MEDIUM-1), wipe()
  utility (MEDIUM-2), key-file atomic write + POSIX `mode 0o600`,
  multi-device merge, dedup by event id, malformed-line tolerance.
- `workspace.security.test.ts` covers path-boundary rejection (UNC, device
  paths, traversal, outside-home), `pendingSetups` TTL eviction, lock
  zeroization, error-message sanitization.

**Gaps Cypher should backfill** (in parallel with this review, per Pedro):

1. End-to-end test: fresh install → setup → close app on Screen 2b →
   relaunch → confirm the previous mnemonic does NOT unlock anything
   (AC3).
2. Two-device merge: write events on device A, write events on device B,
   merge in ULID order on a third "reader" device (AC10, AC11).
3. `safeStorage` failure simulation → `needs-recovery` route → recovery
   succeeds → `wrap_safestorage` is refreshed in `events.key` (AC6).
4. Export-decrypted (once implemented) — must require mnemonic, must
   reject when only safeStorage is available.

---

## 8. Approvals

- **Switch (Security):** ✅ APPROVED — sign-off for `trial.3.8`, conditions
  in §2 must be tracked as follow-up issues.

— *Switch, Security Engineer · OpenTreasury Desktop · 2026-05-12*
