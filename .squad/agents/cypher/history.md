# Project Context

- **Owner:** Pedro (perocha)
- **Project:** OpenTreasury Desktop — Electron-based treasury management for NGOs. Desktop version of the cloud-based rett-europe/opentreasury, designed to work without complex cloud setup.
- **Stack:** Electron (frontend), rest TBD. Reference app: Angular 19 + Python FastAPI + Cosmos DB + Entra ID on Azure.
- **Created:** 2026-04-19

## Key Reference

Testing considerations for a financial desktop app:
- Financial rounding and precision (currency amounts)
- Date boundary handling (month transitions, year-end)
- Import/export data fidelity (Excel/CSV round-trips)
- Concurrent access patterns (if multi-window)
- Data integrity under crash scenarios (local DB)
- RBAC enforcement (Admin vs Viewer)
- Audit trail completeness

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
