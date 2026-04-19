# Project Context

- **Owner:** Pedro (perocha)
- **Project:** OpenTreasury Desktop — Electron-based treasury management for NGOs. Desktop version of the cloud-based rett-europe/opentreasury, designed to work without complex cloud setup.
- **Stack:** Electron (frontend), rest TBD. Reference app: Angular 19 + Python FastAPI + Cosmos DB + Entra ID on Azure.
- **Created:** 2026-04-19

## Key Reference

Security considerations for Electron desktop treasury app:
- Electron hardening: contextIsolation, nodeIntegration=false, sandbox, CSP
- Local data encryption for financial records
- Auth model for desktop (no Entra ID — local or simplified auth?)
- IPC security between main/renderer processes
- Preload script security boundaries
- Auto-update security (code signing, verified sources)
- Dependency supply chain risks (npm ecosystem)
- OWASP Desktop App Security Top 10

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
