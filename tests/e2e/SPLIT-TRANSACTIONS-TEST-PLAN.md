# Split Transactions Test Plan

> **Status:** Wave 1 (Anticipatory) — Created before backend IPC implementation  
> **Feature:** SPEC-023 Split Transactions  
> **Test Author:** Cypher  
> **Date:** 2026-04-29  
> **Related Issue:** #59  
> **Backend PR:** Pending (Morpheus implementing in parallel worktree)

---

## 1. Overview

This test plan maps acceptance criteria from SPEC-023 and UX-007 to concrete test scenarios. Tests are organized into **Wave 1 (anticipatory skeletons)** and **Wave 2 (wiring after IPC lands)**.

### Wave 1 Scope (This Document)
- Skeleton e2e tests with `test.skip()` for IPC-dependent scenarios
- Unit test plan for cents-arithmetic validation
- Performance validation notes
- Full test plan documentation

### Wave 2 Scope (After Morpheus's IPC PR)
- Wire IPC calls into skeleton tests
- Add actual assertions for split state
- Run full e2e suite against built binary
- Validate against the 1500ms mount budget

---

## 2. Test Taxonomy

### 2.1 Happy Path Tests
Tests that verify the primary split transaction flow works correctly.

| Test ID | Description | Acceptance Criteria | Wave |
|---------|-------------|---------------------|------|
| **HP-01** | Create a 2-part split (€300 + €200 = €500) | AC1, AC2 | Wave 2 |
| **HP-02** | Create a 3-part split with categories | AC1, AC3 | Wave 2 |
| **HP-03** | Split badge appears in movements list | AC4 | Wave 2 |
| **HP-04** | Totals strip uses split amounts, not parent | AC5 | Wave 2 |
| **HP-05** | Remove split returns to single-line | AC7 | Wave 2 |
| **HP-06** | Category filter includes parent if any split matches | AC6 | Wave 2 |
| **HP-07** | Split operations work offline | AC9 | Wave 2 |

### 2.2 Edge Cases — Cents Arithmetic
Tests that verify integer cents handling and rounding edge cases.

| Test ID | Description | Expected Result | Wave |
|---------|-------------|-----------------|------|
| **EC-01** | Split €1.00 as €0.33 + €0.33 + €0.34 | Sum = 100 cents ✅ Accepted | Wave 2 |
| **EC-02** | Split €1.00 as €0.33 + €0.33 + €0.33 | Sum = 99 cents ❌ Rejected (sum mismatch) | Wave 2 |
| **EC-03** | Split €1.00 as €0.34 + €0.34 + €0.34 | Sum = 102 cents ❌ Rejected (sum mismatch) | Wave 2 |
| **EC-04** | Split €500.00 exactly (no rounding edge) | Sum = 50000 cents ✅ Accepted | Wave 2 |
| **EC-05** | Negative amount (debit) split handling | Negative cents sum validation | Wave 2 |
| **EC-06** | Split with zero-amount child | ❌ Rejected (positive cents required) | Wave 2 |

### 2.3 Edge Cases — Boundary Conditions
Tests for min/max constraints and boundary values.

| Test ID | Description | Expected Result | Wave |
|---------|-------------|-----------------|------|
| **BC-01** | Single child split (degenerate case) | ❌ Rejected (min 2 required) | Wave 2 |
| **BC-02** | Empty children array | ❌ Rejected (min 2 required) | Wave 2 |
| **BC-03** | Maximum 20 splits | ✅ Accepted | Wave 2 |
| **BC-04** | 21 splits attempt | ❌ Rejected (max 20) | Wave 2 |
| **BC-05** | Child comment at 499 chars | ✅ Accepted | Wave 2 |
| **BC-06** | Child comment at 500 chars (exact limit) | ✅ Accepted | Wave 2 |
| **BC-07** | Child comment at 501 chars | ❌ Rejected (max 500) | Wave 2 |
| **BC-08** | Split without categories (all nullable) | ✅ Accepted | Wave 2 |

### 2.4 Error State Tests
Tests that verify error handling and validation.

| Test ID | Description | Expected Result | Wave |
|---------|-------------|-----------------|------|
| **ES-01** | Parent amount edit when split exists | Error code `TX_HAS_ACTIVE_SPLITS` | Wave 2 |
| **ES-02** | Amount field disabled in edit form | UI shows disabled field + tooltip | Wave 2 |
| **ES-03** | Bulk update skips split parents | Response: `{applied, skipped, skippedReasons}` | Wave 2 |
| **ES-04** | Bulk update reports skip count | Response includes `skippedSplitParentCount` | Wave 2 |
| **ES-05** | Split on deleted transaction | ❌ Rejected (FR1) | Wave 2 |
| **ES-06** | Split on pending transaction | ❌ Rejected (FR1) | Wave 2 |
| **ES-07** | Delete parent deletes splits | AC8 — splits removed from all views | Wave 2 |

### 2.5 UI/UX Tests
Tests for keyboard navigation, accessibility, and i18n.

| Test ID | Description | Expected Result | Wave |
|---------|-------------|-----------------|------|
| **UX-01** | Keyboard-only split creation | Tab/Enter navigates and submits | Wave 2 |
| **UX-02** | ARIA live regions announce totals | Screen reader feedback on sum changes | Wave 2 |
| **UX-03** | Escape key closes modal | With unsaved-changes confirmation if needed | Wave 2 |
| **UX-04** | All strings available in ES + EN | AC10 i18n compliance | Wave 2 |
| **UX-05** | Focus trap within modal | Focus stays in modal until dismissed | Wave 2 |
| **UX-06** | Running total strip updates live | Amount keystroke triggers total recalc | Wave 2 |
| **UX-07** | Save button disabled until valid | Enabled only when sum = parent & ≥2 splits | Wave 2 |

### 2.6 Aggregation & Financial Views
Tests for correct aggregation in Saldo, Panel, Movements totals.

| Test ID | Description | Expected Result | Wave |
|---------|-------------|-----------------|------|
| **AG-01** | Movements totals strip uses split amounts | AC5 | Wave 2 |
| **AG-02** | Saldo category breakdown shows per-split | AC5 | Wave 2 |
| **AG-03** | Panel expense/income by category | Split amounts in correct buckets | Wave 2 |
| **AG-04** | Parent amount NOT counted when splits exist | FR9 | Wave 2 |
| **AG-05** | Unsplit transaction uses parent amount | Single-element aggregation | Wave 2 |

### 2.7 CSV Export (Future Feature)
Tests for when CSV export ships — document the contract now.

| Test ID | Description | Expected Result | Wave |
|---------|-------------|-----------------|------|
| **EX-01** | Export emits one row per split child | Parent envelope not exported separately | Wave 3 (future) |
| **EX-02** | Each row has parent date + child amount/category | Reconciliation-friendly shape | Wave 3 (future) |

**Note:** CSV export is not yet implemented. These tests are placeholders to document the intended contract (SPEC-023 §6.6).

---

## 3. Pedro's Lock Requirements — Test Coverage Matrix

Pedro specified 6 critical invariants that MUST be tested:

| Lock | Requirement | Test Coverage |
|------|-------------|---------------|
| **Lock 1** | Integer cents — children sum EQUALS parent in cents | EC-01 through EC-06, unit tests (§5) |
| **Lock 2** | Parent amount edit rejected when split exists | ES-01, ES-02 |
| **Lock 3** | Bulk update skips split parents — reports skip count | ES-03, ES-04 |
| **Lock 4** | M1 — no crypto assumptions | All tests plaintext-only; encryption deferred to M2 |
| **Lock 5** | CSV export one row per child | EX-01, EX-02 (Wave 3, future) |
| **Lock 6** | 500-char limit on child comment | BC-05, BC-06, BC-07 |

---

## 4. Performance Budget Validation

**Constraint:** MovementsScreen with split children must mount within the existing **1500ms** budget (established in `movements-perf.spec.ts`).

### Test Approach (Wave 2)
1. Seed 5000 transactions with 10% split (500 split parents, avg 3 children each = 1500 split records)
2. Run existing `movements-perf.spec.ts` with split-heavy dataset
3. Verify median mount time ≤ 1500ms
4. If violated: profile and optimize before landing

**Risk:** Rendering split badges + `hasSplits` checks might add latency. Mitigations:
- `splitParentIds` is a Set (O(1) lookup)
- Badge rendering is conditional (low DOM cost)
- Virtual table already handles 5000 rows efficiently

**Action for Wave 2:** Add a note in `movements-perf.spec.ts` that validates split-heavy datasets don't regress.

---

## 5. Unit Test Plan — Cents Arithmetic

**File:** `tests/unit/split-cents.test.md` (planning doc; actual tests in Morpheus's reducer file)

### 5.1 Sum Validation Tests

```typescript
// Test: 100 cents split as 33+33+34 = 100 ✅
expect(validateSplitSum([33, 33, 34], 100)).toBe(true);

// Test: 100 cents split as 33+33+33 = 99 ❌
expect(validateSplitSum([33, 33, 33], 100)).toBe(false);

// Test: 100 cents split as 34+34+34 = 102 ❌
expect(validateSplitSum([34, 34, 34], 100)).toBe(false);

// Test: Negative amounts (debits) — sum with sign preserved
expect(validateSplitSum([-300, -200], -500)).toBe(true);

// Test: Zero-amount child — should be rejected (positive constraint)
expect(() => validateSplitSum([0, 100], 100)).toThrow('positive cents required');

// Test: Empty children array
expect(() => validateSplitSum([], 100)).toThrow('min 2 splits required');

// Test: Single child = parent amount (degenerate split)
expect(() => validateSplitSum([100], 100)).toThrow('min 2 splits required');

// Test: Mixed positive/negative (invalid for split context)
expect(() => validateSplitSum([300, -100], 200)).toThrow('all splits must have same sign as parent');
```

### 5.2 Cents ↔ EUR Conversion Tests

```typescript
// Test: EUR to cents roundtrip
expect(eurToCents(123.45)).toBe(12345);
expect(centsToEur(12345)).toBe(123.45);

// Test: Rounding edge cases
expect(eurToCents(0.335)).toBe(34);  // Math.round(0.335 * 100) = 34 (banker's rounding)
expect(eurToCents(0.334)).toBe(33);

// Test: Parent amount conversion for comparison
expect(Math.round(500.00 * 100)).toBe(50000);
```

### 5.3 Open Questions for Spec/Niobe
- **Q1:** Should zero-amount splits be allowed? Current spec says `amountCents: z.number().int().positive()` (no). Confirm this is correct for the use case (e.g., zero-cost allocation rows).
- **Q2:** Should single-child "degenerate split" be allowed? Spec says min 2 (FR2). Rationale: if user wants single-line, they should unsplit instead.
- **Q3:** Negative split amounts: spec doesn't explicitly forbid them, but all examples are positive. Should debits (negative parent) have negative split children? **Assumption:** Yes — sign propagates from parent.

---

## 6. Wave 2 Wiring Checklist

Before running Wave 2 tests, Morpheus's IPC PR must land with:

- [x] `tx:split` IPC channel (create/update split)
- [x] `tx:split:remove` IPC channel (remove split)
- [x] `tx:split:get` IPC channel (fetch existing splits)
- [x] `movementRecordSchema` extended with `hasSplits` + `splitCount`
- [x] Error code `TX_HAS_ACTIVE_SPLITS` in `transaction.ts`
- [x] Bulk update response includes `skippedSplitParentCount`
- [x] Read-model reducer handles `tx.split` and `tx.split.removed` events
- [x] `effectiveAmounts()` helper in queries.ts
- [x] All 5 query touchpoints updated (balances, KPIs, sparklines, saldo, movements)

**Open Question for Wave 2:** What are the final IPC error codes for validation failures? Placeholder assumptions:
- `SPLIT_SUM_MISMATCH` — sum of children ≠ parent amount
- `MIN_SPLITS_REQUIRED` — fewer than 2 splits
- `MAX_SPLITS_EXCEEDED` — more than 20 splits
- `TX_HAS_ACTIVE_SPLITS` — attempt to edit parent amount (confirmed in spec)

---

## 7. Test Execution Notes

### Running the Tests

**Wave 1 (Now):**
```bash
npm run lint  # Verify skeletons compile
```

**Wave 2 (After IPC lands):**
```bash
npm run build  # Build Electron binary first
npm run e2e    # Run full Playwright suite
```

### Test Data Setup
- Use existing `perf-seed.mjs` pattern for bulk data
- Create `split-seed.mjs` for split-specific scenarios (500 split parents, varied child counts)
- Fixtures for boundary tests (499/500/501 char comments, 20-split tx, etc.)

### Known Gaps
- **Playwright-for-Electron state:** E2E tests require `npm run build` first (dist/ must exist). This is expected per Cypher's history §2026-04-25.
- **No crypto testing:** All tests are plaintext-only (M1 scope). Encryption is uniformly deferred to M2.

---

## 8. Traceability

| Spec Requirement | Test Coverage |
|------------------|---------------|
| **FR1** — Split confirmed tx only | ES-05, ES-06 |
| **FR2** — Min 2 splits | BC-01, BC-02, unit tests |
| **FR3** — Sum equals parent (cents) | EC-01 through EC-06, unit tests |
| **FR4** — Child fields (cents, cat, comment) | HP-02, BC-05-BC-07 |
| **FR5** — Persisted as `tx.split` event | Integration tests (not in this e2e scope) |
| **FR6** — Remove all splits | HP-05 |
| **FR7** — Split badge in list | HP-03 |
| **FR8** — No split rows in list | HP-03 |
| **FR9** — Aggregations use split amounts | AG-01 through AG-05 |
| **FR10** — Category filter | HP-06 |
| **FR11** — Splits inherit parent date/account/type | HP-02 (implicit) |
| **FR12** — Delete parent deletes splits | ES-07 |
| **FR13** — i18n ES + EN | UX-04 |
| **FR14** — Reject parent amount edit | ES-01, ES-02 |
| **FR15** — Bulk update skips splits | ES-03, ES-04 |
| **FR16** — Notes on parent only | Not tested (out of scope) |
| **AC1–AC15** | See §2 taxonomy |

---

## 9. Changelog

| Date | Change | By |
|------|--------|-----|
| 2026-04-29 | Initial Wave 1 anticipatory test plan | Cypher |

---

**Next Steps:**
1. ✅ Create skeleton e2e test files (this plan complete)
2. ⏳ Await Morpheus's IPC PR landing
3. ⏳ Wire IPC calls into skeletons (Wave 2)
4. ⏳ Validate against perf budget with split-heavy dataset
5. ⏳ Run full suite on Windows + macOS (CI validation)
