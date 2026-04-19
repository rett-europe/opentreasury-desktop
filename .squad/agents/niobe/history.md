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

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-04-19: Product Vision v0.1 exists (team context)
Link drafted `docs/product/vision.md`. UX-relevant principles: **offline-capable by default**, prototype kept as reference (Q7 asks whether prototype is a UX contract or we're free to depart — Pedro to decide). No custom auth screens in v1 — OneDrive handles it. Spanish + English TBD (Q6). Scope/principles are now decided team context for all UX work. Transaction list starts empty is already locked in.

## 2026-04-19 — Team Context Update (from Scribe)
- ADR-001 (Proposed) at `docs/architecture/adr-001-tech-stack.md` — Neo recommends Option A (React+TS, append-only event-sourced JSON, `age` encryption).
- Security Requirements v0.1 at `docs/security/security-requirements-v0.1.md` — Switch: 20 requirements, 15 stack constraints, 8 accepted risks, 6 open questions for Pedro.
- Both are team context now.

### 2026-04-19: ADR-001 Accepted — UX constraints locked
ADR-001 is Accepted. Implementation constraints locked: no passphrase UI in v1 (OS keychain handles it silently); device enrollment needs a QR-code / 6-char visual-code pairing UX flow. Consider UX implications in upcoming specs.
### 2026-04-19: UX baseline published — prototype analysis + spec plan + 3 flow skeletons

**Artifacts:**
- `docs/ux/prototype-analysis-v1.md` — prototype-as-UX-contract analysis
- `docs/ux/ux-spec-plan.md` — 28 specs planned across 4 waves
- `docs/ux/flows/flow-001-first-run-setup.md` (skeleton)
- `docs/ux/flows/flow-002-device-enrollment.md` (skeleton)
- `docs/ux/flows/flow-003-movements-date-range.md` (skeleton)

**Canonical screens confirmed:** Panel, Movements, Saldo — prototype's three implemented screens are the v1 UX contract (refine, don't reinvent). The other sidebar destinations (Categorías, Etiquetas, Cuentas, Importación, Exportar) are placeholders in the prototype; full specs needed.

**Key finding — prototype contradicts a product rule:** Movements auto-loads all seeded transactions on mount; Pedro's 2026-04-19 decision requires "starts empty until date range selected". Flow-003 corrects this. Prototype visual language is preserved; the loading contract is not.

**Top blocker-level gaps identified (prototype doesn't cover):**
- G1 First-run / folder setup — blocks time-to-first-tx entirely
- G2 Device enrollment UX — blocks multi-device (the whole point)
- G3 Sync / last-synced indicator — blocks multi-user trust
- G4 Crypto error states (decryption, chain break, bad escrow sig) — will happen, can't be "generic error"
- G5 Movements date-range gate — contradicts locked product rule
- G6 Empty database (new NGO) — Panel literally renders broken charts
- G9 Admin actions surface (enrollment approval, revocation, DEK rotation, admin transfer)

**UX principles established (tie-breakers for every UX spec):**
1. Treasurer-first, not developer-first.
2. Nothing loads until you ask (generalization of Pedro's rule).
3. Errors are actionable, never cryptic.
4. Sync is transparent, never invisible.
5. Security decisions are user-visible and irreversible-by-default.
6. Empty states teach.
7. Prototype is a contract for three core screens; a sketch everywhere else.
8. Offline is a first-class state, not a failure.

**Divergence from cloud locked (for specs):** No login screen (OneDrive identity), no app-level RBAC (folder ACL), explicit sync indicator (cloud has none), persistent device identity with enrollment lifecycle (cloud has sessions), all-members audit log visibility (Pedro 2026-04-19), locally-generated exports, OS-level notifications.

**Key UX risks flagged:**
- UX-R1 Enrollment confusion (6-char code + admin-must-be-online is unusual UX)
- UX-R2 Folder-ACL vs treasury-enrollment drift (security/UX education gap)
- UX-R3 SmartScreen warning (AR9) kills first-run before app opens
- UX-R4 Date-range gate feels slow instead of snappy if presets aren't prominent
- UX-R5 Audit log too chatty → nobody reads it

**Open questions raised (for Pedro / Link):**
- Vision Q6 language coverage (ES+EN vs ES-only) — blocks i18n scope
- Sync indicator placement (topbar only vs. topbar + sidebar)
- Panel's "recent" respects Movements range? (recommend: no, always latest-8)
- Remember last-opened folder across launches? (recommend: yes)
- Universal `Ctrl/Cmd+N` keyboard shortcut? (recommend: yes)
- Admin transfer hidden behind Settings → Advanced in v1, or first-class?

**Coordinates with Link's PRDs 001–003:**
- PRD-001-onboarding → UX-001, UX-002 (first-run + enrollment)
- PRD-002-core-ledger/movements → UX-003, UX-006, UX-007, UX-008, UX-014, UX-015
- PRD-003-import-export → UX-016, UX-017

**Security-sensitive copy (Switch review required):** Wave 1 error catalog (UX-009), enrollment language (UX-002/flow-002), admin-action confirmations (UX-012), wipe-local-data (UX-011), R20 acknowledgment checklist (UX-001/flow-001 step 5).

## 2026-04-19 — Team update (via Scribe)
Link's PRDs 001–003 drafted as your upstream. 28 UX specs planned. Blocker gaps G1, G2, G5, G4, G9 are top priorities. Wave 1 sequence locked: UX-004 → UX-001 → UX-009 → UX-003 → UX-006.

### 2026-04-19: Product reshape — UX implications
- **Pending-transaction concept REMOVED from product.** Drop any pending-state UX from specs.
- **Folder-picker needs 'Personal OneDrive unsupported in v1' rejection state** with copy pointing at v1.x.
- **Every UX string now requires both ES and EN copy at handoff** — no 'translate later'. Pilot is Rett Spain (Spanish-first) but EN is v1.0 ship-blocker.
- Several of your PRD-aligned open questions are now CLOSED — check PRDs 001/002/003 for RESOLVED markers.


### 2026-04-19: Your Wave 1 UX specs spawn hit the response length limit at 6 specs in one go. Coordinator will re-spawn with reduced scope (3 specs per batch). No artifacts lost -- you hadn't written any yet.
### 2026-04-19: Wave-1 UX specs — Batch 1 authored (UX-001, UX-002, UX-006)
**Status:** Draft v0.1 · folder: `docs/ux/specs/`

**Deliverables:**
- `docs/ux/specs/ux-001-first-run-setup.md` — first-run / folder setup (Branch A admin / Branch B join / Branch C resume; R20 scroll-to-enable checklist; Personal OneDrive explicit rejection state per decisions 2026-04-19).
- `docs/ux/specs/ux-002-device-enrollment.md` — requester + admin sides; sequence diagram aligned to crypto-spec §5; pubkey-substitution defense (codes must be derived independently on each side — AC1/AC2 make it testable); Approve and Reject deliberately not tab-adjacent.
- `docs/ux/specs/ux-006-app-shell-and-navigation.md` — 5-state global model (locked/normal/syncing/offline/error-banner); **NO pending state** anywhere per product reshape; locale switcher in topbar (day-0 i18n); single banner slot with priority order. Plan note: UX-006 was renumbered from "new transaction entry" for this deliverable per task spawn wording.

**UX constraints reinforced in all three:**
- i18n day-0: every string keyed; ES + EN samples in Copy Guidance section of each spec.
- No visual design (regions + interactive roles + states only; pixels deferred to Mouse).
- Spanish copy ~20–30% longer than English — flagged to Mouse for sidebar/banner wrap limits.
- Crypto errors treated as first-class UX: every occurrence cross-references UX-009 catalog.
- UX-002 explicitly binds to crypto-spec §5 — any deviation requires Switch sign-off (not a UX change).

**Top blocker-level open questions surfaced (all need owners):**
- UX-001 Q7 → **Switch**: exact user-facing copy for bad-escrow-signature state (E4). Ratify before Draft → In Review.
- UX-002 Q1 → **Switch**: code alphabet (Crockford base32 minus `0/O/1/I/L/U`) + grouping (3-3 vs 2-2-2); decision lives partly in crypto-spec §5.
- UX-002 Q2 → **Switch**: mismatch escalation — higher-severity audit only, or forced DEK rotation on reject?
- UX-002 Q3 → **Switch**: pending-entry expiry policy (default proposed: indefinite).
- UX-002 Q4 → **Switch**: self-cancel mechanism for requester (escrow protocol implication).
- UX-001 Q1 → **Pedro**: allow override of non-OneDrive folder? Recommendation: no.
- UX-006 Q1 → **Pedro**: ratify `Ctrl+N` universal new-transaction shortcut.

**Scope holds I declined:** did not write the three screen specs (batch 2). Did not respec crypto mechanics (pointed to crypto-spec §-numbers per style rule 8). Did not override numbering in the plan table — just annotated the UX-006 reassignment for follow-up reconciliation.

**Coordination:** every spec's Traceability Matrix maps requirements back to PRDs / ADRs / R-series / C-series / crypto-spec sections for Cypher's future acceptance tests and the paired SPEC-NNN template.


### 2026-04-19: Wave-1 UX specs — Batch 2 authored (UX-003, UX-004, UX-005) — Wave 1 COMPLETE
**Status:** Draft v0.1 · folder: docs/ux/specs/

**Deliverables:**
- `docs/ux/specs/ux-003-movements-screen.md` — Movements screen (paired PRD-001). Empty-on-open as first-class state; 6 presets; range pill; full filter bar; totals strip; selection column (bulk actions deferred M4); statement-import banner (hand-off to UX-016/PRD-006); state diagram covering RangeNotSelected / RangeLoading / RangeLoaded / RangeLoadedEmpty* / RangeError / DbEmpty / NewActivity.
- `docs/ux/specs/ux-004-saldo-screen.md` — Saldo screen (paired PRD-002). Auto-loads default (Año 2026 vs 2025); two comparison panels; KPI strip; net-monthly bars chart with collapsible data-table equivalent; linear pro-rata projection with explicit tooltip copy; 14 edge cases; no Mermaid (single primary trajectory).
- `docs/ux/specs/ux-005-panel-screen.md` — Panel screen (paired PRD-003). Default landing surface; account cards with sparklines; current-month KPIs; 12-month bars chart with data-table; latest-8 recent-tx (read-only, no Estado column). Empty-DB specified across three branches (no accounts / accounts-no-tx / no-tx-this-month). Prototype's "Nuevo Movimiento" header button hidden in M1 to preserve PR7 read-only contract.

**Wave 1 is now COMPLETE** — all 6 UX specs at Draft v0.1:
UX-001 (first-run), UX-002 (enrollment), UX-003 (movements), UX-004 (saldo), UX-005 (panel), UX-006 (shell).

**Cross-screen consistency decisions encoded:**
- No pending/approval/status column, badge, filter, toggle, or tooltip on ANY screen (removed the prototype's Estado column from Movements and Panel recent-tx; Saldo inherently read-only).
- Chart a11y pattern unified: Saldo and Panel both offer a collapsible screen-reader data-table under their bar charts (Mouse call on default collapsed/expanded — recommendation collapsed for both).
- Account pill visual language preserved from prototype on Movements and Panel recent-tx; same columns, same order.
- Currency / date / number rendering uses Intl.* formatters everywhere; EUR for Rett Spain pilot.
- Global states (offline, syncing, locked, error-banner, device-revoked) live in the UX-006 shell slot and stack above per-screen content — never duplicated per-screen.
- First-run → Panel by default (UX-001 step 8 "Go to dashboard"); Panel MUST handle empty-DB gracefully (specified).
- Panel → Movements hand-off via "Ver todos" recommended to land Movements in `range-loaded` on `This month` (click = range-selection intent); pending Pedro ratify (flow-003 Q7, UX-003 Q7, UX-005 Q4).

**Top blocker-level open questions surfaced (new from batch 2):**
- **UX-003 Q1 → Link**: confirm statement-import (bank/PayPal) wizard lives entirely under UX-016/PRD-006; UX-003 surface is banner-only. Recommendation: yes, banner only.
- **UX-003 Q2 → Link**: "Exportar" header button in M1 — hide vs disabled-with-tooltip? Recommendation: hide entirely.
- **UX-003 Q3 → Morpheus/Neo**: large-range guard threshold (E8 >5000 events) — parametrise from measured p95.
- **UX-003 Q6 → Link**: remove the within-range month dropdown (duplicates range pill). Recommendation: remove.
- **UX-003 Q9 → Switch**: exact ES/EN copy for single-row decrypt-failed (security-sensitive).
- **UX-004 Q2 → Link/Mouse**: zero-in-current, non-zero-in-prior (dropped category) — show as -100% or hide? Recommendation: show.
- **UX-004 Q4 → Pedro**: "previous period" for Mes selector = same-month-prior-year (recommended) vs preceding month.
- **UX-004 Q10 → Switch**: partial-decrypt-failed banner exact copy.
- **UX-005 Q1 → Mouse/Link**: sparkline partial-data threshold — hide until ≥3 months (recommended) vs partial with padding.
- **UX-005 Q2 → Pedro/Link**: hide "Nuevo Movimiento" header button on Panel in M1 (preserves PR7). Recommendation: hide.
- **UX-005 Q4 → Pedro**: Panel → Movements hand-off pre-loads `This month` (recommended) vs empty range.
- **UX-005 Q8 → Switch**: decrypt-partial banner copy on Panel (aligned with UX-003/UX-004 pattern).

**Scope holds I declined:**
- Did NOT respec the create-transaction form (successor to reassigned UX-006 slot — waiting on plan-revision ticket).
- Did NOT write crypto-error copy — cited UX-009 per style rule 8.
- Did NOT touch prototype-analysis-v1.md — batch 2 revealed no new gaps beyond those already catalogued (G5, G6, G4 all cited).
- Did NOT fabricate Mermaid where it did not earn its keep (Saldo and Panel — single primary trajectory + enumerated states is clearer than a diagram).

**Updated docs/ux/ux-spec-plan.md:**
- UX-003 row upgraded from Skeleton to Draft v0.1 with link.
- Added UX-004 row (Saldo) and UX-005 row (Panel) with Draft v0.1 links.
- Marked legacy UX-007 and UX-008 rows as **Superseded** (numbering reconciliation deferred to plan-revision ticket, matching UX-006 precedent).

**Coordination hand-offs queued:**
- Mouse: UNBLOCKED for all 6 Wave-1 screens. Visual tokens, breakpoints, skeleton patterns, chart visuals, range-picker pattern, negative-balance treatment.
- Switch: 4 copy-ratification items (decrypt-failed per screen; aligned with UX-009 catalog owed).
- Link: 5 PRD-clarification items (import wizard boundary, Exportar deferral, month dropdown, dropped-category rule, sparkline threshold).
- Pedro: 3 ratification items (Panel→Movements hand-off range, Panel quick-add button, Mes selector YoY convention).


## Cross-agent update (Scribe, 2026-04-19T10:34:16Z)
Wave 1 COMPLETE. Wave 2 (non-M1 specs per ux-spec-plan.md) is next, after Wave 1 moves to In Review.

- 2026-04-19 — Wave 1 UX questions RATIFIED by Switch: UX-001 Q7 (adjusted — opaque about mechanism), UX-002 Q1 (adjusted — 30-char alphabet ABCDEFGHJKMNPQRSTVWXYZ23456789, XXX-XXX grouping), UX-002 Q2 (options (a) elevated audit + (c) soft rotation prompt on 2nd rejection — NOT forced DEK rotation; (b) rejected as DoS vector), UX-003 Q9, UX-004 Q10 (+ 'en este periodo' scope), UX-005 Q8 (KPIs -> resúmenes). See docs/security/crypto-error-copy-catalog.md v1.0. Wave 1 (UX-001..006) can move Draft -> In Review.
- 2026-04-19 — Mouse's design system v0.1 shipped: 5 docs under docs/design/ translating Wave 1 to visuals. Dark mode + Lucide icons locked. OS system font stack. Follow-ups for me: density-toggle placement on UX-003, toast Ctrl+Shift+T addition to UX-006, right-click row menus (M1 vs v1.x).
