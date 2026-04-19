# Project Context

- **Owner:** Pedro (perocha)
- **Project:** OpenTreasury Desktop — Electron-based treasury management for NGOs. Desktop version of the cloud-based rett-europe/opentreasury, designed to work without complex cloud setup.
- **Stack:** Electron (frontend), rest TBD. Reference app: Angular 19 + Python FastAPI + Cosmos DB + Entra ID on Azure.
- **Created:** 2026-04-19

## Key Reference

Design context:
- Cloud version uses Angular Material as component library
- Target audience: NGO administrative staff (clarity over aesthetics)
- Desktop app context: larger screens, keyboard + mouse primary input
- Existing prototype in `/prototype/` uses oklch color space, modern CSS
- Multi-language support needed (Spanish + English) — affects layout
- Financial data display: tables, numbers, currency formatting
- Dashboard: balance cards, monthly charts

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
