# opentreasury-desktop

Zero-infrastructure treasury app for small NGOs. **OneDrive is the database.** No Azure, no backend,
no custom auth. Built on Electron + React + TypeScript, with event-sourced data at rest encrypted
per NGO dataset.

## How it works

The app is **event-sourced**: all state (transactions, accounts, categories, tags, notes, splits) is persisted as an append-only log of immutable domain events in NDJSON format. On boot, events are replayed to hydrate an in-memory read model. The event log lives in a user-selected folder (OneDrive, SharePoint, or local disk) — no backend server or database needed. See [`docs/architecture/event-model.md`](./docs/architecture/event-model.md) for the event catalog and [`docs/architecture/dataset-and-storage.md`](./docs/architecture/dataset-and-storage.md) for dataset switching and multi-user workflows.

For the product bet and architectural decisions (tech stack, repo structure, i18n), see [`docs/product/vision.md`](./docs/product/vision.md) and [`docs/architecture/`](./docs/architecture/).

## Getting started

> Prerequisites: Node.js ≥20, npm ≥10, a POSIX shell or PowerShell.

```bash
git clone https://github.com/<org>/opentreasury-desktop.git
cd opentreasury-desktop
npm install --legacy-peer-deps   # required: ESLint v8 / @typescript-eslint v7 peer conflict
npm run typecheck   # TS compiles across the main / preload / renderer / core / crypto / storage split
npm run lint        # ESLint — module boundaries enforced (ADR-002 §4.1)
npm run test        # Vitest — unit tests co-located with source
npm run dev         # Vite renderer dev server (Electron app boots against it)
```

## Running the app (dev)

`npm run dev` starts the Vite renderer dev server; the Electron app (main process,
preload bridge, encrypted storage) boots against it. Packaged builds are produced with
`npm run package` (electron-builder).

```bash
npm run dev
# Electron launches against the dev server (renderer also viewable at http://localhost:5173)
```

### Dev modes: demo vs dogfood

`npm run dev` starts with a demo seed (prototype-shaped accounts + 2025/2026 transactions) so the
screens render real-looking data. For **dogfooding** — starting empty and entering
your own data manually — use the dogfood scripts:

| Command             | Data folder (`%APPDATA%\opentreasury\…`) | Seed? |
| ------------------- | ---------------------------------------- | ----- |
| `npm run dev`       | `dev-events\`                            | yes   |
| `npm run dev:empty` | `my-data\`                               | no    |
| `npm run dev:reset` | (wipes `my-data\`)                       | —     |

The two folders are isolated — you can switch between demo and dogfood modes without losing either
dataset. Under the hood: `OT_SEED=none` suppresses the seed, `OT_DATA_DIR=<name>` picks the folder.

### What the current build ships (v1.0.0)

- **Encrypted workspace + 12-word recovery** — XChaCha20-Poly1305 at rest; first-run setup
  (folder → recovery code → confirm) and silent daily unlock; device enrollment via the recovery
  code (SPEC-026).
- **Panel / Dashboard** — account balances, 12-month balance history, and activity overview.
- **Add Transaction** — manual entry with accounts, categories/subcategories, tags, and splits.
- **Saldo** — category/subcategory balances with drilldown.
- **Movements** — transaction list with date-range presets, filtering, splits, labels, bulk
  actions, and free-text search (Ctrl/Cmd+K).
- **Insights** — period selector with donut/bar breakdowns and category drilldowns.
- **Financial Report** — printable annual or custom-period financial statements with
  reconciliation and signature blocks.
- **Export** — dedicated `/export` screen for filtered CSV/Excel output (account, category,
  date range, label); date-range-plus-one-filter gate, `;` CSV delimiter, locale-aware
  formatting, and a typed-confirmation authorization gate; the encrypted dataset never leaves
  the main process in plaintext (SPEC-027).
- **Settings** — data-folder location, read-only mode, theme, and a merged "Language & format"
  card (language, date format, number format).
- **Audit & Evidence** — change history and signed audit records, backed by a tamper-evident,
  hash-chained log verified on unlock (fail-closed → recovery) with external RFC-3161
  timestamping.
- **Local MCP server** — opt-in read tools and separately gated transaction write tools for
  connected agents.

Data is persisted as encrypted event-log files in the chosen data folder (OneDrive/SharePoint or
local disk) — no backend server or database.

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
