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

## 2026-04-19 — Team Context Update (from Scribe)
- ADR-001 (Proposed) at `docs/architecture/adr-001-tech-stack.md` — Neo recommends Option A (React+TS, append-only event-sourced JSON, `age` encryption).
- Security Requirements v0.1 at `docs/security/security-requirements-v0.1.md` — Switch: 20 requirements, 15 stack constraints, 8 accepted risks, 6 open questions for Pedro.
- Both are team context now.

### 2026-04-19: ADR-001 Accepted — UX constraints locked
ADR-001 is Accepted. Implementation constraints locked: no passphrase UI in v1 (OS keychain handles it silently); device enrollment needs a QR-code / 6-char visual-code pairing UX flow. Consider UX implications in upcoming specs.

## 2026-04-19 — Team update (via Scribe)
Niobe's UX baseline and flows published under docs/ux/. Your visual design work follows her flows, NOT the prototype's pixels. Three flow skeletons (first-run, device-enrollment, movements-date-range) are your anchor points. Niobe also flagged design needs: visual tokens extraction, sync indicator, error severity, admin-only affordances, date-range picker, focus states.
