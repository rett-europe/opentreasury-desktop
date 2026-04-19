# Squad Decisions

## Active Decisions

### 2026-04-19: prototype/ is the visual and interaction contract for v1
**By:** Neo (Lead/Architect) + Link (Product Manager), jointly — requested by Pedro
**Branch:** `fix/prototype-fidelity-audit`
**Artifact:** `docs/product/prototype-fidelity-audit.md`

**Rule:**
The `prototype/` folder is the v1 north star for OpenTreasury Desktop. Any implementation that diverges from it requires **either**:
(a) explicit written sign-off from Link (product) AND Pedro, logged as a decision in `.squad/decisions.md`; **or**
(b) a logged technical impossibility from Neo, with an alternative approved by Link + Pedro.

The design system in `docs/design/` is a **translation layer**, not an authority. When the design system and the prototype conflict, the **prototype wins and the design system is updated to match**, not the other way around.

**Enforcement:**
- Every frontend PR must include before/after screenshots vs the prototype.
- Every UX spec must include a "Prototype Reference" block citing the specific prototype file + section.
- Every frontend agent spawn must name `prototype/` files as input artifacts.
- Accessibility improvements to the prototype (e.g., focus rings, ARIA semantics) do not require deviation sign-off when they add a11y behavior without changing the visual/interaction contract.

**Why:**
An M1 implementation review revealed ~49 tracked deltas between `app/src/renderer/**` and `prototype/**` — 20 blockers, 20 important, 9 polish. Root cause: tokens were invented rather than extracted from the prototype; the design system became the de-facto authority; frontend spawns routed against `docs/design/` instead of `prototype/`. Pedro flagged the drift. This rule closes the loop so the gap can't reopen silently.

**Implications:**
- Mouse re-extracts tokens from the prototype (tokens-v0.2) before any more component work.
- Trinity stops implementing against `docs/design/` as the sole source; prototype files join required inputs.
- Niobe backfills a "Prototype Reference" block on every Wave-1 UX spec.
- Link resolves the six prototype-vs-design-system conflicts (estado column, pending tone, Exportar button, category/subcategory split, ES/EN toggle location, theme toggle location) — each gets an explicit decision entry.
- Neo updates the PR template with a mandatory prototype-parity checklist.

**Not a scope reopener:** M1 PRD scope (what features ship when) is unchanged. What changes is **how** they look and behave — they must match the prototype within the 3 allowed deviation gates.

### 2026-04-19: Trinity — Frontend Wave 1 implementation choices
**By:** Trinity (Frontend Dev), requested by Pedro
**Branch:** `feat/trinity-wave-1-impl`
**Scope:** Runnable Movements screen with mock data + 8-primitive UI kit + app shell + theme + i18n.

1. **CSS approach: plain CSS files with BEM-ish `.ot-*` classes, tokens as CSS custom properties.**
   No CSS Modules, no CSS-in-JS, no Tailwind. Mouse's v0.1 tokens live in
   `app/src/renderer/styles/tokens.css` as CSS variables on `:root` / `[data-theme=light]` /
   `[data-theme=dark]`, with `[data-theme=system]` deferring to `@media (prefers-color-scheme: dark)`.
   Every primitive imports its own `.css` sibling. Rationale: simplest working path, zero build
   plugins, zero runtime cost, trivially debuggable in Electron devtools.

2. **DateRangePicker v0.1 = native `<input type="date">` + preset chips (radiogroup).**
   Presets are `radiogroup`/`radio` with arrow-key traversal; custom range uses native date inputs
   with an inline Apply button that disables on `from > to`. No calendar popover, no date-fns, no
   third-party date library. Rationale: native inputs inherit OS locale formatting, are accessible
   by default, and satisfy UX-003 Wave 1. Calendar popover can land in Wave 2 if needed.

3. **No router — `useState<Route>` in `App.tsx` drives page switching.**
   Three routes (`panel` / `movements` / `saldo`) rendered inside `AppShell`. Rationale: the app
   has a tiny, fixed nav surface; react-router adds bundle weight and complexity we don't need.
   Upgrade path: swap `useState` for `useReducer` or add react-router when deep linking / history
   becomes a real requirement.

4. **Vitest split environment: `environment: 'node'` default, React tests opt-in via
   `// @vitest-environment jsdom` top-of-file comment.**
   Pure-logic tests (e.g. `core/events.test.ts`) stay fast under node; component tests get a
   real DOM. Required infra: `setupFiles: ['app/src/renderer/test-setup.ts']` registering
   `afterEach(cleanup)` — because `globals: false` disables @testing-library/react's implicit
   auto-cleanup. Without this, co-located `it()` blocks leak DOM and break `getByRole`/`getByText`
   queries with "multiple elements" errors.

5. **Theme persistence = `localStorage['opentreasury.theme']` (v0.1 stand-in).**
   Final design per ADR-003 §7.3 reads/writes through a main-process user-prefs file in
   `%APPDATA%`. For Wave 1 (renderer-only preview, no Electron main wired) localStorage keeps
   the toggle usable. The `useTheme` hook is the seam — swap the persistence layer without
   touching components.

6. **Icons: `lucide-react` (Mouse-ratified).** Tree-shakable, zero-dep, outline style matches the
   tokens. Used in AppShell nav (LayoutDashboard / ArrowLeftRight / Scale), theme toggle
   (Monitor / Sun / Moon), amount columns (ArrowUpRight / ArrowDownRight), DateRangePill clear
   (X), Table sort (ChevronUp / ChevronDown).

7. **Mock data shape = the real `Movement` type.** `app/src/renderer/types/movement.ts` defines
   the contract; `app/src/renderer/mocks/movements.ts` seeds ~48 entries (Oct 2025 → Apr 2026).
   When the real storage/crypto pipeline lands, the screen imports from a different module — type
   stays identical. `getMockMovements(range)` uses a 200ms `setTimeout` to simulate I/O so the
   loading spinner path is exercised. UUIDs for now; real impl will use ULID per crypto-spec §11.

8. **i18n key namespaces: `common.*` / `shell.*` / `movements.*`.** ES is primary, EN fallback.
   No user-visible string is hardcoded in a component — every label, button, empty-state copy,
   and totals label flows through `useTranslation`. ICU plural keys (`count_one` / `count_other`)
   used for the "N movements" count.

**Non-decisions (deferred):**
- Calendar popover UI for DateRangePicker — native inputs good enough for Wave 1.
- Virtualization for Movements table — ~48 rows today, `react-virtual` can slot in later.
- Electron main-process wiring — tracked in ADR-002 §11; `npm run dev` currently spawns the Vite renderer only.
- Storage / crypto wiring into the renderer — scaffolds exist but not imported by the renderer; mock data fills the gap.

**Gates green:** typecheck 0, lint 0/0, format clean, vitest 38/38.

### 2026-04-19: Switch — Crypto Error Copy Catalog v1.0 ratified; Wave 1 UX unblocked
**By:** Switch (Security Engineer, final say), requested by Pedro
**Branch:** `feat/crypto-error-copy-ratification`

**New artifact:**
- `docs/security/crypto-error-copy-catalog.md` v1.0 — authoritative catalog of user-facing strings (ES + EN) for every crypto-, trust-, and integrity-related failure in v1. 9 scenarios:
  - **CE-001** — Treasury can't be verified (escrow missing / bad signature / unknown admin / structural invalid) — BLOCKING, surfaces at UX-001 E4
  - **CE-002** — Device enrollment pending — not an error (calm-informational), surfaces at UX-002 `requester.pending` / `stuck-no-admin`
  - **CE-002b** — Enrollment rejected — requester-side neutral, admin-side elevated audit entry (+ soft rotation prompt on 2nd rejection in session), surfaces at UX-002 `requester.rejected`
  - **CE-003** — Single-row decrypt failure on Movements — row-level footnote + totals-strip aggregate (UX-003 E5/Q9)
  - **CE-004** — Saldo partial-decrypt banner (UX-004 E9/Q10)
  - **CE-005** — Panel partial-decrypt banner (UX-005 E6/Q8)
  - **CE-006** — Audit log chain break — BLOCKING, app-level lockout
  - **CE-007** — Audit entry bad signature — BLOCKING, merged with CE-006 in UI (distinct in diagnostic bundle) per P1
  - **CE-008** — Device revoked mid-session — treasury-level banner, writes disabled, reads continue (AR2)
  - **CE-009** — Update payload signature invalid — in-app dialog, update aborted, session unaffected (R13.1 enforcement)

**Five normative principles locked in §0:**
1. Actionable to volunteers, opaque to attackers — never reveal which crypto layer failed.
2. No filenames/IDs/fingerprints/algorithm-names in UI; those go to the user-exportable diagnostic bundle only.
3. Partial failure gets partial messaging (row < view < app-wide).
4. Integrity-class errors are BLOCKING — no "continue anyway" on CE-001, CE-006, CE-007, CE-009.
5. Treasurer-first tone; Spanish primary (Rett Spain pilot) + English equivalent register.

**UX-001 Q7 (CE-001 copy) — RATIFIED with ADJUSTMENT.** Niobe's proposed copy *"La firma de esta tesorería no coincide con un administrador conocido…"* was adjusted because it leaked both the failing layer (signature) AND the identity concept (known admin). Ratified copy is opaque about mechanism: *"No podemos verificar esta tesorería. Esta carpeta contiene una tesorería, pero no podemos confirmar que esté intacta. Puede haberse dañado al copiarse, o haberse alterado. No continúes. Contacta a quien administra esta tesorería."*

**UX-002 Q1 (enrollment code alphabet + grouping) — RATIFIED with correction.**
- Alphabet: Crockford base32 (already excludes I/L/O/U) minus `0` and `1` → **30 characters** (`ABCDEFGHJKMNPQRSTVWXYZ23456789`). Niobe said "26" — math correction; intent preserved.
- Grouping: **`XXX-XXX` (3-3)** ratified. Rationale: 2 chunks of 3 matches phone-number-like readback cadence; 2-2-2 has choppier readback and more separator overhead.
- Readback: NATO phonetic for letters + locale number-names for digits.
- Entropy: ~29.4 bits, acceptable for realistic NGO concurrent-enrollment scale.

**UX-002 Q2 (mismatch-on-reject escalation) — RATIFIED.** Option (a) elevated audit entry is the default. Option (b) forced DEK rotation REJECTED — creates a DoS vector where an attacker who can plant pending entries triggers rotation cascades. Option (c) soft admin-prompt-to-rotate ADOPTED as secondary layer, but only on a **second** rejection in the same admin session. Rationale: first mismatch is most likely innocent (user error, bad OOB readback); a pattern is the suspicious signal worth responding to. Audit entry format defined (action `device.enrollment.rejected`, severity `elevated`, `reason_class` enum: `code_mismatch | unrecognised_requester | other` — no free-text PII).

**UX-003 Q9 (row decrypt-failed copy) — RATIFIED as proposed.** Niobe's copy *"1 movimiento no pudo leerse. Ver detalles."* approved unchanged. Catalog adds ICU-plural canonical key for the aggregated footnote.

**UX-004 Q10 (Saldo decrypt-partial banner) — RATIFIED with minor enhancement.** Added *"en este periodo"* scope anchor (avoids confusion on period switches). Normalised to ICU plural form. Existing key retained as alias.

**UX-005 Q8 (Panel decrypt-partial banner) — RATIFIED with ADJUSTMENT.** Niobe's *"…balances y KPIs pueden ser incompletos…"* adjusted to *"…balances y resúmenes…"* (ES) / *"…balances and summaries…"* (EN). "KPIs" violates P5 (jargon) — volunteer treasurers are not data analysts.

**Diagnostic bundle spec added (§4 of catalog).** User-initiated export only, never auto-sent, never uploaded. Filename `opentreasury-diagnostic-{CE-XXX}-{ISO-UTC}.json`. Contains public keys only (never private), no PII (redacted per R15), no decrypted record content. Scenario-specific fields whitelisted per CE-XXX. Only way internal details (failure subclass, affected record IDs, library exceptions, fingerprints) leave the main process.

**UX specs updated (all on `feat/crypto-error-copy-ratification`):**
- `docs/ux/specs/ux-001-first-run-setup.md` — Q7 appended with RATIFIED annotation pointing to CE-001
- `docs/ux/specs/ux-002-device-enrollment.md` — Q1 + Q2 appended with RATIFIED annotations
- `docs/ux/specs/ux-003-movements-screen.md` — Q9 appended
- `docs/ux/specs/ux-004-saldo-screen.md` — Q10 appended
- `docs/ux/specs/ux-005-panel-screen.md` — Q8 appended
- No other parts of these specs were modified.

**Traceability (§6 of catalog):** every CE-XXX maps to its UX spec state(s), crypto-spec section, security-requirements R-number(s), and STRIDE threat ID(s). Morpheus / Trinity implement against crypto-spec §11 + this catalog's diagnostic-bundle spec. Niobe / Mouse / Trinity author i18n tables against the `ux.errors.crypto.*` namespace.

**Unblocked:**
- **Niobe** — Wave 1 UX specs (UX-001, UX-002, UX-003, UX-004, UX-005, UX-006) can now move **Draft → In Review**. All crypto-sensitive copy questions are closed.
- **Mouse** — visual design of the CE-001, CE-006, CE-008, CE-009 blocking/banner surfaces can proceed against locked copy.
- **Trinity** — i18n tables for `ux.errors.crypto.*` can be seeded from this catalog.
- **Morpheus / Neo** — diagnostic bundle main-process implementation unblocked; scenario-specific field whitelists are pinned.

**Why:** Niobe surfaced 5 security-sensitive UX copy questions in Wave-1 specs that required Switch's final say. Catalog consolidates them + 4 additional scenarios Switch identified as gaps (CE-002b admin rejection copy, CE-006/007 audit integrity blocking surfaces, CE-008 mid-session revocation, CE-009 update-signature failure). Wave-1 UX and Mouse's design-system-wave-1 both depended on these being ratified.

### 2026-04-19: Mouse tokens v0.2 — re-extract from prototype (remediation 5.1.1)
**By:** Mouse (UI Designer), requested by Pedro
**Branch:** `fix/mouse-tokens-v0.2`
**Status:** Delivered → Awaiting orchestration + merge
**Artifact:** `app/src/renderer/styles/tokens.css` v0.2 (replacement for v0.1), `.squad/decisions/inbox/mouse-tokens-v0.2.md`

**Decision:** Replace `app/src/renderer/styles/tokens.css` with v0.2 — extracted directly from `prototype/styles.css` per the north-star rule: **prototype is the v1 visual and interaction contract.**

**Summary of Changes:**
- **20 new tokens** introduced (colour, typography, spacing, shadow, chrome)
- **58 value corrections** to match prototype exactly
- Every token value either (a) matches prototype with `Source:` comment, (b) preserves v0.1 where no prototype equivalent, or (c) is new from prototype
- Legacy token names preserved for Trinity compatibility — where values changed, inline `/* v0.2: was X, now Y */` migration comments added

**Breaking Changes (⚠️ Action Required):**

1. **Spacing token rescale** — all `--space-N` indexes shifted due to prototype's finer grid
   - `--space-1` was 4px → now 2px; `--space-2` was 8px → now 4px; ... (full map in decision doc)
   - Trinity action: global search/replace across all component CSS per provided migration table
   - Alternatively: Trinity can add `--compat-space-N` aliases for one sprint, then remove

2. **Primary button hover direction inverted** — **VISUAL CHANGE**
   - v0.1: hover darkened to `#5a3d75` → v0.2: hover lightens to `#9c7cb5`
   - Matches prototype's "airy + anchored" aesthetic; no code change (token ref stays same)
   - Trinity action: visually test all primary buttons (Panel CTA, Movements CTA, dialogs)

3. **Radius +2px on every step** (xs 2→4, sm 4→6, md 6→8, lg 10→12; pill 9999px→16px)
   - Prototype uses fixed-radius rounded rectangles, not perfect circles

4. **Font face change:** OS system stack → **Inter (Google Fonts)**
   - ⚠️ Offline bundling gap flagged; remediation ticket needed (M1 blocker)

5. **Border paradigm shift:** Flat hex → **purple-tinted alpha** `rgba(109,77,140,0.14)`
   - Prototype's signature brand-tinted materiality

**Pending-Tone Conflict (⚠️ FLAGGED for Link ratification):**

**Conflict:** v0.1 design system explicitly removed pending tone. Prototype ships pending badges on Movements (`estado` column: `Pendiente` / `Aprobado`) using `--color-status-pending: #e65100` on `#fff3e0` background.

**v0.2 resolution per north-star rule:** Adopted prototype values. Added `--color-status-pending` and `--color-status-pending-bg` tokens.

**Link's call required:** 
- [ ] **Approve** — Prototype wins; estado column ships with pending badges in M1 (requires Link + Pedro sign-off per audit §6)
- [ ] **Deviation** — File explicit deviation explaining why prototype's pending badges are omitted

**Mouse recommendation:** Approve. The prototype's estado column is a core data-integrity affordance (pending = not yet bank-reconciled). Removing it would be a functional downgrade, not just visual. The "no pending tone" v0.1 decision was made in design-system vacuum without prototype context.

**Other Notable Changes:**
- Dark mode radial + linear gradient body background (signature brand-lit corner)
- Section-label recipe tokenized (uppercase + letter-spaced + muted for group headings)
- Shadow colors updated to purple tint (warm materiality vs neutral gray)
- Motion timing: fast 140ms→120ms, base 220ms→200ms
- Topbar height 56px→60px

**Trinity's Next Steps:**
1. Migrate spacing token references per migration table (global search/replace)
2. Test all primary buttons (hover direction flip)
3. Verify card corners render correctly (radius +2px on every step)
4. Check dark mode body background gradient renders without z-index issues
5. File feedback if any token breaks existing layout (flag in new inbox decision file if needed)

**Link's Next Step:**
- Ratify or file deviation on pending-tone (decision doc has Mouse's recommendation + rationale)

**Mouse's Follow-up Tickets (out-of-scope for this decision):**
1. Inter offline bundling — download WOFF2 files, bundle in `app/src/renderer/assets/fonts/`, update @font-face. Target: before M1 ship.
2. Account colour palette — propose 10-color palette extracted from prototype (uses `color-mix(in oklch, …)` formula; v0.2 does not yet tokenize this).

**Why:** Remediation item 5.1.1 of `docs/product/prototype-fidelity-audit.md`. Root cause of v0.1 drift: tokens were invented rather than extracted from prototype; design system became de-facto authority. Prototype wins; design system is translation layer. This re-extraction unblocks all frontend remediation (Trinity Panel/Saldo/Movements rebuild).

**Impact:**
- ✅ Unblocks: Trinity's Wave-1 rebuild, Panel/Saldo implementation, all 49-delta fidelity audit remediation tickets
- ⚠️ Blocks merge until: Link ratifies or deviates on pending-tone, Trinity ready to rebase + migrate spacing tokens
- ⚠️ Dependency: All frontend PRs until merged must reference this v0.2 token state

### 2026-04-19: Design System v0.1 shipped (Wave 1 visual foundation)
**By:** Mouse (UI Designer), requested by Pedro
**Branch:** `feat/design-system-wave-1`
**What:** Five design artifacts authored under `docs/design/`:
- `docs/design/design-principles.md` — 8 visual-design principles (P1 Calm · P2 High contrast · P3 Text-first · P4 Desktop-native · P5 Bilingual-first · P6 Empty states teach · P7 Density is a preference · P8 Security-adjacent surfacing).
- `docs/design/tokens.md` — authoritative token catalog: colour (light + dark, both **WCAG AA verified** with explicit ratios), typography (OS system font stack; body 14 px / 8-step scale), spacing (4 px base), radius, elevation (light + dark shadow sets), motion (duration + easing + `prefers-reduced-motion` at token level), z-index (11 named layers, no ad-hoc `z-index`), breakpoints (compact 960 / standard 1280 / wide 1600).
- `docs/design/components-v1.md` — 16 component primitives covering all Wave-1 needs: Button, TextField, Select, DateRangePicker (critical for UX-003), Banner, Dialog, Sidebar, Topbar, Toast, Badge/Pill, EmptyState, Skeleton, DataTable, Chart, LocaleSwitcher, CodeDisplay (security primitive for UX-002). Each spec has anatomy + states + props shape + a11y + i18n + UX-spec consumers.
- `docs/design/screen-visuals-v1.md` — per-screen visual specs for all 6 Wave-1 screens (UX-001/002/003/004/005/006) with Mermaid layout diagrams and per-state treatment tables. No pixel-perfect mockups.
- `docs/design/icons-and-illustrations.md` — Lucide locked as icon library with icon-to-semantic mappings. Zero illustrations in v1.

**Key design decisions locked:**
1. **Icon library: Lucide** (single-weight consistency, Wave-1 domain coverage including `Scale`/`Wallet`/`ArrowLeftRight`, MIT, tree-shakable, inline SVG — no runtime font download). Phosphor / Heroicons / Tabler evaluated and rejected.
2. **Dark mode mandatory at v0.1.** Both light and dark themes specified and WCAG AA verified with explicit contrast ratios for every shipped fg/bg pair. Theme defaults to OS `prefers-color-scheme`, user-overridable in Settings, persisted to `%APPDATA%` user-prefs (not OneDrive — per-device preference, matches ADR-003 §7.3).
3. **OS system font stack, no web fonts at runtime.** `Segoe UI Variable` → `Segoe UI` → `-apple-system` → `system-ui` → Roboto → fallback. Honours Principle P4 (desktop-native) and vision Principle 5 (offline-first). Monospace stack (`Cascadia Code` → `Consolas` → `SF Mono`) for `CodeDisplay` and folder-path rendering.
4. **Brand anchor preserved from prototype.** `#6d4d8c` purple carried forward; surrounding palette rebalanced for AA+. Rett Spain treasurers see continuity with cloud version.
5. **Zero illustrations in v1.** EmptyState component has icon slot but ships unused — Principle P1 (calm over flashy) + volunteer-project budget + i18n friction + dark-mode doubling cost. Revisit triggers captured.
6. **No `pending` tone anywhere** (Badge/Pill, Banner). Reinforces product decision at the token level — not even possible to accidentally reintroduce the concept.
7. **Tabular numerics on every financial cell** via `font-variant-numeric: tabular-nums`. No web font needed.

**Unblocked downstream work:**
- **Trinity** — UNBLOCKED for Wave-1 component implementation. Start with `tokens.md` → CSS custom properties (light + dark) + theme switching hook, then work down the component list in `components-v1.md`. Benchmark chart library (`visx` vs custom SVG vs Recharts) against UX-005 PR12 ≤500 ms / 1 k events before committing.
- **Niobe** — new UX follow-ups flagged in questions (density-toggle placement, toast Ctrl+Shift+T addition, right-click menus M1 vs v1.x).
- **Switch** — UX-002 admin UPN tooltip copy ("identity not a trust anchor") — final wording.

**Top open questions for Pedro / Niobe / Switch / Trinity:**
1. **Custom brand mark** (Pedro) — ship v1 with Lucide `Scale` placeholder or commission a mark? Recommend defer to v1.1.
2. **Sidebar taxonomy + order** (Pedro / Niobe) — confirm visual order Panel · Movimientos · Saldo · Cuentas · Categorías · Etiquetas · Importación · Exportar (disabled M1).
3. **Density toggle placement on Movements** (Niobe) — filter bar (proposed) vs global Settings only.
4. **Right-click context menus on data-table rows** (Pedro / Niobe) — M1 or v1.x. Recommend v1.x.
5. **UX-002 admin UPN tooltip copy** (Switch) — "identity not a trust anchor" line final wording.
6. **Chart library choice** (Trinity) — visx vs custom SVG vs Recharts. Benchmark first.
7. **Account colour palette** (Mouse follow-up) — Mouse to propose a 10-colour contrast-safe palette in tokens-v0.2 pass.
8. **Empty-state icon defaults** (Niobe / Pedro) — ship zero (current plan) or a subtle 32 px Lucide per context.
9. **Toast action keyboard shortcut** `Ctrl+Shift+T` (Niobe) — add to UX-006 §8 map.

**Why:** Wave 1 (6 UX specs at Draft v0.1) described layout regions and interactive roles but deliberately no pixels. Trinity needed a stable visual foundation — tokens, primitives, screen-level composition, and icon choice — before any React component could ship. This v0.1 closes that gap. The system is bilingual-first (P5), accessible by design (AA contrast, keyboard-reachable, reduced-motion honoured at token level), and desktop-native (P4). Principle-grounded — every future visual question has a tie-breaker to check first.


### 2026-04-19: Scaffold typecheck fixes — skipLibCheck deviation from ADR-002
**By:** Neo (Lead / Architect), requested by Pedro
**Branch:** feat/app-scaffold-and-i18n-adr
**What:** Fixed 22 `npm run typecheck` errors on the fresh scaffold. Changes:
- `tsconfig.base.json`: `skipLibCheck: false → true`; `lib: ["ES2022"] → ["ES2022", "DOM"]`
- `app/src/main/tsconfig.json`: `lib: ["ES2022"] → ["ES2022", "DOM"]`
- `app/src/renderer/vite-env.d.ts`: new file, `/// <reference types="vite/client" />`
- `app/src/renderer/i18n/index.ts`: `missingKeyHandler` rewritten as conditional object-spread with explicit param types (`readonly string[]`, `string`, `string`) for `exactOptionalPropertyTypes`
- `docs/architecture/adr-002-repo-structure.md`: Addendum documenting the `skipLibCheck` deviation

**Why:** ADR-002 §4 implied `skipLibCheck: false`. Changed to `true` because:
1. `electron.d.ts` conflicts with strict `@types/node` (duplicate `noDeprecation` decl — TS2687/TS2717). Upstream issue, not fixable by us.
2. `electron.d.ts` references DOM types (`MessagePort`, `HTMLElement`, etc.) even in main-process contexts, forcing `DOM` into the shared base lib.
3. Pinning `@types/node` to electron's bundled types is brittle; every serious Electron+TS project ships `skipLibCheck: true`.
4. Source code is still fully type-checked under `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` — only third-party `.d.ts` files are skipped.

Revisit if upstream resolves the conflict.

### 2026-04-19: Scaffold lint configuration — TypeScript import resolver
**By:** Neo (Lead/Architect), requested by Pedro
**What:** Resolved 62 lint errors + 15 warnings from the fresh scaffold by fixing the `eslint-plugin-import` TypeScript resolver wiring.
**Changes:**
- `package.json`: added `eslint-import-resolver-typescript@^3.6.0` to devDependencies (install requires `--legacy-peer-deps` — peerOptional conflict with `@typescript-eslint/utils` v8 vs our v7 via ESLint 8).
- `.eslintrc.cjs`: expanded `settings` with `import/parsers` (`.ts/.tsx/.cts/.mts` → TS parser) and `import/resolver.typescript` with `alwaysTryTypes: true` + full `project` array covering all 7 module tsconfigs (`root`, `main`, `preload`, `renderer`, `core`, `crypto`, `storage`, `shared`), plus `node: true` fallback.
- `.eslintrc.cjs`: added `@typescript-eslint/no-unused-vars` with `^_` ignore patterns for args/vars/caught errors (scaffold convention).
- `.eslintrc.cjs`: override for `app/src/main` and `app/src/preload` disabling top-level `no-restricted-imports` (prior rule blocked electron imports everywhere, including where they are allowed).
- `app/src/renderer/i18n/index.ts`: narrow `eslint-disable` for i18next default-export false-positive warnings.

**Why:** Root cause was `"Resolve error: typescript with invalid interface loaded as resolver"` — the resolver package was missing. The `import './App.js'` pattern in `main.tsx` is intentional for ESM-compatible TS output and was left unchanged. Renderer/crypto/storage/core boundary rules remain enforced — Switch-relevant.

**Result:** `npm run lint` — 0 errors, 0 warnings. Revisit `--legacy-peer-deps` when upgrading to ESLint 9 / `@typescript-eslint` v8.
### 2026-04-19: Wave-1 UX specs Batch 2 authored — Wave 1 complete
**By:** Niobe (Spec / UX Analyst), requested by Pedro
**Branch:** `docs/ux-specs-m1-wave-1`
**What:**

**Three new UX screen specs at Draft v0.1:**
- `docs/ux/specs/ux-003-movements-screen.md` — Movements (paired PRD-001). Empty-on-open as first-class state; date-range presets + custom; full state machine; statement-import banner hand-off; `Estado` column explicitly removed. 14 edge cases. Mermaid state diagram.
- `docs/ux/specs/ux-004-saldo-screen.md` — Saldo (paired PRD-002). Auto-loads default period; two comparison panels + KPI strip + net-monthly chart; linear pro-rata projection spec for partial periods; collapsible screen-reader data-table for chart. No Mermaid (single trajectory).
- `docs/ux/specs/ux-005-panel-screen.md` — Panel (paired PRD-003). Default landing; account cards + sparklines + current-month KPIs + 12-month chart + latest-8 recent-tx (read-only, no `Estado`). Empty-DB branch specified (3 sub-states). Prototype's "Nuevo Movimiento" header button hidden in M1 to preserve PR7 read-only contract.

**Wave 1 is now COMPLETE** — all 6 Wave-1 UX specs at Draft v0.1:
UX-001 · UX-002 · UX-003 · UX-004 · UX-005 · UX-006.

**`docs/ux/ux-spec-plan.md` updated:**
- UX-003 row: Skeleton → Draft v0.1 with link.
- New rows: UX-004 (Saldo) and UX-005 (Panel) at Draft v0.1.
- Legacy UX-007 / UX-008 rows marked **Superseded** (numbering reconciliation deferred to a follow-up plan-revision ticket, matching UX-006 precedent).

**Cross-screen consistency (now locked across Wave 1):**
- No pending/status column, badge, filter, toggle, or tooltip on ANY screen.
- `Intl.*` formatters for currency (EUR, Rett Spain pilot), dates, numbers, month labels everywhere.
- Global states (offline / syncing / locked / error-banner / device-revoked) live in UX-006 shell slot and stack above per-screen content.
- Chart a11y pattern: Saldo and Panel both ship collapsible data-table equivalents under their bar charts.
- First-run → Panel default (UX-001 step 8); Panel handles empty-DB cleanly.
- Panel "Ver todos" → Movements hand-off recommended to pre-load `This month` (click = range-selection intent). Pedro ratify.

**Top blocker-level open questions (batch 2 — addressed to named owners):**

*Switch (security-sensitive copy):*
- UX-003 Q9 — exact ES/EN copy for single-row decrypt-failed footnote (aligns with UX-009 catalog).
- UX-004 Q10 — Saldo partial-decrypt-failed banner exact copy.
- UX-005 Q8 — Panel decrypt-partial banner exact copy.

*Link (PRD clarifications):*
- UX-003 Q1 — confirm statement-import wizard lives entirely under UX-016/PRD-006; UX-003 surface is banner-only.
- UX-003 Q2 — "Exportar" header button in M1: hide vs disabled-with-tooltip. (Recommendation: hide.)
- UX-003 Q6 — remove within-range month dropdown (duplicates range pill). (Recommendation: remove.)
- UX-004 Q2 — zero-in-current, non-zero-in-prior category (dropped): show as -100% (recommended) or hide.
- UX-005 Q1 — sparkline partial-data threshold: hide until ≥3 months (recommended) vs partial.

*Morpheus / Neo:*
- UX-003 Q3 — large-range guard threshold (>5000 events) — parametrise from measured p95.

*Pedro (ratifications):*
- UX-003 Q7 / UX-005 Q4 — Panel → Movements hand-off pre-loads `This month` (recommended).
- UX-005 Q2 — hide "Nuevo Movimiento" header button on Panel in M1 (preserves PR7). (Recommendation: hide.)
- UX-004 Q4 — "previous period" for Mes selector = same-month-prior-year (recommended) vs preceding month.

**Unblocked downstream work:**
- **Mouse** — UNBLOCKED for ALL 6 Wave-1 screens. Visual tokens, breakpoints, skeleton patterns, chart visuals, range-picker pattern, negative-balance treatment, responsive layouts, admin-only affordance pattern. Wave-1 UX contract is stable.
- **Morpheus / Trinity** — read-model query shapes now documented per screen (range queries on Movements, aggregation queries on Saldo, five parallel queries on Panel mount). Ticket breakdown can proceed against concrete IPC surfaces.
- **Cypher** — Traceability matrices in each spec map requirements → PRDs/ADRs/R-series/C-series/crypto-spec §-numbers for acceptance-test authoring.
- **Switch** — 3 user-facing crypto-error copy items batched for UX-009 ratification (one per screen — same pattern).

**Why:** Closes the Wave-1 UX blocker set. Mouse can now produce visual specs for the entire treasurer-facing happy path (install → first-run → enroll → shell → Panel → Movements → Saldo). Morpheus/Trinity can scope M1 implementation tickets against concrete UX state sets, not assumptions.

### 2026-04-19: UX specs Batch 1 (Wave 1) authored — Draft v0.1
**By:** Niobe (Spec / UX Analyst), requested by Pedro
**Branch:** `docs/ux-specs-m1-wave-1`
**What:** Three Wave-1 UX specs authored as Draft v0.1:
- `docs/ux/specs/ux-001-first-run-setup.md` — first-run / folder setup (admin-create + join-existing; R20 posture gate; Personal-OneDrive explicit rejection).
- `docs/ux/specs/ux-002-device-enrollment.md` — requester + admin enrollment aligned to crypto-spec §5 (6-char code, out-of-band compare, pubkey-substitution defense).
- `docs/ux/specs/ux-006-app-shell-and-navigation.md` — topbar/sidebar/content shell, 5 global states (`locked`/`normal`/`syncing`/`offline`/`error-banner`), **no `pending` state**, locale switcher in topbar (day-0 i18n).

`docs/ux/ux-spec-plan.md` updated: UX-001/002/006 rows at Draft v0.1.

**Open questions routed:**
- **Switch (must ratify before Draft → In Review):** bad-escrow-signature copy (UX-001 Q7), 6-char code alphabet/grouping (UX-002 Q1), mismatch escalation policy (Q2), pending-entry expiry (Q3), requester self-cancel (Q4), UPN "not a trust anchor" tooltip (Q6).
- **Pedro:** non-OneDrive override (Q1), language pre-selection (Q2), backup-admin soft prompt (Q5), Ctrl+N shortcut (UX-006 Q1), locale switcher placement (UX-006 Q5).
- **Link:** NGO display-name source (Q3), M1 search affordance (UX-006 Q3).

**Why:** Unblocks Wave-1. These three are the shell + onboarding skeleton on which the three screen specs (batch 2) and the error catalog (UX-009) depend.

**Note:** Batch 2 (screens UX-003/007/008) is in flight — spawn prompt referenced "UX-003/004/005" but current plan numbers them UX-003/007/008. Coordinator + Niobe to reconcile numbering at batch-2 kickoff.

### 2026-04-19: Project scope — OpenTreasury Desktop
**By:** Pedro (project owner)
**What:** Build a desktop Electron app that replicates the functionality of rett-europe/opentreasury without requiring complex cloud setup (Azure, Cosmos DB, Entra ID). Tech stack beyond Electron is TBD.
**Why:** NGOs need simpler deployment — download and run, no Azure subscription required.

### 2026-04-19: Switch has FINAL SAY on security
**By:** Pedro (project owner)
**What:** Switch (Security Engineer) has final say on all security decisions — non-negotiable. Always adopt the most secure option.
**Why:** Financial data for NGOs requires rigorous security posture.

### 2026-04-19: Transaction list starts empty
**By:** Pedro (project owner)
**What:** Transaction list page starts EMPTY — user must select a date range (or preset) before data loads. No auto-loading on page open.
**Why:** UX decision from the cloud version — prevents overwhelming users with stale data.

### 2026-04-19: Product Vision v0.1 established (Link)
**By:** Link (PM), requested by Pedro
**What:** Product Vision document written at `docs/product/vision.md`.

**Core vision statement:**
> OpenTreasury Desktop is a zero-infrastructure treasury app for small NGOs — a cross-platform desktop app that turns a shared OneDrive/SharePoint folder into a fully-functional, multi-user treasury ledger. No Azure. No database to run. No IT department required.

**Scope-out / explicit deferrals (v1 will NOT include):**
- Custom authentication / user accounts — OneDrive folder permissions ARE the auth layer
- Role-Based Access Control (RBAC) — folder ACLs replace it
- Multi-tenant cloud SaaS, hosted backend, any network database
- Real-time collaborative editing (Google Docs-style)
- Mobile app, bank API integrations (PSD2), payroll, tax filing
- PDF/Excel export, reports module, attachments, recurring tx → v1.x
- Budgets/forecasts, multi-currency, bank feeds → Later

**Product principles (tie-breakers for future decisions):**
1. OneDrive is the database
2. Permissions = folder permissions (no app-level user system)
3. Spec before code (mirrors cloud repo `docs/specs/` discipline)
4. Feature parity through adaptation, not code translation
5. Offline-capable by default
6. Secure by default; Switch has final say on security
7. Boring technology wins

**Success metrics (privacy-respecting, no cloud telemetry):**
Time-to-first-transaction ≤10min, setup success ≥90%, ≥10 real NGO deployments in 3 months, ZERO data-loss incidents (hard floor), ≥95% auto-resolved sync conflicts, ≥80% cloud feature parity.

**Risks flagged (deferred to Neo/Switch):**
- OneDrive concurrency/conflict resolution (🔴 High, Neo)
- File corruption / snapshot strategy (🔴 High, Neo + Switch)
- Encryption at rest vs. OneDrive search trade-off (🔴 High, **Switch final say**)
- SharePoint vs OneDrive Personal vs Business API differences
- Tech stack decision (React/Angular/Svelte + Electron vs Tauri)
- Tamper-evident audit log without a server

**Repo structure proposed** (mirrors cloud repo, minus api/infra/deploy):
`docs/product/`, `docs/specs/`, `docs/architecture/`, `docs/ux/`, `docs/security/`, `docs/guides/`, `app/`, `prototype/` (kept as reference), `scripts/`, `installers/`, `tests/`.

**Open questions for Pedro (block next step — PRDs + tech stack ADR):**
1. Tech stack beyond Electron — preference or let Neo propose options?
2. OneDrive Personal + SharePoint/Business both, or pick one?
3. Data file format — folder of append-only JSON files acceptable? (huge merge-conflict implication)
4. Encryption at rest — required despite breaking OneDrive search? (Switch final say, needs business input)
5. Target OS v1 — Windows only, or Win+Mac+Linux?
6. Language — Spanish+English, or Spanish-only with i18n scaffold?
7. Prototype as v1 UX contract, or free to depart?
8. Proposed repo structure approved?

**Why:** Pedro requested a vision-first, spec-driven foundation mirroring the cloud repo's operating model. This locks down the product shape so PRDs, ADRs, and specs can be written against a stable reference.

### 2026-04-19: Neo proposes tech stack via ADR-001
**By:** Neo (Lead/Architect), requested by Pedro
**What:** ADR-001 written at `docs/architecture/adr-001-tech-stack.md` — Status: Proposed. Three options evaluated:
- **Option A** — React + TS + append-only JSON event log (UUID-named, immutable) + derived SQLite read model + `age` file-level encryption
- **Option B** — Svelte + TS + single SQLCipher DB file
- **Option C** — React + TS + Yjs CRDT + encrypted snapshot blob

**Recommendation:** Option A. Rationale: UUID-named immutable event files are zero-conflict by construction on OneDrive (the #1 risk from vision), give us the audit log for free (cloud feature parity), use boring audited crypto (`age`), and keep decrypted data inspectable (Principle 3: "your data, your file"). Option B's single binary file cannot survive multi-writer offline edits on a shared folder — dealbreaker. Option C is correct but too complex for a volunteer-staffed project and produces opaque binaries.

**Explicit trade-off accepted in the proposal:** OneDrive web-UI search of donor data is broken by design (file-level encryption). Pedro must accept this; Switch must validate.

**Status:** Proposed — **not yet Accepted.** Switch's security review of crypto choices (`age` + Argon2id + OS keychain) is a hard gate before acceptance. Pedro must also answer Vision Q5 (target OS) before installer work starts.

**Why:** Tech stack must be locked before any `app/` scaffolding, first PRDs, or feature specs. ADR exists so decision + rationale are reviewable before code is written.

### 2026-04-19: Security Requirements & Threat Model v0.1 (Switch)
**By:** Switch (Security Engineer, final say), requested by Pedro
**What:** Security Requirements & Threat Model v0.1 at `docs/security/security-requirements-v0.1.md`.

**Non-negotiable constraints Neo's ADR-001 MUST satisfy (full list in §5 of the doc):**

1. **Encryption at rest is mandatory.** AEAD only — `XChaCha20-Poly1305` (preferred) or `AES-256-GCM`. No plaintext PII or financial data in the OneDrive folder, ever. Filenames opaque (no PII leakage).
2. **No roll-your-own crypto.** Audited library required — libsodium via `sodium-native`, WebCrypto subtle, or `@noble/*`. Stack ADR must name the library and its auditors.
3. **Electron hardening:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strict CSP (no `unsafe-inline`, no `unsafe-eval`, no CDN), no `@electron/remote`, URL navigation allowlist, external links via `shell.openExternal` only.
4. **IPC discipline:** `contextBridge` with narrow API surface, schema-validated (Zod/Valibot/Ajv) at every boundary, no dynamic dispatch, no `eval`.
5. **Signed installers + signed auto-updates only** with pinned public key. Unsigned update = abort with visible error.
6. **Zero secrets in git.** Pre-commit + CI scan (`gitleaks` / `trufflehog`). Signing keys only in CI vault.
7. **PII never in logs.** Structured logger with allowlist redaction; lint rule against `console.log(obj)` of record data.
8. **Dependency policy:** lockfile required, `npm audit` gate in CI, no native deps without Switch review, no unreviewed install scripts.
9. **Append-only audit log, hash-chained, Ed25519-signed per entry.** Chain break at load time = refuse to open + point at snapshot recovery.
10. **Snapshots** of the encrypted dataset, minimum daily on active days.
11. **Identity = Microsoft account (OneDrive).** Folder ACL is the authorization boundary. No custom auth. This is a product constraint we harden against, not override.
12. **No telemetry/analytics libraries in v1** (no Sentry, no PostHog, etc.) without explicit Switch sign-off.
13. **Crypto agility:** version byte + algorithm id on every encrypted artifact.

**Recommended key-management approach (R4 in the doc): "Shared-folder escrow with per-user wrapping"**

- One **DEK** per NGO dataset, encrypts all records.
- DEK stored **wrapped per user** in `.treasury/keys.json` in the OneDrive folder.
- Each user has an **X25519 keypair** generated on first launch, stored in the **OS keychain** (DPAPI / macOS Keychain / libsecret). Private key never leaves the device in plaintext.
- Adding a member: an existing member wraps the DEK to the new member's published public key (from `.treasury/pubkeys/{user_id}.pub`).
- Removing a member: rotate DEK, re-wrap for remaining members, omit the removed user. Historical records stay readable with the old DEK (rotation-aware, accepted risk AR2).
- Escrow file changes are Ed25519-signed and logged in the audit trail.
- **Admin role = escrow-edit signing privilege** (lives in the escrow file, not app-level RBAC).

**Alternatives explicitly rejected:**
- (a) Shared passphrase everyone knows — no revocation, degrades to Teams-chat sharing. ❌
- (b) Per-user key wrapped by a shared secret — same distribution problem. ❌
- (d) Microsoft Graph-based key derivation — requires app reg + OAuth, violates "no custom auth". ❌ (revisit v2)
- (e) Hardware tokens — unrealistic for volunteer NGOs. ❌ (deferred)

**Accepted risks (v1), documented in §6:**
- AR1: MS-account compromise = compromised member's data access (inherent to file-based model).
- AR2: Revoked members retain access to data they already decrypted (symmetric crypto reality).
- AR3: OneDrive server-side search does not work on encrypted content (in-app search does).
- AR7: Insider with folder-write can delete the audit log entirely (detectable, not preventable without a server).
- Full list in the doc — see §6.

**Open security questions for Pedro (block v0.2 sign-off, see §7):**
1. Escrow admin model — first-setup member becomes admin, or explicit named admin? How many admins simultaneously?
2. Audit log visibility — all members, admins only, or export-on-request?
3. Encryption scope — any fields Pedro wants left searchable by OneDrive? (default: encrypt everything PII/financial, accept AR3)
4. Multi-device per user — support one user on multiple laptops? (default: yes, one escrow entry per device)
5. Incident response expectation — "remove user → rotate → accept AR2" acceptable, or "burn it all down, migrate to new dataset"?
6. EV code-signing cert on Windows (~$300–500/yr) — willing to pay? Without it, SmartScreen warns non-technical treasurers on every install.

**Why:** Pedro tasked Switch with setting the security constraints v1 must meet. Encryption at rest is mandatory; identity stays Microsoft; folder ACL is authorization; custom auth is out. Neo's ADR-001 is now constrained by §5 of this document. Switch has final say per team decision 2026-04-19.

### 2026-04-19: Crypto spec published + ADR-001 ACCEPTED (with conditions) + Security Reqs v0.2
**By:** Switch (Security Engineer, final say), requested by Pedro
**What:**

**New artifacts:**
- `docs/security/crypto-spec.md` v1.0 — implementable crypto & key-management spec. Covers: primitives (XChaCha20-Poly1305 via `sodium-native`; X25519 sealed-box DEK wrapping; Ed25519 signatures; BLAKE2b hashing), three-tier key hierarchy (device keys in OS keychain via `@napi-rs/keyring`, DEK in main-proc memory only, per-file AAD-bound AEAD envelope), full `escrow.json` JSON schema, first-setup/enrollment/revocation/rotation flows with Mermaid sequence diagrams, audit log format (hash-chained, Ed25519-signed per entry), incident response playbook (rotate-and-continue default; burn-down-and-migrate nuclear), metadata surface ruling (acceptable), 15-item implementation checklist.
- `docs/security/security-requirements-v0.1.md` bumped to **v0.2** (filename retained) — all 6 open questions annotated RESOLVED with Pedro's answers, R4 amended to per-device, R13 split into R13.1 (update payload signing, still mandatory) and R13.2 (installer commercial-CA signing, deferred per AR9/AR10).

**Pedro's six resolutions (2026-04-19):**
1. Admin = first-setup wins; authenticated enrollment (6-char visual-code compare) required for new devices; admin must be online to approve.
2. Audit log visibility = all authenticated members; export-on-request as decrypted JSON bundle.
3. Encryption scope = everything PII/financial. AR3 (no OneDrive search) accepted.
4. Multi-device = one escrow entry **per device** (not per user). Stolen-device revocation = one entry only.
5. Incident response default = rotate-and-continue. Burn-down-and-migrate documented as nuclear option.
6. Code-signing = no EV cert budget initially → **AR9** (Windows SmartScreen warning accepted) + **AR10** (macOS binary distribution OUT of v1 scope, source-build only). Update payload signing via Ed25519 + pinned pubkey is **NOT deferred**.

**ADR-001 verdict: APPROVED WITH CONDITIONS → Status: Proposed → Accepted.**

Conditions (C1–C15) added to ADR-001 §9 "Security Review — Switch", binding on Neo/Morpheus/Trinity. Key supersessions of Neo's original Option A language:
- `age` as on-disk format **rejected** → XChaCha20-Poly1305 via `sodium-native` with the custom envelope in crypto-spec §2.1 (we need DEK versioning + AAD + crypto agility that `age` doesn't give us).
- Argon2id passphrase flow **rejected for v1** → OS-keychain-only model; no passphrase surface.
- `keytar` **forbidden** (deprecated) → `@napi-rs/keyring`.
- Filename scheme `{timestamp}-{uuid}` → **ULID** (no exposed timestamp prefix).

**New accepted risks:**
- **AR9:** Unsigned Windows installers (SmartScreen warning). Trigger to revisit EV cert: >100 installs OR ≥3 adoption-blocker reports OR partner funding.
- **AR10:** macOS binary distribution deferred (no Apple Developer account). Source-build only. Trigger: Apple Developer Program funding secured.

**Important clarification documented:** commercial-CA installer signing (Authenticode, Apple notarization) is deferred; **update payload signing remains mandatory** (Ed25519 private key in CI vault, pinned public key in app binary). These are separate concerns — one is cosmetic trust UX, the other is cryptographic update integrity.

**Status for downstream work:**
- Morpheus / Trinity: **UNBLOCKED** to break down implementation tickets against crypto-spec §11 (15 checklist items). Every ticket must cite C1–C15 condition(s) it satisfies.
- Neo: should file one ADR addendum or new ADR for the filename scheme + `sodium-native` supersession if desired for cleanliness, but the changes are already locked in crypto-spec + ADR-001 §9.
- Non-security spike still open (Neo-owned, non-blocking for sign-off): 10k event files in OneDrive-synced folder — stress test before GA.

**Why:** Pedro answered all six open questions, unblocking v0.2 lock-in. Neo's ADR-001 was gated on Switch's security review. Crypto spec is the bar Neo's implementation must meet. Per team governance, Switch has final say on all of the above.

### 2026-04-19: ADR-002 Proposed — repo structure
**By:** Neo (Lead/Architect), requested by Pedro
**What:** `docs/architecture/adr-002-repo-structure.md` published — **Status: Proposed.**

**One-line summary:** Single `app/` package (flat, no monorepo tool), strict Electron process boundaries enforced at the filesystem level (`src/main/`, `src/preload/`, `src/renderer/`, shared `src/shared/` contracts), Electron-free `src/core/` + `src/crypto/` + `src/storage/` for unit-testing and a single-pass Switch audit; SDD layout under `docs/` (product/, architecture/, security/, ux/, design/, specs/, guides/) mirroring the cloud repo where useful, diverging cleanly on `api/infra/deploy`.

**Scaffolded in the same work item (empty/README-only — no source code):**
- `docs/ux/README.md`, `docs/design/README.md`
- `docs/specs/README.md` (SDD lifecycle + review process)
- `docs/specs/_template.md` (canonical feature-spec template with mandatory `## Traceability` to PRD + ADRs + C-series + R-series + crypto-spec §-numbers)
- `scripts/README.md`
- `.github/workflows/README.md` ("CI to be added")
- `.github/ISSUE_TEMPLATE/README.md`
- `.github/pull_request_template.md` (branch discipline + spec ref + ADR conditions + security checklist + tests + traceability)

**Deferred deliberately:** `app/` source tree (waits on open questions + first implementation PR); CI workflows (separate ADR); `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `docs/guides/` (mirror cloud at v1).

**Open questions for Pedro (block Proposed → Accepted):**
1. Package manager — `npm` (recommended, parity with cloud repo) vs `pnpm` vs `yarn`.
2. Monorepo tool — recommend **none** (single `app/` package, plain `tsc -b` with project references).
3. TypeScript strictness — recommend `strict: true` + `noUncheckedIndexedAccess: true` + `exactOptionalPropertyTypes: true`.
4. `app/` vs `apps/opentreasury-desktop/` — recommend flat `app/` for now.
5. Tests layout — recommend hybrid (co-located `*.test.ts` for unit, separate `tests/integration/` and `tests/e2e/`).

**Why:** Structure needs to be locked before the first implementation PR so module boundaries, spec locations, and PR discipline are established rather than retrofitted.

### 2026-04-19: Roadmap v1, PRD plan, and first three PRDs drafted (Link)
**By:** Link (PM), requested by Pedro
**What:** Three new artifact sets on branch `docs/roadmap-v1-and-first-prds`:

1. **Roadmap** — `docs/product/roadmap-v1.md` (Draft v0.1).
   - **5 milestones:** M0 Foundations (S) → M1 Single-user happy path (L) → M2 Multi-device shared folder (L) → M3 v1 feature parity (M) → M4 v1.x polish (M).
   - **3 release gates:** Internal Alpha (after M1), NGO Pilot (after M2), v1.0 Public (after M3). Each with testable entry criteria.
   - Dependency graph (Mermaid) linking milestones to ADR-001, ADR-002, crypto-spec, security-requirements.
   - Feature → milestone mapping for every row in vision §9 (each feature now has a PRD ID reserved).
   - Deferred list with explicit triggers (incl. AR9 EV cert, AR10 macOS, telemetry never-in-v1).

2. **PRD plan** — `docs/product/prd-plan.md` (Draft v0.1). 22 PRD reservations, 3 drafted. PRD authoring template documented. **Switch's sign-off is required (non-negotiable) for any security-touching PRD; Pedro cannot approve security-touching PRDs without prior Switch sign-off.**

3. **Three M1 PRDs** (Status: **Draft**, target milestone **M1**):
   - `prd-001-movements.md` — empty-on-open (PR1) is a hard requirement; selection UI ships M1; bulk *actions* deferred to M4 (PRD-019); every mutation writes event + audit entry from M1.
   - `prd-002-saldo.md` — aggregation views auto-load (empty-on-open is Movements-specific); pending included in totals M1 (consistency with Movements), toggle deferred; linear pro-rata projection only.
   - `prd-003-panel.md` — strict **read-only overview contract (PR7)**; no inline edits; no filters on Panel (by design); sparklines become real monthly-net data.

**Vision update (`docs/product/vision.md`):** Q5 closed (Windows-first binaries; macOS source-only AR10; Linux AppImage/deb with Ed25519 detached sig). Q7 closed (prototype as v1 UX contract — yes; Niobe runs prototype-review in parallel). Q2 (data format) marked resolved by ADR-001 + crypto-spec §2.1. Still open: Q2 OneDrive scope, Q6 language coverage, Q8 repo layout (now ADR-002 Proposed).

**Key open questions for Pedro:**
1. Pilot NGO identity for M2 gate.
2. Alpha dogfooder — which squad member commits 1 week on real data.
3. Pending-transaction handling in Saldo/Panel totals (default "include"; confirm).
4. Default date-range preset on Movements first open (PRD-001 Q1).
5. i18n EN timing — PRD-009 targets M3; moves earlier if pilot NGO is English-speaking.
6. OneDrive storage scope (vision Q2) — Personal + Business both, or pick one for v1?

**Process note:** feature branch `docs/roadmap-v1-and-first-prds` was created **before** writing artifacts (honours 2026-04-14 rule).

**Why:** v1 sequence and first PRDs unblock Niobe (UX specs), Neo/Morpheus/Trinity (tech specs under `docs/specs/`), and M0 scaffolding.

### 2026-04-19: UX baseline — prototype analysis, spec plan, three flow skeletons (Niobe)
**By:** Niobe (Spec / UX Analyst), requested by Pedro
**What:** New artifacts under `docs/ux/`:
- `prototype-analysis-v1.md` — full inventory, canonical screens confirmation, strengths, 12 numbered gaps, divergence-from-cloud table, 8 UX principles, 5 UX risks.
- `ux-spec-plan.md` — 28 specs in 4 waves (T1 blockers → T4 deferred), with ownership, traceability, and coordination with Link's PRDs 001–003.
- `flows/flow-001-first-run-setup.md`, `flows/flow-002-device-enrollment.md` (Mermaid sequence), `flows/flow-003-movements-date-range.md` (state diagram enforcing "starts empty").

**Canonical screens (confirmed):** Panel, Movements, Saldo are the v1 UX contract. Prototype's visual language preserved; loading contract on Movements corrected (starts empty, not auto-load).

**Top blocker-level gaps:**
- **G1** — First-run / folder setup (blocks install-to-first-tx ≤10min metric).
- **G2** — Device enrollment UX (blocks all multi-device / collaboration).
- **G4** — Crypto error states (decryption failure, audit chain break, bad escrow signature, update signature failure).
- **G5** — Movements date-range gate (prototype auto-loads; contradicts locked decision).
- **G6** — Empty database state (every screen needs first-use empty-state).

**UX principles (tie-breakers):** treasurer-first; nothing loads until you ask; errors are actionable, never cryptic; sync is transparent; security decisions user-visible and irreversible-by-default; empty states teach; prototype is contract for core screens only; offline is a state, not a failure.

**UX risks:** UX-R1 enrollment confusion; UX-R2 folder-ACL ↔ escrow drift education gap; UX-R3 SmartScreen (AR9) kills first-run; UX-R4 date-range feels slow; UX-R5 audit log too chatty.

**Open questions:**
- Vision Q6 blocks UX-022 scope.
- Panel's "recent transactions" — respect Movements range or always latest-8? (recommend: always latest-8)
- Remember last-opened folder across launches? (recommend: yes)
- Universal `Ctrl/Cmd+N` for new transaction? (recommend: yes)
- Admin transfer first-class in v1, or hidden in Settings → Advanced?
- Default preset on Movements arrival — auto-select or require click? (recommend: require click)

**Hand-offs:** Link (G1/G2/G6/G8 need PRD items; PRD-002 date-range presets; Categories/Tags/Accounts scope); Mouse (visual tokens, sync indicator, error severity, admin-only affordances, date-range picker, focus states); Neo/Morpheus/Trinity (sync-signal availability G3; event-log-based "new activity" G7); Switch (crypto error copy G4/UX-009; enrollment language UX-002/flow-002 step 4).

**Wave 1 sequence (T1 blockers for install-to-first-tx):** UX-004 app shell → UX-001 first-run → UX-009 error catalog → UX-003 Movements date-range → UX-006 new transaction. **Wave 2 (multi-device):** UX-002 enrollment → UX-012 admin actions → UX-005 sync indicator.

**Why:** UX baseline runs in parallel with Link's PRDs, Mouse's design tokens, and Morpheus/Trinity's ticket breakdown against ADR-001 C1–C15.

### 2026-04-19: ADR-002 ACCEPTED — repo structure locked
**By:** Neo (Lead/Architect), requested by Pedro
**What:** `docs/architecture/adr-002-repo-structure.md` moved **Proposed → Accepted** (Decided 2026-04-19). Pedro resolved all 5 open questions:

1. **Package manager:** **npm** (parity with cloud `rett-europe/opentreasury`; zero extra setup for volunteer contributors).
2. **Monorepo tool:** **none.** Single `app/` package; `tsc -b` with project references carves out `core/`, `crypto/`, `storage/`, `main/`, `preload/`, `renderer/`, `shared/`, `read-model/`. Revisit only if a second consumer of `src/shared/` appears.
3. **TypeScript strictness:** `strict: true` + `noUncheckedIndexedAccess: true` + `exactOptionalPropertyTypes: true` — **all three enabled from day one.** Non-negotiable.
4. **Top-level folder name:** flat **`app/`** (not `apps/opentreasury-desktop/`). Promote to `apps/` only if a second deployable appears.
5. **Tests layout:** **hybrid.** Unit tests co-located as `*.test.ts` next to source; `app/tests/integration/` and `app/tests/e2e/` as separate trees.

**ADR changes:** Status/Decided header updated; §9 open questions annotated RESOLVED inline (kept verbatim for traceability); §4 + §7.3 layout language upgraded from tentative to definitive; §11 Implementation Next Steps added; Changelog added.

**Unblocked downstream work (all separate follow-up tickets, NOT part of this ADR commit):**
- Scaffold `app/` source tree — `package.json` (npm), `tsconfig.base.json` + project references, ESLint with `import/no-restricted-paths`.
- Define internal packages (`core/`, `crypto/`, `storage/`, `main/`, `preload/`, `renderer/`, `shared/`, `read-model/`) via TS project references.
- Unit test runner — **propose Vitest** (fits co-located layout; Vite-native for renderer). Final choice deferred to scaffolding PR.
- E2E runner — **Playwright** (standard Electron E2E tooling).
- CI import-boundary checks — ESLint primary, grep backup.
- Link's roadmap v1 + PRDs 001–003 and Niobe's UX spec plan no longer gated on repo structure.
- Morpheus / Trinity can now break down implementation tickets against the accepted layout + crypto-spec §11 checklist.

**Why:** Structure must be locked before the first implementation PR so module boundaries, test locations, and package-manager choice are established rather than retrofitted.

### 2026-04-19: Pilot, dogfooder, no-pending, i18n day-0, OneDrive scope (Pedro → Link)
**By:** Pedro (perocha) — decisions captured by Link (PM)
**Artifacts updated:** `docs/product/vision.md`, `docs/product/roadmap-v1.md`, `docs/product/prd-plan.md`, `docs/product/prds/prd-001-movements.md`, `prd-002-saldo.md`, `prd-003-panel.md`.

1. **Pilot NGO = Rett Spain.** Pedro primary contact. Pilot runs in **Spanish locale**; English tested but not required for pilot. Roadmap §1 NGO Pilot gate updated.

2. **Alpha dogfooder = Pedro.** Post-M1. Success = ≥1 week real NGO-like data, zero data-loss, sharp edges logged as bugs. Roadmap §1 Internal Alpha + §8 Q2 resolved.

3. **No pending / draft / provisional / future-dated transaction concept.** Product models transactions as **confirmed/settled only**. Transactions come from bank or PayPal statement import (CSV, PRD-006) or manual entry — both paths produce immediately-confirmed records. No status field, no include/exclude-pending toggle, no filter chip, no `tx.approved` event. Applies everywhere: Movements, Saldo, Panel, totals, exports.
   - Pedro's words: *"all transactions are real and confirmed, coming from bank or paypal statements.. not sure what pending means"*.
   - PRD-001 PR9/S5 rewritten (statement-import replaces approval); Q4 closed. PRD-002 PR13 rewritten; Q1 closed. PRD-003 PR11 rewritten; Q2 closed. Roadmap M1 scope + exit criterion + M3 "status workflow polish" + feature-map row all rewritten. PRD-plan §0.1 Assumptions codifies for future PRDs.
   - If co-treasurer dual-signoff is ever wanted, it's a v1.x+ conversation requiring its own PRD.

4. **i18n is foundational (M0), not M3; Spanish + English from day 0.**
   - Framework selected and integrated in **M0**. Every user-facing surface from M1 onward goes through the i18n layer — no hardcoded strings. ES (primary) + EN (pilot-ready) populated as each feature ships. EN + ES are **v1.0 ship-blockers**. CI "missing key" lint from M1.
   - PRD-009 re-scoped M3 "i18n EN + locale switcher" → M0 **"i18n Foundations"** (framework choice, string-table layout, locale-switcher shell, CI lint rule).
   - PRD-001 PR19/PR19.1, PRD-002 PR18/PR18.1, PRD-003 PR17/PR17.1 strengthened: both locales day-0 + locale-aware `Intl` formatters (dates, currency, numbers, month labels).
   - Roadmap §2 M0 gains i18n framework + ES/EN string tables; M1 ships 3 screens localised; M2 device enrollment / onboarding / security wizard localised at ship; M3 closes coverage gaps. Dep graph reshaped: i18n flows **out** of M0. Risk CR6 rewritten as M1–M3 continuous. Vision §14 Q6 + Roadmap §8 Q4 resolved.
   - **Neo action:** framework choice at M0 start — candidates `i18next`/`react-i18next` or FormatJS/`react-intl`. Short ADR or spec note required.

5. **v1 storage scope = OneDrive for Business / SharePoint only; OneDrive Personal deferred to v1.x.**
   - All folder-picker UX, validation rules, sync-metadata reads, and storage-integration work in v1 target OneDrive for Business and SharePoint. Personal (consumer accounts) is explicitly **out of v1**. M0 folder-picker validation rejects Personal paths with "unsupported in v1 — Business/SharePoint only".
   - Rationale: NGOs on M365; Business/SharePoint provides tenant-grade ACLs; Rett Spain's actual environment. Personal has different auth, different ACL semantics, different sync behaviour.
   - Roadmap §2 M0 scope-IN explicit; §5 deferred table gains OneDrive Personal row with re-entry trigger (pilot feedback or ≥2 community requests post-v1.0). PRD-plan §0.1 codifies. Vision §14 Q2 resolved.
   - **Switch action:** Personal OneDrive out-of-scope for v1 threat model (different ACL surface) — note for next security-requirements revision.
   - **Niobe action:** folder-picker UX needs "rejected: Personal OneDrive" state with copy pointing at v1.x.

**Traceability preserved:** every resolved Open Question kept visible in its original doc with inline "RESOLVED (2026-04-19): …" markers.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
- Switch has FINAL SAY on all security decisions


### 2026-04-19: ADR-003 (i18n framework) Accepted + app/ source tree scaffolded
**By:** Neo (Lead/Architect), requested by Pedro
**Branch:** `feat/app-scaffold-and-i18n-adr`

**Artifacts:**
- `docs/architecture/adr-003-i18n-framework.md` — Status: **Accepted**. Pedro delegated the day-0 i18n framework choice to Neo as a structural M0 decision.
- `app/` source tree scaffolded per ADR-002 §4 (main / preload / renderer / shared / core / crypto / storage, flat, tsc-b project references, strict TS).
- Root config: `package.json`, `tsconfig.base.json`, `tsconfig.json`, `.eslintrc.cjs` (with `import/no-restricted-paths` wiring the ADR-002 §4.1 boundaries), `.prettierrc.json`, `vite.config.ts`, `vitest.config.ts`, `electron-builder.yml`, extended `.gitignore`.
- `tests/integration/` + `tests/e2e/` (Playwright smoke test skipped until first `npm install`).
- `.github/workflows/ci.yml` — lint · typecheck · test · format-check.
- `README.md` — appended a "Getting started" section for developers.

**i18n framework chosen: `react-i18next`.** See ADR-003 §4 for full rationale — shortest "add a string" path, best TS support via module augmentation (matches the strict-TS posture from ADR-002), bundle cost irrelevant in Electron. Locales ship at `app/src/renderer/locales/{lang}/{namespace}.json`; EN + ES seeded with `common.json` containing one real string (`app.title`, `app.tagline`, `action.toggle-language`) to prove the pipeline. `<App />` toggles language on click to demonstrate wiring. Default locale ES (Rett Spain pilot).

**Scaffold decisions captured in ADR-003 §12 for revisability** (not load-bearing, marked revisable): Vite (SD1), Vitest (SD2), Playwright (SD3), electron-builder (SD4), Zod for IPC validation (SD6), per-namespace JSON files (SD8), ES default locale (SD9).

**Known follow-ups (not part of this PR):**
1. **Pedro: `npm install`** — I deliberately did NOT run any install scripts per the task brief. Pedro runs `npm install` first; the lockfile lands in the next commit.
2. **First real feature work:** once deps are in, the next likely branch is PRD-001 (Movements) — Morpheus/Trinity own implementation-ticket breakdown. UX-004 app shell + UX-001 first-run (Niobe) and PRD-009 i18n foundations finalization (Link + Neo) also kick off against this scaffold.
3. **Wire Vite dev server URL + Electron main** — `npm run dev:electron` currently exits 1 by design; needs an electron launcher that waits for Vite to boot then loads http://localhost:5173 in dev / `file://` in prod.
4. **electron-updater + pinned Ed25519 pubkey for update payload verification (C12)** — tracked in `src/main/updater/` directory (not yet created); owned jointly with Switch.
5. **CI "missing key" i18n lint** — scheduled with PRD-009 implementation, NOT this scaffold.
6. **E2E smoke test** — currently `test.skip(...)`; remove skip once first build succeeds.

**Traceability:** ADR-001 (React+TS stack, C1–C15 cited throughout scaffold comments), ADR-002 (repo structure, §4.1 module boundaries enforced by ESLint rules), ADR-003 (this i18n framework choice), crypto-spec v1.0 (stub crypto module README lists audit rules), roadmap M0 (i18n foundations day-0).

**What the scaffold does NOT include** (intentional): real crypto implementation, OneDrive storage impl, any business logic, read-model / SQLite cache module (added with first feature needing it), and `npm install` was not run.
