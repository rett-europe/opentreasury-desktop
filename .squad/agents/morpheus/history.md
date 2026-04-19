# Project Context

- **Owner:** Pedro (perocha)
- **Project:** OpenTreasury Desktop — Electron-based treasury management for NGOs. Desktop version of the cloud-based rett-europe/opentreasury, designed to work without complex cloud setup.
- **Stack:** Electron (frontend), rest TBD. Reference app: Angular 19 + Python FastAPI + Cosmos DB + Entra ID on Azure.
- **Created:** 2026-04-19

## Key Reference

The cloud version's backend (Python FastAPI) features:
- Cosmos DB NoSQL containers: transactions (partitioned by YYYY-MM), categories, reference_data (tags + bank accounts), audit_log
- RBAC: Admin (full read/write), Viewer (read-only)
- Soft deletes — financial data never permanently lost
- Audit trail on all changes (7-year TTL in cloud)
- Excel/CSV import and export endpoints
- Transaction CRUD with category/subcategory/tag associations
- Multi-account support

The desktop version needs equivalent functionality with local persistence (no cloud DB).

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

## 2026-04-19T16:14:07Z — TEAM DECISION: Panel-first unlock for M1 → M1.25 Saldo (from Scribe)

**Link + Neo agreed:** Shift M1 implementation sequence to Panel → Movements (not Movements → Panel).

**Why this changes your sprint:**
- **Your next task:** Core query surface design + IPC contract for Panel (1–3 days). Read-only queries only — `queryRecentMovements(limit, offset)` sorted DESC by created_at.
- **Panel scope:** recent-txs table + totals strip. Zero forms, zero command-side wiring. Pure read-model.
- **After Panel:** Command-side Movements wiring (accounts, categories, mutations) in M1+1 *after* Panel ships and proves the event-sourced core.
- **Saldo:** defers to M1.25. Same data layer, different query surface.

**Rationale:** Panel is read-only (no user-input validation), has no empty-state gate (renders even with 0 txs), and validates the entire data layer on the simplest code surface. Once Panel renders from real encrypted events, the team knows: OneDrive read works, crypto decrypt works, event-sourced read-model works, IPC contract is sound. All proved before Movements' complex command-side wiring.

**Your M1 exit gate (redefined):** Account creation → Tx entry → Panel visibility (not "three full-featured views"). Movements structure complete; command wiring in M1+1.

**Work breakdown (1 sprint):**
- Phase 1a (2–3 days): finalize `core/query/` interface. Gate: Vitest 100%, fixtures in-memory.
- Phase 1b (1 day, coordinated with Trinity): IPC contract. Zod schema in `app/src/shared/ipc-schemas.ts`. Gate: IPC round-trip vitest.
- Phase 1d (3–4 days, coordinated with Switch): Crypto wiring for reads. Load DEK from keychain via `@napi-rs/keyring`. Decrypt events on main-process read path. Gate: Switch reviews; vitest envelope round-trip + keychain mocks.
- Phase 2 (parallel / M1+8–12 days): Command-side Movements. `core/commands/` for `tx.created`, `account.created`. Implement `core/reducers/` for command-side projections.

**Unblocked for you:**
- No waiting on complex Movements form state.
- Panel IPC can land in main by M1+5 days.
- Movements command-side design can happen in parallel once Panel proves the read-model.

See `.squad/decisions.md` § "Panel-First Unlock" for full rationale + work packages + Phase 1 details.

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

- 2026-04-19 — Crypto-error UX strings ratified in docs/security/crypto-error-copy-catalog.md v1.0. Diagnostic-bundle spec (§4) defines per-scenario whitelisted fields for main-process export path. Use string keys verbatim; never surface crypto-layer names to UI.

### 2026-04-19: Cross-agent update from Scribe
Trinity defined `Movement` type at `app/src/renderer/types/movement.ts`. When implementing the real storage layer, align the read-side projection to this shape or deliberately evolve it and coordinate with Trinity.


### 2026-04-19: Movement schema v0.2 (subcategory already existed; added tags/status + nullable category)
Task from Pedro on `fix/trinity-prototype-parity`: expand Trinity's `Movement` contract so the prototype's Movements table can render Subcategoría / Etiquetas / Estado and the "solo sin categorizar" filter actually filters.

## 2026-04-19 — Data gap flagged (Scribe note)
**Account-color rendering gap identified (fix/trinity-prototype-parity):**
All accounts currently render in the same color. The prototype and the Movements table need per-account color tokens or a `color` field in the Movement schema (or Accounts schema) so treasurers can visually distinguish transactions by account. Propose adding to the real backend schema design phase (M1 follow-up). Related to Mouse's outstanding "Account colour palette" token follow-up.

**New shape** (`app/src/renderer/types/movement.ts`):
- `category: string` → `category: string | null` (`null` = uncategorised).
- `tags: readonly string[]` — always an array, possibly empty.
- `status: 'pending' | 'approved' | 'rejected'` + exported `MovementStatus` type. Explicitly documented as an **application-level review flag**, NOT ledger state — the team decision of 2026-04-19 (no pending transactions at the data layer) still holds.
- `subcategory` unchanged (already `string | null`).

**Mock seed** (`app/src/renderer/mocks/movements.ts`):
- Kept the 48 hand-written SEED rows (Oct-2025 → Apr-2026) intact.
- Derived the v0.2 fields deterministically by row index to keep snapshots stable:
  - `tags`: 0-3 picks from `['urgente','beca-2025','proyecto-a','auditable','recurrente']`.
  - `status`: every 17th row `rejected`, every 7th `pending`, rest `approved` (~80/15/5).
  - `category`: indices `{4, 12, 27, 41}` forced to `null` (4 uncategorised rows for the filter).
- `Seed` type now excludes `tags` / `status` (projected in) but still accepts nullable `category`.

**Guards added in `MovementsScreen.tsx`** (minimal, strict-TS only — NO UI behaviour change; Trinity owns the prototype-parity columns pass):
- Sort comparator: `(a.category ?? '').localeCompare(b.category ?? '')`.
- `categoryOptions` skips `null` when building the dropdown Set.
- Category cell renders `—` when `category == null`.
- Removed the old `TODO` at the `uncategorizedOnly` filter — it now works against real data.

**Verification:** `npm run typecheck` ✓ · `npm run lint` ✓ (max-warnings 0) · `npm test` ✓ (39/39) · `npm run build` ✓.

**Decision doc:** `.squad/decisions/inbox/morpheus-movement-v0.2-schema.md` — includes the real-backend mapping (events → SQLite projection columns, `tx_tags` M:N, review_status default, ULID vs UUID, audit log surface, `month` bucket follow-up). Trinity's superseded gap note removed.

**Commit:** `feat(movements): expand Movement schema with subcategory/tags/status/nullable category (Morpheus)` on `fix/trinity-prototype-parity`.

## 2026-04-19T16:21:30Z — Panel-First Work Package Decomposition (from Neo)

**Neo completed:** Full decomposition of Panel-first M1 implementation into 10 sequenced work items (WI-1 through WI-10) with owners, acceptance criteria, dependency graph, and critical-path analysis. Artifact: `.squad/decisions.md` § Neo — Panel-First Work Package Decomposition.

**Your assignments (awaiting Pedro approval on Q1–Q6):**

| WI | Phase | Owner | Your Role | Est. Days | Gate |
|---|---|---|---|---|---|
| WI-1 | Early | Morpheus | Lead | 2–3 | Vitest 100%, `core/query/` interface |
| WI-2 | Gate | Morpheus+Trinity | Collab with Trinity | 1 | IPC round-trip vitest |
| WI-4 | Parallel | Morpheus | Lead | 3–4 | OneDrive storage layer tested |
| WI-5 | After WI-4 | Morpheus+Switch | Collab with Switch | 3–4 | Switch reviews; crypto round-trip vitest |
| WI-6 | Final | Morpheus | Lead | 1 | Real core wired to IPC handlers |

**First wave (day 1, after Pedro answers Q1–Q6):** 
- WI-1 (you, Morpheus core) starts immediately — no blocking dependencies.
- WI-3 (Trinity, Panel UI) starts immediately in parallel with WI-1 — can mock IPC calls.
- WI-2 (you + Trinity, IPC contract) starts after WI-1 query signatures stabilize (~1 day lag).

**Critical path to M1 Panel alpha:** WI-1 → WI-2 → WI-3 + (WI-4→WI-5) → WI-6 → polish. By day 10, Panel renders from real encrypted OneDrive events. Days 11–15 = sparklines + chart + empty states + skeleton.

**Your Q1–Q6 blocking reads:**
- Q3: **Accounts metadata** — You need to know: does Link draft PRD-010 Accounts, or do you infer the schema from prototype? Neo recommends: minimal schema (id, short, color, createdAt) in WI-1 prep, or Morpheus infers from `prototype/data.js` accounts.
- Q4: **Chart library** — Neo recommends custom SVG for M1 (no deps, matches prototype). Benchmark deferred to M1+1.

**Status:** Work package merged to `.squad/decisions.md`. Awaiting Pedro approval to spawn first-wave agents (you on WI-1, Trinity on WI-3, dual-spawn WI-2 once WI-1 stabilizes).
