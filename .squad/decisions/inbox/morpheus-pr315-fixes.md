# PR #315 Security Fixes — Morpheus Decision Notes

**Date:** 2026-05-12  
**Branch:** `squad/301-workspace-ipc`  
**Commit:** `707b1e9`  
**PR:** #315 — workspace lifecycle IPC handlers  
**Switch findings:** 1 HIGH, 3 MEDIUM, 3 LOW → all addressed  

---

## Decisions Made

### Path traversal allowlist scope (HIGH-1 / LOW-1)

**Decision:** Allowlist = `os.homedir()` subtree only.

**Rationale:** Pedro picks workspace folders manually via a folder-picker dialog. All realistic locations (OneDrive, Documents, Desktop, any custom sub-folder) are under home. Restricting to home:
- Blocks writes to `/etc`, `C:\Windows`, other users' directories, removable drives outside home
- Allows `C:\Users\pedro\OneDrive\...`, `C:\Users\pedro\Documents\...` etc.
- Does not restrict legitimate use cases

**Alternative considered:** Also allow `app.getPath('documents')`. Rejected because on all tested platforms, `documents` is already under home (`~/Documents`). Adding a second root would complicate the check without benefit.

**Alternative considered:** Allow any absolute path (only reject `..` and UNC). Rejected — Switch explicitly requested a boundary, and "any absolute path" provides no real protection against a compromised renderer escalating to system paths.

### homeDir injection into WorkspaceDeps (engineering decision)

**Decision:** Added `homeDir(): string` to `WorkspaceDeps` interface.

**Rationale:** Existing tests create temp dirs under `os.tmpdir()` which is NOT under `os.homedir()`. Rather than moving tests to home-relative paths (fragile, machine-dependent) or special-casing tests via env vars, injectable `homeDir` is the cleanest solution — consistent with how `hostname()` and `now()` are already injected.

**Test pattern:** `makeDeps({ homeDir: () => path.dirname(tmpDir) })` — the tmpDir's parent becomes the allowed root, so tmpDir itself is within bounds.

### pendingSetups TTL duration (MEDIUM-1)

**Decision:** TTL = 5 minutes, cap = 10.

**Rationale:** 5 minutes is the Switch recommendation. It's long enough that Pedro won't time out during normal setup (he needs to write down 12 words and confirm 3), but short enough to limit exposure window. Cap of 10 is generous for a single-user desktop app while still bounding memory and key accumulation.

### workspace:lock rate limit (MEDIUM-2 / LOW-3)

**Decision:** lock = 30/min (same as unlock).

**Rationale:** Lock is a user-initiated action; 30/min is generous for human use but limits automated abuse from a compromised renderer. Same as unlock to be symmetric.

### Error sanitization scope (LOW-2)

**Decision:** Strip only absolute paths (Win/UNC/POSIX) from error messages. Preserve all other content.

**Rationale:** Only absolute paths constitute information disclosure. Error codes and human-readable descriptions are useful for debugging in Pedro's dev environment. A more aggressive approach (return generic "operation failed") would harm debuggability without a proportional security benefit — Pedro's threat model is a compromised renderer, not a renderer reporting errors to a remote attacker.

### MEDIUM-3 mnemonic as accepted risk

**Decision:** No code change; document as accepted risk.

**Rationale:** The mnemonic MUST be shown to the renderer for the setup-confirmation UX (user must confirm 3 random words). This is inherent to the BIP39 confirmation flow. Mitigations:
1. The 5-min TTL (MEDIUM-1) limits the exposure window
2. The mnemonic is only in transit for the create→confirmSetup window
3. The worst case (renderer exfiltrates mnemonic) is addressed by treating the renderer as untrusted for all other sensitive operations

This is documented in the workspace.ts file header and in the threat model.

---

## Files Changed

| File | Change summary |
|------|----------------|
| `shared/ipc-contracts/workspace.ts` | Added `IPC_WORKSPACE_LOCK`, `workspaceLockRequestSchema`, `workspaceLockResponseSchema`, `WorkspaceLockRequest`, `WorkspaceLockResponse` |
| `main/ipc/handlers/workspace.ts` | `validateFolderBoundary()` exported, `sanitizeFsError()`, rate limiter, pendingSetups TTL/cap, `handleLock()`, `homeDir` in deps |
| `main/ipc/handlers/workspace.test.ts` | Updated `makeDeps()` to accept `homeDir` override; updated `beforeEach` to set `homeDir: () => path.dirname(tmpDir)` |
| `main/ipc/handlers/workspace.security.test.ts` | NEW — 15 regression tests for path traversal, TTL, lock, error sanitization |
| `main/ipc/handlers.ts` | Registered 7 workspace IPC channels (including lock) unconditionally before onboarding gate |
| `preload/index.ts` | Added `workspace` namespace with 7 methods including `lock()` |
