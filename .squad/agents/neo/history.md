# Project Context

- **Owner:** Pedro (perocha)
- **Project:** OpenTreasury Desktop — Electron-based treasury management for NGOs. Desktop version of the cloud-based rett-europe/opentreasury, designed to work without complex cloud setup.
- **Stack:** Electron (frontend), rest TBD. Reference app: Angular 19 + Python FastAPI + Cosmos DB + Entra ID on Azure.
- **Created:** 2026-04-19

## Key Reference

The cloud version (rett-europe/opentreasury) features:
- Transaction management with categories, subcategories, and tags
- Multi-account support (bank accounts + PayPal)
- Excel/CSV import from bank exports, Excel export for accounting
- Dashboard with account balances and monthly summary
- RBAC (Admin / Viewer)
- Audit trail, soft deletes
- Multi-language support (Spanish + English)

The desktop version aims to replicate this functionality without requiring Azure infrastructure.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-04-19: Product Vision v0.1 exists (team context)
Link drafted `docs/product/vision.md`. Core bet: **OneDrive is the database** — no Azure, no backend, no custom auth (folder ACLs = auth). 7 principles established. Three high-risk architecture items are explicitly routed to me: (1) OneDrive concurrency/conflict resolution, (2) file corruption + snapshot strategy, (3) tech stack (Electron + framework TBD, Tauri on the table). Scope/principles are now decided team context — architecture work must align with the vision. Open questions Q1/Q3 block my ADR work (tech stack, data file format).

### 2026-04-19: ADR-001 tech stack proposed
Wrote `docs/architecture/adr-001-tech-stack.md` (Proposed). Three options evaluated:
- **A**: React + TS + append-only JSON event log (UUID files) + derived SQLite read model + `age` file-level crypto
- **B**: Svelte + TS + SQLCipher single DB file
- **C**: React + TS + Yjs CRDT + encrypted blob

**Recommended: A.** Core insight: the OneDrive conflict problem is solved **by filename, not by a merge function**. UUID-named immutable files per event = zero conflicts by construction. Event sourcing also gives the audit log for free (matches cloud parity). Option B is a non-starter because a single binary SQLite file in a shared OneDrive folder cannot survive multi-writer offline edits — OneDrive will produce `treasury-LaptopA.db` duplicates and we have no merge function. Option C is correct but too complex for volunteer contributors and produces opaque binaries that violate "your data, your file".

**Tension to watch:** File-level encryption kills OneDrive web-UI search of donor data. This is explicit in the ADR — Pedro must accept it. If Switch forces a single encrypted container instead, the conflict story regresses toward Option B territory and the ADR needs revision.

**Gates before ADR→Accepted:** Switch writes `docs/security/crypto-spec.md` covering `age` + Argon2id + OS keychain (DPAPI/Keychain/libsecret). Also need a OneDrive spike at 10k+ event files before committing to date-partition scheme.

**Lesson to carry forward:** When OneDrive is the transport, never design a data model that requires two writers to modify the same byte range of the same file. Design so writes land in different *files*, always.

## 2026-04-19 — Cross-agent note (from Scribe)
- Switch's Security Requirements v0.1 is live at `docs/security/security-requirements-v0.1.md`.
- ADR-001 must satisfy the 15 stack constraints in §5 before moving from Proposed to Accepted.

### 2026-04-19: ADR-001 Accepted — security conditions locked
Switch signed off ADR-001 with conditions C1–C15. Option A confirmed with spec adjustments: `sodium-native` XChaCha20-Poly1305 envelope supersedes `age`; OS-keychain only (no Argon2id passphrase in v1); `@napi-rs/keyring` instead of deprecated `keytar`; ULID filenames replace timestamp scheme. Crypto spec at `docs/security/crypto-spec.md` is the implementation bar. One non-blocking spike remains on me: 10k event files OneDrive stress test before GA. May file a short ADR addendum for the filename + sodium-native supersession for cleanliness.


### 2026-04-19: ADR-002 Proposed — repo structure
Published `docs/architecture/adr-002-repo-structure.md` (Status: Proposed) and scaffolded the folders: `docs/ux/`, `docs/design/`, `docs/specs/` (with README + _template.md), `scripts/`, `.github/workflows/` + `.github/ISSUE_TEMPLATE/` + `pull_request_template.md`.

**Chosen layout (high level):**
- Single `app/` package (flat, no monorepo tool for now). Structure *described* in ADR, *not scaffolded on disk* — premature until Pedro answers the package-manager + monorepo-tool questions.
- Inside `app/src/`: `main/` + `preload/` + `renderer/` as physical filesystem boundaries; `shared/` for IPC + event Zod schemas (pure TS, no Electron); `core/` event-sourced domain (Electron-free, fs-free, testable under plain Node); `crypto/` pure-function module with only `sodium-native` + `@napi-rs/keyring` imports allowed; `storage/` adapter interface + OneDrive-folder node:fs impl + in-memory impl for tests; `read-model/` SQLite cache with its own keychain key distinct from the DEK (C14).
- Module boundaries enforced by ESLint `import/no-restricted-paths` + TS project references + CI grep (belt and suspenders).
- Mermaid dependency diagram in ADR §4.2 documents allowed vs forbidden edges.

**SDD layout locked:** `docs/` split into `product/` (Link), `architecture/` (me — ADRs), `security/` (Switch), `ux/` (Niobe), `design/` (Mouse), `specs/` (feature technical specs with mandatory `## Traceability` section tying each spec back to PRDs + ADRs + C1–C15 + R1–R20 + crypto-spec §-numbers).

**PR template enforces:** branch discipline (trunk-based), spec ref with status (Accepted required for implementation PRs), ADR-001 conditions cited, full security checklist, tests, status-history update.

**Deliberately deferred:** `app/` source tree, CI workflows (their own ADR), CODE_OF_CONDUCT / CONTRIBUTING, `docs/guides/`.

**Open questions awaiting Pedro (block Proposed → Accepted):**
1. Package manager — npm (recommended) / pnpm / yarn
2. Monorepo tool — none (recommended) / Nx / Turborepo
3. TS strictness — strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes (recommended)
4. `app/` vs `apps/opentreasury-desktop/` — flat `app/` recommended
5. Tests — hybrid (co-located unit, separate integration+e2e) recommended

**Lesson carried forward:** structure decisions are cheap to write and expensive to retrofit. Putting module boundaries in the filesystem (not just convention) means renderer-leaks and crypto-imports get caught by `tsc` before code review instead of in a post-mortem.

## 2026-04-19 — Team update (via Scribe)
Link's roadmap v1 + PRDs 001–003 and Niobe's UX plan both depend on ADR-002 being Accepted. Your 5 open questions to Pedro (package manager, monorepo tool, TS strictness, app/ layout, tests layout) block acceptance.

### 2026-04-19: ADR-002 Accepted — all 5 questions resolved
Pedro resolved all 5 open questions. Locked-in decisions:
1. **Package manager:** npm (parity with cloud opentreasury).
2. **Monorepo tool:** none — single `app/` with `tsc -b` project references.
3. **TS strictness:** `strict: true` + `noUncheckedIndexedAccess: true` + `exactOptionalPropertyTypes: true` — all three on.
4. **Top folder:** flat `app/` (not `apps/opentreasury-desktop/`).
5. **Tests:** hybrid — co-located `*.test.ts` for units, `tests/integration/` + `tests/e2e/` separate.

Updated `docs/architecture/adr-002-repo-structure.md`: Status Proposed → Accepted (Decided 2026-04-19), §9 open questions annotated RESOLVED inline (kept for traceability), §4 language moved from "recommended/TBD" to definitive, added §11 Implementation Next Steps, added Changelog.

**Next step:** Scaffold the `app/` source tree in a dedicated follow-up PR — NOT part of this ADR commit. That PR lands: `app/package.json` (npm), `app/tsconfig.base.json` + per-subproject configs with project references, ESLint with `import/no-restricted-paths`, Vitest for unit tests (proposed), Playwright for E2E, CI grep/lint for §4.1 import boundaries. Downstream work (Link's PRDs, Niobe's UX spec plan, Morpheus/Trinity implementation ticketing) is now fully unblocked.

**Lesson:** Keeping the "Options Considered" / "Open Questions" sections in the ADR *after* acceptance (with RESOLVED markers) pays for itself the first time someone asks "why npm and not pnpm?" six months later. Don't delete the reasoning trail — annotate it.

### 2026-04-19: Roadmap + PRDs updated by Link
- i18n framework selection is now an **M0 deliverable** (was M3). Need a short ADR or spec note before M0 kicks off — candidates: `i18next`/`react-i18next` vs FormatJS/`react-intl`.
- Storage scope narrowed: **OneDrive for Business / SharePoint only** in v1; Personal deferred to v1.x.
- ADR-002 repo structure ACCEPTED (my own decision, captured in decisions.md).


### 2026-04-19: ADR-003 i18n Accepted + app/ scaffold landed (branch feat/app-scaffold-and-i18n-adr)
Published docs/architecture/adr-003-i18n-framework.md (Accepted — Pedro delegated day-0 i18n framework choice). Chose **`react-i18next`** over `react-intl` and `@lingui/react`. Rationale: lowest-friction DX for a small volunteer team (`t('key')` + JSON edits is the shortest add-a-string path), best TS integration via module augmentation (strict-TS posture from ADR-002 gets compile-time key checking), bundle cost (~40KB) is a rounding error in an Electron app. ICU is available via plugin if v2 locales need it. Revisit trigger: third locale with complex plural/gender rules (Arabic, Russian, Polish) + excessive `_zero`/`_few`/`_many` maintenance burden.

**Key ADR-003 decisions:** per-locale-per-namespace JSON layout (`locales/{lang}/{namespace}.json`, not a single flat file); dev fails loud on missing keys, prod falls back to EN; default locale ES for the Rett Spain pilot; Intl.NumberFormat / DateTimeFormat used directly (no i18next built-in formatters); pseudo-locale via `VITE_I18N_PSEUDO=1` for QA; CI missing-key lint deferred to PRD-009 implementation.

**app/ source tree scaffolded per ADR-002 on branch `feat/app-scaffold-and-i18n-adr`.** Deliberately minimal — enough to `tsc -b` clean across the main/preload/renderer/core/crypto/storage/shared split and confirm i18n is wired. Key scaffold choices (captured in ADR-003 §12 "Scaffold Decisions Notebook" for revisability): **Vite** for renderer build (SD1), **Vitest** for unit tests (SD2), **Playwright** for E2E (SD3), **electron-builder** for packaging (SD4), **Zod** for IPC validation (SD6), ES default locale (SD9). All lint/TS strictness locks enforced: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, ESLint `import/no-restricted-paths` wiring the ADR-002 §4.1 module boundaries.

**What is intentionally NOT in the scaffold:** no `npm install` run (Pedro does that); no real crypto implementation (Switch audits that when it lands); no OneDrive storage adapter impl (only the module shell + README); no business logic anywhere; no read-model / SQLite cache (that folder comes with first feature PR that needs it); electron-updater wiring + pinned Ed25519 pubkey (C12) left as TODO — tracked in scaffold comments. E2E smoke test skipped until first `npm install` + build run succeeds.

**Security-relevant scaffold decisions I made (Switch can audit if desired, none of them are load-bearing yet):** main-process `BrowserWindow` uses `contextIsolation: true` + `nodeIntegration: false` + `sandbox: true` + `webSecurity: true` (C7); strict CSP injected at the response layer AND via `<meta>` (belt and suspenders); IPC handler registry is schema-validated via Zod with no dynamic dispatch (C13); ULID filename comment left in core events.ts (C11); crypto module README spells out the allowlisted imports (C15).

**Lesson carried forward:** scaffolding is a permanent-decision vehicle masquerading as throwaway code. Every config file ships with ADR/condition references in comments so the next contributor knows why a rule exists before they try to relax it. Saved me from re-litigating `no-restricted-imports` the second time it fails a legitimate-looking PR.

### 2026-04-19: ADR-003 Accepted. app/ scaffold landed on feat/app-scaffold-and-i18n-adr. Next: Pedro runs npm install; lockfile commit; then feature work can begin.

### 2026-04-19: Scaffold typecheck fixes (22 errors → 0)
First `npm run typecheck` after `npm install` surfaced 22 errors across the scaffold. Root causes and fixes:

- **electron.d.ts × strict @types/node conflict** (TS2687/TS2717, duplicate `noDeprecation`): unresolvable upstream. Set `skipLibCheck: true` in `tsconfig.base.json`. **Deviation from ADR-002 §4** — documented in an Addendum at the bottom of ADR-002. Our source is still fully checked under `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`; only third-party `.d.ts` files are skipped.
- **Missing DOM lib** (TS2749/TS2304 on `MessagePort`, `HTMLElement`, etc.): electron.d.ts references DOM types even in main-process code. Added `DOM` to `lib` in `tsconfig.base.json` and `app/src/main/tsconfig.json`. Preload/renderer already had it.
- **Vite client types missing** (TS2339 on `import.meta.env`): added `app/src/renderer/vite-env.d.ts` with a `vite/client` triple-slash reference (Vite's standard convention — keeps `main.tsx` clean).
- **i18next missingKeyHandler × exactOptionalPropertyTypes** (TS2769 + TS7006): ternary-with-`undefined` fails strict optional check. Rewrote as conditional object spread `...(isDev ? { missingKeyHandler: ... } : {})` with explicit parameter types (`readonly string[]`, `string`, `string`).

**Lesson:** `exactOptionalPropertyTypes: true` forbids explicitly-`undefined` values on optional props — the fix is always conditional object spread, never `x ? fn : undefined`. Worth remembering for every other optional-config touchpoint in the codebase.

**Lesson:** `skipLibCheck: false` is aspirational in any project that ships Electron + strict `@types/node`. Capitulate early, document it, move on.

## Learnings

- 2026-04-19: Scaffold produced 62 lint errors + 15 warnings, all from a single root cause: eslint-plugin-import was configured to use the 'typescript' resolver but eslint-import-resolver-typescript was not in devDependencies and the settings block was minimal. Fix: (1) added eslint-import-resolver-typescript ^3.6.0 to devDependencies; (2) expanded .eslintrc.cjs settings to include import/parsers mapping and import/resolver.typescript with alwaysTryTypes + full project array covering all 7 module tsconfigs + node: true fallback.
- The 'import ./App.js' in main.tsx is CORRECT for ESM-compatible TS output — do not change it. Resolver config is the fix.
- Added argsIgnorePattern/varsIgnorePattern '^_' to @typescript-eslint/no-unused-vars as a precaution for scaffold placeholders — standard convention, cheap insurance.
- No console rule tightening needed: only 1 console.warn exists (i18n missingKeyHandler) and no-console is not configured as error.



### 2026-04-19: Scaffold is GREEN
typecheck/lint/test all pass. skipLibCheck:true deviation documented in ADR-002 Addendum. Install requires `--legacy-peer-deps` (peerOptional conflict with eslint-import-resolver-typescript; revisit if we upgrade to ESLint 9 / @typescript-eslint v8).

- 2026-04-19 — Switch shipped docs/security/crypto-error-copy-catalog.md v1.0 (9 CE scenarios CE-001..CE-009). Informs IPC error surfaces, diagnostic-bundle contract (user-initiated export, public keys only, whitelisted fields per CE-XXX). Integrity-class errors (CE-001/006/007/009) are BLOCKING — no 'continue anyway' path.
- 2026-04-19 — Design system v0.1 shipped by Mouse. Lucide icon library, dark mode mandatory at v0.1, OS system fonts (no runtime downloads). Brand anchor #6d4d8c preserved from prototype. Zero illustrations in v1. Trinity unblocked for Wave-1 component implementation.

### 2026-04-19: Cross-agent update from Scribe
Trinity wired Vite dev server successfully. `npm run dev` now serves the renderer at http://localhost:5173. Electron integration still TODO per ADR-002 §11. Vitest config gained `css: true` and `setupFiles` — noted for future test infra work.

