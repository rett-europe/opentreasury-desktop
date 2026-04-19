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

## 2026-04-19T16:21:30Z — Panel-First Work Package Decomposition (from Neo)

**Your assignments (awaiting Pedro approval on Q1–Q6):**

| WI | Phase | Owner | Your Role | Est. Days | Gate |
|---|---|---|---|---|---|
| WI-2 | Gate | Morpheus+Trinity | Collab with Morpheus | 1 | IPC round-trip vitest |
| WI-3 | Early | Trinity | Lead | 3–4 | Panel UI with mock IPC calls; before/after vs prototype |
| WI-7 | Polish | Trinity/Mouse | Lead or Mouse | 1–2 | Sparkline component |
| WI-8 | Polish | Trinity/Mouse | Lead or Mouse | 1–2 | 12-month bars chart |
| WI-9 | Polish | Trinity+Niobe | Collab with Niobe | 1 | Empty states |
| WI-10 | Polish | Trinity | Lead | 1 | Loading skeleton polish |

**Next:** Work package merged to .squad/decisions.md. Awaiting Pedro approval on Q1–Q6 before first-wave spawn (Morpheus WI-1, Trinity WI-3, dual WI-2).

**Full summary:** See .squad/decisions.md § Neo — Panel-First Work Package Decomposition (10 WIs, critical path, M1 sequencing locked). Archive: 	rinity-history-archive.md.
