# `tests/integration/`

Integration tests that combine multiple `app/src/*` modules — typically `core/` + `crypto/` + `storage/`
using the in-memory storage adapter — but do **not** spin up Electron.

Runner: Vitest. Run via `npm run test:integration`.

Traceability: ADR-002 §4 (hybrid test layout), §7.3.
