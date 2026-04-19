# Orchestration Log — Neo scaffold fixes

- **Timestamp:** 2026-04-19T10:51:18Z
- **Agent:** Neo (Lead / Architect)
- **Requested by:** Pedro (perocha)
- **Mode:** sync iterative (VS Code)
- **Branch:** feat/app-scaffold-and-i18n-adr
- **Why chosen:** Only Neo can adjudicate architecture-level deviations (skipLibCheck, lint boundary overrides) against ADR-002.

## Task

Repair the fresh scaffold after Pedro attempted to run it — typecheck errors, lint errors, missing lockfile, dependency resolver conflict.

## Files authorized to read/modify

- `package.json`
- `package-lock.json` (produced by install)
- `tsconfig.base.json`
- `app/src/main/tsconfig.json`
- `app/src/renderer/vite-env.d.ts` (new)
- `app/src/renderer/i18n/index.ts`
- `.eslintrc.cjs`
- `docs/architecture/adr-002-repo-structure.md`

## Outcome

**GREEN.** Verification run by coordinator:

| Check | Result |
|-------|--------|
| `npm install --legacy-peer-deps` | ✅ |
| `npm run typecheck` | ✅ 0 errors |
| `npm run lint` | ✅ 0 errors, 0 warnings |
| `npm test` | ✅ 1/1 passing |

## Fix summary

1. **package.json** — removed invalid `"//"` JSON comment; added `eslint-import-resolver-typescript` devDep (required `--legacy-peer-deps` — peerOptional conflict: resolver 3.10.1 wants `@typescript-eslint/utils` v8, repo is on v7 via ESLint 8).
2. **Typecheck (22 errors → 0):** `skipLibCheck: true` in `tsconfig.base.json` (deviation from ADR-002 §4 — documented in ADR-002 Addendum, root cause: `electron.d.ts` / `@types/node` duplicate decls + DOM refs in main-process contexts); added `DOM` lib to base + main tsconfigs; new `app/src/renderer/vite-env.d.ts` for `import.meta.env` types; `i18n/index.ts` rewritten with conditional object-spread + explicit `readonly string[]`, `string`, `string` parameter types to satisfy `exactOptionalPropertyTypes`.
3. **Lint:** `.eslintrc.cjs` added override for `app/src/main` and `app/src/preload` disabling top-level `no-restricted-imports` (prior rule blocked `electron` imports everywhere, including where they are allowed); narrow `eslint-disable` for i18next default-export false positives in `app/src/renderer/i18n/index.ts`.
4. **Lockfile:** `package-lock.json` generated and committed.

## Decisions produced

- `.squad/decisions/inbox/neo-scaffold-typecheck-fixes.md` (skipLibCheck deviation)
- `.squad/decisions/inbox/neo-scaffold-lint-fixes.md` (TS import resolver wiring)

Scribe merged both into `.squad/decisions.md` and cleared the inbox.

## Follow-ups

- Revisit `skipLibCheck: true` if upstream resolves the electron/@types/node conflict.
- Revisit `--legacy-peer-deps` when upgrading to ESLint 9 / `@typescript-eslint` v8.
