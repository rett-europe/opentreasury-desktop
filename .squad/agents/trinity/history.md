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

## 2026-04-19 — WI-3: Panel IPC wiring complete

**Pattern: Skeleton→Loaded transition**  
Panel fires all 5 IPC queries in parallel on mount (Promise.all), shows skeleton shells while loading, then swaps to loaded state with zero layout shift. Skeleton dimensions match final component heights. Key: keep skeleton *visual* (don't expose "Loading..." text that screen readers announce repeatedly during query resolution).

**Pattern: IPC client with Zod parse-on-receive**  
panelApi.ts wraps each IPC call and parses the response with Morpheus's Zod schema. This catches main-process drift at the IPC boundary before bad data reaches the UI. Main and renderer stay in sync via shared contract (shared/ipc-contracts/panel.ts).

**Coordination issue: Schema drift**  
Morpheus's contract (ankNameShort, ccountLabel, 
et, yearMonth) differs from Neo's WI-2 spec (shortName, alance, month). Adapted Panel to Morpheus's shape. Real-world lesson: contracts need early alignment or a canonical source (in our case, Morpheus owns the contract since he's building the query layer).

**TypeScript project references**  
Renderer needed "references": [{ "path": "../shared" }] in 	sconfig.json to import from shared/ipc-contracts. Also made shared/tsconfig.json composite. Main already had this; renderer was missing it.

**i18n ICU plurals**  
Account card uses 	('panel.card.count', { count: N }) with ICU plural rules: {count, plural, one {# movimiento} other {# movimientos}}. Works in both ES and EN.

**Signed balance coloring**  
AccountCard applies .ot-account-card__balance--negative class when alance < 0. CSS uses ar(--color-expense-default) for negative, ar(--color-income-default) for positive. Keep sign display (signDisplay: 'auto' in Intl formatter) so minus prefix always shows.

**Reusable components**  
AccountCard and KPIStrip are isolated primitives — no Panel-specific logic inside them. They accept props and render. This means Saldo can reuse KPIStrip if needed (different month aggregation), and AccountCard could appear in an account-management screen later.

**Test setup quirk**  
i18n import must be import { i18n } from '../../i18n/index.js' (named export), not import i18n from ... (default export). The i18n module re-exports the i18next instance as a named export.

