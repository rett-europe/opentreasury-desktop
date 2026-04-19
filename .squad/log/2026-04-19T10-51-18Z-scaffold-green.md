# Session — Scaffold GREEN

- **Date:** 2026-04-19T10:51:18Z
- **Requested by:** Pedro (perocha)
- **Branch:** feat/app-scaffold-and-i18n-adr

## Summary

Neo repaired the fresh scaffold iteratively (coordinator-driven, VS Code sync). All checks now clean:

- `npm run typecheck` — 0 errors (was 22)
- `npm run lint` — 0 errors, 0 warnings (was 62 errors + 15 warnings)
- `npm test` — 1/1 passing
- `package-lock.json` now on disk and committed

## `--legacy-peer-deps` choice

Adding `eslint-import-resolver-typescript@^3.6.0` surfaced a peerOptional conflict: resolver 3.10.1 requires `@typescript-eslint/utils` v8, but we're pinned to v7 via ESLint 8. Install fails under strict peer resolution.

**Decision:** install with `--legacy-peer-deps`. Documented as a scaffold-level constraint. To be revisited when we move to ESLint 9 / `@typescript-eslint` v8.

## Notable deviations

- `skipLibCheck: true` in `tsconfig.base.json` — deviates from ADR-002 §4. Root cause is `electron.d.ts` colliding with `@types/node` and pulling DOM types into main-process contexts. Recorded as ADR-002 Addendum. Source code is still fully strict (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- `.eslintrc.cjs` now has a main/preload override for electron imports. Boundary rules for renderer/crypto/storage/core remain enforced — Switch-relevant.

## Ready to merge

Scaffold branch `feat/app-scaffold-and-i18n-adr` is green and ready for PR to `main`.
