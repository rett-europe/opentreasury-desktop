# Switch Security Review — PR #312

**PR:** #312 `feat(eventlog): per-device encrypted event log + events.key v2 (#309)`
**Branch:** `squad/309-per-device-event-log`
**Author:** Morpheus
**Reviewer:** Switch
**Date:** 2026-05-12

## Verdict: COMMENT (not blocking)

## Severity Counts

| Severity | Count | Status |
|----------|-------|--------|
| HIGH     | 0     | —      |
| MEDIUM   | 2     | Open   |
| LOW      | 3     | Open   |

## Stream A — #310 MEDIUM Fixes

Both MEDIUMs from Switch review #310 are **RESOLVED**:
- MEDIUM-1: Mnemonic normalization (NFKD + lowercase + trim + collapse) applied in all entry points. 12 tests.
- MEDIUM-2: wipe() via sodium_memzero in deriveRecoveryKey try/finally. 4 tests.

## Stream B — New Findings

**MEDIUM-1:** `saveKeyFile` does not fsync parent directory after rename. Safe on NTFS, risky on POSIX (ext4).

**MEDIUM-2:** AAD binds only `event.id`, not device ID. Cross-device ciphertext transplant possible if attacker has write access to sync folder. Decide before v1 ships whether to add deviceId to AAD.

**LOW-1:** Stale .tmp cleanup has narrow TOCTOU window. Mitigated by error swallowing.

**LOW-2:** appendBatch partial-crash leaves truncated line. Handled by malformed-line tolerance + idempotency.

**LOW-3:** No explicit file permissions on events.key. Suggest mode 0o600 on non-Windows.

## Build Gates

All green: typecheck ✅ · lint ✅ · format:check ✅ · 1118 tests pass ✅
