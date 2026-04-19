# Project Context

- **Owner:** Pedro (perocha)
- **Project:** OpenTreasury Desktop — Electron-based treasury management for NGOs. Desktop version of the cloud-based rett-europe/opentreasury, designed to work without complex cloud setup.
- **Stack:** Electron (frontend), rest TBD. Reference app: Angular 19 + Python FastAPI + Cosmos DB + Entra ID on Azure.
- **Created:** 2026-04-19

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
