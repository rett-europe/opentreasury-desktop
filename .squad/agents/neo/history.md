# Project Context

- **Owner:** Pedro (perocha)
- **Project:** OpenTreasury Desktop — Electron-based treasury management for NGOs. Desktop version of the cloud-based rett-europe/opentreasury, designed to work without complex cloud setup.
- **Stack:** Electron (frontend), rest TBD. Reference app: Angular 19 + Python FastAPI + Cosmos DB + Entra ID on Azure.
- **Created:** 2026-04-19

## Key Reference

The cloud version (rett-europe/opentreasury) features:
- Transaction management with categories, subcategories, and tags
- Multi-account support (bank accounts + PayPal)
- Excel/CSV import from bank exports, Excel export for accounting
- Dashboard with account balances and monthly summary
- RBAC (Admin / Viewer)
- Audit trail, soft deletes
- Multi-language support (Spanish + English)

The desktop version aims to replicate this functionality without requiring Azure infrastructure.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

## 2026-04-19 — WI-15/16 scope finalized (Configuración + Datos deep-dive from web reference)

Completed comprehensive scope inventory of rett-europe/opentreasury (web reference app). 
Mapped Accounts/Categories/Subcategories/Tags CRUD, Import (3-step wizard, alias-based column mapping, 
hash-based dedup, partial-success model, category auto-creation with type guessing + override), 
Export (XLSX only, date-range + optional filters). Event model additions defined (10 new event types: 
account.*, category.*, subcategory.*, tag.*, import.*). Work packages WI-15 (10–12d), WI-16 (12–14d), 
WI-17 (5–6d integration + polish). Six blocking open questions for Pedro (event-sourced config vs 
separate store, multi-currency, bank parsers, category type mutability, import rollback, export format). 
v1-minimal slice (WI-15-lite, create-only for accounts/categories/tags) proposed as separate 3–4d 
milestone if Pedro prefers faster proof-of-concept before full CRUD.



**Context:** Scoped CONFIGURACIÓN + DATOS work packages by studying `rett-europe/opentreasury` (Angular 19 + Python FastAPI web reference).

**Import flow insight:**
The web app's bank statement import (XLSX/CSV → transactions) has **three complexity centers** that desktop must replicate:

1. **Column alias detection** — hardcoded bank-specific logic (`/api/app/constants/import_constants.py`). Parser normalizes headers (lowercase, strip accents), then checks aliases: `"FECHA": ["fecha", "f. valor", "date"]`, `"IMPORTE": ["importe", "amount", "cargo", "abono"]`, etc. **No user-configurable mapping UI** — parser either auto-detects or fails with "Missing required columns" error. This simplifies UX but breaks if banks change formats.

2. **Duplicate detection** — hash-based idempotency. For each row, compute `md5(accountId + date + amount + description)` → stored as `source_reference`. Before insert, query for existing txn with same hash; if found, skip. **No external bank transaction ID** used — hash is the only de-dup mechanism. Edge case: if same real-world transaction appears in two files with different descriptions (bank truncates), hash won't match → duplicate inserted.

3. **Category auto-creation** — parser extracts unique (category, subcategory) pairs from import file, compares against existing categories by name (case-insensitive). If not found, creates new category with type guessed from keywords ("Cuota", "Donación" → income; "Gasto", "Alquiler" → expense) OR user override via `categoryTypeOverrides` metadata. **User override is critical** — without it, imports fail or create wrong-type categories when parser guesses incorrectly.

**Partial success model works well:** Web app commits valid rows, skips malformed rows (invalid date/amount), returns warnings array. User can fix errors in subsequent import (duplicates auto-skipped via hash). This is better UX than atomic rollback.

**Desktop implication:** Replicate all three mechanisms in `app/src/main/services/import-parser.ts`. Use same alias lookup (port Python constants to TS). Use same hash logic for `source_reference`. Support category type overrides in import wizard Step 2. Accept partial success (warnings array).

**Reusable pattern — "mirroring a web reference repo into desktop twin":**
1. API endpoints → command surface (each POST/PUT/DELETE = one command that appends event).
2. Service layer → business logic (port validation rules: IBAN format, soft-delete protection, txn count checks).
3. Frontend components → UI patterns (modal dialogs, inline toggles, confirmation dialogs map cleanly from Angular to React).
4. **Do NOT port database layer** — web uses Cosmos DB (document store); desktop uses event log + in-memory projections. Schema conversion required (e.g., web stores `is_deleted: bool` on document; desktop appends `AccountDeleted` event).

**Artifact:** `.squad/decisions/inbox/neo-wi15-configuracion-datos-scope.md` (21-day work package plan, 6 open questions for Pedro).

## 2026-04-19T18:56:23Z — WI-12 landed: E2E IPC bridge unlocks M1.5 demo path

**Status:** IPC contract finalized by Morpheus + Trinity, unblocking WI-13 + WI-14.

Morpheus + Trinity completed WI-12 (transaction:create + movements:list IPC bridge). Main-side handlers + renderer clients are production-ready. Contract is locked — no changes until Panel invalidation event bus (WI-14). M1.5 critical path now proven viable: WI-4′ (event log) + WI-11 (command) + WI-12 (IPC) complete; WI-13 (Add-Transaction modal) + WI-14 (Panel invalidation) ready to spawn. ETA: 2–3 days to "add transaction → see it live" demo.

## 2026-04-19 — M1.5 Vertical Slice Re-sequencing

**Trigger:** Pedro asked when we'd have an end-to-end "add a transaction, see it reflected" scenario.

**Call:** Re-sequenced M1. OneDrive (WI-4) + crypto (WI-5) deferred to M2. Inserted **WI-4′ (local-JSON event log, dev-only)**, **WI-11 (createTransaction command + projection)**, **WI-12 (movements IPC contract)**, **WI-13 (Add-Transaction modal + Movements real wiring)**, **WI-14 (Panel invalidation)**. Critical path: WI-4′ → WI-11 → WI-12 → WI-13 → WI-14. ETA 4–6 days to M1.5 demo.

**Storage-fallback recommendation:** ship local-JSON append-only log now behind the same `EventLog` interface WI-4 will later implement against OneDrive. Storage is a swappable adapter; no core/UI work is thrown away when OneDrive lands in M2.

**Rationale:** Pedro's stated preference is shipping working software fast. OneDrive+crypto = 6–8 days gated on Switch; local JSON = <1 day and unblocks the full event-sourcing loop end-to-end. The event-sourced architecture (ADR-001 Option A) is preserved exactly — only the byte-persistence layer is a dev stub.

**Owners for first wave:** Morpheus (WI-4′, WI-11, WI-12 main side), Trinity (WI-12 client, WI-13, WI-14).

**Artifact:** `.squad/decisions/inbox/neo-e2e-vertical-slice-plan.md`.

## 2026-04-19T16:21:30Z — Panel-First Work Package Decomposition

**Status:** Proposed — awaiting Pedro go/no-go on Q1–Q6 before first-wave spawn.

**Deliverable:** 10 concrete work items (WI-1 through WI-10) with owners, acceptance criteria, dependency graph, and 12–15 day ETA.

**Critical Path:** WI-1→WI-2→WI-3+(WI-4→WI-5)→WI-6→polish.

**First Wave (day 1 parallel, after Pedro approval):**
- WI-1: Morpheus (core read queries)
- WI-3: Trinity (Panel UI with mock IPC)
- WI-2: Morpheus+Trinity (IPC contract, after WI-1 stabilizes)

**M1 Panel Alpha Gate:** ~Day 10 (WI-6 lands, real data flows).

**Six Open Questions:** See .squad/decisions.md § Neo — Panel-First Work Package Decomposition (Q1–Q6 with recommendations on all six).

**Archive:** 
eo-history-archive.md (ADR-001/002/003, prototype authority, tech stack rationale).
