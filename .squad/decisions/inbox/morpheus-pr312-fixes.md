# Morpheus — PR #312 Security Remediation Decision Note

**Date:** 2026-05-12  
**Author:** Morpheus  
**PR:** #312 `feat(eventlog): per-device encrypted event log + events.key v2 (#309)`  
**Branch:** `squad/309-per-device-event-log`  
**Status:** Pushed, marked ready for re-review by Switch

---

## Summary

Switch's review of PR #312 returned 0 HIGH / 2 MEDIUM / 3 LOW. All 5 findings addressed in 3 commits. Gates: typecheck ✅ · lint ✅ · format:check ✅ · 1125 tests pass ✅.

---

## MEDIUM-1 — AAD Scope (commit b9213a9)

**Finding:** AAD bound only `event.id`. A ciphertext from `events-{A}.ndjson` could be transplanted into `events-{B}.ndjson` and still decrypt.

**Decision:** Change AAD format to `"{eventId}:{deviceId}"` (UTF-8 bytes). The deviceId is the **file's** device (extracted from `events-{id}.ndjson` filename on read), not `event.actorDeviceId`.

**Impact:**
- `encryptEvent` and `decryptEvent` now take a required `deviceId` parameter.
- `EncryptedMultiDeviceEventLog.encryptOne` passes `this.deviceId`.
- `load()` does `fileName.slice('events-'.length, -'.ndjson'.length)` to extract `fileDeviceId`.
- **Breaking**: events written with old AAD (eventId-only) cannot be decrypted. Pre-v1 — no shipped data affected. Test fixtures never used hardcoded ciphertexts.
- Spec `026-encryption-at-rest.md` §4.4 and AC14 updated.

---

## MEDIUM-2 — Parent Directory fsync After Rename (commit 1c14a2e)

**Finding:** `saveKeyFile` did `tmp → fsync(file) → rename(tmp, final)` but did NOT fsync the parent directory. On POSIX with ext4, the directory entry for `events.key` might be lost on power failure.

**Decision:** After rename, open parent directory with `'r'` and call `FileHandle.sync()` on POSIX (`process.platform !== 'win32'` guard).

**Rationale for Windows exclusion:** NTFS journals the rename; extra syscall unnecessary and opening a directory with `'r'` is unsupported on Windows.

---

## LOW-1 — Stale .tmp TOCTOU ENOENT Suppression (commit c507775)

**Finding:** Stale .tmp cleanup has a narrow TOCTOU window. Already mitigated by error swallowing.

**Fix:** Silently `continue` on ENOENT (expected race: another concurrent `load()` won the unlink). Other error codes still emit `console.warn`.

---

## LOW-2 — appendBatch Partial-Crash Documentation (commit c507775)

**Finding:** appendBatch partial-crash leaves truncated line.

**Fix:** Added explanatory comment to `appendBatch` documenting that (a) a truncated last line is skipped by malformed-line tolerance, and (b) fully-written events within the same batch are re-submitted on retry and de-duplicated by `seenIds`. No code logic change needed — the invariant was already correct.

---

## LOW-3 — events.key File Permissions (commit c507775)

**Finding:** No explicit file permissions on `events.key`. Suggest mode 0o600 on non-Windows.

**Fix:** `saveKeyFile` passes `mode: 0o600` to `fs.writeFile` when creating the tmp file on POSIX. The rename propagates the tmp file's mode to the final `events.key`. On Windows the `mode` argument is ignored.

---

## Test Coverage Added

| Finding | Tests Added |
|---------|-------------|
| MEDIUM-1 | `event.test.ts`: wrong deviceId → AEAD failure. `EncryptedMultiDeviceEventLog.test.ts`: positive same-device round-trip; negative cross-device transplant (fresh dir, B-file only). |
| MEDIUM-2 | `keyFile.test.ts`: platform patched to `'linux'` + fake FileHandle spy asserts dir open count = 1; platform patched to `'win32'` asserts dir open count = 0. |
| LOW-1 | `EncryptedMultiDeviceEventLog.test.ts`: mock `fs.unlink` to ENOENT, assert no `console.warn`. |
| LOW-3 | `keyFile.test.ts`: `stat.mode & 0o777 === 0o600` on POSIX, skipped on win32. |
