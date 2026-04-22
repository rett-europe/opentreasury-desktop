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
- **2026-04-20:** Error-handling pattern for WI-17 (import) standardized: dry-run errors now report `{ code, raw, offending? }` instead of human-readable strings. Enables i18n, cross-team consistency, and future extensibility. Any future import-related error work (date validation, duplicate handling) should follow the same shape. Trinity localized rendering in ES+EN; Morpheus refactored amount parser with Unicode whitespace stripping (resolved false-positive INVALID_CHARACTERS on bank exports with NBSP variants).
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


### 2026-04-19: react-i18next is the chosen i18n framework. Strings at app/src/renderer/locales/{lang}/common.json. PRD-009 i18n Foundations is now technically underpinned.
### 2026-04-19 — From Scribe: Niobe batch 1 complete
- UX-001 first-run (with Personal-OneDrive rejection state).
- UX-002 enrollment (aligned to crypto-spec §5).
- UX-006 shell (5 global states, locale switcher in topbar). All Draft v0.1.


## Cross-agent update (Scribe, 2026-04-19T10:34:16Z)
UX-003 Q1 (statement-import scope -> UX-016/PRD-006) and UX-005 Q2 (Panel read-only contract: hide 'Nuevo Movimiento' header button in M1) need your call.

- 2026-04-19 — Wave 1 UX unblocked (Draft -> In Review). Switch's ratification complete: docs/security/crypto-error-copy-catalog.md v1.0 closes all crypto-sensitive copy questions across UX-001/002/003/004/005.
- 2026-04-19 — Design system v0.1 visual translation of Wave 1 UX is complete. 5 design docs under docs/design/. Trinity unblocked for implementation.

### 2026-04-19: Cross-agent update from Scribe
PRD-001 (Movements) has a walking skeleton: empty-state-until-date-range, preset chips, sortable table, totals row, mock data (~48 entries Oct 2025 → Apr 2026). Ready for Pedro to click through.

### 2026-04-19: Pending-tone ratification needed on tokens-v0.2 branch

**On branch `fix/mouse-tokens-v0.2` (awaiting merge):**

Mouse completed tokens v0.2 re-extraction from prototype. Conflict flagged for your ratification:
- **v0.1 design system explicitly removed pending tone** ("No pending tone anywhere")
- **Prototype ships pending badges** on Movements estado column (`Pendiente` / `Aprobado`)
- **v0.2 adopts prototype values** per north-star rule (prototype wins; design system is translation layer)

**Your call required:**
- [ ] **Approve:** Prototype wins; estado column ships with pending badges in M1 (requires your + Pedro sign-off per audit §6)
- [ ] **Deviation:** File explicit deviation explaining why prototype's pending badges are omitted

**Mouse's recommendation (in decision doc):** Approve. The estado column is a core data-integrity affordance (pending = not yet bank-reconciled). Removing it would be functional downgrade, not just visual. The v0.1 "no pending" decision was made in design-system vacuum without prototype context.

See `.squad/decisions.md` entry "2026-04-19: Mouse tokens v0.2 — re-extract from prototype" for full rationale + token change summary.

### 2026-04-19: Prototype fidelity audit — PRD-side ownership of the drift
Co-authored `docs/product/prototype-fidelity-audit.md` with Neo after Pedro flagged visual drift in the M1 walking skeleton. ~49 tracked deltas vs the prototype (20 🔴 / 20 🟡 / 9 🟢). Two entire canonical screens (Panel, Saldo) are still `<ComingSoonScreen />` placeholders — they were counted as "scaffold in" but that did not translate to "visually matches prototype". That's on me.

**My product-side ownership of the miss:**
1. **PRDs didn't anchor acceptance criteria to prototype surfaces.** PRD-001/002/003 reference the prototype as "the baseline" in prose but do not cite `prototype/{file}` + `line-range` on each PR-N criterion. When criteria are abstract, implementers fill gaps from the nearest authoritative source — which became the design system, and the design system had already diverged from the prototype.
2. **I didn't enforce a "Prototype Reference" block on UX specs.** Niobe's prototype-analysis treated the prototype as "visual language, not pixel-perfect contract". That framing opened the door. The new governance rule (prototype wins) + a mandatory `## Prototype Reference` header block on every UX spec closes it.

**Committed:**
- Every Wave-1 UX spec (UX-001 through UX-006) gets a Prototype Reference block backfilled this week — file path, component/section, styles.css selectors, and "open alongside HTML" instruction.
- No new PRD ships without a prototype citation on every user-visible PR-N.
- Resolve the six prototype-vs-design-system conflicts this week (§5.1 item 5 of the audit): estado column, pending/approved tone, Exportar header button, category/subcategory column split, ES/EN toggle location, theme toggle location. Each gets an explicit decisions.md entry — either "prototype wins" or "product deviation signed off by Link + Pedro".
- Re-scope PRDs to cover features visible in the prototype but missing from PRDs: "Demo NGO" org-identity label on topbar, global search with ⌘K, sidebar user-strip (reframed to match desktop/no-RBAC model — it's a device identity affordance, not an admin role).

**Gotchas worth carrying:**
- Prototype ships **Pendiente / Aprobado** badges on Movements (`estado` column). Pedro's earlier Q8 decision removed the pending/draft CONCEPT at the data level ("all tx are real and confirmed"), but the design system then removed the **tone** too, which lost the `estado` affordance entirely. The pending/approved column may still exist as a **statement-import reconciliation state** (matched vs unmatched) — need to reconcile with Pedro. Don't assume design-system decisions obsolete prototype UI without a logged decision.
- Prototype's sidebar has **8 nav items** across **3 sections** (Principal/Configuración/Datos). Our shell ships 3. M1 PRD scope covers 3 screens — but the **nav chrome** needs all 8 (disabled for M2+ routes) to match the prototype.
- Prototype uses **Inter** via Google Fonts; design system chose OS system fonts for offline-first. Needs resolution — locally bundle Inter vs keep OS stack. I'm leaning "bundle Inter" because fidelity > trivial binary-size win.
- Prototype has no first-run, no enrollment, no crypto-error states — those screens **must** be authored from scratch against the prototype's *visual language* (our job: apply the same tokens/components, not draw new ones).

**Not reopening M1 scope.** What changes is **how** features look + behave, not which features ship. Sequencing preserved: tokens-v0.2 lands first (Mouse), then Trinity re-shells + builds Panel + Saldo. Items 1–5 of §5 this week; items 6–11 next week.

**Rule of thumb for future PRDs:** If a PR-N bullet does not cite a specific `prototype/{file}:section` or a logged deviation decision, the PRD is incomplete.

### 2026-04-19 — From Scribe: Trinity CSS sticky-scroll fix deployed
Trinity fixed the visual regression on Movimientos (rows rendering above sticky header during scroll). Root cause: padded scroll container. Fix: structural (moved top gutter from scroll container to page-header). All gates green; skills doc updated. Contract recorded: every future screen must start with a top-gutter element, or it renders flush against the topbar. Visual behavior unchanged for end user; this is a maintenance win for future sticky work.

## 2026-04-19 — Product recommendation: "Panel-first" unlock for M1 completion path

**State snapshot:** Movements is ~70% UI-complete (sticky header ✅, table structure ✅, empty-state gate ✅, date picker scaffold ✅, mock data render ✅, sort ✅). Panel and Saldo remain as `<ComingSoonScreen />` placeholders. M1 exit criterion is "core treasury loop end-to-end: create account → enter tx → categorize → see on Panel/Movements/Saldo". Movements is unblocked for wiring to the event-sourced core; Panel and Saldo are still blocked on UI. Trinity's sticky-header parity pass proves the team can unblock screens fast once the structure is right.

**Top 3 candidates for next product milestone:**

1. **Complete Movements UI wiring (core M1 path)** — remaining work: (a) wire date-range selection to mock/real data, (b) build account/category CRUD forms, (c) build tag picker, (d) set up two-way binding to event core. **Why now:** Movements is closest to done; it's the primary transaction surface; wiring it unblocks the internal alpha and reveals event-sourcing friction early. **User value:** The treasurer can actually record a donation or expense. **Risk:** Low — Trinity + Morpheus have already shaped the UI contract.

2. **"Panel-first" unblock (user-perceived value accelerator)** — shift UX work to Panel (the at-a-glance dashboard); finish sticky/scroll, render recent-tx table, wire sparklines to real data. Skip Saldo temporarily. **Why now:** Panel is the treasurer's first impression — it signals "this works" faster than a filtered transaction list. Prototype Panel code is cleaner (fewer columns). Panel has no empty-state gate (it can auto-load). **User value:** Non-technical treasurers see "aha, my balance is here" on first open, even if Movements is sparse. **Trade:** Saldo ships M1+0.5 instead of M1, but we still gate alpha-go on "core loop" (which now means Account→Tx→Panel visibility, not Saldo). Saldo is lower-touch once Panel is done.

3. **Saldo + Movements in parallel (high-touch, lower velocity)** — both teams work both screens; collision risk on event-core wiring; longer M1. **Why not now:** Trinity is the bottleneck for UI structure. Movements + Panel can each own a trinity sprint. Saldo is lower priority in the treasurer's workflow (balance drill-down matters less than recording + dashboard summary). Velocity < 2.

**My recommendation: Candidate 2 — "Panel-first unlock"**

**Rationale:**
- **Why Panel first, not Movements:** Movements is technically complete but conceptually complex (empty-state discipline, date-range logic, sort persistence). Panel is simpler (no gate, no filters, no sort — just recent txs + sparklines + totals), so it's a faster confidence-builder for "real data flowing through the core". Ship Panel, unblock internal alpha early, let the team dogfood while Movements gets final wiring. Parallel work de-risks both.
- **Scope discipline:** Don't pull Saldo into M1-final. It's a "second view" for power treasurers. The core loop is "I see my balance + recent activity on Panel, I manage details on Movements". Saldo is M1.25 — it ships within days of Panel but not on the critical path to alpha.
- **Why it matters to *users*:** The prototype showed dashboard-first (Panel) as the landing experience. That's the right UX for a non-technical treasurer — show me the summary before you ask me to filter. Our M1 wiring should match that.
- **Unblocks:** (a) Niobe can finish Panel UX spec while Trinity finishes Movements structure. (b) Internal alpha test can validate "real data → encrypted event → read model → live UI" on the simplest screen first (Panel has no interactivity to block on). (c) Movements full wiring slides into early M2 if needed without blocking the alpha gate.

**Action for Neo/Trinity/Morpheus:** Take Movements UI + Panel UX spec → Panel implementation sprint (3–5 days). Movements full core-wiring follows. This keeps M1 on track, ships alpha sooner, and proves the event-sourced core before we attempt the harder multi-device merge in M2.


- **2026-04-21 — WI-21 recommendation:** After PR#3 shipped the Config screens renovation, the biggest product hole is that Cuentas/Categorías/Etiquetas are read+create only — no Edit, no Delete, no subcategories. Recommended WI-21 `Config CRUD Completion`: Morpheus owns the missing `*.updated` / `*.deleted` events (account, category, subcategory x4, tag) + IPC handlers; Trinity wires the edit/delete modals into the already-built screens; Switch reviews delete-cascade semantics. Explicitly OUT: usage counts (still blocked by configAccount↔tx accountId decoupling — needs its own WI), bulk ops, CSV export. Alternatives offered: Saldo screen implementation (still placeholder), bulk ops on Movements (Pedro flagged must-have 2026-04-19), or the configAccount id reconciliation that unblocks usage counts. Picked CRUD because it finishes the slice Pedro just opened rather than starting a new surface.

### 2026-04-22 — WI-22 recommendation: Saldo screen (M1 closer)

With WI-21 merged (PR #4, edae3e8), only one M1 exit-criterion surface remains unshipped: **Saldo**. All three canonical screens (Panel, Movements, Saldo) are a roadmap commitment and Saldo is still `<ComingSoonScreen />`. Recommended **WI-22 = Saldo** (PRD-002 + UX-004 already Accepted; no new event catalog; pure read-model work). Shipping it flips the Internal Alpha gate open and closes the M1 row.

**Candidates ranked:**
1. 🥇 WI-22 Saldo — user-facing, closes M1, all specs ready.
2. 🥈 WI-23 configAccount/tx id unification — unblocks usage counts + hard-delete, but low user visibility; sequence after Saldo so Internal Alpha ships with visible value.
3. 🥉 WI-24 Global search (⌘K) — prototype parity, but roadmap-slotted for M3; defer.

**Pre-WI-22 polish pass (≤ half day):** Movements table horizontal scroll ~1350px (same table primitive Saldo will reuse), TransactionDetailModal date/locale polish (Intl formatting Saldo leans on), and the Pedro-deferred "header situation" (needs one-line clarification before I can route it). **Rolled INTO WI-22:** Intl formatter scaffolding, period-selector primitive. **Explicitly NOT in polish:** hard-delete and usage counts (blocked on WI-23).

**Rationale for sequencing user-facing before platform:** Internal Alpha gate is a confidence moment; Pedro is the dogfooder; Saldo is the board-meeting surface treasurers ask for. Config plumbing cleanup can happen next with zero visible regression. Kept scope honest — resisted bundling bulk actions, CSV export, or global search into the Saldo slice.

Recommendation written to `.squad/decisions/inbox/link-next-wi-recommendation.md`.
