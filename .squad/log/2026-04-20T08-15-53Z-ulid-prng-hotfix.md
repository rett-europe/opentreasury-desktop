# Session: ulid→randomUUID Hotfix

**Start:** 2026-04-20T08:15:53Z  
**Agent:** Morpheus  
**Status:** ✅ Shipped (commit `18f7a61`)

## What

Fixed runtime crash `"secure crypto unusable, insecure Math.random not allowed"` at Electron main boot by replacing `ulid` package with Node's `crypto.randomUUID()` for session file tokens.

## Why

`ulid` package's `detectPrng()` lost access to `globalThis.crypto.getRandomValues()` after esbuild ESM bundling. Node's `randomUUID()` is built-in, requires no detection.

## How

1. Replaced `ulid` import with `crypto.randomUUID` in `sessionFileRegistry.ts`
2. Updated length assertion in test (26 → UUID regex)
3. Removed `ulid` from package.json
4. Verified: typecheck, 9/9 tests green, build succeeds, app boots + hydrates

## Files

- `app/src/main/import/sessionFileRegistry.ts`
- `app/src/main/import/sessionFileRegistry.test.ts`
- `package.json`
- `package-lock.json`

## Commit

`18f7a61` on `main`
