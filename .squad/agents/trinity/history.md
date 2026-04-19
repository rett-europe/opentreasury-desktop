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

## 2026-04-19T16:14:07Z — TEAM DECISION: Panel-first unlock for M1 → M1.25 Saldo (from Scribe)

**Link + Neo agreed:** Shift M1 implementation sequence to Panel → Movements (not Movements → Panel).

**Why this changes your sprint:**
- **Your next task:** Panel UI implementation (3–4 days). Prototype reference + mock data → recent-txs table + totals strip + sparklines placeholder. Read-only surface, no forms.
- **After Panel:** Movements structure UI is already mostly done; now focus shifts to command-side wiring (account/category pickers, date-range binding, form submission) *after* Panel ships.
- **Saldo:** defers to M1.25. Don't allocate to M1 final sprint.

**Rationale:** Panel is simpler (no empty-state gate, no date-range complexity, no form validation), unblocks internal alpha faster, validates the full event-sourced data layer on the gentlest code surface before we hit Movements' complexity.

**Your M1 exit gate (redefined):** Account creation → Tx entry → Panel visibility (not "three full-featured views"). Movements visible but forms wired in M1+1.

**Work breakdown (1 sprint total):**
- Morpheus/Switch: `core/query`, IPC contract, crypto wiring for reads (3–4 days each, parallel).
- You: Panel UI from prototype → mock data integration → vitest snapshot.
- Gates: typecheck · lint · test · before/after screenshot vs prototype.

**Unblocked for you:**
- Niobe's Panel UX spec (lightweight — mostly prototype reference).
- Mouse's finalized tokens for Panel (fewer edge cases than Movements).
- No date-range complexity, no account/category picker yet.

See `.squad/decisions.md` § "Panel-First Unlock" for full rationale + work packages.

### 2026-04-19: CSS sticky patterns — two subtle gotchas
- **Sortable header `<button>` resets text-transform and letter-spacing.** `font: inherit` on the child button does NOT cover `text-transform` or `letter-spacing`; the `<button>` UA default overrides both. When a `th` uses `text-transform: uppercase` + `letter-spacing: 0.08em`, any inner `<button class="ot-table__sort-btn">` must explicitly `text-transform: inherit; letter-spacing: inherit;` or sortable columns render in mixed case while non-sortable ones stay uppercase.
- **`overflow: clip` vs `overflow: hidden` for sticky escape.** `hidden` establishes a scroll containing block and traps `position: sticky` inside the clipped box (thead vanishes as soon as user scrolls past the table's own height). `overflow: clip` still visually clips children (rounded corners OK) but does NOT create a scroll container — sticky can escape to the nearest real scrolling ancestor (`.ot-shell__main`). Use `clip` on wrappers that want rounded corners AND contain a sticky header.
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

## Movements type-arrow column split

## 2026-04-19T16:21:30Z — Panel-First Work Package Decomposition (from Neo)

**Neo completed:** Full decomposition of Panel-first M1 implementation into 10 sequenced work items (WI-1 through WI-10) with owners, acceptance criteria, dependency graph, and critical-path analysis. Artifact: `.squad/decisions.md` § Neo — Panel-First Work Package Decomposition.

**Your assignments (awaiting Pedro approval on Q1–Q6):**

| WI | Phase | Owner | Your Role | Est. Days | Gate |
|---|---|---|---|---|---|
| WI-2 | Gate | Morpheus+Trinity | Collab with Morpheus | 1 | IPC round-trip vitest |
| WI-3 | Early | Trinity | Lead | 3–4 | Panel UI with mock IPC calls; before/after vs prototype |
| WI-7 | Polish | Trinity/Mouse | Lead (or Mouse?) | 1–2 | Sparkline component; render 12-month net |
| WI-8 | Polish | Trinity/Mouse | Lead (or Mouse?) | 1–2 | 12-month bars chart (custom SVG or lib?) |
| WI-9 | Polish | Trinity+Niobe | Collab with Niobe | 1 | Empty states; three copies ratified in Wave 1 specs |
| WI-10 | Polish | Trinity | Lead | 1 | Loading skeleton polish; no layout shift between skeleton+loaded |

**First wave (day 1, after Pedro answers Q1–Q6):**
- WI-3 (you, Panel UI) starts immediately — no blocking dependencies. Morpheus will mock the IPC calls; you wire them on the renderer side.
- WI-1 (Morpheus, core) starts immediately in parallel — no blocking dependencies.
- WI-2 (you + Morpheus, IPC contract) starts after WI-1 query signatures stabilize (~1 day lag).

**Critical path to M1 Panel alpha:** WI-1 → WI-2 → WI-3 + (WI-4→WI-5) → WI-6 → polish (WI-7/8/9/10). By day 10, Panel renders from real encrypted OneDrive events. Days 11–15 = sparklines + chart + empty states + skeleton.

**Your Q1–Q6 reads:**
- Q2: **Real sparklines M1 or fake?** — You'll need to know if WI-7 (sparklines) is real monthly aggregation (comes from Morpheus's query) or fake seeded data for M1 alpha. Neo recommends real; ship Panel with or without the chart rendering?
- Q4: **Chart library (WI-8)** — Neo recommends custom SVG for M1 (no deps, matches prototype). You might pair with Mouse for this. No bench yet on visx vs Recharts vs hand-rolled SVG.
- Q7–Q10 are out of scope for you (Morpheus/Niobe/Switch).

**Next steps:**
- Work package merged to `.squad/decisions.md`.
- Awaiting Pedro approval to spawn first-wave agents (Morpheus on WI-1, you on WI-3, dual-spawn WI-2 once WI-1 stabilizes).

## Movements type-arrow column split
- Split the type indicator out of the amount cell into its own narrow (36px) centered column as 1st column; amount cell now shows only the formatted currency with income/expense color class.
- Extended Table primitive: TableColumn gained optional 'width' and 'center' align; Table.css adds .ot-table__cell--center.
- Typecheck, lint and build all pass.

## Movements filter bar (prototype parity) — fix/trinity-prototype-parity
- Replaced DateRangePicker block on MovementsScreen with a prototype-style .ot-filter-bar: chip group (Todos/Ingresos/Gastos), cuenta/categoria/mes selects, min/max EUR inputs, "solo sin categorizar" checkbox, right-aligned "Limpiar filtros" ghost button.
- Simplified state machine from 4 states to 3 (loading/loaded/error). On mount we now fetch the full mock set via getMockMovements with a wide 2020-2099 range; filtering is client-side.
- Promoted "Nuevo Movimiento" CTA into the page-header right side (same pattern as Panel/Saldo); disabled until rows load.
- Filters implemented against current Movement schema: type, account, category, month (from date.slice(5,7)), minAmount, maxAmount.
- Filter SKIPPED: uncategorizedOnly is wired up and rendered, but the mock schema always sets a non-empty category, so the predicate is effectively a no-op. TODO comment left in the filter logic. Wrote .squad/decisions/inbox/trinity-movement-schema-gaps.md for Morpheus.
- Added movements.filters.* i18n keys (EN/ES). Month names are localized via Intl.DateTimeFormat, no hard-coded month strings.
- Tests updated: old tests asserted on the picker radiogroup / absence of CTA; rewrote to assert chip tablist, header CTA, and that a table renders after the mock round-trip.
- Did NOT touch the DateRangePicker primitive (still used by tests and available for future work).
- Verified: typecheck OK, lint (0 warnings) OK, 39/39 tests pass, vite build OK.

## 2026-04-19 — Inter font self-hosted (fix/trinity-prototype-parity)

Fix: Google Fonts CDN `@import` in Electron is unreliable (CSP / offline / cold cache). Bold Inter glyphs (↑/↓ arrows in Movements) were falling back to system fonts — visibly thinner than prototype.

### Changes
- Installed `@fontsource/inter` (v5.2.8) in root `package.json` (flat workspace per ADR-002).
- Imports added in `app/src/renderer/main.tsx` (lines 6–9):
  - `@fontsource/inter/400.css` (regular)
  - `@fontsource/inter/500.css` (medium)
  - `@fontsource/inter/600.css` (semibold)
  - `@fontsource/inter/700.css` (bold)
- Removed Google Fonts `@import` from `app/src/renderer/styles/tokens.css` (was line 17). Replaced with a comment pointing to `main.tsx` as the new font source.
- `--font-family-sans` unchanged (still `'Inter', Roboto, …`).

### Learnings
- **CDN `@import` is unreliable in Electron** — always self-host fonts via `@fontsource/*` for deterministic weight/glyph rendering across offline/CSP/cold-cache scenarios.
- Vite bundles all @fontsource woff2 subsets automatically as build-time assets (Latin, Latin-ext, Cyrillic, Greek, Vietnamese) — CSS ~42 kB, + ~17 woff/woff2 chunks. Acceptable for Electron.
- Per-weight side-effect imports (`@fontsource/inter/400.css`) work out of the box with our Vite config — no barrel fallback needed.

### Build status
`npm run typecheck` ✅ · `npm run lint` ✅ (0 warnings) · `npm test` ✅ (39/39) · `npm run build` ✅.

## 2026-04-19 — Movements columns parity + width cap + natural-case headers (fix/trinity-prototype-parity)

Three-part parity pass landed in one commit.

### Part A — Page width cap removed
- Deleted `max-width: 1440px` from `.ot-movements`. Page now flexes to the full `.main` inner area (sidebar + gutter + scrollbar), matching the prototype. Filter bar and table stretch naturally at wide + narrow viewports (filter bar already wraps via flex-wrap).

### Part B — Natural-case table headers (primitive fix)
- `.ot-table thead th`: removed `text-transform: uppercase` + `letter-spacing`; size 11 -> 13. Kept semibold + muted color.
- Deviation note: prototype `.tx-table th` still applies uppercase + 0.08em letter-spacing. Per Pedros instruction this task, the app diverges from the prototype here. Logged in `.squad/decisions/inbox/trinity-movements-columns-parity.md` so Niobe/Link can ratify.
- Only MovementsScreen consumes `.ot-table`. Panel/Saldo KPI strips and sidebar section labels have their own uppercase rules in globals — untouched. Zero regression outside Movements.

### Part C — Movements columns (prototype parity)
Columns in order: select, type-arrow, date, account, observations, category, subcategory, tags, status, amount.

- Select column (36px, centered) with native checkboxes. Header tri-state uses a callback ref + useEffect to set `.indeterminate` (React does not expose it as a prop).
- Selection state: ReadonlySet<string> of movement IDs. Persists across filter changes. Header checkbox operates only on visible rows (filteredRows). allVisibleSelected / someVisibleSelected derived from intersection of selected with visibleIds.
- Selected-row background: pure CSS via `:has(input.ot-row-checkbox:checked)` in Table.css — keeps Table primitive stateless. Uses --color-brand-surface.
- Subcategory split into dedicated column (null -> em-dash muted). Category cell shows plain value or `.ot-badge--uncategorized` chip when null.
- Tags column: new `.ot-tag-chip` + `.ot-tag-chip-row` recipes in globals. Prototype color-mix recipe — per-chip color injected via `--ot-tag-color` inline custom property. Deterministic string-hash over a 6-entry palette (mock tags carry no color; real impl will resolve from reference_data).
- Status column: `.ot-badge--pending`/`--approved` already in globals. Added `.ot-badge--rejected` using `--color-expense-default` + `--color-expense-bg` (no dedicated rejected tokens in Mouse v0.2). Flagged in decision note for Mouse.
- Account column now renders `.ot-account-pill` with colored dot (globals recipe unchanged).
- Table primitive tweak: `TableColumn.header` widened from string to ReactNode so the select column can embed a live input. Non-breaking.
- i18n: added movements.columns.{select,observations,subcategory,tags,status} + movements.status.{pending,approved,rejected} in EN + ES. Renamed columns.description -> columns.observations; only caller was MovementsScreen.
- uncategorizedOnly filter now actually filters (4 mock rows carry category: null as seeded by Morpheus in 56db75f).

### New globals recipes
- `.ot-text-muted` — em-dash helper.
- `.ot-tag-chip` + `.ot-tag-chip-row` — prototype tag chip with `--ot-tag-color` hook.
- `.ot-badge--rejected` — rejected status badge using expense palette.

### Selection vs filter interaction
- Selection survives filter changes by design.
- Header checkbox tri-state computed from the visible filtered subset, not the entire loaded set.
- Toggling header when all-visible-selected removes the visible subset from the selection — keeps off-screen selections intact.

### Account-pill location
- Lives in `app/src/renderer/styles/globals.css` as `.ot-account-pill` + `.ot-account-pill__dot` (predates this pass). First real consumer is now the Movements account column; Panel/Saldo can reuse.

### Build status
typecheck OK, lint OK (0 warnings), 39/39 tests pass, vite build OK (1790 modules, 42.93 kB CSS / 249.22 kB JS).


## 2026-04-19 — Movements/shell: uppercase thead + sticky thead + scroll isolation (fix/trinity-prototype-parity)

One-commit pass with three tightly-coupled fixes.

### Part A — UPPERCASE table headers (reversal)
- Previous pass stripped `text-transform: uppercase` + `letter-spacing` from `.ot-table thead th` based on coordinator instruction. Pedro visually verified the prototype renders headers UPPERCASE ("FECHA", "CUENTA", "OBSERVACIONES"); the prototype CSS (`.tx-table th`, prototype/styles.css L430–441) confirms.
- Restored: `font-size: var(--font-size-11)` (11px = `--font-xs`), `text-transform: uppercase`, `letter-spacing: 0.08em` (= `--ls-section`), semibold, muted color, opaque `--color-surface-primary` background.
- Decision note: `.squad/decisions/inbox/trinity-movements-table-casing-reversal.md`.
- Lesson: when a decision-note flags a prototype discrepancy, the prototype CSS wins until screenshot/CSS evidence proves otherwise.

### Part B — Sticky thead
- `.ot-table thead th` keeps `position: sticky; top: 0; z-index: var(--z-sticky)`. Background is opaque so rows don't bleed through under the sticky header.
- Anchor: sticky searches for the nearest scrolling ancestor. After Part C, that is `.ot-shell__main` — exactly what we want. To ensure the table wrap does NOT create a nested scroll container, I flipped `.ot-table-wrap` from `overflow: auto; max-height: 100%` to `overflow: hidden` (still clips the rounded corners; `overflow: hidden` does NOT establish a scroll container for sticky).
- Panel / Saldo stubs don't use the Table primitive with a scrolling parent — no regression.

### Part C — AppShell scroll isolation
Prototype behavior: `.shell { display: grid; grid-template-rows: 60px 1fr; grid-template-columns: 240px 1fr; height: 100vh; }` — only `.main` scrolls. Implemented:

- `body { overflow: hidden; height: 100%; }` in globals.css (html + #root already had height 100%).
- `.ot-shell`: `min-height: 100vh` → `height: 100vh; overflow: hidden;`.
- `.ot-shell__topbar`: kept grid-area topbar + `position: sticky; top: 0; z-index: var(--z-topbar)` (belt-and-braces since the grid row locks it anyway), added `overflow: hidden; min-width: 0`.
- `.ot-shell__sidebar`: flex column, `overflow: hidden; min-height: 0;`. `.ot-shell__nav` got `overflow-y: auto; min-height: 0;` so it scrolls if it ever overflows, while `.ot-shell__sidebar-spacer` (flex:1) keeps the user-strip pinned to the bottom. `.ot-shell__user-strip` got `flex-shrink: 0`.
- `.ot-shell__main`: grid-area main, `overflow-y: auto; overflow-x: hidden; min-width: 0; min-height: 0`.

Net result: with many rows, only `.ot-shell__main` scrolls; topbar + sidebar + user strip + sticky thead all stay on-screen.

### Decision notes landed
- `.squad/decisions/inbox/trinity-movements-table-casing-reversal.md` — reversal rationale.
- `.squad/decisions/inbox/trinity-appshell-scroll-isolation.md` — fundamental layout contract for every future screen: only `.ot-shell__main` scrolls; nested scrolls are a red flag; sticky anchors to `.ot-shell__main`; modals must be `position: fixed; inset: 0` with z-index > `--z-topbar`.

### Follow-ups queued by Pedro (not in this commit)
- Bulk operations on selected rows — must-have feature (see `.squad/decisions/inbox/copilot-movements-bulk-ops-scope.md`).
- Tag filter in the filter bar (see `.squad/decisions/inbox/copilot-movements-tag-filter-scope.md`).
- Account colors currently all identical — data gap, Morpheus/Mouse.

### Build status
typecheck OK · lint OK (0 warnings) · 39/39 tests pass · vite build OK (43.08 kB CSS / 249.22 kB JS).


## 2026-04-19 — Sticky thead visual leak: .ot-shell__main padding-top -> 0 (fix/trinity-prototype-parity)

### Bug
Pedro: transactions visibly pass above the pinned sticky thead, reaching the top of the screen as rows scroll up.

### Root cause
.ot-shell__main had `padding: var(--space-9) var(--space-10)` (~48 px top).
For sticky `top: 0` anchored to this container, the `padding-top` band is inside the scrollport and is paintable scroll-through space. Rows scrolled into that band rendered ABOVE the pinned thead strip (thead background only covers its own box).

### Fix (Option 2 from coordinator brief — structural, not a band-aid)
- `.ot-shell__main`: `padding: 0 var(--space-10) var(--space-9);` (top gutter removed, horizontal + bottom kept).
- `.ot-page-header` (globals.css): added `padding-top: var(--space-9);` so every screen's top-gutter still lands at the same visual position. All three live screens (Panel / Movimientos / Saldo) start with `.ot-page-header`, so no per-screen edits needed.
- Documented the contract in a decision note: every future screen MUST start with a first-child that owns the top gutter, or it will render flush against the topbar. Decision note: `.squad/decisions/inbox/trinity-sticky-padding-gap.md`.

### Why not Option 1/3 (::before cover, box-shadow upward)
Those paint over the gap but only work cleanly when the sticky is actually stuck — not while still in flow. They'd either cover the filter bar/totals above the table (bad) or need JS state. Removing the padding is a one-line structural fix with no edge cases.

### Lesson learned (added to skills/css-sticky-patterns, confidence low -> medium)
**If an outer scroll container hosts a `position: sticky; top: 0` header, its `padding-top` must be 0.** Push the top gutter onto the first in-flow page element. This is now gotcha #3 in `.squad/skills/css-sticky-patterns/SKILL.md` with a checklist.

### Build status
typecheck OK · lint OK (0 warnings) · 39/39 tests pass · vite build OK (43.15 kB CSS / 249.22 kB JS).

### 2026-04-19: Sticky mask band — side-border hairlines fix
- Follow-up polish on the prior sticky-thead alignment fix (28px --sticky-top-offset + .ot-table thead th::before mask band).
- Pedro reported 1px hairlines on each side of the 28px mask strip when scrolled.
- **Root cause:** the mask pseudo was ::before on the <th>, so it spanned only the th's width — INSIDE the wrap's padding edge. .ot-table-wrap has order: 1px solid on each side which, when the wrap's top has scrolled out of view, still renders those 1px left/right edges within the 0..28px pin band, flanking the mask.
- Pseudos don't inherit borders from their host element, so the bleed wasn't from the pseudo itself — it was the wrap's card-frame border showing past the mask's horizontal extent.
- **Fix:** extend the first/last-child th pseudos 1px outward (left: -1px / ight: -1px) and set overflow-clip-margin: 1px on .ot-table-wrap so overflow: clip allows that 1px bleed over the side borders. Also added an explicit order: 0 on the pseudo as a defensive no-op (documents intent + guards against future cascade leaks).
- At scroll=0 the pseudo still sits above the wrap's padding box and is fully clipped; visual is clean in both states.
- Gates: typecheck / lint (0 warnings) / 39 tests / build — all green.
