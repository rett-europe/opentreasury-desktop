# Link — History

## Core Context

- **Project:** OpenTreasury Desktop — Electron-based treasury management for NGOs. Desktop version of the cloud-based rett-europe/opentreasury, designed to work without complex cloud setup.
- **Owner:** Pedro (perocha)
- **Reference product:** github.com/rett-europe/opentreasury (Angular 19 + Python FastAPI + Cosmos DB + Entra ID)
- **Target users:** NGO treasurers who need treasury management without cloud infrastructure complexity
- **Role on team:** Product Manager — owns vision, roadmap, prioritization, PRDs
- **Joined:** 2026-04-19

## Key Team Decisions to Respect

- Trunk-based development; PRs to main, never direct commits
- Switch (Security Engineer) has FINAL SAY on security decisions — non-negotiable
- Transaction list page starts EMPTY — user must select a date range before data loads (no auto-loading)

## Learnings

<!-- Append new learnings below as bullet points with date prefixes -->
- **2026-04-19:** Pedro resolved 3 of 8 vision open questions. Q1 (tech stack) → Neo proposes 2–3 options in ADR-001 (in flight). Q3 (encryption at rest) → required, PII-driven; Switch owns the HOW, drafting `docs/security/security-requirements-v0.1.md` (in flight). Q2 (data file format) → deferred until encryption approach lands; format choice depends on crypto envelope. Updated vision.md §7 (principle 6 now explicitly names PII) and §14 (marked resolved + added `### Decisions recorded (2026-04-19)` subsection with forward links). Did NOT write a decisions inbox entry — Neo and Switch own those drops. Still blocking next PRD milestone: Q2 storage scope (Personal vs Business), Q5 OS coverage, Q6 language coverage, Q7 prototype-as-contract, Q8 repo layout approval.
- **2026-04-19 — Vision v0.1 written** at `docs/product/vision.md`. Core framing: OneDrive/SharePoint folder IS the database AND the access control layer. No backend server, no custom auth, no RBAC.
- **2026-04-19 — Scope discipline:** v1 covers accounts, transactions, categories, tags, dashboard (Panel), balance (Saldo), transaction list with filters, CSV import, CSV export, status workflow (pending→approved), search, local audit log, i18n ES+EN, dark mode. PDF/Excel export + reports module + bulk ops + recurring tx → v1.x. Budgets/forecasts/multi-currency/bank feeds → later.
- **2026-04-19 — Cloud features explicitly NOT ported:** Entra ID, RBAC, FastAPI backend, Cosmos DB, multi-tenant, CI/CD to Azure. These are solved by the desktop+folder model.
- **2026-04-19 — Prototype anchors the v1 UX.** The existing `prototype/` (Panel/Movimientos/Saldo in Spanish) is the reference; Mouse/Niobe should refine, not reinvent (pending Pedro confirmation — Q7).
- **2026-04-19 — Spec-driven operating model:** PRDs in `docs/product/prds/`, tech specs in `docs/specs/`, ADRs in `docs/architecture/`, UX specs in `docs/ux/`, security specs in `docs/security/`. Mirrors cloud repo's discipline.
- **2026-04-19 — Success metrics avoid cloud telemetry** — no DAU/MAU/retention pipeline. Use: time-to-first-tx ≤10min, setup success ≥90%, zero data-loss, ≥95% auto-resolved conflicts, ≥80% parity coverage.
- **2026-04-19 — Top 3 risks flagged to Neo/Switch:** OneDrive concurrency/conflicts (🔴), file corruption (🔴), encryption-vs-search trade-off (🔴, Switch final say).
- **2026-04-19 — 8 open questions to Pedro** gate PRD work: tech stack, storage scope (Personal vs Business), data file format, encryption, OS coverage, language coverage, prototype-as-contract, repo structure approval.
- **Boundary reminder:** tech stack beyond Electron is Neo's ADR, not mine. UI design is Mouse. UX detail is Niobe. I set the "what/why" and the "not now".

### 2026-04-19: Security sign-off complete — ready for PRD milestone planning
ADR-001 Accepted. Security Requirements v0.2. Pedro's six open security questions all closed. Ready for PRD milestone planning.

### 2026-04-19: Roadmap v1 + PRD plan + first three PRDs drafted

- **Roadmap shape:** 5 milestones, 3 gates.
  - **M0 Foundations (S)** — scaffold + crypto module + CI per ADR-002; no user-facing surface.
  - **M1 Single-user happy path (L)** — three prototype screens wired to event-sourced core; single-device first-setup only.
  - **M2 Multi-device shared folder (L)** — enrollment, revocation, audit viewer, snapshots, first-run security wizard (R20), CSV import.
  - **M3 v1 feature parity (M)** — CSV export, global search, i18n EN, dark mode → public release.
  - **M4 v1.x polish (M)** — PDF, Excel, reports, bulk, recurring, reconciliation, attachments.
  - Gates: Internal Alpha after M1, NGO Pilot after M2, v1.0 Public after M3. Each with testable entry criteria.
- **Doc paths:**
  - `docs/product/roadmap-v1.md` (Draft v0.1)
  - `docs/product/prd-plan.md` (Draft v0.1 — 22 PRD reservations, 3 drafted)
  - `docs/product/prds/prd-001-movements.md`, `prd-002-saldo.md`, `prd-003-panel.md` (all Draft)
- **PRD scope calls worth remembering:**
  - **PRD-001 Movements:** empty-on-open is **PR1** (hard requirement per team decision 2026-04-19). Selection UI ships M1, bulk *actions* deferred to M4 (PRD-019). CSV import deferred to M2 (PRD-006); CSV export to M3 (PRD-008). Every mutation writes an audit entry from M1 even though the audit *viewer* ships M2 — data integrity can't be retrofitted.
  - **PRD-002 Saldo:** does NOT inherit empty-on-open (aggregation views can auto-load). Pending txs **included** in totals (PR13) — consistency with Movements paramount. Linear pro-rata projection in M1; sophisticated projection is Later. Drill-through → Movements deferred to v1.x.
  - **PRD-003 Panel:** strict **read-only overview contract (PR7)** — no inline edits on the recent-tx table. No filters (Panel is the "at-a-glance" surface, by design). Sparklines in prototype use fake seeds; M1 ships real monthly-net data.
- **Vision update:** closed Q5 (OS coverage — Windows-first binaries, AR9/AR10) and Q7 (prototype as UX contract — yes) via ADR-001/crypto-spec sign-off. Added forward links to roadmap + prd-plan + three PRDs. Still open: Q2 (OneDrive Personal vs Business), Q6 (language coverage confirmation).
- **Top open questions for Pedro across the PRD set:**
  1. Pilot NGO identity for the M2 gate — who, with a backup plan.
  2. Alpha dogfooder — which squad member commits to 1-week real-data use.
  3. Pending-transaction handling in Saldo/Panel totals (current answer: include).
  4. Default date-range preset on Movements first open (current: no preselection).
  5. i18n EN timing — M3 by default; earlier if pilot NGO is English-speaking.
- **Process note:** created feature branch `docs/roadmap-v1-and-first-prds` BEFORE writing artifacts. Pedro's rule from 2026-04-14 honoured.
- **Boundary respected:** no UI design (Mouse), no UX micro-flows (Niobe — handed off in §8 of each PRD), no implementation details (Neo/Morpheus/Trinity — they spec against these PRDs). PRDs point at but do not duplicate ADR-001 conditions C1–C15 and security R1–R20.

## 2026-04-19 — Team update (via Scribe)
Niobe confirmed the 3 canonical screens match your PRDs 001–003. 12 prototype gaps cataloged. 5 of Niobe's blocker gaps (G1 first-run, G2 enrollment, G4 crypto errors, G5 date-range gate, G6 empty-DB) cross-cut your PRDs — may need PRD updates after Niobe's detailed spec work. G1/G2/G6/G8 each deserve a PRD line item per Niobe's hand-off.

### 2026-04-19 — Pedro resolved Q6/Q7/Q8/Q9/Q10: pilot, dogfooder, no-pending, i18n day-0, OneDrive Business-only

Five product decisions that cascade through roadmap, PRD plan, and the three M1 PRDs. Minimal-touch edits; no scope expansion.

- **Pilot NGO = Rett Spain.** Spanish locale; Pedro is primary contact; no external blocker — pilot can start as soon as M2 ships. Captured on Internal-Alpha/Pilot gate rows of `roadmap-v1.md` §1.
- **Dogfooder = Pedro.** Added as Internal Alpha entry criterion ("Pedro runs the app on real NGO-like data for ≥1 week; zero data-loss incidents"). Roadmap §8 Q1+Q2 now resolved.
- **No pending/draft/future-dated transaction concept.** Pedro was explicit: "all transactions are real and confirmed, coming from bank or paypal statements". This is a structural simplification:
  - PRD-001 PR9 rewritten (was status workflow → now "always confirmed"); S5 scenario replaced (approval→statement-import); PR7/PR8 lose `approve` action; PR11 event list no longer has `tx.approved`; Q4 closed.
  - PRD-002 PR13 rewritten (was "include pending" → now "no pending distinction"); Q1 closed.
  - PRD-003 PR11 rewritten; Q2 closed.
  - Roadmap M1 scope + M1 exit criterion + M3 scope "status workflow polish" + feature map all lose pending→approved phrasing.
  - PRD-plan gained §0.1 Assumptions codifying this so future PRDs inherit it.
- **i18n is day-0 (M0), not M3.** Structural change: framework selected + ES/EN string tables bootstrapped in M0; every feature ships localised from M1; EN+ES are v1.0 ship-blockers. PRD-009 re-scoped from M3 "i18n EN" → M0 "i18n Foundations" (infrastructure PRD owning framework + locale switcher + CI missing-key lint; per-feature coverage stays with each feature PRD). Each of PRD-001/002/003 got a PR19/PR18/PR17 strengthened to require populated ES+EN on ship + locale-aware Intl formatters. Dep graph updated so i18n flows OUT of M0 into M1/M2/M3. Roadmap Q4 resolved. CR6 (i18n drift) rewritten across M1–M3 continuous.
- **OneDrive scope: Business/SharePoint only for v1; Personal deferred to v1.x.** Vision Q2 resolved. Roadmap M0 folder-picker scope now explicitly rejects Personal. Deferred table gained a row for Personal OneDrive with a clear re-entry trigger. PRD-plan Assumptions codify this.

**Pedro's constraints honoured:**
- Minimal-touch edits; no rewrites. Every changed section stays self-coherent.
- Existing content preserved; resolved questions kept visible with "RESOLVED" so traceability is intact.
- Scope not expanded beyond what the 5 answers dictate.
- Trunk-based policy honoured — all edits on `docs/roadmap-v1-and-first-prds`.

**Follow-ups for the team:**
- **Niobe:** the three-screen UX specs she'll draft now have (a) no pending-state affordances to design around, (b) a folder-picker UX that must reject Personal OneDrive with clear copy, (c) every string needs both ES and EN copy at handoff. Prototype contains a "Sin aprobar"/pending pill on Movimientos she should remove in the UX spec.
- **Switch:** folder-picker Business/SharePoint-only decision is a security-adjacent affordance (tenant ACL surface). Worth a note in security-requirements next revision that Personal OneDrive is out-of-scope for v1 threat model.
- **Neo:** i18n framework selection is now an M0 deliverable. Likely candidates: `i18next` + `react-i18next`, or FormatJS/`react-intl`. Needs a lightweight ADR or a spec note before M0 kicks off.


### 2026-04-19: Neo's ADR-002 Accepted
- All 5 repo-structure decisions locked (npm, no monorepo tool, strict TS, flat `app/`, hybrid tests).
- **i18n framework selection is a dependency for your M0 plan** — Neo owes a short ADR/spec note on framework choice before M0 scaffolding.

