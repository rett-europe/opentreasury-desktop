# Project Context

- **Owner:** Pedro (perocha)
- **Project:** OpenTreasury Desktop — Electron-based treasury management for NGOs. Desktop version of the cloud-based rett-europe/opentreasury, designed to work without complex cloud setup.
- **Stack:** Electron (frontend), rest TBD. Reference app: Angular 19 + Python FastAPI + Cosmos DB + Entra ID on Azure.
- **Created:** 2026-04-19

## Key Reference

The cloud version's backend (Python FastAPI) features:
- Cosmos DB NoSQL containers: transactions (partitioned by YYYY-MM), categories, reference_data (tags + bank accounts), audit_log
- RBAC: Admin (full read/write), Viewer (read-only)
- Soft deletes — financial data never permanently lost
- Audit trail on all changes (7-year TTL in cloud)
- Excel/CSV import and export endpoints
- Transaction CRUD with category/subcategory/tag associations
- Multi-account support

The desktop version needs equivalent functionality with local persistence (no cloud DB).

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
