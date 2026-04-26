## 🏛️ Neo — Architectural Review of SPEC-023 + UX-007 (Split Transactions)

**Verdict: REQUEST_CHANGES** — The core design is solid and well-structured, but three factual mismatches with the current codebase would mislead Morpheus during implementation, and several integration points need explicit specification before parallel dispatch to the team.

---

### ✅ Architectural Strengths

1. **Idempotent-by-replacement `tx.split` event.** Brilliant design call — a single `tx.split` event atomically replaces all previous splits for a parent, avoiding the combinatorial complexity of per-split-row events (create/update/delete per child). This aligns perfectly with the append-only NDJSON log pattern. Re-splitting is just a new event; no deletions ever needed.

2. **Parent row preserved in the list.** The decision to keep one-row-per-bank-transaction in the Movements list with a split badge is the right UX call. It avoids row explosion, preserves the mental model, and keeps the `movementsListResponseSchema` backward-compatible. Financial views aggregate correctly from split amounts via the read model.

3. **Defense-in-depth on the sum invariant.** Enforcing `sum(splits) == parent.amount` at both UI (live running total) AND at the IPC boundary (main process command handler) is exactly right. The renderer check is a UX aid; the main-process check is the source of truth. This is the pattern we use throughout.

4. **Clean IPC surface.** Three new channels (`tx:split`, `tx:split:remove`, `tx:split:get`) in a dedicated `transaction-splits.ts` file mirrors our contract organization pattern. Zod schemas at the boundary. Good.

5. **UX-007 completeness.** The UX spec is unusually thorough: modal anatomy, running total strip, add/remove row mechanics, unsaved-changes confirmation, a11y (ARIA live regions, focus trap, keyboard shortcuts), full i18n string table in both ES and EN. This is production-ready UX design.

---

### 🔴 Blocking Issues (must fix before moving to Accepted)

#### B1 — Read model is NOT SQLite (SPEC §6.2)

The spec states: *"Two new tables are required in the SQLite read-model"* — `transaction_splits` and `transaction_split_state` with SQL column types.

**Reality:** The codebase has **no SQLite**. The read model is a **pure in-memory TypeScript object** (`ReadModel` interface in `app/src/core/query/types.ts`), hydrated from the NDJSON event log on boot. Transactions are a plain `readonly Transaction[]` array. Notes are a `ReadonlyMap<string, TransactionNote[]>`.

**Required fix:** Replace §6.2 entirely with:
- A new `TransactionSplit` interface in `types.ts` (matching the current pattern: `TransactionNote` is the model)
- A new field on `ReadModel`: `readonly splits: ReadonlyMap<string, readonly TransactionSplit[]>` (keyed by parentTxId, matching the `notes` pattern)
- A new field on `ReadModel` or a derived helper: `readonly splitParentIds: ReadonlySet<string>` (for O(1) `hasSplits` checks in queries)
- Reducer additions in `reducers.ts`: `applyEvent` cases for `tx.split` and `tx.split.removed`

#### B2 — Event storage is NDJSON, not individual `.enc` files (SPEC §6.3)

The spec states: *"Split events are stored under the existing `events/` directory … `{ulid}.enc`"*

**Reality:** All events are appended as JSON lines to a **single `events.ndjson` file** via `JsonFileEventLog`. There is no `events/` directory of individual files. The AEAD encryption layer is deferred to M2.

**Required fix:** Replace §6.3 with: *"Split events are appended to the existing `events.ndjson` log as NDJSON lines, following the same transport format as all other domain events. When M2 AEAD encryption is implemented, `tx.split` and `tx.split.removed` events will be encrypted in the same manner as every other event type — no split-specific storage changes are needed."*

#### B3 — AEAD/crypto references are premature (SPEC §8)

The spec's Security Considerations section extensively references AEAD envelopes, 192-bit nonces, AAD binding, and crypto-spec §2.1. None of this is implemented yet — all events are plain JSON on disk today. While it's good to plan for M2, the spec as written implies these are v1 implementation requirements, which would confuse Morpheus.

**Required fix:** Add a clear note at the top of §8: *"Crypto controls below describe the target M2 state. For the initial implementation (NDJSON transport), `tx.split` and `tx.split.removed` follow the same plaintext storage as all other events. The AEAD requirements apply uniformly when the crypto layer lands and do NOT require split-specific implementation."* Then retain the crypto notes as forward-looking design constraints.

#### B4 — `DomainEvent` union and event schemas not specified

The spec defines event shapes but doesn't mention that:
- New Zod schemas (`transactionSplitEventSchema`, `transactionSplitRemovedEventSchema`) must be added to `app/src/core/events/schemas.ts`
- These must be added to the `DomainEvent` union type (currently 25 members)
- The `applyEvent` reducer in `app/src/core/query/reducers.ts` must gain new `case` branches
- The `EventLog.append()` contract must accept the new types

**Required fix:** Add a §6.4 "Integration points" section listing these four files and the required additions. This is the seam map Morpheus needs.

---

### 🟡 Important Issues (should fix before Accepted)

#### I1 — Aggregation query impact is under-specified (SPEC §6.2, FR9)

The spec says *"Aggregation queries MUST join `transaction_splits`"* (using SQL language that doesn't apply). But there are **5+ query functions** that iterate `readModel.transactions` and sum `tx.amount` directly:

- `getAccountBalances()` in `queries.ts`
- `getMonthKPIs()` in `queries.ts`
- `getAccountSparklines()` in `queries.ts`
- `getSaldoComparison()` in `saldo.ts` (most complex — period comparison, projections, category breakdowns, monthly series)
- `queryRecentTransactions()` in `queries.ts`

Each of these must be updated to check `splitParentIds` and sum from the `splits` map instead of `tx.amount` when splits exist. The spec should list these functions explicitly as implementation touchpoints and specify the pattern (e.g., a shared `effectiveAmounts(tx)` helper that returns either `[{amount, categoryId}]` for unsplit or `splits[]` for split transactions).

#### I2 — `transaction:update` on a split parent (edge case)

What happens when a user edits a parent transaction's amount via `transaction:update` after it has been split? The sum invariant (`sum(splits) == parent.amount`) would break. Options:
1. **Reject** the update if the tx has active splits (force user to remove splits first)
2. **Auto-remove** splits on amount change (destructive)
3. **Cascade** — proportionally adjust split amounts (complex)

The spec must state which option applies. **My recommendation: Option 1 (reject).** Clean, simple, preserves data integrity. The edit form should disable amount editing (or warn) when splits exist.

#### I3 — `transaction:bulkUpdate` interaction

Bulk update (WI-31a) can change `categoryId` on N transactions at once. If any of those transactions have splits, the category change is meaningless (splits own their own categories). The spec should specify: **bulkUpdate silently skips the `categoryId` change for split parents** (or rejects them from the batch). This prevents silent data inconsistency.

#### I4 — `MovementRecord` wire type needs `hasSplits`

The Movements list renderer needs to show a split badge (FR7) and conditionally open the split editor instead of the edit form (UX-007 §4.1). This requires the `movementRecordSchema` in `movements.ts` to gain at least `hasSplits: z.boolean()` (and optionally `splitCount: z.number().int().nonnegative()`). The spec should specify this wire-level addition.

#### I5 — Notes interaction with splits

The spec is silent on how the existing notes system (WI-19: `tx.note.added` / `tx.note.edited` / `tx.note.deleted`) interacts with splits. Notes are keyed by `txId` — they attach to the parent transaction. Since splits have their own `comment` field, I recommend: **Notes remain parent-only. The comment field per split is the per-split annotation. This should be stated explicitly** to avoid Morpheus building a notes-per-split feature.

#### I6 — Event type naming convention mismatch

Existing flat-wire config events use PascalCase (`AccountCreated`, `CategoryUpdated`). Existing dot-notation events use lowercase (`tx.created`, `tx.updated`, `tx.note.added`). The new `tx.split` and `tx.split.removed` correctly follow dot-notation — good. But the spec's event shape (§6.1) uses the **envelope style** (`id`, `datasetId`, `actorDeviceId`, `createdAt`, `dekVersion`, `version`, `splits: [...]`). In the current codebase, some events use the envelope (`tx.created`, `tx.updated`) while others use flat wire style (`tx.note.added`, `tx.deleted`, `movement.imported`). The spec should explicitly state which pattern `tx.split` follows. **My recommendation: flat wire style** (like `tx.note.added`), with `splits` as a top-level field — simpler, no nested `payload`, consistent with the most recent event patterns.

---

### 🟢 Minor Notes

- **M1:** Open Question #2 (integer cents) — I **strongly recommend integer cents** for the `tx.split` event payload. The 0.001 EUR tolerance is a code smell for financial software. Store `amountCents: z.number().int().positive()` and let the renderer format. This doesn't require migrating existing events — only new split payloads use it.
- **M2:** Open Question #4 (split limit of 20) — 20 is fine for v1. Encode it as a constant, not a schema constraint, so it's easy to adjust.
- **M3:** The `freeTextField(500)` helper already exists in `transaction.ts` (line 65). The spec's IPC schemas should reference it rather than defining a new one.
- **M4:** Filter by category (FR10) — the spec says the parent row appears if ANY split matches. This is correct. The Movements list query (`movements:list`) will need a join against the splits map. Ensure this is in the touchpoint list.

---

### 🔒 Lock Questions for Pedro

These require product decisions before implementation can start:

1. **Integer cents in split payloads?** (SPEC Q2) — Neo recommends yes. This eliminates floating-point sum drift permanently. Affects only the `tx.split` event shape — existing `tx.created` amounts remain as-is (migration is separate, future work). **Decision needed: yes/no.**

2. **Edit parent amount after split?** (I2 above) — Neo recommends: reject the edit until splits are removed. The user sees "Remove split first to change the amount." **Decision needed: reject / auto-remove / cascade.**

3. **Bulk update on split parents?** (I3 above) — Neo recommends: silently skip category change for split parents in bulk update (log a warning). **Decision needed: skip / reject / apply-to-parent-only.**

4. **Milestone placement?** (SPEC Q1) — Neo recommends M2. Splits extend the core transaction model but are not part of the single-user MVP happy path (M1). They require the read-model pattern to be mature (it is, after WI-22/WI-23). **Decision needed: M1 / M2 / M3.**

5. **CSV export behavior for splits?** (SPEC Q3) — Neo recommends: individual rows in export (mirrors financial aggregation behavior). Parent row suppressed. Each export row shows the split amount + split category + parent's date/description. **Decision needed: individual-rows / annotated-parent.**

6. **Split comment length?** (SPEC Q5) — 500 chars is consistent with `description`. Neo agrees. **Decision needed: confirm 500.**

---

### Summary

Niobe delivered an exceptionally thorough spec pair (SPEC-023 + UX-007). The event model is clean, the UX is production-ready, and the traceability is exemplary. The three blocking issues (B1-B3) are factual mismatches with the current codebase — the spec assumes SQLite, individual encrypted files, and M2 crypto, none of which exist yet. B4 (integration points) is a seam map gap that would slow Morpheus down. The five important issues (I1-I5) are integration and edge-case gaps that need explicit answers in the spec before parallel dispatch.

Once Niobe revises B1-B4 and Pedro answers the 6 lock questions, this spec is ready for team dispatch: Morpheus (events + reducers + queries), Trinity (split editor modal + badge + aggregation wiring), Cypher (deterministic e2e tests), Mouse (badge icon + amount treatment).

---

*Neo — Lead / Architect · opentreasury-desktop*
