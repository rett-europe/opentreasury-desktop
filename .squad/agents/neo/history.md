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

### 2026-04-19: Panel-First Work Package Decomposition

Decomposed Panel-first strategy (approved in `.squad/decisions.md`) into 10 concrete work items with owners, dependencies, and parallelization plan. Critical path: WI-1 (Morpheus: core read queries) → WI-2 (collab: IPC contract) → WI-3 (Trinity: Panel UI wiring) + WI-4 (Morpheus: storage) → WI-5 (Morpheus+Switch: crypto) → WI-6 (Morpheus: wire real core to IPC) → WI-7/8/9/10 (Trinity: sparklines, chart, empty states, skeleton polish). Total ETA ~12–15 days. **First wave (day 1 parallel spawns):** WI-1 (Morpheus, core queries, 2–3d), WI-2 (collab, IPC schemas, 1d after WI-1 stabilizes), WI-3 (Trinity, Panel UI with mock IPC, 3–4d). Six open questions for Pedro: (Q1) UX-005 sufficient? (Q2) real sparklines or defer? (Q3) does PRD-010 Accounts exist? (Q4) chart library or custom SVG? (Q5) "Ver todos" hand-off pre-filters or not? (Q6) ship Panel before Movements command-side? **Recommendation on all six:** proceed with minimal scope (UX-005 is sufficient, real sparklines in WI-1, infer account schema from prototype, custom SVG for chart, no pre-filter on link, ship Panel alpha first to prove the stack). Work package written to `.squad/decisions/inbox/neo-panel-first-work-package.md`.

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

### 2026-04-19: Prototype fidelity audit — prototype/ is the visual contract
Co-authored `docs/product/prototype-fidelity-audit.md` with Link after Pedro called out visual drift from the hi-fi prototype. ~49 tracked deltas: 20 blockers, 20 important, 9 polish. The prototype was under-referenced during design-system and implementation spawns — tokens were invented rather than extracted, and frontend work routed against `docs/design/` instead of `prototype/`. Logged the governance rule to `.squad/decisions/inbox/neo-link-prototype-is-north-star.md`: prototype wins over design system; deviations need Link+Pedro sign-off or a Neo technical-impossibility note.

**My process-failure ownership:** I treated Niobe's prototype-analysis-v1.md as the closing of the prototype-review loop. I should have kept `prototype/` as a live input on every frontend spawn and called it out explicitly. I did not. Every frontend spawn prompt must now name `prototype/*.jsx` + `prototype/styles.css` as required input artifacts alongside charter/history/decisions.

**Concrete gotchas to carry forward:**
- Prototype uses **Inter** (Google Fonts) — Mouse chose OS system fonts. Inter ships offline-bundled in v0.2 tokens.
- Prototype's pill radius is **16px** (a rounded rectangle); design system shipped `pill: 9999` (full-round). Wrong paradigm — account-pills and badges looked wrong.
- Every radius step in the design system is **2px smaller** than the prototype. Compounds across cards/buttons.
- Primary-button hover in prototype **lightens** to `#9c7cb5`; our design system **darkens** to `#5a3d75`. Hover direction inverted — changes brand feel.
- Prototype borders are **purple-tinted alpha** (`rgba(109,77,140,0.14)`), not flat gray hex. Ambient brand wash is lost without this paradigm.
- Design system explicitly removed the "pending" tone — but the prototype ships a Pendiente/Aprobado `estado` column. The right fix per the new rule is: prototype wins unless Link+Pedro sign off.
- Two entire screens (Panel, Saldo) are `<ComingSoonScreen />` placeholders in M1 — the prototype has them fully designed. Not a scope issue; a *rendering* issue. Roadmap M1 already includes them.

**PR-template change committed to:** mandatory before/after screenshots vs prototype, plus deviation-logged-in-decisions.md checkbox. Blocks merge on miss.

**Rule of thumb:** If a spawn prompt for frontend work does not cite a `prototype/*` file, the prompt is incomplete.

## 2026-04-19: Trinity sticky-thead polish done. What's next on architecture?

**Branch status:** `fix/trinity-prototype-parity` (ddf8d46) is **ready to merge to main**.
- 11 commits on top of `main` (4bba603 mouse tokens v0.2 + prior design/crypto work).
- All gates green: typecheck ✓, lint ✓, format ✓, vitest 39/39 ✓.
- No uncommitted changes (except Link's history update — that lands in the next Scribe coordination).
- PR template compliance: has before/after screenshots vs prototype, documents the sticky-thead implementation (CSS structural, not JS), prototype-parity checkbox checked.
- Scope is **tight and clean**: Table `.ot-table__head { position: sticky; top: <calculated>; }` + shell `.ot-shell__main-gutter` spacing fix. Zero scope creep, zero payload bloat.

**Merge recommendation:** YES. Land `fix/trinity-prototype-parity` → `main` immediately (sequence after Link's decision doc on Panel-first unlock, but do not gate on it). This is Polish, not new feature — fast track it. It unblocks the renderer for next-phase work and teaches the team the sticky scroll patterns for future screens.

---

## Next architectural milestone — choosing the implementation path

**Current state snapshot:**
- **Renderer (Wave 1):** Movements UI ~70% complete (table structure ✓, sort ✓, empty-state logic ✓, mock data ✓, i18n ✓). Shell + theme + Panel/Saldo skeletons ✓.
- **Core/Crypto/Storage:** Scaffolded, type-complete, zero impl yet. All layer boundaries enforced by TS + ESLint. ADR-001, ADR-002, ADR-003 conditions lock the architecture.
- **Main process:** Scaffolded, CSP + window hardening (C7) in place, IPC schema validation ready (C13), Zod for contracts ready.
- **Data**: 100% mock. No OneDrive. No crypto. No real event sourcing. Movements mock returns 48 sample txs on a 200ms delay.

**The fork (Link raised the question; I'll answer the architecture side):**

**Option A: Complete Movements (core M1 path)**
- Ship full Movements UI wiring: date-range selection → mock/real data, account/category CRUD, tag picker, two-way binding to `core/commands`.
- Risk: Highest complexity jump (IPC + event sourcing + read-model query surface all come online at once). If the core/IPC contract leaks, we find it in the hardest screen.
- Payoff: Treasurer can record a full transaction end-to-end. That's the M1 deliverable. **Confirms the event-sourcing contract before we do multi-device merge in M2.**
- Timeline: ~2–3 sprint cycles (Morpheus core wiring + Trinity full UI binding + Morpheus IPC handlers).
- **Blocker tension:** Movements has no empty-state escape hatch — if the core/IPC call fails, the user sees ERROR. That's honest but harsh for an internal alpha.

**Option B: "Panel-first" unlock (user-perceived value accelerator)**
- Finish **Panel first** (simple: no filters, no sort, no empty-state gate, just recent-txs + sparklines + totals).
- Skip Saldo temporarily (it's lower-touch once Panel is done; pure M1.25 lift).
- **Why Panel first:** Prototype Panel is cleaner code (fewer columns), Panel has **no empty-state gate** (renders even with 0 txs), and Panel *signals* "this works" faster to non-technical treasurers than Movements (which requires date selection ritual).
- Payoff: Internal alpha unblocks earlier. Event-sourcing proof-of-concept on the simpler screen = lower friction for the team to dogfood. Movements gets full wiring while Panel is live, de-risking both.
- Timeline: ~1 sprint (Panel UI structure ~3 days, event-core wiring ~2 days, parallel Movements full binding).
- **Blocker tension:** None — Panel can stay "read-only" (no transaction entry CTA) until Movements is wired. That's intentional scope splitting.

**Option C: Both in parallel (high-touch, lower velocity)**
- Trinity splits time between Movements + Panel structure work. Morpheus spins up both command-side codegen. Collision risk on event-core IPC design.
- **Not recommended:** Trinity is the bottleneck for UI structure. Movements + Panel can each own a sprint if split sequentially; parallel = context thrash.

---

## My recommendation: **Option B — Panel-first unlock into M1.25 for Saldo**

**Reasoning (architectural):**

1. **Validates the data layer on the simplest screen first.**
   - Panel has no interactivity → no user input validation → no Zod validation surprises.
   - Recent-txs table + totals summation = minimal read-model demand (exercise `core/query` without the complexity of `core/commands`).
   - Once Panel renders from *real* encrypted events, we know: (a) `storage/onedrive-folder.ts` can read; (b) `crypto/envelope.ts` decrypt works; (c) `core/query` projects correctly; (d) IPC payload contract is sound. **All in one sweep on the simplest code path.**

2. **Unblocks the internal alpha on a non-empty screen.**
   - Movements requires the user to pick a date range or see emptiness — that's a ritual burden.
   - Panel renders a "welcome to your treasury" summary even on day 1. Volunteers can open the app, see their balance, see the last 10 txs, and think "this actually works."
   - Earlier dogfood = earlier friction signals about the event core before we lock M2 multi-device design.

3. **Protects scope on M1 exit criteria.**
   - Core loop redefined (shorter, tighter): Create Account → Enter Tx → **See on Panel** → *See details on Movements (M1+1).*
   - Saldo is explicitly M1.25 — it ships within days of Panel but does not block alpha.
   - The critical path is "account + tx + visibility", not "account + tx + three views."

4. **Technical readiness check:**
   - All crypto/storage/core modules are scaffolded and TS-clean.
   - Trinity can hand off "recent 10 txs in DESC order" to Morpheus and focus on Panel layout (sparklines, totals rendering, responsive structure).
   - No new module category or IPC handler class emerges — same contract as Movements, just simpler query surface.

5. **Preserves velocity for M2 multi-device work.**
   - We ship internal alpha at M1+5 days (Panel lives, Movements full wiring in parallel).
   - M2 multi-device concurrency story (conflict resolution, OneDrive folder state watching, device enrollment retry + audit escrow signing) lands in a fresher context because the team has already proven the single-device core on Panel.
   - Rushing both Movements + Saldo into M1 = exhausted team entering M2 concurrency work. Bad timing.

---

## Specific architectural work packages (if Panel-first is chosen):

### 1. **Core query surface for Panel** (~Morpheus 1 sprint, unblocks Trinity)
   - Finalize `core/query/` interface: `queryRecentMovements(limit, offset)` → paginated sorted list.
   - Implement `core/reducers/read-model.ts`: fold event stream into a "recent txs by created_at DESC".
   - **No command-side work yet** — Panel is read-only. That's intentional.
   - Gate: TS typecheck, vitest 100% (no integration yet; fixtures are in-memory).

### 2. **IPC contract for Panel data fetch** (~Morpheus + Trinity, coordinated)
   - Wire `app/src/main/ipc/handlers.ts`: `queryMovements(range)` handler calls `core/query`.
   - Preload bridge: `window.api.queryMovements(opts)` exposes the handler.
   - Zod schema for request + response in `app/src/shared/ipc-schemas.ts`.
   - Gate: Vitest IPC round-trip test + ESLint import boundaries.

### 3. **Panel UI wiring** (~Trinity 3–4 days)
   - Replace `<ComingSoonScreen />` with real Panel.tsx (prototype screenshot is the north star).
   - Dispatch `queryMovements()` on mount → setState(loading=true).
   - Render recent-txs table from result. Sparklines can stay as visual placeholders (CSS gradients) until `core/reducers` produces the monthly summary.
   - **No input handling, no forms** — read-only surface.
   - Gate: Vitest snapshot + responsive layout; before/after screenshot vs prototype.

### 4. **Crypto wiring for Panel** (~Switch 1 day review, Morpheus 2–3 days impl)
   - Integrate `crypto/envelope.ts` into the `storage/` read path.
   - Main process loads encrypted event files, calls `crypto.decrypt(buffer, dek, record_type, record_id)` per C1.
   - Implement the `dek` load-from-keychain path (C4 — `@napi-rs/keyring` adapter in `crypto/keychain.ts`).
   - Add `core/reducers/` test fixtures with real envelope round-trips.
   - Gate: Switch reviews the envelope integration; vitest envelope + keychain mocks.

### 5. **Movements full core wiring** (parallel to Panel, lands after Panel is live)
   - Command dispatch for `tx.created`, account form validation, category picker wiring, two-way binding.
   - **Timeline:** This lands M1+8–12 days (Panel already live, team de-risked on the data layer).

---

## Loose ends to tighten before Panel sprint:

1. **Finish uncommitted history updates** (Link's panel-first recommendation in `.squad/agents/link/history.md`). This PR must include that context.
2. **Finalize `core/commands/` signatures for Movements** (Morpheus → Neo). Don't wait for full impl, but the TS shapes must be locked so Trinity knows the IPC surface.
3. **Update ADR-002 §11 ("Electron wiring")** with a timeline checkpoint. Main process currently scaffolded; Panel IPC path will force the first real main-process impl. Document that in the ADR.
4. **Add a `docs/specs/PANEL-SPIKE.md`** (Neo) — not a full UX spec, just the query surface + read-model shape (25 lines, codifies what Morpheus needs to deliver).

---

## Merge sequence:
1. **`fix/trinity-prototype-parity` → `main` (now)** — Polish, low risk, high confidence.
2. **`fix/mouse-tokens-v0.2` → `main` (coordinated with Link's panel-first decision)** — Already on `main`, confirms tokens are prototype-parity locked.
3. **Create `feat/panel-first-spike` branch** (from `main` after 1–2 land) — Core + IPC + Panel + crypto wiring, ~1.5 sprints.
4. **Movements full wiring follows in parallel or after Panel lives.**

This path ships internal alpha at M1+5 days, proves the event core on the simplest surface, and keeps M2 multi-device work fresh.

