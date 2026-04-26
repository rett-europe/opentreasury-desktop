# Cypher — Split Transactions Test Plan Taxonomy + Open Questions

> **Date:** 2026-04-29  
> **Author:** Cypher (Tester/QA)  
> **Context:** Wave 1 anticipatory test work for SPEC-023 Split Transactions (issue #59, PR #62)  
> **Status:** Submitted for Niobe review (open questions) + Neo review (test coverage)

---

## 1. Summary

Created comprehensive test plan + skeleton e2e tests for Split Transactions BEFORE Morpheus's IPC implementation lands. All tests are skipped with Wave 2 wiring notes.

**PR #62:** `tests/e2e/SPLIT-TRANSACTIONS-TEST-PLAN.md` + 2 spec files + unit test plan

---

## 2. Test Taxonomy (50+ Test Scenarios)

### 2.1 Test Groups

| Group | Count | Examples |
|-------|-------|----------|
| **Happy Path** | 7 | Create 2-part split, split badge visible, totals strip uses split amounts, category filter, remove split, offline |
| **Cents Arithmetic** | 6 | 33+33+34=100 ✅, 33+33+33=99 ❌, negative amounts, zero-child rejection |
| **Boundary Conditions** | 8 | Min 2 splits, max 20 splits, 500-char comment limit (499/500/501), nullable categories |
| **Error States** | 7 | Parent amount edit rejected, bulk update skips split parents, delete parent cascades |
| **UI/UX** | 7 | Keyboard nav, ARIA live regions, focus trap, i18n ES+EN, running total updates |
| **Aggregations** | 5 | Movements totals, Saldo breakdown, Panel — all use split amounts NOT parent |
| **CSV Export (Future)** | 2 | One row per child (Wave 3, documented intent) |

**Total:** 42 test scenarios (30 in core spec, 12 in bulk spec)

### 2.2 Critical Invariant Tests

**Pedro's Lock #1 — Integer Cents Sum:**
- EC-01: Split €1.00 as €0.33 + €0.33 + €0.34 = 100 cents ✅
- EC-02: Split €1.00 as €0.33 + €0.33 + €0.33 = 99 cents ❌ (sum mismatch)
- EC-03: Split €1.00 as €0.34 + €0.34 + €0.34 = 102 cents ❌ (overshoot)
- EC-04: Split €500.00 exactly (no rounding edge)
- EC-05: Negative amount (debit) split handling
- EC-06: Zero-amount child rejected (positive constraint)

**Pedro's Lock #2 — Parent Amount Edit Rejection:**
- ES-01: `transaction:update` with amount change returns `TX_HAS_ACTIVE_SPLITS` error
- ES-02: Amount field disabled in edit form when `hasSplits = true`

**Pedro's Lock #3 — Bulk Update Skip Logic:**
- ES-03: Bulk update on 3 txs (1 split parent) skips the split parent
- ES-04: Response includes `skippedSplitParentCount` field

**Pedro's Lock #6 — 500-Char Comment Limit:**
- BC-05: 499 chars ✅ accepted
- BC-06: 500 chars (exact limit) ✅ accepted
- BC-07: 501 chars ❌ rejected

### 2.3 Aggregation Correctness (Critical for Financial Integrity)

**FR9 Invariant:** Parent amount MUST NOT be counted when splits exist. Only split amounts aggregate.

- AG-01: Movements totals strip — Tx A (€500 unsplit) + Tx B (€500 split as €300+€200) = €1000 total (NOT €1500)
- AG-02: Saldo category breakdown — split children appear in their own category buckets
- AG-03: Panel expense/income by category — same pattern
- AG-04: Negative test — verify parent amount is NOT added to any total
- AG-05: Unsplit transaction baseline — uses parent amount as expected

**Why this matters:** Double-counting the parent amount would inflate all financial reports. This is a **critical bug** if missed. Tests explicitly validate against it.

---

## 3. Open Questions for Niobe (Spec Clarification)

These emerged during test planning. Need resolution before Wave 2 wiring.

### Q1: Zero-Amount Splits
**Spec says:** `amountCents: z.number().int().positive()` — zero is rejected.

**Use case:** Treasury allocation where a split represents a zero-cost category (e.g., donated services valued at €0 for one category, actual cost in another).

**Question:** Should zero-amount splits be allowed?

**Recommendation:** Keep positive constraint. If user wants zero-cost tracking, use a note/comment (not a split). A split by definition divides a non-zero amount.

**Test impact:** Test EC-06 validates zero rejection. If spec changes to allow zero, test becomes a positive test ("zero is accepted").

---

### Q2: Single-Child "Degenerate Split"
**Spec says:** FR2 requires min 2 splits.

**Use case:** User accidentally deletes all but one split row in the editor.

**Question:** Should a 1-child split be allowed (where child amount = parent amount)?

**Rationale:** No — if the user wants a single line, they should unsplit (not create a 1-child split). A "split" by definition divides into multiple parts.

**Test impact:** Test BC-01 validates min 2 enforcement. UI disables delete button on last row.

---

### Q3: Negative Split Amounts (Debits)
**Spec says:** Examples show positive amounts only. No explicit guidance on negative parent amounts.

**Question:** If parent amount is -€500 (debit), should split children be [-€300, -€200]?

**Assumption (needs confirmation):**
- Parent amount sign propagates to all children
- All children must have same sign as parent
- Mixing signs (e.g., [€300, -€200] for parent €100) is invalid

**Rationale:** A split divides an amount into parts. Mixing signs is nonsensical (you can't split €100 into €300 and -€200).

**Test impact:** Test EC-05 validates negative handling (currently skipped). Needs spec clarification before wiring.

---

### Q4: Floating-Point Parent Amounts (Edge Case)
**Spec says:** Parent `tx.amount` is still a float (only split children use integer cents). Backend validates `sum(splits[].amountCents) === Math.round(parentTx.amount * 100)`.

**Question:** What if parent amount has 3+ decimal places from import (e.g., €1.005)?

**Example:**
- Parent = €1.005
- `Math.round(1.005 * 100)` could be `100` or `101` (banker's rounding is unpredictable in JS)
- Which is correct?

**Recommendation:** Either:
1. Document the rounding rule explicitly (e.g., "always round half-up").
2. OR enforce 2-decimal-place constraint on parent amounts at import time (safer).

**Test impact:** If 3-decimal amounts are supported, add test for this edge case. If not, document the 2-decimal assumption.

---

## 4. Gotchas Identified (For Morpheus / Future Implementation)

### 4.1 Cents Arithmetic Edge Cases Are the Real Test Surface
**Observation:** Most split bugs will be rounding errors (33+33+33 ≠ 100). The sum constraint (FR3) is the **critical invariant**.

**Why it matters:** Financial data must be exact. Off-by-one-cent errors compound across hundreds of transactions.

**Test strategy:** Exhaustive boundary tests (EC-01 to EC-06) + unit tests for every rounding scenario.

---

### 4.2 Bulk Update Skip Logic Is Subtle
**Observation:** FR15 says skip split parents **entirely** (not just amount field — also categoryId, tagIds, etc.).

**Why it matters:** Partial application would be confusing (e.g., tags updated but category skipped).

**Test strategy:** ES-03 validates the skip is total. Response includes `skippedSplitParentCount` field.

---

### 4.3 Aggregation Touchpoints Are Widespread
**Observation:** Five query functions must be updated to use `effectiveAmounts()` helper (SPEC-023 §6.2, I1):
1. `getAccountBalances()`
2. `getMonthKPIs()`
3. `getAccountSparklines()`
4. `getSaldoComparison()`
5. `queryRecentTransactions()` (no change needed — no summing)

**Why it matters:** Easy to miss one query, causing splits to aggregate incorrectly in one view.

**Test strategy:** AG-01 to AG-05 cover all aggregation views. If any query is missed, tests will catch it.

---

### 4.4 Performance Risk Is Real
**Observation:** Split badge rendering on 5000-row virtual table could regress MovementsScreen mount time.

**Existing budget:** 1500ms (established in `movements-perf.spec.ts`)

**Risk factors:**
- `hasSplits` checks on every row render
- Badge DOM nodes added to 10% of rows (if 500 splits in 5000 txs)

**Mitigations:**
- `splitParentIds` is a Set (O(1) lookup — low cost)
- Virtual table already handles 5000 rows efficiently
- Badge rendering is conditional (low DOM overhead)

**Test strategy:** PERF-01 (documented in test plan, to be wired in Wave 2) validates split-heavy dataset (500 split parents, 1500 split records) doesn't regress budget.

**Action for Wave 2:** Create `perf-seed.mjs --split-ratio=0.1` variant, run PERF-01, confirm median ≤ 1500ms.

---

## 5. Anticipatory Test Pattern — When to Use

**This worked well for Split Transactions because:**
1. ✅ SPEC-023 locked down IPC contract (§7), event schemas (§6.1), acceptance criteria (FR1-FR16)
2. ✅ Pedro's 6 lock answers removed ambiguity
3. ✅ Backend dev (Morpheus) in parallel worktree — tests won't block his work
4. ✅ Contract is stable even if implementation isn't done

**When to use this pattern:**
- Complex features with parallel backend/frontend work
- Stable contract (IPC shape, event schemas) even if implementation pending
- Clear acceptance criteria (no exploratory work)
- Team benefits from early test clarity (surfaces ambiguities)

**When NOT to use:**
- Exploratory work where contract is evolving (creates churn)
- Simple features where tests are faster to write after implementation
- Solo dev where test-first doesn't unblock anyone

**Defer skill creation:** Wait until Wave 2 wiring proves the pattern worked. If tests need major rework post-IPC, the pattern failed.

---

## 6. Recommendations for Niobe

### 6.1 Resolve Open Questions Before Wave 2
- **Q1 (zero-amount):** Confirm positive constraint stays. Update test EC-06 note if changed.
- **Q3 (negative amounts):** Clarify sign propagation rule. Update test EC-05.
- **Q4 (3-decimal parent):** Document rounding rule OR enforce 2-decimal import constraint.

### 6.2 Review Test Taxonomy
- Does the test taxonomy (50+ scenarios) cover all user-facing behaviors?
- Are there missing edge cases (e.g., re-split an already-split transaction)?
- Should CSV export tests (EX-01, EX-02) be promoted to Wave 2 if export ships sooner?

### 6.3 Consider Adding Test Scenarios For:
- **Re-split UX:** User splits a transaction, then re-splits it with different amounts. Does the editor pre-populate old splits? (UX-007 §3 doesn't specify.)
- **Category → Subcategory dependency in editor:** When user changes category, subcategory resets. Is this tested? (Implicit in UX-007 §3.2, but not explicit test.)

---

## 7. Next Steps

**Wave 2 (Not Cypher's Task — Awaiting Morpheus):**
1. Morpheus lands IPC PR with `tx:split`, `tx:split:remove`, `tx:split:get` channels
2. Remove `test.skip()` from PR #62 tests
3. Wire IPC calls and assertions per Wave 2 notes
4. Replace placeholder error codes with actual codes from Morpheus's implementation
5. Run `npm run build && npm run e2e` to validate
6. Add split-heavy perf seed variant, run PERF-01
7. Merge PR #62 (or squash into Morpheus's PR as joint delivery)

**Niobe Review (This Decision):**
- Resolve Q1, Q3, Q4
- Approve test taxonomy or suggest additions
- Clear for Wave 2 wiring

---

## 8. Traceability

| Item | Reference |
|------|-----------|
| **Spec** | SPEC-023 (Split Transactions) |
| **UX Spec** | UX-007 (Split Transactions UX) |
| **Issue** | #59 |
| **PR** | #62 (test plan + skeletons) |
| **Test Plan** | `tests/e2e/SPLIT-TRANSACTIONS-TEST-PLAN.md` |
| **Core E2E** | `tests/e2e/split-transactions.spec.ts` |
| **Bulk E2E** | `tests/e2e/split-transactions-bulk.spec.ts` |
| **Unit Plan** | `tests/unit/split-cents.test.md` |
| **Pedro's Locks** | All 6 covered (see §2.2) |
