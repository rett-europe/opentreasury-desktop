# SPEC-023 — Split Transactions

> **Status:** Draft (Rev 3) · **Milestone:** M1 · **Owner:** Niobe (Spec / UX Analyst) · **Last updated:** 2026-04-29
> **Paired PRD:** Pending — Split Transactions is not yet in the PRD plan; this spec is issued directly from issue #59. A PRD reservation (PRD-023) should be added to `docs/product/prd-plan.md` before this spec moves to Accepted.
> **Paired UX:** `docs/ux/specs/ux-007-split-transactions.md`
> **Paired Design:** `docs/design/023-split-transactions.md` (pending Mouse)
>
> **Milestone note:** Splits ship in **M1**, independent of M2 crypto work. Encryption is deferred to M2 alongside other transaction data — no split-specific crypto is needed.

---

## 1. Summary

Split Transactions lets a treasurer divide a single confirmed transaction into two or
more child splits, each with its own amount, category/subcategory, and optional free-text
comment. The original transaction becomes a logical parent and is hidden from financial
totals; only its splits appear in expense-vs-income aggregations. The sum of all split
amounts is always equal to the parent amount.

---

## 2. Problem

NGO treasurers routinely receive a single bank debit that covers multiple programme lines
(e.g., a €500 payment that is €300 "materials" + €200 "travel"). With no split capability
they must either (a) record it as a single ambiguous line under one category or (b) enter
two separate manual transactions that no longer trace back to the actual bank statement row.
Both approaches break the audit trail and make reconciliation error-prone.

The issue describes four concrete user needs (paraphrased):

1. Split a transaction into different amounts.
2. Assign each split to independent categories / subcategories.
3. Enforce that split amounts sum to the parent amount.
4. Attach a free-text comment to each split.
5. See splits as individual items in financial views (expense vs. income balance).

---

## 3. Users & Scenarios

**Primary persona:** María, NGO treasurer. She records and reconciles all income and
expenses. She is comfortable with spreadsheets but not a power user. Reference
[`docs/product/vision.md`](../product/vision.md) §2 personas.

**Scenario A — Programme allocation.** A €500 bank debit arrives. María opens the row
on the Movements screen, chooses "Split", and creates two splits: €300 (category:
Materials, comment: "Team Alpha supplies") and €200 (category: Travel, comment:
"Conference registration"). The totals strip immediately reflects both amounts
independently.

**Scenario B — Partial refund categorisation.** A €1 200 income is a grant that covers
two programmes (€800 operations + €400 outreach). María splits the income row; both
splits appear in the Saldo breakdown under their respective categories.

**Scenario C — Undo split.** María splits a row incorrectly. She opens the split view,
removes all splits, and returns the parent transaction to its un-split state so it is
treated as a single line again.

**Scenario D — Split visible in balance.** Pedro (director) opens the Panel dashboard.
The expense breakdown shows Materials and Travel separately — not one combined line — even
though there is only one underlying bank transaction.

---

## 4. Requirements

### 4.1 Functional

- **FR1** — Any confirmed transaction in the Movements list MAY be split. Pending or
  already-deleted transactions MUST NOT be splittable.
- **FR2** — A split operation creates ≥ 2 split records. A transaction with exactly one
  split is invalid; the split editor MUST prevent submission in that state.
- **FR3** — The sum of all split `amountCents` values MUST exactly equal
  `Math.round(parentTx.amount * 100)`. Integer comparison — no floating-point tolerance.
  Validation is enforced at the IPC boundary (main process) and surfaced live in
  the split editor UI before submission.
- **FR4** — Each split record carries: `amountCents` (positive integer, EUR cents —
  e.g. `12345` = €123.45), `categoryId` (nullable), `subcategoryId` (nullable),
  `comment` (free text ≤ 500 chars, nullable). Categories and subcategories are
  independent of the parent transaction's category. The UI converts cents ↔ EUR at
  the edge using `Intl.NumberFormat`. **Integer cents are mandatory for split
  children** to eliminate floating-point drift in the sum invariant. This sets
  precedent for future migration of float amounts elsewhere, but for now ONLY
  split children use cents — existing `tx.created` / `tx.updated` amounts remain
  as floats.
- **FR5** — A split is persisted as a `tx.split` event referencing the parent transaction
  ID. The event replaces any previous split state for the same parent (i.e., re-splitting
  overwrites; see §6.1).
- **FR6** — Removing all splits (returning to un-split state) MUST be possible by
  deleting all split entries and saving. This produces a `tx.split.removed` event.
- **FR7** — In the Movements list, a split parent row MUST display a visual indicator
  (e.g., a "split" icon / badge). Clicking the indicator or the row's Edit action opens
  the split editor.
- **FR8** — Individual split rows MUST NOT appear as separate rows in the Movements list.
  The parent row is the only visible row; financial aggregations (totals strip, Saldo,
  Panel) use the split amounts.
- **FR9** — Financial aggregations (Saldo balance, Panel breakdown, Movements totals
  strip) MUST sum split amounts, not the parent amount, whenever a transaction has active
  splits. The parent's own amount MUST NOT be counted in any total when splits exist.
- **FR10** — When filtering by category in the Movements screen, a split parent row
  appears in the result if ANY of its splits matches the selected category.
- **FR11** — Splits inherit the parent's `date`, `accountId`, `type`
  (income / expense), and `currency`. They do not have an independent date, account, or
  currency.
- **FR12** — Deleting a parent transaction also deletes (logically) all its splits. The
  `tx.deleted` event for the parent causes the read-model to remove all associated split
  records (the `splits` map entry for that `parentTxId` is deleted and `splitParentIds`
  is updated — see §6.2).
- **FR13** — All user-visible strings MUST be sourced from the i18n framework (PRD-009).
  Both ES and EN strings are populated before this spec moves to Accepted.
- **FR14** — A `transaction:update` request on a parent transaction that has active
  splits MUST be rejected if the `amount` field is being changed. The handler returns
  error code `TX_HAS_ACTIVE_SPLITS`. The user MUST remove splits first to change the
  parent amount. Edits to `description`, `categoryId`, `tags`, `reference`, `details`
  on the parent are permitted while splits exist (they do not affect the sum invariant).
  The edit form MUST disable the amount field and show an inline notice when the
  transaction has active splits. The detail modal surfaces this state clearly: disabled
  amount field with explanatory tooltip + a "Remove split" affordance to unblock
  editing. *(Locked — Pedro confirmed Option A: Reject.)*
- **FR15** — A `transaction:bulkUpdate` request that includes transactions with active
  splits MUST silently skip those split-parent transactions entirely. The response
  reports: `"X updated, Y skipped (split parents — edit children individually)"`.
  Split children are NOT touched by bulk ops on the parent. Children CAN be
  bulk-edited directly if individually selected. Other fields (`tagIds`, `status`)
  are also skipped for split parents to avoid partial application confusion.
  *(Locked — Pedro confirmed Option A: Skip.)*
- **FR16** — Splits do not have independent notes. The existing `tx.note.added` /
  `tx.note.edited` / `tx.note.deleted` event cycle applies to the parent transaction
  only. Each split carries a `comment` field (FR4); no note events are produced per
  split. This is an explicit design decision to keep notes and split comments as separate
  concerns.

### 4.2 Non-functional

- **NFR1 — Latency.** Opening the split editor and rendering existing splits for a
  transaction MUST complete in ≤ 200 ms on typical hardware.
- **NFR2 — Offline.** Split creation and removal MUST work with zero network
  connectivity; the operation is local (OneDrive sync is background-only, per vision
  Principle 5).
- **NFR3 — Accessibility.** The split editor MUST be keyboard-navigable. Focus moves
  logically through split rows. Adding/removing rows and submitting MUST be operable
  without a mouse. ARIA live regions announce the running total and validation state.
- **NFR4 — Correctness.** The sum constraint (FR3) MUST be enforced atomically in the
  main process; the renderer enforces it live as a UX aid but the command handler is the
  source of truth.
- **NFR5 — Event immutability.** Split events, once persisted, are append-only. A
  re-split replaces logically by appending a new `tx.split` event with a new ULID
  event id; the old event is never rewritten.

---

## 5. UX Notes

Full interaction flows live in the paired UX spec
[`docs/ux/specs/ux-007-split-transactions.md`](../ux/specs/ux-007-split-transactions.md).
Key constraints that affect architecture:

- **No independent row per split in the list.** The split editor is a modal/panel opened
  from the parent row — NOT a new screen. This keeps the Movements table's row count
  unchanged.
- **Live sum feedback.** The split editor displays a running total and a remainder
  ("remaining: €X") that updates on every amount keystroke. The Save button is disabled
  until remainder = €0.00 and ≥ 2 splits exist.
- **Minimum two splits.** The editor opens with two empty rows pre-populated. The user
  cannot reduce below two rows while saving; they can delete all and cancel.
- **The "remove all splits" affordance.** A dedicated "Remove split" action on the parent
  row (or a "Remove all splits" button inside the editor) reverts the transaction to
  single-line.

---

## 6. Data Model

### 6.1 Domain events

`tx.split` and `tx.split.removed` follow the **flat wire style** used by the most
recent transaction events (`tx.note.added`, `tx.note.edited`, `tx.note.deleted`,
`tx.deleted`) — top-level fields, no nested `payload` object.

> **Amount representation (LOCKED):** Child split amounts are stored as **integer
> cents** (`amountCents: z.number().int().positive()`) — e.g. `12345` = €123.45.
> This eliminates floating-point drift in the sum invariant. The UI converts at the
> edge via `Intl.NumberFormat`. Existing `tx.created` / `tx.updated` amounts remain
> as floats — integer cents apply ONLY to split children for now. This sets
> precedent for future migration of float amounts elsewhere.

| Event type | Schema | Produced by | Consumed by |
|---|---|---|---|
| `tx.split` | See Zod schema below | Command `splitTransaction` | Read-model reducer, audit log |
| `tx.split.removed` | See Zod schema below | Command `removeSplit` | Read-model reducer, audit log |

**`transactionSplitEventSchema`** (flat wire, to add to `app/src/core/events/schemas.ts`):

```typescript
export const transactionSplitRowSchema = z.object({
  splitId:       z.string().length(26),            // ULID — stable PK in the read model
  amountCents:   z.number().int().positive(),       // EUR cents (e.g. 30000 = €300.00)
  categoryId:    z.string().length(26).nullable(),
  subcategoryId: z.string().length(26).nullable(),
  comment:       z.string().max(500).nullable(),   // ≤ 500 chars (line-item style, shorter than parent's 1000-char details)
  sortOrder:     z.number().int().nonnegative(),    // Preserves editor row order
});

export const transactionSplitEventSchema = z.object({
  type:        z.literal('tx.split'),
  id:          z.string().length(26),  // Event ULID — dedup key in the NDJSON log
  parentTxId:  z.string().length(26),  // FK → Transaction.id
  splits:      z.array(transactionSplitRowSchema).min(2).max(20), // MAX_SPLITS_PER_TX = 20
  createdAt:   z.string().datetime(),
});

export const transactionSplitRemovedEventSchema = z.object({
  type:        z.literal('tx.split.removed'),
  id:          z.string().length(26),  // Event ULID
  parentTxId:  z.string().length(26),
  removedAt:   z.string().datetime(),
});

export type TransactionSplitRow    = z.infer<typeof transactionSplitRowSchema>;
export type TransactionSplitEvent  = z.infer<typeof transactionSplitEventSchema>;
export type TransactionSplitRemovedEvent = z.infer<typeof transactionSplitRemovedEventSchema>;
```

**Sum invariant (integer precision):** The command handler validates
`sum(splits[].amountCents) === parentTx.amount * 100` (converting the parent's float
to cents for comparison). No tolerance epsilon — the sum must be exact when expressed
in integer cents. The renderer enforces this live in the split editor as a UX aid;
the main-process check is the source of truth.

**Semantics:** `tx.split` is idempotent-by-replacement. When the reducer processes a
`tx.split` event whose `parentTxId` already has an earlier `tx.split` in the log, the
reducer replaces the existing splits map entry entirely (no per-row diffing needed).
`tx.split.removed` clears the splits entry and removes the parent from `splitParentIds`.

### 6.2 Read-model projections

> **B1 correction (Rev 2):** The read model is a **pure in-memory TypeScript object**
> (`ReadModel` interface in `app/src/core/query/types.ts`), hydrated by replaying the
> NDJSON event log on boot. There is no SQLite. The pattern for splits mirrors the
> existing `notes: ReadonlyMap<string, readonly TransactionNote[]>` introduced in WI-19.

**New TypeScript interfaces** (add to `app/src/core/query/types.ts`):

```typescript
// One row per split, keyed into ReadModel.splits by parentTxId.
export interface TransactionSplit {
  readonly splitId:       string;        // ULID — stable PK
  readonly parentTxId:    string;        // ULID FK → Transaction.id
  readonly amountCents:   number;        // Positive EUR cents (e.g. 30000 = €300.00)
  readonly categoryId:    string | null;
  readonly subcategoryId: string | null;
  readonly comment:       string | null; // ≤ 500 chars (line-item style)
  readonly sortOrder:     number;
}
```

**New fields on `ReadModel`**:

```typescript
export interface ReadModel {
  // … existing fields unchanged …

  // Splits grouped by parent transaction id (matches the notes pattern).
  // Key = parentTxId; value = splits array in sortOrder ASC.
  // Entry present only while at least one split exists for the parent.
  readonly splits: ReadonlyMap<string, readonly TransactionSplit[]>;

  // O(1) hasSplits check in query functions (avoids Map.has() at every call-site).
  readonly splitParentIds: ReadonlySet<string>;
}
```

**Reducer additions** (`app/src/core/query/reducers.ts`, new `case` branches in
`applyEvent`):

```typescript
case 'tx.split': {
  const nextSplits = new Map(readModel.splits);
  const rows: TransactionSplit[] = event.splits.map(s => ({
    splitId:       s.splitId,
    parentTxId:    event.parentTxId,
    amountCents:   s.amountCents,
    categoryId:    s.categoryId ?? null,
    subcategoryId: s.subcategoryId ?? null,
    comment:       s.comment ?? null,
    sortOrder:     s.sortOrder,
  }));
  nextSplits.set(event.parentTxId, rows);
  const nextSplitParentIds = new Set(readModel.splitParentIds);
  nextSplitParentIds.add(event.parentTxId);
  readModel = { ...readModel, splits: nextSplits, splitParentIds: nextSplitParentIds };
  break;
}

case 'tx.split.removed': {
  const nextSplits = new Map(readModel.splits);
  nextSplits.delete(event.parentTxId);
  const nextSplitParentIds = new Set(readModel.splitParentIds);
  nextSplitParentIds.delete(event.parentTxId);
  readModel = { ...readModel, splits: nextSplits, splitParentIds: nextSplitParentIds };
  break;
}
```

The `tx.deleted` case MUST also clear the splits entry for the deleted transaction:

```typescript
case 'tx.deleted': {
  // … existing splice logic …

  // Clear splits for the deleted transaction (FR12)
  if (readModel.splitParentIds.has(event.txId)) {
    const nextSplits = new Map(readModel.splits);
    nextSplits.delete(event.txId);
    const nextSplitParentIds = new Set(readModel.splitParentIds);
    nextSplitParentIds.delete(event.txId);
    readModel = { ...readModel, splits: nextSplits, splitParentIds: nextSplitParentIds };
  }
  // … rest of existing notes cleanup …
}
```

**Aggregation query pattern (I1 — query touchpoints):**

Every query that sums `tx.amount` must be updated to use a shared helper that returns
the effective amounts for a transaction. Since split children use integer cents while
parent amounts are floats, the helper normalises to EUR floats for downstream callers:

```typescript
// app/src/core/query/queries.ts — new shared helper
function effectiveAmounts(
  tx: Transaction,
  model: ReadModel,
): readonly { amount: number; categoryId: string | null; subcategoryId: string | null }[] {
  if (model.splitParentIds.has(tx.id)) {
    const splits = model.splits.get(tx.id) ?? [];
    return splits.map(s => ({
      amount: s.amountCents / 100,  // cents → EUR for aggregation
      categoryId: s.categoryId,
      subcategoryId: s.subcategoryId,
    }));
  }
  return [{ amount: tx.amount, categoryId: tx.categoryId, subcategoryId: tx.subcategoryId }];
}
```

The five query functions that MUST be updated to call `effectiveAmounts`:

| Function | File | What changes |
|---|---|---|
| `getAccountBalances()` | `queries.ts` | Iterate `effectiveAmounts(tx)` instead of `tx.amount` |
| `getMonthKPIs()` | `queries.ts` | Sum via `effectiveAmounts(tx)` |
| `getAccountSparklines()` | `queries.ts` | Sum via `effectiveAmounts(tx)` |
| `getSaldoComparison()` | `saldo.ts` | All period/category/monthly series sums; also category-breakdown queries filter by `ea.categoryId` per split |
| `queryRecentTransactions()` | `queries.ts` | No amount summing, but note that split parents appear as single rows — no change needed here |

### 6.3 Event persistence

> **B2 correction (Rev 2):** There is no `events/` directory of individual `.enc` files.
> All domain events — including `tx.split` and `tx.split.removed` — are **appended as
> NDJSON lines** to the single `events.ndjson` file via `JsonFileEventLog.append()`.
> No new file format or directory is needed.

```
{dataset-root}/
  events.ndjson   ← append-only; tx.split and tx.split.removed are new line types
```

`tx.split` and `tx.split.removed` are accepted by `JsonFileEventLog` automatically once
they are added to the `DomainEvent` union (§6.4). No boot-guard changes are needed.

When M2 AEAD encryption is implemented, `tx.split` and `tx.split.removed` events will
be encrypted in the same manner as every other event type — **no split-specific storage
changes are required at that point**.

### 6.4 Integration Seam Map

> This section maps exactly where splits plug into the existing pipeline. Every file
> path is relative to `app/src/`. This is the implementation guide for Morpheus.

#### 6.4.1 Event Log Layer (`core/events/`)

| File | Change | Detail |
|---|---|---|
| `core/events/schemas.ts` | **Add 3 Zod schemas** | `transactionSplitRowSchema`, `transactionSplitEventSchema`, `transactionSplitRemovedEventSchema` — flat wire style matching `tx.note.added` pattern |
| `core/events/schemas.ts` | **Extend `DomainEvent` union** | Add `TransactionSplitEvent \| TransactionSplitRemovedEvent` to the existing 25-member union (line ~498) |
| `core/events/index.ts` | **Re-export types** | Export the new event types for consumers |

The `tx.split` event is an **additive event type** — it is appended to the NDJSON log
alongside existing event types. **There is no migration.** Old event logs that lack
`tx.split` events are valid and replay cleanly (splits map simply stays empty).

#### 6.4.2 Read-Model Layer (`core/query/`)

| File | Change | Detail |
|---|---|---|
| `core/query/types.ts` | **Add `TransactionSplit` interface** | Fields: `splitId`, `parentTxId`, `amountCents`, `categoryId`, `subcategoryId`, `comment` (≤500 chars), `sortOrder` |
| `core/query/types.ts` | **Extend `ReadModel`** | Add `splits: ReadonlyMap<string, readonly TransactionSplit[]>` (keyed by parentTxId) + `splitParentIds: ReadonlySet<string>` (O(1) lookup) |
| `core/query/reducers.ts` | **`applyEvent` new cases** | `case 'tx.split'`: populate splits map + splitParentIds set; `case 'tx.split.removed'`: clear both |
| `core/query/reducers.ts` | **`case 'tx.deleted'` extension** | Clear splits map entry + splitParentIds for deleted parent (FR12) |
| `core/query/reducers.ts` | **`emptyReadModel()` update** | Initialise `splits: new Map()` and `splitParentIds: new Set()` |
| `core/query/queries.ts` | **Add `effectiveAmounts()` helper** | Shared helper converting split children's `amountCents/100` to EUR for downstream aggregation |
| `core/query/queries.ts` | **Update 3 query functions** | `getAccountBalances()`, `getMonthKPIs()`, `getAccountSparklines()` — iterate via `effectiveAmounts()` |
| `core/query/saldo.ts` | **Update `getSaldoComparison()`** | Period/category/monthly series sums use `effectiveAmounts()`; category breakdowns filter by per-split `categoryId` |

#### 6.4.3 IPC Contract Layer (`shared/ipc-contracts/`)

| File | Change | Detail |
|---|---|---|
| `shared/ipc-contracts/transaction-splits.ts` | **New file** | 3 channels: `tx:split`, `tx:split:remove`, `tx:split:get`. Schemas follow WI-19 convention: `{ok:true, event} \| {ok:false, error}` |
| `shared/ipc-contracts/transaction.ts` | **Add `TX_HAS_ACTIVE_SPLITS` error code** | To `updateTransactionValidationErrorCodeSchema` (FR14 — reject parent amount edit when splits exist) |
| `shared/ipc-contracts/transaction.ts` | **Extend bulk-update response** | Add `skippedSplitParentCount: z.number().int().nonnegative()` to success branch (FR15) |
| `shared/ipc-contracts/movements.ts` | **Extend `movementRecordSchema`** | Add `hasSplits: z.boolean()` + `splitCount: z.number().int().nonnegative()` — enables split badge + edit routing in renderer |

#### 6.4.4 Renderer Projection Layer

| Wire type | Renderer type | Where | Split-relevant additions |
|---|---|---|---|
| `MovementRecord` | `Movement` (alias) | `shared/ipc-contracts/movements.ts` | `hasSplits` + `splitCount` surface in both types (same shape) |
| — | Split editor component | `renderer/components/` (new) | Consumes `tx:split:get` response; emits `tx:split` on save |

Children MUST surface in both the `MovementRecord` wire shape (via `hasSplits` /
`splitCount`) and the renderer's `Movement` type. The renderer uses `hasSplits` to:
- Show the split badge icon (UX-007 §4.1)
- Route the "Edit" row action to the split editor instead of the plain edit form
- Disable the amount field in the edit modal with tooltip (FR14)

#### 6.4.5 Handler Layer (`main/ipc/handlers/`)

| File | Change | Detail |
|---|---|---|
| `main/ipc/handlers/transaction-splits.ts` | **New file** | Handlers for `tx:split`, `tx:split:remove`, `tx:split:get`; validates sum invariant (`sum(amountCents) === parentTx.amount * 100`) |
| `main/ipc/handlers/transaction.ts` | **Extend `transaction:update` handler** | Check `splitParentIds.has(txId)` before allowing amount change; return `TX_HAS_ACTIVE_SPLITS` if violated |
| `main/ipc/handlers/transaction.ts` | **Extend `transaction:bulkUpdate` handler** | Skip split parents; report `skippedSplitParentCount` in response |
| `main/ipc/handlers/movements.ts` | **Extend `movements:list` handler** | Populate `hasSplits` and `splitCount` from `readModel.splitParentIds` / `readModel.splits` |

### 6.5 Field Constraints

| Field | Scope | Max length | Rationale |
|---|---|---|---|
| `Transaction.details` | Parent transaction | 1000 chars | Existing limit (WI-19) — full narrative context |
| `TransactionSplit.comment` | Split child | **500 chars** | Line-item style annotation; shorter than parent's details because each split describes one purpose, not the full transaction context |
| `Transaction.description` | Parent transaction | 500 chars | Existing limit — short bank-statement-like label |

### 6.6 CSV Export Shape (future feature)

> Export is not built yet, but the spec declares the contract so the IPC surface
> and read-model projections are designed to support it without changes.

**One row per child.** When CSV export ships (future feature), each split child
becomes its own row in the export file. The parent envelope is NOT exported as a
separate row. Each export row carries:
- The split child's `amountCents / 100` (formatted as EUR)
- The split child's `categoryId` / `subcategoryId` / `comment`
- The parent's `date`, `description`, `accountId`, `type`

This is reconciliation-friendly: each row maps to a single category assignment,
which is the whole point of splitting. Auditors see N rows summing to the bank
statement amount.



---

## 7. IPC Surface

Two new mutation channels and one query channel for splits:

| Channel | Direction | Payload schema | Response schema |
|---|---|---|---|
| `tx:split` | renderer → main | `SplitTransactionRequest` | `SplitTransactionResponse` |
| `tx:split:remove` | renderer → main | `RemoveSplitRequest` | `RemoveSplitResponse` |
| `tx:split:get` | renderer → main | `GetSplitsRequest` | `GetSplitsResponse` |

Schemas live in `app/src/shared/ipc-contracts/transaction-splits.ts` (new file).
The `freeTextField(maxLen)` helper from `transaction.ts` (line 65) MUST be imported
and reused — do not duplicate it.
Schema violations MUST be rejected at the boundary (R12, C13).

**`SplitTransactionRequest`**

```typescript
z.object({
  parentTxId: z.string().min(1),
  splits: z.array(z.object({
    amountCents: z.number().int().positive(),  // EUR cents (e.g. 30000 = €300.00)
    categoryId: z.string().nullable().optional(),
    subcategoryId: z.string().nullable().optional(),
    comment: freeTextField(500).optional(),  // reuse helper from transaction.ts; max 500 chars
  })).min(2).max(20),  // 20 is a named constant MAX_SPLITS_PER_TX, not a magic number
})
```

**`GetSplitsRequest`**

```typescript
z.object({ parentTxId: z.string().min(1) })
```

**`GetSplitsResponse`**

```typescript
z.object({
  splits: z.array(z.object({
    splitId:       z.string(),
    amountCents:   z.number().int().positive(),  // EUR cents
    categoryId:    z.string().nullable(),
    subcategoryId: z.string().nullable(),
    comment:       z.string().nullable(),
    sortOrder:     z.number().int(),
  }))
})
```

**`RemoveSplitRequest`**

```typescript
z.object({ parentTxId: z.string().min(1) })
```

**`movementRecordSchema` addition** (existing file `movements.ts`, I4 fix):

The `movementRecordSchema` in `app/src/shared/ipc-contracts/movements.ts` MUST gain:

```typescript
hasSplits:   z.boolean(),                        // true if splits exist for this parent
splitCount:  z.number().int().nonnegative(),     // 0 when hasSplits = false
```

The Movements-list IPC handler populates these from `readModel.splitParentIds` and
`readModel.splits`. The renderer uses `hasSplits` to conditionally show the split badge
(UX-007 §4.1) and to route the Edit action to the split editor instead of the
transaction edit form.

---

## 8. Security Considerations

> **Current implementation state (M1):** All events are stored as **plaintext NDJSON
> lines** in `events.ndjson`. Encryption is deferred to M2 alongside other transaction
> data. `tx.split` and `tx.split.removed` events follow the same plaintext storage as
> all other events. When the M2 AEAD layer lands, split events will be encrypted
> uniformly — no split-specific crypto implementation is needed.

- **Encryption (M2 — deferred):** When the M2 crypto layer ships, `tx.split` and
  `tx.split.removed` event lines will be encrypted via the common AEAD envelope. No
  split-specific encryption code is needed; the transport layer handles it uniformly.
- **Audit entries:** The following actions produce audit log entries. This applies from
  the M1 implementation (not M2-gated):
  - `tx.split` — actor device id, parentTxId, split count, before/after hash.
  - `tx.split.removed` — actor device id, parentTxId, before hash.
  (C10, R8)
- **Renderer isolation:** No new code imports from `src/main/` or `src/crypto/` into
  `src/renderer/`. All split data flows through the three new IPC channels. (C6, R11)
- **PII in logs:** `comment`, `amountCents`, `categoryId` MUST NOT appear in structured
  log output. These fields describe financial operations and are PII-adjacent. (R15)
- **Input validation:** `SplitTransactionRequest` is validated with Zod at the IPC
  boundary before entering the command handler. The sum constraint (FR3) is revalidated
  inside the command handler — not only in the schema — to guard against client-side
  bypass. (R17)
- **Sum constraint in main process:** The command handler reads `parentTx.amount` from
  the read model, converts to cents (`Math.round(parentTx.amount * 100)`), sums the
  incoming `amountCents` values, and rejects if they differ. Integer comparison — no
  floating-point tolerance needed. This check is authoritative even if the renderer
  already validated it.

*This spec interacts with Switch-owned domains (audit log, future encryption). Switch
review of §8 is required before this spec moves from In Review → Accepted.*

---

## 9. Test Plan

### 9.1 Unit (Vitest, plain Node)

- `splitTransaction` command — valid 2-split, valid 3-split, sum mismatch rejects,
  single-split rejects (< 2 splits), > 20 splits rejects, non-existent parentTxId
  rejects, deleted parent rejects, split parent with active splits: amount-change update
  rejects (FR14).
- `removeSplit` command — existing split removed, idempotent if no splits (no-op, no
  error).
- `bulkUpdateTransactions` command — categoryId skipped for split parents, other fields
  applied (FR15); response reports skip count.
- Read-model reducer — `tx.split` event populates `readModel.splits` and
  `readModel.splitParentIds`; subsequent `tx.split` event for same parentTxId replaces
  entries entirely; `tx.split.removed` clears the entry and removes from
  `splitParentIds`; `tx.deleted` for a split parent also clears split state.
- `effectiveAmounts()` helper — split parent returns split rows; unsplit transaction
  returns single-element array with `tx.amount`.
- `getAccountBalances()` — split transaction's amount replaced by split amounts in sum.
- `getMonthKPIs()` — split transaction's amount replaced by split amounts.
- `getSaldoComparison()` — category breakdowns use split `categoryId`, not parent's.

### 9.2 Integration (Vitest, in-memory storage adapter)

- Round-trip: `tx:split` IPC → `tx.split` line appended to NDJSON log → read-model
  updated → `tx:split:get` returns correct splits.
- Aggregation integrity: create parent €500, split 300+200, confirm `getMonthKPIs()`
  income/expense totals reflect €300 + €200, not €500.
- Re-split: split then re-split with different amounts; verify old splits are gone from
  read model and new ones are present.
- Remove split: split then remove; verify `splitParentIds` no longer contains parentTxId
  and aggregations revert to using the parent amount.
- Delete parent: split a transaction then delete it; verify splits are removed from both
  `splits` map and `splitParentIds`.
- Category filter: Movements query with categoryId filter returns split parents that have
  at least one split with matching categoryId.

### 9.3 E2E (Playwright against built Electron binary)

- Happy path: open Movements, click split on a row, enter two valid splits, save —
  parent row shows split badge with count, totals strip reflects individual split amounts.
- Sum validation: enter splits that do not sum to parent — Save button is disabled;
  remainder indicator shows non-zero amount.
- Remove split: open split editor, click "Remove all splits", confirm — parent row
  reverts to normal (no badge), totals strip reflects single parent amount.
- Keyboard: navigate to split editor with Tab/Enter, add rows with keyboard only,
  submit — full flow operable without mouse.
- Offline: disconnect network, perform split — operation succeeds; split persisted
  locally (OneDrive sync deferred).

---

## 10. Acceptance Criteria

- [ ] **AC1** — A confirmed transaction can be split into ≥ 2 parts via the Movements
  screen row action.
- [ ] **AC2** — The split editor rejects submission when the sum of split `amountCents`
  values does not equal `Math.round(parentTx.amount * 100)`. Integer comparison — no
  floating-point tolerance.
- [ ] **AC3** — Each split can have an independent category, subcategory, and comment
  (all optional) regardless of the parent transaction's category.
- [ ] **AC4** — The Movements list shows the parent row with a split badge; individual
  splits do not appear as separate rows.
- [ ] **AC5** — The Movements totals strip, Saldo view, and Panel breakdown use split
  amounts (not the parent amount) for a split transaction.
- [ ] **AC6** — Filtering the Movements list by a category includes the parent row if
  any of its splits match that category.
- [ ] **AC7** — Removing all splits returns the transaction to single-line behaviour;
  the parent amount is used in all aggregations.
- [ ] **AC8** — Deleting the parent transaction also removes its splits from all views
  and aggregations.
- [ ] **AC9** — All split operations (create, re-split, remove) work offline.
- [ ] **AC10** — All user-visible strings in the split editor are available in both ES
  and EN locales.
- [ ] **AC11** — The split editor is fully keyboard-navigable with ARIA live regions
  announcing validation state.
- [ ] **AC12** — Each `tx.split` and `tx.split.removed` event is appended as an NDJSON
  line to `events.ndjson`; the log is rebuildable (replaying it reproduces the correct
  split state).
- [ ] **AC13** — An audit log entry is produced for every split and split-removal action.
- [ ] **AC14** — Attempting to change the `amount` field on a transaction that has active
  splits returns error code `TX_HAS_ACTIVE_SPLITS`; the edit form disables the amount
  field when splits are active.
- [ ] **AC15** — A bulk-update request that includes split-parent transactions skips the
  `categoryId` change for those transactions and reports the skip count in the response.

---

## 11. Traceability

- **PRD:** Pending — PRD-023 reservation to be added to `docs/product/prd-plan.md`.
  Issue: [#59](https://github.com/rett-europe/opentreasury-desktop/issues/59).
- **ADRs:** [ADR-001](../architecture/adr-001-tech-stack.md),
  [ADR-002](../architecture/adr-002-repo-structure.md)
- **ADR-001 conditions satisfied:** C6 (renderer isolation), C10 (audit entries),
  C13 (schema-validated IPC). Crypto conditions (C1, C2, C3) apply uniformly when M2
  AEAD ships — no split-specific crypto work.
- **Security requirements satisfied:** R5 (integrity), R8 (audit log),
  R11 (Electron hardening), R12 (IPC schema validation), R15 (log redaction), R17
  (input validation). R3 (AEAD) deferred to M2.
- **Paired UX:** `docs/ux/specs/ux-007-split-transactions.md`
- **Paired Design:** `docs/design/023-split-transactions.md` (pending Mouse)
- **Supersedes / Superseded by:** —
- **Related specs:** `docs/specs/001-movements.md` (planned — split entry point lives
  on the Movements row action)

---

## 12. Resolved Questions (Pedro's Answers)

All questions from Rev 2 have been resolved by Pedro. Answers are locked into the
normative sections of the spec. This section records the decisions for traceability.

1. **Integer cents in split payloads?** → **YES.** Child amounts stored as integer
   cents (`amountCents`). Sets precedent for future float migration elsewhere; for now,
   ONLY split children use cents. *(Locked in §6.1, FR4.)*

2. **Edit parent amount after split?** → **REJECT.** If a transaction has splits,
   `transaction:update` rejects amount changes with `TX_HAS_ACTIVE_SPLITS`. User must
   remove splits first. Detail modal: disabled amount field + tooltip + "Remove split"
   affordance. *(Locked in FR14, §6.4.5.)*

3. **Bulk update on split parents?** → **SKIP.** Bulk-edit operations skip split parents
   entirely. Response reports: `"X updated, Y skipped (split parents — edit children
   individually)"`. Children CAN be bulk-edited if individually selected. *(Locked in
   FR15, §6.4.5.)*

4. **Milestone placement?** → **M1.** Splits ship in M1, independent of M2 crypto
   work. *(Locked in header metadata.)*

5. **CSV export shape?** → **ONE ROW PER CHILD.** Parent envelope not exported as
   separate row. Each split child becomes its own CSV row with parent's date/description
   and child's amount/category/comment. Reconciliation-friendly. *(Locked in §6.6.)*

6. **Split comment length?** → **500 CHARS.** Parent `details` stays at 1000 (existing).
   Children get 500 (shorter, line-item style). *(Locked in §6.5, FR4.)*

7. **Re-split limit?** → **20.** Encoded as named constant `MAX_SPLITS_PER_TX`.
   *(Confirmed in Rev 2; unchanged.)*

---

## 13. Status History

| Date | Status | By | Notes |
|---|---|---|---|
| 2026-04-26 | Draft | Niobe | Initial draft from issue #59. PRD reservation pending. |
| 2026-04-26 | Draft (Rev 2) | Niobe | Addressed Neo's architectural review: B1 (replaced SQLite model with in-memory TypeScript ReadModel pattern), B2 (replaced `.enc` file description with NDJSON), B3 (added M2 crypto caveat to §8), B4 (added §6.4 integration points seam map). Added FR14 (reject tx amount update when splits active), FR15 (bulkUpdate skips category for split parents), FR16 (notes stay on parent only). Specified `effectiveAmounts()` helper and 5 query touchpoints (I1). Added `hasSplits`/`splitCount` to `movementRecordSchema` (I4). Updated open questions Q5-Q7 for Pedro. |
| 2026-04-29 | Draft (Rev 3) | Niobe | Incorporated Neo's PR #60 review feedback + Pedro's 6 lock answers. **Persistence model fixed:** removed all SQLite references (were already corrected in Rev 2 — verified). **Encryption fixed:** removed all AEAD/crypto-spec normative references — §8 now clearly defers encryption to M2 and describes only M1 security controls. **Integration Seam Map expanded:** §6.4 now has 5 subsections (event log, read-model, IPC contracts, renderer projection, handler layer) with concrete file paths and change descriptions. **Pedro's 6 answers locked:** (1) integer cents in `amountCents` field throughout, (2) parent-amount rejection via `TX_HAS_ACTIVE_SPLITS`, (3) bulk-update skip for split parents, (4) milestone = M1, (5) CSV export = one row per child (§6.6), (6) 500-char child comment limit (§6.5). All open questions resolved (§12 → "Resolved Questions"). |
