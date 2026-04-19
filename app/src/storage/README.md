# `app/src/storage/` — OneDrive Folder Adapter

Electron-free. Wraps `node:fs` behind an interface so tests swap in an in-memory implementation.

## Contract

- `adapter.ts` — `StorageAdapter` interface. `read(path)`, `writeAtomic(path, bytes)`, `list(prefix)`, `watch(onChange)`.
- `onedrive-folder.ts` — production `node:fs`-backed implementation. Writes atomic (temp + rename) to survive
  partial sync interruptions.
- `memory.ts` — in-memory implementation for unit + integration tests.
- `paths.ts` — ULID filename helpers (ADR-001 C11), path-traversal guards (R18).

## Rules

- **No Electron imports.** Tested under plain Node.
- **v1 storage scope:** OneDrive for Business + SharePoint only. OneDrive Personal rejected by `paths.ts`
  validation per Pedro's 2026-04-19 resolution.
- All filenames ULID-based. No PII, no amounts, no donor names in any filename (C11, R3).
- Path-traversal guards on every public method.

## Traceability

- ADR-001 Option A (file-per-event storage)
- ADR-002 §2.6 (storage adapter mockable)
- Security requirements R3, R18
- Decision 2026-04-19 (OneDrive for Business / SharePoint only; Personal deferred to v1.x)
