# Decision: Switch security review of PR #317

- **PR:** #317 (squad/307-renderer-ipc-wireup)
- **Author:** Trinity
- **Reviewer:** Switch (Security)
- **Date:** 2026-07-08
- **Verdict:** APPROVE

## Summary

Renderer-side IPC wireup for onboarding flows (FreshSetupFlow, JoinFlow, RecoveryFlow, MigrationScreen, App.tsx routing). Replaces mock IPC with real `window.opentreasury.workspace.*` bridge.

## Findings

- **0 High, 0 Medium, 1 Low, 0 Blocking**
- **Low:** Mnemonic not explicitly cleared from React state after confirmSetup/enroll success in FreshSetupFlow and JoinFlow. Stays in memory until component unmounts. Recommend `setMnemonic('')` after success branch as defense-in-depth.
- Folder paths come from Electron dialog or main-process detect — no client-side normalization (correct).
- `workspace:detect()` called with no renderer-supplied paths — main process is authoritative.
- No mnemonic logging, no telemetry payloads, no internal path leaks.
- Gates: typecheck ✅, lint ✅, tests ✅ (1190 passed).
