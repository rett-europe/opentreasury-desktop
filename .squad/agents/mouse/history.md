# Project Context

- **Owner:** Pedro (perocha)
- **Project:** OpenTreasury Desktop — Electron-based treasury management for NGOs. Desktop version of the cloud-based rett-europe/opentreasury, designed to work without complex cloud setup.
- **Stack:** Electron (frontend), rest TBD. Reference app: Angular 19 + Python FastAPI + Cosmos DB + Entra ID on Azure.
- **Created:** 2026-04-19

## Key Reference

Design context:
- Cloud version uses Angular Material as component library
- Target audience: NGO administrative staff (clarity over aesthetics)
- Desktop app context: larger screens, keyboard + mouse primary input
- Existing prototype in `/prototype/` uses oklch color space, modern CSS
- Multi-language support needed (Spanish + English) — affects layout
- Financial data display: tables, numbers, currency formatting
- Dashboard: balance cards, monthly charts

## Core Context

Design tokens v0.2 extracted from `prototype/` (oklch color space, modern CSS). **Prototype is the visual/interaction contract for v1** per the prototype-fidelity ruling — when design system and prototype conflict, prototype wins and the design system is updated to match. All colors in component CSS must resolve through tokens (no inline hex); data palettes (e.g. the 8-color category palette stored on the category record) are an exception. AppShell sidebar is now split into **Principal** + **Configuración** sections; icon set is `lucide-react` (`SlidersHorizontal` used for Settings — gear alternative available if preferred).

Language: ES + EN parity mandatory (`locales/{en,es}/common.json`). Target user: NGO admin staff (clarity over aesthetics). Accessibility target: WCAG AA — native `<dialog>` for modals, `role="tablist"` + ARIA authoring-practices tab juggling for tabs, empty states with icon + title + body + primary CTA.

# Project Context

- **Owner:** Pedro (perocha)
- **Project:** OpenTreasury Desktop — Electron-based treasury management for NGOs. Desktop version of the cloud-based rett-europe/opentreasury, designed to work without complex cloud setup.
- **Stack:** Electron (frontend), rest TBD. Reference app: Angular 19 + Python FastAPI + Cosmos DB + Entra ID on Azure.
- **Created:** 2026-04-19

## Key Reference

Design context:
- Cloud version uses Angular Material as component library
- Target audience: NGO administrative staff (clarity over aesthetics)
- Desktop app context: larger screens, keyboard + mouse primary input
- Existing prototype in `/prototype/` uses oklch color space, modern CSS
- Multi-language support needed (Spanish + English) — affects layout
- Financial data display: tables, numbers, currency formatting
- Dashboard: balance cards, monthly charts

## Core Context

Design tokens v0.2 extracted from `prototype/` (oklch color space, modern CSS). **Prototype is the visual/interaction contract for v1** per the prototype-fidelity ruling — when design system and prototype conflict, prototype wins and the design system is updated to match. All colors in component CSS must resolve through tokens (no inline hex); data palettes (e.g. the 8-color category palette stored on the category record) are an exception. AppShell sidebar is now split into **Principal** + **Configuración** sections; icon set is `lucide-react` (`SlidersHorizontal` used for Settings — gear alternative available if preferred).

Language: ES + EN parity mandatory (`locales/{en,es}/common.json`). Target user: NGO admin staff (clarity over aesthetics). Accessibility target: WCAG AA — native `<dialog>` for modals, `role="tablist"` + ARIA authoring-practices tab juggling for tabs, empty states with icon + title + body + primary CTA.

## Learnings

### 2026-XX-XX: PR #104 Income/Expense/Net Visual Consistency — Dashboard Pattern Locked

**Context:** Pedro reported visual inconsistency across four screens (Dashboard, Movements, Saldo, Insights) for income/expense/net presentation. Dashboard (Panel) was the canonical reference.

**What shipped:**
- ✅ Movements: Replaced custom `.ot-movements__totals` (4-column grid, no icons) with `.ot-kpi-strip` from `globals.css`. Added icons (TrendingUp/Down/Calculator size 20). Removed component CSS overrides that shadowed shared recipe.
- ✅ Insights: Fixed icon size (24 → 20), wrapped icons in `.ot-kpi__icon` div. First KPI (active tags) uses neutral styling.
- ✅ Saldo: Already correct — no changes needed.

**Canonical pattern (locked):**
- **Icons:** `TrendingUp` (income), `TrendingDown` (expense), `Calculator` (net) — all size **20px**
- **Colors:** `--color-income-default`, `--color-expense-default`, `--color-brand-primary` (values); `--color-income-bg`, `--color-expense-bg`, `--color-brand-surface` (icon backgrounds)
- **Layout:** `.ot-kpi-strip` (3-column grid) + `.ot-kpi` (card) + `.ot-kpi__icon` (icon wrapper) + `.ot-kpi__content` (text)
- **Typography:** `.ot-kpi__label` (uppercase 11px), `.ot-kpi__value` (24px semibold tabular-nums)

**Files:**
- Reference component: `app/src/renderer/components/KPIStrip/KPIStrip.tsx`
- Shared recipe: `app/src/renderer/styles/globals.css` (lines 197-269)
- Fixed screens: `MovementsScreen.tsx`, `InsightsScreen.tsx`

**Anti-pattern caught:** Component CSS imported after `globals.css` silently shadows shared recipes. Movements had redefined `.ot-movements__totals-*` with different grid layout and missing icons. Solution: remove component overrides, use shared `.ot-kpi-strip` exclusively.

**PR:** https://github.com/rett-europe/opentreasury-desktop/pull/104  
**Tests:** TypeCheck clean, lint clean.

### 2026-04-26: PR #99 Insights Primitives Complete — DonutChart + SegmentedToggle Shipped

**Context:** Second of 4-PR Insights M4 train. Pure component primitives for consumption by PR #100 (landing) and #101 (drilldown).

**What shipped:**
- ✅ DonutChart: SVG-based category distribution donut with deterministic color palette
  - Props: `slices`, `total`, `size`, `thickness`, `centerLabel`, `emptyLabel`, `ariaLabel`, `locale`, `currency`
  - Edge cases: empty state, single segment, N segments, >5 auto-aggregates to "Otras (N)" bucket
  - Accessibility: hidden `<table>` + ARIA `role="img"` + segment tooltips
  - Animation: stroke-dasharray 200ms ease-out transition
- ✅ SegmentedToggle: Radio group styled as pill buttons (display-mode selector)
  - Props: `options`, `value`, `onChange`, `ariaLabel`
  - Keyboard nav: arrow keys wrap, ARIA radiogroup semantics
  - Controlled component pattern (parent owns state)
- ✅ colorHash utility: Deterministic category ID → oklch color mapping
  - FNV-1a hash (32-bit) → modulo 8 → palette index
  - 8-color curated palette with WCAG AA contrast (light + dark themes)
  - Special: `otherBucketColor()` returns neutral gray for "Otras"

**Design decisions:**
1. **CSS custom properties for donut colors:** Uses `--color-donut-0` through `--color-donut-7` instead of inline styles. Mirrors GroupedBarChart pattern (--current/--prior bar classes). Enables theme-aware palette swapping without component re-render.
2. **Deterministic color hashing:** FNV-1a chosen for speed + good distribution on short strings. Same category ID always maps to same color across sessions. 8-color palette balances visual distinction vs. palette explosion.
3. **SegmentedToggle semantics:** Display-mode selector (Volumen/Neto/# Mov.), NOT a sort selector. This clarifies Niobe's §2.3 spec critique — the toggle changes *presentation*, not ranking.
4. **Native accessibility patterns:** DonutChart uses `role="img"` + hidden `<table>`, SegmentedToggle uses `role="radiogroup"` + arrow key nav. No ARIA invention — just authoring practices.

**Reusable patterns confirmed:**
- **SVG donut via stroke-dasharray:** `circumference = 2πr`, each segment gets `dasharray="${segmentLength} ${circumference}"` + offset. Rotate via `strokeDashoffset` starting at `-circumference/4` (top of circle). Accumulate offsets for multi-segment.
- **Deterministic palette mapping:** Hash string → modulo palette size → index. Store palette as const array, use CSS custom properties for theme-aware colors.
- **Controlled radio group component:** Parent passes `value` + `onChange`, component renders radio inputs + labels, keyboard nav updates selection via onChange callback.

**Test patterns:**
- 25 tests total (6 colorHash + 9 DonutChart + 10 SegmentedToggle)
- Use `// @vitest-environment jsdom` comment for React components
- Use `fireEvent` from `@testing-library/react` (no userEvent library)
- Use `.toBeDefined()` and `.toContain()` instead of jest-dom matchers (`toBeInTheDocument`, `toHaveAttribute`)
- For multiple matches (e.g., text in SVG + table), use `getAllByText()` or regex `.toMatch()`

**Spec compliance:**
- ux-005-insights-final-spec.md §5.1 (DonutChart): Props match exactly, "Otras" bucket rule at >5 slices ✅
- §5.3 (SegmentedToggle): Display-mode selector semantics (NOT sort) ✅
- §2.10 critique: Color palette deterministic hash (NOT hardcoded) ✅

**Ready for PR #100:** DonutChart + SegmentedToggle are wired and tested. Next PR will consume them in InsightsScreen landing + drilldown views.

**PR:** https://github.com/rett-europe/opentreasury-desktop/pull/99  
**Tests:** All 25 pass, typecheck clean, lint clean.

### 2026-04-26: Saldo iter 5 complete — responsive panels + 1:3 column ratio locked

PR #91 `mouse/saldo-prototype-layout` commit `1d3fcb7`: Saldo compare-mode now responsive (shrinks with viewport, matching Balance page). Added asymmetric grid template `1fr / 3fr` (prior / current year), giving current-year column 3x width. Bars scale against same denominator across both years, so a 100% prior bar is visually ~1/3 the length of a 100% current bar — matches `ingresos_gastos.png` prototype intent. All 654 tests green, lint/typecheck/prettier clean. Reusable skill captured: `.squad/skills/responsive-panel-width/SKILL.md`. Awaiting Pedro re-review.

**Queued follow-up work:** Responsive navbar (collapse on small screens) + non-truncating date column in Movements page. Both captured in separate directive inbox → decisions.md. Owners: Mouse (spec) + Trinity (impl). Mouse eligible — Saldo lockout is artifact-scoped.

### 2026-04-26: Pairing Rule — Separate Visual Judgment from Code Interpretation
After PR #91 Saldo Iteration 3 (mouse/saldo-prototype-layout, commit b41f973): **always pair with Trinity on UI work.** Mouse owns visual judgment / prototype fidelity; Trinity owns .tsx/.css. PR #91 went 3 iterations because a single agent (Mouse) was answering both "is this what the prototype shows?" AND "is the React tree correct?" — independent questions requiring independent judgment. Default pattern: Mouse drafts visual spec + reviews against prototype; Trinity implements and ships code. This rule is now locked in decisions.md under Process / Pairing.

### 2026-04-26: PR #98 Insights Scaffold Complete — Empty State Shell Ready for Component Build

**Context:** First of 4-PR Insights M4 train. Implemented foundation per ux-005-insights-final-spec.md §8 Phase 1.

**What shipped:**
- ✅ `InsightsScreen/` folder with empty-state placeholder (ChartLine icon, centered card, user-friendly copy)
- ✅ Added `'insights'` to Route union, nav entry (after Balance), wired in App.tsx
- ✅ i18n keys: `shell.nav.insights` (ES: "Análisis", EN: "Insights") + `insights.*` namespace
- ✅ All smoke tests green (typecheck, lint, 654 tests)

**Design decisions:**
1. **Empty state pattern:** Reused `.ot-p-card` + `.ot-page-header` from globals.css (consistent with Saldo/Panel)
2. **Icon choice:** ChartLine (lucide-react) matches spec §3.1 — sparkline-style, not pie/donut
3. **Copy tone:** Friendly prompt to tag transactions, not "coming soon" generic message
4. **Centered layout:** `max-width: 540px; margin: auto` — follows existing empty-state pattern from Movements

**Reusable patterns confirmed:**
- Nav entry insertion is additive-only (zero conflicts)
- Routing chain in App.tsx follows `route === 'X' ? <XScreen /> :` pattern
- i18n keys follow `{section}.{key}` flat namespace (no deep nesting)

**Ready for PR #99:** DonutChart + SegmentedToggle components (2-day effort per spec §8).

<!-- Append new learnings below. Each entry is something lasting about the project. -->

## 2026-04-19 — Team Context Update (from Scribe)
- ADR-001 (Proposed) at `docs/architecture/adr-001-tech-stack.md` — Neo recommends Option A (React+TS, append-only event-sourced JSON, `age` encryption).
- Security Requirements v0.1 at `docs/security/security-requirements-v0.1.md` — Switch: 20 requirements, 15 stack constraints, 8 accepted risks, 6 open questions for Pedro.
- Both are team context now.

### 2026-04-19: ADR-001 Accepted — UX constraints locked
ADR-001 is Accepted. Implementation constraints locked: no passphrase UI in v1 (OS keychain handles it silently); device enrollment needs a QR-code / 6-char visual-code pairing UX flow. Consider UX implications in upcoming specs.

## 2026-04-19 — Team update (via Scribe)
Niobe's UX baseline and flows published under docs/ux/. Your visual design work follows her flows, NOT the prototype's pixels. Three flow skeletons (first-run, device-enrollment, movements-date-range) are your anchor points. Niobe also flagged design needs: visual tokens extraction, sync indicator, error severity, admin-only affordances, date-range picker, focus states.

### 2026-04-19: Product reshape — Design implications
- **No pending-state visual design needed** (product has no pending concept).
- **Both Spanish and English layouts must be considered from day 0.** Text-expansion factor matters (EN often ~30% longer than ES) — pad components and avoid fixed-width text containers.


### 2026-04-19: app/src/renderer/ is minimal React shell with ES/EN wired via react-i18next. Design tokens and components pending your work.
### 2026-04-19 — From Scribe: UX-001/002/006 Draft v0.1 landed
- Batch 2 (UX-003/004/005 screens) spawning now.
- After batch 2 lands you can start design tokens and component primitives anchored to these specs.


## Cross-agent update (Scribe, 2026-04-19T10:34:16Z)
Wave 1 UX COMPLETE - all 6 specs Draft v0.1. UNBLOCKED for ALL Wave-1 screens: design tokens, breakpoints, skeletons, range-picker pattern, charts (collapsible data-table equivalent used by Saldo + Panel), negative-balance treatment, account-pill language, admin-only affordance patterns. Happy path install->first-run->enroll->shell->Panel->Movements->Saldo has a stable UX contract.

## 2026-04-19 — Design system v0.1 shipped (branch: feat/design-system-wave-1)
**5 artifacts authored under `docs/design/`:**
- `design-principles.md` — 8 principles (P1 Calm over flashy · P2 High contrast by default · P3 Text-first; icons support · P4 Desktop-native feel · P5 Bilingual-first layout · P6 Empty state teaches · P7 Density is a preference · P8 Security-adjacent language is surfaced).
- `tokens.md` — full catalog: colour (light + dark, both WCAG AA verified with explicit ratios in §1.4), typography (OS system stack, 8-step scale, body 14 px, tabular-nums rule), spacing (4 px base), radius, elevation (light + dark shadow sets), motion (duration + easing + reduced-motion), z-index (11 named layers), breakpoints (compact 960 / standard 1280 / wide 1600).
- `components-v1.md` — 16 primitives (Button, TextField, Select, DateRangePicker, Banner, Dialog, Sidebar, Topbar, Toast, Badge/Pill, EmptyState, Skeleton, DataTable, Chart, LocaleSwitcher, CodeDisplay). Each has anatomy + states + props shape + a11y + i18n + UX-spec consumers.
- `screen-visuals-v1.md` — layout region breakdowns + per-state visual treatment for all 6 Wave-1 screens. Mermaid diagrams for region structure. NO pixel mockups (spec, not Figma).
- `icons-and-illustrations.md` — Lucide locked. Icon-to-semantic mapping table for Wave-1 surfaces. No illustrations in v1 (Principle P1 + budget + i18n friction + dark-mode doubling cost).

## Learnings
- **Brand anchor preserved.** Carried `#6d4d8c` from prototype/cloud — Rett Spain sees continuity. All surrounding values rebalanced for AA+.
- **Dark theme is not a variant; it's mandatory at v0.1.** Treasurer at 10 PM matters. Verified AA on every shipped fg/bg pair in both themes.

### 2026-04-20: Panel polish punch-list (post WI-15-lite)
- **Panel grid responsive design is correct.** Breakpoints at 5-col (root) → 4-col (1439px) → 3-col (1199px) → 2-col (899px) already in place in globals.css. If cards still overflow at 1200–1399px, investigate parent container width constraints (likely not a breakpoint issue).
- **Balance tone colors already implemented.** AccountCard.tsx uses conditional class logic (`--positive` / `--negative`) that maps to `--color-income-default` (green) and `--color-expense-default` (red). Positive/negative coloring is spec-compliant; verify in installed app.
- **Icon color rule exists but may have specificity issue.** AccountCard.css line 16 already sets `color: #ffffff;` on `.ot-account-card__icon`. If Landmark glyph appears gray in the app, this is likely a lucide-react rendering issue or CSS override — not a missing rule. Check browser dev tools for applied styles.
- **Arrow icons are text glyphs, not Lucide components.** Both Panel and Movements use `'↑'` / `'↓'` (Unicode U+2191/U+2193) as per prototype. Never swap these for `TrendingUp` / `TrendingDown` (those are chart icons for KPI tiles, not row-level type indicators).
- **"View all transactions" position matches prototype.** Link already positioned at bottom-right of recent-tx card with divider separator. No change needed.
- **KPI graph preview deferred.** Pedro approved deferral; track as enhancement for M1.2+. When implemented, will need small SVG sparkline or micro-chart component (~20–30px height).
- **Seed data cosmetic issue is a data layer concern, not design.** Mock account name "Santander Cuenta Principal" is out of place; recommend Link update seed fixtures once Morpheus integration lands. Not a UI/CSS issue.
- **4 px base grid (not 8 px).** Prototype used 8 px but I needed half-steps for compact density without sub-pixel rendering. Spacing scale remains 8 px-rhythmed by default.
- **Tabular numerics on every amount cell** — `font-variant-numeric: tabular-nums` + `font-feature-settings: 'tnum'` fallback. System fonts all support it; no download needed.
- **System font stack, no web fonts** — `Segoe UI Variable` → `Segoe UI` → `-apple-system` → `system-ui` → Roboto. Offline-first per vision P5, honours OS accessibility.
- **No pending tone anywhere.** Badge/Pill primitive explicitly does NOT ship `pending` — reinforces product decision 2026-04-19 at the token level.
- **P8 Security-adjacent surfacing** — the `CodeDisplay` primitive is deliberately the most prominent element on UX-002 (pubkey-substitution defense only works if humans can't miss the code).
- **No illustrations in v1** — decided + documented. Principle P1 + budget + i18n friction + dark-mode doubling cost. Revisit triggers captured.
- **Chart library deferred to Trinity** — benchmark `visx` vs hand-rolled SVG vs Recharts against UX-005 PR12 (500ms at 1k events). Recharts flagged as risky (DOM node explosion).
- **Lucide over Phosphor/Heroicons/Tabler** — single-weight consistency + `Scale` glyph coverage + Shadcn ecosystem familiarity.

## Top open questions (for Pedro / Niobe / Switch / Trinity)
- **Custom brand mark** — v1 ship with Lucide `Scale` placeholder, or commission a mark? Recommend defer to v1.1. → **Pedro**.
- **Sidebar taxonomy final** — `Cuentas` / `Categorías` / `Etiquetas` / `Importación` / `Exportar` visual order confirmed? → **Pedro / Niobe**.
- **Density toggle placement** — filter bar (proposed), table footer, or global-settings-only? → **Niobe**.
- **Right-click context menus on data-table rows** — M1 or v1.x? Recommend v1.x. → **Pedro / Niobe**.
- **Toast action keyboard shortcut** (`Ctrl+Shift+T`) — add to UX-006 shortcut map? → **Niobe**.
- **UX-002 admin UPN tooltip copy** — final wording for "identity not a trust anchor" line. → **Switch**.
- **Chart library** — visx vs custom SVG vs Recharts; benchmark against PR12 perf target. → **Trinity**.
- **Account colour palette** — v1 uses 10 curated colours (contrast-safe in both themes). Mouse to propose palette in tokens-v0.2 pass. → **Mouse follow-up**.
- **Empty-state icon defaults** — ship zero (current plan) vs subtle 32 px Lucide per context. Recommend zero for v1. → **Niobe / Pedro**.

### 2026-04-19: Cross-agent update from Scribe
Trinity implemented tokens.md v0.1 + 8 primitives. Design system translated to CSS custom properties under `app/src/renderer/styles/tokens.css`. Check her decisions inbox entry (now merged into decisions.md 2026-04-19: Trinity — Frontend Wave 1 implementation choices) for any token deltas or gaps she flagged.

### 2026-04-19: CRITICAL — tokens v0.1 drifted from prototype; re-extract as v0.2
Tokens v0.1 drifted from the prototype. Remediation ticket assigned: re-extract tokens v0.2 directly from `prototype/styles.css` + `OpenTreasury Prototype.html` inline styles. Each token must cite a `Source:` note with the prototype selector it came from. This BLOCKS all subsequent frontend remediation. See `docs/product/prototype-fidelity-audit.md` and the 2026-04-19 decision `prototype/ is the visual and interaction contract for v1`.

### 2026-04-19: tokens v0.2 extraction complete (branch: fix/mouse-tokens-v0.2)
**Complete re-extraction from `prototype/styles.css` — landed as `app/src/renderer/styles/tokens.css` v0.2.**

#### Token naming reconciliation
Preserved existing naming convention (`--color-*`, `--font-*`, `--space-*`, `--radius-*`, `--shadow-*`, etc.) for Trinity's component compatibility. Added new tokens with clear names where prototype introduced new values.

#### Added tokens (new in v0.2)
- **Color:** `--color-brand-primary-light`, `--color-brand-primary-muted`, `--color-brand-surface-hover`, `--color-divider`, `--color-row-hover`, `--color-transfer-default/bg`, `--color-status-pending/bg`, `--color-status-approved/bg`, `--color-uncategorized/bg`
- **Typography:** `--font-size-20/24/34` (lg/xl/3xl from prototype scale), `--font-feature-settings`, `--section-label-*` recipe tokens (size/letter-spacing/weight/transform/color)
- **Spacing:** Rescaled entire grid to match prototype 2/4/6/8/10/12/16/20/24/32/40/48/64 (was missing 2, 6, 10)
- **Elevation:** `--shadow-card-hover` (purple-tinted)
- **Chrome:** `--topbar-height: 60px` (was 56px)

#### Changed values (corrections to match prototype)
- **Font face:** Added Inter via Google Fonts import (was OS system stack)
- **Brand hover direction:** `--color-brand-primary-light` now **lightens** to #9c7cb5 (was darkening to #5a3d75) — matches prototype hover feel
- **Border paradigm shift:** Light mode borders use purple-tinted alpha `rgba(109,77,140,0.14)` instead of flat hex — prototype's signature brand-tinted materiality
- **Radius:** Every step +2px (xs 4, sm 6, md 8, lg 12), pill is 16px not 9999px (prototype uses fixed-radius rounded rectangles for badges/pills)
- **Spacing:** Complete rescale — every step index shifted (e.g., `--space-1` was 4px, now 2px; `--space-7` was 32px, now 16px)
- **Typography scale:** h1 size 28px (was 22px), added 20/24/34 steps, removed invented 18/22 (kept 13 as legacy alias)
- **Shadows:** Card/dropdown/dialog shadows use purple tint `rgba(109,77,140,…)` instead of neutral gray — perceptibly warmer materiality
- **Motion:** fast 120ms (was 140ms), base 200ms (was 220ms), easing `ease-out` (was cubic-bezier)
- **Dark mode:** Added radial + linear gradient body background recipe (prototype's signature brand-lit corner)
- **Text colors:** All text/surface/border values refined to exact prototype hex (see inline `/* v0.2: was X, now Y */` comments)

#### Removed/deprecated
No tokens removed — legacy names preserved for Trinity's existing component references. Where values changed, added inline migration comments.

#### Pending-tone reconciliation (⚠️ FLAGGED for Link/Pedro)
**v0.1 design system explicitly removed pending tone ("no pending tone anywhere").** Prototype ships pending badges (#e65100 on #fff3e0). Per north-star rule, v0.2 **adopts prototype values** (`--color-status-pending/bg` added). Link must ratify or file a deviation.

#### Trinity migration notes
1. **Spacing token references:** All `--space-N` indexes shifted. Search/replace needed:
   - `--space-1`: was 4px → now 2px
   - `--space-2`: was 8px → now 4px
   - `--space-3`: was 12px → now 6px
   - `--space-4`: was 16px → now 8px
   - ... (see tokens.css inline comments for full map)
2. **Radius:** Every reference +2px effective value (card corners will be slightly more rounded)
3. **Font family:** Inter now loads from Google Fonts; add `font-feature-settings: var(--font-feature-settings)` to body
4. **Section labels:** Use new `--section-label-*` recipe tokens for uppercase group headings (Panel/Saldo/Movements)
5. **Primary button hover:** Behavior inverted — now lightens instead of darkens
6. **Borders:** Light mode borders are now purple-tinted alpha — may affect perceived contrast on tinted surfaces
7. **New semantic colors:** Transfer (blue), pending/approved status, uncategorized — available for Movements table rebuild

## 2026-04-19T13:54Z — Cross-agent flagging (Scribe)

### ⚠️ Rejected badge token proxy (v0.3 scope decision needed)
Trinity's Movements columns pass is complete but flagged one token gap: `--color-status-rejected-*` tokens do not exist in v0.2. Trinity implemented `.ot-badge--rejected` using `--color-expense-default` + `--color-expense-bg` as a proxy. Status badge colors needed for M1:
- `--color-status-pending-*` ✅ exists
- `--color-status-approved-*` ✅ exists
- `--color-status-rejected-*` ⚠️ **proxy in use**

**Decision:** Does v0.3 need dedicated `--color-status-rejected` tokens, or is the expense-palette proxy acceptable? Rejected rows are rare (data-validation rare path), so the shortcut is probably fine, but flagging for clarity. See `.squad/decisions.md` 2026-04-19: Trinity — Movements table columns + headers parity pass (Part 3).

### 🔄 Prototype vs app header-casing question (Niobe/Link ratification)
Table header styling mismatch discovered during prototype parity pass:
- **App implementation:** natural case ("Fecha", "Descripción") — per Pedro's instruction, no uppercase, no letter-spacing
- **Prototype CSS:** still sets `text-transform: uppercase` + `letter-spacing` on `.tx-table th` — rendered output IS uppercase

Per north-star rule, Trinity flagged for resolution: **Niobe/Link must pick one** (keep app natural case OR update prototype CSS to match). The proto CSS rule lives at `prototype/styles.css:430`. Change is small (remove 2 lines); app change would be restore 3 lines in `Table.css`.

See `.squad/decisions.md` 2026-04-19: Trinity — Movements table columns + headers parity pass (Part 2 ratification section).

### 2026-04-21: WI-20 Table truncation + button alignment fix (Mouse)

**Two bugs fixed:**

1. **Table column truncation** — Long category/subcategory codes pushed ESTADO column off-screen at 2040px viewport.
   - **Cause:** `white-space: nowrap` without `max-width` → infinite table width
   - **Fix:** `table-layout: fixed` + per-column widths + `text-overflow: ellipsis`
   - **Column width system:** select(36), type(36), date(100), account(130), description(220), category(150), subcategory(150), tags(180), status(90), amount(110) = ~1202px total
   - **Hover access:** Added `title` attributes to all truncatable cells
   - **Chip overflow:** Tags show max 2 chips + "+N" indicator

2. **Editar button icon misalignment** — Pencil icon sat higher than "Editar" text.
   - **Cause:** Icon passed as direct child instead of `leadingIcon` prop
   - **Fix:** Changed to `<Button leadingIcon={<Edit size={16} />}>`

**Pattern learned:** Never pass icons as direct Button children. Always use `leadingIcon`/`trailingIcon` props. The prop wrapper adds the correct flexbox alignment rules.

**Vision vs theorizing:** Trinity's 4 failed rounds patched CSS without seeing the actual rendered output. Looking at Pedro's screenshots immediately revealed: (a) which columns were too wide, (b) approximate widths needed, (c) exact icon/text misalignment. Always verify visually.

See `.squad/decisions/inbox/mouse-table-column-widths.md` and `.squad/decisions/inbox/mouse-button-alignment.md`.

### 2026-04-22: WI-20 Round 2 — Available width audit + Panel table fix (Mouse)

**ROOT CAUSE (why Round 1 still trimmed at 1500px):**
Round 1 summed column widths (1202px) and assumed they'd fit 1366px. Wrong. The 1366px viewport is NOT the table budget — subtract the layout chrome first.

**AVAILABLE WIDTH CALCULATION (1366px viewport):**
```
Viewport:     1366px
Sidebar:      -240px   (--sidebar-width in tokens.css)
Main padding: -64px    (--space-10 × 2 = 32px left + 32px right)
Table border: -2px     (1px × 2 from .ot-table-wrap)
──────────────────────
AVAILABLE:    1060px
```

**REVISED COLUMN WIDTHS (MovementsScreen — 10 columns):**
- select: 32px (was 36)
- type: 32px (was 36)  
- date: 88px (was 100)
- account: 100px (was 130)
- description: 200px (was 220)
- category: 120px (was 150)
- subcategory: 120px (was 150)
- tags: 140px (was 180)
- status: 80px (was 90)
- amount: 100px (was 110)
- **TOTAL: 1012px** (leaves 48px buffer for rounding/padding)

**PANEL TABLE (7 columns — NEW fix this round):**
- type: 32px
- date: 100px
- account: 120px
- description: flex (auto-fills remaining ~500px)
- category: 120px
- subcategory: 120px
- amount: 100px

**CHANGES MADE:**
1. `MovementsScreen.css`: Reduced all column widths by 10-30px each
2. `PanelScreen.css`: Added `table-layout: fixed` + column widths + ellipsis + scroll fallback
3. `PanelScreen.tsx`: Added `title` attributes for hover on truncated cells, removed inline `width` props (CSS owns them now)

**LESSON LEARNED:** Always measure the ACTUAL available width at the target breakpoint before setting column budgets. Viewport width ≠ content width.

### 2026-04-22: WI-20 Round 3 — Overflow scroll trap fix (Mouse)

**ROOT CAUSE (why `overflow-x: auto` on table wrappers didn't scroll):**
The `overflow-x: auto` rule was defeated by an ancestor `overflow-x: hidden` trap in the DOM chain. Horizontal scroll NEVER works if ANY ancestor between the wrapper and the viewport has `overflow-x: hidden` or `overflow: hidden`.

**DOM CHAIN AUDIT:**
```
.ot-shell__main (grid item, main scrollport)
├─ overflow-y: auto ✅
├─ overflow-x: hidden ❌ ← THE TRAP
└─ .ot-movements (flex container)
   ├─ display: flex ✅
   ├─ (no min-width: 0) ❌ ← SECOND TRAP (flex shrink blocked)
   └─ .ot-movements__table-container (overflow-x: auto wrapper)
      └─ .ot-table (fixed-layout, 1012px intrinsic width)
```

**THREE CULPRITS FIXED:**
1. **`.ot-shell__main`** had `overflow-x: hidden` → changed to `overflow-x: auto` to pass scroll through
2. **`.ot-movements`** lacked `min-width: 0` → flex items default to `min-width: auto` (= content size), preventing wrapper from shrinking below table width
3. **`.ot-panel-recent`** had `overflow: hidden` → changed to `overflow-x: auto` + `overflow-y: hidden`

**THE FLEX `min-width: 0` RULE:**
When a flex item contains wide content (like a table), it defaults to `min-width: auto` = "don't shrink below content width". This prevents the parent flex container from contracting below the table's 1012px intrinsic width, so the wrapper with `overflow-x: auto` never gets narrower than the table and never scrolls. **ALWAYS add `min-width: 0` to flex containers that wrap scrollable content.**

**VERIFICATION:**
- At >=1366px: table fits, no scrollbar (no regression)
- Below ~1350px: horizontal scrollbar appears, user can scroll to see ESTADO + all columns

**COMMIT:** `f21de3f` — fix(ui): enable horizontal scroll fallback on narrow viewports

**LESSON FOR FUTURE AGENTS:** When a scroll wrapper (`overflow-x: auto`) doesn't scroll, audit the ENTIRE ancestor chain from the wrapper to the viewport root:
1. Look for `overflow: hidden` or `overflow-x: hidden` on ANY ancestor — that's a trap
2. Look for flex/grid parents WITHOUT `min-width: 0` on the wrapper (flex children)
3. The scroll wrapper itself must be NARROWER than its child content to trigger the scrollbar — if ancestors prevent contraction, no scroll


### 2026-04-22: Edit Mode is a Skin of View Mode — Not a Separate Template (Mouse)

**THE PATTERN:** When a modal has view mode and edit mode, edit mode should be a SKIN of view mode — same layout primitives, same labels, same row rhythm. Only the value slot changes (text → input/select). This ensures view↔edit toggle only morphs the value cells; everything else stays put.

**ROOT CAUSE OF VISUAL DIVERGENCE:** The edit mode was using TransactionFormFields component with its own completely different layout structure (different gap spacing, different grid template, different min-height). This created a jarring visual change when switching from view to edit.

**FIXES APPLIED:**
1. **Added summary header to edit mode** — Edit body now shows the same date/description/amount summary block as view mode (read-only context for what's being edited)
2. **Unified CSS spacing** — Changed TransactionFormFields.css to use same gap values (space-5) and grid template (epeat(2, minmax(0, 1fr))) as view mode's __grid
3. **Reduced visual weight of inputs** — Changed input padding, focus shadow size, and disabled state to feel less heavy and more inline with the view mode's text display

**KEY PRINCIPLE:** The edit modal should visually feel like you're editing IN PLACE within the same layout, not teleporting to a different dialog. Labels, row order, and column layout must be identical; only the value cells transform.

**COMMIT:** see commit hash below

### 2026-04-22: FK Columns Must Resolve to Display Names — Never Render Raw IDs (Mouse)

**BUG:** The view modal's CUENTA field was rendering raw ULIDs like `01KPN5TXCPDJA6227JJAG07RF4` instead of the account name. Similar issue for category/subcategory/tags if the parent component didn't pass pre-resolved label props.

**ROOT CAUSE:** The modal was falling back to raw `transaction.categoryId` / `transaction.subcategoryId` / `transaction.tagIds` when `categoryLabel`, `subcategoryLabel`, `tagLabels` props weren't passed. The calling screens (PanelScreen, MovementsScreen) weren't passing these props, relying on the modal to display raw FK values.

**FIX:** The modal now resolves FK IDs internally using the `categories` and `tags` arrays that ARE passed:
```typescript
const category = categories.find((c) => c.id === transaction.categoryId);
const resolvedCategoryLabel = categoryLabel ?? category?.name ?? null;
```
This makes the modal self-sufficient — if pre-resolved labels are passed, use them; otherwise, resolve from the passed reference arrays.

**RULE:** FK columns in any detail view must ALWAYS resolve to display names. Never render raw IDs. If the data isn't joined upstream, do the lookup inline from available reference data.

### 2026-04-22: Edit Mode Field Order Must Match View Mode Exactly (Mouse)

**BUG:** Edit mode showed fields in a completely different order than view mode:
- **View:** Account → Category → Subcategory → Tags → Status → Currency
- **Edit (was):** Date → Type → Amount → Account → Description → Category → Tags → Status → Reference → Details

This violated the "edit is a skin of view" pattern. Switching modes caused a jarring field reshuffle.

**FIX:** TransactionFormFields now has two render paths:
1. **Edit mode:** Field order mirrors view exactly (Account/Category, Subcategory/Tags, Status/Currency). Date/description/amount stay in the read-only summary header.
2. **Add mode:** Includes editable date/type/amount/description at top since those aren't provided by a summary header.

**LESSON:** "Edit as skin of view" extends to:
- ✅ Same spacing/gaps
- ✅ Same min-height
- ✅ Same field ORDER
- ✅ Same LABEL markup (uppercase tracking from view's dt elements)
- ✅ Only the value slot changes (dd text → input/select)

### 2026-04-22: Modal Invocations Across Screens Must Pass Identical Props (Mouse)

**BUG:** The TransactionDetailModal behaved differently when opened from Dashboard (PanelScreen) vs Transactions (MovementsScreen). Dashboard showed raw FK IDs (category ULIDs, tag ULIDs) while Transactions resolved them to names.

**ROOT CAUSE:** PanelScreen was only passing `accounts` to the modal. It was NOT passing `categories` or `tags` arrays. Without those lookup arrays, the modal couldn't resolve category/tag IDs to display names.

**FIX:** Updated PanelScreen to:
1. Load `categories` and `tags` via `listCategories()` and `listTags()` in the `loadPanel()` function (added to the existing `Promise.all` call)
2. Pass `categories={categories}` and `tags={tags}` to `TransactionDetailModal`

Now both screens pass the identical props: `accounts`, `categories`, `tags`, `onUpdate`, `onDelete`.

**RULE:** When the same modal component is used across multiple screens, ALL screens must pass the complete set of props needed for full functionality. Extract to a shared helper if the invocation pattern diverges.

### 2026-04-22: Modal Size Must Be Stable Across View↔Edit Mode Toggle (Mouse)

**BUG:** On the Transactions screen, toggling from view to edit mode caused a visible size flicker/jump. The modal container changed height.

**ROOT CAUSE:** The CSS had different `min-height` values:
- `ot-transaction-detail-modal__read-body`: `min-height: 520px`
- `ot-transaction-detail-modal__edit-body`: `min-height: 400px`

This 120px difference caused the modal to shrink when entering edit mode.

**FIX:** Unified both to `min-height: 520px`. Now the modal container holds a stable size regardless of mode.

**RULE:** Modal min-height must be set on the OUTER shell and be IDENTICAL for both view and edit modes. If inner content varies, use consistent min-height so the container doesn't reflow on toggle.

**COMMIT:** see commit hash below

## 2026-04-26 · PR #102 · Insights landing-summary handler + TagCard (paired with Trinity)

**Status:** ✅ Shipped  
**Branch:** `squad/insights-landing-mouse`  
**PR:** #102  
**Paired with:** Trinity (parallel landing screen layout)

### Mission

Deliver the Insights landing seam for Trinity's parallel work (#100):
1. Real `insights:landing-summary` IPC handler (top-8 + Otras bucket)
2. TagCard component (3 display modes + archived styling)
3. Preload exposure for renderer consumption

### What I shipped

**IPC Contract** (`app/src/shared/ipc-contracts/insights.ts`):
- `insights:landing-summary` channel + Zod schemas
- Input: optional `dateWindow` (startISO/endISO, defaults to current year), optional `accountId`
- Output: global KPIs + top-N tags + Otras bucket + resolved window bounds
- `TagSummary` schema: ingresos/gastos/neto/count (cents) + topCategorias + sparklineNetCents
- Multi-label overlap documented: transaction with 2 tags counts toward BOTH totals

**Handler** (`app/src/main/ipc/handlers/insights.ts`):
- Aggregates transactions over date window (default: current year Jan 1 → today)
- Filters: non-archived accounts + optional accountId filter
- Per-tag metrics: ingresos, gastos, neto (cents), movimientosCount
- Top 2 categories by volume per tag for footer display
- Sparkline data: net per month when ≥3 months with data
- Top-8 tags by magnitude (`|net|`) + tail aggregated into Otras bucket
- Excludes archived tags from landing (per spec)
- Splits support: handles transaction splits via `effectiveAmounts` helper

**TagCard Component** (`app/src/renderer/components/TagCard/`):
- Props: tagId, name, color (optional), kpis, displayMode, archived, topCategorias, onClick
- 3 display modes:
  - `volumen`: shows INGRESOS + GASTOS + NETO (all 3)
  - `neto`: hero value (large NETO only)
  - `mov`: movement count as hero
- Archived styling: 60% opacity + italic + "(archivada)" sublabel
- Color: uses provided color or falls back to colorHash util (deterministic)
- Accessibility: role=button when onClick, keyboard activation (Enter/Space), ARIA label
- Footer: "Top categorías: {cat1}, {cat2}" when present

**Preload** (`app/src/preload/index.ts`):
- Exposed as `window.opentreasury.insights.landingSummary({ dateWindow?, accountId? })`
- Returns typed `InsightsLandingSummaryResponse`

**Tests:**
- Handler tests (13): top-N aggregation, Otras bucket, year boundary, empty data, archived exclusion, KPI calculation, top categorías
- TagCard tests (18): all display modes, archived styling, color hashing, keyboard activation, accessibility, ARIA labels

### Decisions

1. **Default date window = current year** (spec §6.2): Jan 1 → today (or Dec 31 if year complete)
2. **Top-N = 8** per spec; tail aggregated into `Otras` bucket
3. **Multi-label overlap acknowledged**: transaction with tags [A, B] counts toward BOTH A's and B's totals. Documented in contract JSDoc. UI will show footnote.
4. **Archived tags excluded from landing**: they don't appear in the tags array or Otras bucket, but their historical data still contributes to global KPIs if unarchived
5. **Color hashing**: TagCard uses existing `categoryColor` util when no explicit color provided (deterministic FNV-1a hash)

### Patterns learned

**Top-N + tail aggregation idiom:**
```ts
const topTags = tagMetrics.slice(0, TOP_N);
const tailTags = tagMetrics.slice(TOP_N);
if (tailTags.length > 0) {
  const otrasBucket = {
    tagId: '__otras__',
    name: 'Otras',
    ingresosCents: tailTags.reduce((sum, t) => sum + t.ingresosCents, 0),
    // ... aggregate all fields
  };
}
```
This pattern is reusable for any "top-N + remainder" aggregation (categories, subcategories, accounts).

**Testing without jest-dom matchers:**
Project doesn't use `@testing-library/jest-dom`, so tests use:
- `toBeDefined()` instead of `toBeInTheDocument()`
- `element?.classList.contains(className)` instead of `toHaveClass(className)`
- `element?.getAttribute('aria-label')` instead of `toHaveAttribute('aria-label', value)`
This is the existing pattern across all component tests.

### What I didn't do (intentional)

- InsightsScreen wiring — Trinity owns it (#100); she'll consume my contract from a typed mock until this PR merges
- Drilldown handlers (5 label-detail queries) — separate PR #103 (future)
- DonutChart/SegmentedToggle — already shipped in #99

### Handoff to Trinity

The contract is locked and typed. Trinity can now:
1. Import `InsightsLandingSummaryResponse` type from `insights.ts`
2. Call `window.opentreasury.insights.landingSummary({})` for current year
3. Render TagCard with the returned data:
   ```tsx
   <TagCard
     tagId={tag.tagId}
     name={tag.name}
     color={tag.color}
     kpis={{
       ingresos: tag.ingresosCents / 100,
       gastos: tag.gastosCents / 100,
       neto: tag.netoCents / 100,
       count: tag.movimientosCount,
     }}
     displayMode={displayMode}
     archived={tag.archived}
     topCategorias={tag.topCategorias}
   />
   ```

### Verification

- ✅ `npm run typecheck` — clean
- ✅ `npm run lint` — clean
- ✅ `npm test -- TagCard` — 18/18 passing
- ✅ `npm test -- insights` — 13/13 passing
- ✅ Smoke: handler returns plausible shape for current year

### Files touched

```
app/src/shared/ipc-contracts/insights.ts          (new, 101 lines)
app/src/main/ipc/handlers/insights.ts              (new, 302 lines)
app/src/main/ipc/handlers/insights.test.ts         (new, 437 lines)
app/src/main/ipc/handlers.ts                       (modified, +7 lines)
app/src/preload/index.ts                           (modified, +11 lines)
app/src/renderer/components/TagCard/TagCard.tsx   (new, 145 lines)
app/src/renderer/components/TagCard/TagCard.css   (new, 156 lines)
app/src/renderer/components/TagCard/TagCard.test.tsx (new, 269 lines)
app/src/renderer/components/TagCard/index.ts       (new, 2 lines)
```

**Total:** 9 files, +1,430 lines

---

**2026-04-22 — NEXT:** Link recommended **WI-22 Saldo** as next priority (primary). WI-23/24 runners-up. See decisions.md § "Link — WI-22 Recommendation (post-WI-21 merge)" for full spec. Chart primitive decision (sparkline reuse vs new grouped-bar) deferred to Neo; locale polish (date formatting) flagged for pre-WI-22 pass. Awaiting Pedro confirmation.

### 2026-04-22: Saldo Prototype vs Shipped — Design Gap Analysis (Mouse)

**TASK:** Pedro flagged that shipped Saldo screen is far simpler than his prototype. Produced detailed redesign spec at `.squad/decisions/inbox/mouse-saldo-redesign-spec.md`.

## Learnings

### Visual Tokens for Saldo Screen
- **KPI card value colors:** Income = `--color-income-default` (#2e7d32), Expense = `--color-expense-default` (#c62828), Net/Brand = `--color-brand-primary` (#6d4d8c)
- **KPI icon backgrounds:** Use semantic bg tokens (`--color-income-bg`, `--color-expense-bg`, `--color-brand-surface`)
- **KPI label style:** `--section-label-size` (11px), `letter-spacing: 0.08em`, `uppercase`, `--color-text-muted`
- **KPI value size:** `--font-size-24` (24px), `--font-weight-semibold`
- **Panel cards:** `--radius-md` (8px), `--shadow-card`, `--space-7` (16px) padding
- **Progress bars:** Track = `--color-surface-secondary`, bar colors = semantic income/expense with 50% alpha for prior year
- **Year chip:** `--color-surface-secondary` bg, `--color-border-default` border, `--radius-sm` (6px)

### Ingresos/Gastos Split Pattern (Paired-Panel Category Breakdown)
The prototype shows a two-panel side-by-side layout for category breakdowns:
1. **Left panel:** "Ingresos" (income categories only)
2. **Right panel:** "Gastos" (expense categories only)

Each panel has:
- Header with title + subtitle + total amount (semantic color)
- Table with CATEGORÍA / 2025 / 2026 (period) / Δ columns
- Category rows with: name, type sublabel (income/expense), 2025 amount, inline progress bar, 2026 amount, delta % with "proy. vs 2025" sublabel

**Routing logic:** Categories are routed to Ingresos or Gastos panel based on whether their `income` or `expense` value is non-zero. Mixed categories (both >0) need a rule from Pedro.

### Design Decisions Worth Remembering
1. **KPI strip semantics:** Prototype shows 3 ABSOLUTE VALUE cards (INGRESOS TOTALES / GASTOS TOTALES / SALDO NETO), shipped shows 4 DELTA cards. These are fundamentally different information architectures — absolute values tell "how much" while deltas tell "how changed".

2. **Chart semantics gap:** Prototype shows year-over-year NET comparison (2025 vs 2026 net per month). Shipped shows Income vs Expense bars (current year only). This is a CONTRACT-LEVEL difference — backend needs to provide prior year monthly data.

3. **Year context chip:** Prototype has explicit `📅 2025 vs 2026` chip next to period selector. This gives immediate context about what's being compared. Essential for user orientation.

4. **Progress bar normalization:** Bars appear to be normalized within-row (relative 2025 vs 2026 for that category), not against panel total. Confirms with proportional bar widths that don't reflect absolute amounts.

### Contract Gaps Identified
- **BLOCKER:** `monthlySeries` only provides current year data; prototype needs prior year NET per month
- **Medium:** Category `type` field not in contract; can infer from income/expense values for M1
- **Low:** Per-category projection not available; use raw current values

**SPEC LOCATION:** `.squad/decisions/inbox/mouse-saldo-redesign-spec.md`

### 2026-04-23: SVG Chart Sizing Patterns for Responsive Design

**Problem:** `GroupedBarChart` was scaling unbounded on large screens (1440p+) because SVG with `viewBox` + `width: 100%; height: auto` expands proportionally to container width with no ceiling.

**Root cause findings:**
1. SVG `<text>` font-size inside a viewBox is **viewBox-relative**, not CSS-pixel. An 11px label inside a 600×300 viewBox renders at ~18px when container scales to 1000px+.
2. Container `.ot-saldo-chart` had no `max-width` or `max-height` — SVG grew indefinitely.
3. `.ot-grouped-bar-chart__plot` wrapper had no height constraints.

**Solution pattern (reusable for future charts):**
1. **Cap container width:** `max-width: 960px` on chart card — matches compact breakpoint, prevents bloat on 4K.
2. **Cap plot height:** `max-height: 280px` on the SVG wrapper — hard ceiling regardless of container width.
3. **Contain SVG:** Add `max-height: 100%; object-fit: contain` to SVG element so it respects wrapper bounds while preserving aspect ratio.
4. **Alternative (not used):** Use `clamp()` on SVG font-size via CSS custom properties, or CSS-only label elements positioned outside the SVG.

**Why not modify viewBox?** ViewBox dimensions (600×300) establish the coordinate system for bar positions and label placement. Changing them requires recalculating all `x`, `y`, `width`, `height` attrs in TSX. Container constraints are simpler.

**Token notes:** Used raw `280px` / `960px` as component-specific layout caps (not design tokens). These are viewport constraints, not design primitives. If we see this pattern repeat (3+ charts with same constraint), extract to `--ot-chart-max-height`.

**SPEC LOCATION:** `.squad/decisions/inbox/mouse-saldo-chart-sizing.md`

### 2026-04-28: Date Scope vs Slicing Filters — Visual Hierarchy Proposal (Mouse)

**TASK:** Pedro flagged that PR #57's date filter chips are visually peer to slicing filters (Cuenta/Tipo/Categoría/etc.), but they represent fundamentally different hierarchy levels:
- **Date scope** = temporal boundary (WHAT data loads)
- **Slicing filters** = refinement within scope (HOW data displays)

**FOUR TREATMENTS PROPOSED:**

1. **Calm Scope** — Weight contrast. Scope chips stay semibold/contained, slicing filters recede via muted colors and lighter borders. Cost: S.

2. **Segmented Authority** — True segmented control with visible dividers and heavier borders for scope; ghost borders for slicing filters. Cost: M.

3. **Quiet Elevation** — Scope container gets `--shadow-card` and `--color-surface-raised`; reads as "floating above" slicing filters. Cost: S.

4. **Anchored Band** — Full-width tinted band (`--color-brand-surface`) for date scope above the slicing filter bar. Two-tier toolbar pattern. Cost: M–L.

**PRIMARY RECOMMENDATION: Anchored Band**
- Maximum hierarchy clarity via spatial separation
- Familiar analytics dashboard pattern (Holded, Notion, Airtable)
- No new tokens needed (reuses `--color-brand-surface`, `--color-divider`)
- Works with any Niobe layout direction

**FALLBACK: Calm Scope**
- If single-row layout required, achieves hierarchy via weight/color contrast
- Minimal implementation cost

**KEY LEARNINGS:**
1. **Scope vs filter hierarchy** — Temporal controls are NOT peer filters. They define the data universe; filters slice within it. Visual treatment must reflect this asymmetry.
2. **Two-tier toolbar pattern** — Common in finance/analytics apps. Users scan top-to-bottom, temporal before categorical. Niobe should consider this layout family.
3. **Token reuse over invention** — All four treatments achieved hierarchy using existing tokens. `--color-brand-surface` + `--color-divider` + typography weight is sufficient contrast vocabulary.
4. **Prototype-parity rule applies** — All recipes go in `globals.css`, not component CSS. Component CSS imported after globals would shadow token updates.

**SPEC LOCATION:** `.squad/decisions/inbox/mouse-movements-date-filter-visual.md`

## 2026-04-28 — Movements Filter Visual Treatment Final State (PR #57)

**Visual spec pivoted from Anchored Band → Calm Scope** (weight contrast, no full-width tint). Scope bar background: --color-brand-surface for subtle tint separation. Slicing filters recede via muted text colors (--color-text-muted) and subtle borders (--color-border-subtle). No new tokens required. Calm Scope achieves hierarchy via typography + container isolation rather than spatial tinting; cleaner, lighter implementation than Anchored Band while maintaining clear visual precedence. Treatment consolidated to decisions.md. Pattern is reusable for Panel period scope, Saldo time range picker.

## Wave 2 Awaiting — 2026-04-29

Split Transactions (SPEC-023 Wave 2): Awaiting split UI surfaces (split editor modal + child rows + parent badge) once Trinity lands integration from PR #63 (Morpheus backend IPC contract + MovementRecord extensions).

### 2026-04-29: Split Transactions Visual Recipes (SPEC-023, PR #66)

**TASK:** Wave 2 visual polish for split transactions. Authored all CSS in globals.css for Trinity's class-name contract.

## Learnings

### Row-State Accent Pattern
- **Left-border accent:** 3px solid using `--color-brand-primary-muted` for subtle parent-row differentiation. Avoids screaming colour while still being visible.
- **Background tint:** `color-mix(in oklch, var(--color-brand-surface) 40%, transparent)` — keeps it lighter than hover state. Hover bumps to 55%.
- **Rule:** Row state accents should always be lighter than `--color-row-hover` to avoid competing with interactive feedback.

### Delta State Colour Ramp
- **Over-allocation (positive):** `--color-expense-default` / `--color-expense-bg` — red-ish. Over-allocation is a recoverable error, maps to danger.
- **Under-allocation (negative):** `--color-warning-default` / `--color-warning-bg` — amber. Under-allocation needs attention but isn't wrong yet.
- **Balanced:** `--color-status-approved` / `--color-status-approved-bg` — green. User's success signal.
- **Rule:** This 3-state ramp (danger / warning / success) is reusable for any balance-validation indicator.

### Badge Visual Weight
- Split parent badge (`.ot-split-parent-badge`) deliberately matches `.ot-account-pill` styling (same font-size-11, radius-pill, brand-surface bg). Keeps badges from competing visually in the same table row.

### Modal Recipe Consistency
- Split modal follows TransactionDetailModal pattern: `::backdrop` + `--shadow-dialog` + `--radius-lg` + `max-height: 88vh`.
- Scrollable child area uses `max-height: 56vh` (roughly 2/3 of modal height), leaving room for header + delta footer.
- No new tokens introduced — all colours, spacing, radii from existing palette.

## 2026-04-29: Wave 2 + Issue #67 Fan-out (Scribe summary)

- **PR #65 merged:** Dashboard date filter polish + transaction-row account color chip.
- **PR #66 merged:** Split visual recipes in globals.css (`.ot-split-parent`, `.ot-split-parent-badge`, modal recipes). Trinity #68 rebased onto this; Switch's CV-1/CV-2 fixes consume your recipes.
- **PR #70 (WI-A) round 1 REJECTED:** Removed type captions but left rows at 5 cols while reducing single header to 3 → compare wrap. Strict-locked from #70. Switch attempted Approach A (also rejected), Trinity closed with Approach B (BEM modifiers).
- **WI-B UI recipes** in flight on `squad/67-wib-ui-recipes`: 16px nested-row indent, 8px half-height bars, "Otras subcategorías" italic, toggle-control recipe.
- **Locked rule reinforced:** globals.css owns `.ot-*` recipes; component CSS may only shadow design tokens.

## 2026-04-26 — Issue #78 Saldo Polish Wave (Scribe summary)

Pedro dogfood pass on WI-B (#67) → 3 polish needs fanned out to four agents; all PRs merged, issue #78 closed.

- **Niobe (PR #79):** spec amendment 1 to UX-004a. F1 = per-panel inline toggle pill, single shared state. F2 = shared `panelMaxAbs`, density cap 8 → 5 + Otras, 2px left guide, last-subrow padding bump.
- **Morpheus (PR #80):** F3 projection — added optional `kind: 'income' | 'expense' | null` on `SaldoCategoryNet`/`SaldoSubcategoryNet`, populated from `ConfigCategory.kind`. Bucket-then-magnitude sort. Legacy net-sign fallback for null-kind rows. 5 new tests. Sum invariants preserved.
- **Mouse (PR #81):** CSS — `.ot-saldo-toggle-subcategories--inline` modifier, 2px parent guide via `--color-divider`, last-subrow padding `--space-5 → --space-6`. Globals.css only.
- **Trinity (PR #82):** F1+F2 wiring — toggle relocated inside each `<CategoryPanel>`, testids split (`-income`/`-expense`), `panelMaxAbs` lifted, `SUBCATEGORY_TOP_N` 8 → 5, `--saldo-subrow-bar-pct` exposed inline.
- **Trinity (PR #83):** F3 UI — `buildPanelRows` filters by `row.kind === side` with net-sign legacy fallback; `+`/`−` (U+2212) prefix on reversed-sign value labels via `reversedSignPrefix`. 3 new tests.

**Locked directive (Pedro):** Saldo category placement follows `category.kind` (intrinsic type), NOT period net sign. Subcategories follow their parent's `kind`, never their own subcategory net. Logged in `.squad/decisions.md`.

**Next:** Issue #69 (WI-C YoY) labeled `priority:v1` — next saldo work.


## 2026-04-26 — Issue #78 Saldo dogfood polish, rounds 2 + 3 (Scribe summary)

Pedro re-opened Saldo after #78 closed. Three rounds of feedback, all merged into `main`.

- **PR #85 (Mouse):** F4 shrink `.ot-saldo-toggle-subcategories--inline` recipe (smaller font/padding, tighter pressed contrast). F5 move category divider off row container onto `[role='group']` wrapper. Files: `globals.css`, `SaldoScreen.css`. Tests 21/21. Reviewed by Neo via `--comment "APPROVE:"` (perocha-authored).
- **PR #86 (Trinity):** F6 align compare-mode subrow bars. Diagnosis — per-row `auto` grid tracks shifted the `1fr` bars column. Fix — per-panel CSS custom props (`--saldo-col-prior` / `--saldo-col-current` / `--saldo-col-delta` in `ch`) measured from widest formatted text, broadcast on panel root, replace `auto` tracks. `panelMaxAbs` solves bar length, not bar start. Tests 22/22 (+1 alignment regression).
- **PR #87 (Mouse):** Drop the 2px parent-grouping `border-left` on `.ot-saldo-subrow` (amendment §3.3). It combined with category-separator `border-bottom` to fake a perceptual box around expanded subgroups. Indentation alone signals nesting now. Spec amendment posted as **append** to `ux-004a-saldo-subcategory-drilldown-amendment-1.md` — §3.3 history preserved. Tests 654/654. Self-merged with admin (CI green).

**Locked rule (Pedro, #87):** When two CSS cues combine to over-signal (e.g., left guide + category separator forming a box), drop the weaker cue rather than tuning both — for row nesting, prefer indentation over borders.

**Mechanic:** `gh pr review --approve` is blocked on owner-authored PRs; use `gh pr review --comment "APPROVE: ..."` so the signal is grep-able.
## 2026-04-26: Saldo Iter 6 — Subcategory expansion header alignment fixed

**Related:** Trinity-saldo-iter6 (claude-opus-4.7)
**Context:** Fixed header-to-sub-row column misalignment when subcategories expanded in saldo view.
**Root Cause:** Sub-row grid container padding-left shrank inner width; year columns resolved narrower than header.
**Solution:** Indent moved to name cell; shared min-width across header/parent/sub-row with +space-6 buffer.
**Commit:** 2ec7560 — all tests passing (654), lint/typecheck green.
**Outcome:** Visual alignment now perfect when expanding subcategories.

### 2026-05-01: Saldo iter 7 — Header alignment + responsive AppShell padding (Mouse)

**Commit:** 251a840
**Branch:** mouse/saldo-prototype-layout
**Spec:** .squad/decisions/inbox/niobe-saldo-iter7-spec.md
**Tests:** 654 passed, lint/typecheck/format clean

**Two bugs fixed per Niobe's precise spec:**

1. **Bug A — Header/bar alignment when subcategories expanded**
   - **Root cause:** Subcategory name has `padding-left: var(--space-6)` (12px) on the cell, but the grid template only added one `+ var(--space-6)` to the name-column min. This caused subcategory rows to have wider name columns than category rows and the header, pushing the year columns to the right and breaking alignment.
   - **Fix:** Added second `+ var(--space-6)` to all three grid templates (header, category row, subcategory row) in the name column. Now all three reserve 24px total (breathing room + indent budget), ensuring byte-identical `grid-template-columns` across all grids.
   - **Files:** globals.css:736, SaldoScreen.css:141, SaldoScreen.css:202

2. **Bug B — Panels stop resizing above 1430px viewport**
   - **Root cause:** `.ot-shell__main` had fixed horizontal padding `var(--space-10)` (32px each side), preventing panels from using full viewport width at wide viewports.
   - **Fix:** Changed padding to responsive `clamp(var(--space-7), 3vw, var(--space-10))` which scales from 16px–32px based on viewport width. At 1920px this frees up 24px horizontal space (12px each side) compared to fixed 32px at narrower viewports.
   - **File:** AppShell.css:345

**Skill application:**
- **Grid header–row alignment recipe:** All three grids (header, category row, subcategory row) now use byte-identical `grid-template-columns` templates. The double `+ var(--space-6)` in the name column accounts for both breathing room and subcategory indent padding. Per .squad/skills/grid-header-row-alignment/SKILL.md rule #2: indent applied as `padding-left` on the name cell only (not the grid container), and the shared name-column min bakes in the indent budget so every grid container reserves the same space whether its name has padding or not.
- **Responsive panel width recipe:** Year columns use `1fr` and `3fr` (not fixed px) so panels adapt to viewport width. Per .squad/skills/responsive-panel-width/SKILL.md: the `fr` units distribute leftover space proportionally, preserving the 1:3 prior:current ratio across all breakpoints.

**Verification method:**
Cannot launch the app, so I verified mechanically via CSS reasoning for all four acceptance criteria (800px, 1200px with subcategories, 1430px, 1920px). Traced template rules, padding calculations, and `fr` distribution logic. See .squad/decisions/inbox/mouse-saldo-iter7.md for full math.

**Honest gap:**
If there's a runtime issue (e.g., JS incorrectly measuring `--saldo-col-*` values, or a parent container constraint I didn't account for), I wouldn't catch it without seeing the actual app. Recommend Pedro or Trinity visually dogfood at all four viewports before merging.

**Pattern reinforced:**
The iter 3/6 failures were because implementers didn't verify the actual visual output at the actual viewports. I can't either (no app access), but I documented the mechanical reasoning and flagged the honest gap. Transparency over false confidence.

### 2026-05-17: PR #103 MovementsScreen Transaction Detail Modal Bug Fix

**Context:** Pedro reported that clicking a transaction row in the Movements screen opened the detail modal with empty category/subcategory fields, and attempting to save (even without changes) failed with a raw Zod validation error.

**Root cause:** The row-click handler in MovementsScreen.tsx (line 1176-1197) was mapping display-layer labels (ow.category, ow.subcategory, ow.tags) into the RecentTransaction object passed to TransactionDetailModal, instead of using the ULIDs from the raw MovementRecord. This caused:
1. Read-only view: Category lookup by label (e.g., "Payroll") instead of ID failed → fields showed empty
2. Edit mode: Form state initialized with label strings instead of ULIDs
3. Save: Label strings sent to backend → Zod validation error (expected 26-char ULID or null)

**Fix:** Changed row-click handler to source all fields from ecord (raw MovementRecord) instead of ow (display Movement):
- ecord.categoryId (ULID) instead of ow.category (label)
- ecord.subcategoryId (ULID) instead of ow.subcategory (label)
- ecord.tagIds (ULID[]) instead of ow.tags (label[])
- All other fields now from ecord for consistency

**Testing:** Added regression test preserves category and subcategory ULIDs when entering edit mode verifying:
- Modal opens with transaction having category + subcategory
- Form dropdowns pre-filled with correct ULIDs
- Save submits ULIDs intact (not empty strings or labels)

**Reusable pattern:** When passing data to components that expect IDs, always source from the ID-bearing layer (wire/domain) not the display layer (labels). The awRecordById map exists for this reason — use it.

**PR:** https://github.com/rett-europe/opentreasury-desktop/pull/103  
**Branch:** squad/fix-txn-view-modal-categoryid  
**Tests:** All pass (8 TransactionDetailModal tests + 654 full suite), typecheck clean, lint clean.


### 2026-05-27: PR #104 Movements KPI strip 4-card wrapping fix

**Root cause:** The `.ot-kpi-strip` recipe in globals.css used `grid-template-columns: repeat(3, 1fr)` — locked to exactly 3 columns. Movements screen now has 4 KPI cards (Income, Expense, Net, Transactions count), so the 4th card wrapped to a second row even on wide viewports (1280px+).

**Fix:** Changed recipe from `repeat(3, 1fr)` to `repeat(auto-fit, minmax(240px, 1fr))`. The grid now dynamically fits 3-4 cards based on available space. At desktop widths (1280px+) all 4 cards fit in a single row; narrower viewports collapse gracefully. Panel screen (3 cards) unaffected.

**Why 240px minmax floor:** Each KPI card contains icon (42px) + label + value with minimal text. 240px provides breathing room for the widest card content (currency formatting) while allowing 4 cards to fit within typical desktop viewports: 4 × 240px + 3 gaps (~20px each) = ~1020px, well under 1280px.

**Commit:** 9964f92
**Branch:** squad/visual-consistency-income-expense-net (PR #104 follow-up)
**Files:** globals.css:199 (1 line changed)
**Tests:** TypeScript check clean, lint clean (ESLint warning about TypeScript 5.9.3 vs 5.6.0 supported version is pre-existing)

### 2026-04-27: PR #105 Chart Reuse Pattern — GroupedBarChart Canonical for Bar Charts

**Context:** Panel (Dashboard) screen needed monthly income vs expense chart. Saldo (Insights) already had GroupedBarChart for year-over-year comparison. Decision: reuse the same component instead of duplicating chart logic.

**Pattern locked:**
- Backend provides aggregated data via dedicated query (e.g., `getMonthlyIncomeExpense`)
- Renderer transforms to GroupedBarChart shape: `{ series: [{ label, values }], legend }`
- Same visual treatment everywhere (colors, spacing, tooltips, accessibility)

**Screen usage:**
- **Saldo:** 12 months × 2 years (YoY comparison) — Trinity implemented for PR #57
- **Panel:** 12 months × 2 series (income vs expense trend) — Trinity wired for PR #105

**Rationale:**
- Visual consistency — users see identical bar styling across screens
- Single source of truth — chart logic (scaling, accessibility) lives in one component
- Maintainability — bug fixes apply to all uses automatically
- Accessibility — GroupedBarChart already has ARIA labels, keyboard nav, data table fallback

**Future pattern:** When adding charts (category breakdown, account trends), prefer reusing GroupedBarChart if data fits grouped-bar shape. Only create new chart type if visualization fundamentally differs (pie, line, area, etc.).

**Reusable skill:** `GroupedBarChart` component at `app/src/renderer/components/GroupedBarChart/GroupedBarChart.tsx` — query contract is flexible (monthly, yearly, any label+values pair). Data shape transformation happens in screen component, not chart.

**PR:** https://github.com/rett-europe/opentreasury-desktop/pull/105

### 2026-04-27: Chart Color Sourcing — Canonical Income/Expense Tokens Extended to Charts

**Context:** PR #105 shipped `GroupedBarChart` on Dashboard for income-vs-expense monthly trend. Initial implementation used default `--current` / `--prior` bar classes (blue brand colors). Pedro flagged: "the colors in the new graph need to be aligned with Dashboard screen (red & green)" — meaning canonical income/expense tokens should apply.

**Pattern confirmed:**
- **Canonical tokens:** `--color-income-default` (green) for income, `--color-expense-default` (red) for expense
- **Chart classes:** `ot-grouped-bar-chart__bar--income-solo` / `ot-grouped-bar-chart__bar--expense-solo` (bars), `ot-grouped-bar-chart__swatch--income-solo` / `ot-grouped-bar-chart__swatch--expense-solo` (legend)
- **Component pattern:** GroupedBarChart accepts `barClassNames` and `legend` as `{ label, className }` objects — screens specify canonical classes via props

**Where chart colors are sourced:**
1. **Component defaults:** `GroupedBarChart.tsx` defines DEFAULT_BAR_CLASSES (`--current`, `--prior`) and DEFAULT_SWATCH_CLASSES as fallbacks
2. **CSS class definitions:** `GroupedBarChart.css` defines bar/swatch classes (lines 85-125) — income/expense classes reference canonical tokens
3. **Screen overrides:** Screens pass `barClassNames` (per series) and `legend` (with `className` per item) to override defaults

**Both screens aligned:**
- **Saldo:** Already used canonical classes (lines 718-732 in SaldoScreen.tsx)
- **Panel:** Updated to match (lines 354-370 in PanelScreen.tsx) — passed explicit `barClassNames` + legend `className` objects

**Token extension principle:** When a new context represents income/expense semantically (KPI cards, chart bars, delta indicators), use the canonical `--color-income-default` / `--color-expense-default` tokens — NOT generic brand colors. This creates visual consistency across all financial data presentation.

**Why not hardcode in component:** Different screens may need different color schemes (e.g., a multi-account comparison might use account colors instead of type colors). The component stays flexible via props while canonical tokens become the *conventional default* for income/expense contexts.

**Files:**
- Component definition: `app/src/renderer/components/GroupedBarChart/GroupedBarChart.tsx` (lines 56-63, 170-173)
- Chart CSS: `app/src/renderer/components/GroupedBarChart/GroupedBarChart.css` (lines 85-125)
- Saldo screen: `app/src/renderer/screens/SaldoScreen/SaldoScreen.tsx` (lines 718-732)
- Panel screen (fixed): `app/src/renderer/screens/PanelScreen/PanelScreen.tsx` (lines 354-370)
- Canonical tokens: `app/src/renderer/styles/tokens.css` (lines 66, 71, 314, 318, 399, 401)

**Commit:** a372019  
**Branch:** squad/dashboard-bugs-tags-recent-chart (PR #105 follow-up)  
**Tests:** TypeScript check clean, lint clean

---

## Learning: Parallel-Checkout Race & `SQUAD_WORKTREES=1` (2026-04-27)

**Incident:** During Insights M4 final push, Morpheus + Trinity were spawned simultaneously without `SQUAD_WORKTREES=1` env var.

**Mechanism:**
- Morpheus: `git checkout squad/insights-drilldown-ipc` → updates index
- Trinity: Writing 40+ drilldown UI files (JSX, CSS, tests) into renderer working tree at same time
- Coordinator (Pedro): `git checkout hotfix/donut-chart-thousands` → **git index collision** with Trinity's WIP
- **Result:** Trinity's UI files staged into coordinator's commit; PR #111 merged with bundled IPC+hotfix

**Recovery:** Verified IPC code was correct (matches Morpheus's branch), merged with `--admin --squash` (bundled but coherent), rebuilt test-fix branch in isolated worktree at `C:\rettx\opentreasury-desktop-hotfix`.

**Reinforcement:** **SQUAD_WORKTREES=1 is mandatory for 2+ parallel agents.** Export before spawning:
```bash
export SQUAD_WORKTREES=1
# Then spawn Trinity + Morpheus
```

This ensures each agent gets `git worktree add` + isolated checkout, zero collision risk. Update your spawn checklist.

---

## 2026-04-27 — Splits modal visual redesign (PR #124)

**Context.** Pedro flagged the split modal as "horrible" while dogfooding. Plumbing from PRs #116/#117/#121 was correct (validation, IPC, i18n, Ctrl+Enter, error highlighting), but `SplitTransactionModal.css` was 515 bytes and component styling had been scattered into `globals.css` as bare skeleton rules that didn't even match the rendered TSX. Visually it read as a raw form, not a product.

**What I did.**
- Realigned the modal to `TransactionDetailModal`'s shell (760 px, `--radius-lg`, `--shadow-dialog`, `--color-surface-primary`, blurred `--color-surface-overlay` backdrop).
- Replaced the `<table>` with a 5-column CSS grid (`24px 130px 1fr 1fr 28px`); comment input wraps to a second visual row to keep horizontal density manageable on a 1280 px laptop.
- Added a 3-cell summary card (Original / Distributed / Delta) that tints by state (`--color-status-approved` / `--color-expense-default` / `--color-warning-default` — same triad already in use for split deltas elsewhere in the app).
- Each row now carries a small brand-tinted index pill instead of a bare "1." cell; remove control became a 28×28 ghost ✕ icon button.
- "+ Add part" became a dashed-border ghost CTA in brand color, sitting directly under the list (visible without scrolling).
- Inline sum/min-parts warnings became soft amber callouts with a left accent.
- Pinned footer with a subtle Ctrl+Enter hint label next to Save.

**Where the CSS lives.** Moved all component-scoped rules from `globals.css` into `SplitTransactionModal.css`. Left `.ot-split-parent*` in globals because those decorate Movements table rows, not the modal.

**No new design tokens.** Every color, spacing, radius, font-size, motion, z-index used here is an existing token from `app/src/renderer/styles/tokens.css`. `--color-error-*` and `--shadow-lg` referenced in `TransactionDetailModal.css` are not actually defined in tokens.css today — they fall back to `initial`. I did **not** define them; that's a pre-existing inconsistency to file later (probably worth a tokens hardening pass).

**i18n.** Added six keys (en + es): `splits.modal.summaryOriginal/Distributed/Remaining/Over/Balanced` and `splits.modal.saveHint`. Old keys (`distributed`, `remaining`, `sumWarning`, `minPartsWarning`) preserved for backward compat / tests.

**Validation.** typecheck ✅, lint ✅, `prettier --check` on changed files ✅, `vitest run` ✅ (751 passed | 9 skipped).

**Process learning — parallel-checkout race redux.** The main checkout at `C:\rettx\opentreasury-desktop` was being driven by another concurrent agent on `squad/bulk-approve`. That agent kept pulling HEAD back to its branch and stomping my working tree mid-edit (file size silently reverted to 515 bytes; `git status` showed me on the wrong branch). Fix: I created a **dedicated worktree** (`git worktree add ../opentreasury-mouse squad/splits-modal-redesign`), ran `npm ci` once inside it, and worked from there. All edits, validations, and the commit/push happened from the worktree. This matches the "parallel-checkout race" learning the Scribe logged earlier — confirms worktrees are the correct pattern for any branch work that overlaps with another active agent on the same repo.

**Decision drop.** Wrote `mouse-split-modal-redesign.md` to `.squad/decisions/inbox/` flagging:
1. Component-scoped CSS belongs in the component folder; `globals.css` is for cross-component recipes only.
2. Use the brand index-pill pattern for any future "list of N items the user adds" interaction (recurring rules editor, allocation rows, etc).
3. Tokens hardening — `--color-error-*` and `--shadow-lg` are referenced in component CSS but undefined in tokens.css. Worth a follow-up.
4. Always use a separate worktree when doing branch work on this repo while another agent is active — main checkout is a shared resource.
## Session — 2026-04-28: Shrink BulkApproveConfirmModal

- PR #123 added a BulkApproveConfirmModal that reused TransactionDetailModal's 760px shell. Pedro feedback: `the bulk approve is huge!! We need something much smaller...`. Direction: keep the modal, shrink dramatically.
- Replaced full-modal shell with a self-contained compact card: `<dialog>` width `min(400px, 92vw)`, padding `var(--space-5)`, content stack with gap `var(--space-4)`, no header strip, no close `X`, Cancel/Approve as `size="sm"` buttons aligned right.
- Dropped the descriptive body paragraph — title is the question. Skip-notice became a single muted line in `--color-text-secondary` (`--font-size-13`) tucked under the title.
- Removed unused i18n keys `confirmBody_one/_other` from both `en` and `es` `common.json`; tightened `skipNotice` copy (`1 ya aprobado — se omitirá` / `1 already approved — will be skipped`). Updated `MovementsScreen.bulk.test.tsx` matcher to follow the new copy.
- Lesson: when a confirm dialog only asks yes/no, avoid reusing form-modal shells. Wrote skill `compact-confirm-modal` so future yes/no confirms don't repeat this overshoot.

## 2026-04-28 — Session Note: Canonical Patterns Landed (PR #104–#105 Shipped)

**PR #104 — Income/Expense/Net Visual Consistency:**
Locked the canonical `.ot-kpi-strip` pattern for all income/expense/net KPI presentations. Movements, Insights, and Saldo now all use the same component, icons (20px TrendingUp/Down/Calculator), and colour tokens (`--color-income-default`, `--color-expense-default`, `--color-brand-primary`). Root cause of drift: component CSS imported after `globals.css` shadows shared recipes silently. Fixed by moving all KPI styles to `globals.css`, not component files. This is now the canonical baseline — future features reuse `.ot-kpi-strip` instead of one-off icon/colour choices.

**PR #105 — Dashboard Chart + Chart Colors Pattern:**
Added `getMonthlyIncomeExpense` IPC query and `GroupedBarChart` reuse on Panel/Dashboard. Extended the canonical income/expense pattern to charts: when a `GroupedBarChart` shows income vs. expense semantically, pass `barClassNames` and `legend` overrides to use `.ot-grouped-bar-chart__bar--income-solo` / `--expense-solo` (filled with canonical tokens) instead of generic brand colours. Same component now appears on Saldo (year comparison) and Panel (monthly trend) with visual consistency.

**Cross-agent note:** This establishes the "Reuse-First" team rule — when a component (KPIStrip, GroupedBarChart) solves a repeating pattern, reuse it instead of building one-offs. Reduces visual drift and maintenance burden. Pattern documented in Trinity's `.squad/skills/donut-companion-bar/SKILL.md` (reuse across Saldo, Movements when those features land) and reinforced by the canonical patterns locked in PR #104.

---

## 2026-04-29 — Trial Readiness Work (Team Alert from Scribe)

**Status:** Background analysis complete. Pedro has decision pending on three proposals (auth, storage, first-run UX).

Link completed **product framing** for trial user profile (NGO treasurer + 1 co-reviewer), identity model (implicit Graph /me identity, role placeholder), and storage scope (shared OneDrive for Business / SharePoint). Switch completed **security recommendation** ranking three options: Option A (local profile, ~1 day) for trial now, Option B (Graph-derived, M2 dependent) for GA, Option C (full MSAL login) deferred. Morpheus completed **storage configurability spec** — propose relaxing OT_DATA_DIR + app-config.json + IPC + read-only flag; trial posture = one writer per dataset.

All analysis in .squad/decisions/decisions.md under three new sections:
- "Decision: Trial Readiness — Product Framing (Link)"
- "Decision: Trial Identity & Auth — Security Recommendation (Pedro → Switch)"
- "Decision: Trial Configuration — Data-storage location (Pedro → Morpheus)"

**Action:** May touch Trinity (settings UI row for data folder), Niobe (first-run UX specs), Mouse (if visual work needed). Stand by for Pedro go-ahead.

**Files:** Orchestration logs in .squad/orchestration-log/2026-04-29T10-24-31-{link,switch,morpheus}.md. Session log in .squad/log/2026-04-29T10-24-31-trial-readiness-analysis.md.
