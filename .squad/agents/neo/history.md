# Project Context

- **Owner:** Pedro (perocha)
- **Project:** OpenTreasury Desktop — Electron-based treasury management for NGOs. Desktop version of the cloud-based rett-europe/opentreasury, designed to work without complex cloud setup.
- **Stack:** Electron (frontend), rest TBD. Reference app: Angular 19 + Python FastAPI + Cosmos DB + Entra ID on Azure.
- **Created:** 2026-04-19

## Key Reference

The cloud version (rett-europe/opentreasury) features:
- Transaction management with categories, subcategories, and tags
- Multi-account support (bank accounts + PayPal)
- Excel/CSV import from bank exports, Excel export for accounting
- Dashboard with account balances and monthly summary
- RBAC (Admin / Viewer)
- Audit trail, soft deletes
- Multi-language support (Spanish + English)

The desktop version aims to replicate this functionality without requiring Azure infrastructure.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

## 2026-04-19T16:21:30Z — Panel-First Work Package Decomposition

**Status:** Proposed — awaiting Pedro go/no-go on Q1–Q6 before first-wave spawn.

**Deliverable:** 10 concrete work items (WI-1 through WI-10) with owners, acceptance criteria, dependency graph, and 12–15 day ETA.

**Critical Path:** WI-1→WI-2→WI-3+(WI-4→WI-5)→WI-6→polish.

**First Wave (day 1 parallel, after Pedro approval):**
- WI-1: Morpheus (core read queries)
- WI-3: Trinity (Panel UI with mock IPC)
- WI-2: Morpheus+Trinity (IPC contract, after WI-1 stabilizes)

**M1 Panel Alpha Gate:** ~Day 10 (WI-6 lands, real data flows).

**Six Open Questions:** See .squad/decisions.md § Neo — Panel-First Work Package Decomposition (Q1–Q6 with recommendations on all six).

**Archive:** 
eo-history-archive.md (ADR-001/002/003, prototype authority, tech stack rationale).
