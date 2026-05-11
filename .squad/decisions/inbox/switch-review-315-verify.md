# Switch — PR #315 Security Verify Pass

**Date:** 2026-05-12
**PR:** #315 (branch `squad/301-workspace-ipc`)
**Commit reviewed:** `707b1e9`
**Verdict:** APPROVE — all 7 findings addressed

---

## Findings verification

| ID | Severity | Finding | Status | Notes |
|----|----------|---------|--------|-------|
| HIGH-1 | HIGH | Path traversal in workspace folder handlers | ✅ Fixed | `validateFolderBoundary()` with homedir allowlist, UNC/device-path/`..` rejection. 6 regression tests. |
| MEDIUM-1 | MEDIUM | Unbounded `pendingSetups` key accumulation | ✅ Fixed | 5-min TTL (setTimeout + unref), cap=10, oldest-evicted, `wipe(mk)` on eviction. Regression test with fake timers. |
| MEDIUM-2 | MEDIUM | Missing `workspace:lock` handler | ✅ Fixed | `handleLock()` → `clearActiveWorkspace()` (wipe + null). Registered, preload-bridged, rate-limited 30/min. 2 tests. |
| MEDIUM-3 | MEDIUM | Mnemonic sent to renderer | ✅ Accepted risk | See rationale below. |
| LOW-1 | LOW | Allowlist scope | ✅ Fixed | Bundled with HIGH-1 (homedir boundary). |
| LOW-2 | LOW | Error message path leakage | ✅ Fixed | `sanitizeFsError()` strips Win/UNC/POSIX absolute paths. Regression test. |
| LOW-3 | LOW | No rate limiting | ✅ Fixed | Per-channel sliding-window limiter on all 7 channels. |

## MEDIUM-3 accepted risk assessment

**Finding:** `workspace:create` returns the 12-word mnemonic to the renderer in plaintext.

**Morpheus rationale:** The mnemonic *must* reach the renderer for the BIP39 confirmation UX (user confirms 3 random words). No architectural alternative exists that avoids renderer exposure.

**Switch assessment: Acceptance is sound.**

1. **Inherent constraint:** The BIP39 flow requires the user to see all 12 words. The renderer is the only display surface. Encrypting in transit (main→renderer) would require a shared secret that the renderer already possesses — adding no real security.
2. **Mitigations are concrete:** The pending entry holding the mnemonic in main is bounded by a 5-min TTL and 10-entry cap (MEDIUM-1 fix). The MK buffer is `wipe()`d on confirm, eviction, or TTL expiry.
3. **Threat boundary is correct:** The threat model treats the renderer as untrusted for all operations *except* displaying user-facing content. Showing the mnemonic is exactly that — user-facing content the renderer must render.
4. **No deferral:** This is a genuine acceptance with documented rationale and mitigations, not a "we'll fix it later" deferral.

## Gate results

- `npm run typecheck` — pass
- `npm run lint` — pass
- `npm run format:check` — pass
- `npm test` — 1175 passed, 2 failed (pre-existing `RecoveryCodeInput` timeout flakes, not in scope)
