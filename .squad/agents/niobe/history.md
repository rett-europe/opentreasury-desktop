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
