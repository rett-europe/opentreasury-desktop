# Skill — Security Review Checklist (Crypto-at-Rest Features)

> Owner: Switch · Last refined during SPEC-026 review (#306, PR #321).

A reusable, opinionated checklist for reviewing any feature that introduces
or modifies encryption-at-rest in OpenTreasury Desktop. Apply this to every
PR that touches `app/src/core/crypto/**`, `app/src/core/eventLog/Encrypted*`,
`app/src/main/ipc/handlers/workspace*`, or any new key-material lifecycle.

## 1. Crypto primitive sanity

- [ ] AEAD primitive matches the spec (XChaCha20-Poly1305 today). No DIY
      modes, no AES-GCM if XChaCha is the standard.
- [ ] Key sizes and nonce sizes are **enforced with throw** before any sodium
      call — wrong sizes must fail loudly.
- [ ] CSPRNG is libsodium `randombytes_buf` or Node `crypto.randomBytes`.
      Reject `Math.random()`, custom PRNGs, or derived nonces.
- [ ] Argon2id params (m, t, p) are **persisted in the key file**, not
      hard-coded into the decrypt path. Confirm the loader uses the stored
      params, not `DEFAULT_ARGON2_PARAMS`.
- [ ] BIP39 mnemonic is normalized (NFKD + lowercase + whitespace collapse)
      at every public entry point.

## 2. Key material lifecycle

For every key (MK, KEK, session key, derived key), answer:

- [ ] Where is it generated? (CSPRNG only.)
- [ ] Where is it stored? (Wrapped forms only; never plaintext on disk.)
- [ ] Where does it live in memory? Single owner or copied?
- [ ] Who wipes it, when, and in what `finally` block?
- [ ] Does it ever cross the IPC boundary? (MK: NEVER. Mnemonic: only when
      necessary — document explicitly.)
- [ ] Is there a TTL + cap on any pending-state map holding it?

## 3. AAD and nonce hygiene

- [ ] AAD is **identical** on encrypt and decrypt. Diff the two paths
      character-by-character.
- [ ] AAD binds the ciphertext to its **location** (filename, position, or
      ID). A cross-location transplant test MUST fail.
- [ ] Nonces are sourced ONCE from CSPRNG per encrypt call. No derivation
      from content, no reuse across keys.

## 4. IPC surface

- [ ] No request/response schema contains MK or wrapping keys.
- [ ] Mnemonic crossings are deliberate and minimal — enumerate them.
- [ ] Every handler validates request via Zod **before** any crypto work.
- [ ] Rate limiting on any handler that triggers Argon2id.
- [ ] Error messages run through path/PII sanitization before crossing IPC.

## 5. Onboarding / unlock gate

The dashboard must be unreachable pre-unlock. Verify THREE layers:

- [ ] `getEventLog()` throws with a clear message when called pre-unlock.
- [ ] Data IPC handlers are NOT registered until the unlock IPC succeeds.
- [ ] Only the success path of confirmSetup writes `events.key`.

## 6. safeStorage failure handling

- [ ] On `isEncryptionAvailable() === false` → recovery path only.
- [ ] On `decryptString` throw → recovery path only.
- [ ] No silent fallback that opens the workspace empty or regenerates a key.

## 7. Electron hardening (ADR-001 C7)

- [ ] `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
      `webSecurity: true`.
- [ ] No `@electron/remote` import anywhere.
- [ ] CSP injected at the response layer AND in the renderer meta tag.
- [ ] `setWindowOpenHandler` denies all new windows; `will-navigate`
      blocks non-`file://` / non-dev-server URLs.

## 8. Logs / telemetry

- [ ] Grep `console.*` near `mk`, `masterKey`, `wrap_`, `mnemonic`,
      `recoveryCode`. Only metadata (lengths, counts) may be logged.
- [ ] Path strings in error messages are sanitized.

## 9. Test coverage gates

- [ ] AEAD round-trip, AAD mismatch, tampered ciphertext, wrong-key rejection.
- [ ] Cross-location transplant rejection.
- [ ] Argon2id round-trip with **persisted** params.
- [ ] safeStorage failure → recovery path.
- [ ] Path-boundary rejection.
- [ ] Pending-setup TTL eviction wipes the MK.

## 10. Threat model alignment

- [ ] Document what the feature protects against AND what it explicitly
      does NOT (memory inspection, malware-as-same-OS-user, coercion,
      supply-chain — all out of scope by default).
- [ ] Residual risks documented and acknowledged with mitigations.

## Output format

Produce a single Markdown file at `docs/security/<spec-id>-review.md` with:

1. Executive summary (1 paragraph).
2. Verdict (✅ / ⚠️ / 🔴) — explicit, no hedging.
3. The checklist with VERIFIED / GAP / BLOCKER per item.
4. Numbered findings: severity + file:line + recommended fix + owner.
5. Threat-model summary.
6. Test-coverage notes.

## Hard rules

- A Critical finding is a BLOCKER. Flag Pedro immediately.
- No appeals. Security rejections are final.
- A feature that shipped without review still needs the review; any Critical
  finding triggers an emergency patch, not "we'll fix it later."
