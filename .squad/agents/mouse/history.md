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
