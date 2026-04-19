# Prototype Fidelity Audit

> **Status:** Draft v1 · **Owners:** Neo (Lead/Architect) + Link (Product Manager)
> **Date:** 2026-04-19
> **Branch:** `fix/prototype-fidelity-audit`
> **Requested by:** Pedro
> **Scope:** Audit the M1 implementation (`app/src/renderer/**`) against the hi-fi prototype (`prototype/**`), name every gap, assign owners, and codify the prototype as the v1 visual + interaction contract.

---

## 1. Acknowledgment

[Link] Pedro — you're right. We drifted. The prototype under `prototype/` is the contract we were given on day one, and the shipped UI does not read like it came from the same family. You were polite about it; we're not going to hedge in return. A lot of the primitives we built are usable ("quite a few options look amazing" — heard, and thank you), but the overall shape, chrome, typography, and data density on the Movements screen, plus two entire screens missing (Panel, Saldo), put us on a different trajectory than the prototype. That's on Product for not enforcing the reference hard enough.

[Neo] Architecturally the code is sound — the tokens layer, component kit, i18n wiring, theme seam, and state machine for Movements all hold up. But the values those tokens carry, and the surfaces we composed with them, were not extracted from the prototype. We translated from the design system, and the design system had already diverged. That's a routing and process failure I own. The fix is not a rewrite; it's re-sourcing tokens and rebuilding the two screens we substituted with "Coming soon" placeholders.

---

## 2. The Rule — Prototype as North Star

[Neo] Codifying plainly, for this repo, at this project stage:

> **The `prototype/` folder is the v1 visual and interaction contract.**
> **The design system in `docs/design/` is a translation layer, not an authority.**
> **When the design system and the prototype conflict, the prototype wins — and the design system is updated to match, not the other way around.**

Deviations require one of the following, logged in `.squad/decisions.md`:

1. **Technical impossibility** — Neo files a note with the specific Electron / web-platform / a11y constraint that blocks parity, and proposes an approved alternative.
2. **Accessibility gap in the prototype** — Switch or Niobe files a WCAG-cited deviation; the prototype gets updated if feasible, the implementation updates otherwise.
3. **Explicit product decision** — Link + Pedro sign off in writing; logged as a decision with rationale.

[Link] Ratified from Product. No deviation gets silently baked into the implementation via a design-system token change, a charter update, or a spec edit. The path is: **question the prototype → log a decision → then change the code**. In that order.

[Link] This also means: if a feature is in the prototype and **not** in the PRDs, the **PRDs need updating, not the prototype trimmed**. The PRDs already defer implementation scope (e.g., M1 vs M2 vs v1.x); they do not have license to trim *visual* scope.

---

## 3. Fidelity Gap Analysis

Severity key: 🔴 blocker (ship-stopper, visibly wrong) · 🟡 important (noticeable drift) · 🟢 polish (tidy before GA).

Values and classes cited below are extracted directly from [prototype/styles.css](prototype/styles.css), [prototype/shell.jsx](prototype/shell.jsx), [prototype/panel.jsx](prototype/panel.jsx), [prototype/movimientos.jsx](prototype/movimientos.jsx), and [prototype/saldo.jsx](prototype/saldo.jsx). Current values cited from [app/src/renderer/styles/tokens.css](app/src/renderer/styles/tokens.css), [app/src/renderer/screens/AppShell/AppShell.tsx](app/src/renderer/screens/AppShell/AppShell.tsx), [app/src/renderer/screens/AppShell/AppShell.css](app/src/renderer/screens/AppShell/AppShell.css), and [app/src/renderer/screens/MovementsScreen/MovementsScreen.tsx](app/src/renderer/screens/MovementsScreen/MovementsScreen.tsx).

### 3.1 Typography

| Aspect | Prototype | Current impl | Delta | Severity |
|---|---|---|---|---|
| Primary font | `Inter` (Google Fonts), fallback Roboto/Helvetica/Arial | OS system stack: `Segoe UI Variable` → `Segoe UI` → `-apple-system` → … | **Different face entirely.** Inter's x-height, numeral shapes, letter-spacing are visibly different from Segoe/SF. | 🔴 |
| Font-feature-settings | `'cv11', 'ss01'` (Inter stylistic sets) | none | Prototype has a specific glyph variant locked; we have default. | 🟢 |
| Scale steps | xs 11 · sm 12 · body 14 · md 16 · lg 20 · xl 24 · 2xl 28 · 3xl 34 | micro 11 · caption 12 · small 13 · body 14 · h3 16 · h2 18 · h1 22 · display 28 | **Steps missing (20, 24, 34), steps invented (13, 18, 22).** The 20/24 gap is where KPI values and section headings live in the prototype — we don't have those sizes. | 🔴 |
| Headline size (`h1`) | 28px (`--font-2xl`), weight 600, letter-spacing −0.01em | 22px, weight 600, no letter-spacing | Page titles (Panel, Movimientos, Saldo) render ~21% smaller than prototype. | 🟡 |
| KPI value size | 24px (`--font-xl`), weight 600, `font-variant-numeric: tabular-nums`, letter-spacing −0.01em | 22px (closest token; not used on KPIs yet because the KPI strip isn't built) | Will be wrong when Panel/Saldo ship unless tokens are fixed first. | 🔴 |
| Section label convention | `text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; color: muted; font-size: 11px` — used as `.section-label` on every group heading | No equivalent utility or class | Every `section-label` in the prototype (Saldos por cuenta · Resumen del mes · Últimos movimientos · Categoría·2025·2026·Δ) is unrepresented. | 🔴 |
| Tabular numerics on financial cells | Yes (`font-variant-numeric: tabular-nums`) | Yes (`.ot-tnum`) ✓ | Match. | ✅ |

### 3.2 Color palette

| Aspect | Prototype | Current impl | Delta | Severity |
|---|---|---|---|---|
| Brand primary | `#6d4d8c` | `#6d4d8c` ✓ | Match. | ✅ |
| Brand surface (accent-subtle) | `#f3edf8` | `#ede4f2` | Different lilac; prototype is warmer and lighter. | 🟡 |
| Brand surface hover | `#ebe3f1` | not tokenized | Hover state on nav items and soft buttons is wrong. | 🟡 |
| Brand primary-light (hover for primary btn, light) | `#9c7cb5` | `#5a3d75` (hover is *darker*) | **Hover direction inverted.** Prototype lightens; ours darkens. Changes the whole brand feel. | 🔴 |
| Brand primary-muted (for 2025 bars, dark accents) | `#b8a5cc` | not tokenized | Saldo 2025-vs-2026 chart cannot be rendered to spec. | 🔴 |
| App background | `#faf8fc` | `#faf7fc` | Near-miss (negligible). | ✅ |
| Surface panel (tinted) | `#f8f4fb` | `#efe8f4` (sunken) | Our "sunken" is noticeably deeper than prototype's panel. | 🟢 |
| Border | `rgba(109, 77, 140, 0.14)` — **purple-tinted alpha** | `#e1d6ea` — flat hex | Different paradigm: prototype's borders inherit brand hue; ours are a fixed color. Visible on cards/dividers. | 🟡 |
| Divider | `rgba(109, 77, 140, 0.10)` | `#ede4f2` (subtle) | Same issue as border. | 🟡 |
| Row hover | `rgba(109, 77, 140, 0.04)` | not tokenized (no table rows built yet with hover) | Table row hover on Movements will not match. | 🟡 |
| Income (`--clr-income`) | `#2e7d32` on `#e8f5e9` | `#1e7a2c` on `#e4f4e7` | Darker, less saturated in our impl. Noticeable but acceptable. | 🟢 |
| Expense (`--clr-expense`) | `#c62828` on `#ffebee` | `#b81f1f` on `#fbe4e4` | Same — slightly off. | 🟢 |
| Status pending badge | `#e65100` on `#fff3e0` (prototype uses this for the `badge-pending` surface) | **Not tokenized — design decision "no pending tone anywhere" was made in the design system** | **Policy conflict: prototype ships pending badges on Movements (Pendiente / Aprobado). Our design system explicitly removed the tone. This has to be reconciled — and per the north-star rule, the prototype wins unless Link+Pedro sign off otherwise.** See §4 below. | 🔴 |
| Text primary | `#231f27` | `#1a1420` | Ours is noticeably darker/bluer. | 🟢 |
| Text muted | `#6b6178` | `#645872` | Close. | ✅ |
| Dark-mode body background | Radial gradient overlay `radial-gradient(circle at top left, rgba(166,132,193,0.18), transparent 28%) + linear-gradient(180deg, #18131d 0%, var(--clr-bg) 100%)` | Flat `#120e17` | Dark mode loses the prototype's signature brand-lit ambient corner. | 🟡 |

### 3.3 Spacing, radius, elevation

| Aspect | Prototype | Current impl | Delta | Severity |
|---|---|---|---|---|
| Spacing steps | 2 · 4 · 6 · 8 · 10 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 | 0 · 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 | **Missing 2, 6, 10.** Prototype uses 6px and 10px for filter-input padding and user-strip gap. Ours can't express them without raw values. | 🟡 |
| Radius | xs 4 · sm 6 · md 8 · lg 12 · **pill 16** | xs 2 · sm 4 · md 6 · lg 10 · **pill 9999** | **Every step is 2px smaller; pill is wrong paradigm.** Prototype's "pill" is a 16px-rounded rectangle used for account-pills and badges; ours is a full-round shape. Cards (`lg`) are 10px vs 12px — noticeable on cards. | 🔴 |
| Main content padding | `24px 32px` | Not enforced in AppShell main grid area | Page content hugs edges differently. | 🟡 |
| Card shadow | Two-layer purple-tinted: `0 1px 3px rgba(109,77,140,0.08), 0 1px 2px rgba(109,77,140,0.06)` | Two-layer neutral: `0 1px 2px rgba(26,20,32,0.06), 0 1px 3px rgba(26,20,32,0.04)` | Prototype shadows inherit brand tint; ours are neutral gray. Perceptibly different "materiality". | 🟡 |
| Card hover shadow | `0 4px 12px rgba(109,77,140,0.12), 0 2px 4px rgba(109,77,140,0.08)` | Not defined for cards | Account-card hover on Panel will not lift. | 🟡 |
| Transition timings | `fast 120ms` / `normal 200ms` | `instant 80 / fast 140 / base 220 / slow 340` | Different curve namespace; hard to map 1:1 when porting. | 🟢 |

### 3.4 App shell / chrome

| Aspect | Prototype | Current impl | Delta | Severity |
|---|---|---|---|---|
| Topbar height | **60px** | **56px** | 4px shorter. Small on its own but combined with padding differences gives a visibly tighter chrome. | 🟡 |
| Topbar contents | menu-toggle icon · brand (diamond mark `<path d="M12 2 L22 12 L12 22 L2 12 Z"/>`) + "OpenTreasury" · vertical divider · "Demo NGO" muted label · spacer · **search input (`⌘K` kbd)** · settings icon · tweaks icon | brand (Lucide `Scale` icon in accent-filled square) + "OpenTreasury" · spacer · **language toggle (ES/EN)** · **theme toggle (system/light/dark)** | **Completely different topbar.** Missing: menu toggle, NGO name label, global search (with ⌘K hint), settings, tweaks. Present-but-not-in-prototype: ES/EN toggle, theme toggle. Also: brand mark is a diamond in prototype, a square-bg Scale icon here. | 🔴 |
| Sidebar width | 240px | 240px ✓ | Match. | ✅ |
| Sidebar collapsed width | 64px (via `body.sidebar-collapsed`) | 64px via `@media (max-width: 960px)` only | Ours is responsive-only, not user-toggleable. | 🟡 |
| Sidebar sections | **Three sections with labels:** `Principal` (Panel · Movimientos · Saldo), `Configuración` (Categorías · Etiquetas · Cuentas), `Datos` (Importación · Exportar) — **8 nav items total, with uppercase section headers** | **No sections, only 3 items** (Panel · Movements · Balance) | **Missing 5 nav items and all 3 section headers.** The prototype's sidebar is a meaningful IA taxonomy; ours is a stub. PRD scope (M1) only implements 3 screens but the *nav chrome* needs all 8 with disabled/placeholder destinations. | 🔴 |
| Sidebar active state | `background: var(--brand-surface); color: var(--brand-primary); font-weight: 500` — lilac pill | `background: var(--color-accent-subtle); color: var(--color-accent-default); font-weight: 600` | Close pattern, but different tokens produce a visibly different tint. | 🟡 |
| Sidebar footer — **user strip** | **Present:** 32px purple avatar with initials (PR) · "Pedro Rocha" name · "ADMIN" role (uppercase, muted, letter-spaced) · logout icon | **Absent** | Missing entirely. The user strip is a prominent visual anchor in the prototype sidebar. | 🔴 |
| Nav section label styling | uppercase · 11px · letter-spacing 0.08em · muted · padded | No equivalent pattern | Same miss as §3.1 section-label. | 🔴 |

### 3.5 Panel screen (Dashboard)

| Aspect | Prototype | Current impl | Delta | Severity |
|---|---|---|---|---|
| Entire screen | Full implementation: page header (h1 "Panel" · subtitle · "Abril 2026" outline button · "Nuevo Movimiento" primary button) · `Saldos por cuenta` section with 5-column account-card grid (sparklines, colored icons, balances) · `Resumen del mes` 3-KPI strip (Ingresos/Gastos/Neto) · `Ingresos vs. Gastos · Últimos 12 meses` bar chart card · `Últimos movimientos` recent-tx table (8 rows, read-only) with "Ver todos →" footer link | **`<ComingSoonScreen />` placeholder — single "Coming soon" `<EmptyState>`** | **Screen not built.** Per [app/src/renderer/App.tsx](app/src/renderer/App.tsx) lines 17–25, `panel` and `balance` both render the placeholder. | 🔴 |

### 3.6 Movements screen (Movimientos)

This is the one we did ship, so the delta is richer.

| Aspect | Prototype | Current impl | Delta | Severity |
|---|---|---|---|---|
| Page header | h1 "Movimientos" · subtitle `{N} de {M} movimientos` · **right side: `Exportar` outline button + `Nuevo Movimiento` primary button** | h1 "Movements" (EN/ES-switchable) · no "Exportar" button · no "Nuevo Movimiento" button | Missing both right-side buttons. Spec says hide Exportar in M1 (UX-003 Q2 recommendation) — still open; `Nuevo Movimiento` is M1 PRD-004 per roadmap. Currently no CTA on the page. | 🟡 |
| Empty-on-open behavior | **NOT enforced — auto-loads all transactions** (prototype violates this rule) | **Correctly enforced** — `range-not-selected` is the initial state (UX-003 PR1) | **Current is correct. Prototype is wrong here.** This is the one deliberate deviation — ratified in decisions.md (2026-04-19 "Transaction list starts empty"). Keep current behavior; no change. | ✅ (intentional deviation) |
| Filter bar — row 1: type chips | Segmented chip-group: **Todos / Ingresos / Gastos** (active state has white bg + soft shadow) | Absent | Missing core filter. | 🔴 |
| Filter bar — account dropdown | `<select>` with bank icon prefix + "Todas las cuentas" + all accounts | Absent | Missing. | 🔴 |
| Filter bar — category dropdown | `<select>` with folder icon + categories | Absent | Missing. | 🔴 |
| Filter bar — month dropdown | `<select>` with calendar icon + 12 months | Absent | UX-003 Q6 recommends removing (duplicates range pill). Decision not yet logged. Currently absent — consistent with recommendation. | 🟢 (if Link ratifies removal) |
| Filter bar — min/max amount inputs | Two narrow numeric inputs (`min €` / `max €`) | Absent | Missing. | 🔴 |
| Filter bar — "Solo sin categorizar" toggle | Checkbox + label | Absent | Missing. | 🔴 |
| Filter bar — "Limpiar filtros" | Ghost button appears when any filter is active | Absent | Missing. | 🔴 |
| Date-range picker | **Not in prototype** (prototype auto-loads) | Present (preset chips + native date inputs) — **correct per UX-003 PR1** | Our addition; correct. Keep. | ✅ |
| Summary strip | **Inline horizontal row BELOW filter bar:** `INGRESOS {eur} · GASTOS {eur} · NETO {eur}` — uppercase labels, tabular nums, 13px — plus "N seleccionados" + inline bulk-action ghost buttons on selection | Present but shape may differ (built as totals strip inside MovementsScreen) | Need to verify visual shape: inline single-row vs stacked. Likely close; confirm during rebuild. | 🟡 |
| Table: selection column | Checkbox column (width 32px); header checkbox toggles all | Absent | Missing — blocks bulk-select UX. | 🔴 |
| Table: type arrow column | 22×22 circle badge with `↑` (income, green) or `↓` (expense, red) on tinted bg | Inline Lucide arrow-up/down inside amount cell, no circular badge | Different visual vocabulary. Prototype uses a **typed icon badge** as its own column; we inline a tiny Lucide icon with the amount. | 🟡 |
| Table: account cell | `<span class="account-pill">` — pill with **colored dot** (account color) + short name, using `color-mix(in oklch, {account-color} 18%, transparent)` as bg | Plain text account name | Missing. Account-color system (per-account hex on data.js) not carried into the impl. | 🔴 |
| Table: observaciones (description) | Truncated via `text-overflow: ellipsis; white-space: nowrap; max-width: 280px` | Present (render via Table primitive) | Verify truncation behavior. | 🟡 |
| Table: categoría column | Category name OR `Sin categorizar` badge (muted, italic, rounded-pill) | Present but combined with subcategoría as `"Category › Subcategory"` string | **Different shape — prototype keeps categoría and subcategoría as separate columns.** | 🟡 |
| Table: subcategoría column | Own column, muted color, em-dash for null | **Merged into category column** | Missing as distinct column. | 🟡 |
| Table: etiquetas column | Tag chips using `color-mix(in oklch, {tag-color} 35%, transparent)` | Absent | Missing. | 🔴 |
| Table: estado column | **Pendiente / Aprobado badge** (`badge-pending` orange / `badge-approved` green) | **Deliberately removed by design-system v0.1 decision ("no `pending` tone anywhere")** | **Conflict with the prototype.** Per the new rule, the prototype wins unless Link+Pedro sign off. Flag for explicit decision. | 🔴 |
| Table: importe column | Right-aligned, tabular, colored (income green / expense red), weight 600 | Right-aligned, tabular, colored, Lucide arrow prefix inside cell | Close. Main delta: we inline a Lucide arrow; prototype's arrow is in a separate type-arrow column. | 🟢 |
| Table: row hover | `background: rgba(109,77,140,0.04)` | Needs verification; likely absent | Check on rebuild. | 🟡 |
| Table: sortable columns | Prototype has none; UX-003 states sortable | Implemented (asc/desc/null cycle) | Our addition per UX-003. Keep. | ✅ |
| Data density | Cell padding `12px 12px` · row height ~44px · 10 columns | Lower (Table primitive spec is closer to `16px`) | Feels less "spreadsheet-like" than prototype. | 🟡 |

### 3.7 Saldo screen (Balance)

| Aspect | Prototype | Current impl | Delta | Severity |
|---|---|---|---|---|
| Entire screen | Full implementation: page header (h1 "Saldo" · subtitle · `Mes/Trimestre/Año` segmented control · `2025 vs 2026` calendar pill · `Exportar` button) · 3-KPI strip (Ingresos totales / Gastos totales / Saldo neto + "proy. 2026" sublines) · `NetComparisonChart` (side-by-side bars per month 2025 vs 2026) · **2-column card grid**: left `YearComparePanel` for Ingresos, right for Gastos — each with 4-column YoY table (Categoría · 2025 · 2026 · Δ) + per-row horizontal bar + delta arrow | **`<ComingSoonScreen />` placeholder** | **Screen not built.** | 🔴 |

### 3.8 Iconography

| Aspect | Prototype | Current impl | Delta | Severity |
|---|---|---|---|---|
| Icon library | **Inline SVGs hand-authored in prototype's `Icon` component** (minimal 24×24 viewbox, stroke 1.75, round line caps/joins) | **Lucide React** (stroke 2 by default) | Two different icon sets. Visually close for common icons (calendar, search, folder) but distinguishable stroke weight and proportions. | 🟡 |
| Brand mark | Filled purple **diamond** SVG (`<path d="M12 2 L22 12 L12 22 L2 12 Z"/>`) | Lucide `Scale` icon inside a filled accent-default square | **Wrong mark entirely.** Prototype's mark is a rotated filled square (diamond); ours is a scale icon. | 🔴 |
| Nav icons | `panel` (rect with vertical line) · `list` (with bullet dots) · `scale` (custom arrow-weighted scale) · `folder` · `tag` · `bank` · `upload` · `download` | Lucide `LayoutDashboard` · `ArrowLeftRight` · `Scale` | Conceptually close for our 3 items; 5 items unrepresented. `ArrowLeftRight` for Movimientos reads differently than the prototype's bullet-list icon (prototype says "a list"; ours says "a swap"). | 🟡 |

### 3.9 Empty states & micro-copy

| Aspect | Prototype | Current impl | Delta | Severity |
|---|---|---|---|---|
| Movements empty (no filter match) | Table body shows one row: `No se encontraron movimientos con los filtros actuales.` (muted, centered, 48px padding) | EmptyState primitive with title+body | Need to verify exact copy + use the table-inline pattern. | 🟡 |
| Placeholder screens | `<PlaceholderScreen>` per route: diamond glyph + `"Este prototipo se centra en Panel, Movimientos y Saldo…"` muted copy | `<ComingSoonScreen>` — wraps `<EmptyState>` | Different aesthetic; acceptable until Panel/Saldo land. | 🟢 |

### 3.10 Interactive details

| Aspect | Prototype | Current impl | Delta | Severity |
|---|---|---|---|---|
| Primary button hover | Lightens to `--brand-primary-light` (#9c7cb5) | Darkens to `--color-accent-hover` (#5a3d75) | **Inverted hover direction** — prototype lightens on hover, we darken. | 🔴 |
| Outline button hover | `border-color: var(--brand-primary-light); color: var(--clr-text-primary)` | Needs verification | Likely off. | 🟡 |
| Focus ring | Not explicit in prototype styles.css (native browser focus) | Explicit `outline: 2px solid var(--color-focus-ring); outline-offset: 2px` | **Our focus ring is better a11y.** Keep, but confirm it doesn't visually fight the prototype's calmer look on hover. | ✅ (deviation justified by a11y) |
| Card hover lift | `box-shadow` transitions to hover layer | Not wired to Card primitive yet | Missing. | 🟡 |
| Fade-in on route | `.fade-in` class on every screen root — fade + translateY transition | Absent | Missing micro-motion on route change. | 🟢 |

### 3.11 Data density & layout summary

The prototype is **denser, more data-forward, and more chromatically committed to its brand purple** across every surface (purple-tinted borders, shadows, row-hover, backgrounds). The current implementation is **lighter, airier, uses neutral borders/shadows, and omits the structural scaffolding** (section labels, user strip, 8-item sidebar taxonomy, global search) that gives the prototype its "app" feel. The shipped Movements screen is, in isolation, usable — but it reads like it belongs to a different product than the prototype.

### 3.12 Severity roll-up

- 🔴 **Blockers:** 20 (font face, missing scale steps, pill radius, missing radius steps at −2px each, section-label convention, topbar chrome, sidebar sections + 5 missing items, sidebar user strip, brand mark, Panel screen, Saldo screen, filter bar chips+4 controls+clear button, selection column, account pill, tags column, estado column policy conflict, brand primary-light + primary-muted missing, hover-direction inversion)
- 🟡 **Important:** 20 (headline size, other color near-misses, spacing step gaps, most elevation/transition/hover details, icon set, topbar height, responsive-only sidebar collapse, type-arrow column shape, category-vs-subcategory column merge, account dropdown month, data density, brand surface hover, nav active state tint, border/divider paradigm, dark-mode gradient, shadow tint, subcategory column, cell density, row hover, card hover lift)
- 🟢 **Polish:** 9 (font-feature-settings, panel surface depth, income/expense shades near-miss, text-primary shade, transition timings, amount-column icon placement, fade-in on route, placeholder-screen aesthetic, empty-state pattern)

Total tracked deltas: **49**. Not all need M1 treatment — see §5.

---

## 4. Root Cause

[Neo] Honest version, no hedging:

1. **Tokens were invented, not extracted.** Mouse's `tokens.md` v0.1 (Decision 2026-04-19 "Design System v0.1 shipped") declared a brand anchor of `#6d4d8c` "preserved from prototype" — which is literally one value out of sixty-plus. Every other color, spacing step, radius, typography size, and shadow was authored from the design-system perspective, not lifted from `prototype/styles.css`. The result is a design system that shares *one* color with the prototype.
2. **Niobe's prototype-analysis-v1.md treated the prototype as a "reference" rather than a "contract"** (see its §0: "Treat the prototype as a **UX contract for the three core screens** and as **visual language** for everything else"). The "visual language" framing opened a door that Mouse walked through — the design system became the sole authority.
3. **Trinity implemented against `docs/design/`, not against `prototype/`.** The Wave-1 implementation decisions in decisions.md (Trinity 2026-04-19) cite tokens and components from the design system; they do not cite prototype files. This is exactly what the routing should have prevented.
4. **I (Neo) routed past the prototype.** After Niobe's prototype-analysis landed, I treated the prototype as "analyzed" — archived context, not live reference. I should have pinned "prototype/ is a live input to every frontend spawn" and called it out explicitly in every frontend spawn prompt. I did not.
5. **No one opened the prototype in a browser next to the dev server.** This is the biggest tell. If a single frontend spawn had included "open `prototype/OpenTreasury Prototype.html` in a browser window side-by-side and match it", we would not be here. Spawn prompts asked agents to "follow the design system" — which had already diverged.
6. **Explicit prototype-contradicting decisions slipped through.** The `no-pending-tone` design-system decision and the Movements-column merge (category+subcategory) are concrete examples of the design system overriding the prototype with no corresponding entry in decisions.md. Those slipped because there was no rule saying "deviations must be logged".

[Link] Product side:

7. **PRDs didn't cite the prototype at the top.** PRD-001/002/003 reference the prototype loosely (as "the baseline") but don't anchor each acceptance criterion to a prototype surface. When acceptance criteria are abstract, implementers fill gaps with the nearest documented source — which was the design system.
8. **I didn't enforce a "prototype reference" block on UX specs.** Niobe's specs reference the prototype in prose but don't pin a specific `prototype/*.jsx:line-range` or `prototype/styles.css:selector`. That absence is what let "close enough" slip through.

---

## 5. Remediation Plan

Ordered by dependency: tokens must land before components; components before screens; screens before polish. Owners in brackets.

### 5.1 This week (gate: can we show Pedro a recognizable M1 next to the prototype?)

1. **[Mouse] Tokens v0.2 — re-extract from the prototype.** Produce `docs/design/tokens-v0.2.md` that **replaces** the invented values in v0.1. Every token gets a "Source" note citing the prototype file + line/selector (e.g., `--brand-primary-light: #9c7cb5 — source: prototype/styles.css :root --brand-primary-light`). In scope: full color palette (including `--brand-primary-light`, `--brand-primary-muted`, `--brand-surface-hover`, `--status-pending`/`--status-approved`, purple-tinted borders/dividers/row-hover), full spacing scale (add 2/6/10), radius scale (−2px on every step, `pill: 16px`), typography scale (add lg 20 / xl 24 / 2xl 28 / 3xl 34; drop invented 13/18/22 or demote to convenience aliases), elevations (card + card-hover with purple tint), motion (120ms fast / 200ms normal), `sidebar-w: 240px`, `topbar-h: 60px`. **Also: adopt Inter from a locally-bundled font file (not Google Fonts — offline-first principle).**

2. **[Trinity] Apply tokens-v0.2 across existing code.** Update `app/src/renderer/styles/tokens.css`, `globals.css`, and every component CSS. No component-shape changes this pass; just re-token.

3. **[Niobe] Add "Prototype Reference" block to every UX spec.** Block goes at the top, under the status line. Format:
   ```
   ## Prototype Reference
   - File: `prototype/movimientos.jsx`
   - Section: `MovimientosScreen` component (lines ~18–180)
   - Styles: `prototype/styles.css` → `.filter-bar`, `.tx-table`, `.chip-group`, `.filter-input`
   - Open alongside: `prototype/OpenTreasury Prototype.html`
   ```
   No UX spec is "complete" without this block. UX-001/002/003/004/005/006 all get backfilled this week.

4. **[Neo] Frontend PR template update.** Add mandatory checklist items:
   - `[ ] Opened prototype side-by-side with dev server while implementing`
   - `[ ] Before/after screenshots vs prototype attached for every changed surface`
   - `[ ] Any deviation logged in `.squad/decisions.md` with rationale`

   Block merge on missing items.

5. **[Link] Ratify the six prototype-vs-design-system conflicts.** Decide explicitly (prototype-wins unless documented otherwise):
   - Estado column on Movements — keep per prototype?
   - Pending/approved badge tone — reintroduce?
   - Movements `Exportar` header button — show disabled in M1 or hide?
   - Category + subcategory as separate columns — yes per prototype.
   - ES/EN toggle in topbar — keep (product addition, justified) or relocate to settings?
   - Theme toggle in topbar — keep or relocate?

   Each answer → entry in decisions.md, with either "prototype wins" or "product deviation signed off by Link + Pedro".

### 5.2 Next week (gate: Panel and Saldo visually match the prototype)

6. **[Trinity + Mouse, paired] Rebuild AppShell to prototype.** Topbar at 60px with menu-toggle · diamond brand mark · "Demo NGO" label · **search input with ⌘K** · settings + tweaks icons. Sidebar with three sections (Principal / Configuración / Datos) and 8 nav items (M1 screens route normally; M2+ routes disabled-with-tooltip). User strip at sidebar footer with avatar + name + role + logout. Where ES/EN + theme toggles land is resolved by §5.1 item 5.

7. **[Trinity] Rebuild MovementsScreen filter bar.** Type chips, account/category dropdowns, min/max inputs, uncategorized toggle, clear-filters. Keep the date-range gate (UX-003 PR1). Add selection column, tags column, estado column (pending §5.1 item 5 ratification), account pill with colored dot, type-arrow badge column, separate subcategory column.

8. **[Trinity] Build PanelScreen.** Account cards + sparklines, KPI strip, 12-month bar chart, recent-tx table. Per PRD-003 scope.

9. **[Trinity] Build SaldoScreen.** KPI strip, net-comparison chart, two YoY category panels. Per PRD-002 scope.

10. **[Niobe] Reconcile UX spec copy with prototype Spanish-primary strings.** Every user-facing string that appears in the prototype in Spanish becomes the canonical ES value in `locales/es/*.json`. EN is the fallback translation.

11. **[Link] Re-scope PRDs if features in the prototype aren't in the PRDs.** Confirmed gaps to reconcile:
   - Prototype has **Demo NGO** label → implies org-identity display on topbar → add to PRD-006 or new PRD.
   - Prototype has **global search** with ⌘K → decide: M1 shell-chrome stub, M3 functional, or later.
   - Prototype has **user strip with Admin role** → conflicts with "no RBAC, no auth" vision. The user strip is *presentational* — a device identity, not an RBAC role. Rewrite the strip's copy to match desktop model (e.g., "This device · Admin of this treasury" or just the device owner name).

### 5.3 Sequencing rule

No implementation work on items 6–9 starts before items 1–3 are merged. Tokens first. Otherwise we re-do the same work twice.

---

## 6. New Governance Rule (draft — for Pedro to approve)

> ### DECISION: `prototype/` is the visual and interaction contract for v1.
>
> The `prototype/` folder is the v1 north star for OpenTreasury Desktop. Any implementation that diverges from it requires **either**:
> (a) explicit written sign-off from Link (product) AND Pedro, logged as a decision in `.squad/decisions.md`; **or**
> (b) a logged technical impossibility from Neo, with an alternative approved by Link + Pedro.
>
> The design system in `docs/design/` is a **translation layer**, not an authority. When the design system and the prototype conflict, the **prototype wins and the design system is updated to match**, not the other way around.
>
> Enforcement:
> - Every frontend PR must include before/after screenshots vs the prototype.
> - Every UX spec must include a "Prototype Reference" block citing the specific prototype file + section.
> - Every frontend agent spawn must name `prototype/` files as input artifacts.
> - Accessibility improvements to the prototype (e.g., focus rings, ARIA semantics) do not require deviation sign-off when they add a11y behavior without changing the visual/interaction contract.

This is the draft. When Pedro approves the wording, it moves from this audit into `.squad/decisions.md` (via the inbox drop at `.squad/decisions/inbox/neo-link-prototype-is-north-star.md`).

---

## 7. Commitments

[Neo] commits to:
- Re-route every frontend spawn to name `prototype/` files as required input artifacts — starting immediately.
- Update the PR template with the mandatory prototype checklist this week.
- Personally review (not just route) the first PR of each of items 6–9 against the prototype.
- Log any future prototype deviation as an ADR addendum or decisions.md entry — never inline in a charter or design-system doc.

[Link] commits to:
- Backfill every Wave-1 UX spec with a "Prototype Reference" block, starting with UX-003/004/005.
- Own the ratification call on the six prototype-vs-design-system conflicts in §5.1 item 5 and land the decisions this week.
- Re-scope PRDs where the prototype shows features the PRDs don't (item 11) rather than trimming the prototype.
- No new PRD ships without a prototype citation on every user-visible acceptance criterion.

Both of us own, jointly, that **the prototype gets opened next to the dev server on every frontend review session**. No exceptions.

---

*End of audit.*
