# Project Context

- **Owner:** Pedro (perocha)
- **Project:** OpenTreasury Desktop — Electron-based treasury management for NGOs. Desktop version of the cloud-based rett-europe/opentreasury, designed to work without complex cloud setup.
- **Stack:** Electron (frontend), rest TBD. Reference app: Angular 19 + Python FastAPI + Cosmos DB + Entra ID on Azure.
- **Created:** 2026-04-19

## Key Reference

The cloud version has an Angular 19 frontend with:
- Transaction list with filters (account, date range, category, tag, text search)
- Transaction entry form with "Save & New" fast-entry flow
- Category/subcategory management screens
- Tag and bank account management
- Dashboard with balance cards and monthly summary chart
- Excel import wizard, Excel export
- Multi-language (Spanish + English)
- MSAL-based authentication with Entra ID

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

## 2026-04-19 — Team Context Update (from Scribe)
- ADR-001 (Proposed) at `docs/architecture/adr-001-tech-stack.md` — Neo recommends Option A (React+TS, append-only event-sourced JSON, `age` encryption).
- Security Requirements v0.1 at `docs/security/security-requirements-v0.1.md` — Switch: 20 requirements, 15 stack constraints, 8 accepted risks, 6 open questions for Pedro.
- Both are team context now.

### 2026-04-19: Crypto spec v1.0 + ADR-001 Accepted
Crypto spec v1.0 at `docs/security/crypto-spec.md`. Security Requirements bumped to v0.2. ADR-001 Accepted with conditions C1–C15. Every implementation ticket must cite the C1–C15 condition(s) it satisfies.
