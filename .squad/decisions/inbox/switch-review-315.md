# Switch Security Review — PR #315 (Workspace IPC)

**Date:** 2026-05-11  
**PR:** #315 (`squad/301-workspace-ipc`)  
**Author:** Morpheus  
**Reviewer:** Switch (Security)  
**Verdict:** REQUEST_CHANGES

## Summary

IPC surface for SPEC-026 workspace lifecycle (detect/create/confirmSetup/enroll/unlock/recover). High-value attack surface — this is the boundary a potentially compromised renderer uses to manage encrypted workspaces.

## Findings

| # | Severity | Issue | File |
|---|----------|-------|------|
| 1 | HIGH | Path traversal — renderer-supplied `folderPath` used in `fs.mkdir` + `saveKeyFile` with no canonicalization or boundary check | workspace.ts:186-209 |
| 2 | MEDIUM | `pendingSetups` map has no TTL, no cap — memory DoS + key material accumulation | workspace.ts:82,216 |
| 3 | MEDIUM | Mnemonic returned to renderer (UX-required but unbounded lifetime) | workspace.ts:221 |
| 4 | MEDIUM | No `workspace:lock` handler — MK lives in memory until process exit | workspace-session.ts |
| 5 | LOW | `workspace:detect` probes arbitrary filesystem paths | workspace.ts:149-175 |
| 6 | LOW | Error messages leak internal OS paths to renderer | workspace.ts:137-142 |
| 7 | LOW | No rate limiting on workspace IPC channels | all handlers |

## Blocking

Issue #1 (path traversal) blocks merge. Renderer is untrusted per ADR-001 C13.

## Positive

- MK never crosses IPC boundary to renderer
- Strict preload allowlist (no raw ipcRenderer)
- Zod validation on all inputs
- Response schema enforcement prevents field leaks
- Proper MK wipe discipline with `finally` blocks
- Recovery key wiped immediately after use
