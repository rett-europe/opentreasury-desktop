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
npm install --legacy-peer-deps   # required: ESLint v8 / @typescript-eslint v7 peer conflict
npm run typecheck   # TS compiles across the main / preload / renderer / core / crypto / storage split
npm run lint        # ESLint — module boundaries enforced (ADR-002 §4.1)
npm run test        # Vitest — unit tests co-located with source
npm run dev         # Vite renderer dev server (Electron wiring lands in a follow-up PR)
```

## Running the app (dev)

Wave 1 ships a browser-only renderer preview. Electron main-process wiring (window creation,
preload bridge, packaging) lands in a follow-up PR per ADR-002 §11.

```bash
npm run dev
# → open http://localhost:5173
```

What you can click in the current build:

- **Movements screen** (primary) — select a date range (preset chips: _This month_, _Last 30 days_,
  _YTD_ — or a custom from/to). Mock data loads with a 200ms delay and renders a sortable table
  (Date · Description · Account · Category · Amount) plus a totals strip (Income · Expense · Net · count).
- **Panel** and **Saldo** — placeholder "Coming soon" screens; nav shell is real.
- **Top-bar language switcher** — Español ↔ English (ES is primary per ADR-003).
- **Top-bar theme toggle** — System → Light → Dark, persisted to `localStorage` as a v0.1 stand-in
  for the main-process user-prefs bridge.

Data is 100% mock at this point — no OneDrive, no crypto, no storage. The crypto and storage layers
(`app/src/crypto`, `app/src/storage`) are scaffolded but not yet wired into the renderer.

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
