# opentreasury-desktop

Zero-infrastructure treasury app for small NGOs. **OneDrive is the database.** No Azure, no backend,
no custom auth. Built on Electron + React + TypeScript, with event-sourced data at rest encrypted
per NGO dataset.

See [`docs/product/vision.md`](./docs/product/vision.md) for the product bet, and
[`docs/architecture/`](./docs/architecture/) for the architectural decisions (ADR-001 tech stack,
ADR-002 repo structure, ADR-003 i18n framework).

## Getting started

> Prerequisites: Node.js ≥20, npm ≥10, a POSIX shell or PowerShell.

```bash
git clone https://github.com/<org>/opentreasury-desktop.git
cd opentreasury-desktop
npm install
npm run typecheck   # TS compiles across the main / preload / renderer / core / crypto / storage split
npm run lint        # ESLint — module boundaries enforced (ADR-002 §4.1)
npm run test        # Vitest — unit tests co-located with source
npm run dev         # Vite renderer dev server (Electron wiring lands in a follow-up PR)
```

## Documentation

| Area                                | Where                                        |
| ----------------------------------- | -------------------------------------------- |
| Product vision, PRDs, roadmap       | [`docs/product/`](./docs/product/)           |
| Architecture decisions (ADRs)       | [`docs/architecture/`](./docs/architecture/) |
| Security requirements + crypto spec | [`docs/security/`](./docs/security/)         |
| User flows, wireframes              | [`docs/ux/`](./docs/ux/)                     |
| Visual design, tokens               | [`docs/design/`](./docs/design/)             |
| Feature technical specs             | [`docs/specs/`](./docs/specs/)               |

## Contributing

All features go through the Spec-Driven Development flow documented in
[`docs/specs/README.md`](./docs/specs/README.md). Every PR references its paired spec.
Security-touching changes require Switch (Security Engineer) sign-off — non-negotiable.

Branch discipline: trunk-based. All work lands on `feat/*`, `fix/*`, `docs/*`, `chore/*`, or `sec/*`
branches via PR; `main` is protected.
