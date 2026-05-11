# Decision Record: Workspace + IPC Contracts (#301)

**Author:** Morpheus  
**Date:** 2026-05-12  
**Issue:** #301 — Workspace + IPC contracts (SPEC-026 encryption-at-rest)  
**Branch:** `squad/301-workspace-ipc`  
**Status:** Draft PR (ready for Trinity + Switch review)

---

## Summary

Wired the full workspace lifecycle (detect → create → confirmSetup → enroll → unlock → recover) behind the 6 typed IPC channels defined in `shared/ipc-contracts/workspace.ts`.

---

## IPC Channel Map

| Channel | Handler | Description |
|---|---|---|
| `workspace:detect` | `handleDetect` | 5-state detection: fresh, join, unlock, recovery, migration |
| `workspace:create` | `handleCreate` | Generate MK + 12-word mnemonic, store in pending map |
| `workspace:confirmSetup` | `handleConfirmSetup` | Validate 3 challenge words, persist `events.key`, start session |
| `workspace:enroll` | `handleEnroll` | Join existing workspace via mnemonic, add device to `events.key` |
| `workspace:unlock` | `handleUnlock` | Silent unlock via safeStorage |
| `workspace:recover` | `handleRecover` | Re-wrap MK via mnemonic when safeStorage fails |

---

## Architecture Decisions

### 1. Deps injection pattern (extends existing handlers pattern)
All Electron-specific APIs (`safeStorage`, `hostname`, `deviceId`) injected via `WorkspaceDeps` interface. `buildProductionWorkspaceDeps()` imports `electron` lazily so tests import the module without Electron.

**Rationale:** Consistent with `config.ts`, `onboarding.ts`, `app.ts` handlers. Enables deterministic unit tests without Electron mocks.

### 2. PendingSetups Map bridges create → confirmSetup
`workspace:create` generates the MK in-memory and stores `{folderPath, mk, mnemonic}` keyed by an opaque `setupToken` ULID. `workspace:confirmSetup` looks up by token, validates challenge words, then persists `events.key` and wipes the pending entry.

**Rationale:** The renderer needs to display the mnemonic before the user confirms 3 words. Keeping the MK in memory between these two steps avoids writing sensitive material to disk before confirmation.

### 3. workspace:unlock and workspace:recover use lastDetectedFolderPath
Per Trinity's IPC contract, `workspace:unlock` and `workspace:recover` have no `folderPath` field in their request. The workspace session singleton stores `lastDetectedFolderPath` set by `workspace:detect`.

**Rationale:** The renderer flow always calls `workspace:detect` first; the folderPath is already known to the main process. Avoids redundant param in subsequent calls.

### 4. Workspace channels registered before onboarding gate
In `registerIpcHandlers()`, workspace channels are registered unconditionally — before `isOnboardingPending()`. All other data channels (panel, accounts, transactions, etc.) are gated after onboarding completes.

**Rationale:** Onboarding IS the workspace setup flow. Channels must be available to the renderer during onboarding.

### 5. safeStorage wrap stored as base64 in events.key
`safeStorage.encryptString(mkBase64)` returns a `Buffer`. This is stored as `base64(encryptedBuffer)` in `events.key → devices[].wrap_safestorage`.

Unwrap: `Buffer.from(wrap_safestorage, 'base64')` → `safeStorage.decryptString()` → mkBase64 → `Uint8Array`.

**Rationale:** `events.key` is JSON; binary must be base64-encoded. The outer base64 is the encoded ciphertext, not the plaintext key material.

---

## Files Changed

New files:
- `app/src/core/workspace/detect.ts` — pure detection logic
- `app/src/core/workspace/index.ts` — barrel export
- `app/src/main/workspace-session.ts` — in-memory session singleton
- `app/src/main/ipc/handlers/workspace.ts` — handler factory + production deps
- `app/src/core/workspace/detect.test.ts` — 9 unit tests
- `app/src/main/ipc/handlers/workspace.test.ts` — 16 unit tests
- `app/src/main/ipc/handlers/workspace.integration.test.ts` — 3 integration tests (real Argon2id)

Modified:
- `app/src/main/ipc/handlers.ts` — +6 ipcMain.handle() registrations
- `app/src/preload/index.ts` — +workspace namespace on `window.opentreasury`

---

## Reviewers

- **Trinity** — IPC contract compatibility, preload surface, renderer-side usage
- **Switch** — Key material lifecycle, wipe discipline, safeStorage wrap/unwrap correctness
