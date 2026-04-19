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

### 2026-04-19: Panel-First Unlock for M1 → M1.25 Saldo (Link + Neo joint decision)
**By:** Link (Product Manager) + Neo (Lead/Architect), jointly — requested by Pedro
**Branch:** Reference artifacts in `.squad/decisions/inbox/`
**Status:** **Awaiting Pedro go/no-go**

**Summary:**
Shift M1 priority from Movements-centric completion to "Panel first, then Movements" sequence. Saldo defers to M1.25.

**Decision:** Sequence M1 as Panel → Movements, not Movements → Panel.

**Why this sequence:**
- **Movements** is 70% UI done but conceptually complex (date range, account/category CRUD, state mgmt). Takes 2–3 sprints to wire fully.
- **Panel** is conceptually simple (no gate, no sort, no filter — just recent-tx table + sparklines + balance totals). Takes 1 sprint to wire.
- **Panel is the treasurer's UX entry point.** Prototype shows dashboard-first; validate that early.
- **Panel has no empty-state complexity.** Auto-loads; no date-range gate; no sort persistence. Simplest path to prove the event-sourced core.
- **Saldo can ship M1.25.** It's a power-user screen (year-over-year drill-down), not the core loop.

**Implications (all agents):**

*For Neo (Architecture / Core):*
- Event-sourced core validation happens on Panel first (fewer state mutations; simpler read model for balance totals).
- Movements core wiring follows, exposing account/category mutation edge cases if any.
- M1 alpha unblocked 3–5 days sooner.

*For Trinity (UI / Implementation):*
- Panel sprint starts immediately (Niobe's Panel UX spec + prototype reference).
- Movements full form wiring (account picker, category picker, tag picker) starts in parallel after Panel is wired.
- Saldo implementation defers — don't allocate to M1 final sprint.

*For Niobe (UX):*
- Panel UX spec must include prototype reference block.
- Movements UX spec remains as drafted; timeline shifts right.

*For Morpheus (Core):*
- Phase 1: finalize `core/query/` interface (Panel-only, read-only). Gate: Vitest 100%.
- Phase 1b: wire IPC contract for Panel. Gate: IPC round-trip vitest.
- Phase 2 (parallel or M1+1): command-side Movements wiring.

*For Pedro (Product Lead):*
- Internal alpha gate now means "Panel + one Movements tx end-to-end" instead of "all three screens complete".
- Saldo still ships before public release, just not in M1 final.
- No scope loss; sequence change only.

**Work packages:**

**Phase 1: Panel MVP (1 sprint, unblocks Trinity → Morpheus → Trinity)**
- 1a. Core query surface (Morpheus, 2–3 days) — `queryRecentMovements(limit, offset)` → sorted DESC by created_at
- 1b. IPC contract for Panel (Morpheus + Trinity, 1 day) — `app/src/main/ipc/handlers.ts`, Zod schema
- 1c. Panel UI wiring (Trinity, 3–4 days) — recent-txs table + totals strip, read-only surface
- 1d. Crypto wiring for Panel reads (Morpheus + Switch, 3–4 days) — DEK load, event decrypt

**Phase 2: Movements full wiring (parallel to Phase 1 end, M1+8–12 days)**
- 2a. Command-side Movements (Morpheus, ~5 days)
- 2b. Movements form wiring (Trinity, ~5 days)
- 2c. IPC + crypto for Movements (Morpheus + Switch, ~3 days)

**Phase 3: Saldo (M1.25, after Panel proves the stack)**
- Same data layer, different query surface and layout.

**M1 exit criterion redefined:**
- Account → Tx → **Panel visibility** (not Saldo visibility; Saldo slides to M1.25).
- Movements structure UI complete; command-side (forms, filters, date selection) lands M1+1.

### 2026-04-19: Preload Built with esbuild Inline Plugin, Not vite-plugin-electron
**By:** Coordinator (lightweight direct action) — requested by Pedro  
**Branch:** main (commit 3c376fd)  
**Artifact:** vite.config.ts (lines 1–100, inline "opentreasury-preload-esbuild" plugin)  

**Decision:** Bypass `vite-plugin-electron` for preload build. Implement inline Vite plugin that calls esbuild directly with:
- **Format:** CJS (Electron sandbox requirement, ADR-001 §C7)
- **External:** electron
- **Hot reload:** `handleHotUpdate` triggers rebuild + full reload on preload source changes

**Why:** `vite-plugin-electron` runs two parallel rollup builds for preload in dev mode; both write to the same outdir and concatenate on disk, creating invalid CJS syntax (two valid bundles joined mid-statement). `emptyOutDir: true` only clears on first build, not subsequent rebuilds. Direct esbuild call with single invocation produces a valid, single output file.

**Gotcha:** Dev loop is NOT done until an Electron window actually renders content. Build success ≠ working app. Always verify visually.

**Implications:**
- Preload rebuilds faster (~100ms vs plugin overhead).
- Dev reload on preload changes verified working.
- Production build unaffected (uses vite build, same result).
- Future preload changes use this pattern, not vite-plugin-electron.

**Unblocked by this decision:**
- Niobe can finish Panel UX spec in parallel.
- Mouse can finalize Panel tokens.
- Trinity can start Panel UI from prototype immediately.
- Morpheus can design the `core/query` surface without waiting for command-side complexity.

**Risks & mitigations:**
| Risk | Mitigation |
|------|-----------|
| "Event sourcing doesn't scale to 10k events" | Panel proves it on day 1 with real data. If broken, pivot before Movements wiring lands. |
| "OneDrive conflict resolution missing" | Intentional. Single-device alpha doesn't need it. M2 adds it. |
| "Users expect full Movements CRUD on M1" | Scope redefinition documented. Panel + Movements read enough for internal alpha. |
| "Crypto keychain blocks Panel" | Risk low. Switch reviews crypto; `@napi-rs/keyring` pre-approved. Implement in parallel with UI. |

**Merge sequence:**
1. `fix/trinity-prototype-parity` → `main` (now) — Sticky-thead polish, low risk.
2. Create `feat/panel-first-spike` branch (from main) — Morpheus + Trinity collaborative sprint.
3. Panel lives in main by M1+5 days. Movements full wiring M1+10–12 days (parallel).
4. Saldo lands M1+14 days (M1.25 gate).

**ADR updates required:**
- ADR-002 §11 "Electron wiring" — Add checkpoint: "Phase 1 (Panel IPC) gates the main-process impl; Phase 2 (Movements) expands the handler surface. Concurrency & offline-first lands in M2 addendum."

**Why:** De-risk the event-sourced core on the simplest code path (read-only Panel). Unblock internal alpha non-empty. Preserve M1 scope discipline. Let the team prove single-device core before M2 multi-device concurrency.

**Cross-reference:** `.squad/decisions/inbox/link-next-milestone.md` (product rationale) and `.squad/decisions/inbox/neo-next-implementation.md` (architecture + work packages).

**Status update:** Awaiting Pedro go/no-go before spawning Phase 1 sprints (Morpheus + Trinity).

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

### 2026-04-19: Movements table header casing — reversal back to UPPERCASE
**Author:** Trinity (Frontend)
**Date:** 2026-04-19
**Branch:** fix/trinity-prototype-parity
**Status:** Ratified (Pedro) — supersedes the earlier natural-case experiment

## What happened

An earlier pass on this branch stripped `text-transform: uppercase` +
`letter-spacing: 0.08em` from `.ot-table thead th` based on a coordinator read
that the prototype used natural-case headers. That read was wrong. The
prototype CSS (`prototype/styles.css`, `.tx-table th`, lines 430–441)
unambiguously specifies:

```
.tx-table th {
  font-size: var(--font-xs);            /* 11px */
  letter-spacing: var(--ls-section);    /* 0.08em */
  text-transform: uppercase;
  font-weight: var(--fw-semibold);
  color: var(--clr-text-muted);
  background: var(--clr-surface);
  position: sticky; top: 0; z-index: 1;
}
```

Pedro visually confirmed the live prototype renders "FECHA", "CUENTA",
"OBSERVACIONES" in uppercase. Prototype CSS wins.

## Fix (shipped in this commit)

`app/src/renderer/components/Table/Table.css` — `.ot-table thead th` restored
to uppercase:

- `font-size: var(--font-size-11)` (11px, matches `--font-xs`)
- `text-transform: uppercase`
- `letter-spacing: 0.08em` (matches `--ls-section`)
- `font-weight: var(--font-weight-semibold)`
- `color: var(--color-text-muted)`
- `background: var(--color-surface-primary)` (opaque, so sticky thead never
  bleeds rows through)

## Lesson

When an agent's decision note flags a prototype discrepancy, trust the
prototype until the coordinator produces screenshot or CSS evidence to the
contrary. The prior deviation note on this same file was correct to flag the
divergence — we should have held on it rather than shipping the change.

## Related

- Sticky thead anchoring pattern now documented in AppShell scroll-isolation decision (below).

### 2026-04-19: AppShell scroll-isolation contract
**Author:** Trinity (Frontend)
**Date:** 2026-04-19
**Branch:** fix/trinity-prototype-parity
**Status:** Proposed — fundamental layout rule for every screen

## Problem

With a tall Movements table, the whole window was scrolling — topbar and sidebar
(including the user strip with the admin name) disappeared on scroll. This
breaks prototype parity and IA expectations: brand, tenant, language/theme
switch, search, and the logout control must always be on-screen.

## Decision

Only `.ot-shell__main` scrolls. The shell viewport is locked.

```
body              overflow: hidden;      height: 100%;
.ot-shell         height: 100vh; overflow: hidden;
                  display: grid;
                  grid-template-columns: var(--sidebar-width) 1fr;
                  grid-template-rows:    var(--topbar-height) 1fr;
.ot-shell__topbar grid-area: topbar; overflow: hidden;  // spans both columns
.ot-shell__sidebar grid-area: sidebar; overflow: hidden; min-height: 0;
                   display: flex; flex-direction: column;
  .ot-shell__nav          overflow-y: auto; min-height: 0;  // scroll if ever overflows
  .ot-shell__sidebar-spacer flex: 1;                        // pushes user-strip to bottom
  .ot-shell__user-strip   flex-shrink: 0;                   // pinned
.ot-shell__main   grid-area: main; overflow-y: auto; min-width: 0; min-height: 0;
```

Mirrors the prototype `.shell / .topbar / .sidebar / .main` pattern in
`prototype/styles.css` (`height: 100vh`, grid rows `60px 1fr`, grid columns
`240px 1fr`, `.main { overflow: auto; }`).

## Implications for future screens

1. **Never add `overflow: auto` / `overflow: scroll` to a full-page container
   inside `.ot-shell__main` unless you specifically want a nested scroll
   region.** Nested scrolls are almost always a bug — the user cannot tell
   which scroll-wheel target is under the cursor.
2. **Sticky elements anchor to `.ot-shell__main`.** The Movements table `thead`
   (`.ot-table thead th`) uses `position: sticky; top: 0` and the column
   headers stay visible while the user scrolls the transaction list. This also
   applies to future sticky filter bars, section headers, and table footers
   (`.ot-table__foot`).
3. **If a page needs a fixed-height region with its own scroll** (e.g. a split
   pane, a chat transcript, an audit log drawer), set `min-height: 0` on every
   ancestor flex/grid item down to that region so the flex algorithm doesn't
   balloon the outer layout. Preferred pattern: grid with explicit row sizes.
4. **Modals / drawers must still dim the full viewport.** Because `body` has
   `overflow: hidden`, overlays should be `position: fixed` with `inset: 0`
   and a high `z-index` (> `--z-topbar`).

## Related

- `.squad/agents/trinity/history.md` (AppShell grid entries).
- Sticky table header revert documented above.
- `prototype/styles.css` lines ~150–290 and line 283 (`.main { overflow: auto; }`)
  and lines 678–680 (`.main::-webkit-scrollbar`).

### 2026-04-19: Movements — bulk operations is a MUST-HAVE (scope addition)
**By:** Pedro (via Copilot)
**What:** Now that row selection works on the Movements table, bulk operations must be treated as a first-class feature. Not present in prototype, but a hard requirement for the product. Expected operations at minimum: bulk categorize, bulk assign subcategory/tags, bulk approve/reject status, bulk delete, bulk export. UI pattern: when ≥1 row is selected, reveal a contextual action bar (floating or pinned) showing count + available bulk actions.
**Why:** User-driven scope decision — treasury workflows involve reconciling many rows at once; individual-row edits don't scale for NGO/bookkeeping use cases.
**Status:** Scope accepted. Not implemented in current parity pass. Niobe + Trinity to spec the action bar UX next.

### 2026-04-19: Movements — add a tags/labels filter to the filter bar
**By:** Pedro (via Copilot)
**What:** The Movements filter bar must include a filter by tag (Etiquetas). Multi-select — show rows whose `tags` contain any of the selected tags (OR semantics). Not present in prototype; treated as a gap in the prototype, not an app gap. Should slot in alongside type chips / account / category / min-max / uncategorized.
**Why:** User-driven scope decision — once tags are used in practice (sprint tags, campaign tags, etc.) the filter becomes essential for day-to-day triage.
**Status:** Scope accepted. Not implemented in current parity pass. Trinity to add after the sticky-header + scroll-isolation fixes land.
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

## Panel-First Wave 1 — WI-1, WI-2, WI-3 COMPLETE

### 2026-04-19T18:25Z: Pedro approved Panel-first work package (Neo's 10-item plan) — Q1–Q6 GREENLIGHT

**By:** Pedro (perocha) via Copilot  
**Status:** ✅ APPROVED + IMPLEMENTED (WI-1/2/3 shipped)  
**Decisions Captured Below**

**Approvals given:**
- **Q1 ✅** Proceed with UX-005 as-is; Niobe refines in parallel.
- **Q2 ✅** Real 12-month sparklines (`getAccountSparklines`); if blocked, ship alpha without.
- **Q3 🔁 REFINED** Data model (Account + all entities) is a **replication of the cloud tool at https://github.com/rett-europe/opentreasury** unless that imposes a feature limitation. Morpheus must pull the schema shapes from that repo (likely Python/FastAPI models + Cosmos DB documents) and translate to TypeScript/Zod. Deviate only if there's a concrete reason; log any deviation as its own decision.
- **Q4 ✅** Custom SVG for 12-month bars chart (zero deps, matches prototype).
- **Q5 🔁 REFINED (overrides Neo's rec)** Panel's "Ver todos los movimientos →" link **pre-filters Movements to the current month** so the treasurer sees continuity. This supersedes PRD-001's "lands empty" default *only when entered via the Panel link*; direct Movements navigation still lands empty-on-open per PRD-001.
- **Q6 ✅** Ship Panel before Movements command-side — that IS the Panel-first premise.

**Why:** Unblocks the Panel-first work package. WI-1 (Morpheus) and WI-3 (Trinity) cleared to start in parallel. WI-2 (IPC contract) drafted inside WI-1.

**Standing directive extracted:** When designing domain schemas (accounts, transactions, categories, etc.), Morpheus SHOULD treat github.com/rett-europe/opentreasury as the reference implementation. Only deviate with a logged rationale.

### 2026-04-19T18:40Z: WI-1 + WI-2 Complete — Event-sourced read model + IPC contract

**By:** Morpheus (Backend Dev)  
**Status:** ✅ SHIPPED  
**Commits:** `0f427fe` (feat), `cf30e92` (docs)

**Deliverables:**
- **WI-1:** Event-sourced read-side (core/events + core/query)
  - Zod schemas: `tx.created`, `account.created`, `category.created`, `tag.created`
  - Entity types: Transaction, Account, Category, Subcategory, Tag (mirrored from cloud repo)
  - Reducers: `applyEvent()`, `replayEvents()`, `resetReadModel()`, `getReadModel()`
  - 5 query functions: `queryRecentTransactions()`, `getAccountBalances()`, `getMonthKPIs()`, `getAccountSparklines()`, `getAccounts()`
  - Vitest 100% coverage with realistic ULID fixtures

- **WI-2:** IPC contract + mock handlers
  - Zod request/response schemas for all 5 queries
  - Channel constants: `IPC_PANEL_GET_ACCOUNTS`, `IPC_PANEL_GET_ACCOUNT_BALANCES`, etc.
  - TypeScript types exported for Trinity immediate use
  - Mock handlers in `app/src/main/ipc/handlers/panel.ts` — deterministic fixtures

- **Cloud reference study:** `docs/schemas/cloud-reference-notes.md`
  - Field-by-field mapping of rett-europe/opentreasury Python models
  - Deviations logged: ULIDs vs UUIDs, simplified review_status, deferred features

**Unblocking:** Trinity can wire Panel UI to mock IPC calls immediately.

**Next:** WI-4 (OneDrive storage), WI-5 (crypto wiring), WI-6 (wire real core/query into handlers)

### 2026-04-19T18:45Z: WI-3 Complete — Panel UI wired to IPC

**By:** Trinity (Frontend Dev)  
**Status:** ✅ SHIPPED  
**Commits:** `7cdd132` (feat), `ed8ee62` (docs)  
**CI Gates:** typecheck · lint · test · build — ALL GREEN

**Deliverables:**
- **Panel components:** AccountCard, KPIStrip, recent transactions table
- **IPC integration:** panelApi.ts (Zod parse-on-receive, adapter for Morpheus contract)
- **PanelScreen states:** Skeleton (zero layout shift) → Loaded (5 IPC queries in parallel) → Error (retry button)
- **i18n:** New keys in `panel.*` namespace (ES + EN), 6 strings added, all required keys present
- **"Ver todos →" link:** Navigates to `/movements?range=this-month` (Pedro's Q5 refinement)
- **TypeScript fixes:** Added `shared` reference to renderer/tsconfig.json; made shared composite
- **8 new tests:** AccountCard balance coloring, KPIStrip aggregation, all passing

**Coordination:** Used Morpheus's WI-2 IPC contract. Real preload bridge wiring deferred to WI-6.

**Deferred (Wave 2):** Real sparklines (WI-7), 12-month bars chart (WI-8), empty states (WI-9), deep error handling (UX-005 §6)

**Next:** WI-6 (Morpheus wires preload handlers), WI-7/8 (sparklines + chart)

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

### 2026-04-19: Neo — Panel-First Work Package Decomposition (10 Work Items, M1 Sequencing)
**By:** Neo (Lead/Architect), requested by Pedro
**Branch:** Reference `.squad/decisions/inbox/neo-panel-first-work-package.md` (full artifact)
**Status:** **Proposed — awaiting Pedro answers to Q1–Q6 before first-wave spawn**

**Summary:**
Full work package decomposition for Panel-first M1 sequence: 10 sequenced work items (WI-1 through WI-10) with owners, acceptance criteria, dependency graph, and critical-path analysis.

**Core Findings:**
- **Current state:** `app/` scaffold green. Trinity's Panel stub UI exists (no data wiring). Morpheus has skeleton events, no core/storage/crypto.
- **Gaps:** Panel needs 5 read-model queries, event-sourced core, OneDrive storage, IPC contracts, and UI wiring.
- **First-wave recommendation:** 3 parallel spawns — WI-1 (Morpheus core), WI-2 (Morpheus+Trinity IPC), WI-3 (Trinity UI).
- **Critical path:** WI-1 → WI-2 → WI-3 + (WI-4→WI-5) → WI-6 → polish (WI-7/8/9/10).
- **M1 Panel alpha gate:** ~Day 10 when WI-6 lands (real data flows); days 11–15 = polish.
- **Total ETA:** 12–15 days (assumes Switch reviews WI-5 within 1–2 days).

**The 10 Work Items:**

| # | Owner | Scope | Est. Days | Parallel? | Blocks |
|---|---|---|---|---|---|
| WI-1 | Morpheus | Core event-sourced foundation (read-side) | 2–3 | ✅ Day 1 | WI-2, WI-4 |
| WI-2 | M+T | IPC contract for Panel | 1 | ⏸️ After WI-1 | WI-3, WI-6 |
| WI-3 | Trinity | Panel UI data wiring (mock IPC) | 3–4 | ✅ Day 1 | WI-7, WI-9, WI-10 |
| WI-4 | Morpheus | OneDrive event append (plaintext) | 3–4 | ✅ Day 2–3 | WI-5, WI-6 |
| WI-5 | M+Switch | Crypto layer (encrypt/decrypt events) | 3–4 | ❌ After WI-4 | WI-6 |
| WI-6 | Morpheus | Wire real core to IPC handlers | 1 | ❌ After WI-1/2/4/5 | WI-7, WI-8 |
| WI-7 | Trinity/Mouse | Panel sparkline rendering | 1–2 | ✅ Partial | — |
| WI-8 | Trinity/Mouse | 12-month bars chart | 1–2 | ✅ Day 1 | — |
| WI-9 | Trinity+Niobe | Panel empty states | 1 | ✅ Partial | — |
| WI-10 | Trinity | Loading / skeleton polish | 1 | ✅ After WI-3 | — |

**Six Open Questions for Pedro (must answer before first-wave spawn):**

- **Q1:** UX-005 (Panel spec) complete? *Recommendation: proceed WI-1–6; Niobe refines parallel.*
- **Q2:** Real sparklines M1 or fake seeds? *Recommendation: real (WI-1 includes it); ship Panel alpha with/without?*
- **Q3:** Accounts metadata (PRD-010)? *Recommendation: Neo drafts minimal schema (id, short, color, createdAt) as WI-1 prep.*
- **Q4:** Chart library (WI-8) or custom SVG? *Recommendation: custom SVG for M1 (simplest, matches prototype).*
- **Q5:** "Ver todos" link to Movements pre-filtered? *Recommendation: simple link, no pre-filter for M1.*
- **Q6:** Panel before Movements command-side? *Recommendation: yes — Panel proves stack, Movements M1+1.*

**Key Decisions Locked:**
- ✅ Panel-first sequence (Panel → Movements) unlocks core + crypto + IPC on simplest code path.
- ✅ First wave = 3 parallel: WI-1, WI-2 (after WI-1 stabilizes), WI-3.
- ✅ WI-4 + WI-5 (storage + crypto) can start day 2–3, parallelizing with WI-3 tail end.
- ✅ M1 Panel alpha gate = WI-6 lands (~day 10), renders real encrypted data.

**Next Steps:**
1. Pedro approves/modifies Q1–Q6.
2. Coordinator spawns WI-1 (Morpheus), WI-2 (Morpheus+Trinity), WI-3 (Trinity) as background agents.
3. Scribe merges inbox entry to decisions.md (deduplicates with existing "Panel-First Unlock" entry).

**Artifact:**
`.squad/decisions/inbox/neo-panel-first-work-package.md` — full work package with detailed WI-1 through WI-10 acceptance criteria, rationale, and risks/mitigations matrix.

---

### 2026-04-19: Panel mocks now mirror prototype/data.js verbatim (Trinity decision)
**By:** Trinity (Frontend Dev)
**Status:** Merged from inbox
**Commit:** c78002a

**Decision:**
The desktop Panel's IPC mock fixtures in `app/src/main/ipc/handlers/panel.ts` are now a direct port of `prototype/data.js` — same 5 accounts (`unicaja`, `caixa-ops`, `caixa-fin`, `caixa-0951`, `paypal`), same `oklch` colours, same April-2026 KPIs (48,843.79 / 30,750.19 / 18,093.60), same first-12 transactions with real Rett NGO descriptions.

**Why:**
The previous scaffolding (Santander Cuenta Principal / BBVA Corriente / PayPal tesoreria@rett.es with random amounts) made Panel look nothing like the prototype screenshots that are the product's north star per ADR-002. Visual parity is impossible to verify against unrealistic data.

**Implications for the rest of the team:**
- **Morpheus (WI-6):** When the real core/query calls replace the mock handlers, the prototype accountIds (`unicaja`, `caixa-ops`, …) can be reused as account "seed" slugs for a demo/onboarding fixture, or dropped once the real ULID ingest is wired. Either way, the contract shape did not change — only the mock payload. Your real resolver can slot in without touching ipc-contracts or panelApi.ts.
- **Cypher (tests):** Snapshot tests that captured the old Santander/BBVA strings will need updating. The new mock is stable (deterministic sparklines via a per-account string hash) so snapshots remain reliable.
- **Niobe (copy):** Prototype account *labels* are data, not copy — they stay in Spanish ("Principal", "Operaciones", "Eventos", "Donaciones", "FinRett") because they represent account names an NGO would configure, not UI strings.

**Non-decision:**
The IPC contract (`ipc-contracts/panel.ts`) was **not** changed. The mock overloads `categoryId` / `subcategoryId` to carry display labels as an interim convenience — WI-6 should return real IDs plus a separate resolver/lookup path (e.g. `getCategories`) that Panel can cache.

**Files touched:**
- `app/src/main/ipc/handlers/panel.ts` — mock payloads rewritten
- `app/src/renderer/screens/PanelScreen/PanelScreen.tsx` — per-row account-pill colouring uses `account.color` via `color-mix`
- `app/src/renderer/screens/PanelScreen/PanelScreen.css` — new card wrapper for the recent-movements table + footer link
- `app/src/renderer/components/AccountCard/AccountCard.css` — stripped duplicate rules; icon uses `--radius-md`, removed broken `min-width`
- `app/src/renderer/components/KPIStrip/KPIStrip.css` — stripped duplicate rules that shadowed `globals.css` prototype-parity recipe
- `app/src/renderer/styles/globals.css` — account-card grid gained a 4-col breakpoint at 1440px to bridge the 5→3 jump

---

### 2026-04-19: Transaction Schema + Validation Rules (WI-11, Morpheus decision)
**By:** Morpheus (Core/Domain)
**Status:** Merged from inbox
**Commit:** 8f2eb7b

**Decision:**
The `tx.created` event uses **positive `amount` + `type: 'income' | 'expense'`** — NOT a signed amount, NOT credit/debit split.

This matches the cloud FastAPI schema (`docs/schemas/cloud-reference-notes.md` §Transactions):
- Cloud: `amount: Decimal (positive, 12.2)` + `transaction_type: enum('income'|'expense'|'transfer'|'refund')`.
- Desktop M1 subset: `amount: number (> 0, finite)` + `type: 'income' | 'expense'` (transfer/refund deferred).

**Event payload shape (locked in `app/src/core/events/schemas.ts`):**
```ts
TransactionCreatedPayload = {
  id: string;              // ULID — transactionId
  date: string;            // YYYY-MM-DD
  type: 'income' | 'expense';
  amount: number;          // positive, finite
  currency: 'EUR';         // hardcoded for M1
  description: string;     // max 500 chars
  accountId: string;       // ULID — must exist
  categoryId: string | null;      // ULID or null
  subcategoryId: string | null;   // ULID or null
  tagIds: string[];               // array of ULIDs (may be empty)
  status: 'pending' | 'approved'; // review flag, NOT ledger state
  createdAt: string;       // ISO 8601 UTC — set by command via deps.now()
}
```

Envelope: `id` (event ULID ≠ transactionId), `type: 'tx.created'`, `datasetId`, `actorDeviceId`, `createdAt`, `dekVersion`, `version: 1`, `payload`.

**Command signature:**
```ts
createTransaction(
  input: CreateTransactionInput,
  deps: { now, newId, readModel, datasetId, actorDeviceId, dekVersion? }
): Result<TransactionCreatedEvent, ValidationError>
```

`newId()` is called **twice**: first for the event envelope `id`, then for the `payload.id` (transactionId). Both are ULIDs. They MUST differ.

**Validation rules (enforced at command boundary):**
| Code | Field | Rule |
|---|---|---|
| `TYPE_INVALID` | `type` | must be `'income'` or `'expense'` exactly |
| `AMOUNT_NON_POSITIVE` | `amount` | must be finite AND > 0. Rejects 0, negatives, NaN, Infinity. Sign carried by `type`, never by amount. |
| `CURRENCY_EMPTY` | `currency` | non-empty string after trim (schema currently pins to `'EUR'`) |
| `DESCRIPTION_EMPTY` | `description` | non-empty string after trim |
| `DATE_INVALID` | `date` | matches `YYYY-MM-DD` regex AND round-trips through `Date.toISOString().slice(0,10)` (rejects impossible calendar dates like `2026-02-31`) |
| `ACCOUNT_NOT_FOUND` | `accountId` | must exist in `deps.readModel.accounts` |

**Order:** type → amount → currency → description → date → account. Cheap checks first; account lookup last. First failure short-circuits.

**Cross-WI impact:**
- **WI-12 (IPC):** the IPC request schema for `createTransaction` MUST mirror `CreateTransactionInput`. Do NOT re-validate at the IPC boundary differently from the command — keep IPC as a thin pass-through. The command is the single source of truth for validation errors.
- **WI-13 (renderer form):** UI form fields must surface the six error codes as translatable messages. Amount input should be a non-negative number field (never show a sign toggle — use income/expense radio/segment for `type`). Map codes → i18n keys:
  - `TYPE_INVALID` → `movements.errors.typeInvalid`
  - `AMOUNT_NON_POSITIVE` → `movements.errors.amountNonPositive`
  - `CURRENCY_EMPTY` → `movements.errors.currencyEmpty`
  - `DESCRIPTION_EMPTY` → `movements.errors.descriptionEmpty`
  - `DATE_INVALID` → `movements.errors.dateInvalid`
  - `ACCOUNT_NOT_FOUND` → `movements.errors.accountNotFound`
- **WI-4′ (event log):** no impact — `TransactionCreatedEvent` is just another member of the `DomainEvent` union. The event log serializes/validates via the existing zod schemas.

**What's explicitly NOT in this shape (M1.5):**
- **`counterparty_name` / `counterparty_reference`:** cloud has them; desktop M1.5 does not. Deferring to a later WI.
- **`currency` other than EUR:** hardcoded for M1. Multi-currency is a future migration.
- **Signed amount or credit/debit fields:** rejected. Cloud never used them; adding would diverge from the cloud schema and require a read-model migration.
- **`transfer` / `refund` transaction types:** cloud has them; desktop M1.5 does not.
- **`originalAmount` (edit history):** will land with `tx.edited` event in a later WI.

**Reducer / read-model note:**
The existing `applyEvent` in `app/src/core/query/reducers.ts` already handles `tx.created` (WI-1). The read model stores a flat `transactions: Transaction[]` and computes `recentMovements` / `monthKPIs` / `accountBalances` on demand via queries — there are NO pre-materialized aggregates to update. Future WIs that add materialized projections (e.g., per-month buckets for Saldo) can extend the reducer; WI-11 did not require this.

**Tests:**
- `app/src/core/commands/createTransaction.test.ts` — 12 tests (happy path, all 6 error codes, optional fields, determinism of injected `now`/`newId`).
- `app/src/core/query/reducers.test.ts` — 2 tests covering the full command → event → reducer → query pipeline (3-transaction projection + out-of-order insertion sort).

All green (`npm test` → 66/66).

---

### 2026-04-19: EventLog interface — LOCKED contract for WI-4′ / WI-11 / (future) WI-4 (Morpheus decision)
**By:** Morpheus (Core/Backend)
**Status:** Merged from inbox
**Commit:** 73bfb8d
**Scope:** WI-4′ (M1.5 local-JSON adapter) + WI-11 (command-side write path). Supersedes nothing. Will be honoured by the M2 OneDrive+crypto adapter (WI-4).

**Interface:**
```ts
// app/src/core/eventLog/EventLog.ts
export interface EventLog {
  append(event: DomainEvent): Promise<void>;  // idempotent by event.id
  load(): Promise<DomainEvent[]>;             // insertion order
}
```

Where `DomainEvent` is the discriminated union already defined in `app/src/core/events/schemas.ts` (AccountCreated, CategoryCreated, TagCreated, TransactionCreated — WI-11 extends as needed).

**Guarantees:**
- **`append` is idempotent by `event.id`.** Re-appending the same event is a no-op. Callers MAY retry without deduping themselves.
- **`append` is durable on resolve.** The local adapter calls `fsync`. Network adapters (M2 OneDrive) will resolve only after the remote has acknowledged.
- **`load` returns every event ever appended, in insertion order.** Reducers assume this order is deterministic across restarts.
- **`load` tolerates per-line corruption.** Malformed NDJSON lines are skipped with a warning; the rest of the log is returned.
- **Empty log → `load()` returns `[]`** (not a thrown error, not `undefined`).

**Non-goals (by design):**
- No cursor / pagination — reducers are cheap for M1.5 volumes, and OneDrive's delta-token model will be hidden behind the same interface in M2.
- No query — this is a log, not a database. Query surface lives in `app/src/core/query/` and is populated by `replayEvents`.
- No delete — append-only. Tombstones (future) are just more events.
- No transactions / batching — callers append one event at a time.

**Contract for implementations:**
1. Validate nothing beyond `event.id` presence. Schema validation is the reducer layer's responsibility (Zod in `core/events/schemas.ts`).
2. Preserve byte-for-byte equality of serialized payloads so `load()[i]` deep-equals the `append()`ed event.
3. Surface I/O errors. Don't silently swallow, don't wrap in domain errors — callers need the original to decide retry vs. abort.

**Consumers:**
- **WI-4′ (this slice):** `main/bootstrap.ts` constructs a `JsonFileEventLog` under `app.getPath('userData')/dev-events/`, calls `load()` then `replayEvents(events)`. IPC read handlers in `main/ipc/handlers/panel.ts` then project over the hydrated read model.
- **WI-11 (command-side, in-flight):** `main/ipc/handlers/commands.ts` will call `eventLog.append(event)` then `applyEvent(event)` to update the live read model. Singleton is exported from `main/bootstrap.ts`.
- **WI-4 (M2, OneDrive + crypto):** swap the `JsonFileEventLog` constructor in `bootstrap.ts` for `OneDriveEventLog` + envelope encryption in the adapter. No other file should need to change.

**Adapter choice for M1.5: `JsonFileEventLog` / NDJSON:**
- One JSON object per line + trailing `\n`.
- File: `<userData>/dev-events/events.ndjson`.
- `append()` = `fs.open('a') → writeFile(line) → sync() → close()`.
- `load()` = `readFile → split('\n') → JSON.parse each → skip malformed`.
- In-memory `Set<event.id>` for idempotency; re-populated on `load()`.

**Dev-seed behaviour (bootstrap, not the adapter):**
When `events.ndjson` does not exist AND `NODE_ENV !== 'production'`, bootstrap emits prototype-shaped events (5 accounts / 8 categories / 6 tags / 30 txs) via `append()` before hydration. Never overwrites existing events. The adapter has no concept of seeding — seeding is a main-process concern.

---

### 2026-04-19: Morpheus — Movement schema v0.2 (subcategory/tags/status + nullable category)
**By:** Morpheus (Backend / Data Model), requested by Pedro
**Branch:** `fix/trinity-prototype-parity`
**Status:** Decided (applied, commit 56db75f)

**Scope:** Extended renderer contract (`interface Movement`) to match prototype Movements table column set. Supersedes Trinity's earlier gap note (merged into this decision).

**Schema Changes**

The `Movement` type now carries:

```ts
export type MovementStatus = 'pending' | 'approved' | 'rejected';

export interface Movement {
  readonly id: string;
  readonly date: string;
  readonly type: 'income' | 'expense';
  readonly amount: number;
  readonly currency: 'EUR';
  readonly description: string;
  readonly account: string;
  readonly category: string | null;    // null = uncategorised
  readonly subcategory: string | null;
  readonly tags: readonly string[];     // multi-label
  readonly status: MovementStatus;      // review workflow flag
}
```

**Rationale per field:**
- **`category: string | null`** — `null` is canonical "uncategorised" signal; empty strings also treated defensively.
- **`subcategory: string | null`** — already nullable, confirmed.
- **`tags: readonly string[]`** — multi-label transactions, matches prototype column. Always an array so renderers avoid null checks.
- **`status: 'pending' | 'approved' | 'rejected'`** — application-level review workflow (not accounting state). Ledger rows always confirmed at import; `status` is a reviewer flag rendered as colored badge via Mouse's `--color-status-*` tokens.

**Mock Data (v0.2)**

48 rows (Oct 2025 → Apr 2026) with deterministic seeding:
- `tags` — 0–3 picks from `['urgente','beca-2025','proyecto-a','auditable','recurrente']`, hashed on index.
- `status` — every 17th row `rejected`, every 7th `pending`, rest `approved` (~80/15/5).
- `category` — rows at `{4, 12, 27, 41}` forced to `null` for uncategorised filter coverage.

**Null-Safety Guards Added**

Three places in MovementsScreen.tsx (no behavior change):
1. Sort comparator: `(a.category ?? '')`.
2. `categoryOptions` dropdown skips `null` rows.
3. Category cell renders `—` when `category == null` (Trinity's columns pass will split into dedicated columns).

**Backend Implications**

When Movimientos graduates off mocks (PRD-001 PR15, ADR-001 C13), persistence layer mapping:

| Movement field | Journal event | SQLite projection |
|---|---|---|
| `category` | `tx.categorised { categoryId \| null }` | `tx.category_id INTEGER NULL` + join to `categories(name)` |
| `subcategory` | same event, `subcategoryId` | `tx.subcategory_id INTEGER NULL` |
| `tags` | `tx.tagged { add: string[], remove: string[] }` | `tx_tags(tx_id, tag_id)` M:N + `tags(id, label UNIQUE)` |
| `status` | `tx.reviewed { status }` | `tx.review_status TEXT NOT NULL DEFAULT 'approved'` |

**Open backend items for next pass:**
- Tags are a reference_data entity; need unique labels + referential integrity.
- `status` defaults to `'approved'` for CSV imports; manual entry UX may default to `'pending'` (Niobe/Trinity decision).
- Soft delete (cloud parity) orthogonal — lives on journal, not Movement type.
- Audit log (7-year TTL) applies to categorise/tagged/reviewed events like amount/date edits.
- ULID not UUID for `id` (per crypto-spec §11); mocks still use UUID; swap at IPC seam.
- Month filter follow-up: parse ISO strings OK for v0.2; when read model lands, expose `month` bucket (`YYYY-MM`) on projection to avoid string slicing.

**Why:** Trinity's columns pass (Trinity-movements-columns-pass, separate decision below) required expanded Movement type to render prototype columns. Backend mapping documented so Neo/storage tier can begin PRD-001 implementation against event-sourced journal.

### 2026-04-19: Trinity — Movements table columns + headers parity pass (ratification needed)
**By:** Trinity (Frontend Dev), requested by Pedro
**Branch:** `fix/trinity-prototype-parity`
**Status:** Delivered + test suite green; two points need team ratification

**Three-Part Pass**

Most mechanical prototype port. All gates green: typecheck, lint (0 warnings), 39 tests, build.

**Part 1: Prototype Columns Implementation**
- New columns: checkbox (selection-ready), account-pill, subcategory (split from category), tags chips, status badge
- Removed `max-width: 1440px` from `.ot-movements` — page flexes to container width
- New globals recipes: `.ot-tag-chip`, `.ot-tag-chip-row`, `.ot-badge--rejected`, `.ot-text-muted`
- Table primitive header type: `string` → `ReactNode` for render flexibility
- EN/ES status i18n keys: `common.movement.status.{pending,approved,rejected}`

**Part 2: Table Header Styling — ⚠️ DEVIATION FLAGGED FOR RATIFICATION**

**Applied implementation:** Natural case headers ("Fecha", "Descripción"), no `text-transform: uppercase`, no `letter-spacing`.

**Prototype contract conflict:** `prototype/styles.css:430` still sets `text-transform: uppercase` + `letter-spacing: var(--ls-section)` on `.tx-table th`. Prototype JSX writes natural case but CSS uppercases at render — rendered prototype output is UPPERCASE.

**Per north-star rule** (prototype is visual + interaction contract), this task *deviates* for the table-header recipe:
- **Ask:** Niobe / Link pick one and update either `prototype/styles.css` or `Table.css` so the two agree
  - Option A: drop uppercase from `.tx-table th` in prototype (3 lines) → app + prototype aligned
  - Option B: restore uppercase in `app/src/renderer/components/Table/Table.css` (font-size 11, letter-spacing 0.08em, text-transform uppercase)
- **Impact:** no other screen uses `.ot-table` today; change is contained. KPI strips, sidebar labels carry own uppercase rules and are unaffected.

**Part 3: Rejected Status Badge — Proxy Token Decision for Mouse**

No `--color-status-rejected-*` tokens exist in Mouse v0.2 (prototype doesn't render rejected rows either). Added `.ot-badge--rejected` in globals using `--color-expense-default` + `--color-expense-bg` as proxy, mirroring pending/approved shape.

**Ask:** Mouse — do you want dedicated `--color-status-rejected` / `--color-status-rejected-bg` tokens in v0.3, or is the expense-palette proxy acceptable? Rejected rows are rare by definition; current shortcut is probably OK, but flagging for clarity.

**Part 4: Page-Level Width**

Removed `max-width: 1440px` cap. Prototype `.main` has no cap; page now flexes to full container width. At very wide viewports (>1920px) the filter bar stretches but chip group / selects stay natural sizes — only the right-side "Limpiar filtros" ghost button floats further right. Acceptable per prototype.

No per-breakpoint cap needed. If 4K+ becomes an issue later, Mouse can add shell-level `max-width` in tokens/globals — not a per-screen one.

**Files Modified**

- MovementsScreen.tsx / .css (header + amount render, density)
- Table.tsx / .css (headers + new column types)
- globals.css (prototype recipes, spacing migration)
- locales/{en,es}/common.json (status i18n keys)

No primitive APIs changed; no token file edits; no prototype edits.

**Build Status**

| Gate | Result |
|------|--------|
| typecheck | ✅ |
| lint | ✅ 0 warnings |
| test | ✅ 39/39 |
| build | ✅ (34.92 kB CSS, 245.85 kB JS) |

**Why:** Movements table is the final UI screen needing prototype parity before M1 entry. Flagging two ratification points explicitly so design + product can resolve the header-casing and token-scope questions before this ships.

### 2026-04-19: Pending-tone ratification + Inter font self-hosted (via Copilot)
**By:** Pedro (perocha) — decisions captured by Scribe on behalf of Trinity font fix + Copilot directive
**Branch:** `fix/trinity-prototype-parity`
**Status:** Decided (applied)

**1. Pending-tone ratification into tokens v0.2**

Pending tone from the prototype (`#e65100` on `#fff3e0`) is ratified into tokens v0.2. The prior v0.1 design-system policy of "no pending tone anywhere" is formally reversed. Per the new north-star rule (prototype wins over design system), the prototype's pending badge is authoritative. No separate Link sign-off required — Pedro is the sole product reviewer for solo-dev phase.

**Impact:** Unblocks tokens-v0.2 merge path + any Movements row status work (status badge now has color design).

**2. Inter font self-hosted via @fontsource/inter**

**Problem:** Arrow glyphs (↑/↓) rendering too light. Root cause: Google Fonts CDN @import failing in Electron, falling back to system fonts with thinner strokes.

**Solution applied:** Bundled Inter via `@fontsource/inter`, per-weight imports in main.tsx (400, 500, 600, 700), CDN @import removed from tokens.css.

**Outcome:** Pedro confirmed visually — arrows much bolder, font rendering consistent across system.

**Why:** Electron doesn't load external CDN reliably; self-hosting resolves the issue. Font is now bundled as Vite asset and loads offline consistently.

### 2026-04-19: Table header capitalization + sticky-header clipping fix (CSS polish)
**By:** Trinity (Frontend Dev)
**Branch:** `fix/trinity-prototype-parity`
**Commit:** 2508ba0
**Status:** Delivered ✅

**Problem 1: Inconsistent header capitalization**

After Movements table columns parity pass, table headers were inconsistent:
- `tags` column (non-sortable): rendered UPPERCASE via `.ot-table th { text-transform: uppercase; }`
- Other columns (sortable): rendered natural case because `.ot-table__sort-btn` (button element) had UA default `text-transform: none`, overriding the inherited rule

**Fix:** `.ot-table__sort-btn` now inherits both `text-transform` and `letter-spacing` from parent `th`:
```css
.ot-table__sort-btn {
  text-transform: inherit;
  letter-spacing: inherit;
}
```

**Problem 2: Sticky table header clipped off-screen on scroll**

Pedro reported table headers disappeared when scrolling past the Movimientos table height.

**Root cause:** `.ot-table-wrap { overflow: hidden }` establishes a **scroll containing block**, which traps `position: sticky` descendants inside its boundary. When the wrap scrolls off-screen in `.ot-shell__main`, the sticky thead goes with it.

**Fix:** Changed `.ot-table-wrap` from `overflow: hidden` to `overflow: clip`:
- `overflow: clip` still visually clips children → rounded corners preserved
- `overflow: clip` does **NOT** create a scroll container → `position: sticky` escapes to the nearest scrolling ancestor (`.ot-shell__main`), so headers stay pinned as intended
- Electron/Chromium fully supports `overflow: clip`

**Durable Rule:**

When a wrapper element needs rounded-corner clipping **AND** contains a `position: sticky` descendant that must anchor to an outer scroll container, use `overflow: clip` (not `overflow: hidden`). Document in CSS so future devs don't "optimize" it back.

**Scope:** `app/src/renderer/components/Table/Table.css` only (2 edits)

**Impact:** Table now renders with consistent header capitalization and sticky headers remain visible during scroll.

**Test Status:** ✅ 39/39 tests pass, lint 0 warnings, build green

### 2026-04-19: .ot-shell__main carries NO top padding — sticky scroll isolation
**By:** Trinity (Frontend Dev)
**Date:** 2026-04-19
**Branch:** ix/trinity-prototype-parity
**Commit:** 662de83
**Status:** Delivered ✅

**Problem:** Rows rendering above the sticky <thead> when scrolling the Movimientos table. User (Pedro) reported transactions "pass behind the header to the top of the screen."

**Root cause:** .ot-shell__main had padding: var(--space-9) var(--space-10). The padding-top area (~48 px) is part of the scrollport. Sticky 	op: 0 anchors to the scrollport top — but scrolled content can be painted through the padding band, so rows pass over and above the pinned thead strip.

**Decision:**

1. .ot-shell__main keeps its **horizontal** and **bottom** gutter but **its padding-top is 0**:
   `css
   padding: 0 var(--space-10) var(--space-9);
   `

2. The top gutter moves onto .ot-page-header (the first in-flow child on every screen — Panel, Movimientos, Saldo):
   `css
   .ot-page-header { padding-top: var(--space-9); }
   `

**Contract:** Every future screen MUST start with a first-child element that owns the top gutter. If a new screen uses a different top element, it must carry padding-top: var(--space-9) or equivalent, otherwise it renders flush against the topbar. Sticky strips inside .ot-shell__main may rely on the scrollport top being unpadded — do not reintroduce padding-top on .ot-shell__main.

**Files changed:**
- pp/src/renderer/screens/AppShell/AppShell.css — .ot-shell__main padding
- pp/src/renderer/styles/globals.css — .ot-page-header padding-top

**Verification:** ✅ typecheck · ✅ lint (0 warnings) · ✅ 39/39 tests · ✅ vite build.

**Related:** .squad/skills/css-sticky-patterns/SKILL.md gotcha #3 (padded scroll container leaves gap above sticky).


### 2026-04-19: Sticky mask bands must cover the wrapper's side borders (mask-band polish)
**By:** Trinity (Frontend)
**Branch:** `fix/trinity-prototype-parity`
**Commits:** `1de5dc7` (mask band introduced), `1350d95` (side-border polish)
**Status:** Delivered ✅
**Related:** `.squad/skills/css-sticky-patterns/SKILL.md` §4; session log `.squad/log/20260419T145000Z-trinity-mask-band-side-borders.md`; prior inbox notes `trinity-table-sticky-clip.md` and `trinity-sticky-padding-gap.md`.

**Problem**
The 28 px `--sticky-top-offset` mask band (`.ot-table thead th::before`) introduced in 1de5dc7 showed 1 px vertical hairlines on each side while scrolled. Band color correct; edges not seamless.

**Root cause**
The mask pseudo is anchored to the `<th>` (`left: 0; right: 0`), so horizontally it spans only the th's interior — inside `.ot-table-wrap`'s padding edge. `.ot-table-wrap` has `border: 1px solid` + `overflow: clip`. Once the wrap's top has scrolled out of view, its left/right borders keep rendering full-height across the 0..28 px pin band, flanking the mask. Pseudo-elements do **not** inherit `border` from the host, so the hairlines weren't from the pseudo — they were the wrap's own card-frame borders showing through the sides of the mask's horizontal extent.

**Decision (hybrid fix)**
When a sticky mask band lives inside a bordered wrapper:

1. **Extend the mask horizontally past the wrapper's side borders.** Use first/last-child negative offsets on the pseudo (`left: -1px` / `right: -1px` matching the wrap's border width).
2. **Pair with `overflow-clip-margin` on the wrap** equal to the border width, so `overflow: clip` permits the mask to paint that 1 px outside the padding edge. Without this, the negative offsets are clipped away.
3. **Declare `border: 0` on the mask pseudo** as a defensive no-op. Pseudos default to no border, but declaring it documents intent and guards against future cascade leaks (e.g. a utility that globally sets `border` on `::before`).
4. **Verify the mask is visually absent at scroll=0.** The pseudo sits above the wrap's padding box at rest; `overflow: clip` (within the clip-margin tolerance) hides it until the sticky element actually pins. Do not rely on visibility toggles or JS — structural clipping is the correct mechanism.

**Implementation reference** — `app/src/renderer/components/Table/Table.css`:

```css
.ot-table-wrap {
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-lg);
  overflow: clip;
  overflow-clip-margin: 1px;
}

.ot-table thead th::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  height: var(--sticky-top-offset, 0);
  background: var(--color-surface-app);
  border: 0;
  pointer-events: none;
}
.ot-table thead th:first-child::before { left: -1px; }
.ot-table thead th:last-child::before  { right: -1px; }
```

**Scope**
Applies anywhere a sticky mask band pattern is used inside a bordered card/wrapper. Today: only `.ot-table thead th::before`. If future screens repeat the pattern (e.g. sticky section headers inside bordered panels), apply the same three rules. Documented as gotcha §4 in `.squad/skills/css-sticky-patterns/SKILL.md`.

**Files changed**
- `app/src/renderer/components/Table/Table.css`
- `.squad/skills/css-sticky-patterns/SKILL.md` (§4)
- `.squad/agents/trinity/history.md`

**Gates:** ✅ typecheck · ✅ lint (0 warnings) · ✅ 39/39 tests · ✅ vite build.

**Open questions:** none. `overflow-clip-margin` ships in Chromium 90 (2021); current Electron is well past that baseline.

---

## 2026-04-19: Sticky-thead top border + rounded corners (Commit 38038a9)

**By:** Trinity (Component Agent) + Scribe (Session Lead)  
**Branch:** ix/trinity-prototype-parity  
**Scope:** pp/src/renderer/components/Table/Table.css  
**Status:** ✅ Merged (gates all green)

After shipping the mask-band side-border fix (1350d95, gotcha #4), two CSS polish items remained on the Movements table card:

1. **At rest:** the wrap's 1px top border erased by mask pseudo bleed on block axis
2. **When stuck:** rounded top corners lost (overflow:clip doesn't trap sticky)

### Decision 1: Use overflow-clip-margin-inline: 1px

Constrains clip bleed to horizontal axis only. Keeps side-border bleed fix while restoring zero bleed on block axis. The mask pseudo's bottom 1px no longer paints over the wrap's top border.

`css
.ot-table-wrap {
  overflow: clip;
  overflow-clip-margin-inline: 1px; /* NOT overflow-clip-margin: 1px */
}
`

**Rationale:** Per-axis longhands supported in Chromium 122+; Electron 41 is on ~Chromium 134.

### Decision 2: Unconditional inner-radius on first/last th cells

The thead's first and last cells inherit the wrap's inner radius (calc(var(--radius-lg) - 1px)). At rest this is a no-op (th geometry already matches wrap's inner curve). When thead sticks and wrap scrolls, those corners become the visible pinned top edge, preserving card silhouette.

`css
.ot-table thead th:first-child {
  border-top-left-radius: calc(var(--radius-lg) - 1px);
}
.ot-table thead th:last-child {
  border-top-right-radius: calc(var(--radius-lg) - 1px);
}
`

**Rejected:** scroll-driven .is-stuck class (adds runtime state), radius on <thead> (browser inconsistency), radius on mask ::before (sits above th, can't provide corners).

### Skill Updates

Added to .squad/skills/css-sticky-patterns/SKILL.md:

- **Gotcha #5:** overflow-clip-margin bleed is axis-scoped for a reason — watch for masks anchored at ottom: 100% of sticky elements inside bordered wraps
- **Gotcha #6:** Sticky elements inside overflow: clip wraps escape the radius — match the wrap's inner radius on sticky element corners (no-op at rest, preserves silhouette when stuck)

### Quality Gates
✅ Typecheck · Lint (0-warn) · Test (39/39) · Build

### Commit Info
- Author: perocha <pedrojrocha@outlook.com>
- Date: 2026-04-19T16:46:21+0200
- Files: Table.css (+28, -5), SKILL.md (+127, -0)

---

## 2026-04-19: Morpheus — WI-12 IPC contract (transaction.create + movements.list)
**Status:** Finalized
**By:** Morpheus (Backend) — implementation delivered, recorded for cross-agent reference
**Branch:** main (commits 4495e51 + d894382)
**Artifact:** .squad/decisions/inbox/morpheus-ipc-transaction-contract.md → merged into decisions.md

# Morpheus — WI-12 IPC contract (transaction.create + movements.list)

**Status:** Finalized 2026-04-19
**Owner:** Morpheus (Backend)
**Consumers:** Trinity (renderer), future IPC authors

This document records the locked IPC contract Trinity + future devs consume.
Source of truth is `app/src/shared/ipc-contracts/transaction.ts` and
`app/src/shared/ipc-contracts/movements.ts` — this is a summary for
decision-history. When the files diverge from this doc, the files win.

## Channel 1: `transaction:create`

Creates a new transaction. Runs the WI-11 command, persists the event to the
EventLog, and updates the in-memory read model.

### Request — `CreateTransactionRequest`

| Field          | Type                           | Required | Notes                                           |
|----------------|--------------------------------|----------|-------------------------------------------------|
| `accountId`    | `string`                       | yes      | Boundary-level check `min(1)`; existence is a business rule (`ACCOUNT_NOT_FOUND`). |
| `date`         | `string` `YYYY-MM-DD`          | yes      | Business rule: must be a real calendar date.   |
| `type`         | `'income' \| 'expense'`        | yes      | Sign is carried by `type`, amount is always > 0.|
| `amount`       | `number > 0`, finite           | yes      |                                                 |
| `currency`     | `'EUR'`                        | yes      | Multi-currency deferred.                        |
| `description`  | `string` 1–500 chars           | yes      |                                                 |
| `categoryId`   | `string \| null`               | no       | Defaults to `null`.                             |
| `subcategoryId`| `string \| null`               | no       | Defaults to `null`.                             |
| `tagIds`       | `string[]`                     | no       | Defaults to `[]`.                               |
| `status`       | `'pending' \| 'approved'`      | no       | Defaults to `'approved'`.                       |

### Response — `CreateTransactionResponse` (discriminated union)

```ts
| { ok: true;  event: TransactionCreatedEventWire }
| { ok: false; error: { code: TransactionValidationErrorCode; message: string; field?: string } }
```

`TransactionValidationErrorCode` values:

- `ACCOUNT_NOT_FOUND` — `accountId` not in read model
- `AMOUNT_NON_POSITIVE` — amount `<= 0`, NaN, or Infinity
- `CURRENCY_EMPTY` — currency blank
- `DATE_INVALID` — not YYYY-MM-DD or not a real calendar date
- `DESCRIPTION_EMPTY` — blank description
- `TYPE_INVALID` — type not in enum
- `SCHEMA_INVALID` — top-level zod parse failed (renderer sent malformed payload)
- `INTERNAL` — unexpected throw in the handler; `message` carries the cause

**Invariants:**

- Nothing throws across IPC. Validation failures are always structured results.
- Idempotency: the EventLog dedupes by `event.id`. A successful response for a
  previously-seen id is valid but does NOT re-apply the reducer.
- Event envelope is stamped with runtime `datasetId` + `actorDeviceId` + new
  ULID ids from `app/src/main/ids.ts` (`newUlid`).

## Channel 2: `movements:list`

Returns the full list of transactions from the read model, projected into the
wire-level `MovementRecord` shape (IDs, not labels). Label resolution
(`accountId` → `accountLabel` etc.) is the renderer's job per WI-14.

### Request — `MovementsListRequest` (all fields optional)

| Field      | Type                  | Notes                                |
|------------|-----------------------|--------------------------------------|
| `accountId`| `string`              | Exact match on `accountId`.          |
| `dateFrom` | `string` `YYYY-MM-DD` | Inclusive lower bound.               |
| `dateTo`   | `string` `YYYY-MM-DD` | Inclusive upper bound.               |
| `limit`    | `number`, positive int, ≤5000 | Defaults to unbounded.        |
| `offset`   | `number`, non-negative int    | Defaults to 0.                |

### Response — `MovementRecord[]`

Same columns as `recentTransactionSchema` in `panel.ts`; `Movement` is exported
as an alias so either name compiles.

```ts
interface MovementRecord {
  id: string;
  date: string;           // YYYY-MM-DD
  type: 'income' | 'expense';
  amount: number;         // > 0
  currency: 'EUR';
  description: string;
  accountId: string;
  categoryId: string | null;
  subcategoryId: string | null;
  tagIds: string[];
  status: 'pending' | 'approved';
  createdAt: string;      // ISO 8601 UTC
}
```

**Sort:** DESC by `date` then by `createdAt`. Most recent first.
**No structured-error discriminated union** — `movements:list` is a pure query
with no validation failures reachable from valid input; zod parse errors on
the request side will propagate as handler throws (caught by ipcMain and
surfaced as Electron IPC errors). Trinity should wrap the caller in a try/catch
if she wants to tolerate shape mismatches during dev.

## Preload surface

`window.opentreasury` grows two new namespaces (matching `panel.*` pattern):

```ts
transaction: {
  create(input: CreateTransactionRequest): Promise<CreateTransactionResponse>;
},
movements: {
  list(filter?: MovementsListRequest): Promise<MovementRecord[]>;
}
```

Exposed via `contextBridge.exposeInMainWorld('opentreasury', api)` in
`app/src/preload/index.ts`. Channel constants (`IPC_TRANSACTION_CREATE`,
`IPC_MOVEMENTS_LIST`) are re-exported from the shared contracts — never
hardcode the string in renderer or preload.

## Files touched

- `app/src/shared/ipc-contracts/transaction.ts` (new)
- `app/src/shared/ipc-contracts/movements.ts` (new)
- `app/src/main/ipc/handlers/transaction.ts` (new, factory)
- `app/src/main/ipc/handlers/movements.ts` (new, factory)
- `app/src/main/ipc/handlers.ts` (registration)
- `app/src/main/ids.ts` (new — `newUlid`, `DATASET_ID`, `ACTOR_DEVICE_ID`)
- `app/src/preload/index.ts` (two new API methods)
- Tests: `app/src/main/ipc/handlers/{transaction,movements}.test.ts` (11 tests,
  in-memory EventLog stub, fresh reducer per test)

## Verification

- `npx vitest run app/src/main/ipc/handlers` — 11/11 green
- `npm test` — 81/81 green
- `npm run typecheck` / `npm run lint` — clean
- `npm run build` — clean (dist/main + dist/preload + dist/renderer)
- `node --check dist/preload/index.cjs` — exit 0 (preload CJS bundle valid)


---

## 2026-04-19: Neo — E2E Vertical Slice Plan (M1.5 Storage Fallback Decision)
**Status:** Decided + Implemented
**By:** Neo (Lead/Architect) — re-sequencing decision, endorsed by Pedro
**Artifact:** .squad/decisions/inbox/neo-e2e-vertical-slice-plan.md → merged into decisions.md

# Neo — E2E Vertical Slice Plan (M1.5)

**Date:** 2026-04-19
**Requested by:** Pedro
**Status:** Proposed — decision requested on storage fallback (see §5)

## 1. Where we are now

- **Panel screen:** shipped and wired through real IPC bridge. Handlers return **mock** data (see `app/src/main/ipc/handlers/panel.ts`; Morpheus WI-1/WI-2/WI-3 landed).
- **Event-sourced core:** event schemas + read-model queries + reducers exist (`app/src/core/events`, `app/src/core/query`). **No commands, no append path, no storage.**
- **Movements screen:** UI exists (`MovementsScreen.tsx`) but reads `getMockMovements()` directly in the renderer — no IPC, no core, no add-transaction form.
- **Net:** we can *read* a fake world. We cannot *write* anything. Nothing persists across app restarts.

## 2. Gap to a real E2E scenario

To let Pedro **add a transaction → see it in the list → see Panel KPIs + recent movements update**, we need, minimally:

1. **Core write path** — `commands/createTransaction.ts` (pure: request + state → event[]), plus a `TransactionCreated` event shape (already half-there in schemas).
2. **Event log persistence** — append one event file per command. Either WI-4 (OneDrive) or a **local-JSON dev fallback** (see §5).
3. **Append-and-project orchestrator** in main — load log, fold reducers into in-memory read model, expose a "dispatch command" entry point that appends + re-projects.
4. **Movements IPC contract** — `movements.list`, `transaction.create` (Zod schemas, handler, preload bridge, typed client) — mirrors the Panel IPC pattern Morpheus already established.
5. **Add-transaction modal** — form UI (account, date, amount, type, category, description) per prototype; triggers `transaction.create`.
6. **Wire MovementsScreen to real IPC** — drop `getMockMovements`, subscribe to a store that re-fetches after `transaction.create` resolves.
7. **Panel re-read** — after a successful create, invalidate Panel queries (simple event-bus ping or re-run loaders on window focus + on command success).

## 3. Updated WI sequencing — target: **M1.5 Vertical Slice** demo

| # | WI | Owner | Shape | Status |
|---|----|-------|-------|--------|
| WI-1 | Core read model | Morpheus | ✅ done | done |
| WI-2 | Panel IPC contract | Morpheus | ✅ done | done |
| WI-3 | Panel UI wiring | Trinity | ✅ done | done |
| **WI-4′** | **Local-JSON event log (dev fallback)** — `app/src/storage/local/` append-only `events/*.json`, plaintext, no crypto | **Morpheus** | **NEW — critical path** | next |
| **WI-11** | **Transaction command** — `core/commands/createTransaction.ts` + `TransactionCreated` event + reducer update for movements/KPIs | **Morpheus** | **NEW — critical path** | next |
| **WI-12** | **Movements IPC contract** — `movements.list`, `transaction.create` (schemas, handlers, preload, client) | **Morpheus + Trinity** | **NEW — critical path** | next |
| **WI-13** | **Add-Transaction modal + Movements real-data wiring** — form per prototype, replaces `getMockMovements`, calls `transaction.create`, refetches list + nudges Panel | **Trinity** | **NEW — critical path** | next |
| **WI-14** | **Panel invalidation** — simple "command dispatched" event bus so Panel loaders re-run | **Trinity + Morpheus** | **NEW — critical path** | next |
| WI-4 | OneDrive event append (real) | Morpheus | ⏸ **deferred to M2** | later |
| WI-5 | Crypto layer (age/XChaCha) | Morpheus + Switch | ⏸ **deferred to M2** | later |
| WI-6 | Wire real core to Panel handlers (now folded into WI-14) | Morpheus | merged | — |
| WI-7/8/9/10 | Sparklines, 12-month bars, empty states, skeletons | Trinity / Mouse | ⏸ polish after M1.5 | later |

**Critical path to M1.5:** WI-4′ → WI-11 → WI-12 → WI-13 → WI-14. Estimate: **4–6 working days**, mostly Morpheus on days 1–3, Trinity on days 3–5, joint wiring day 5–6.

**Deferred (explicit):** OneDrive sync, crypto at rest, multi-device concurrency, sparklines, 12-month chart, deep empty states. None of these block a local single-user "add-and-see" demo.

## 4. Near-term plan — next 3 WIs to pick up

### WI-4′ — Local-JSON event log (Morpheus)
- **Shape:** `app/src/storage/local/eventLog.ts` — `append(event): Promise<void>` writes `{ulid}.json` under `%APPDATA%/opentreasury/dev-events/`; `load(): Promise<Event[]>` reads + sorts by ULID; nothing else. No encryption, no OneDrive, no locking (single-writer dev mode).
- **Done =** vitest covers round-trip append + load; main process uses it at startup to hydrate the read model.

### WI-11 — Transaction command + projection (Morpheus)
- **Shape:** `core/commands/createTransaction.ts` pure function; `TransactionCreated` event in schemas; reducer feeds both `recentMovements` and `monthKPIs` projections. Existing read-model queries automatically reflect new state.
- **Done =** unit tests: append 3 TransactionCreated events → `queryRecentTransactions` returns them newest-first; `getMonthKPIs` reflects totals.

### WI-12 — Movements IPC + WI-13 Add-Transaction modal (Morpheus + Trinity, parallelizable)
- **Shape:** Contract package `shared/ipc-contracts/movements.ts` (Zod schemas for `list` + `create`). Main handlers call `dispatch(command)` → append → re-project → return. Renderer gets typed client. Trinity builds the "+ Add" modal per `prototype/movimientos.jsx`, wires submit → `window.ipc.transaction.create(...)` → refresh list + emit `panel:invalidate`.
- **Done =** run the app, click **+ Add**, fill form, submit. New row appears in Movements. Switch to Panel — balance, month KPI, and recent-movements list reflect it. Restart app — data still there.

## 5. Storage fallback — **DECISION RECOMMENDED**

**Call: ship a local-JSON event log now (WI-4′); defer OneDrive (WI-4) + crypto (WI-5) to M2.**

**Rationale (one sentence):** OneDrive + crypto are 6–8 days of work with Switch review dependencies; a local append-only JSON log is <1 day, keeps the event-sourced architecture intact (same event shape, same reducers, storage is a swappable adapter), and unblocks a working demo this week — which is what Pedro asked for.

**Boundary:** WI-4′ is explicitly dev-only. The storage interface (`EventLog` with `append`/`load`) is the same one WI-4 will implement against OneDrive. No code written for WI-4′ is thrown away — only the adapter behind it is replaced.

## 6. Milestone

- **M1.5 — Vertical Slice:** Add-transaction → list → Panel reflects. Target: end of next week. Single-user, local, unencrypted. Proves the event-sourcing loop end-to-end.
- **M1 Panel Alpha** (original): folds into M1.5 since real data now flows through the same path.
- **M2:** OneDrive adapter (WI-4) + crypto (WI-5) + multi-device concurrency — swap storage adapter, no UI or core changes.

---

## 2026-04-19: WI-13 (Trinity) — Add-Transaction Modal Implementation

**Status:** ✅ Completed (81/85 tests pass, 4 skipped jsdom). Commit 17134be.

**Summary:**  
Trinity completed end-to-end vertical slice for transaction creation: user clicks "+ New Transaction" → fills modal form → submits → sees new row at top of Movements list.

**Form Field List:**

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `date` | date input | ✅ | Today (ISO YYYY-MM-DD) | Regex `/^\d{4}-\d{2}-\d{2}$/` |
| `type` | select | ✅ | "expense" | One of "income" \| "expense" |
| `amount` | number | ✅ | — | Positive, > 0, step 0.01 |
| `description` | text | ✅ | — | Non-empty after trim, max 500 chars |
| `account` | select | ✅ | First account in list | Must exist in Panel accounts |
| `categoryId` | — | ❌ | — | Wired in contract, omitted from UI (v1) |
| `subcategoryId` | — | ❌ | — | Wired in contract, omitted from UI (v1) |
| `tagIds` | — | ❌ | — | Wired in contract, omitted from UI (v1) |
| `status` | — | — | "approved" | Hardcoded, not user-editable |

**Validation Strategy — Two-tier approach:**
1. **Client-side pre-flight** (instant feedback, no IPC): Validates shape before calling `createTransaction()`. Fires on form submit.
2. **Server-side validation** (business rules): Core command validates account exists, amount positive, date valid ISO string. Returns structured errors.

**Modal Pattern Details — Native `<dialog>` element** (no 3rd-party deps):
- Lifecycle: `useEffect` keyed on `isOpen` prop calls `dialog.showModal()` / `dialog.close()`
- Backdrop click closes modal
- Escape key handled by native `cancel` event
- Focus trap handled by browser (modal mode blocks interaction outside dialog)

**Panel-Invalidation Approach (WI-14-lite):**
After `createTransaction` resolves `{ok:true}`:
1. Modal closes
2. `MovementsScreen.loadAll()` re-runs → calls `listMovements()` + `getAccounts()`
3. Table re-renders with new row at top

**Panel screen does NOT auto-refresh.** User must reload the app or navigate away/back to see updated KPIs and recent-transactions list. Known limitation documented in code.

**WI-14 proper will add:**
- Event-bus pattern (e.g., `window.opentreasury.events.emit('panel:invalidate')`)
- Panel screen subscribes on mount, re-runs loaders when event fires
- Any write command emits the event
- No polling, no global refresh — targeted invalidation per command

**Testing Coverage:**
- Modal component: 3 tests (skipped — jsdom dialog API incomplete)
- MovementsScreen: 4 tests
- CI status: 81/85 pass, 4 skipped, typecheck/lint/format green

**Files Changed:**
- New: `app/src/renderer/components/AddTransactionModal/` (modal component, styles, tests, barrel)
- Modified: `app/src/renderer/screens/MovementsScreen/`, `app/src/renderer/locales/{en,es}/common.json`

**Learnings for Future WIs:**
Reusable modal form submission pattern established. IPC contract gap identified: MovementRecord is ID-based but UI needs labels. WI-14 should either add labels inline to `movements.list` response or add separate lookup tables.

**Accessibility reminder:** Always pair `aria-invalid` with `aria-describedby` for validation errors. Screen readers need the linkage to announce errors on focus.

**Next steps (WI-14):**  
Event-bus subscription for panel invalidation + category/tag label resolution.

---

## 2026-04-19: WI-15/16 Scope — CONFIGURACIÓN + DATOS Work Packages

**Status:** 🔶 Draft — awaiting Pedro approval on 6 open questions.

**Author:** Neo (Lead/Architect)  
**Date:** 2026-04-19  
**Reference Repo:** `rett-europe/opentreasury` (Angular 19 + Python FastAPI web app)

### Section A — Inventory (What the Web App Has)

#### A1. Accounts (`/api/accounts`)
- **CRUD Operations:** List, Create, Read, Update, Delete (soft-delete if zero transactions)
- **Business Rules:** IBAN uniqueness, Account color palette (normalized hex), Soft-delete protection, Activation toggle, Sort order
- **UX Patterns:** Modal dialog for create/edit, Inline toggle for isActive, Confirmation dialog before delete, Color picker widget
- **Reference Files:** API router (`/api/app/routers/accounts.py`), Service layer, Schema

#### A2. Categories + Subcategories
- **CRUD Operations:** List categories (nested), Create/Update/Delete categories, Add/Update/Remove subcategories
- **Business Rules:** Parent-child hierarchy, Type constraint (income/expense), Uniqueness (case-insensitive), Soft-delete protection, Subcategory removal validation
- **UX Patterns:** Modal dialog with nested subcategory inline editor, Expandable list, Inline activation toggle, Confirmation dialog with transaction count

#### A3. Tags/Labels (`/api/tags`)
- **CRUD Operations:** List, Create, Read, Update, Delete (soft-delete if zero transactions)
- **Business Rules:** Uniqueness (case-insensitive), Free-form color (not palette), Soft-delete protection
- **UX Patterns:** Modal dialog, Inline toggle, Confirmation dialog

#### A4. Import (`/api/imports`) — 3-step wizard
1. **Upload + Account Selection:** User uploads file, selects target account
2. **Sheet Selection + Preview:** Shows row counts, new categories/subcategories, duplicates, allows category type overrides
3. **Confirm + Import:** Creates categories, inserts transactions, returns summary

**Column Mapping (Auto-Detected):** Via hardcoded alias lookup (no user-configurable mapping in v1)  
**Duplicate Detection:** Hash-based idempotency key `md5(accountId + date + amount + description)`  
**Category Auto-Creation:** Parses unique (category, subcategory) pairs, guesses type from keywords, user can override  
**Error Handling:** Malformed rows skipped with warnings; partial success model

#### A5. Export (`/api/export`) — Filter + Download
- **Output format:** XLSX only, includes Date, Account, Category, Subcategory, Amount, Balance, Description, Tags, Review Status
- **UX Pattern:** Filter form (date range picker, optional account/category dropdowns), Download button

### Section B — Import Deep-Dive (Complexity Analysis)

**3-step wizard:**
1. Upload + Account Select → call `POST /api/imports/preview`
2. Preview + Sheet Selection → user can override category types
3. Confirm + Import → call `POST /api/imports/workbook`

**Column Mapping:** Auto-detected via alias lookup (case-insensitive, diacritic-normalized). No user-configurable mapping UI in v1.

**Duplicate Detection:** Hash-based `source_reference`, no external transaction ID.

**Error Handling:** Malformed rows skipped; partial success continues; warnings returned.

**Side Effects on Domain:**
- Events appended: `CategoryCreated` × N, `SubcategoryCreated` × M, `TransactionCreated` × K
- `import_batch_id` (ULID) + `import_source` (filename) stored on each transaction

### Section C — Event Model Additions

**New event types needed:**
- Account: `account.created`, `account.updated`, `account.deactivated`, `account.deleted`
- Category: `category.created`, `category.updated`, `category.deactivated`, `category.deleted`
- Subcategory: `subcategory.created`, `subcategory.updated`, `subcategory.deactivated`, `subcategory.deleted`
- Tag: `tag.created`, `tag.updated`, `tag.deactivated`, `tag.deleted`
- Import: `import.batch-started`, `import.batch-completed`

**Event Ordering + Projection Consistency:**
- Account/Category/Tag must exist before Transaction references it
- Delete protection requires txn count query
- Panel + Movements invalidation broadcasts after config events

### Section D — Work Packages (Deliverables)

#### WI-15: CONFIGURACIÓN — Reference Data CRUD (Accounts, Categories, Tags)
**Purpose:** Build the UI + command layer for managing accounts, categories, subcategories, and tags.  
**Owner:** Trinity (UI + IPC client), Morpheus (commands + IPC handlers)  
**Size:** L (10–12 days, split Morpheus 6d + Trinity 6d with 2d overlap)

**Acceptance Criteria (5 phases):**
1. **Command Layer (Morpheus):** All CRUD commands, vitest 100%
2. **Query Projections (Morpheus):** `queryAccounts`, `queryCategories`, `queryTags`, vitest coverage
3. **IPC Contracts (Morpheus + Trinity):** Zod schemas, handlers, typed clients
4. **UI Components (Trinity):** Card grids, form dialogs, inline toggles, delete confirmation
5. **Integration (Trinity + Morpheus):** Wire nav, test all flows, broadcast invalidation events

#### WI-16: DATOS — Import/Export
**Purpose:** Build the import wizard (upload XLSX → preview → commit) and export flow (filter → download XLSX).  
**Owner:** Morpheus (parser + command), Trinity (wizard UI + export UI)  
**Size:** L (12–14 days, split Morpheus 8d + Trinity 6d with 2d overlap)

**Phases:**
1. **Import Parser (Morpheus):** Read XLSX, auto-detect sheets, parse rows, compute hash
2. **Import Command (Morpheus):** Validate account, parse file, create categories, append events
3. **Export Service (Morpheus):** Query transactions, generate XLSX, return file
4. **IPC Contracts (Morpheus + Trinity):** Define contracts, handlers, clients
5. **Import Wizard UI (Trinity):** 3-step flow with preview + category overrides
6. **Export UI (Trinity):** Filter form + download button

#### WI-17: Integration + Polish
**Purpose:** End-to-end wiring, edge case handling, accessibility, and UX polish.  
**Owner:** Trinity (UI polish), Niobe (UX audit), Mouse (a11y + design tokens)  
**Size:** M (5–6 days)

### Section E — Open Questions for Pedro (BLOCKING)

**E1. Configuration Events vs Separate Config Store**  
Should accounts/categories/tags produce domain events (event-sourced) or live in separate store (SQLite/JSON)?  
**Neo's Recommendation:** Option A (event-sourced). Aligns with ADR-001, audit trail valuable, event log manageable.

**E2. Multi-Currency Accounts in v1?**  
Support USD/GBP or hardcode EUR?  
**Neo's Recommendation:** Hardcode EUR, add field for future, UI hides it.

**E3. Import: Match All Banks or Start Generic?**  
Replicate bank-specific parsers or ship manual column mapping?  
**Neo's Recommendation:** Option B (bank-specific parsers for v1), covers 90% of RETT imports.

**E4. Category Type Change — Allow or Block?**  
If category has transactions, allow type change (income → expense)?  
**Neo's Recommendation:** Option A (allow + warn). Matches web app.

**E5. Import Batch Rollback on Error?**  
Partial success (80 of 100) or atomic (0 or 100)?  
**Neo's Recommendation:** Option A (partial success). Web app UX works well.

**E6. Export: CSV Option, or XLSX Only?**  
Both formats or XLSX only?  
**Neo's Recommendation:** XLSX only for v1.

### Section F — v1 Minimum Slice (WI-15-lite)

**Goal:** Smallest subset allowing Pedro to add account/category/tag through UI + see them in Add-Transaction modal.

**Scope:**
- Accounts: Create only (hardcoded EUR, no color picker, no PayPal toggle)
- Categories: Create only (hardcoded income/expense, no subcategories)
- Tags: Create only
- No import/export

**Size:** S (3–4 days)

**Is WI-15-lite valuable as separate milestone, or go straight to full WI-15?**  
ASK PEDRO.

---

## 2026-04-19: UX-007 — Configuración UI v1 Spec

**Status:** 🔶 Draft v0.1 — awaiting review  
**Author:** Niobe (UX/Spec Analyst)  
**Date:** 2026-04-19  
**Related:** WI-15 (Neo scoping), WI-13 (Add Transaction modal), prototype/shell.jsx

### Prototype Reference

The prototype sidebar navigation defines **Configuración** section (lines 53–57 in `prototype/shell.jsx`):
```jsx
{ section: 'Configuración', items: [
  { id: 'categorias',  label: 'Categorías',   icon: 'folder' },
  { id: 'etiquetas',   label: 'Etiquetas',    icon: 'tag' },
  { id: 'cuentas',     label: 'Cuentas',      icon: 'bank' },
]},
```

The desktop v1 must match: **three distinct screens** (Cuentas, Categorías, Etiquetas) with CRUD operations.

### 1. User Goals

- **UG-1: Account Creation** — Quick add of organization's bank + PayPal accounts to start recording transactions
- **UG-2: Category & Subcategory Management** — Define income/expense categories with optional subcategories
- **UG-3: Label/Tag Creation** — Create custom labels for cross-cutting themes (e.g., "COVID-19 Relief")

### 2. Navigation & Information Architecture

**Sidebar Placement:** Configuración between Principal (Panel, Movimientos, Saldo) and Datos (Importación, Exportar)  
**Route Structure:** `/configuracion/cuentas`, `/configuracion/categorias`, `/configuracion/etiquetas` — sibling top-level screens

**Empty States (First-Time User):**
1. **Cuentas empty:** Icon `Landmark`, Heading "No hay cuentas bancarias", CTA "Añadir Cuenta"
2. **Categorías empty:** Icon `FolderOpen`, Heading "No hay categorías", CTA "Añadir Categoría"
3. **Etiquetas empty:** Icon `Tag`, Heading "No hay etiquetas", CTA "Añadir Etiqueta"

### 3. Core Flows

#### Cuentas (Bank Accounts & PayPal)

**List View:**
- Card grid (responsive: 1 col mobile, 2–3 cols desktop)
- Card contents: Left border stripe (color), Icon (Landmark/CreditCard), Title + currency badge, Subtitle (bank name), Metadata (IBAN masked/PayPal email), Actions (Edit/Activate-Toggle/Delete)
- Sort: by `sortOrder`, then creation date
- States: Active (full opacity), Inactive (0.65 opacity + dashed border + "Inactivo" badge)

**Create Flow:**
- Modal with Type selector (Bank/PayPal), fields: Bank name, Short name, Account label, IBAN (bank only)/PayPal email (PayPal only), Color picker (preset palette), Currency (EUR/USD/GBP), Sort order
- Validation: IBAN format (basic length check), email, required fields
- Success: Toast "Cuenta creada: {accountLabel}"

**Edit Flow:**
- Modal pre-filled, Type immutable, IBAN/Email editable with warning, Activa toggle (with confirmation if >0 txns)

**Archive/Delete Flow:**
- Archive: Toggle → confirmation (if >0 txns, show count), Toast "{accountLabel} desactivada"
- Delete: Trash icon → block if >0 txns with message, allow if 0 with hard-delete confirmation

#### Categorías + Subcategorías

**List View:**
- Card grid, Card contents: Header row (name + type badge "Ingreso"/"Gasto"), Description (optional, truncated), Subcategories (chip list, max 5 + "y {n} más"), Actions (Edit/Delete)
- Sort: Alphabetical + inactive last
- Empty: "Sin subcategorías"

**Create Flow:**
- Modal with Type selector (Ingreso/Gasto), Name, Description, Inline subcategory editor (list container, add row with Enter shortcut)
- Validation: Subcategory names unique within category, show error on blur
- Success: Toast "Categoría creada: {name}"

**Edit Flow:**
- Modal pre-filled, Type immutable, Subcategory editing (rename/delete/add), Activa toggle

**Delete Flow:**
- Block if >0 txns, Allow if 0

#### Etiquetas (Labels/Tags)

**List View:**
- Card grid (smaller cards), Tag preview chip (colored pill), Name + Inactivo badge (if applicable), Actions (toggle/edit/delete)
- Sort: Alphabetical + inactive last

**Create Flow:**
- Modal with Name (required, max 30 chars), Color picker (12 preset swatches, default purple)
- Validation: Tag names unique (case-insensitive)
- Success: Toast "Etiqueta creada: {name}"

**Edit Flow:**
- Modal pre-filled, Activa toggle

**Delete Flow:**
- Block if >0 txns, Allow if 0

### 4. Integration with Add Transaction Modal (WI-13)

**Contract:** Newly-created accounts/categories/tags appear immediately in modal dropdowns.

**Optimistic Refresh Strategy:**
1. After successful create, Configuración screen calls local refetch
2. Modal listens to "config changed" event (IPC channel or React context) and refetches reference data

**Open Question Q1 (for Pedro):** Should modal close on nav away (Option A, simpler) or persist state (Option B, better UX)?

### 5. Error & Empty States

**First-Time User Journey:**
1. App opens to Panel
2. Panel empty state: "No hay cuentas configuradas. Configura tu primera cuenta."
3. CTA links to `/configuracion/cuentas`
4. User creates account, returns to Panel (or is auto-routed?)

**Validation Errors (Inline):**
- Below field, red text + red left border + warning icon
- Copy style: plain, actionable Spanish (e.g., "IBAN no válido. Verifica el formato.")

**Destructive Action Guards:**
- Confirmation dialog before irreversible action
- Body: plain-language impact (show txn count if applicable)
- Actions: "Cancelar" | "{Action}" (danger red for delete, warn orange for deactivate)

### 6. Accessibility Requirements (WCAG 2.1 AA)

**Keyboard-Only Navigation:** All CRUD fully keyboard-accessible (Tab through cards, Enter to activate, Escape to close modal, Arrow keys for color picker)

**Focus Management:**
- Modal open: focus moves to first interactive element, background inert
- Modal close: focus returns to trigger button
- After delete: focus moves to next card (or "Añadir" button if list empty)

**Screen Reader Labels:**
- Action buttons: `aria-label="Editar {accountLabel}"`
- Validation errors: `aria-describedby="error-{fieldName}"`
- Color picker: `role="radiogroup"` with individual swatches as `role="radio"`

### 7. i18n Considerations

**Primary:** Spanish (ES)  
**Required:** English (EN) fallback  
**Key namespace:** `config.*` (cuentas, categorias, etiquetas)  
**ICU Pluralization:** For count messages (e.g., "{count, plural, one {1 movimiento} other {# movimientos}}")

### 8. Out of Scope for v1

Explicitly deferred to M1.1 or later:
- Bulk import of categories/tags
- Category reordering (drag-drop)
- Custom color picker (hex input) — v1 preset palette only
- Multi-currency transactions
- Category type mutation
- Undo/Redo for deletions
- Category/tag usage analytics
- Subcategory-only view
- Account reconciliation UI
- Custom fields for accounts
- Advanced IBAN validation (checksum)
- "Archived" list view filter

### 9. Acceptance Criteria (5 key scenarios)

**AC-1:** User creates PayPal account via modal → modal closes → list refreshes → toast confirms  
**AC-2:** User creates category with two subcategories → category card shows subcategories as chips  
**AC-3:** User creates tag "COVID-19" with orange color → tag card shows orange pill  
**AC-4:** User creates new account in Configuración → returns to Add-Transaction modal → new account in picker  
**AC-5:** Keyboard-only user tabs through cards, Escape closes modal, Arrow keys navigate color picker

### 10. Open Questions

**Q1:** Modal state persistence — close on nav away (A, simpler) vs persist form (B, better UX)?  
**Q2:** Panel empty-state routing — link to `/configuracion/cuentas` (A) or quick-create modal (B)?  
**Q3:** Sort order field visibility — show by default (A) or behind "Opciones avanzadas" (B)?  
**Q4:** IBAN validation — full checksum (A) or basic length check (B)?  
**Q5:** Subcategory deletion — keep parent category (A), fully uncategorize (B), or block (C)?

---



## 2026-04-19T19:22Z — WI-15/16/17 scope rulings (Pedro via Copilot directive)

**Source:** `.squad/decisions/inbox/copilot-directive-wi15-answers.md` (merged).
**Context:** Answers to Neo's six open questions from `neo-wi15-configuracion-datos-scope.md`.

**Rulings:**
1. **Q1 — Event-sourced config vs separate store:** ✅ **Event-sourced.** Accounts, categories, tags are first-class domain events appended to the same NDJSON log as transactions.
2. **Q2 — EUR-only for v1:** ✅ Confirmed. Schema keeps a `currency` field for forward-compatibility but UI hides it (always EUR). Multi-currency deferred.
3. **Q3 — Category-type conflict on import:** ⚠️ Re-scoped. **Categories do NOT carry a `type` (income/expense) field.** Direction lives on the transaction. A category like "Donaciones" can be either income (donation received) or expense (refund issued). Categories are *labels / groupings*, not direction-constrained. No keyword-based type-guessing during import.
4. **Q4 — Partial-success imports:** ✅ Confirmed — with a critical clarification: **duplicate handling is by row-hash, not file-hash.** Re-importing the same file after some rows failed must NOT double-insert the rows that already succeeded.
5. **Q5 — Bank-specific parsers vs generic manual mapping:** ✅ **Bank-specific parsers.** WI-17 will ship a small set of per-bank CSV/XLSX parsers rather than a generic manual column-mapping wizard.
6. **Q6 — WI-15-lite first:** ✅ Confirmed. Ship minimum CRUD (add Cuenta / Categoría / Etiqueta, show them in Configuración + feed into Add-Transaction) before going wide on edit/archive/subcategorías/import.

**Impact:** Unblocked WI-15-lite kickoff. Q3 removed `CategoryType` from the schema. Q1 fixed the storage model as event-sourced. Q5 shapes WI-17 implementation.

---

## 2026-04-19T~21:29Z — Morpheus: WI-15-lite IPC contracts (FROZEN)

**Source:** `.squad/decisions/inbox/morpheus-wi15-contracts.md` (merged).
**Status:** Frozen. Authoritative files: `app/src/shared/ipc-contracts/{accounts,categories,tags}.ts`. If this doc and the files diverge, the files win.

### Channels

```
accounts:create   accounts:list
categories:create categories:list
tags:create       tags:list
```

### Accounts — `accounts.ts`

```ts
interface AccountCreatedEvent {
  type: 'AccountCreated';
  id: string;
  name: string;
  bankName?: string;
  currency: 'EUR';
  openingBalance: number;
  createdAt: string; // ISO 8601 UTC
}

interface CreateAccountRequest {
  name: string;            // required, non-empty after trim
  bankName?: string;
  openingBalance?: number; // defaults to 0 if omitted
  // currency is hard-coded EUR in the handler; not on the wire.
}

type CreateAccountResponse =
  | { ok: true;  event: AccountCreatedEvent }
  | { ok: false; error: { code: AccountErrorCode; message: string; field?: string } };

type AccountErrorCode =
  | 'NAME_EMPTY'
  | 'NAME_DUPLICATE'            // case-insensitive name collision
  | 'OPENING_BALANCE_INVALID'   // not finite (NaN / Infinity)
  | 'SCHEMA_INVALID'            // zod boundary parse failed
  | 'INTERNAL';

interface AccountRecord {
  id: string;
  name: string;
  bankName?: string;
  currency: 'EUR';
  openingBalance: number;
  createdAt: string;
}
```

`accounts:list` returns `AccountRecord[]` in createdAt ASC (insertion order).

### Categories — `categories.ts`

**No `type` field on category** (per Pedro's Q3 — direction-agnostic).

```ts
interface CategoryCreatedEvent {
  type: 'CategoryCreated';
  id: string;
  name: string;
  color?: string;
  createdAt: string;
}

interface CreateCategoryRequest { name: string; color?: string; }

type CategoryErrorCode = 'NAME_EMPTY' | 'NAME_DUPLICATE' | 'SCHEMA_INVALID' | 'INTERNAL';

interface CategoryRecord { id: string; name: string; color?: string; createdAt: string; }
```

### Tags — `tags.ts`

```ts
interface TagCreatedEvent { type: 'TagCreated'; id: string; name: string; createdAt: string; }
interface CreateTagRequest { name: string; }
type TagErrorCode = 'NAME_EMPTY' | 'NAME_DUPLICATE' | 'SCHEMA_INVALID' | 'INTERNAL';
interface TagRecord { id: string; name: string; createdAt: string; }
```

### Invariants (all three entities)

- **Nothing throws across IPC.** Validation failures always return `{ ok: false, error }`.
- **Uniqueness:** case-insensitive + trimmed per entity type. `'Banco ABC'` vs `'banco abc'` → `NAME_DUPLICATE`.
- **Idempotency:** events appended to the shared NDJSON event log, deduped by `id`. Replaying the same log yields the same projections.
- **IDs:** `main/ids.ts#newUlid` — 26-char Crockford base32 ULID. Opaque to the renderer.
- **currency:** Accounts hard-code `'EUR'`; field is present on the record for M2 forward-compat but absent from `CreateAccountRequest`.

### Preload surface

`window.opentreasury` grows three namespaces:

```ts
accounts:   { create(req): Promise<CreateAccountResponse>;  list(): Promise<AccountRecord[]>; }
categories: { create(req): Promise<CreateCategoryResponse>; list(): Promise<CategoryRecord[]>; }
tags:       { create(req): Promise<CreateTagResponse>;      list(): Promise<TagRecord[]>; }
```

### Notes

- The dev-seed in `main/devSeed.ts` continues to write the legacy enveloped `account.created` / `category.created` / `tag.created` events used by Panel. These **do not** appear in the new `*:list` endpoints — the WI-15-lite events are a separate stream. Empty arrays from the three list endpoints are valid and expected on a fresh install / seeded-but-never-configured install. Consolidation of the two streams is a future WI.
- **Implementation deviation:** `*:list` actually returns a wrapped object `{ accounts|categories|tags: Record[] }` rather than a bare array. Trinity's renderer + three service tests consumed the wrapped shape; the contract doc only specified the record shape. Wrapping chosen as lower-blast-radius given parallel work.
- No archive / edit / delete / subcategories / import in this slice.

---

## 2026-04-19T~21:45Z — Morpheus: WI-15-lite main-process shipped

**Source:** `.squad/decisions/inbox/morpheus-wi15-lite-summary.md` (merged).

**Scope:** Main-process half of WI-15-lite — Cuentas / Categorías / Etiquetas, create + list only, event-sourced, EUR-only, no `type` on categories, no archive/edit/delete, no import.

### Files

**New:**
- `app/src/shared/ipc-contracts/{accounts,categories,tags}.ts` — Zod schemas + types + channel names.
- `app/src/main/ipc/handlers/{accounts,categories,tags}.ts` + tests (10 + 8 + 7).
- `app/src/main/projections/config.ts` — `selectAccounts` / `selectCategories` / `selectTags` selectors + 3 tests.

**Modified:**
- `app/src/core/events/schemas.ts` — three flat event schemas + extended `DomainEvent` union.
- `app/src/core/query/types.ts` — added `ConfigAccount` / `ConfigCategory` / `ConfigTag` rows + extended `ReadModel` with `configAccounts` / `configCategories` / `configTags`. Kept separate from legacy `accounts` / `categories` / `tags` arrays (Panel + dev-seed).
- `app/src/core/query/reducers.ts` — cases for the three PascalCase event types; `replayEvents` / `resetReadModel` initialise all seven projection arrays.
- `app/src/main/ipc/handlers.ts` — registered six new channels.
- `app/src/preload/index.ts` — exposed `window.opentreasury.{accounts,categories,tags}.{create,list}`.
- `app/src/renderer/types/config.ts` — rewritten to re-export the frozen shared contracts.

### Deviations from task spec

1. `*:list` returns a wrapped object not a bare array (see contracts note above).
2. `selectPanelSnapshot` NOT modified — Panel already reads from the hydrated read model, no hardcoded list found. Legacy `account.created` envelopes and new `AccountCreated` flat events coexist as **separate** projection streams; `accounts:list` returns only user-created (WI-15-lite) accounts, seed data does not leak through.
3. Event shape is **flat** (`{ type, id, …fields, createdAt }`), not the WI-11/12 envelope (`{ id, type, datasetId, actorDeviceId, createdAt, dekVersion, version, payload }`). Both coexist in the NDJSON log; `JsonFileEventLog` only requires a string `id`; reducers switch on `type`.
4. IDs use `newUlid()` (matches `main/ids.ts`), not `crypto.randomUUID()` — consistent with existing transaction IDs.

### Tests

| Before | After |
|--------|-------|
| 81 pass + 4 skip = 85 | 121 pass + 9 skip = 130 |

+40 passing, +5 skipped. `npm run typecheck`, `lint`, `format:check`, `test -- --run`, `build:preload` all clean.

### Not in this slice

- Archive / edit / delete → full WI-15.
- Subcategories → full WI-15.
- CSV / XLSX import/export → WI-17.
- Multi-currency → deferred (Pedro Q2).
- `categoryType` / direction on categories → dropped (Pedro Q3).
- Seed-migration tool for legacy Panel envelope events → follow-up when WI-15 full scope lands.

---

## 2026-04-19T~22:00Z — Trinity: WI-15-lite renderer shipped

**Source:** `.squad/decisions/inbox/trinity-wi15-lite-summary.md` (merged).

Builds on Morpheus's frozen contracts. Gates green: `tsc -b`, `vitest --run` (121 pass / 9 skip / 27 files), `eslint` (0/0), `format:check`. +13 tests (4 accountsApi + 4 categoriesApi + 4 tagsApi + 5 ConfiguracionScreen).

### Files

**Added:**
- `app/src/renderer/services/{accounts,categories,tags}Api.ts` + tests.
- `app/src/renderer/components/ConfigModals/` — `ConfigModalShell.tsx`, `AddAccountModal.tsx`, `AddCategoryModal.tsx`, `AddTagModal.tsx`, `errorMap.ts`, `index.ts`, `ConfigModal.css`.
- `app/src/renderer/screens/ConfiguracionScreen/` — `ConfiguracionScreen.tsx` + `.css` + `.test.tsx`, `CuentasTab.tsx`, `CategoriasTab.tsx`, `EtiquetasTab.tsx`, `index.ts`.
- `app/src/renderer/types/config.ts` — shim re-exporting shared contracts.

**Modified:**
- `App.tsx` — adds `'configuracion'` route, bumps `configRevision` counter on create, passes it to `MovementsScreen`.
- `AppShell.tsx` — sidebar split into **Principal** + **Configuración** sections; nav entry with `SlidersHorizontal` icon.
- `MovementsScreen.tsx` — fetches categories + tags alongside accounts; re-hydrates whenever `configRevision` changes; `.catch()` swallows failures so pre-existing tests stay green without new mocks.
- `AddTransactionModal.tsx` — adds optional Category `<select>` and Tags multi-`<select>`. No contract modification needed — `CreateTransactionRequest` already carried `categoryId` / `tagIds`.
- `locales/{en,es}/common.json` — new `configuracion.*` namespace, `shell.nav.configuracion`, `shell.sections.config`, `common.save` / `common.saving`.

**Cleanup:**
- Deleted stray `.d.ts` / `.js` / `.js.map` emits under `app/src/shared/ipc-contracts/`. `shared/tsconfig.json`'s `outDir` is `dist/shared`, so in-tree emits are a build-invocation bug to fix upstream.

### UX compliance (Niobe / AA)

- Tabs: `role="tablist"` / `role="tab"` / `aria-selected` / `aria-controls` / tabIndex juggling per ARIA authoring practices.
- Modals: native `<dialog>` via `showModal()`; Escape + backdrop click both invoke `onClose`; `role="dialog"` + `aria-modal="true"` + labelled header.
- Empty states: icon + title + body + primary CTA.
- All colors via design tokens (no inline `#hex` in component CSS). The 8-color category palette is a data palette (hex stored on the category record) as a constant in `AddCategoryModal`.
- i18n: every string keyed under `configuracion.*`; ES + EN parity.

### Deliberate deviations / TODOs

- **No subcategory in Add-Transaction.** Matches Morpheus's contract for WI-15-lite.
- **No archive/edit/delete.** Out of scope.
- **No toast primitive yet.** On successful create, modals close and the parent tab silently re-fetches. Wire toasts later (WI-16?).
- **Icon choice:** `SlidersHorizontal` for Settings in the sidebar. Swap to `Settings` (gear) trivially if preferred.
- **`MovementsScreen` test (pre-existing):** mocks `movementsApi` / `transactionApi` / `panelApi` but not the new `categoriesApi` / `tagsApi`. `.catch()` fallback in `loadAll()` keeps it green.

### Don't-list compliance

- ❌ No edit / archive / delete.
- ❌ No import / export UI.
- ❌ No preload touched (Morpheus owns it).

---

## 2026-04-19T~22:10Z — Coordinator: electron moved to devDependencies (packaging unblock)

**Problem:** `npm run package` failed because `electron` was listed in `dependencies`, causing `electron-builder` to double-bundle it / trip ASAR resolution.

**Fix:** Moved `electron` from `dependencies` to `devDependencies` in `app/package.json`.

**Verification:** `npm run package` now produces `out/OpenTreasury Setup 0.0.0.exe` cleanly. End-to-end packaging pipeline verified for the first time.

**Convention going forward:** `electron` stays a dev-only dependency; only Electron **runtime** modules (native addons like `@napi-rs/keyring`, preload deps) belong in `dependencies`. This matches standard electron-builder practice and is worth encoding in PR review checklists.
