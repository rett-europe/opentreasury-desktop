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
