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
### 2026-04-19: Wave 1 impl drifted from prototype — rebuild side-by-side after tokens v0.2
Wave 1 implementation drifted from the prototype. After Mouse's tokens-v0.2 lands, rebuild screens side-by-side with the prototype open (literally two windows). Match pixel-for-pixel within reason. Every frontend PR now requires before/after screenshots comparing to the prototype. See `docs/product/prototype-fidelity-audit.md` and the 2026-04-19 decision `prototype/ is the visual and interaction contract for v1`.

### 2026-04-19: Mouse tokens v0.2 landing — spacing rescale + hover-direction flip (BREAKING)

**On branch `fix/mouse-tokens-v0.2` (awaiting orchestration + merge):**

**Spacing token rescale (⚠️ ACTION REQUIRED):**
- All `--space-N` indexes shifted due to prototype's finer grid
- `--space-1` was 4px → now 2px
- `--space-2` was 8px → now 4px
- `--space-3` was 12px → now 6px
- `--space-4` was 16px → now 8px
- ... (full migration map in `.squad/decisions.md` entry for tokens-v0.2)
- **Fix:** Global search/replace across all component CSS per the provided migration table (search for `--space-N`, replace with new index)
- Or temporarily use `--compat-space-N` aliases, then remove after one sprint

**Primary button hover direction flip (⚠️ VISUAL CHANGE):**
- v0.1: hover darkened to `#5a3d75`
- v0.2: hover **lightens** to `#9c7cb5`
- Matches prototype's "airy + anchored" feel; inverted interaction but no code change
- **Test:** All primary buttons (Panel CTA, Movements CTA, dialogs) — verify new lightening behavior feels right

**Other token changes (no code required):**
- Radius: every step +2px (xs 2→4, sm 4→6, md 6→8, lg 10→12)
- Pill: 9999px → 16px (fixed-radius rectangles, not circles)
- Font: OS system → Inter (Google Fonts) — ⚠️ offline bundling gap flagged for follow-up
- Borders: flat hex → purple-tinted alpha (brand materiality)
- Dark mode: radial + linear gradient body background
- Motion: fast 120ms (was 140ms), base 200ms (was 220ms)

**Rebase plan:** Rebase on `fix/mouse-tokens-v0.2` once merged to main, then perform spacing migration + hover testing.

**Pending-tone note:** Link must ratify whether estado column ships with pending badges (prototype has them; v0.1 design system removed them). Awaiting `.squad/decisions.md` decision.



## 2026-04-19 — Prototype parity pass (branch: fix/trinity-prototype-parity)

Shipped Wave 1 remediation against `docs/product/prototype-fidelity-audit.md` on top of Mouse's tokens v0.2.

### Migrated
- **Spacing tokens (v0.1→v0.2 index shift)** — batch-rewrote every `var(--space-N)` in 11 CSS files via PowerShell script using a two-pass placeholder swap to avoid chained renames. Map used: 10→13, 9→12, 8→11, 7→10, 6→9, 5→8, 4→7, 3→6, 2→4, 1→2. Tokens file (Mouse's domain) untouched.
- **Stack gap prop** — live caller in MovementsScreen bumped from `gap={3}` → `gap={6}` to preserve the original 12 px intent under the new index scheme. Default left at `gap=3` (now 6 px); existing tests still pass since they assert on the token name only.
- **Hover direction** — v0.2 already flipped `--color-accent-hover` to `--color-brand-primary-light` (lightens). All `.ot-button--primary:hover` references inherit via the accent alias; visually verified the lighten direction is now live.
- **Inter font** — tokens.css already `@import`s Google Fonts Inter 400/500/600/700. Globals sets `font-family: var(--font-family-sans)` on body. Added `font-feature-settings: var(--font-feature-settings)` on body via globals (already there from v0.2 work). No hardcoded hex colors introduced; all new styles reference tokens.

### Rebuilt surfaces
- **AppShell** (tsx + css) — 3-section chrome per `prototype/shell.jsx`:
  - Topbar (60 px): brand+diamond mark, vertical divider, tenant label ("Demo NGO"), flex spacer, 320 px search input with ⌘K kbd hint, ES/EN radiogroup, theme tri-state radiogroup, settings icon-button. Uses `var(--topbar-height)` from tokens.
  - Sidebar (240 px): "Principal" section label (11 px uppercase 0.08em), nav items (9 px × 12 px padding, `--color-row-hover` hover, `--color-brand-surface` + `--color-brand-primary` active), spacer, user strip at bottom (32 px avatar, name/role, logout icon-button).
  - Collapses under 960 px to 64 px rail; search/tenant/user-meta hidden.
- **MovementsScreen** — page-header now uses global `.ot-page-header` (h1 28 px -0.01em letter-spacing), totals strip rebuilt as 4-card KPI grid (24 px tabular-nums values, 11 px uppercase 0.08em labels), amount cells use prototype's `.ot-type-arrow` + `.ot-amount--income/expense` recipe. `Stack` kept for picker block.
- **PanelScreen** (new) — renders page-header with Abril 2026 / Nuevo Movimiento CTAs (disabled), section labels for accounts/summary/monthly-trend/recent, 5×1 account-card grid with placeholders, 3-KPI strip, skeleton panels for trend + recent.
- **SaldoScreen** (new) — page-header + Exportar CTA, yearly-totals KPI strip, skeleton panels for monthly-net + income/expense YoY grid.
- Both stubs render dashes/placeholder text, no data wiring, but correct typography/spacing/palette.

### Primitives touched
- `Table.css`: headers now 11 px uppercase 0.08em letter-spaced `--color-text-muted`; zebra striping removed; hover uses `--color-row-hover`; dividers use `--color-divider` (purple-tinted alpha). Padding normalized to `--space-6` both axes.
- `globals.css`: added 10 shared prototype recipes (`.ot-page-header`, `.ot-section-label`, `.ot-p-card`, `.ot-kpi-strip`/`.ot-kpi`, `.ot-account-cards`/`.ot-account-card`, `.ot-type-arrow`, `.ot-amount--income/expense`, `.ot-badge[--pending/--approved/--uncategorized]`, `.ot-account-pill`, `.ot-skeleton`). These live in globals so Panel/Saldo/Movements can share without forcing new primitives.
- `ComingSoonScreen` — left in tree (unused) in case we want it for future routes.

### Build status
All four gates green on branch: `npm run typecheck` ✅ · `npm run lint` ✅ (0 warnings) · `npm test` ✅ (38/38) · `npm run build` ✅ (Vite, 1795 modules, 34.92 kB CSS / 245.85 kB JS).

### Audit deltas closed (by rough count — see inbox note for per-delta mapping)
Typography scale (h1 28 px, KPI 24 px tabular-nums, section label 11 px / 0.08em), sidebar structure (section label + user strip), topbar (brand + search + tenant + controls), primary button hover direction, table header styling, row hover + dividers, Inter font + feature settings, purple-tinted shadows, pill radius 16 px. Panel/Saldo no longer generic "Coming soon".

### Audit deltas still open (documented for Pedro/Mouse/Niobe triage)
- **No pending-tone badges rendered yet in Movements** — mock data doesn't carry a `status` field; `--color-status-pending-*` tokens available but untouched. Needs either `Movement.status: 'pending'|'approved'` on the type + mock generator tweak (small Morpheus-or-me follow-up) or an explicit deviation from Link.
- **No account-pill + dot + tag-chip rendering in Movements table** — account column is plain text right now. Out of scope this pass (no mock account-color data wired).
- **No filter bar** — prototype has chip group + 4 selects + min/max amount + "uncategorized only" toggle. Out of scope; we have only the date-range picker from UX-003.
- **No monthly bar chart / account sparklines** — charts library decision still open (visx vs Recharts vs custom SVG per tokens.md). Panel/Saldo ship skeleton placeholders instead.
- **No "density compact" mode** — prototype has `body.density-compact` spacing+font shrink. Not tokenized in v0.2.
- **Dark-mode body gradient** — verified tokens.css has the radial+linear gradient on `:root[data-theme="dark"]::before`; not visually smoke-tested at runtime by me in this pass (port 5173 was already in use from another session).
- **Inter offline bundling** — still Google Fonts CDN @import. Mouse flagged as M1 blocker.

### Gotchas learned
1. **Two-pass placeholder rewrite is safer than single-pass regex for index renames** — because `--space-1` is a prefix of `--space-10`, naive sed-like replacement collides. Used `__SPC_PLACEHOLDER_N__` as intermediate.
2. **`Stack` primitive takes gap via inline `var(--space-${gap})`** — meaning callers pass the token *index*, not pixels. When token values rescale, caller props (not just CSS) must migrate. Only one live caller in this pass, but worth remembering.
3. **Tokens v0.2 introduced `--space-11/12/13` as new slots** — we now have 0–13. Old `--space-10` (which was 64 px) is now `--space-13`.
4. **`icon-btn` / `section-label` / `page-header` / `kpi` / `account-card` / `badge`** are common prototype recipes — inlining them in globals.css keeps screens thin without creating new primitives (per the task guardrail).
