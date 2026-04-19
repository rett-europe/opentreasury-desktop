# WI-1 + WI-2 Complete: Event-sourced read model + IPC contract

**Date:** 2026-04-19T18:40Z  
**By:** Morpheus (Backend Dev)  
**Branch:** `feat/panel-first`  
**Commits:** `0f427fe`

## What landed

### WI-1: Event-sourced read-side (core/events + core/query)
- **Event schemas** (`app/src/core/events/schemas.ts`):
  - Zod schemas for: `tx.created`, `account.created`, `category.created`, `tag.created`
  - Event envelope: id, type, datasetId, actorDeviceId, createdAt, dekVersion, version, payload
  - All IDs validated as 26-char ULIDs (per crypto-spec §11)
- **Entity types** (`app/src/core/query/types.ts`):
  - Transaction, Account, Category, Subcategory, Tag
  - Mirrored cloud opentreasury schema shapes (camelCase, simplified for M1)
- **Reducers** (`app/src/core/query/reducers.ts`):
  - In-memory read model (no SQLite yet — deferred to WI-4)
  - `applyEvent()`, `replayEvents()`, `resetReadModel()`, `getReadModel()`
  - Immutable state updates, pure functions
- **Query functions** (`app/src/core/query/queries.ts`):
  1. `queryRecentTransactions(limit)` — sorted DESC by createdAt
  2. `getAccountBalances()` — aggregate income/expense/net per account
  3. `getMonthKPIs(yearMonth)` — month-level KPIs (YYYY-MM filter)
  4. `getAccountSparklines(accountId)` — 12-month net buckets
  5. `getAccounts()` — sorted by sortOrder + accountLabel
- **Tests** (`app/src/core/query/queries.test.ts`):
  - Vitest 100% coverage: event validation, reducers, all 5 queries
  - Fixtures with realistic ULIDs, happy-path scenarios

### WI-2: IPC contract with mock handlers
- **IPC contract** (`app/src/shared/ipc-contracts/panel.ts`):
  - Zod request/response schemas for all 5 queries
  - Channel constants: `IPC_PANEL_GET_ACCOUNTS`, `IPC_PANEL_GET_ACCOUNT_BALANCES`, etc.
  - TypeScript types exported (Trinity can import immediately)
  - PascalCase schema aliases for Trinity's existing code (legacy compatibility)
- **Mock handlers** (`app/src/main/ipc/handlers/panel.ts`):
  - Stub implementations returning realistic mock fixtures
  - Trinity can wire Panel UI now; handlers return deterministic data
  - Real core/query wiring deferred to WI-6

### Cloud reference study
- **Documentation** (`docs/schemas/cloud-reference-notes.md`):
  - Detailed field-by-field mapping of rett-europe/opentreasury Python models
  - Noted deviations: ULIDs vs UUIDs, simplified review_status, deferred features (splits, notes, transfer type)
  - Captured enums, constraints, soft-delete patterns

## What Trinity can now import

```typescript
import {
  IPC_PANEL_GET_ACCOUNTS,
  IPC_PANEL_GET_ACCOUNT_BALANCES,
  IPC_PANEL_GET_MONTH_KPIS,
  IPC_PANEL_GET_ACCOUNT_SPARKLINES,
  IPC_PANEL_QUERY_RECENT_TRANSACTIONS,
  type GetAccountsResponse,
  type GetAccountBalancesResponse,
  type GetMonthKPIsResponse,
  type GetAccountSparklinesResponse,
  type QueryRecentTransactionsResponse,
} from '../../shared/ipc-contracts/panel';
```

All contracts are Zod-validated, TypeScript-typed, and ready to use. Trinity's Panel UI can call IPC channels and get mock data back immediately.

## Open questions for WI-4/WI-5

1. **OneDrive storage path**: Where should `.ot/events.jsonl.age` live? User's OneDrive root vs subfolder?
2. **DEK retrieval**: Keychain service name format? `opentreasury.dataset.{datasetId}` or simpler?
3. **Event log rotation**: M1 assumes single file; when do we split? (Defer to M2?)
4. **Schema evolution**: If we add fields to events later, how do we handle old events? (Version field exists but no migration logic yet)
5. **Account color palette**: Cloud validates against `ALLOWED_ACCOUNT_COLORS` (Python constant). Do we need to fetch that or hardcode in desktop? Decision: hardcode for M1, sync in M2.

## Next steps (WI-4: OneDrive storage, WI-5: crypto wiring)

- WI-4: Implement OneDrive read path (`.ot/events.jsonl.age` → decrypted events → replay)
- WI-5: Crypto layer (decrypt events with DEK from keychain, coordinate with Switch)
- WI-6: Wire real `core/query` calls into IPC handlers (replace mocks)

**Status:** WI-1 ✅ complete, WI-2 ✅ complete, tests passing, Trinity unblocked.
