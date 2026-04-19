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
- **2026-04-19 — Vision v0.1 written** at `docs/product/vision.md`. Core framing: OneDrive/SharePoint folder IS the database AND the access control layer. No backend server, no custom auth, no RBAC.
- **2026-04-19 — Scope discipline:** v1 covers accounts, transactions, categories, tags, dashboard (Panel), balance (Saldo), transaction list with filters, CSV import, CSV export, status workflow (pending→approved), search, local audit log, i18n ES+EN, dark mode. PDF/Excel export + reports module + bulk ops + recurring tx → v1.x. Budgets/forecasts/multi-currency/bank feeds → later.
- **2026-04-19 — Cloud features explicitly NOT ported:** Entra ID, RBAC, FastAPI backend, Cosmos DB, multi-tenant, CI/CD to Azure. These are solved by the desktop+folder model.
- **2026-04-19 — Prototype anchors the v1 UX.** The existing `prototype/` (Panel/Movimientos/Saldo in Spanish) is the reference; Mouse/Niobe should refine, not reinvent (pending Pedro confirmation — Q7).
- **2026-04-19 — Spec-driven operating model:** PRDs in `docs/product/prds/`, tech specs in `docs/specs/`, ADRs in `docs/architecture/`, UX specs in `docs/ux/`, security specs in `docs/security/`. Mirrors cloud repo's discipline.
- **2026-04-19 — Success metrics avoid cloud telemetry** — no DAU/MAU/retention pipeline. Use: time-to-first-tx ≤10min, setup success ≥90%, zero data-loss, ≥95% auto-resolved conflicts, ≥80% parity coverage.
- **2026-04-19 — Top 3 risks flagged to Neo/Switch:** OneDrive concurrency/conflicts (🔴), file corruption (🔴), encryption-vs-search trade-off (🔴, Switch final say).
- **2026-04-19 — 8 open questions to Pedro** gate PRD work: tech stack, storage scope (Personal vs Business), data file format, encryption, OS coverage, language coverage, prototype-as-contract, repo structure approval.
- **Boundary reminder:** tech stack beyond Electron is Neo's ADR, not mine. UI design is Mouse. UX detail is Niobe. I set the "what/why" and the "not now".
