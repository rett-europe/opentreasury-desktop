# `app/src/core/` — Event-Sourced Domain

**Electron-free. fs-free.** Runs under plain Node (and the browser, in principle — though we never do).

## What lives here

- **Event definitions** (`events.ts`) — the append-only event log's type surface. ULID-identified (ADR-001 C11).
- **Reducers** (`reducers/`) — pure functions `(state, event) => state` producing read-model projections.
- **Commands** (`commands/`) — pure functions `(request, state) => event[]`. No side effects. No I/O.
- **Audit** (`audit/`) — hash-chain build + Ed25519 signature verify. Mirrors `docs/security/crypto-spec.md` §8.
- **Query** (`query/`) — read-model queries against the derived SQLite cache.

## What does NOT live here

- Filesystem I/O — that's `src/storage/`.
- Crypto primitives — that's `src/crypto/`.
- Electron / IPC — that's `src/main/`.
- React / DOM — that's `src/renderer/`.

## Why the separation

Testability. Every reducer, command, and audit verifier runs under Vitest on plain Node with in-memory
fixtures. No Electron spin-up. No OS keychain. No real OneDrive folder. Switch audits this boundary
in a single pass.

## Traceability

- ADR-001 (tech stack, Option A event sourcing)
- ADR-002 §2.4 (core is Electron-free)
- Security requirements R3, R5, R8, R17
- Crypto spec §8 (audit chain)
