# Project Context

- **Owner:** Pedro (perocha)
- **Project:** OpenTreasury Desktop — Electron-based treasury management for NGOs. Desktop version of the cloud-based rett-europe/opentreasury, designed to work without complex cloud setup.
- **Stack:** Electron (frontend), rest TBD. Reference app: Angular 19 + Python FastAPI + Cosmos DB + Entra ID on Azure.
- **Created:** 2026-04-19

## Key Reference

The cloud version has an Angular 19 frontend with:
- Transaction list with filters (account, date range, category, tag, text search)
- Transaction entry form with "Save & New" fast-entry flow
- Category/subcategory management screens
- Tag and bank account management
- Dashboard with balance cards and monthly summary chart
- Excel import wizard, Excel export
- Multi-language (Spanish + English)
- MSAL-based authentication with Entra ID

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

## 2026-04-19 — Team Context Update (from Scribe)
- ADR-001 (Proposed) at `docs/architecture/adr-001-tech-stack.md` — Neo recommends Option A (React+TS, append-only event-sourced JSON, `age` encryption).
- Security Requirements v0.1 at `docs/security/security-requirements-v0.1.md` — Switch: 20 requirements, 15 stack constraints, 8 accepted risks, 6 open questions for Pedro.
- Both are team context now.

### 2026-04-19: Crypto spec v1.0 + ADR-001 Accepted
Crypto spec v1.0 at `docs/security/crypto-spec.md`. Security Requirements bumped to v0.2. ADR-001 Accepted with conditions C1–C15. Every implementation ticket must cite the C1–C15 condition(s) it satisfies.

## 2026-04-19 — Team update (via Scribe)
ADR-002 repo structure **Proposed** (Neo) — strict main/preload/renderer boundary enforcement (ESLint import/no-restricted-paths + TS project refs + CI grep). core/, crypto/, storage/ modules are Electron-free for unit-testing and single-pass Switch audit. docs/specs/_template.md is the canonical SDD template with mandatory Traceability section. Roadmap v1 at docs/product/roadmap-v1.md — M1 = single-user happy path on prototype's 3 canonical screens. Three PRDs drafted (movements/saldo/panel). Niobe's 12 UX gaps and 3 flow skeletons frame your upcoming work.

### 2026-04-19: Product + architecture updates
- **Transactions model has NO pending state** — always confirmed, imported from bank/PayPal statements (CSV) or manually entered as confirmed.
- **i18n is M0 (day 0)** — Spanish + English from v1.
- **ADR-002 ACCEPTED** — npm, no monorepo tool, strict TS (+ `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`), flat `app/`, hybrid tests. `app/` scaffolding is the next PR.


### 2026-04-19: ADR-003 accepted -- react-i18next. app/ scaffolded on branch feat/app-scaffold-and-i18n-adr. Flat layout, strict TS. After Pedro runs npm install and lockfile lands on main, first real feature work targets PRD-001 Movements against crypto-spec section 11.


### 2026-04-19: Scaffold GREEN (team note from Scribe)
You can clone, `npm install --legacy-peer-deps`, and run: `npm run typecheck`, `npm run lint`, `npm test`. First real feature work can begin against feat/app-scaffold-and-i18n-adr once merged to main.
### 2026-04-19 — From Scribe: Wave 1 UX specs batch 1 landed
- Draft v0.1. Batch 2 (screens) arriving shortly.


## Cross-agent update (Scribe, 2026-04-19T10:34:16Z)
Wave 1 UX COMPLETE - all 6 specs Draft v0.1. Implementation specs/tickets can anchor to these. Every spec has a Traceability Matrix mapping to PRDs/ADRs/R-series/C-series/crypto sections.

- 2026-04-19 — Crypto-error UX strings ratified in docs/security/crypto-error-copy-catalog.md v1.0. Use the ux.errors.crypto.* i18n keys verbatim when implementing error surfaces (ES primary + EN). 9 CE scenarios.
- 2026-04-19 — Design system v0.1 shipped under docs/design/ (tokens.md, components-v1.md, screen-visuals-v1.md, design-principles.md, icons-and-illustrations.md). Start with tokens.md -> CSS custom properties (light + dark) + theme-switching hook. Then work down components-v1.md (16 primitives incl. DateRangePicker + CodeDisplay). Benchmark chart library (visx vs custom SVG vs Recharts) against UX-005 PR12 <=500ms / 1k events before committing. Dark mode mandatory. OS system font stack — no runtime web fonts.


## 2026-04-19 — Wave 1 implementation shipped (branch: feat/trinity-wave-1-impl)

Built the first runnable vertical slice. All 4 CI gates green: typecheck · lint · format · test (38/38).

**File tree delivered (app/src/renderer/):**
- `styles/tokens.css` + `styles/globals.css` — Mouse v0.1 tokens as CSS custom properties; light/dark/system themes; prefers-reduced-motion collapses motion tokens to 0.
- `types/movement.ts` + `mocks/movements.ts` — 48-entry mock dataset, Oct 2025 → Apr 2026, realistic NGO mix. `getMockMovements(range)` with 200ms delay.
- `hooks/useTheme.ts` — light/dark/system tri-state, localStorage persistence (v0.1 stand-in; ADR-003 §7.3 main-process prefs bridge deferred).
- 8 primitives (each with .tsx, .css, index.ts, .test.tsx): `Button` `Text` `Stack` `Card` `Input` `DateRangePicker` `Table` `EmptyState`.
- `screens/AppShell/` — 240px sidebar (Panel · Movements · Saldo with Lucide icons) + 56px topbar (brand · ES/EN radiogroup · theme tri-state). Mobile collapse at 960px.
- `screens/MovementsScreen/` — full state machine (range-not-selected → loading → loaded/empty/error), 3 preset chips, sortable Table, totals strip (Income/Expense/Net/count), Intl formatters for EUR + dates.
- `screens/ComingSoonScreen/` — EmptyState shim for Panel/Saldo.
- `locales/{es,en}/common.json` — extended with full `common.*` · `shell.*` · `movements.*` namespaces; ICU plural for movement count.
- `test-setup.ts` — registers `afterEach(cleanup)` (see Gotcha #2 below).

**Decisions written to inbox:** `.squad/decisions/inbox/trinity-frontend-wave-1-choices.md` (8 decisions, 4 deferrals).

### Gotchas that cost time (log these so future-Trinity doesn't re-learn):

1. **`verbatimModuleSyntax: true` + `noEmit: false` means every type-only import MUST use `import type`, and every relative import of a `.ts`/`.tsx` file MUST include a `.js` extension.** Catch-early: run `npm run typecheck` after any new file. Example: `import { Foo } from './Foo.js'` (NOT `./Foo`), and `import type { FooProps } from './Foo.js'` if only types are consumed.

2. **Vitest `globals: false` disables @testing-library/react's auto-cleanup.** Without a setup file doing `afterEach(cleanup)`, co-located `it()` blocks leak DOM across cases and `getByRole` / `getByText` throw "multiple elements" on the SECOND render in a file. Fix: `app/src/renderer/test-setup.ts` + `setupFiles: ['app/src/renderer/test-setup.ts']` in `vitest.config.ts`. Also `css: true` so CSS imports don't crash collection.

3. **React component tests need `// @vitest-environment jsdom` at the top of the file.** Our default env is `node` for speed. Pure-logic tests (e.g., `core/events.test.ts`) inherit node; component tests opt-in.

4. **`@testing-library/react@16` has a peerDep on `@testing-library/dom@^10` that is NOT auto-installed.** First `npm test` after installing `@testing-library/react` fails with "Cannot find module '@testing-library/dom'". Explicit install required: `npm install --save-dev --legacy-peer-deps "@testing-library/dom@^10.0.0"`.

5. **`native <input type="date">` does NOT expose role="textbox" in jsdom** — there's no role at all. Query via `getByLabelText('From')` / `getByLabelText('To')`. Don't try `getAllByRole('textbox')`.

6. **Vite `root: app/src/renderer`** means `index.html` MUST live in that folder and its script tag points to `./main.tsx` (relative to the renderer root, NOT the repo root). Already set up correctly in the scaffold — don't "fix" it.

7. **Install flag is permanent for this repo: `npm install --legacy-peer-deps`** (ESLint v8 / @typescript-eslint v7 peer conflict, documented in team decisions). README's "Getting started" now shows this explicitly.

### What Pedro can see when running `npm run dev`:
- Opens http://localhost:5173
- Lands on Movements (ES by default). Select a preset chip or a custom date range → 200ms loading spinner → ~48 mock rows render in a sortable table with running totals.
- Click language chip (ES ↔ EN) to switch language instantly — all strings flip.
- Click theme icon (Monitor/Sun/Moon) to cycle system → light → dark. Persists across reload.
- Click Panel or Saldo in the sidebar → "Coming soon" EmptyState with i18n copy.

Did NOT commit — Scribe owns commits.
