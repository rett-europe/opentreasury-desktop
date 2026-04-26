# SPEC-023 — Split Transactions

> **Status:** Draft (Rev 2) · **Owner:** Niobe (Spec / UX Analyst) · **Last updated:** 2026-04-26
> **Paired PRD:** Pending — Split Transactions is not yet in the PRD plan; this spec is issued directly from issue #59. A PRD reservation (PRD-023) should be added to `docs/product/prd-plan.md` before this spec moves to Accepted.
> **Paired UX:** `docs/ux/specs/ux-007-split-transactions.md`
> **Paired Design:** `docs/design/023-split-transactions.md` (pending Mouse)

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
- **FR3** — The sum of all split amounts MUST exactly equal the parent transaction
  amount. Validation is enforced at the IPC boundary (main process) and surfaced live in
  the split editor UI before submission.
- **FR4** — Each split record carries: `amount` (positive, EUR), `categoryId` (nullable),
  `subcategoryId` (nullable), `comment` (free text ≤ 500 chars, nullable). Categories and
  subcategories are independent of the parent transaction's category.
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
  transaction has active splits. (*Pending Pedro's decision — see Q6.*)
- **FR15** — A `transaction:bulkUpdate` request that includes transactions with active
  splits MUST silently skip the `categoryId` / `subcategoryId` fields for those
  transactions (the category change is undefined for a split parent — categories live on
  the individual splits). Other fields in the bulk payload (`tagIds`, `status`) MAY be
  applied to split parents. The response counts skipped-category updates separately.
  (*Pending Pedro's decision — see Q7.*)
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
  filename; the old event is never rewritten.

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

> **Amount representation (pending Pedro Q5):** The recommended approach is to store
> `amountCents: integer` (e.g. 30000 = €300.00) to eliminate floating-point drift in
> the sum invariant. If Pedro approves (Q5 below), the schemas below use `amountCents`
> instead of `amount`. The spec will be updated once Q5 is resolved.

| Event type | Schema | Produced by | Consumed by |
|---|---|---|---|
| `tx.split` | See Zod schema below | Command `splitTransaction` | Read-model reducer, audit log |
| `tx.split.removed` | See Zod schema below | Command `removeSplit` | Read-model reducer, audit log |

**`transactionSplitEventSchema`** (flat wire, to add to `app/src/core/events/schemas.ts`):

```typescript
export const transactionSplitRowSchema = z.object({
  splitId:       z.string().length(26),            // ULID — stable PK in the read model
  amount:        z.number().positive(),             // EUR; replace with amountCents if Q5 = yes
  categoryId:    z.string().length(26).nullable(),
  subcategoryId: z.string().length(26).nullable(),
  comment:       z.string().max(500).nullable(),
  sortOrder:     z.number().int().nonnegative(),    // Preserves editor row order
});

export const transactionSplitEventSchema = z.object({
  type:        z.literal('tx.split'),
  id:          z.string().length(26),  // Event ULID — dedup key in the NDJSON log
  parentTxId:  z.string().length(26),  // FK → Transaction.id
  splits:      z.array(transactionSplitRowSchema).min(2),
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
  readonly amount:        number;        // Positive EUR (or amountCents: number if Q5 = yes)
  readonly categoryId:    string | null;
  readonly subcategoryId: string | null;
  readonly comment:       string | null; // ≤ 500 chars
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
    amount:        s.amount,
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
the effective amounts for a transaction:

```typescript
// app/src/core/query/queries.ts — new shared helper
function effectiveAmounts(
  tx: Transaction,
  model: ReadModel,
): readonly { amount: number; categoryId: string | null; subcategoryId: string | null }[] {
  if (model.splitParentIds.has(tx.id)) {
    return model.splits.get(tx.id) ?? [];
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

### 6.4 Integration points

The following four files must be modified to integrate `tx.split` and
`tx.split.removed` into the existing pipeline. This is the seam map for Morpheus:

| File | Change required |
|---|---|
| `app/src/core/events/schemas.ts` | Add `transactionSplitEventSchema`, `transactionSplitRemovedEventSchema`, `transactionSplitRowSchema`; add both event types to `DomainEvent` union |
| `app/src/core/query/types.ts` | Add `TransactionSplit` interface; add `splits` and `splitParentIds` fields to `ReadModel` |
| `app/src/core/query/reducers.ts` | Add `case 'tx.split'`, `case 'tx.split.removed'`; extend `case 'tx.deleted'` to clear splits; update `emptyReadModel()` to initialise `splits: new Map()` and `splitParentIds: new Set()` |
| `app/src/core/query/queries.ts` + `saldo.ts` | Add `effectiveAmounts()` helper; update the 5 query functions listed in §6.2 |
| `app/src/shared/ipc-contracts/movements.ts` | Add `hasSplits: z.boolean()` and `splitCount: z.number().int().nonnegative()` to `movementRecordSchema` (see §7) |
| `app/src/shared/ipc-contracts/transaction-splits.ts` | New file — 3 IPC channels (see §7) |
| `app/src/main/ipc/handlers/` | New handler file for `tx:split`, `tx:split:remove`, `tx:split:get` channels |



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
    amount: z.number().positive().finite(),  // or amountCents if Q5 resolved yes
    categoryId: z.string().nullable().optional(),
    subcategoryId: z.string().nullable().optional(),
    comment: freeTextField(500).optional(),  // reuse helper from transaction.ts
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
    amount:        z.number(),  // or amountCents if Q5 resolved yes
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

> **B3 note (Rev 2 — current implementation state):** All events in this codebase are
> currently stored as **plaintext NDJSON lines** in `events.ndjson`. The AEAD encryption
> layer (crypto-spec §2.1) is scheduled for M2 and has not yet been implemented. The
> crypto controls below describe the **target M2 state**. `tx.split` and
> `tx.split.removed` events follow the same plaintext storage as all other events
> today. The AEAD requirements apply uniformly when the crypto layer lands and do
> **NOT** require any split-specific implementation — splits piggyback on the existing
> encryption pipeline.

- **AEAD envelope (M2 target):** When the M2 crypto layer ships, `tx.split` and
  `tx.split.removed` event lines will be encrypted with the AEAD envelope from
  [`crypto-spec.md`](../security/crypto-spec.md) §2.1. AAD binds `record_type`,
  `record_id` (event id ULID), `dataset_id`, `dek_version`. No split-specific
  encryption code is needed; the transport layer handles it uniformly. (C1, C2)
- **Nonces (M2 target):** 192-bit random via `crypto.randomBytes` per event, per the
  common envelope. (C3)
- **Audit entries:** The following actions produce audit log entries (crypto-spec §8.2).
  This applies from the initial implementation (not M2-gated):
  - `tx.split` — actor device id, parentTxId, split count, before/after hash.
  - `tx.split.removed` — actor device id, parentTxId, before hash.
  (C10, R8)
- **Renderer isolation:** No new code imports from `src/main/` or `src/crypto/` into
  `src/renderer/`. All split data flows through the three new IPC channels. (C6, R11)
- **PII in logs:** `comment`, `amount`, `categoryId` MUST NOT appear in structured log
  output. These fields describe financial operations and are PII-adjacent. (R15)
- **Input validation:** `SplitTransactionRequest` is validated with Zod at the IPC
  boundary before entering the command handler. The sum constraint (FR3) is revalidated
  inside the command handler — not only in the schema — to guard against client-side
  bypass. (R17)
- **Sum constraint in main process:** The command handler reads `parentTx.amount` from
  the read model, sums the incoming split amounts, and rejects if they differ by more
  than the configured tolerance (or by ≠ 0 if Q5 resolves to integer cents). This
  check is authoritative even if the renderer already validated it.

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
- [ ] **AC2** — The split editor rejects submission when split amounts do not sum to
  the parent amount (within 0.001 EUR tolerance).
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
- **ADR-001 conditions satisfied:** C1 (AEAD on event files), C2 (AAD binding),
  C3 (192-bit nonces), C6 (renderer isolation), C10 (audit entries), C11 (ULID filenames),
  C13 (schema-validated IPC)
- **Security requirements satisfied:** R3 (AEAD), R5 (integrity), R8 (audit log),
  R11 (Electron hardening), R12 (IPC schema validation), R15 (log redaction), R17
  (input validation)
- **Crypto-spec sections:** §2.1 (per-file AEAD envelope), §8 (audit log format)
- **Paired UX:** `docs/ux/specs/ux-007-split-transactions.md`
- **Paired Design:** `docs/design/023-split-transactions.md` (pending Mouse)
- **Supersedes / Superseded by:** —
- **Related specs:** `docs/specs/001-movements.md` (planned — split entry point lives
  on the Movements row action)

---

## 12. Open Questions

Numbered for easy reply. These block moving this spec from In Review → Accepted.

1. **Milestone placement.** Split Transactions is not in the current PRD plan. Should
   this be scheduled for M1, M2, or M3?
   *Neo recommends M2: it extends the core event model (M1 foundations are in place)
   but is not part of the single-user MVP happy path.*

2. **Split visibility in export.** When CSV export (PRD-008, M3) is implemented, should
   splits appear as individual rows (parent row suppressed) or as the parent row with a
   "split" annotation?
   *Neo and Niobe recommend individual rows — mirrors how they appear in financial
   aggregations.*

3. **Split comment length.** The spec proposes 500 chars per split comment (same as
   transaction `description`). Shorter (e.g. 200)?
   *Recommendation: keep 500 for consistency with the existing description field.*

4. **Re-split limit.** Max 20 splits per transaction — is this acceptable for v1?
   *Recommendation: 20 is fine; encoded as named constant `MAX_SPLITS_PER_TX`, easy
   to adjust post-pilot.*

5. **Integer cents in split payloads.** The spec currently uses `amount: number` (EUR
   float). Neo strongly recommends `amountCents: integer` (e.g. 30000 = €300.00) to
   eliminate floating-point drift in the sum invariant. This affects only the `tx.split`
   event schema — existing `tx.created` amounts are unchanged.
   *Neo recommendation: integer cents. Niobe agrees. Decision needed: yes/no.*

6. **Edit parent amount after split.** FR14 proposes: reject a `transaction:update`
   that changes the `amount` field if the transaction has active splits (force user to
   remove splits first). Alternatives: auto-remove splits on amount change, or cascade
   proportionally.
   *Neo and Niobe recommendation: reject (Option 1). Cleanest, safest, easiest to test.
   Decision needed: reject / auto-remove / cascade.*

7. **Bulk update on split parents.** FR15 proposes: `transaction:bulkUpdate` silently
   skips `categoryId` / `subcategoryId` changes for split-parent transactions (categories
   live on splits, not on the parent). Other fields (`tagIds`, `status`) are applied.
   *Neo and Niobe recommendation: skip + report count. Decision needed: skip / reject /
   apply-to-parent-only.*

---

## 13. Status History

| Date | Status | By | Notes |
|---|---|---|---|
| 2026-04-26 | Draft | Niobe | Initial draft from issue #59. PRD reservation pending. |
| 2026-04-26 | Draft (Rev 2) | Niobe | Addressed Neo's architectural review: B1 (replaced SQLite model with in-memory TypeScript ReadModel pattern), B2 (replaced `.enc` file description with NDJSON), B3 (added M2 crypto caveat to §8), B4 (added §6.4 integration points seam map). Added FR14 (reject tx amount update when splits active), FR15 (bulkUpdate skips category for split parents), FR16 (notes stay on parent only). Specified `effectiveAmounts()` helper and 5 query touchpoints (I1). Added `hasSplits`/`splitCount` to `movementRecordSchema` (I4). Updated open questions Q5-Q7 for Pedro. |
