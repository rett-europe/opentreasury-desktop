# Project Context

- **Owner:** Pedro (perocha)
- **Project:** OpenTreasury Desktop — Electron-based treasury management for NGOs. Desktop version of the cloud-based rett-europe/opentreasury, designed to work without complex cloud setup.
- **Stack:** Electron (frontend), rest TBD. Reference app: Angular 19 + Python FastAPI + Cosmos DB + Entra ID on Azure.
- **Created:** 2026-04-19

## Recent Work

### 2026-05-12 — PR #317 Renderer IPC Wireup (squad/307-renderer-ipc-wireup, Issue #307)

**Context:** Replace all `mockWorkspaceIpc.*` usage in onboarding screens with real `window.opentreasury.workspace.*` IPC (shipped by Morpheus in PR #315 / d7b1ea7). Add `MigrationScreen` for the `migration` workspace state. Wire workspace detection into App.tsx bootstrap flow.

**Delivered:**
- `FreshSetupFlow.tsx`, `JoinFlow.tsx`, `RecoveryFlow.tsx`: All mock imports removed; real workspace IPC used
- `MigrationScreen.tsx`: New minimal screen for `migration` state (hardcoded EN per Pedro's directive)
- `App.tsx`: Workspace detection gate after `needsOnboarding=false`; routes to all 5 workspace states; silent unlock for `unlock` state
- Integration tests for all 3 flows + migration screen

**Learnings:**
- `exactOptionalPropertyTypes: true` conditional spread pattern: passing `string | undefined` to `prop?: string` is a type error; fix with `{...(val !== undefined ? { prop: val } : {})}` — avoids assigning `undefined` to an optional property
- Bootstrap flow ordering: `boot:getStatus` → `onboarding:getStatus` → `workspace:detect` → `workspace:unlock` (transient `unlock` state handled silently)
- `workspace:unlock` error routing: if response has `needsRecovery: true`, route to RecoveryFlow; otherwise fall through to AppShell
- Test strategy for 12-word input tests: `userEvent.setup({ delay: null })` + per-test timeout ≥15000ms avoids vitest parallel-worker timeout flakiness under i18n overhead
- Migration state: intentionally minimal UI; terminal command with folder path pre-filled is sufficient; no in-app migration trigger
- Mock retention: `mockWorkspaceIpc.ts` is kept for potential test/dev use; only renderer screens must use real IPC post-PR

**Artifact:** PR #317 (draft)

---

### 2026-05-11 — PR #315 Frontend-API Review (squad/301-workspace-ipc, authored Morpheus)

**Verdict:** APPROVE — all 6 IPC contract signatures match mockWorkspaceIpc exactly; two #307 scoping notes: replace `mockWorkspaceIpc.__getFailedAttempts()` with local state in JoinFlow.tsx:74 and RecoveryFlow.tsx:45; add `migration` state routing placeholder. Gates: typecheck/lint/format/tests all green.

---

### 2026-05-10 — Encryption Onboarding UX Scaffolding (PR #311, Issue #306 partial)

**Context:** Scaffold the encryption onboarding UX flows (fresh setup, join, recovery) while Morpheus builds the real crypto-core (#310). Mock IPC responses allow parallel UI work.

**Delivered:**
- **IPC contracts** (`app/src/shared/ipc-contracts/workspace.ts`): WorkspaceState detection, create, confirm, enroll, unlock, recover
- **Mock IPC adapter** (`app/src/renderer/mocks/workspaceIpc.ts`): In-memory mocked responses using `bip39` for mnemonics
- **Shared components**: RecoveryCodeGrid, RecoveryCodeInput (BIP39 autocomplete), WordConfirmChallenge (3 random positions)
- **Onboarding screens**: FreshSetupFlow (4 steps), JoinFlow (2 steps), RecoveryFlow (1 step)
- **i18n strings**: EN + ES for onboarding.encryption, onboarding.join, recovery (AC19)
- **Component tests**: RecoveryCodeInput (BIP39 validation), WordConfirmChallenge

**Learnings:**
- Mock-adapter pattern: Renderer mocks use `bip39` (safe), NOT crypto primitives (`sodium-native` stays in main)
- IPC contract surface: setupToken pattern enables lazy MK generation (create → confirmSetup validates before persisting)
- Component structure: Follow `{Component}/{Component.tsx, Component.css, Component.test.tsx, index.ts}` pattern
- TypeScript strict: `exactOptionalPropertyTypes: true` requires explicit `| undefined` on optional props
- Screen orchestrators: Top-level flow components own state, child screens are stateless with callbacks

**Deferred:** Real IPC handlers (Morpheus #305/#310), route guard wiring (next Trinity PR), migration UI (#307), Print/PDF export logic

**Artifact:** PR #311 (draft)

---

### 2026-05-10 — SPEC-026 v2 Implementation Kickoff (ACTIVE)

**Status:** 🚀 KICKOFF IN PROGRESS. Keaton's 8-issue plan APPROVED. Trinity assigned **#3 workspace detection routing** + **#4 onboarding UX**.

**Trinity's immediate scope (M1 critical path, locked in `.squad/decisions.md`):**

**Issue #3 — Workspace Detection & Routing (with Morpheus)**
- **Effort:** 2 days (M)
- **Scope:** Renderer routing logic (Fresh → Setup screens, Join → Recovery code entry, Dashboard → normal, Recovery → recovery screen, Migration → migration flow)
- **IPC method contracts:** Fully typed, no breaking changes (Morpheus provides `encryption:detect()` → `{ state, workspace?, lastError? }`)
- **State machine:** Fresh, Join, Dashboard, Recovery, Migration based on `events.key` existence + deviceId + lastError

**Issue #4 — Onboarding UX: Fresh Setup + Join Flows**
- **Effort:** 3 days (L, split with Mouse)
- **Scope (Trinity):**
  - Fresh setup screens: Why (value prop), recovery code grid (4 cols × 6 rows), confirm (3 random words), done screen
  - Join flow screens: Welcome (enter recovery code grid), Unlocking spinner, Dashboard
  - Recovery screen: Detect failed safeStorage, prompt for code, re-wrap
  - Optional device label input (for audit trail)
  - IPC wiring to Morpheus crypto module
- **Scope (Mouse):** Icons + visual consistency with dashboard design
- **i18n:** All copy bilingual EN/ES per Niobe's spec

**Full M1 picture (5 parallel issues):**
- #0: Morpheus (spike, < 1 day) → Pre-flight go/no-go
- #1: Morpheus + Switch (crypto, 3 days) → After spike
- #2: Morpheus (event log, 3 days) → After #1 merge
- #3: Morpheus + Trinity (detection, 2 days) → Parallel to #2
- #4: Trinity + Mouse (UX, 3 days) → Parallel to #2–#3
- **M1 gate:** Day 13 (critical path = spike→crypto→event log, UI flows in parallel)

**Key decisions locked (multi-user from day-one):**
- Per-device event files (no OneDrive conflicts)
- Multi-wrap key model (recovery code + per-device wraps)
- Recovery code as team enrollment secret
- User picks workspace folder (not auto-default)
- Rebuild read model on boot (no cache v1)

**Artifact:** `.squad/decisions.md` § "2026-05-10: SPEC-026 Implementation Plan Accepted" (full 8-issue table, detailed Trinity scopes, dependencies, reconciliation)
### 2026-05-10 — SPEC-026 v2 Multi-User UX Flows (Incoming)

**Context:** SPEC-026 pivots to multi-user-from-day-one. Niobe is rewriting the spec to include fresh setup + NEW join flows and updated first-run UX.

**Trinity's scope (awaiting v2 spec):**
- Fresh setup screens: Why, Recovery code grid, Confirm, Done (similar to v1 + revised copy for multi-user)
- Join flow screens: Welcome (enter recovery code), Unlocking, Dashboard
- Detection logic routing (fresh vs. join vs. recovery)
- Optional device label input (device name for audit trail)

**Key UX decision:** Same 60-second 3-step flow, with a decision branch after the initial "Why" screen based on whether `events.key` exists.

**Status:** Awaiting Niobe's v2 spec for detailed screen copy + flows.

**Artifact:** `.squad/decisions.md` § 2026-05-10 SPEC-026 Multi-User Encryption Redesign

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

## Core Context (Critical Architecture & Patterns)

**These patterns are foundational and appear repeatedly across all work. Refer here before starting any new task.**

### IPC Patterns (Shared with Morpheus)
- **Strong typing per-method:** Use `MethodBridge<Req, Res>` in contracts, not generic wrappers. TypeScript catches contract drift immediately.
- **Core invariant:** Nothing throws across IPC. All errors return `{ ok: false, error: { code, message, field? } }`.
- **Date-range queries:** Use inclusive boundaries `from <= date <= to` (lexicographic YYYY-MM-DD). Mirror aggregation logic for both month-anchored and range-scoped queries.

### i18n Patterns
- **Key structure:** Hierarchical kebab-case (e.g., `panel.range.last-30-days`). Group related strings under a parent (e.g., `panel.cta.*` for CTAs).
- **Verification after edits:** Always `grep -r "old string" app/src/renderer/locales/` to confirm renamed strings landed in committed JSON.
- **Merge conflict risk:** When multiple PRs touch the same i18n blocks, merge conflicts can silently resurrect stale keys. Review the final JSON diffs carefully.
- **Dead key cleanup:** Remove unused preset IDs from `DATE_PRESET_IDS` array + factory `FACTORIES` object. Every exposed ID must have a corresponding i18n key.
- **Locale pairs:** English + Spanish always updated together. Test both languages in any UI that consumes them.

### Date Handling (Renderer)
- **Date-preset factories:** Pure functions `(today: Date) => { from: string, to: string }` (YYYY-MM-DD format). Use `utcToday(today)` for timezone-safe math.
- **Preset discovery:** `getPresetRange(id, today)` dispatcher resolves any `DATE_PRESET_IDS` preset to concrete range.
- **Range-based queries:** Contrast with month-anchored. Use `getRangeKPIs(from, to)` for user-selected windows; `getMonthKPIs(yearMonth)` for fixed calendar periods.
- **Edge case testing:** Month/year rollover (Dec 31 → Jan 1), single-day ranges, empty ranges. All presets tested with boundary dates.

### Component Patterns
- **Props validation:** Type each prop explicitly. Use discriminated unions for conditional rendering (e.g., `preset: 'last-30-days' | 'this-month'`).
- **Event handling:** Handlers pass simple event objects, not DOM events directly. E.g., `onDateRangeSelect({ from, to })` not `onDateRangeSelect(event)`.
- **IPC wiring:** Component calls `ipc.panelApi.getRangeKPIs(from, to)` via preload bridge, not directly. Preload bridge wires to IPC handler.

### Testing Patterns
- **i18n tests:** Verify that new/renamed keys are present in both locale files. Assert key paths don't have `.split('.')` errors.
- **Date preset tests:** Test factory functions with multiple `today` values (month boundaries, year boundaries). Assert YYYY-MM-DD format compliance.
- **Query tests:** Test range-scoped queries with data both inside and outside the range. Verify inclusive boundaries (`>=` and `<=`).

---

## Team Coordination Notes

### 2026-05-09 — Import File Picker IPC Migration (PR #290, trial.3.6)

**Problem:** Trial.3.5 (#289) did NOT fix the import file picker regression. Pedro confirmed via testing: the native Windows "Open file" dialog NEVER APPEARS on packaged builds when clicking the import dropzone — only the spinner shows forever.

**Root cause:** `<input type="file">` + programmatic `.click()` silently fails on packaged Windows Electron. The OS dialog never opens. Trial.3.5's busy-state machinery (focus/visibility listeners, 30s safety timeout) was defense-in-depth for the wrong layer — it can't fix what never starts.

**Solution:** Replaced the renderer-level file picker with Electron's main-process `dialog.showOpenDialog` IPC, matching the folder-picker pattern (`dialog:pickFolder`). The new flow:
1. User clicks import dropzone button (now a `<button>`, not a `<label>`)
2. Renderer calls `window.opentreasury.dialog.pickImportFile()` IPC
3. Main process opens native file dialog (reliable, synchronous result)
4. On path selection → renderer calls `stageFile({ filePath })` as before
5. On cancel → loading state clears cleanly via IPC promise resolution

**Removed ~85 lines** of picker-busy-state machinery: `clearPickerBusy`, `focusHandlerRef`, `pointerHandlerRef`, `visibilityHandlerRef`, `pickerSafetyTimerRef`, `pickerListenerAttachTimerRef`, the unmount cleanup useEffect, and the dialog-close picker clearing. IPC promise lifecycle handles all edge cases (cancel, error, success) — no manual cleanup needed.

**Learnings:**
- **Renderer `<input type="file">` is unreliable on packaged Windows Electron.** Always use main-process `dialog.showOpenDialog` IPC for file pickers. The programmatic `.click()` approach that works in dev can silently fail in production.
- **IPC-based dialogs are simpler:** No need for focus/visibility listeners or safety timeouts. The main process handles the OS dialog synchronously and returns a clean result (path, cancelled, or error) via the IPC promise.
- **Prefer main-process APIs for OS-level operations:** File/folder pickers, shell operations, credential storage, etc. Renderer-level workarounds are fragile in sandboxed/packaged environments.

**Files changed:**
- Added IPC contract `dialog:pickImportFile` in `shared/ipc-contracts/dialog.ts`
- Added handler `handleDialogPickImportFile` in `main/ipc/handlers/dialog.ts`
- Registered handler in `main/ipc/handlers.ts`
- Exposed in `app/src/preload/index.ts`
- Rewired `ImportWizard.tsx`: removed `<input type="file">`, replaced `handleDropzoneClick` with async `handlePickAndLoadFile`
- Bumped version to `0.1.0-trial.3.6` and updated `CHANGELOG.md`

**Testing:** Pedro should uninstall trial.3.5 from Programs & Features, install the trial.3.6 .exe (after CI builds), and click Import — the OS file dialog should appear immediately.

### 2026-05-06 — AppShell Two-Gate Architecture Discovery (PR #285–#287, trial.3.5)

**Status:** ✅ SHIPPED via PR #265 + coordination logs merged in PR #267.

Oracle delivered the build script (`scripts/build-guides.mjs`) and release-asset upload workflow. You delivered the Help menu integration in `app/src/main/index.ts` and electron-builder configuration. The feature unblocks in-app access to user guides (EN + ES) without leaving the app.

### 2026-05-06 — AppShell Two-Gate Architecture Discovery (PR #285–#287, trial.3.5)

**Context:** E2E movements-perf test discovered that ProfileSetupModal rendered but sidebar never mounted. Initial diagnosis: profile.json missing.

**Root cause (full discovery):**

AppShell has **TWO independent render gates**, both must be satisfied:

1. **App.tsx gate:** Checks `app:needsOnboarding` condition, gated on `app-config.json` presence in Electron userData root. If missing, returns null before mounting AppShell.
2. **AppShell.tsx gate:** Checks profile existence. If profile missing, renders `<ProfileSetupModal>` instead of sidebar/main content.

E2E perf-seed was missing BOTH files, causing both gates to trigger independently. Fix required seeding BOTH:
- PR #286: Seed profile.json → satisfies AppShell gate
- PR #287: Seed app-config.json → satisfies App.tsx gate

**Pattern for future e2e setups:**
- List all render gates in the initialization chain (App → AppShell → nested screens)
- Identify which gates block which components
- Ensure seeding/mocking satisfies ALL gates before expecting a component to render
- Document the gate names + conditions in `.squad/agents/{trinity,morpheus}/history.md` for future e2e work

**Applies to:** Any e2e test setup, not just e2e movements-perf. All e2e tests must seed both files.

**For Trinity:** When designing e2e test fixtures or mocking AppShell, verify both gates. The sidebar only mounts when BOTH App.tsx (onboarding check) and AppShell.tsx (profile check) pass. Future e2e work should seed both files.

**For Trinity:** The guides are now bundled at `dist-guides/*.html` and auto-loaded by Electron. If future work touches the Help menu, refer to the orchestration logs in `.squad/orchestration-log/2026-05-04T15-28-16Z-{oracle,morpheus}.md` for the contract (output paths, self-contained format). The `md-to-html` skill at `.squad/skills/md-to-html/SKILL.md` documents the pattern for reuse.

---

## Learnings

**2026-05-05 — Team Lesson: Use `app.isPackaged` for Electron prod gating, not `NODE_ENV`**

**Critical note for all agents (especially those touching bootstrap, seed, preferences, or app restart logic):**

Trial.3 and trial.3.1 "folder switch shows old data" reports were **misdiagnoses**. The actual bug: packaged Electron builds were seeding demo data into every empty folder because `shouldSeed()` checked `process.env.NODE_ENV === 'production'`, which is **undefined** in packaged apps.

**Root cause:** `process.env.NODE_ENV` is a Node.js/bundler convention, not an Electron convention.

**Canonical Electron check: `app.isPackaged` (read-only boolean).**

**Rule for all prod-gating in Electron:**
- Use `app.isPackaged` as primary gate for dev-only features (seeding, logging, debug menus, feature flags)
- `NODE_ENV` checks are secondary overrides only, never the primary gate

**Example fix:**
```ts
// WRONG: 
if (process.env['NODE_ENV'] === 'production') return false;

// CORRECT:
if (isPackaged) return false;  // Primary gate
if (process.env['NODE_ENV'] === 'production') return false;  // Secondary override
```

**Implications:**
- Existing empty trial.3/trial.3.1 test folders contain seeded demo data — should be cleared
- New empty folders post-trial.3.2 stay empty ✓
- Affects any feature that gates differently in dev vs packaged builds

**References:**
- PR #271 (trial.3.2): https://github.com/rett-europe/opentreasury-desktop/pull/271
- Electron docs: https://www.electronjs.org/docs/latest/api/app#appispackaged-readonly
- Changes: `app/src/main/bootstrap.ts` (shouldSeed + caller)

---

**2026-05-15 — PR #226: Complete 30→90 day i18n rollout (squad/dashboard-i18n-90day-audit)**

**Problem:** PR #224 claimed to update all i18n strings from 30 to 90 days, but the actual string changes never landed in the committed files. Meanwhile, PR #225 added both `last-30-days` AND `last-90-days` to `DATE_PRESET_IDS`, causing Movements filter to render TWO broken raw-key chips.

**Root cause:** Git merge/rebase conflict during the PR sequence. Commit 586a62e (PR #224) correctly updated all i18n strings 30→90, but commit 5775b36 (an earlier-dated fix that merged later) re-added `last-30-days` keys to the movements presets block. The final merge kept the stale 30-day strings in the panel section and left both preset IDs in the array.

**Fixes applied:**
1. **Dashboard i18n (en + es):**
   - `panel.subtitle`: `"Last 30 days overview"` → `"Last 90 days overview"`
   - `panel.cta.date-range`: `"Last 30 days"` → `"Last 90 days"`
   - `panel.sections.accounts`: `"Balances by account"` → `"Account activity · Last 90 days"` (scope-explicit, as originally intended in PR #224)
   - `panel.sections.summary`: `"Last 30 days summary"` → `"Last 90 days summary"`
   - Removed unused `panel.range.last-30-days` key (never referenced in code)
   - Spanish equivalents updated identically

2. **Movements filter chip cleanup:**
   - Removed BOTH `'last-30-days'` AND `'last-90-days'` from `DATE_PRESET_IDS` in `datePresets.ts`
   - Rationale: Movements already offers "Last 3 months" (~90 days). Having both short-day presets is redundant and was causing two broken chips to render.
   - Removed both from `FACTORIES` object
   - Kept `last30Days()` and `last90Days()` factory functions exported (PanelScreen uses `last90Days` directly via import, not via the chip list)
   - Updated `datePresets.test.ts` to match new ID list
   - Removed old unused `movements.presets` section from both locale files (dead keys from early prototype)

3. **Documentation:**
   - Added JSDoc comment to `getAccountBalances()` clarifying: "Excludes opening balances; only sums transaction amounts across entire history."
   - Noted that future range-scoped query can be added as `getAccountBalancesInRange(from, to)` when needed

**Lesson for Trinity:**
- **Always grep-verify i18n changes after editing locale JSON files.** This is the second time in this session (first was PR #141 breadcrumb labels) where a "rename" was claimed but the actual strings didn't land in the committed diff.
- **Pattern to follow:** After editing locale files, run `grep -r "old string pattern" app/src/renderer/locales/` to confirm zero matches before committing.
- **Root cause awareness:** When multiple PRs touch the same i18n keys (especially during refactors or renames), merge conflicts in JSON can silently keep stale values. The solution is verification, not assumption.
- **Chip list hygiene:** When preset IDs appear in filter chips (via `DATE_PRESET_IDS`), every ID MUST have a corresponding `movements.filters.dateRange.presets.{id}` i18n key, OR it should not be in the list. Don't add a preset ID "just because the factory exists" — only expose it if users should see it as a chip.

Validation gates: typecheck ✓, lint ✓, format:check ✓, npm test ✓ (101 test files passed | 3 skipped, 962 tests passed | 63 skipped).

**2026-05-11 — PR #221: Dashboard rolling 30-day window (squad/dashboard-rolling-30-days)**

Replaced Dashboard's "current month" default with a rolling 30-day window to fix the calendar-cliff bug (dashboard appearing empty on the 1st of every month).

**Date logic location:** Dashboard KPIs were fetched in `PanelScreen.tsx` (line 68) via `panelApi.getMonthKPIs(currentMonth)` which called the IPC handler `panel:get-month-kpis`. The backend query `getMonthKPIs` in `core/query/queries.ts` filtered transactions by `tx.date.startsWith(yearMonth)` (line 110) — a month-prefix match.

**Date-filter contract shape:** The datePresets module (`renderer/utils/datePresets.ts`) exports a discriminated union of preset IDs and factory functions that return `{ from: string, to: string }` (YYYY-MM-DD format). Each preset is a pure function accepting `today: Date` for deterministic testing. The `getPresetRange(id, today)` dispatcher resolves any preset ID to a concrete range. I extended this with `last-30-days` → `last30Days(today)` factory (line 89-95).

**New IPC method:** Rather than modifying `getMonthKPIs` (other screens might depend on month-anchored logic), I added a parallel `getRangeKPIs(from, to)` query in `core/query/queries.ts` (lines 133-169), mirroring the month-based aggregation but filtering on inclusive date boundaries (`tx.date >= from && tx.date <= to`, line 149). New IPC contract: `panel:get-range-kpis` with Zod schemas `GetRangeKPIsRequest/Response` in `shared/ipc-contracts/panel.ts` (lines 105-133). Wired through `main/ipc/handlers.ts` (lines 11, 16, 346-350) and `preload/index.ts` (lines 11, 16, 215-217).

**i18n key path conventions:** Panel screen strings live under `panel.*` in `locales/{en,es}/common.json`. Key updates:
- `panel.subtitle`: "Month overview" → "Last 30 days overview" (en), "Vista general del mes" → "Vista general de los últimos 30 días" (es)
- `panel.cta.date-range`: Static "April 2026" → "Last 30 days" / "Últimos 30 días"
- `panel.sections.summary`: "Month summary" → "Last 30 days summary" / "Resumen de los últimos 30 días"
- Added `panel.range.last-30-days`: "Last 30 days" / "Últimos 30 días" (consumed by `KPIStrip.month` prop, line 295)

**Test coverage:** Added `getRangeKPIs` unit test in `core/query/queries.test.ts` (3 transactions across dates, filter 2026-04-01 through 2026-04-30, verify inclusive boundaries + empty range). Added `last30Days` preset tests in `renderer/utils/datePresets.test.ts` (basic case + month-boundary edge case). Updated `DATE_PRESET_IDS` assertion to include `'last-30-days'`. All 104 test files green.

**Movements screen unchanged:** PR scope explicitly excluded Movements filter behavior (still defaults to `this-month` per `movementsDateFilter.ts` line 23). Flagged for future review in `.squad/decisions/inbox/`.

**For Trinity:**
- Date-range queries: Use the `getRangeKPIs(from, to)` pattern for any future aggregations over user-selected windows. Month-anchored `getMonthKPIs` is still available for fixed calendar periods.
- Preset extension: To add a new preset (e.g., "last 7 days"), add the ID to `DATE_PRESET_IDS`, write a factory function in `datePresets.ts`, register it in `FACTORIES`, and add test cases covering edge boundaries (month/year rollover). Always use `utcToday(today)` for timezone-safe math.
- i18n pattern: Dashboard copy keys follow `panel.{category}.{key}` structure. New time-range labels go under `panel.range.*` for reuse across components.

**2026-05-08 — PR #216: dev:empty semantics + onboarding hydration (squad/fix-dev-empty-onboarding-regression)**

Wizard now safe to test in dev mode. `npm run dev:empty` reliably reproduces first-run state with clean wizard render (no pre-filled read model). Bootstrap defers all hydration when `appConfig.dataDir === null`, preventing the race condition where seed events would load before wizard renders. 

**For Trinity:** Onboarding wizard paths are now stabilized. The wizard fires consistently when userData/app-config.json is missing, and `config:setDataDir` is null-tolerant for first-run. IPC handlers for wizard needs (`dialog:pickFolder`, `config:setDataDir`, `config:get`, `profile:*`) are always live; data-dependent handlers are gated by bootstrap state. WI-15 config CRUD (accounts/categories/tags) can safely assume dataDir is set once bootstrap completes.

**2026-05-05 — PR #190: Corp-storage error silent failure (squad/preferences-dataset-switch-silent-rejection)**

Fixed regression from PR #188 where picking a non-corporate folder (e.g., Pedro's exact case: `c:\temp`) showed no error — user clicked "Cambiar", picked folder, got silently returned to Preferences with no feedback.

**Root cause:** PR #188 tightened `syncRoot.ts` classification from denylist to strict allowlist (only `OneDrive - {Org}` allowed), but the dataset-switch handler in `PreferencesScreen.tsx` never set `changeState = 'error'` when setting `changeError`. Since the error div only renders when `changeState === 'error'` (line 730), all validation failures silently swallowed. The `finally` block unconditionally reset state to `'idle'`, wiping out any error set earlier in the handler.

**Critical lesson:** Tightening a classifier (denylist→allowlist) is a **contract change**. Every consumer's switch/if must be re-audited for unhandled values. Always end async UX handlers with an explicit state assignment — never an implicit return. **EVERY exit path of a click handler must produce a visible outcome.** No silent failures.

**Fix pattern:**
1. Set `changeState = 'error'` alongside **every** `setChangeError` call (5 locations: picker failed, OneDrive Personal, NOT_CORP_LOCATION, unexpected error, attemptSetDataDir IPC error)
2. Update `finally` block to preserve `'error'` state: `setChangeState((current) => (current === 'restarting' || current === 'error' ? current : 'idle'))`
3. Enable button in BOTH `'idle'` AND `'error'` states so user can retry: `disabled={(changeState !== 'idle' && changeState !== 'error') || configData.readOnly}`
4. Add defensive comment: `// Every exit path must show user feedback.`

**Audit findings:** Only call-site of `classifySyncRoot` is PreferencesScreen (fixed). No other switch/if regressions from #188's contract change.

**Testing:** Updated 2 corp-storage tests to use `c:\temp` (Pedro's case) and verify error renders without calling IPC (renderer validates locally post-#188). Added `c:\temp` test case to `syncRoot.test.ts`. All 18 PreferencesScreen tests pass, full suite 937 tests pass.

**2026-05-04 — Profile validation UX fix (squad/preferences-profile-save-ux-fix)**

Fixed two validation UX bugs in PreferencesScreen profile form discovered by Pedro during manual testing:

1. **Raw i18n key rendering:** User saw literal `preferences.profile.saveFailed` instead of friendly error message. Root cause: generic `saveFailed` message was rendering for validation failures (which should show per-field errors). Fix: only show generic `saveFailed` when `profileState === 'error' && Object.keys(profileErrors).length === 0` (actual IPC save failure, not validation failure).

2. **Stale validation + disabled button:** After validation failure, error message persisted and Save button stayed disabled even when user typed back the valid value. Root cause: errors cleared on input change, but button disabled logic only checked `profileChanged` (which is false when value matches original). Fix: introduced `validationAttempted` flag set on first save attempt, cleared on successful save. Button disabled logic: `(!profileChanged && !saveAttemptFailed && !validationAttempted) || profileState === 'saving'`. This keeps button enabled after ANY save attempt (validation or IPC failure) until successful save, even if user types back to original value.

**Pattern learned:** Renderer error UX requires THREE layers:
(a) Per-field friendly messages keyed by error code — already existed in i18n (`preferences.profile.errors.ngoNameRequired`, etc.)
(b) Generic fallback for IPC failures — only show when no field errors exist
(c) NEVER render raw translation keys — if the key resolves to itself, treat as missing-key bug.

Plus stale validation must clear on user input. Errors cleared via dedicated change handlers (`handleNameChange`, `handleNgoNameChange`, `handleRoleChange`, `handleOtherRoleChange`) that call `setProfileErrors({})` and `setProfileState('idle')`. Save button logic tracks both `saveAttemptFailed` (IPC error) and `validationAttempted` (validation error) to allow retry even when values revert to original.

**Testing:** Added 3 new tests: (1) empty ngoName → save → field error appears → type back → error clears + button enables; (2) same for name field; (3) IPC save fails → type original value back → button stays enabled. All 9 PreferencesScreen tests passing. Full suite: 935 tests passing.

**2026-04-29 — PR #178: Profile Save button no-op fix (squad/preferences-profile-save-fix)**

Fixed the Profile Save button in PreferencesScreen, which was silently failing when users changed their name, role, or organization. Root cause: the save handler passed an **empty `userId` string** (`''`) to the IPC call, violating the `profileSchema` requirement for a 26-character ULID. The main process rejected the save with `SCHEMA_INVALID`, but the renderer never displayed any error feedback to the user.

**Pattern learned:** When the renderer displays a subset of an IPC object's fields for editing, always store the *full object* (including immutable fields like `userId`, `identitySource`, `createdAt`) when loading from IPC. On save, merge the edited fields with the preserved originals so Zod validation succeeds. Never hard-code or discard required fields that the schema expects.

**Error feedback discipline:** Every IPC mutation with `response.ok: false` must produce visible UI feedback (toast, inline error message, or form-level error text). Silent failures are unacceptable. Always add `console.error()` for error paths so "nothing happens" reports are debuggable.

**Fix details:**
- Added `fullProfile: Profile | null` state to store the complete profile object
- Updated `handleSaveProfile` to preserve `userId`, `identitySource`, `createdAt` when calling `profile.save()`
- Added visible error message when `response.ok === false` (translation keys already existed)
- Added console.error for all failure paths (missing profile, IPC error, validation error)

**Testing:** New tests verify (a) IPC is called with preserved fields and (b) error UI appears when save fails. All 6 PreferencesScreen tests pass. Installed `@testing-library/user-event` for interaction tests.

**2026-05-04 — PR #174: Trial-readiness PR-A (squad/settings-corp-enforcement)**

Fixed two Settings-related trial-readiness blockers for Pedro's manual validation:

1. **"Data folder" showed "(default)" instead of the real path:** Extended `config:get` IPC response to include `effectiveDataDir: string` (the actually-in-use absolute path). Added `getEffectiveEventLogDir()` getter to `bootstrap.ts` to expose the resolved path after applying config/env/defaults. Updated `SettingsScreen.tsx` to always display `effectiveDataDir` in the `<code>` block, with a small "(default location)" badge when `dataDir === null` (replacing the redundant double "(default)" rendering).

2. **Folder picker was too permissive:** Created `classifySyncRoot(path): SyncRootKind` utility (`app/src/renderer/utils/syncRoot.ts`) to detect OneDrive Business vs Personal vs SharePoint vs local/other. Detection rules (Windows-first; macOS later):
   - **OneDrive for Business:** `/OneDrive\s*-\s*[^/\\]+/` (case-insensitive)
   - **SharePoint sync:** heuristic for sync-client patterns (e.g., `Tenant\... - Library` or `TenantName - SiteName`)
   - **OneDrive Personal:** `/OneDrive(?:\/|$)/` without " - " suffix → REJECT
   - **Other:** Desktop/Documents/USB/etc. → REJECT with new `NOT_CORP_LOCATION` error
   Updated validation flow to reject anything except OneDrive Business or SharePoint. Updated dialog picker title to "Select OneDrive for Business or SharePoint folder".

**Pattern learned:** When the renderer needs the "effective" value of a config that has fallback logic (env override → config → default), expose it explicitly via the IPC contract rather than duplicating the resolution logic renderer-side. The main process already resolves `resolveEventLogDir()` at bootstrap; adding `effectiveDataDir` to the response keeps a single source of truth and eliminates the "(default)" placeholder hack.

**Testing discipline:** Created focused unit test suite for `classifySyncRoot` (7 test cases covering OneDrive Business/Personal, SharePoint, local paths, edge cases, cross-platform). All 8 existing SettingsScreen tests updated to handle the new `effectiveDataDir` field in the mock response. 997 tests passed.

## Core Context

**CANONICAL KPI PATTERN (2026-04-27):** Mouse established reusable `.ot-kpi-strip` recipe in PR #104 (`squad/visual-consistency-income-expense-net`) for income/expense/net cards. Pattern: TrendingUp/TrendingDown/Calculator icons @ 20px + --color-income-default / --color-expense-default / --color-brand-primary via shared CSS recipe in `globals.css`. Grid template: `repeat(auto-fit, minmax(240px, 1fr))` — responsive flow prevents awkward wraps at intermediate viewports. Aligned across Movements, Insights; Saldo already matched. This is the canonical visual baseline for all KPI indicators going forward — future features reuse this pattern instead of one-off icon/color choices.

**WI-17 Orientation (2026-04-20):** Import wizard UI spec frozen in `.squad/decisions.md` under "WI-17 v2 — Generic Column-Mapping Importer". Niobe's 6-step UX flow (account selector → upload → sheet picker → mapping dropdowns → dry-run preview → progress) is the authoritative spec; Neo's technical spec defines the IPC contract boundaries. Your task: build the wizard modal (Entry point: Configuración → DATOS tab), mapping UI with pre-fill from `importApi.lastMapping()`, dry-run preview table showing 5 sample rows + duplicates/errors tabs, and commit flow with success/failure states. All i18n keys pre-populated (EN/ES parity required). See decisions.md §"WI-17 v2" for full spec + work decomposition WI-17.3.

Renderer architecture: single-useState router in `App.tsx` (no React Router), AppShell sidebar with two sections — **Principal** (Panel, Movimientos, Saldo) and **Configuración** (Configuración). Icon set: `lucide-react`. i18n via `locales/{en,es}/common.json`; ES + EN parity mandatory.

IPC consumption: renderer imports types from `app/src/shared/ipc-contracts/*` — never from `main/` or `core/`. Service layer lives in `renderer/services/*Api.ts`. Modals are native `<dialog>` via `showModal()` — Escape + backdrop click both invoke `onClose`; `role="dialog"` + `aria-modal="true"` + labelled header. All colors via design tokens (no inline hex in component CSS). Prototype (`prototype/`) is the visual/interaction contract per the prototype-fidelity ruling; design system is a translation layer.

Contract shape (post WI-15-lite): create responses are flat-event discriminated unions — `{ ok: true, event: { type, id, …fields, createdAt } }` or `{ ok: false, error: { code, message, field? } }`. List endpoints currently return wrapped objects (`{ accounts: [...] }` etc.) — keep matching that. `CreateTransactionRequest` already carries `categoryId` / `tagIds` — no contract change was needed to wire Category + Tags into Add-Transaction.

Shipped so far: Movements screen (WI-13), Add-Transaction modal, Panel rendering, WI-15-lite Configuración (3 tabs + 3 modals + service apis + AppShell wiring). No toast primitive yet (WI-16). No archive/edit/delete, no subcategories (WI-15-lite scope). Deferred: WI-17 import UI, full WI-15 edit/archive/delete.

**Historical Summary (2026-04-19 — 2026-04-20):**
- **WI-17 Completed:** Import wizard (6-step UI), security hardening (fileId tokens, pathGuard, sessionFileRegistry), TypeScript strict-mode alignment. 175 tests passing. Commit a97d21e on main.
- **WI-13 Shipped:** Add-Transaction modal + Movements list with real IPC (createTransaction). Pattern: native `<dialog>`, two-tier validation, Zod schema parse-on-receive.
- **Panel IPC wiring complete:** All 5 queries fire on mount, skeleton→loaded transition, zero layout shift. Zod schema parsing at boundary catches main-process drift.
- **Foundational patterns:** Multi-step wizard state (discriminated unions), modal form validation, i18n for all user-facing text (EN+ES), date formatting centralized, accessible form fields.

## Cross-Agent Learning (2026-04-22)

**From Morpheus (WI-21 config CRUD):** Update payload invariant pattern — schema refines on VALUES (not keys), handlers trim + delete empty optionals, then re-check for no-op collapse. This is useful when Trinity needs to reason about whether a payload will actually reach the log or get rejected early. When Trinity encounters "the user just clicked Save but nothing changed" UX issues, the pattern is: schema enforces "no empty object of optionals" + handler normalizes before checking again. No payload with all-undefined/empty-string fields can sneak through. Apply this pattern to other update handlers Trinity builds in future WIs (edit category, edit tag, etc.).

**WI-22 Saldo shipped (2026-04-22):** PR #7 (Morpheus backend S1–S3) merged to main. PR #9 (Niobe i18n, 72 ES/EN keys) merged to main. S4 (Trinity chart primitive) complete; S5 (SaldoScreen wiring) in progress. Last `<ComingSoonScreen />` on M1 route now removed — Internal Alpha gate open. Property test verified all 8 invariants hold (I8: Saldo ≡ Movements proven sound).

## Learnings

**2026-04-28 — PR #141: Insights Detail Polish (squad/trinity-insights-detail-polish)**

Shipped three improvements to Insights detail screen (Pedro dogfooding feedback):

1. **Pac-Man donut SVG fix (reusable pattern):** Original `DonutChart` used cumulative `strokeDashoffset` positioning, which silently clipped dashes exceeding path end position. Any slice ≥ ~75% circumference would show a wedge-shaped gap (Pac-Man mouth). Root cause: the [75%, 100%) range was not covered by the 100%-single-slice shortcut. **Fix:** rotate each segment to its start angle via `transform="rotate(startAngle, cx, cy)"` and start every dash at path position 0 (no offset). This ensures any fraction [0, 1] always fits in [0, L] path regardless of distribution. **Locked rule for future agents:** Per-segment rotation is the canonical approach for SVG circumference rendering (donut, pie, polar). Updated `.squad/skills/svg-donut-chart/SKILL.md`.

2. **Diverging bar chart (reusable pattern):** Replaced dual toggleable bar charts (one for gastos, one for ingresos) with single `DivergingSubcategoryChart`. Rationale: gastos and ingresos do NOT share subcategories (e.g., "Salario › Base" is income-only; "Casa › Alquiler" is expense-only). Grouped/stacked layouts require synthetic zero rows and obscure magnitude comparisons. Diverging horizontal bars (gastos left, ingresos right) let users read both distributions in one glance, mirroring donut row above. Uses canonical `--color-expense-default` / `--color-income-default` tokens for side legends. Narrow viewports (<720px) collapse diverging metaphor and stack vertically. **Locked rule:** When two categorical distributions share no keys, use diverging layout.

3. **Breadcrumb label format (locked rule):** Bar row labels, tooltips, and progressbar ARIA labels now show `Category › Subcategory` format using U+203A SINGLE RIGHT-POINTING ANGLE QUOTATION MARK (NOT ASCII `>`). Implemented as `formatBreadcrumbLabel(categoryName, subcategoryName, subcategoryId)`; when `subcategoryId == null`, only category name is shown (no chevron). Verified donut tooltips are category-level only (keyed on `categoryId`), so no breadcrumb applied there.

**Files changed:**
- `app/src/renderer/components/DonutChart/DonutChart.tsx` — rotation-based rendering, +2 Pac-Man regression tests
- `app/src/renderer/components/DivergingSubcategoryChart/` — new component (tsx, css, test, index)
- `app/src/renderer/screens/InsightsDetailScreen/InsightsDetailScreen.tsx` — drops `SegmentedToggle` + `subcatView` state, wires both donuts to single `selectedCategoryId`
- `app/src/renderer/components/SubcategoryDistributionPanel/` — removed (no other consumers)
- `.squad/skills/svg-donut-chart/SKILL.md` — corrected core technique

**Validation:** 829 tests passing (full suite green), +13 new tests (Pac-Man regressions, breadcrumb formatting, diverging chart rendering). Commit 6a092b8 on main.

**2026-05-03 — PR #121: Splits Wave B (squad/59-splits-wave-b)**

Delivered 6 v1-quality bar items for SPEC-023 splits feature (issue #59):

1. **FR10/AC6 — Category filter for split parents:** Extended MovementRecord IPC contract with `splitCategoryIds` / `splitSubcategoryIds` arrays. Handler (app/src/main/ipc/handlers/movements.ts) populates from read model's `splits` map. Client-side filter (app/src/renderer/screens/MovementsScreen/MovementsScreen.tsx) checks both parent category and split categories — parent shows if parent OR any split matches the selected category. Same logic for subcategories. This pattern (embed denormalized filter keys in the list response) is cleaner than async per-row lookups in a useMemo.

2. **AC14/FR14 — Amount field disabled when hasSplits:** Added `amountDisabled` prop to TransactionFormFields. Wired from TransactionDetailModal when `rawRecord?.hasSplits`. Don't repurpose `readonly` — that's a global mode. Specific field-disable props are clearer.

3. **AC1/UX-007 §2.1 — Row action for split:** Since no context menu infrastructure exists, implemented as inline action button in description column (TransactionsTable.tsx). Wrapped description in `.ot-description-cell` span, show action button on row hover (opacity: 0 → 1). Gated to `status === 'approved' && !hasSplits`. This required updating MovementsScreen tests to query the closest `.ot-description-cell` for tooltip assertions.

4. **partCount i18n:** Changed hardcoded badge text to `t('splits.list.partCount', { count: row.splitCount ?? 0 })`. Required nullish coalesce because splitCount is optional (TypeScript strict mode). The plural keys were already in place from PR #116.

5. **Row-level error highlight:** Added helper `isRowAmountInvalid(split)` in SplitTransactionModal, applied `.ot-split-row--error` class when balance is off AND row amount is invalid. Added `aria-invalid` + `aria-describedby` linking to the sum-mismatch banner. Created SplitTransactionModal.css for the error styles (red border, background tint). Previously the modal had no dedicated CSS file — split modal styles were probably in globals or inline.

6. **Ctrl+Enter save:** Extended the existing `useEffect` listener block to add a `keydown` handler. Check `(e.ctrlKey || e.metaKey) && e.key === 'Enter'` and gate to `canSubmit && !isSubmitting`. This pattern (single effect with multiple listeners) is cleaner than separate effects — fewer registration cycles.

**File paths:**
- IPC contract: `app/src/shared/ipc-contracts/movements.ts` (added splitCategoryIds/splitSubcategoryIds)
- Handler: `app/src/main/ipc/handlers/movements.ts` (populate split category arrays)
- Filter logic: `app/src/renderer/screens/MovementsScreen/MovementsScreen.tsx` (useMemo category filter)
- Form field: `app/src/renderer/components/TransactionFormFields/TransactionFormFields.tsx` (amountDisabled prop)
- Detail modal: `app/src/renderer/components/TransactionDetailModal/TransactionDetailModal.tsx` (wire amountDisabled)
- Table: `app/src/renderer/components/TransactionsTable/TransactionsTable.tsx` (row action + partCount i18n)
- Table CSS: `app/src/renderer/components/TransactionsTable/TransactionsTable.css` (description cell + split badge)
- Split modal: `app/src/renderer/components/SplitTransactionModal/SplitTransactionModal.tsx` (row error + Ctrl+Enter)
- Split modal CSS: `app/src/renderer/components/SplitTransactionModal/SplitTransactionModal.css` (error row styles)

**Testing:** Fixed MovementsScreen.test.tsx tooltip assertions to query `.ot-description-cell` parent. All 751 tests passing.

**Wave B Coordination (2026-04-27):**
- Part of concurrent 4-agent splits sprint (Trinity + Morpheus + Niobe + Cypher)
- Morpheus PR #117 (IPC handlers) merged ✅ to unblock this wave
- Parallel checkout race with Cypher E2E avoided by staggered branch creation (day-old lesson documented in history)
- Cypher's E2E PR #119 closed (false-green detection) — will re-open post-Wave-B-merge with real assertions

**2026-04-29 — PR #162: Settings screen with data folder row (squad/152-settings-data-folder)**

Delivered P1-5 (trial-readiness) — Settings screen with data folder display and read-only mode indicator.

1. **New 'settings' route:** Added to `Route` union type in AppShell. Settings button in topbar now navigates to the settings route instead of being a dead button.

2. **SettingsScreen component:** Shows current `dataDir` from `window.opentreasury.config.get()`. When `dataDir === null`, displays "(default)" marker (the actual default path `<userData>/dev-events` is computed server-side in bootstrap.ts). When `appConfig.readOnly === true`, shows a "Read-only mode" badge.

3. **"Change..." button stub:** The button is disabled with a tooltip explaining that the folder picker + `setDataDir` IPC will arrive in P1-2 (#149). Once that lands, this screen will call `window.opentreasury.config.setDataDir()` and trigger an app relaunch. For now, a note explains "Folder picker arrives with the next release (P1-2)."

4. **IPC wiring:** Extended `app/src/preload/index.ts` to expose `window.opentreasury.config.get()` (the `config:get` handler was already registered by Morpheus in P0-3).

5. **i18n:** Added `settings.dataFolder.*` keys to `en/common.json` and `es/common.json` — title, defaultMarker, changeButton, readonlyBadge, changeDisabledTooltip, changeComingSoon. Also added `shell.settings.label` for the topbar button tooltip.

6. **Component tests:** 7 tests covering loading state, error state, default path, custom path, readonly badge presence/absence, and disabled button state.

**Files changed:**
- `app/src/preload/index.ts` — added `config.get()` to API surface
- `app/src/renderer/App.tsx` — imported SettingsScreen, added route case
- `app/src/renderer/screens/AppShell/AppShell.tsx` — added 'settings' to Route type, wired Settings button onClick
- `app/src/renderer/screens/SettingsScreen/*` — new component (tsx, css, test, index)
- `app/src/renderer/locales/{en,es}/common.json` — added settings.* and shell.settings.* keys

**Validation:** All tests pass (7/7 SettingsScreen tests, full suite green). Typecheck, lint, format all pass.

**Out of scope (as planned):**
- Folder picker UI + `config:setDataDir` IPC → P1-2 (Morpheus, #149)
- OneDrive Personal blocklist → P2-4 (Trinity, separate ticket)
- Relaunch flow → P1-2 (Morpheus)

**Coordination note:** Avoided touching main-process files — Switch is concurrently working on `squad/150-readonly-middleware` (P1-3). No file overlap.
- Shared TransactionsTable component (PR #105) now single source of truth for tx list UI across screens (Reuse-First team rule adopted)

**2026-05-02 — PR #105: Tag colors, dashboard chart (squad/dashboard-bugs-tags-recent-chart)**

**Bug 1 — Tag chip color lookup:** When tag names are stored in the UI Movement type but colors need to be rendered, create a `tagColor` callback that looks up the full TagRecord from the `tags` state array. Pattern: `const tag = tags.find(t => t.name === tagName); return tag?.color ?? fallbackColor`. This avoids needing to thread color data through the mapMovementRecord transformation or store duplicate color maps. The tags state already has the full TagRecord[] with name+color+id, so use it directly.

**Bug 3 — Chart component reuse across screens:** GroupedBarChart is the canonical income/expense bar chart component. Reuse it on Panel/Dashboard by fetching monthly income/expense data (added `getMonthlyIncomeExpense` backend query) and passing it to the same component. Pattern: fetch 12 months of data, map to `{ label: monthName, values: [income, expense] }[]`, pass legend `['Income', 'Expense']`. This ensures visual consistency and avoids duplicating chart logic. Same component is used on Saldo (year comparison) and now Panel (monthly trend).

**Panel IPC handler investigation (Bug 2):** When debugging "only showing transactions from one account" issues, trace the full query path: core/query function → IPC handler → renderer service → UI. The `queryRecentTransactions` query correctly returns ALL transactions from `model.transactions` with no accountId filter. If the UI only shows one account's data, it's a DATA issue (user only has transactions in that account), not a code bug. Always verify the query logic before assuming UI filtering bugs.

**WI-20 Visual Bug Debugging:** When Pedro reports the same visual bug 3+ times across multiple rounds, STOP patching CSS. Read the screenshot. Consider that tests passing does not equal visually correct. If a modal/component has multiple modes (view/edit), they should render through the SAME structural scaffold — only cell contents should differ. If you find yourself writing mode-specific CSS classes or swapping between different component trees, you've already diverged. Add visual regression tests or snapshots that compare scaffold structure between modes, not just DOM presence checks.

**Modal-shell override pattern (2026-04-25):** When a modal reuses TransactionDetailModal shell, scope sizing overrides (width, min-height) under a marker class. Do not fork the shell CSS. Pattern documented at `.squad/skills/modal-shell-overrides/SKILL.md`.

**Scope Bar recipe placement (2026-04-28, PR #57):** When adding new shared UI patterns like `.ot-scope-bar` (the date-filter band), the recipe MUST go in `globals.css`, not in component CSS files (MovementsScreen.css). This follows the prototype-parity rule: component CSS imported after globals wins every cascade conflict and silently shadows token updates. The `.ot-scope-bar` class defines the full-width tinted container (`--color-brand-surface` bg, `--color-divider` bottom border) that anchors above `.ot-filter-bar`. When a scope bar precedes a filter bar, the filter bar gets `.ot-scope-bar + .ot-filter-bar` modifier to remove its top border and round only bottom corners.

## 2026-04-28 — PR #57 + #58 Shipped

- **PR #57 (joint two-row filter bar):** Date scope chips + active-range pill moved into dedicated scope bar above slicing filters. Reuses `.ot-scope-bar` recipe (globals.css) — pattern is now reusable across Panel, Saldo. Visual treatment: Calm Scope (weight contrast, no full-width tint) post-review update from Mouse's Anchored Band spec.
- **PR #58 (transaction detail bugs):** Fixed 3 bugs on dev-empty: (1) DatosScreen "See transactions" CTA now navigates via onNavigateToMovements prop, (2) description tooltip shows reference + details, (3) reference/details threaded through Movement type, mapMovementRecord, row→tx conversion, and main-process movements:list handler. i18n keys movements.tooltip.reference/.details added (EN/ES parity).
- **Layout/visual decision pivot finalized:** Niobe Option A (Dedicated Scope Bar) locked; Mouse pivoted from Anchored Band to Calm Scope (weight over tint). Decision inbox entries consolidated into decisions.md §"2026-04-28: Movements Filter UI."

### 2026-05-08 — PR #217: onboarding wizard white-on-white

**What:** First-run `OnboardingScreen` (#215) shipped with CSS referencing tokens that don't exist in `tokens.css` — `--color-bg-default`, `--color-bg-surface`, `--color-bg-hover`, `--color-accent-default`, `--color-text-on-accent`, `--color-error-default`. They all silently resolved to nothing, so scrim and card backgrounds fell through to white.

**Lesson:** Before authoring a new screen's CSS, grep `app/src/renderer/styles/tokens.css` for the *actual* token names. This codebase uses `--color-surface-{app,primary,secondary,raised,sunken,overlay}` (not `--color-bg-*`), `--color-brand-primary` + `--color-brand-on-primary` (not `--color-accent-*`), `--color-danger-default` (not `--color-error-default`). Reference modals: `ProfileSetupModal.css` and `TransactionDetailModal.css`.

**Modal recipe (no shared component yet):** scrim = `--color-surface-overlay`; card = `--color-surface-primary` + `--color-border-default` + `--shadow-dialog` + `--radius-lg`; primary button = `--color-brand-primary` / `--color-brand-on-primary`; focus = `--color-focus-ring` outline. If we keep hand-rolling this, it's worth proposing a shared `.ot-modal` recipe to Niobe/Mouse — flagged but not done in this PR.

**Validation note:** `MovementsScreen.staleModal.test.tsx` is currently flaky on `main` (timing-related `waitFor` on table render). Confirmed pre-existing by stashing my diff and re-running. Worth a separate ticket.


**2026-05-13 — PR #228: Dashboard account labels + Movements account filter (squad/dashboard-account-labels-and-movements-dropdown)**

Fixed two renderer-only UI bugs where account identification was broken — pairs with Morpheus's parallel PR #4 (range-scoped balance amounts) to make the dashboard fully accurate.

**Bug #1 (Dashboard cards):** Pedro has 3 CaixaBank accounts with different labels ('CaixaBank FinRett', 'CaixaBank 5315', 'CaixaBank 0951'), but all 3 dashboard cards displayed just 'CaixaBank' — indistinguishable. Root cause: \PanelScreen.tsx\ line 253 used \cc.bankNameShort ?? acc.bankName\, ignoring the unique \ccountLabel\ field.

**Fix:** Changed display name source to \cc.accountLabel ?? acc.bankNameShort ?? acc.bankName\. Added CSS \overflow-wrap: break-word\ to \.ot-account-card__name\ to handle long labels gracefully. Dashboard now shows distinct labels for each account.

**Bug #3 (Movements dropdown):** Dropdown listed only 4 entries (legacy slug accountIds like 'finrett/paypal') instead of all 5 configured account labels. Root cause: \ccountOptions\ was built from observed rows (\m.account\ display labels), so accounts with zero transactions in the current view disappeared, and legacy slug accountIds leaked through when \ccountsMap.get(record.accountId)\ failed.

**Fix:**
1. Build \ccountOptions\ from the full configured \ccounts\ list, not from observed rows — all 5 accounts now appear regardless of transaction volume
2. Switched dropdown values from display labels to \ccountId\ (stable identifier)
3. Switched filter comparison to \m.accountId !== accountFilter\ (was comparing display strings)
4. Sorted dropdown by \sortOrder\ to match Dashboard ordering
5. Added \ccountId: string\ field to Movement type for stable filtering
6. Added \console.warn\ when \ccountsMap.get()\ fails to flag legacy data drift in dev

**Data model impact:** Added \
eadonly accountId: string\ to \Movement\ interface in \	ypes/movement.ts\. Updated mock data builder to map account display names to mock accountIds. This is safe because the field was already present in the wire shape (\MovementRecord\) — the bug was that the UI projection (\Movement\) was discarding it.

**For Trinity:** When building dropdowns for filtering, always use stable identifiers (IDs) as the option values and display labels as the option text. Never filter on display strings — they're user-facing and can change. Build filter options from the configured list (not from observed data rows) to ensure all configured items appear regardless of current data. This applies to all entity dropdowns (accounts, categories, tags).

**For Trinity:** The underlying data drift (some txs reference legacy accountId slugs not in configAccounts) is a known issue. The \console.warn\ added here makes it visible in dev — flag it for Pedro/Morpheus to address in a data-migration task. Don't try to \
fix\ legacy data in the renderer.

**Validation gates:** typecheck ✅, lint ✅, format:check ✅, tests 104 files passing ✅

## 2026-05-02T10-13-30Z : Spec #206 Finalized — Implementation Sub-Issues Open

Neo approved and locked dataset compatibility spec #206 per Pedro's acceptance of Niobe's recommendations. All 6 design decisions finalized:
- Migration optional M1 / required M2+
- No manifest file M1
- appVersion best-effort
- Sequential migrations
- Hard-reject first-run repair
- SCHEMA_TOO_OLD -> 'contact support' UX

**For Trinity:** You own sub-issues #241 (folder-picker error dialogs, depends #238) and #242 (boot hydration error page, depends #239). Both depend on Morpheus foundational work (#238/#239), so start with those in parallel once #238 ships.

**Related:** PR #237 (spec finalization merged), parent issue #206 (umbrella tracking), .squad/decisions.md (merged neo-206-spec-locked entry).

**Orchestration:** .squad/orchestration-log/2026-05-02T10-13-30Z-neo.md, .squad/log/2026-05-02T10-13-30Z-206-decisions-locked-decomposed.md.


---

## Learnings ΓÇö 2026-05-06: Transient busy state on native pickers (PR #289, fixes #284 regression)

**Context.** PR #284 added a "Opening file picker..." spinner to ImportWizard's dropzone (HTML `<label><input type=file>`). It was supposed to clear via the input `change` event OR a `window` `focus` listener after a 300ms delay. In trial.3.5 the spinner got permanently stuck on packaged Windows: the user clicked, the dialog never seemed to react, and the dropzone (now `pointer-events: none`) was unclickable forever. Pedro reported it on first manual test of the installer.

**Lesson 1 ΓÇö Electron native dialog focus is unreliable on Windows.** When an HTML file input opens its native dialog in a packaged Electron app on Windows, the renderer window does not reliably `blur`/`focus` across the dialog lifecycle. The dialog is parented to the BrowserWindow and focus often stays on the parent. **A `window` `focus` listener is NOT a reliable signal that a native dialog has closed.** It works in dev (sometimes) and fails in packaged builds. Don't trust it as a sole clearer.

**Lesson 2 ΓÇö transient UI state tied to async/external events needs multiple independent clearers + a hard timeout.** The prompt suggested `try/finally`, which is the right mental model when there's an awaitable promise. When the trigger is an HTML file input (no promise to await), the equivalent is: a centralized `clearBusy()` helper invoked from *every* plausible signal (change, focus, pointerdown, visibilitychange) PLUS a hard safety timeout (e.g. 30s). Any one of them clearing is enough. Belt-and-suspenders, because each individual signal is unreliable on some platform.

**Lesson 3 ΓÇö never let a busy state make its own escape unreachable.** The `--opening` modifier set `pointer-events: none` on the dropzone. Once stuck, the user couldn't even click again to retry. **Rule:** if a busy state disables interaction, there MUST be an automatic timeout that re-enables it. Otherwise a single missed clearer = unrecoverable UI without an app restart.

**Lesson 4 ΓÇö unmount cleanup matters for setTimeout-registered listeners.** The original PR #284 only cleaned up the focus listener inside `handleFileInputChange` and the wizard-close `useEffect`. There was no general unmount cleanup, and the 300ms-delayed `setTimeout` could fire after unmount and attach a stale listener. Always pair every `setTimeout`/`addEventListener` with cleanup in a `useEffect(() => () => clearAll(), [])`.

**Pattern (reusable).** See `.squad/skills/transient-busy-state/SKILL.md`.

**PR:** #289 (squash-merged into main, branch deleted). Touched only `ImportWizard.tsx`. Typecheck/lint/tests/format all green.

## Learnings (2026-05-07 - PR #296 fix/edit-modal-spec025)

### SPEC-025 status-based edit lock implementation
- **The unlock model**: a snapshot 'originalStatus' prop on TransactionFormFields, captured from 'transaction.status' when the modal entered edit mode, drives the lock. Live form 'status' state from React drives the unlock. Locked = (originalStatus === 'approved' && status === 'approved'). This single expression satisfies AC2 (approved locks), AC3 (mid-modal approved->pending unlocks immediately), AC4 (mid-modal pending->approved does NOT lock - because originalStatus is pending in that path), and AC1 (pending always editable).
- The 'transaction' prop is stable across an edit session (parent only refreshes after save, which closes edit mode), so 'originalStatus = transaction.status' is a safe snapshot without extra useState.
- Edit-mode body's summary banner: gated on 'transaction.status === "approved"'. For pending the form fields ARE the source of truth.
- SPEC-023 split-lock takes precedence on Amount: hint key 'splits.detail.amountLocked' was already there; reused it to avoid a new string. Status hint sits under new 'transactionDetail.editLock.statusLockedHint'.
- Disabled inputs use 'aria-describedby' pointing at the hint span (id='lock-hint-{field}') only when locked AND no error - errors take precedence on aria-describedby per existing pattern.
- New CSS class '.ot-tx-fields__field-hint' mirrors '.ot-tx-fields__field-error' layout but uses '--color-text-muted' for the neutral 'info' tone the spec requires.

### ImportWizard test fix (post #290 IPC picker)
- After PR #290 the file picker became 'window.opentreasury.dialog.pickImportFile()' returning '{ ok, cancelled, path }'. The hidden '<input type="file">' is gone, so any test that did 'Object.defineProperty(fileInput, "files", ...)' now blows up with 'TypeError: Object.defineProperty called on non-object'.
- Fix pattern: in the test bridge mock, add ''dialog: { pickImportFile: vi.fn().mockResolvedValue({ ok: true, cancelled: false, path: "/tmp/sample.csv" }) }''. Then in the test flow, click '.ot-import-wizard__dropzone' instead of dispatching change on a non-existent input.
- Note: the renderer bridge namespace is 'window.opentreasury.{accounts,dialog,import,...}', NOT 'window.electron.invoke(channel)'. The Pedro-task brief described it as the latter; reality is the higher-level typed bridge.

### Modal navigation cherry-pick (#295 -> #296)
- Clean cherry-pick worked because the navigation-only changes were orthogonal to TransactionFormFields. Only conflict was the obsolete 'readonly={false}' line which was dropped.
- The unsaved-changes detection in handleNavigate compares JSON.stringify(tagIds) - good enough for the small array, but worth remembering if tagIds grow large.

### Gotchas
- prettier ignores '.gitattributes' LF normalization but flagged the test file's long string concatenations - 'npm run format' fixed it cleanly.
- 'npm run test' is heavy (~67s including Vitest startup) - prefer 'npx vitest run <path>' to iterate on a single file when wiring.

## Learnings (2026-05-08 - PR #311 fix/onboarding-test-i18n)

### i18n test setup pattern
- **beforeAll hook**: All renderer component tests that use i18n must call wait i18n.changeLanguage('en') (or 'es') in a beforeAll hook before rendering components. Without this, translations won't resolve and tests will see raw i18n keys like 'onboarding.welcome.title' instead of translated text.
- **JSON duplicate key pitfall**: JavaScript silently overwrites duplicate keys in JSON objects. If a locale file has two 'onboarding' keys at different depths, only the last one survives when imported. This caused onboarding.welcome.* translations to vanish. Fix: merge nested objects into a single parent key.
- **Pattern source**: MovementsScreen.bulk.test.tsx demonstrates the canonical beforeAll + changeLanguage pattern. Future onboarding screen tests should follow the same approach.

## 2026-05-11 — Build Invariant: ESM Native Module Externalization

**Status:** Locked decision (decisions.md)

**Rule:** Native modules must be externalized in vite.config.ts when package.json type:module.

When adding a native module (NAPI, argon2, sodium-native, etc.) that uses \__dirname\/\__filename\ to load .node prebuilds, add it to rollupOptions.external. Otherwise Vite bundles it inline and the variables become undefined in ESM scope, causing crashes.

**Related:** trial.3.7 installer crash (2026-05-11) fixed by externalization. Decision locked to prevent regression.

## 2026-05-11 — Cross-Agent Notification: Electron Main CJS Post-Build Transformation

**Build Pipeline Update:** The Electron main process now has a **guaranteed CommonJS post-build step** (scripts/build-main-cjs.mjs). This is automatic and transparent when running 
pm run build. 

**Why:** Electron's asar.unpacked redirect (native module loading) only works with CommonJS 
equire(), not ESM import. The root package.json has "type": "module", so Vite emits ESM by default. The post-build esbuild transformation reliably converts the main bundle to CJS.

**Your action:** None required. Just run the standard build and import normally. If your code adds import.meta.url references to the main process, they're automatically polyfilled by the esbuild banner.

**Reference:** .squad/decisions.md § "2026-05-11: Electron Main Process CJS Post-Build Transformation"

---

## Summary

May work focused on renderer IPC wireup (PR #317), onboarding flow completion, event log deduplication fixes, build pipeline improvements, and i18n pattern refinement. Core improvements to bootstrap flow, testing patterns, and storage layer reliability. See history-archive.md for April work (Wave 1 implementation and prototype parity remediation).

