# Project Context

- **Owner:** Pedro (perocha)
- **Project:** OpenTreasury Desktop — Electron-based treasury management for NGOs. Desktop version of the cloud-based rett-europe/opentreasury, designed to work without complex cloud setup.
- **Stack:** Electron (frontend), rest TBD. Reference app: Angular 19 + Python FastAPI + Cosmos DB + Entra ID on Azure.
- **Created:** 2026-04-19

## Recent Work

### 2026-05-25 — Team update: Configuración i18n key inventory expanded (Trinity, fix/accounts-i18n-en-strings)

Heads-up on the `configuracion.*` namespace you own copy patterns for: Trinity translated residual ES strings on the Cuentas / Etiquetas / Categorías tabs and AddAccount / AddTag modals to use the i18n layer (~25 new keys symmetric EN/ES, branch `fix/accounts-i18n-en-strings`, commit `57f4d05`, awaiting Pedro push). EN coverage now matches ES; Spanish wording preserved verbatim — no copy changes on your side. New keys follow the convention captured in `decisions.md` (2026-05-25): pluralized counts use `_one` / `_other`; shared cross-entity keys at `configuracion.*` top level (`filterCount`, `previewLabel`); per-entity keys under `configuracion.{cuentas,etiquetas,categorias}.section.key`; IBAN show/hide + bank-account-type labels are shared between row and modal. Future translatable surfaces in this area should follow the same pattern.

### 2026-05-11 — PR #317 UX/Copy Review (Renderer IPC Wireup)

REQUEST_CHANGES: MigrationScreen.tsx has zero i18n (all strings hardcoded in English, no locale keys in EN/ES); format:check fails on Morpheus's migrate-workspace files (Prettier debt from #314). Non-blocking: JoinFlow.tsx:120 hardcodes "Folder:" label. Command text, folder path display, and all other onboarding copy (JoinFlow/RecoveryFlow/FreshSetupFlow) are correct and tone-consistent.

### 2026-05-10 — SPEC-026 v2 Multi-User Rewrite (Spawned)

**Context:** Pedro finalized Keaton's 3 open questions (recovery code as team secret, workspace folder picked at first launch, read model rebuilt on boot). Multi-user HARD requirement locked. Niobe spawned to rewrite SPEC-026 as single coherent v2 spec.

**Key changes from v1 → v2:**
- Single-device → multi-user-from-day-one
- `events.ndjson` → `events-{deviceId}.ndjson` (per-device files)
- Singular `wrap_safestorage` → `devices[]` array (multi-wrap key model)
- Fresh setup flow + NEW join flow (recovery code enrollment)
- Updated acceptance criteria for multi-device scenarios (enrollment, concurrent write, merge-sort, conflict handling)

**Deliverable:** Rewrite `docs/specs/026-encryption-at-rest.md` to absorb Keaton's architecture + Pedro's directives + 3 answered questions.

**Status:** SPAWNED; awaiting v2 spec composition.

**Artifact:** `.squad/orchestration-log/2026-05-10T120713-niobe.md`

### 2026-05-02 — Sidebar IA Overhaul (Spec: niobe-sidebar-ia.md)

### 2026-05-02 — Sidebar IA Overhaul (Spec: niobe-sidebar-ia.md)

**Context:** Pedro flagged the "SETTINGS" sidebar group as misnamed — it contains Categories/Tags/Accounts (reference data / taxonomy), NOT app settings. Real settings (theme, language, profile, dataset config) live in a separate `/settings` route accessed via a top-right gear icon. This creates semantic confusion.

**Key decisions made:**

1. **Rename "SETTINGS" group → "CATALOGS"** (EN) / "CATÁLOGOS" (ES)  
   Rationale: Categories, Tags, and Accounts are taxonomies — structured vocabularies users maintain. "Catalogs" is NGO-friendly plain English that accurately describes "editable reference lists."

2. **Add bottom-anchored "Preferences" sidebar entry** for app configuration  
   Rationale: Consolidates all navigation in the sidebar (vs. top-right gear icon). Follows desktop app conventions (VS Code, Figma, Slack) where settings are spatially separated at the bottom.

3. **Rename `/settings` route → `/preferences`**  
   Rationale: Semantic clarity. "Preferences" = user choices (theme, language, profile). "Settings" was polluted by the taxonomy group label.

4. **Remove top-right gear icon + dead "Sign out" LogOut icon**  
   Rationale: Gear icon becomes redundant (Preferences is now in sidebar). Sign out icon is placeholder from pre-dataset-switching era (Mouse's spec includes proper "Switch dataset" action in Preferences screen).

**Top 3 naming candidates evaluated:**
- "Catalogs" / "Catálogos" (RECOMMENDED) — semantically accurate, NGO-friendly
- "Reference" / "Referencia" — accurate but slightly technical
- "Setup" / "Configuración Inicial" — misleading (implies one-time vs. continuous maintenance)

**Acceptance test applied:** Can a non-technical NGO trustee guess where each thing lives without help? "Catalogs" = ✅ PASS. "Setup" = ❌ FAIL.

**Spec output:** `.copilot/session-state/.../niobe-sidebar-ia.md` (6 sections: audit, proposed structure, naming, entry point, migration plan, open questions)

**Open questions for Pedro:**
1. Approve "Catalogs" label (or prefer alternative)?
2. Deep link backward compatibility for `/settings` → `/preferences`?
3. Preferences screen title: "Preferences" or "App Settings"?
4. User area visual treatment post-LogOut-removal?

**Reusable IA principle extracted:** Sidebar groups should be named by their **content semantics**, not their **implementation role**. "Settings" is a role (configuration UI), not a content descriptor. "Catalogs" describes what's inside (taxonomies). This prevents semantic pollution when multiple "settings-like" concepts exist in the same app.

## Canonical Patterns

**CANONICAL KPI PATTERN (2026-04-27):** Mouse established reusable `.ot-kpi-strip` recipe in PR #104 for income/expense/net cards. Pattern: TrendingUp/TrendingDown/Calculator icons @ 20px + --color-income-default / --color-expense-default / --color-brand-primary. Shared CSS recipe in `globals.css`. This is the baseline for all KPI indicators — reuse when i18n strings or icons for value indicators land in future WIs.

## Key Reference

UX considerations from the cloud version:
- Target users: NGO administrative staff (non-technical)
- Fast data entry flow: "Save & New" (~15s per transaction)
- Transaction list starts EMPTY — user selects date range first
- Multi-account view with balance summary
- Category/subcategory/tag management
- Excel import wizard for bank exports
- Dashboard with account balances and monthly charts
- Multi-language (Spanish + English)
- RBAC: Admin (full access) / Viewer (read-only)

A prototype exists in `/prototype/` with React-based JSX components.

## Team Coordination Notes

### 2026-05-04 — In-App Help Menu & Guide Bundling (Issue #264)

**Status:** ✅ SHIPPED via PR #265 + coordination logs merged in PR #267.

Oracle + Morpheus coordinated delivery of user guides bundled in-app. The Help menu (added to main process) now surfaces EN + ES guides as linked PDF-like HTML documents. This eliminates the need for users to visit GitHub or external sites for help.

**For Niobe:** If future localization work touches the guides (French, German, etc.), refer to the `md-to-html` skill at `.squad/skills/md-to-html/SKILL.md`. The pattern is: add markdown source → build script auto-generates HTML with embedded images and styles. No documentation UX changes needed; guides are self-contained.

---

## Learnings

### 2026-05-03 — Dataset architecture spec (#206): Foundational infrastructure research

**Task:** Write comprehensive design spec for dataset compatibility, validation, schema-versioning, and corruption detection. Research deliverable (no implementation).

**Key decisions locked down:**

1. **dataset.json as single source of truth**
   - Canonical location for `datasetId` (26-char ULID), `schemaVersion`, `appVersion`, `createdAt`
   - Never regenerated or mutated after creation (immutable identity)
   - Legacy datasets (missing `schemaVersion`) default to v1; no file regeneration
   - Contrast with old approach: sniffing `datasetId` from first event in events.ndjson was unreliable for config-only events (no top-level datasetId field)

2. **Schema-version handshake (6 rules)**
   - schemaVersion > app.CURRENT → REJECT (app too old; upgrade required)
   - schemaVersion < app.CURRENT + no migration → REJECT (cannot upgrade)
   - schemaVersion < app.CURRENT + migration exists → OFFER migration (user confirms)
   - schemaVersion === app.CURRENT → ACCEPT (silent, no dialog)
   - Folder corruption (unreadable dataset.json, invalid JSON, schema validation fail) → REJECT (hard, no bypass)
   - First-run special case: currentDatasetId === null skips datasetId-mismatch check but still enforces: corruption, foreign-events-without-dataset.json, schema-too-new

3. **Corruption detection framework (8 detection points)**
   - C1–C3: dataset.json issues (unreadable, unparseable, schema-invalid)
   - C4–C6: events.ndjson issues (zero-byte, truncated last line, mid-file invalid JSON)
   - C7: hydration failure (reducer throws during event replay)
   - C8: optional manifest for cheap proofs (deferred to M2)
   - **Critical rule:** Detect at switch time (before hydration), not during hydration → users get actionable errors before app is stuck

4. **Folder-kind state machine (3 states)**
   - EMPTY: no dataset.json, no events.ndjson (→ new workspace)
   - VALID_OT: dataset.json exists and parses (→ handshake decides)
   - FOREIGN: events.ndjson without dataset.json (→ hard reject, cannot determine identity)
   - First-run accepts EMPTY + VALID_OT; rejects FOREIGN, CORRUPT, SCHEMA_TOO_NEW

5. **Error catalogue (9 error codes)**
   - Each code maps 1:1 to `ConfigSetDataDirResponse.error.code`
   - User-facing copy tailored for NGO staff (no jargon; actionable)
   - Details object includes machine-readable context (datasetId, schemaVersion, etc.)
   - Examples: SCHEMA_TOO_NEW ("Update OpenTreasury"), DATASET_MISMATCH ("Switch workspace?"), DATASET_CORRUPT ("Restore from backup")

6. **Migration framework outline**
   - Location: `app/src/core/migrations/` (v0-to-v1.ts, v1-to-v2.ts, etc.)
   - Interface: `Migration` + orchestrator for sequential chains
   - Pattern: back up original → run migrations → fsync → rename (atomic)
   - Testing matrix: old-app/new-schema, new-app/old-schema, migration correctness
   - Schema-bumping checklist for future PRs

**Architectural insights extracted:**

- **Immutability principle:** Workspace identity (datasetId + createdAt in dataset.json) should never change. This prevents silent data mismerges and is foundational for M2 multi-device sync.
- **Fail-fast philosophy:** All validation happens at switch time (handler), not hydration (bootstrap). If hydration fails, app is bricked; better to reject upfront.
- **First-run adoption pattern:** When no current workspace exists (`isOnboardingPending`), we can adopt an existing VALID_OT folder without datasetId mismatch check — this enables "open existing workspace" flow in onboarding wizard while still refusing corruption/legacy/schema-incompatible folders.
- **Backward-compat by design:** Legacy datasets without `schemaVersion` are assumed v1; app never regenerates the file. This means we don't bloat old datasets with new metadata fields. Migrations are opt-in (user confirms), not automatic.

**Spec size:** ~1200 lines markdown including code examples, decision trees, error descriptions, migration framework outline, acceptance criteria (8 categories), work decomposition (11 items), 6 open questions.

**Deliverable:** `docs/specs/dataset-compatibility-validation.md` (PR #234, open for review).

**Next step:** Neo decomposes spec into sub-issues (estimated 4–6 items for Morpheus + Trinity to implement over 2 sprints).

### 2026-05-02 — Prototype critique authority (Insights Final Spec)

**Key learning: When Pedro says "challenge everything," exercise design authority — don't just translate.**

The Insights final spec required me to critique Pedro's prototype (`insights.jsx`), not just codify it. This is a different mode than mockup-translation: I made opinionated KEEP/REJECT/MODIFY calls on 10 specific elements. Key decisions I locked down:

1. **Retired the YoY small-multiples grid** (UX-005a) — the mockup defines a campaign-performance pattern, not yearly comparison. VerticalBarTile component is NOT needed.
2. **Corrected segmented toggle semantics** — it's a display mode selector, not a sort selector. Sorting stays by volume.
3. **Removed inline transaction table** — drilldown shows aggregates only; link to Movimientos for detail.
4. **Fixed donut slice color logic** — reject hardcoded palette; use category-ID hash for consistency.
5. **Specified tag combiner as searchable dropdown** — not native select; follows app patterns.

The prototype-as-inspiration directive gave me license to be opinionated. Future prototypes should get the same critical treatment: identify what's worth keeping, what conflicts with system conventions, and what's missing.

### 2026-05-02 — Pedro's mockup-driven iteration style (Insights A1)

**Key learning: Pedro specs via pixel-level mockups, not prose requirements.**

When Pedro wants to communicate a feature vision, he creates concrete PNG mockups (`insights_idea.png`, `insights_idea_2.png`) rather than writing lengthy requirements documents. These mockups are the source of truth — my job is to:

1. **Interpret the mockup faithfully** — extract layout, component hierarchy, data fields, and interaction patterns directly from the visual
2. **Write the spec as a translation** — the spec should codify what the mockup shows, not invent new patterns
3. **Flag ambiguities as open questions** — where the mockup doesn't specify (e.g., edge cases, empty states, responsive behavior), ask Pedro rather than assume

The Insights v1 spec (ux-005a) described a "small-multiples YoY grid" pattern based on my interpretation of Pedro's directive text. Pedro's mockups revealed a completely different vision: tag-centric landing with horizontal card row, in-section drilldown with donut charts, and a tag combiner for intersection analysis. The mockup supersedes the prose interpretation.

**Process adjustment:** When Pedro shares mockups, treat them as the authoritative design source. The spec's job is to make the mockup implementable (responsive breakpoints, data fields, CSS recipes, component contracts), not to reimagine the design.

### 2026-04-27 — Search Spec Revision (Topbar Pivot, Spec-024)

**Wave coordination (concurrent with splits Wave A/B):**
Part of 4-agent sprint. PR #120 (squad/spec-024-revision) revised free-text search spec to reflect topbar pivot:
- ⌘K on macOS, Ctrl+K on Windows (keyboard shortcut)
- ?q=<query> route param for deep linking and shareability
- Cross-screen navigation: search results unified view across Movimientos, Panel, Insights, TransactionDetail
- AppShell.tsx:228-232 placeholder identified for implementation handoff
- CI ✅ GREEN, ready to merge
- Spec-024-free-text-search.md + ux-008-movement-search.md both updated

**Process insight:** Coordinate spec revisions in parallel with feature implementation when possible. Topbar search enables discovery across splits-enabled screens — ships in parallel no blocker on splits implementation.

**Key lesson:** When specs pivot, update decision logs immediately so implementation teams have context. Handoff clarity matters more than perfect prose.

### 2026-04-27 — Saldo iter 8 re-diagnosis (iter 7 REJECTED)

**Critical lesson learned: Diagnosing visual bugs without looking at the screenshot is malpractice.**

My iter 7 spec was based on code analysis without carefully examining Pedro's annotated screenshot. The spec was implemented, but both bugs persisted because I misidentified the root causes.

**Bug A — Header/value misalignment (STILL PRESENT in categories-only view):**
- Iter 7 diagnosis: Assumed subcategory padding was the cause.
- Iter 7 fix: Added `+ var(--space-6)` to all grid templates.
- Reality: The misalignment occurs WITHOUT subcategories expanded. Screenshot shows header "2025"/"2026" labels left of where row values start. This means the header and row grids are computing different column widths despite having identical `grid-template-columns` declarations.

The grids ARE NOT siblings — header (`ot-saldo-panel__columns--compare`) and rows (`ot-saldo-row--compare` inside `ot-saldo-panel__rows`) are separate grid containers. Each runs its own grid algorithm. With `1fr` fractional units, "free space" is computed independently per container. If header content (short text) and row content (value+bar flexbox divs) have different intrinsic sizes, the `1fr` distribution differs.

**Root cause cannot be definitively determined from static code analysis.** Iter 8 spec instructs Trinity to use DevTools Grid inspector to verify column width differences before implementing.

**Bug B — Panels stop resizing (now in SMALL windows, not large):**
- Iter 7 diagnosis: Panels stopped at large viewports due to fixed AppShell padding.
- Iter 7 fix: Changed padding to `clamp(var(--space-7), 3vw, var(--space-10))`.
- Reality: Pedro now reports small-window resize failure. The issue flipped direction.

Root cause is the `minmax(X, 1fr)` column templates where X is computed from actual text widths. Long category names and formatted values create large minimums. Sum of all column minimums (~476px) exceeds available panel width at narrow viewports.

**Key takeaways for future visual bug specs:**
1. **VIEW THE SCREENSHOT FIRST** — annotated visual evidence > code assumptions
2. **Trace actual DOM structure** — header and rows are independent grids, not siblings
3. **Understand `1fr` behavior** — distributes free space AFTER minimums are satisfied, computed per-container
4. **When static analysis is inconclusive, mandate runtime DevTools investigation** before implementation
5. **Test at multiple viewport sizes** — bugs can manifest differently at different widths

Spec for iter 8 is in `.squad/decisions/inbox/niobe-saldo-iter8-spec.md`. Unlike iter 7, this spec acknowledges uncertainty and requires Trinity to verify root causes in DevTools before implementing fixes.

### 2026-04-27 — Saldo iter 7 alignment spec (SUPERSEDED BY ITER 8)

Diagnosed two CSS bugs in the Saldo compare-mode panels (iter 6 rejected by Pedro):

**Bug A — Header/bar misalignment when subcategories expand:** The subcategory name has 20px left-padding (`.ot-saldo-subrow__name { padding-left: var(--space-6); }` in globals.css:776) to create the indent, but the shared grid column template only accounts for the text width in `ch` units, not the padding. When subcategories are shown, their name column is 20px wider than the header and category rows, which shifts the year columns out of alignment. The fix: all three grid siblings (header `.ot-saldo-panel__columns--compare`, category row `.ot-saldo-row--compare`, subcategory row `.ot-saldo-subrow--compare`) must add a second `+ var(--space-6)` to the first column's minmax formula to reserve space for the indent padding. This ensures pixel-perfect column alignment across all three elements per the `grid-header-row-alignment` skill recipe.

**Bug B — Panels stop resizing above 1430px:** The `.ot-shell__main` container has fixed 32px horizontal padding (`var(--space-10)` on each side, AppShell.css:345). The Saldo panels use `grid-template-columns: 1fr 1fr` which should distribute space evenly, but the fixed padding caps their growth at wider viewports. The fix: reduce the horizontal padding from 32px to 20px (or make it responsive with `clamp(var(--space-7), 3vw, var(--space-10))`) to free up horizontal space for the panels to continue expanding with the viewport.

Both bugs stem from a mismatch between intrinsic content sizing and the grid layout system. The spec in `.squad/decisions/inbox/niobe-saldo-iter7-spec.md` provides exact line numbers, before/after CSS changes, and acceptance criteria for Mouse to execute without re-investigation.

### 2026-04-20 — WI-21 Delete/Edit i18n copy drafted

**WI-22 Saldo shipped (2026-04-22):** i18n namespace `saldo.*` (72 keys ES/EN parity) merged to main in PR #9. Locked 3 microcopy decisions for Pedro (KPI labels, dropped-category sublabel). Projection badge, same-month-prior-year tooltip, data-table captions all spec'd. Pattern: numeric formatting stays OUT of i18n values; component calls `formatCurrency` / `Intl.NumberFormat` / `Intl.DateTimeFormat`. All gates green: typecheck ✅, lint ✅, format ✅, test ✅.

Drafted full ES+EN copy for Edit/Delete CRUD on Accounts/Categories/Subcategories/Tags in
`.squad/decisions/inbox/niobe-wi21-delete-copy.md`. Key learnings:

1. **Existing namespace is `configuracion.*`, NOT `config.*`** — the task brief's "config.{entity}"
   shorthand is misleading; the locale files use the Spanish root and Spanish entity slugs
   (`cuentas`, `categorias`, `etiquetas`) in *both* ES and EN. Any future copy work must respect
   this — changing it would break all existing i18n keys. Added a `configuracion.subcategorias`
   top-level node proposal since subcategories now need first-class Edit/Delete affordances.

2. **Delete-vs-Archive copy must be paired, not either/or** — Switch hasn't ruled which entities
   are hard-delete vs soft-archive. Providing both `.confirmDelete` / `.confirmArchive` + matching
   bodies/toasts unblocks Trinity now and absorbs Switch's verdict later without re-translation.
   Recommended verdict: Tags hard-delete, Accounts/Categories/Subcategories archive-only (FK +
   audit weight). Awaits Switch confirmation.

3. **Neutral body copy per entity carries the "what will happen" weight** — each entity has a
   distinct downstream blast radius (accounts touch balances/imports; categories orphan their
   children; subcategories only lose the leaf; tags detach cleanly). Generic "esta acción no se
   puede deshacer" isn't enough — the body line must state the *specific* consequence. This
   improves treasurer trust over a one-size-fits-all dialog.

4. **Usage count must degrade gracefully to `—`** — event-sourced read model may not yet expose
   movement counts per config entity. Introduced `configuracion.delete.usage.unknown: "—"` plus
   a pluralized `withCount` key, so Trinity can render the dialog today and Morpheus can wire
   real counts later without touching the modal.

5. **Centralizing buttons/warning/error under `configuracion.delete.*`** avoids 4× duplication
   across entities and keeps verb consistency (Cancelar / Eliminar / Archivar). Only entity-
   specific copy (title, prompt, body, toasts) lives per-entity.

### 2026-04-19 — UX-007 Configuración v1 spec finalized

Completed 34KB comprehensive UX spec for WI-15 Configuración screens. Covers Cuentas (bank + PayPal, 
card grid list, modal create/edit with type toggle, color picker, IBAN formatting, currency selector, 
soft-delete + archive patterns), Categorías (tree view with nested subcategories, inline subcategory 
editor in modal, type badges income/expense, activation toggle), Etiquetas (simple card grid, color 
picker, basic CRUD). Empty-state flows for first-time user (no accounts/categories/tags). Integration 
with WI-13 Add-Transaction modal (reference data refresh strategy). Full accessibility (WCAG 2.1 AA 
keyboard nav, focus management, screen-reader labels). i18n structure (config.* namespace). Five open 
questions flagged for Pedro/Link (modal state persistence on nav, Panel empty-state CTA routing, sort 
order field visibility, IBAN checksum validation, subcategory deletion behavior). Out-of-scope deferred 
features (bulk import, drag-drop reorder, custom hex colors, multi-currency, category type mutation, 
undo/redo). Spec is authoritative reference for Trinity's WI-15 implementation post-Pedro approval.

### 2026-04-19: Configuración UX Patterns from Web Reference

**Key learnings from `rett-europe/opentreasury` analysis for UX-007 (Configuración v1 spec):**

1. **Card-grid pattern for entity lists:** All three config screens (accounts, categories, tags) use responsive card grids (not tables). Each card is a self-contained unit with metadata + inline actions (edit, delete, toggle active). This is more scannable than dense tables for non-technical users who need to recognize entities visually (e.g., by color-coded account cards or category type badges).

2. **Modal-based CRUD, not inline editing:** Create and Edit flows open centered modals (520–600px wide) with form validation. No inline-edit or slide-out panels. Modals have explicit Cancel/Save actions with loading states. This matches the WI-13 Add Transaction modal pattern — consistency across all forms.

3. **Type selectors as toggle cards (not dropdowns):** Account type (Bank/PayPal) and Category type (Income/Expense) use two-button toggle cards with icons, not a traditional select dropdown. This makes the binary choice more visual and reduces cognitive load (no need to open a dropdown to see options).

4. **Hierarchical category model with inline subcategory editor:** Subcategories are not separate top-level entities. The category form includes an inline list editor (add/remove subcategories within the same modal). This avoids navigation overhead and keeps the parent-child relationship explicit in the UI.

5. **Soft-delete (isActive toggle) preferred over hard-delete:** All three entities support an `isActive: false` state (archived). Delete is blocked if the entity is referenced by transactions. This prevents accidental data loss and aligns with the "no-delete-only-archive" philosophy for financial data.

6. **Color as a first-class UI affordance:** Accounts and Tags use color not just for decoration but as a functional identifier (left-border stripe on account cards, pill background for tags). The color picker is a required field (with defaults) to encourage visual distinction.

7. **Confirmation dialogs show impact (transaction counts):** When archiving/deleting, dialogs display "{entity} tiene {count} movimientos asociados" to inform the user of downstream impact. This is critical for treasurers who need to understand consequences before confirming.

8. **Validation is inline + specific, not just "required field":** IBAN formatting (auto-add spaces), email validation, duplicate-name checks — all show field-level errors on blur with actionable copy (e.g., "IBAN no válido. Verifica el formato."). No generic "Form is invalid" toast.

9. **Empty states are instructional, not just decorative:** Each config screen's empty state includes an icon + 2-line explanation of *why* you need this entity + a primary CTA to create the first one. This reduces the "What do I do now?" moment for first-time users.

10. **i18n copy pattern: entity name + action verb:** Translation keys follow `{screen}.{entity}.{action}` structure (e.g., `config.cuentas.new`, `config.categorias.delete.confirm`). This makes key discovery predictable and avoids copy duplication.

**UX pitfalls to avoid:**

- **Don't mix card grids and tables:** The web app is consistent — all config screens use cards. Switching to a table for "Categorías" (because of subcategories) would break the pattern. Keep it cards + inline subcategory chips.
  
- **Don't auto-save on toggle switches:** The web app's Active/Inactive toggle (on account/tag cards) triggers a confirmation dialog if the entity has transaction references. Auto-saving without confirmation would be dangerous for accidental clicks.

- **Don't hide the color picker in "Advanced options":** Color is a primary affordance for accounts/tags, not an edge-case customization. Make it prominent in the form.

- **Don't allow category type mutation after creation:** Changing "Ingreso" → "Gasto" on an existing category would require reclassifying all referencing transactions. The web app makes this field immutable in edit mode. Follow that pattern.

**Integration notes for WI-13 (Add Transaction modal):**

---

### 2026-05-01: Cross-Agent Heads-Up — Shared Modal Recipe Proposal (from Trinity)

**Status:** DECISION INBOX MERGED → awaiting design review

Trinity filed a proposal in `.squad/decisions/` about a potential shared `.ot-modal` CSS recipe to prevent token-drift bugs across ProfileSetupModal, TransactionDetailModal, and other dialog-like surfaces. Pattern match: all modals re-implement scrim, card, padding, focus ring with subtly different class names and sometimes phantom token references.

**Options on the table:**
1. Keep hand-rolling (status quo) — cheap per-modal, token drift continues
2. Document "modal recipe" checklist in `.squad/skills/` — low-risk, prevents ad-hoc invention
3. Ship shared `.ot-modal` / `.ot-modal__card` / `.ot-modal__scrim` in `globals.css` — higher upfront cost, removes drift risk permanently

**Trinity's recommendation:** Option 2 first (document checklist), escalate to Option 3 next time a brand-new modal ships (vs. editing existing).

**Niobe action:** Spec review needed if Option 3 proceeds. Confirm the recipe aligns with prototype modal styling and whether scrim/card/padding/focus tokens are all the right ones.

- **Dropdown refresh:** The web app uses a `ReferenceDataService` that caches accounts/categories/tags globally and invalidates on CRUD operations. When a user creates a new category in Configuración, the service refetches, and any open dropdowns (e.g., in Add Transaction modal) get the updated list. Trinity should implement a similar invalidation mechanism (IPC event or React context).

### 2026-04-26 — WI-57 Movements Date Filter Layout Separation

**Context:** PR #57 shipped the locked date-filter spec with 8 preset chips (Este mes | Mes pasado | Últimos 3m | Este año | Año pasado | Últimos 12m | Personalizado | Todo) currently rendering INLINE inside the same `ot-filter-bar` row as the existing attribute filters (Cuenta / Tipo / Categoría / search). Pedro flagged that the period filters need visual separation from the slicing filters.

**Problem analysis:** The date filter is a **top-level temporal scope** that governs the entire dataset ("show me April"), while the other filters are **slicing filters** that refine within scope (account, type, category). Current single-row layout dilutes this hierarchy and makes 8 chips overwhelming.

**Proposal delivered:** Five distinct layout options with full pros/cons/implementation cost analysis:

1. **Option A: Dedicated Scope Bar (Separate Row Above)** — Date chips in a full-width band above the attribute filter bar. Recommended option.
   - **Pros:** Visual primacy for temporal scope, clear hierarchy, 1-click presets, cross-screen consistency ready.
   - **Cons:** Vertical space cost (~60px), potential redundancy (label + chips + pill).
   - **Cost:** M (Medium) — new `.ot-scope-bar` CSS, move JSX out of filter bar, test wrap.

2. **Option B: Scope Pill in Page Header** — Date scope as a compact button next to "Movimientos" title, opens dropdown.
   - **Pros:** Mimics Panel pattern, compact, mental model alignment (period = session context).
   - **Cons:** Hidden affordance, 2-click for presets, dropdown complexity, pill placement ambiguity.
   - **Cost:** L (Large) — new `<Popover>` primitive or styled `<select>`.

3. **Option C: Single Date Button + Inline Menu** — Date button inside filter bar opens popover with chips.
   - **Pros:** No new bars, condensed, still inline.
   - **Cons:** Loses hierarchy signal, 2-click for presets, popover nesting for Personalizado.
   - **Cost:** M (Medium) — new `<Popover>` primitive, vertical chip menu.

4. **Option D: Two-Row Filter Bar** — `.ot-filter-bar` becomes two-row flex (date top, slicing bottom).
   - **Pros:** Grouped but separated, compact, 8 chips visible.
   - **Cons:** Ambiguous hierarchy (looks like overflow, not deliberate separation), visual weight, wrap edge case.
   - **Cost:** S (Small) — `.ot-filter-bar--two-row` modifier, row wrappers.

5. **Option E: Left Rail Date Selector** — Vertical list of radio buttons in left column next to table.
   - **Pros:** Spatial separation, vertical breathing room, table-adjacent context.
   - **Cons:** Viewport width cost (burns ~180px, table would scroll on 1366px), unusual pattern, mobile collapse, Personalizado UX awkward.
   - **Cost:** L (Large) — new layout grid, responsive collapse.

**Recommendation:** **Option A (Dedicated Scope Bar)** with **Option D (Two-Row Filter Bar)** as runner-up. Rationale:
- Hierarchy matches mental model (period governs, slicing refines).
- All 8 chips visible = 1-click presets (critical for finance app where users jump between "this month," "last month," "this year").
- Vertical cost (~60px) is acceptable given virtualized table.
- Cross-screen consistency ready (Panel, Saldo, reports can reuse `.ot-scope-bar` pattern).

**Key learning:** **1-click preset switching is a UX priority for finance apps.** Hiding presets behind menus (Options B/C) reduces visual clutter but adds interaction friction. For temporal navigation—a high-frequency operation—visible chips outweigh the space cost. This is distinct from account/category dropdowns (infrequent changes, many options) where menus are appropriate.

**Visual hierarchy guidance for Mouse:** Date scope must be visually PRIMARY relative to slicing filters. Suggested treatments:
- **Option A:** Scope bar uses stronger tint (`var(--color-brand-surface)` at 16% vs. 10%), date chips use brand primary active state.
- **Option D:** Top row gets subtle separator (border or darker bg), or date chips use bolder active state vs. slicing filters' muted state.
- **Options B/C:** Date button more prominent than slicing dropdowns (larger size, leading icon, brand tint even when closed).

**Open questions flagged for Pedro:**
1. Does PanelScreen's month button ever become interactive? If yes, should it adopt the same pattern?
2. How important is 1-click preset switching? (Informs menu vs. visible chips decision.)
3. Viewport size priority: 1366×768 laptops (need vertical savings) or 1920×1080+ desktops (can afford scope bar)?

## 2026-04-28 — Movements Date Filter Final Implementation (PR #57)

**Layout decision finalized:** Option A (Dedicated Scope Bar) selected and shipped. Seven preset chips + Personalizado custom-range popover + active-range pill in dedicated `.ot-scope-bar` above `.ot-filter-bar`. Visual treatment: Calm Scope (weight contrast + container isolation via muted slicing filter colors) rather than initial Anchored Band spec. Decision consolidated to decisions.md. Recipe placed in `globals.css` per prototype-parity rule; reusable across Panel, Saldo, and future screens requiring period scope.

**Handoff:** Proposal document created at `.squad/decisions/inbox/niobe-movements-date-filter-layout.md`. Awaiting Pedro's verdict before Trinity implementation.

- **Two-step category selector:** Category dropdown shows only parent categories; selecting a category reveals a second dropdown for subcategories (if any exist). This is clearer than a single combo-select with indented tree structure for non-technical users.

- **Tag multi-select:** Tags use a chip input (type to filter + click to add). The desktop prototype doesn't show this yet, but the web app does. Note for Trinity: consider a simple multi-select dropdown for v1 (defer chip-input to v1.1 unless it's already in the component library).

**Reusable pattern candidate:**

The **modal-based CRUD with type toggle cards + inline nested-entity editor** (used for categories+subcategories) could be extracted as a general pattern for hierarchical config UX. If we add "Projects" or "Cost Centers" later, the same pattern applies. Consider documenting this in `.squad/skills/hierarchical-config-crud/SKILL.md` if we see a third use case.

## Core Context

**Niobe's charter:** Author UX specs for OpenTreasury Desktop. Wave 1 COMPLETE (6 specs at Draft v0.1: UX-001 first-run, UX-002 enrollment, UX-003 movements, UX-004 saldo, UX-005 panel, UX-006 shell). Each spec has Traceability Matrix to PRDs/ADRs/R-series/C-series. All crypto-sensitive copy questions ratified by Switch (see crypto-error-copy-catalog.md v1.0).

**UX principles locked (all specs):** (1) Treasurer-first. (2) Nothing loads until you ask. (3) Errors actionable. (4) Sync transparent. (5) Security visible + irreversible. (6) Empty states teach. (7) Prototype is contract for 3 canonical screens. (8) Offline is first-class.

**Key constraints:**
- No pending transaction state anywhere (product decision 2026-04-19)
- i18n day-0: every string in ES + EN (pilot Rett Spain; EN required for v1.0 ship)
- Movements must empty-on-open; user selects date range first (prototype contradicts this; UX wins)
- Wave 1 specs RATIFIED by Switch with adjustments: UX-001 Q7 copy opaque, UX-002 Q1 alphabet `ABCDEFGHJKMNPQRSTVWXYZ23456789` XXX-XXX grouping, UX-002 Q2 elevated audit + soft rotation (no forced DEK), UX-003 Q9 + UX-004 Q10 + UX-005 Q8 copy finalized
- ADR-001 (tech stack) + ADR-002 (repo structure) ACCEPTED; ADR-003 (i18n i18next) ACCEPTED
- Prototype is v1 visual/interaction contract; design system is translation layer (prototype wins) per decision 2026-04-19
- Wave 1 implementation blocker gaps identified: G1 first-run, G2 enrollment UX, G4 crypto errors, G5 date-range gate, G6 empty DB
- Coordinate with Link (PRDs 001–003), Switch (copy ratification), Pedro (scope decisions), Mouse (design system v0.1 shipped + follow-up density/toast/menus)
- 28 UX specs planned across 4 waves; Wave 2 queued after Wave 1 → In Review

## 2026-04-19T16:14:07Z — TEAM DECISION: Panel-first unlock for M1 → M1.25 Saldo (from Scribe)

**Link + Neo agreed:** Shift M1 implementation sequence to Panel → Movements (not Movements → Panel).

**Why this changes your sprint:**
- **Your next task:** Panel UX spec (lightweight). Mostly prototype reference (no forms, no filters, read-only). Recent-txs table + totals strip + sparklines (placeholder for M1.1).
- **Movements scope:** Spec already drafted; timeline shifts but not blocked. Full form wiring (account picker, category picker, tag picker) lands M1+1 *after* Panel ships.
- **Saldo:** defers to M1.25. Product decision: Panel is the entry point UX; Saldo is polish.

**Rationale:** Panel is conceptually simple (no gate, no sort, no filter). Validates the treasurer's UX preference early (dashboard-first). Unblocks internal alpha non-empty. Movements remains the *full* feature, just sequenced after Panel proves the core.

**Your M1 exit gate (redefined):** Account creation → Tx entry → Panel visibility (not "three full-featured views"). Movements visible in M1; full wiring in M1+1.

**Spec work (this sprint):**
- Panel UX spec: reference prototype + mock data. Include prototype-reference block (file path, component, visual contract, "open alongside" instruction). 2–3 days.
- Movements: keep as drafted; timeline shifts but scope unchanged.
- Saldo: defer entirely. Don't allocate time to M1 final sprint.

**Coordinate with:**
- Trinity: Panel UI sprint is immediate after UX spec lands. Reference your spec's prototype link directly.
- Mouse: Panel tokens are fewer edge cases than Movements. Finalize Panel tokens first.
- Link: Confirm scope alignment (Panel → Movements sequence for M1 demo).

See `.squad/decisions.md` § "Panel-First Unlock" for full rationale + work packages.

## Recent Updates

### 2026-04-19: Scope additions (Scribe note)
**New scope from Pedro (fix/trinity-prototype-parity):**
- **Movements bulk operations** — first-class feature; when ≥1 row is selected, reveal contextual action bar with count + available bulk operations (categorize, assign tags, approve/reject, delete, export). Not in prototype. Niobe + Trinity to spec the action bar UX next.
- **Movements tag filter** — multi-select filter in filter bar alongside type/account/category/min-max; show rows whose tags contain ANY of the selected tags (OR semantics). Not in prototype. Trinity to add after sticky-header + scroll-isolation fixes land.

## Top Open Questions

- **UX-003 Q1 → Link**: statement-import wizard entirely under UX-016/PRD-006?
- **UX-003 Q2 → Link**: Exportar button M1 — hide vs disabled?
- **UX-003 Q3 → Morpheus/Neo**: large-range threshold (>5000) — parametrise from p95
- **UX-003 Q6 → Link**: remove within-range month dropdown?
- **UX-004 Q2 → Link/Mouse**: zero-in-current non-zero-in-prior — show -100% or hide?
- **UX-004 Q4 → Pedro**: Mes prior = same-month-prior-year or preceding month?
- **UX-005 Q1 → Mouse/Link**: sparkline threshold — hide until ≥3mo or partial+padding?
- **UX-005 Q2 → Pedro/Link**: hide "Nuevo Movimiento" on Panel M1?
- **UX-005 Q4 → Pedro**: Panel→Movements pre-load `This month` or empty range?

### 2026-04-19: Cross-agent update from Scribe
UX-003 Movements screen + UX-006 AppShell now have a working implementation under `app/src/renderer/screens/`. Ready for UX review once merged to `main`.

### 2026-04-19: Every UX spec must open with a Prototype Reference block
Every UX spec going forward must open with a `Prototype reference` block citing the exact prototype file + section. Retro-apply this to UX-001..006. See `docs/product/prototype-fidelity-audit.md` and the 2026-04-19 decision `prototype/ is the visual and interaction contract for v1`.

## 2026-04-19T16:49:03Z — Team Update: WI-1/2/3 shipped, Panel-first Wave 1 complete

**What shipped:**
- ✅ **Morpheus (WI-1/WI-2):** Event-sourced read model, IPC contract, mock handlers (commits 0f427fe, cf30e92)
- ✅ **Trinity (WI-3):** Panel UI wired to IPC, i18n complete (commits 7cdd132, ed8ee62)
- ✅ **Pedro approved Q1–Q6** greenlight; Q3 (cloud schema mirroring) and Q5 ("Ver todos →" pre-filter) ratified with refinements

**What's next for you:**
- **UX-005 Panel spec → In Review** — ready for Niobe finalization + Mouse visual design
- **UX-003 Movements spec** remains on track (timeline shifts but scope unchanged; full form wiring M1+1)
- **UX-004 Saldo** defers to M1.25 (after Panel proves core)
- **Wave 2 UX specs** queue after Wave 1 → In Review complete

**How it unblocks you:**
- Panel MVP now has testable UX contract (prototype reference locked in decision doc)
- Core query shapes documented (Panel needs 5 parallel queries; IPC shapes finalized)
- Trinity's render path proves the event-sourced core before Movements complexity lands

### 2026-04-20: UX-017 — Generic Import Wizard (WI-17) Flow Spec Completed

**Context:** Pedro pivoted WI-17 from bank-specific parsers to a **generic column-mapper** wizard (see `copilot-directive-wi17-pivot.md`). Niobe authored the complete 6-step UX flow spec at `.squad/decisions/inbox/niobe-wi17-ux-flow.md` (v0.1 Draft).

**Spec coverage (400 lines, concrete > exhaustive):**
- **Entry point rationale:** Via Configuración → DATOS tab (single, clear entry point mirrors web app navigation).
- **6 steps:** SELECT_ACCOUNT → UPLOAD_FILE → PICK_SHEET? → MAP_COLUMNS → DRY_RUN → CONFIRM + full UX per step (primary action, validation, error recovery, keyboard shortcuts).
- **State diagram:** Textual flow with error transitions.
- **Dry-run (critical screen):** Summary strip (counts) + tabbed content (preview 5 rows / duplicates / errors) + duplicate opt-in checkbox + import CTA. Information hierarchy locked for non-tech treasurers.
- **Wizard controls:** Back (preserves state) / Cancel (confirms if progress) / Next (disabled rules per step).
- **Memory (last-mapping):** Pre-fills mapping if same account re-used in session; warns if file columns don't match; user can reset.
- **WCAG 2.1 AA:** Keyboard nav (arrow/Tab/Enter/Esc) + screen-reader table markup + color contrast + labels.
- **Copy (EN + ES):** All user-facing strings provided (error catalog with recovery paths; dry-run summary labels; step headings).
- **7 flagged risks/open questions:** Date format ambiguity (HIGH), duplicate detection UX (MEDIUM), category/tag optional mapping (LOW), file encoding (LOW), sheet selection >1 (MEDIUM), memory scope (session vs persist), very large imports (notification). All with mitigation options — **QUESTION FOR PEDRO** on each.

**Design decisions locked:** Account-first (1 file = 1 account), generic mapper (not bank-specific), non-optional dry-run, duplicates opt-in, concise copy.

**Learnings:**
1. **Import wizard is the highest-friction step for NGO treasurers.** Dry-run is non-negotiable (shows first 5 rows + counts + duplicates + errors). Without it, treasurers lose confidence in bulk import and revert to manual entry.
2. **Last-mapping memory (pre-fill) is a 5-click time-saver for daily/weekly imports.** Date-format ambiguity is the biggest risk; toggle in STEP 4 with dry-run validation fallback is acceptable friction.
3. **Duplicate handling by checkbox (not auto-skip) empowers treasurer.** Shows exact matches, lets them decide. Risky if design doesn't communicate the duplicate reason (e.g., "Exact match on 2026-01-15, €150, 'Donation'").
4. **Column mapping dropdowns (STEP 4) scale to any file structure** (CSV from bank X, Excel export from accounting software Y, etc.). Generic + flexible at cost of explicit user action per import. Acceptable trade-off for MVP.
5. **i18n copy strategy (entity name + action verb):** `import.step{N}.{field}` keeps keys discoverable and avoids duplication across specs.

### 2026-05-12 — SPEC-026 v2: Multi-user encryption at rest (full rewrite)

**Task:** Rewrite SPEC-026 from single-device (v1) to multi-user-from-day-one (v2), incorporating Keaton's architecture redesign (D1–D5) and Pedro's 3 resolved questions.

**Multi-user spec patterns learned:**

1. **Per-device event files dodge cloud-sync conflicts entirely.** Each device writes only to `events-{deviceId}.ndjson`. Read path globs all files and merge-sorts by ULID. This is simpler than lock files, conflict detection, or CRDTs — and correct for an append-only log with 2–5 writers.

2. **Recovery code = enrollment secret = trust root.** In a small trusted board (2–5 people), a shared 12-word BIP39 phrase is both disaster recovery AND team onboarding. No admin panel, no invitation system. Anyone Pedro shares the code with can join. This is the same trust model as sharing an Excel password — appropriate for the NGO context.

3. **Pedro's trust/revocation stance:** No per-user revocation in v1. Copies of the workspace remain readable with the original recovery code. Full revocation (MK rotation + re-encryption) is a future spec. This is an explicit, documented non-goal — not an oversight.

4. **Per-device file architecture and OneDrive:** The strategy works because each device touches only its own file. The riskiest unknown is whether OneDrive reliably propagates new files and frequent small appends without phantom conflicts. A 1-day smoke test on actual OneDrive is recommended before locking the design.

5. **AAD binding must use event.id (ULID), not line index.** Line-index-based AAD breaks when events span multiple files. event.id is globally unique and immutable — the natural choice for preventing event-swapping across files.

6. **Spec rewrite from architecture proposal workflow:** Input contract (Keaton's D1–D5) provides decisions and schemas. Owner answers (Pedro's Q1–Q3) close remaining questions. Rewrite the spec as if the multi-user design is the only design — no "addendum" framing. Harvest reusable copy (bilingual EN+ES) from the v1 spec for tone consistency. Structure mirrors the team's style reference (SPEC-025).

7. **`events.key` conflict-copy merge is an edge case worth an AC.** During simultaneous enrollment, OneDrive may produce conflict copies. The merge strategy (union `devices[]` by deviceId) is simple because `wrap_recovery`, `salt`, and `argon2_params` are immutable after creation — only the devices array grows.

8. **device.json lives in userData (per-machine, NOT synced).** This is critical: the deviceId and workspace path are local identity, not shared state. Putting them in the synced folder would leak device identity across machines.

**Next:** Await Pedro's answers on 7 open questions (especially date format + duplicate UX + memory scope). Once locked, Trinity to validate visual design + interaction against this spec. UX-017 ready for implementation handoff post-ratification.

---

**2026-04-22 — NEXT:** Link recommended **WI-22 Saldo** as next priority (primary). WI-23/24 runners-up. See decisions.md § "Link — WI-22 Recommendation (post-WI-21 merge)" for full spec. UX-004 spec already accepted; confirm partial-period annotation copy + empty-state branches. Awaiting Pedro confirmation.


### 2026-04-22 — WI-22 Saldo i18n + UX interaction spec

Drafted the complete `saldo.*` namespace (72 leaf keys, ES/EN parity) for Trinity's S5 and a 1-page interaction spec at `.squad/agents/niobe/wi-22-saldo-ux.md`. Branch `wi-22/saldo-i18n`. PR title `WI-22: Saldo UX copy + i18n (ES/EN)`.

**Namespace structure (new pattern — carry forward):**
`saldo.{title,subtitle} · states.{loading,emptyBoth,emptyCurrent,emptyPrior,error} · period.{label,srDescription,options,srOption,*Tooltip} · account · comparison.vs{Year,Month,Quarter} (+ aria variants) · kpi.{net,income,expense,biggestGrowth,delta} · projection.{badge,sublabel,tooltip,ariaHint,rowTooltip} · table.{columns,uncategorized,noPrior,dropped,flat} · chart.{…}`

Kept the legacy `balance.*` stub untouched (still wired to `ComingSoonScreen`); Trinity drops it when S5 lands.

**Patterns worth reusing for future comparison screens:**

1. **Persistent projection disclosure, not hover-only.** `[Proyección lineal]` badge appears on every absolute-value surface (KPI cards, category rows) whenever `isPartialCurrent=true`. The badge itself is the disclosure; tooltip carries transparency copy `Proyección lineal basada en {{daysElapsed}}/{{daysInPeriod}} días`. Rule: **monthly/series data is never projected; totals always are (when partial)**. Chart subtitle `chart.monthlyNetSubtitle` ("Valores reales — sin proyección") locks the chart into actuals even without a badge.

2. **Same-month-prior-year comparison basis lives on the *selected* period option.** Tooltip + `aria-describedby` sits on the currently-selected radio in the segmented control (`saldo.period.{year,quarter,month}Tooltip`), not a page-level banner. Treasurer sees *exactly the disclosure that matches the selected granularity*.

3. **Numeric formatting stays OUT of i18n values.** Currency, percentages, month labels all go through `formatCurrency` / `Intl.NumberFormat` / `Intl.DateTimeFormat` in the component. i18n layer only knows `{{value}}`, `{{year}}`, `{{month}}`, `{{daysElapsed}}`, `{{daysInPeriod}}` — never pre-formatted strings.

4. **aria-label variants on every delta key.** `kpi.delta.{up,down,flat,noPrior}` exists specifically so screen readers announce `aumento` / `descenso` / `sin cambios` / `sin datos previos` instead of just a glyph. Add this to the pattern checklist for any Δ pill — never rely on color/glyph alone.

Three microcopy calls flagged for Pedro (`.squad/decisions/inbox/niobe-wi22-copy-locked.md`): lead-KPI label "Variación neta" vs "Balance neto"; 4th-KPI label "Mayor crecimiento" vs "Categoría con mayor subida"; dropped-category sublabel "Sin movimientos este periodo" vs "Categoría dada de baja". Shipping my calls; Pedro can flip with a one-liner.

Gates: typecheck ✅ · lint ✅ · format:check on my 2 JSONs ✅ (45 pre-existing warnings in unrelated files left alone per charter) · 425 tests pass.

### 2026-04-23 — Saldo redesign spec drafted (post-PR #16)

Wrote `.squad/decisions/inbox/niobe-saldo-redesign-spec.md` for the Saldo redesign directive. Key learnings:

1. **Saldo data shape recap** — `SaldoComparisonResponse` already carries per-category nets for both current and prior periods (`netByCategory`), so the new per-category LY-vs-CY chart needs **zero** new IPC fields. The monthly series + projection fields become dead weight in the renderer and should be cleaned up in a follow-up contract PR (flagged as Q3 to Pedro).
2. **Drop projection completely from the renderer** — that means the `proj. vs {{year}}` sublabel, the projected-current bar fill in panels, the `Projected` badge, and any projected-vs-raw branching in KPIs. Backend `currentProjectedTotal` / `isPartial` / `daysElapsed` stay until the contract cleanup PR.
3. **UX pattern: 2 modes, segmented control, no third "monthly" mode** — kept the surface tight. The Año/Trim/Mes period selector is **removed** (not relocated) because the new axis is category × year, and sub-year granularity confused the picture. If Pedro wants monthly trend back later it's an additive WI.
4. **One chart > two charts for income+expense** — color encodes type, position encodes sort, divider separates the two halves. NGO admins scan "did this category grow YoY", which is a category-local question; one chart answers it in one sweep.
5. **Top-N cap = 8 categories + `Otras`** — chosen to keep x-axis labels legible at 1280–1920px without rotation. This is a UX decision feeding into Mouse's sizing work.
6. **Persistence under `saldo.view.v2`** — bumped the localStorage key to invalidate any prior period-mode state cleanly.
7. **Picker UX rule established** — when the user picks an invalid prior year (≥ current), silently clamp instead of erroring. NGO admins under time pressure shouldn't fight a form; the comparison is meaningless either way.

Three open questions sent to Pedro (Otras drill, panel type column in single mode, contract cleanup scope). Spec is ~140 lines, 8 testable ACs, explicit out-of-scope list for Trinity.

### 2026-04-25 — Movements date filter UX spec

Replaced the "Todos los meses + 12 month names" dropdown with a 7-chip preset row + Personalizado popover. Spec at .squad/decisions/inbox/niobe-movements-date-filter-ux.md.

## Learnings

1. **"Mes pasado" beats "Últimos 30 días" for finance UIs.** Calendar-anchored ranges match how treasurers think (monthly closing = full calendar month, not a rolling 30-day window). Mixing both in the same filter creates ambiguity ("which one did I pick last time?"); pick one metaphor and commit.
2. **"Últimos 3 meses" replaces "Trimestre actual/pasado".** Spanish NGOs don't universally close on Q1/Q2/Q3/Q4 — calendar quarters force a mental model that doesn't match grant cycles. Rolling 3-month covers the intent without the Q1-or-Q2 question.
3. **Default-empty made sense for a 13-option dropdown; it does NOT make sense for 7 visible chips.** With a visible default chip, the cost of a wrong guess is one click; the cost of empty-on-load is a mandatory click on every screen entry. Pedro's original "starts empty" rule was a workaround for a bad dropdown — when the dropdown dies, the rule should die with it. Flagged this revisit explicitly so Pedro can ratify or override.
4. **Native <input type="date"> over custom dual-calendar popover.** A11y for free, keyboard for free, OS-familiar, zero new component surface. NGO admins use the control 2-3 times a session; investing in a richer picker is bad ROI vs. shipping. Reuse the same call for any future date-range need (Saldo period override, import dry-run filter, etc.).
5. **Chip ria-label should resolve the range, not just the label.** "Mes pasado, seleccionado, del 1 al 31 de marzo de 2026" — screen-reader users get the actual window, sighted users see the short label. Pattern reusable for any preset-chip group where the underlying value is computed (Saldo period chips already do label-only; consider upgrading on next pass).
6. **Slider verdict logged as a NO.** Future date/range UI questions: before reaching for a slider, check (a) is the domain bounded and known? (b) is day-level precision required? If yes to (b), slider loses every time to chips + inputs. Document this so we don't relitigate.

**Next:** Await Pedro on 2 open Qs (fiscal year alignment, localStorage persistence). Trinity can start scaffolding chips against the spec; the two open Qs don't block the chip row, only the year-preset semantics + persistence wiring.

## 2026-04-29: WI-B Spec Locked + Wave 2 closure (Scribe summary)

- **PR #71 merged:** `docs/ux/specs/ux-004a-saldo-subcategory-drilldown.md` locks Option A global toggle, recursive top-8 + Otras subcategorías, projection §11.1/§11.2 contract extension. All §12 open questions (1–9) resolved.
- **Hand-off plan executed:** Morpheus → PR #72 (projection) merged; Mouse + Trinity now on parallel WI-B UI branches.
- **WI-C deferred** to issue #69 (now `priority:v1`) — your spec scope held the line.
- **Wave 2 (SPEC-023):** Closed — all five PRs (#62/#63/#65/#66/#68) merged.

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

### Niobe-specific (spec ownership)

Your `ux-004a-saldo-subcategory-drilldown-amendment-1.md` §3.3 (2px parent-grouping left guide on `.ot-saldo-subrow`) was **overridden** by the round-3 dogfood pass. Override is recorded as an **appended section** in the same amendment file — §3.3 stays intact. If you revisit this spec for WI-C or future polish, treat §3.3 as historical context; the live rule is the appended override (no left guide; indentation = sole nesting cue).
## 2026-04-26 — Insights mockup input captured for UX-005 amendment

**Cross-agent note from Scribe:** Two PNG mockups (insights_idea.png + insights_idea_2.png) have been captured in .squad/decisions/inbox/ as design input for the Insights section work (M4 target, issue #69 context).

### What these mockups define

**insights_idea.png — Insights landing (dashboard):**
- KPI strip: Etiquetas activas · Ingresos etiquetados · Gastos etiquetados
- Tag cards gallery (horizontal scroll): per-tag card with colored dot, #mov badge, Ingresos/Gastos/Neto, optional sparkline
- Global metric toggle top-right: Volumen | Neto | # Mov
- Cross-tag composer (bottom): "Combina etiquetas para análisis cruzados" example Calendarios ∩ 2026

**insights_idea_2.png — Per-tag drill-down:**
- Breadcrumb: ← Volver a Insights
- **Inline tag intersection composer** (NOT separate screen/modal): [Tag chip] [+ Combinar etiqueta... ▾]
- Title + subtitle: {Tag Name} / Análisis de campaña...
- KPI cards: Ingresos / Gastos / Neto with category/movement counts
- Distribución (donuts): Ingresos | Gastos side-by-side, empty state "Sin gastos para esta selección"
- Detalle (table): Categoría · Subcategoría · Ingresos/Gastos/Neto
- Evolución (line chart): Ingresos/Gastos legend
- Por cuenta: horizontal stacked bars

### Implications for your UX-005 amendment

1. Insights IA is now **DASHBOARD-FIRST** (landing with KPI + tag cards) → drill-down per-tag analytics
2. UX-005a (per-label YoY) becomes **DRILL-DOWN navigate target** when tag card is clicked
3. The drill-down view replaces your original UX-005a vision — now richer with KPIs + donuts + table + time-series + per-account breakdown
4. Tag intersection (∩) is an **INLINE chip composer**, not a separate page
5. Per-label YoY (original UX-005a) likely lives INSIDE the drill-down or as an overlay toggle on "Evolución mensual"
6. Empty states are **critical** — every section needs one (e.g., "Sin gastos para esta selección")

### Next step

Fold these two mockups into your UX-005 amendment when Insights work resumes post-M3 (target M4). See Link's PM brief (link-69-insights-prio.md) for roadmap context and Niobe's prior spec response (niobe-69-insights-ia-sketch.md) — both now merged into .squad/decisions/decisions.md for team memory.

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


### 2026-05-04 — Insights subcategory panel UX concept (post-PR #141 dogfood)

**Trigger:** Pedro: diverging-bar subcategory chart "not well resolved at all… very confusing." New team rule: visual/UX changes require a concept proposal before implementation.

**Outcome:** `docs/ux/insights-subcategory-concept.md` + decision inbox `niobe-subcategory-concept.md`. NO CODE.

**Diagnosis (locked):** Diverging chart fails because gastos/ingresos subcategories share no keys → the diverging metaphor implies a comparison that doesn't exist. Central zero baseline is decorative; breadcrumb labels truncate at ~280 px label cells on 1280 px viewports; gastos side `flex-direction: row-reverse` inverts standard label→bar→amount reading order; donut→panel link is severed; <720 px responsive collapse is a different chart entirely.

**Three concepts evaluated:**
- A. Two ranked tables with inline magnitude bars — low cost, recommended.
- B. Donut drill-down (clicked slice transforms donut to subcategories) — medium cost, biggest IA shift.
- C. Stacked bar per category with subcategory segments — medium cost, fits low-cardinality only.

**Recommendation:** Concept A. Strong second: A + donut click collapses table to single-column.

**Reusable principles captured:**
1. **Diverging bars require shared category keys.** When the two sides have disjoint keys, diverging is decoration — pick parallel ranked lists or a hierarchy-aware layout instead. (This *contradicts* the 2026-04-28 generalisation in `.squad/decisions.md`; my concept doc names this contradiction explicitly. Pedro to arbitrate.)
2. **Match the visualisation to the user's actual cognitive task.** Rank-and-scan ≠ compare-pairs ≠ part-of-whole. The 2026-04-28 decision optimised for "single glance" symmetry; the user task is "what's biggest on each side" — a ranking task.
3. **Concept docs should name the contradicting prior decision.** When proposing to walk back a previously locked rule, cite the entry by date/author and explain what changed (here: dogfood signal trumps theoretical generality).

**Process:** First time writing a no-code concept doc post-PR. Format that worked: user-need-first, then failure-mode list (specific, not generic), then 3 concepts each with sketch+pros+cons+cost+fit, then a clear single recommendation, then open questions. Target length 1500–2500 words; landed ~1850.

**Open with Pedro:** 7 questions — primary: which task dominates (top-N scan vs. drill)? Plus: keep top-10 cutoff? % of side vs. % of parent? Wait for Trinity snapshots before greenlight?

---

## 2025 — PR #130 rebase on main (post search-debounce/Enter-submit landing)

**Task:** Rebase stale eat/search-i18n (search i18n keys + trial 1 what's-new) onto current main.

**Outcome:** Clean rebase, single conflict, all gates green, force-pushed with lease, CI passed, PR comment posted. Not merged (Pedro merges after #142).

**Conflict resolved:** pp/src/renderer/locales/es/common.json — shell.search.clearAriaLabel:
  - main: ""Borrar búsqueda""
  - PR:   ""Limpiar búsqueda""
  - Chose ""Limpiar búsqueda"" for ES locale consistency. Audit of the file showed ""Limpiar"" is the canonical verb across the app (ctions.clear, 	ransactions.actions.clear-filters, 	ransactions.search.empty.cta, date.clear). ""Borrar"" is an outlier — flagged mentally; if it appears elsewhere later, normalize to ""Limpiar"".

**i18n alignment check:** AppShell.tsx now uses SEARCH_DEBOUNCE_MS = 500 + Enter-key submit, but the user-visible strings still map to the same keys this PR already provides (shell.search.placeholder, shell.search.ariaLabel, shell.search.clearAriaLabel). No new strings required for the new debounce/Enter UX — the behavior changed, the copy didn't. The 	ransactions.search.{resultCount,empty.title,empty.cta} keys remain pre-wired for the next consumer (likely #142 or follow-up).

**Lesson — locale audit before resolving translation conflicts:** When two valid translations conflict, run Select-String 'verb-stem' across the locale file (and ideally both EN/ES) before choosing. Consistency beats freshness.

**Gates:** typecheck ✓ · lint ✓ · format:check ✓ · vitest 829 passed / 9 skipped · CI lint·typecheck·test ✓.

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

## 2026-05-02T10-13-30Z : Spec #206 Approved + Locked — Your Recommendations Binding

Pedro accepted all 6 of your recommendations from the #206 analysis. Neo finalized the spec in PR #237 (merged). All decisions locked:
- Migration optional M1 / required M2+
- No manifest file M1
- appVersion best-effort
- Sequential migrations
- Hard-reject first-run repair
- SCHEMA_TOO_OLD -> 'contact support' UX

Your analysis was the critical input for this decision gate — the spec now reflects your framing (M1 simplicity vs M2 ambition). Implementation sub-issues #238–#242 open; no UX work in M1 for this spec (error UX deferred to Trinity's error page work).

**Related:** PR #237 (spec finalization merged), parent issue #206 (umbrella tracking), .squad/decisions.md (merged neo-206-spec-locked entry).

**Orchestration:** .squad/orchestration-log/2026-05-02T10-13-30Z-neo.md, .squad/log/2026-05-02T10-13-30Z-206-decisions-locked-decomposed.md.


### 2026-05-10 — SPEC-026: Encryption at Rest (v1)

Wrote `docs/specs/026-encryption-at-rest.md` based on Keaton's refined NGO-focused design + Pedro's four greenlights.

**Key UX decisions locked:**

1. **No skip button on first-run.** The recovery-code confirmation (3 random word positions out of 12, real-time validation) is the single mandatory friction point. Closing the app mid-flow discards the in-memory MK and starts over with a freshly generated mnemonic next launch — no half-confirmed state can be persisted. Rationale: a 60-second one-time setup beats a "sorry, your data is gone" support email forever after.
2. **12 words, not 24.** BIP39 wordlist, 128-bit entropy. Strong enough for the threat model (Argon2id-hardened wrap), and 12 is meaningfully less intimidating than 24 for an NGO treasurer who has never seen a mnemonic before. 3×4 grid fits one screen without scroll.
3. **Recovery flow never locks out.** Wrong code shows error + retry forever. After 5 attempts, a "Contact support" line appears, but attempt 6 still validates. Lockout would defeat recovery: the user already proved possession by typing 12 BIP39 words; bricking them on a typo helps no one.
4. **Export-decrypted always re-asks for the recovery code**, even when `safeStorage` could unlock silently. The friction is intentional — this is the one operation that materialises plaintext on disk, so we want the user to consciously prove ownership.
5. **Migration safety net:** `events.ndjson.pre-encryption.bak` written before re-encrypting trial data, deleted only after the first successful encrypted append (proves the new format is round-trippable end-to-end).

**Spec stats:** 14 sections, 13 testable ACs, 3 open questions for Keaton (Argon2id parameter target on real NGO hardware, atomic rename semantics for `events.key` on Windows, snapshot-file encryption strategy if/when one lands).

**Open questions to Keaton (block implementation):**
1. Confirm Argon2id `m=64MiB, t=3, p=1` ~500ms on a 2020-era NGO laptop.
2. Confirm `write-tmp → fsync → rename` is atomic enough for `events.key` on Windows.
3. Snapshot file: same MK, separate AEAD, or considered derived/plaintext (separate spec)?

**Decision dropped:** `.squad/decisions/inbox/niobe-spec-026-shipped.md`.


### 2026-05-12 — SPEC-026 ship gate: Argon2id spec/code drift (Switch verdict)

**Action item for Oracle/Niobe:** docs/specs/026-encryption-at-rest.md §4.1 documents Argon2id 	=3, but shipped code uses 	=4. The persisted rgon2_params in vents.key are correct, so encrypted workspaces in the field are unaffected — **doc-only fix**. Switch flagged as a Medium non-blocking follow-up in PR #321 (SPEC-026 security review). Update the spec to 	=4 (or revert code to 	=3 after a fresh benchmark — Switch is fine either way as long as spec and code agree).

Full context: .squad/decisions/decisions.md § "Decision: SPEC-026 (#306) — Ship Gate Cleared", and .squad/orchestration-log/20260512T185035Z-switch.md.

## Learnings — 2026-05-15 (SPEC-027 Export Draft)

1. **Translate "feels secure" into "is secure" before writing the spec.** Pedro's brief asked for "2 of 12 positions of the recovery phrase" as a decryption gate. The right move was NOT to ship a spec that quietly worked around it; it was to surface Switch's verdict (Argon2id is all-or-nothing; the MK is already in main-process memory by export time; ~22 bits is brute-forceable) and present the real choices (typed-word confirmation + audit, full 12-word re-auth, or biometric) as a numbered Open Question for Pedro. The spec is honest about what crypto can and cannot do; the product owner gets a clean choice. Reuse: when a brief implies a security mechanism that doesn't exist, the spec is the place to convert the misconception into a decision point, never to silently re-interpret.
2. **The "list starts empty" rule generalises.** Pedro's Movements rule (no date range → no list) was the right anchor for Export's count preview too: no range → no count → no enabled Export button. The rule is not a quirk of Movements; it's a product principle ("don't decrypt or compute anything until the user has told us what they want"). Apply it to any future filtered/decrypted screen (Saldo period drill, future reports, search-result exports).
3. **Renderer-isolation is a constraint on the UX, not just on the code.** "Preview rows before export" was an obvious UX nicety — and an obvious renderer-isolation violation, because the renderer would need plaintext rows it doesn't otherwise have. Designing it out (deferring preview to v1.1 unless we feed from the already-decrypted Movements view) kept the security boundary clean. When a feature looks like it needs new decryption surface in the renderer, that's a spec smell — challenge it before drawing pixels.
4. **Reuse the Switch security note verbatim in §12.** Switch numbered seven questions; carrying them into §12 with the same numbering (and adding mine after) made the resulting note actionable as one consolidated decision request, instead of a "search the inbox" exercise for Pedro. The convention: when a security agent provides numbered OQs, the spec's §12 begins with those, preserves their numbers, and appends UX/product OQs after. Saves Morpheus a relay step.
5. **Two IPC channels beat one for security-gated actions.** xport:prepare (returns a one-shot, TTL'd confirmationToken after the user passed the save dialog) + xport:run (consumes only the token) means the renderer cannot replay or mutate the path/filter set between the confirmation modal and the actual export. Reuse this prepare → token → run pattern for any future deliberate, audited action that touches plaintext or destructive state (decrypted backups, irreversible bulk operations, key-rotation triggers).
6. **Type-the-word confirmation > "Are you sure?" checkboxes for destructive/declassifying actions.** A 1-click confirm is dismissed without reading; typing EXPORTAR forces the user to read the modal body. The locale-dependent word (EXPORTAR ES / EXPORT EN) keeps it natural, not jargon. Reusable pattern for any future "treat like cash" moment.