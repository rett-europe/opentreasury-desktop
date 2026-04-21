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

