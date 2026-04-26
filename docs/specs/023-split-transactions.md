# SPEC-023 — Split Transactions

> **Status:** Draft · **Owner:** Niobe (Spec / UX Analyst) · **Last updated:** 2026-04-26
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
  rows.
- **FR13** — All user-visible strings MUST be sourced from the i18n framework (PRD-009).
  Both ES and EN strings are populated before this spec moves to Accepted.

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

| Event type | Fields | Produced by | Consumed by |
|---|---|---|---|
| `tx.split` | `{ id (ULID), parentTxId, datasetId, actorDeviceId, createdAt, dekVersion, version, splits: [{ splitId (ULID), amount, categoryId\|null, subcategoryId\|null, comment\|null }] }` | Command `splitTransaction` | Read-model reducer, audit log |
| `tx.split.removed` | `{ id (ULID), parentTxId, datasetId, actorDeviceId, createdAt, dekVersion, version }` | Command `removeSplit` | Read-model reducer, audit log |

**Semantics:** A `tx.split` event is idempotent-by-replacement. When the reducer
processes a `tx.split` event whose `parentTxId` already has an earlier `tx.split` event,
the new splits replace the old ones entirely. This avoids a separate "update split" event
type. The `id` field is the event ULID (filename); `parentTxId` is the original
transaction's ULID.

### 6.2 Read-model projections

Two new tables are required in the SQLite read-model
(`app/src/read-model/` — per ADR-002):

**`transaction_splits`**

| Column | Type | Notes |
|---|---|---|
| `split_id` | TEXT PK | ULID |
| `parent_tx_id` | TEXT NOT NULL | FK → `transactions.id` |
| `amount` | REAL NOT NULL | Positive, same currency as parent |
| `category_id` | TEXT NULLABLE | FK → `categories.id` |
| `subcategory_id` | TEXT NULLABLE | FK → `subcategories.id` |
| `comment` | TEXT NULLABLE | ≤ 500 chars |
| `sort_order` | INTEGER NOT NULL | Preserves editor ordering |
| `dataset_id` | TEXT NOT NULL | For multi-dataset isolation |

**`transaction_split_state`** (lightweight: tracks which transactions are split)

| Column | Type | Notes |
|---|---|---|
| `parent_tx_id` | TEXT PK | FK → `transactions.id` |
| `is_split` | INTEGER NOT NULL | 1 = has active splits, 0 = removed |
| `split_event_id` | TEXT NOT NULL | ULID of the latest `tx.split` or `tx.split.removed` event that set this state |

The `transactions` read-model row gains a computed column (or view join):
`has_splits` (BOOLEAN) — derived from `transaction_split_state.is_split`.

Aggregation queries (Saldo, Panel, totals strip) MUST join
`transaction_splits` when `has_splits = 1`, summing split amounts instead
of `transactions.amount`.

### 6.3 File layout on OneDrive

Split events are stored under the existing `events/` directory in the dataset root,
following the same pattern as other event files:

```
{dataset-root}/
  events/
    {ulid}.enc          ← tx.split or tx.split.removed event (AEAD envelope, ADR-001 C1)
```

No new directory is required. Filenames are ULIDs (opaque, ADR-001 C11 / R3).

---

## 7. IPC Surface

Two new IPC channels, one new query channel:

| Channel | Direction | Payload schema | Response schema |
|---|---|---|---|
| `tx:split` | renderer → main | `SplitTransactionRequest` | `SplitTransactionResponse` |
| `tx:split:remove` | renderer → main | `RemoveSplitRequest` | `RemoveSplitResponse` |
| `tx:split:get` | renderer → main | `GetSplitsRequest` | `GetSplitsResponse` |

Schemas live in `app/src/shared/ipc-contracts/transaction-splits.ts` (new file).
Schema violations MUST be rejected at the boundary (R12, C13).

**`SplitTransactionRequest`**

```typescript
z.object({
  parentTxId: z.string().min(1),
  splits: z.array(z.object({
    amount: z.number().positive().finite(),
    categoryId: z.string().nullable().optional(),
    subcategoryId: z.string().nullable().optional(),
    comment: freeTextField(500).optional(),
  })).min(2),
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
    splitId: z.string(),
    amount: z.number(),
    categoryId: z.string().nullable(),
    subcategoryId: z.string().nullable(),
    comment: z.string().nullable(),
    sortOrder: z.number().int(),
  }))
})
```

**`RemoveSplitRequest`**

```typescript
z.object({ parentTxId: z.string().min(1) })
```

---

## 8. Security Considerations

- **AEAD envelope:** `tx.split` and `tx.split.removed` event files each use the AEAD
  envelope from [`crypto-spec.md`](../security/crypto-spec.md) §2.1. AAD binds
  `record_type = "event"`, `record_id = <event ULID>`, `dataset_id`, `dek_version`. (C1, C2)
- **Nonces:** 192-bit random via `crypto.randomBytes` per event file. (C3)
- **Audit entries:** The following actions produce audit log entries (crypto-spec §8.2):
  - `tx.split` — actor, parentTxId, split count, before/after hash.
  - `tx.split.removed` — actor, parentTxId, before hash.
  (C10, R8)
- **Renderer isolation:** No new code imports from `src/main/` or `src/crypto/` into
  `src/renderer/`. All split data flows through the three new IPC channels above. (C6, R11)
- **PII in logs:** `comment`, `amount`, `categoryId` MUST NOT appear in log output.
  These fields are PII-adjacent (they describe financial operations). (R15)
- **Input validation:** `SplitTransactionRequest` is validated with Zod at the IPC
  boundary before entering the command handler. The sum constraint (FR3) is validated
  inside the command — not only in the schema — to guard against floating-point drift. (R17)
- **Sum constraint atomicity:** The command handler reads the parent transaction amount
  from the read-model, recomputes the sum of the incoming splits, and rejects the
  request if they do not match within a tolerance of 0.001 EUR. This check MUST happen
  in the main process even if the renderer already validated it.

---

## 9. Test Plan

### 9.1 Unit (Vitest, plain Node)

- `splitTransaction` command — valid 2-split, valid 3-split, sum mismatch rejects,
  single-split rejects, non-existent parentTxId rejects, deleted parent rejects.
- `removeSplit` command — existing split removed, no-op if no splits (idempotent).
- Read-model reducer — `tx.split` event populates `transaction_splits`; subsequent
  `tx.split` replaces rows; `tx.split.removed` clears rows.
- Aggregation queries — transaction with splits excluded from single-line total;
  split amounts summed correctly into category buckets.

### 9.2 Integration (Vitest, in-memory storage adapter)

- Round-trip: `tx:split` IPC → event persisted → read-model updated →
  `tx:split:get` returns correct splits.
- AEAD envelope round-trip: tamper ciphertext of `tx.split` event → decrypt fails;
  untampered → decrypts and passes.
- Aggregation integrity: create parent €500, split 300+200, confirm totals strip shows
  €300 + €200 not €500.
- Re-split: split then re-split with different amounts; verify old splits are gone.
- Remove split: split then remove; verify parent amount is counted again.

### 9.3 E2E (Playwright against built Electron binary)

- Happy path: open Movements, click split on a row, enter two valid splits, save —
  parent row shows split badge, totals strip reflects individual split amounts.
- Sum validation: enter splits that do not sum to parent — Save button is disabled;
  remainder indicator shows non-zero amount.
- Remove split: open split editor, click "Remove all splits", confirm — parent row
  reverts to normal, totals strip reflects single parent amount.
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
- [ ] **AC12** — Each `tx.split` and `tx.split.removed` event is stored as a separate
  AEAD-encrypted file with a ULID filename.
- [ ] **AC13** — An audit log entry is produced for every split and split-removal action.

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
   this be scheduled for M1 (extends the core transaction model) or M4 (polish, like
   recurring transactions)? *Recommendation: M2 or M3 — it extends the event model
   (M1 work), but it is not part of the single-user MVP happy path.*

2. **Sum tolerance for floating-point.** The spec uses ±0.001 EUR as the acceptable
   deviation when checking split sums. Is this acceptable, or should sums be stored as
   integer cents to avoid floating-point drift entirely? *Recommendation: store amounts
   as integer cents in the event payload to eliminate the tolerance question.*

3. **Split visibility in export.** When CSV export (PRD-008, M3) is implemented, should
   splits appear as individual rows (with the parent row suppressed) or as the parent row
   with a "split" annotation? *Recommendation: individual rows — mirrors how they appear
   in financial aggregations.*

4. **Re-split limit.** Should there be a maximum number of splits per transaction (e.g.,
   10)? *Recommendation: set a practical upper bound of 20 splits per transaction for
   v1; revisit on pilot feedback.*

5. **Split comment length.** The spec proposes 500 chars per split comment (same as
   transaction `description`). Is this appropriate, or should it be shorter (e.g., 200)?
   *Recommendation: keep 500 for consistency with the existing description field.*

---

## 13. Status History

| Date | Status | By | Notes |
|---|---|---|---|
| 2026-04-26 | Draft | Niobe | Initial draft from issue #59. PRD reservation pending. |
