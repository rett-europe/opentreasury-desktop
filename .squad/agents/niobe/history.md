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
