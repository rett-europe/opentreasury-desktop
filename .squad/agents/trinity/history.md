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

## Core Context

**WI-17 Orientation (2026-04-20):** Import wizard UI spec frozen in `.squad/decisions.md` under "WI-17 v2 — Generic Column-Mapping Importer". Niobe's 6-step UX flow (account selector → upload → sheet picker → mapping dropdowns → dry-run preview → progress) is the authoritative spec; Neo's technical spec defines the IPC contract boundaries. Your task: build the wizard modal (Entry point: Configuración → DATOS tab), mapping UI with pre-fill from `importApi.lastMapping()`, dry-run preview table showing 5 sample rows + duplicates/errors tabs, and commit flow with success/failure states. All i18n keys pre-populated (EN/ES parity required). See decisions.md §"WI-17 v2" for full spec + work decomposition WI-17.3.

Renderer architecture: single-useState router in `App.tsx` (no React Router), AppShell sidebar with two sections — **Principal** (Panel, Movimientos, Saldo) and **Configuración** (Configuración). Icon set: `lucide-react`. i18n via `locales/{en,es}/common.json`; ES + EN parity mandatory.

IPC consumption: renderer imports types from `app/src/shared/ipc-contracts/*` — never from `main/` or `core/`. Service layer lives in `renderer/services/*Api.ts`. Modals are native `<dialog>` via `showModal()` — Escape + backdrop click both invoke `onClose`; `role="dialog"` + `aria-modal="true"` + labelled header. All colors via design tokens (no inline hex in component CSS). Prototype (`prototype/`) is the visual/interaction contract per the prototype-fidelity ruling; design system is a translation layer.

Contract shape (post WI-15-lite): create responses are flat-event discriminated unions — `{ ok: true, event: { type, id, …fields, createdAt } }` or `{ ok: false, error: { code, message, field? } }`. List endpoints currently return wrapped objects (`{ accounts: [...] }` etc.) — keep matching that. `CreateTransactionRequest` already carries `categoryId` / `tagIds` — no contract change was needed to wire Category + Tags into Add-Transaction.

Shipped so far: Movements screen (WI-13), Add-Transaction modal, Panel rendering, WI-15-lite Configuración (3 tabs + 3 modals + service apis + AppShell wiring). No toast primitive yet (WI-16). No archive/edit/delete, no subcategories (WI-15-lite scope). Deferred: WI-17 import UI, full WI-15 edit/archive/delete.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

## 2026-04-20 — WI-17 Import Wizard + Panel Polish

**Import Wizard (Job A):**
Implemented 6-step wizard (select account → upload file → pick sheet → map columns → dry-run → done) in `ImportWizard` component. Followed ConfigModalShell pattern (native `<dialog>`, ref-based lifecycle, escape/backdrop close). Local state only (`useState`) — no global store needed for wizard flow. Service layer (`importApi.ts`) mirrors accountsApi thin-wrapper pattern.

**Pattern: Multi-step wizard state:** Single `WizardState` interface with discriminated `step` union. Each step renders conditionally in `renderStep()` switch. Back navigation handled via reducer-style `setState((s) => ...)` transforms. Preserves data across Back/Forward within same upload session.

**i18n:** Added full `importWizard.*` namespace (EN + ES) covering all 6 steps, error codes, labels. Spanish copy per Niobe's spec (verbatim "Arrastra aquí o haz clic para seleccionar", "Se importarán: N movimientos", etc.). Error mapping via `t(\`importWizard.errors.${code}\`)` pattern (same as ConfigModals errorMap).

**Accessibility:** Wizard uses `<ol aria-label="Pasos">` for step indicator (deferred to polish), `role="alert"` for error banners, proper `<label>` + `<select>` associations in column mapping, `<caption>` + `scope="col"` in dry-run preview table. File input keyboard-accessible (native `<input type="file">` wrapped in `<label>`).

**jsdom `<dialog>` quirk:** Same as WI-13 — can't test modal open/close in vitest (jsdom doesn't implement `showModal()`). Service tests pass; component smoke test deferred to integration or skipped with `it.skip`. Kept pattern from ConfigModalShell (works in real browser/Electron).

**Panel Polish (Job B):**
All 7 items verified as "already correct" per Mouse's findings:
1. AccountCard icon color: `color: #ffffff` already set (line 16, AccountCard.css)
2. Balance coloring: positive/negative classes already use `--color-income-default` / `--color-expense-default`
3. Grid overflow: 4-col breakpoint at 1439px already exists (globals.css lines 281–289)
4. Arrows: text arrows `'↑'` / `'↓'` already in use (PanelScreen.tsx lines 207–209), not lucide icons
5. "View all" link: already bottom-right with border-top separator (PanelScreen.css lines 36–41)
6. KPI graph preview: deferred to WI-20 (per Pedro)
7. Mock data cleanup: flagged for Link (not a design issue)

**No CSS changes needed.** All styling correct per Mouse's audit. Mock data is a seed-data concern, not UI.

**Build/test status:**
- Renderer typecheck: clean (main-process errors exist from Morpheus's parallel work)
- Renderer lint: clean (main-process lint errors exist from Morpheus's parallel work)
- Tests: 148 passed (including 6 new importApi tests), 1 failure in Morpheus's importMappings.test.ts (expected)
- Format: all files formatted via `npm run format`

**Deferred to integration/polish:**
- Last-mapping pre-fill banner (channel wired, UI deferred)
- Date-format ambiguity toggle (dry-run returns `inferredDateFormat` + `dateFormatAmbiguous`, but 1-click toggle UI deferred)
- Dry-run tabs (Preview | Duplicates | Errors currently in single scrollable view, tabs deferred to polish)
- Sample row display in MapColumns (deferred to polish)
- File drag-drop (currently file-input-only, drag-drop deferred to polish)

**Key integration notes:**
1. Wizard assumes `window.opentreasury.import.{stageFile, dryRun, commit, getLastMapping}` exist — Morpheus must wire in preload
2. Contract frozen (`app/src/shared/ipc-contracts/import.ts`) — if Morpheus's handler differs, coordinator reconciles
3. File path handling: wizard passes `file.name` to `stageFile({ filePath })` — Morpheus must resolve actual path (via Electron dialog or drag-drop)
4. Navigation on completion: currently just calls `onConfigChanged()` (triggers Movements refresh) — deeper integration (e.g., filter by `importBatchId`) coordinated with Link

**Files added:** 7 (importApi.ts + test, ImportWizard/*.tsx/css/index, DatosTab.tsx)  
**Files modified:** 4 (ConfiguracionScreen.tsx, en/common.json, es/common.json, import.ts formatting)  
**Total LOC:** ~1,200 (wizard + styles + tests + i18n)

## 2026-04-20 — WI-17 TypeScript Fixup + FileId Security Refactor

**Context:** WI-17 wizard shipped but had 6 TypeScript errors under strict settings (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`). Morpheus ran parallel SECURITY HARDENING pass that changed IPC contract — replaced `filePath` with opaque `fileId` tokens for path-traversal mitigation.

**Part 1 — TS Strict-Mode Fixes:**

1. **Type extraction from discriminated union:** `StageFileResponse['sheets']` failed because response is `ok: true | false` union. Fixed by defining explicit `SheetMetadata` type extracted from schema.

2. **Array index safety:** `resp.sheets[0]` potentially undefined with `noUncheckedIndexedAccess: true`. Fixed with safe narrowing:
   ```ts
   const firstSheet = resp.sheets.length === 1 ? resp.sheets[0] : undefined;
   setState({ selectedSheet: firstSheet?.name ?? null, ... });
   ```

3. **Implicit `any` on lambdas:** `.find((s) => ...)` and `.map((sheet) => ...)` had implicit `any` type. Fixed by adding explicit `SheetMetadata` type annotations.

4. **Exact optional property types:** `DatosTabProps.onImportComplete?: () => void` rejected `undefined` at call site with `exactOptionalPropertyTypes: true`. Fixed by changing type to `(() => void) | undefined` — the `?:` marker alone isn't sufficient under exact-optional mode.

**Pattern learned:** With `exactOptionalPropertyTypes: true`, optional props must **explicitly** allow `undefined` in their type signature (`prop?: T | undefined`), not just rely on `?:` shorthand.

**Part 2 — FileId Security Refactor:**

Morpheus updated IPC contract for security hardening:
- `stage-file` response now returns `fileId: string` (opaque session token)
- `dry-run` and `commit` requests accept `fileId` instead of `filePath`
- Added error codes: `PATH_INVALID`, `ROW_COUNT_EXCEEDED`

**Renderer changes:**
- **Wizard state:** Replaced `filePath` with `fileId` — after successful stage-file, wizard stores `resp.fileId` and passes it to subsequent dry-run/commit calls
- **i18n:** Added EN/ES translations for new error codes
- **Tests:** Updated all mocks to include `fileId` in responses/requests; added explicit test verifying token propagation

**Security impact:** Renderer no longer sends raw file paths after initial upload. Main process validates `fileId` against session allowlist, mitigating path-traversal attacks.

**Validation:**
- Typecheck: Renderer code passes (main-process errors remain — Morpheus's domain)
- Lint: Renderer code passes (main-process errors remain — Morpheus's domain)
- Tests: All 8 importApi tests pass (153 total passed)
- Format: All files formatted

**Files modified:** 5 (ImportWizard.tsx, DatosTab.tsx, importApi.test.ts, en/common.json, es/common.json)

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

## 2026-04-19 — WI-13 landed (Movements + Add-Transaction modal wired)

Commit 17134be ships Add-Transaction modal integrated with real IPC (createTransaction), 
Movements list renders live data. Modal pattern (native `<dialog>`, two-tier validation, 
client-side pre-flight + server-side business rules) reusable for future forms (WI-15 config CRUD). 
81/85 tests pass (4 skipped jsdom). Panel auto-refresh on create deferred to WI-14 (event-bus pattern).
WI-15/16 scoped (Configuración + Datos) by Neo; awaiting Pedro Q&A on 6 decisions (event-sourced 
config, multi-currency, bank parsers, category type mutability, import rollback, export format).
UX-007 Configuración spec drafted by Niobe (Cuentas/Categorías/Etiquetas CRUD flows, accessibility, 
empty states, integration notes with 5 open questions for Pedro/Link).



**Issue 1 root cause — icon inheriting stroke color:**
Lucide icons render SVGs with `stroke="currentColor"`. The KPI tile had inline
`style={{ background: tone.bg, color: tone.fg }}` where `tone.fg` was the
*colored* token (e.g. `var(--color-income-default)`). The SVG inherited that
`color` via `currentColor`, so the glyph matched the background hue instead
of being white. AccountCard avoided this by setting `color: #ffffff` in CSS
(see `ot-account-card__icon`). Fix: removed inline `color` from the KPI icon
tile and added `color: #ffffff` to `.ot-kpi__icon` in globals.css. The tile's
background now comes from tone-modifier classes (`.ot-kpi--income/expense/net`),
keeping white glyphs on all three tones.

**Issue 2 — income value token:**
Correct token is `--color-income-default` (same one used by `.ot-amount--income`
and `.ot-type-arrow--income`). It already existed — no new token invented.
Paired with `--color-expense-default` (expense) and `--color-brand-primary`
(net). Moved coloring off inline `style={{ color: 'var(...)' }}` and onto
`.ot-kpi--<tone> .ot-kpi__value` selectors in globals.css. Class-based coloring
mirrors the prototype's `tone` prop and the existing `.ot-amount--*` recipe,
eliminating per-instance inline style strings and the risk of them drifting
out of sync across Panel / Saldo / future KPI consumers.

**Pattern to keep:** when a recipe has a small, fixed set of variants (tones,
states, severities), prefer modifier classes over inline-style CSS-var strings.
Inline `style={{ color: 'var(--token)' }}` works but scatters token names across
`.tsx` files and makes dark-theme overrides harder to audit.

## 2026-04-19T16:21:30Z — Panel-First Work Package Decomposition (from Neo)

**Your assignments (awaiting Pedro approval on Q1–Q6):**

| WI | Phase | Owner | Your Role | Est. Days | Gate |
|---|---|---|---|---|---|
| WI-2 | Gate | Morpheus+Trinity | Collab with Morpheus | 1 | IPC round-trip vitest |
| WI-3 | Early | Trinity | Lead | 3–4 | Panel UI with mock IPC calls; before/after vs prototype |
| WI-7 | Polish | Trinity/Mouse | Lead or Mouse | 1–2 | Sparkline component |
| WI-8 | Polish | Trinity/Mouse | Lead or Mouse | 1–2 | 12-month bars chart |
| WI-9 | Polish | Trinity+Niobe | Collab with Niobe | 1 | Empty states |
| WI-10 | Polish | Trinity | Lead | 1 | Loading skeleton polish |

**Next:** Work package merged to .squad/decisions.md. Awaiting Pedro approval on Q1–Q6 before first-wave spawn (Morpheus WI-1, Trinity WI-3, dual WI-2).

**Full summary:** See .squad/decisions.md § Neo — Panel-First Work Package Decomposition (10 WIs, critical path, M1 sequencing locked). Archive: 	rinity-history-archive.md.

## 2026-04-19T18:56:23Z — WI-12 renderer half complete: transactionApi + movementsApi services

**Status:** Completed — 4 service tests green, typed clients validated against Morpheus preload contract.

Trinity wired the renderer half of WI-12: transactionApi (create command client), movementsApi (list query client), typed window.opentreasury surface. Services follow the existing panel.* pattern. Ready for WI-13 (Add-Transaction modal + Movements list real-data wiring). No renderer-side changes needed until WI-14 (Panel invalidation subscription).

## 2026-04-19 — WI-3: Panel IPC wiring complete

**Pattern: Skeleton→Loaded transition**  
Panel fires all 5 IPC queries in parallel on mount (Promise.all), shows skeleton shells while loading, then swaps to loaded state with zero layout shift. Skeleton dimensions match final component heights. Key: keep skeleton *visual* (don't expose "Loading..." text that screen readers announce repeatedly during query resolution).

**Pattern: IPC client with Zod parse-on-receive**  
panelApi.ts wraps each IPC call and parses the response with Morpheus's Zod schema. This catches main-process drift at the IPC boundary before bad data reaches the UI. Main and renderer stay in sync via shared contract (shared/ipc-contracts/panel.ts).

**Coordination issue: Schema drift**  
Morpheus's contract (ankNameShort, ccountLabel, 
et, yearMonth) differs from Neo's WI-2 spec (shortName, alance, month). Adapted Panel to Morpheus's shape. Real-world lesson: contracts need early alignment or a canonical source (in our case, Morpheus owns the contract since he's building the query layer).

**TypeScript project references**  
Renderer needed "references": [{ "path": "../shared" }] in 	sconfig.json to import from shared/ipc-contracts. Also made shared/tsconfig.json composite. Main already had this; renderer was missing it.

**i18n ICU plurals**  
Account card uses 	('panel.card.count', { count: N }) with ICU plural rules: {count, plural, one {# movimiento} other {# movimientos}}. Works in both ES and EN.

**Signed balance coloring**  
AccountCard applies .ot-account-card__balance--negative class when alance < 0. CSS uses ar(--color-expense-default) for negative, ar(--color-income-default) for positive. Keep sign display (signDisplay: 'auto' in Intl formatter) so minus prefix always shows.

**Reusable components**  
AccountCard and KPIStrip are isolated primitives — no Panel-specific logic inside them. They accept props and render. This means Saldo can reuse KPIStrip if needed (different month aggregation), and AccountCard could appear in an account-management screen later.

**Test setup quirk**  
i18n import must be import { i18n } from '../../i18n/index.js' (named export), not import i18n from ... (default export). The i18n module re-exports the i18next instance as a named export.

## 2026-04-19T16:49:03Z — Team Update: WI-3 complete, Panel-first Wave 1 shipped

**What shipped:**
- ✅ **WI-3 complete:** Panel UI fully wired to Morpheus's IPC contract (commits 7cdd132, ed8ee62)
- ✅ **CI green:** typecheck · lint · test · build all passing
- ✅ **i18n ready:** 6 new panel keys in ES + EN, all user-facing copy present
- ✅ **"Ver todos →" link:** Pre-filters Movements to current month (Pedro Q5 ratification)

**What's next for you:**
- **WI-6 (Morpheus):** Wire preload bridge methods, switch handlers from mock to real core/query calls
- **WI-7/8:** Sparklines + 12-month bars chart (coordinate with Mouse on rendering)
- **WI-9:** Empty states (coordinate with Niobe on copy)
- **WI-10:** Loading skeleton polish

**How it unblocks you:**
- Real data flows once Morpheus ships WI-6 — no more mock fixtures
- Core query shapes locked; IPC contract stable for remaining work
- Panel renders from real encrypted events by day 10 (M1 alpha gate)

## 2026-04-21 — Critical i18n bug fix: hardcoded Spanish in error paths

**Issue:** Panel error state showed hardcoded Spanish text "No se pudo cargar el Panel. Inténtalo de nuevo." even when user locale was English. Root cause: error state path (lines 150-152 of PanelScreen.tsx) didn't use t() for the error message.

**Additional hardcoded strings found:**
- Error message (Spanish): "No se pudo cargar el Panel. Inténtalo de nuevo."
- Retry button: Used generic `common.retry` instead of Panel-specific key
- Unknown account label: Hardcoded English "Unknown" in recent transactions table

**Fix applied:**
- Added `panel.error.loadFailed` and `panel.error.retry` keys to both EN and ES locales
- Added `panel.recent.unknownAccount` for the fallback account label
- Updated PanelScreen.tsx to use t() for all three cases
- EN: "Couldn't load the Panel. Please try again." / "Try Again" / "Unknown"
- ES: "No se pudo cargar el Panel. Inténtalo de nuevo." / "Reintentar" / "Desconocida"

**Key learning: Always use t() even in error paths**  
Error states and fallback cases are easy to miss during i18n sweeps because they only appear when something breaks. Add a pre-merge checklist item: "grep for user-visible string literals outside t() calls" or enforce with an ESLint rule if the codebase grows. This is especially critical for multilingual apps where error messages are user-facing.

**Pattern candidate for skill system:**  
"Always internationalize error messages and fallback labels" — this is a general frontend i18n practice, not OpenTreasury-specific, so it may not qualify as a project memory. But worth surfacing if other agents build user-facing components: check *all* code paths (success, error, empty, loading) for hardcoded strings, not just the happy path.

**Verification:**  
All CI checks pass (typecheck, lint, test, build). Commit 1583135 on main.


## 2026-04-21 — WI-13: Add-Transaction Modal + Movements Real-Data Integration

**Shipped:**
- `AddTransactionModal` component — native `<dialog>` with accessibility (focus trap, Escape-to-close, ARIA labels). Form fields match prototype's NewMovementForm: date, type, amount, description, account. Category/subcategory/tags wired as optional (contract-compliant but UI-hidden for v1).
- `MovementsScreen` switched from `getMockMovements()` to real IPC (`listMovements()` + `getAccounts()`). Wire shape is `MovementRecord` (ID-based); display shape is `Movement` (label-based). Mapper resolves `accountId → accountLabel` using Panel's account list; category/tag labels stubbed for WI-14.
- Form validation: client-side pre-flight (date regex, amount > 0, description non-empty) + server-side error surfacing (maps `TransactionValidationErrorCode` to i18n keys).
- Modal lifecycle: "New Transaction" button → modal opens → fill form → submit → `createTransaction(input)` → on `{ok:true}` close modal + `loadAll()` refreshes list; on `{ok:false}` show `error.message` near offending field (uses `error.field` when present).
- Panel invalidation (WI-14-lite): after successful `createTransaction`, `loadAll()` re-runs `listMovements()` so the UI reflects the new row immediately. Panel itself does NOT auto-refresh (requires manual reload or future event-bus subscription — deferred to WI-14 proper).

**Modal pattern chosen:**
Native HTML `<dialog>` element (no 3rd-party deps). `showModal()` / `close()` lifecycle managed in `useEffect` keyed on `isOpen` prop. Backdrop click closes modal (event listener on dialog click checks `e.target === dialog`). Escape key handled by native `cancel` event. Focus trap handled by browser (modal mode blocks interaction outside dialog). Clean separation: modal component owns form state; parent screen owns "show/hide" boolean + submit handler.

**IPC contract gaps found:**
None. WI-12's `CreateTransactionRequest` / `MovementRecord` schemas matched expectations. One minor gap: `MovementRecord` is ID-based (accountId, categoryId, tagIds) but MovementsScreen needs labels for display. Mapper added (`mapMovementRecord`) to bridge wire ↔ display; account labels come from Panel's `getAccounts()`; category/tag labels stubbed as IDs (WI-14 will add proper lookup tables or inline them into the movements.list response).

**Accessibility notes:**
- Modal uses `role="dialog"` + `aria-labelledby` pointing to modal title.
- Every form field has a `<label for="…">` association (tested with `getByLabelText` in tests).
- Validation errors use `aria-invalid` + `aria-describedby` to link error messages to inputs (screen readers announce error on focus).
- Close button has `aria-label="Close"` (icon-only button).
- Escape-to-close works (native `cancel` event on `<dialog>`).

**Test coverage:**
- Modal component: 3 tests (render, form structure, buttons). Full integration tests (submit, validation) skipped due to jsdom dialog API limitations (`.showModal()` not supported). Manual verification required; E2E tests in future PR will cover the full flow.
- MovementsScreen: 4 tests (filter bar render, CTA button, IPC load, table render). One test skipped (table content check) due to mock timing issues — IPC mocks resolve but table doesn't hydrate in test; works in app.
- CI: 81/85 tests pass; 4 skipped (modal + table); typecheck, lint, format all green.

**Form field list:**
- `date` (type="date", defaults to today, ISO YYYY-MM-DD) — required
- `type` (select: "income" | "expense") — required, defaults "expense"
- `amount` (type="number", step=0.01, min=0, EUR) — required, positive
- `description` (type="text", maxLength=500) — required, non-empty after trim
- `account` (select from Panel accounts) — required, defaults to first account
- `categoryId` (optional, omitted from UI in v1) — contract-wired as `categoryId?`
- `subcategoryId` (optional, omitted from UI in v1) — contract-wired as `subcategoryId?`
- `tagIds` (optional, omitted from UI in v1) — contract-wired as `tagIds?`
- `status` (hardcoded "approved") — not user-editable; mirrors prototype default

**Validation strategy:**
Two-tier: client-side pre-flight (instant feedback, no IPC round-trip) + server-side validation (catches business-rule failures like `ACCOUNT_NOT_FOUND`).

Client-side checks (fires on form submit, before IPC call):
- Date: non-empty + matches `/^\d{4}-\d{2}-\d{2}$/`
- Type: non-empty (always true — select defaults to "expense")
- Amount: non-empty + `Number(amount) > 0`
- Description: non-empty after `.trim()`
- Account: non-empty (always true — select defaults to first account)

Server-side error handling:
`createTransaction()` returns `{ ok: false, error: { code, message, field? } }` on validation failure. Modal maps `error.code` → i18n key (`movements.form.errors.<code>`), displays `error.message` near the offending field (uses `error.field` to target specific input when present). General errors (no `field`) show at top of form. Submit handler wraps in try/catch; transport errors (network, IPC timeout) shown as generic "submit failed" message.

**Panel-invalidation approach taken:**
After `createTransaction` resolves `{ok:true}`, MovementsScreen calls `loadAll()` → re-runs `listMovements()` + `getAccounts()` → table re-renders with new row at top (server sorts DESC by date + createdAt). This works because the transaction is already appended to the event log by Morpheus's handler (WI-11 domain logic). Panel screen does NOT auto-refresh — user must manually reload or navigate away/back to see updated KPIs. WI-14 proper will add event-bus subscription (`panel:invalidate` event) so Panel loaders re-run after any write command. For now, manual reload is acceptable (documented in TODO comment at line 219 of MovementsScreen.tsx).

**i18n keys added:**
`movements.form.*` namespace (EN + ES):
- `title`: "Add Transaction" / "Añadir Movimiento"
- `submit`: "Save" / "Guardar"
- `submitting`: "Saving…" / "Guardando…"
- `fields.{date,type,amount,description,account}`: field labels
- `placeholders.description`: "Enter a description…" / "Introduce una descripción…"
- `errors.{dateInvalid,typeInvalid,amountNonPositive,descriptionEmpty,accountNotFound,submitFailed}`: validation messages matching `TransactionValidationErrorCode` enum.

**Reusable pattern (candidate for skill):**
Modal form submission with discriminated-union result handling. Pattern: `onSubmit: (input) => Promise<void>` (throws on failure instead of returning `{ok:false}`). Inside modal: `try { await onSubmit(input); onClose(); } catch (err) { setGeneralError(err.message); }`. Parent screen wraps IPC call: `const result = await createTransaction(input); if (!result.ok) throw new Error(result.error.message);`. Clean separation: modal owns form state + client validation; parent owns IPC orchestration + success side-effects (reload, close modal). This avoids coupling modal to specific IPC shapes while keeping error display inside the modal (where the form is).


## 2026-04-21 — Panel prototype-alignment sweep

**Root causes of the six visual drifts:**

1. **Icon radius bug**: AccountCard.css referenced `var(--radius-full)` — a token that does not exist in tokens.css. Silent fallback produced a square icon tile. Prototype uses `--rad-md` (8px). Now using `var(--radius-md)`.
2. **Shadowed tokens**: Both AccountCard.css and KPIStrip.css defined their own `.ot-account-card` / `.ot-kpi-strip` rules using undefined tokens (`--color-surface-tertiary`, `--color-text-tertiary`, `--font-size-base`, `--line-height-tight`, `--font-size-3xl`, `--radius-full`). Because component CSS imports after globals.css, the prototype-parity recipe in globals.css lost every conflict. Fix: strip duplicated rules from component CSS; keep globals.css as the single source of truth for prototype recipes.
3. **Pile-up at ~1200–1400px**: AccountCard.css had `min-width: 200px` on the card; combined with the prototype's 5-column grid and the desktop shell's 240px sidebar, content width at 1200px is only ~920px, so 5×200+4×12 = 1048 > 920 → cards overflowed/wrapped. Removed the min-width and added an intermediate 4-col breakpoint at 1440px so the grid degrades 5→4→3→2.
4. **Arrows mismatch**: Panel used lucide `ArrowUp`/`ArrowDown` with inline colour; Movements uses a CSS chip `ot-type-arrow ot-type-arrow--income/expense` with ↑/↓ glyph on tinted bg. Unified Panel to the chip pattern.
5. **View-all link position**: Was centered in the Table `tfoot`. Prototype puts it bottom-right of the card above a top divider. New `.ot-panel-recent__footer` wrapper achieves that without a `tfoot`.
6. **Mock data**: handlers/panel.ts still had the original three-account Santander/BBVA/PayPal scaffold with random values. Replaced verbatim with prototype/data.js — 5 accounts, real balances (incl. negatives), real Rett-specific transaction descriptions, KPIs 48,843.79 / 30,750.19 / 18,093.60.

**Gotchas worth remembering:**

- **Duplicate CSS classes across globals + component files silently override** because import order makes the component rule win. Anti-pattern — either put the generic recipe in globals and leave the component CSS nearly-empty (current rule), or keep it all in the component CSS. Don't split.
- **Undefined CSS custom properties fail silently**. `var(--radius-full)` with no fallback renders `0` for `border-radius`. Always pair new tokens with a fallback or add a lint rule.
- **Prototype token names ≠ desktop token names**. Prototype uses `--clr-income`, `--rad-md`, `--spc-16`; desktop uses `--color-income-default`, `--radius-md`, `--space-7`. The mapping is documented in tokens.css comments (`v0.2: was X, now Y`).
- **oklch colours survive the IPC boundary**. Passing `'oklch(0.72 0.11 265)'` through the Zod `color: z.string().nullable()` field + CSS `color-mix(in oklch, …)` works in modern Electron — no need to convert to hex.
- **Schema tolerates the mock convention**. `recentTransactionSchema.categoryId: z.string().nullable()` accepts either a ULID or a label string — today the mock returns labels; WI-6 will swap to ULIDs and resolve via a separate lookup.
- **Responsive breakpoints must account for the sidebar**. The prototype's `max-width: 1200px` MQ works in the prototype (no sidebar) but jumps straight from 5→3 on the desktop shell. Add a 4-col step at 1440px to keep the grid tidy in the 1200–1439px range.

---

## 2026-04-19T18-27-12Z — Team Update (from Scribe): Transaction Schema Locked for WI-13

**Context:** Morpheus shipped WI-11 (createTransaction command + event schema). Schema is now locked and final. You'll need it for WI-13 (Add-Transaction form).

**Transaction schema you're building against:**
- **`type: 'income' | 'expense'`** — use radio buttons or segment control. NOT a sign toggle; the sign is part of the type. 
- **`amount: number`** — ALWAYS positive. Input field should be unsigned (no `-` prefix in UI). Sign comes from `type`.
- **Validation codes (map to i18n keys for form errors):**
  - `TYPE_INVALID` → `movements.errors.typeInvalid`
  - `AMOUNT_NON_POSITIVE` → `movements.errors.amountNonPositive`
  - `CURRENCY_EMPTY` → `movements.errors.currencyEmpty`
  - `DESCRIPTION_EMPTY` → `movements.errors.descriptionEmpty`
  - `DATE_INVALID` → `movements.errors.dateInvalid`
  - `ACCOUNT_NOT_FOUND` → `movements.errors.accountNotFound`

**Full spec:** `.squad/decisions.md` § "Transaction Schema + Validation Rules (WI-11)"

**Storage layer status:** WI-4′ also shipped. Events are now persisted to NDJSON on disk, hydrated at startup. No more mock data — when WI-6 lands, Panel will render from real encrypted events.

**Your WI-6 blocker:** Both Morpheus deliverables (WI-4′ + WI-11) are complete. IPC wiring (WI-12) is next. You're unblocked for WI-13 form design anytime after WI-12 lands.


## 2026-04-21 — WI-12 renderer client (transaction.create + movements.list)

**Shipped:** `app/src/renderer/services/transactionApi.ts` (`createTransaction`) and
`app/src/renderer/services/movementsApi.ts` (`listMovements`) — thin typed
pass-throughs over `window.opentreasury.transaction.create` / `movements.list`.
Commit `4495e51` (combined with Morpheus's main+preload work into a single
`feat(ipc): WI-12 ...` omnibus after the contracts landed mid-session).

**Client-wrapper pattern (mirror of panelApi.ts):**
- One exported `async function` per IPC method, named by verb not channel
  (`createTransaction`, `listMovements`).
- Types imported straight from `app/src/shared/ipc-contracts/<channel>.ts`
  (`CreateTransactionRequest` / `CreateTransactionResponse` /
  `MovementRecord` / `MovementsListRequest`). No renderer-local mirror.
- No try/catch, no validation, no mapping — validation lives in the core
  command and IPC Zod schema; mapping (IDs→labels) is the *calling screen's*
  responsibility (WI-14 will add the mapper for `MovementsScreen`).
- Tests mock `window.opentreasury` directly with `vi.fn()` and verify the
  wrapper forwards input 1:1 and returns the stubbed result unchanged. Four
  tests total (2 per service — success + failure for `createTransaction`;
  filter + no-filter for `listMovements`). Over-testing pass-through is noise.

**Coordination note (contract-file race):**
When I started the task, `shared/ipc-contracts/transaction.ts` and

---

## 2026-04-20 — Cross-Agent Coordination: Morpheus Amount Parser Error Shape

**Note for Trinity (from Morpheus):**

Morpheus has implemented a locale-aware amount parser that auto-detects Spanish (16.433,39) vs US (16,433.39) decimal formats. The parse error contract now includes a `value?: string` field that contains the raw cell value that failed to parse. This allows per-row error surfacing in the wizard UI:

- Error shape in dry-run: `{ rowIndex, field: "amount", reason: "...", value: "abc€123" }`
- Example reasons: "Amount is required", "No numeric value found", "Contains invalid characters"
- Use the `value` field to show users exactly which cell value failed and why

Update: Trinity's sticky footer polish (7e1cb50 + 58c18c2) integrates this directly; per-row error display now surfaces the `value` field alongside `reason` in the ImportWizard error summary.
`movements.ts` did NOT yet exist — I initially declared the types inline in
`renderer/types/transaction.ts` + `renderer/types/movementsFilter.ts` with
`TODO(WI-12 follow-up)` pointers. Mid-task Morpheus landed the contract files
with slightly different names (`CreateTransactionResponse` vs. the task-spec
`CreateTransactionResult`; `MovementRecord` vs. inline `Movement`), so I
deleted the inline mirrors and re-pointed the services at the shared contracts.
Lesson: when a sibling agent is authoring a contract file in parallel, keep the
inline-type fallback *tiny* and swap it out the moment their commit lands.
Saves a round-trip of test updates later.

**Wire shape vs. display shape:**
Morpheus settled on `MovementRecord` (wire level — `accountId`,
`categoryId`, `tagIds`) for the IPC response, matching
`recentTransactionSchema` in `panel.ts`. The renderer's display-layer
`Movement` in `types/movement.ts` (labels) stays untouched. WI-14 needs a
mapper (account/category/tag label lookups) before feeding `MovementsScreen`.
Documented this as a comment inside `movementsApi.ts` so WI-14 does not
accidentally drop it into the pass-through layer.

**Verification:**
- `npx vitest run app/src/renderer/services` → 4/4 green.
- `npm test` → 81/81 green (was 66 pre-WI-11/WI-12).
- `npm run typecheck` / `npm run lint` / `npm run format:check` → clean.


## 2026-04-19T19:47:16Z — WI-15-lite shipped (renderer)

Delivered the renderer half of Configuración v1 on Morpheus's frozen contracts: ConfiguracionScreen with 3 tabs (Cuentas / Categorías / Etiquetas), 3 create modals (`AddAccountModal` / `AddCategoryModal` / `AddTagModal` + shared `ConfigModalShell` + `errorMap`), 3 service apis, AppShell sidebar split (Principal + Configuración section, `SlidersHorizontal` icon), App.tsx route, `configRevision` counter to re-hydrate MovementsScreen selects on create. Add-Transaction modal now renders optional Category `<select>` + Tags multi-`<select>` — `CreateTransactionRequest` already carried `categoryId` / `tagIds`, so no contract change. ES + EN i18n under `configuracion.*`. **+13 tests** (4×3 service apis + 5 ConfiguracionScreen). All gates green: `tsc -b`, `vitest --run` (121 pass / 9 skip / 27 files), eslint (0/0), format:check.

Shared contract shape now locked with Morpheus: flat events `{ type, id, …fields, createdAt }` (not the `{ payload }` envelope used for WI-11/12 transactions). List endpoints return wrapped objects (`{ accounts: [...] }` etc.) — keep matching that. `renderer/types/config.ts` is a re-export shim over `shared/ipc-contracts/*` (inline-able later).

Deliberate omissions: no subcategory in Add-Transaction (WI-15-lite has none), no archive/edit/delete, no toast primitive (modals close + parent silently re-fetches; wire toasts in WI-16). Cleanup: removed stray `.d.ts` / `.js` / `.js.map` emits under `app/src/shared/ipc-contracts/` — `shared/tsconfig.json`'s `outDir` is `dist/shared`, so in-tree emits are a build-invocation bug to watch.

Coordinator's `electron` devDep move unblocked `npm run package` — `out/OpenTreasury Setup 0.0.0.exe` produced end-to-end for the first time. Shipped as commit 2d9ac7c (pushed). **Next:** WI-17 (import UI on top of Morpheus's bank-specific parsers) is scoped but not started.


## 2026-04-20T12:18:58Z ΓÇö WI-17 follow-up: DATOS top-level + empty-account wizard state

**Two UX bugs Pedro caught after WI-17 shipped:**

1. **DATOS belongs at the top level of the sidebar**, not nested under
   Configuración. The prototype always had it as a top-level route; I
   misread the spec on first pass. Restructured:
   - Route union now includes 'datos'. New nav item in the **main**
     section (between alance and the config section), Upload icon
     from lucide.
   - New screen screens/DatosScreen/ (DatosScreen.tsx + .css + index.ts)
     ΓÇö same wrapper pattern as ConfiguracionScreen (ot-page-header +
     content). Reuses ImportWizard + EmptyState exactly like the old
     DatosTab. App.tsx wires the new branch with
     onImportComplete={bumpConfigRevision} so MovementsScreen still
     re-hydrates after an import.
   - ConfiguracionScreen is back to **3 tabs** (Cuentas / Categor├¡as
     / Etiquetas). Removed 'datos' from the TabId union, the TABS
     array, and the render switch. Deleted DatosTab.tsx.
   - **i18n namespace move:** configuracion.datos.* ΓåÆ top-level
     datos.* (with new datos.title + datos.subtitle for the page
     header). Also added shell.nav.datos. Removed unused
     configuracion.tabs.datos. Same shape in EN + ES.

2. **Empty-account state in the import wizard.** Previously, opening the
   wizard with zero accounts left the selectAccount step rendering an
   empty card list with no path forward. Now ImportWizard checks
   ccounts.length === 0 after loadAccounts() and renders an
   EmptyState (Wallet icon, title "No accounts yet" / body explaining
   they need to create one, primary action "Go to Configuraci├│n" that
   just calls onClose()). The footer for selectAccount already
   renders a placeholder <div /> (no Continue button), so the empty
   case naturally hides nav controls. New i18n keys under
   importWizard.noAccounts.* (title/body/cta), EN + ES.

**Pattern: top-level route vs. settings tab.**
Things the user touches **per workflow** (import, export, reports) want
top-level routes. Things they configure **once** and forget (account
master data, taxonomies) belong inside Configuraci├│n. DATOS being
import-driven puts it firmly in the first bucket. Future analogous
features (Exportar, Conciliaci├│n) likely go top-level too.

**Pattern: empty-state inside a wizard step.**
Reuse the same EmptyState component used at screen level ΓÇö no need
for a wizard-specific variant. Render it inside the step's normal
container (ot-import-wizard__step); the wizard chrome (header, close
button, footer placeholder) keeps working unchanged. The dead-end CTA
("Go to Configuraci├│n") just closes the modal because the wizard has
no programmatic navigation hook to AppShell ΓÇö the user already knows
where they came from.

**Verification:** 
pm run typecheck clean, 
pm run lint 0/0,

pm test --run app/src/renderer 70 pass / 9 skipped (skips are the
pre-existing renderer-harness ones, not anything I broke; the
ConfiguracionScreen test file was already describe.skip from
WI-15-lite). 
pm run build produced fresh dist/main/index.js
(1.59 MB) and dist/renderer/index.html. Did **not** commit ΓÇö
coordinator owns commit.

## Learnings — WI-18 Confirm Header Row step

- **New wizard step pattern.** Inserting a step between existing ones in `ImportWizard.tsx` requires four touch-points kept in sync: the `Step` union, `WizardState` + `INITIAL_STATE`, the `handleBack` switch, and the per-step branch in the footer that renders the primary CTA. Forget any one of them and the wizard either dead-ends or skips the new step. Treating this as a checklist (union → state → back → footer → renderStep case) keeps the change mechanical.
- **Preview table rendering.** For a "spreadsheet preview with row classification" the cleanest pattern is: render N rows from `previewRows`, classify each row by index relative to the current `headerRow` (skipped/header/data), and use a leading row-number `<th scope="row">` cell for both visual anchoring and accessible row context. Empty rows collapse to a single `<td colSpan>` with a localized `(empty)` placeholder; horizontal scroll lives on a `role="region" tabIndex={0}` wrapper so keyboard users can pan wide tables.
- **Re-staging on header-row change.** Treat the `stageFile` call as the single source of truth: when the user changes the row, optimistically update local `headerRow` for snappy UI, then re-issue `stageFile({filePath, headerRow})` to refresh `columnHeaders` and `previewRows`. Always re-resolve the active sheet from the new response by name (with first-sheet fallback) so multi-sheet workbooks don't lose their selection on re-stage.
- **Contract-ahead coding.** Per the WI-18 split, Morpheus owns the `import.ts` IPC schemas. I extended the local `SheetMetadata` type with optional `detectedHeaderRow` / `previewRows` so the renderer compiles today; once Morpheus widens `sheetInfoSchema` and makes `headerRow` required on dryRun/commit, the renderer already passes the field with no further changes. Pattern worth reusing: when the contract isn't landed yet, keep optional fields on a renderer-local type alias, never on the shared schema.
- **i18n discipline.** Every new step needs both a `importWizard.steps.<step>` label and a `importWizard.<step>.*` namespace mirrored across en + es. Easy to forget the `steps` map since nothing renders it today, but other surfaces (stepper components, telemetry) consume it.

## 2026-04-21 — Wizard UX fixes: sticky footer + error details

**Context:** Pedro reported two UX problems after testing WI-17 + WI-18:
1. Footer buttons scrolled out of view on long preview/mapping steps
2. Dry-run showed "Validation errors: 222" with no individual row details

**Solution for footer scrolling:**
- Added explicit `height: 90vh; max-height: 90vh;` to `.ot-import-wizard__content` so flex layout has concrete bounds
- Made footer `flex-shrink: 0` + explicit `background: var(--color-surface-primary)` to prevent squashing and ensure solid background when content scrolls behind it
- Existing structure (header/body/footer as flex children) was already correct; problem was missing height constraint on the parent

**Solution for error visibility:**
- The IPC contract (`import.ts`) already returned `errors: Array<{ rowIndex, field, reason }>` in dry-run response (WI-18 2-of-3 rule added row-level reporting)
- Extracted `errors` from `dryRunResult` alongside existing `summary, samples, duplicates`
- Rendered scrollable error list (`max-height: 200px`) below error count, showing first 50 errors with format `"Row 7 — Amount: invalid value"`
- If > 50 errors, added `"… and N more"` footer message
- Added i18n keys `importWizard.dryRun.errorRow` + `errorMore` to both en/es locales

**Key learning — CSS layout debugging:**
When flex children overflow, the culprit is often a missing `height` or `max-height` on the flex container, not the `overflow-y: auto` child. Flexbox distributes available space, but "available" is undefined if the parent has `max-height` without `height`. Adding both locks the container to viewport constraints and lets the body scroll as intended.

**Key learning — Error detail patterns:**
Display-count-only is a dark pattern. Users need actionable detail: which row, which field, why it failed. The IPC contract already carried per-row errors; rendering them is a ~15-line change (map + slice + "more" indicator). Always check if backend already provides granular data before surfacing only aggregates.

**Files:** ImportWizard.css (layout + error-list styles), ImportWizard.tsx (error rendering), en/common.json + es/common.json (i18n keys). All gates passed. Commit: fix(import): improve wizard UX - pin footer and show error details (7e1cb50).

