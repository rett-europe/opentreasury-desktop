# Split Transactions — Unit Test Plan (Cents Arithmetic)

> **Status:** Wave 1 (Planning only)  
> **Actual tests location:** Will be in Morpheus's reducer/handler files  
> **Purpose:** Document the unit test scenarios for split cents validation  
> **Test Author:** Cypher  
> **Date:** 2026-04-29

---

## 1. Overview

This document outlines unit test scenarios for the **cents arithmetic layer** in split transactions. These tests validate the core invariant: **sum of split amounts in cents MUST equal parent amount in cents** (SPEC-023 FR3, Pedro Lock #1).

Actual unit tests will be written by Morpheus in:

- `app/src/core/query/reducers.test.ts` (reducer logic)
- `app/src/main/ipc/handlers/transaction-splits.test.ts` (command handler validation)

---

## 2. Test Scenarios

### 2.1 Sum Validation Tests

These tests verify the integer cents sum constraint.

```typescript
// Test: 100 cents split as 33+33+34 = 100 ✅
test('split €1.00 as €0.33 + €0.33 + €0.34 is valid', () => {
  const parent = { amount: 1.0 }; // €1.00
  const splits = [
    { amountCents: 33 }, // €0.33
    { amountCents: 33 }, // €0.33
    { amountCents: 34 }, // €0.34
  ];
  const result = validateSplitSum(splits, parent);
  expect(result.valid).toBe(true);
  expect(result.sum).toBe(100);
});

// Test: 100 cents split as 33+33+33 = 99 ❌
test('split €1.00 as €0.33 + €0.33 + €0.33 is invalid (sum mismatch)', () => {
  const parent = { amount: 1.0 };
  const splits = [{ amountCents: 33 }, { amountCents: 33 }, { amountCents: 33 }];
  const result = validateSplitSum(splits, parent);
  expect(result.valid).toBe(false);
  expect(result.sum).toBe(99);
  expect(result.expected).toBe(100);
  expect(result.error).toBe('SPLIT_SUM_MISMATCH');
});

// Test: 100 cents split as 34+34+34 = 102 ❌
test('split €1.00 as €0.34 + €0.34 + €0.34 is invalid (overshoots)', () => {
  const parent = { amount: 1.0 };
  const splits = [{ amountCents: 34 }, { amountCents: 34 }, { amountCents: 34 }];
  const result = validateSplitSum(splits, parent);
  expect(result.valid).toBe(false);
  expect(result.sum).toBe(102);
  expect(result.expected).toBe(100);
});

// Test: Negative amounts (debits) — sum with sign preserved
test('split -€5.00 as -€3.00 + -€2.00 is valid (negative parent)', () => {
  const parent = { amount: -5.0 }; // Debit
  const splits = [
    { amountCents: -300 }, // -€3.00
    { amountCents: -200 }, // -€2.00
  ];
  const result = validateSplitSum(splits, parent);
  expect(result.valid).toBe(true);
  expect(result.sum).toBe(-500);
});

// Test: Zero-amount child — should be rejected (positive constraint)
test('split with zero-amount child is invalid', () => {
  const parent = { amount: 5.0 };
  const splits = [
    { amountCents: 0 }, // ❌ Zero not allowed
    { amountCents: 500 },
  ];
  expect(() => validateSplitSum(splits, parent)).toThrow('amountCents must be positive');
});

// Test: Empty children array
test('split with empty children array is invalid', () => {
  const parent = { amount: 5.0 };
  const splits = [];
  expect(() => validateSplitSum(splits, parent)).toThrow('min 2 splits required');
});

// Test: Single child = parent amount (degenerate split)
test('split with single child is invalid', () => {
  const parent = { amount: 5.0 };
  const splits = [{ amountCents: 500 }];
  expect(() => validateSplitSum(splits, parent)).toThrow('min 2 splits required');
});

// Test: Mixed positive/negative (invalid for split context)
test('split with mixed sign children is invalid', () => {
  const parent = { amount: 2.0 };
  const splits = [
    { amountCents: 300 }, // Positive
    { amountCents: -100 }, // Negative
  ];
  expect(() => validateSplitSum(splits, parent)).toThrow(
    'all splits must have same sign as parent',
  );
});
```

---

### 2.2 Cents ↔ EUR Conversion Tests

These tests verify the UI edge conversion helpers are precise.

```typescript
// Test: EUR to cents roundtrip
test('EUR to cents conversion is precise', () => {
  expect(eurToCents(123.45)).toBe(12345);
  expect(eurToCents(0.01)).toBe(1);
  expect(eurToCents(500.0)).toBe(50000);
});

test('cents to EUR conversion is precise', () => {
  expect(centsToEur(12345)).toBe(123.45);
  expect(centsToEur(1)).toBe(0.01);
  expect(centsToEur(50000)).toBe(500.0);
});

// Test: Roundtrip is lossless
test('EUR → cents → EUR roundtrip is lossless', () => {
  const original = 123.45;
  const roundtrip = centsToEur(eurToCents(original));
  expect(roundtrip).toBe(original);
});

// Test: Rounding edge cases
test('EUR to cents rounds correctly', () => {
  expect(eurToCents(0.335)).toBe(34);
  expect(eurToCents(0.334)).toBe(33);
  expect(eurToCents(0.336)).toBe(34);
});

// Test: Parent amount conversion for comparison
test('parent amount converted to cents for comparison', () => {
  const parentAmount = 500.0;
  const parentCents = Math.round(parentAmount * 100);
  expect(parentCents).toBe(50000);
});

// Test: Floating-point drift prevention
test('cents arithmetic avoids float drift', () => {
  const a = 0.1;
  const b = 0.2;
  const floatSum = a + b; // 0.30000000000000004 ❌

  const aCents = eurToCents(a); // 10
  const bCents = eurToCents(b); // 20
  const centsSum = aCents + bCents; // 30 ✅
  const eurSum = centsToEur(centsSum); // 0.30 ✅

  expect(floatSum).not.toBe(0.3);
  expect(eurSum).toBe(0.3);
});
```

---

## 3. Open Questions for Spec/Niobe

### Q1: Zero-amount splits

**Current spec:** `amountCents: z.number().int().positive()` — zero is rejected.

**Recommendation:** Keep positive constraint.

---

### Q2: Single-child "degenerate split"

**Current spec:** FR2 says min 2 splits required.

**Rationale:** If the user wants a single line, they should unsplit.

---

### Q3: Negative split amounts

**Assumption (needs confirmation):**

- Parent amount = -€500 (debit) → children = [-€300, -€200]
- Sign propagates from parent

**Test impact:** Test EC-05 validates negative handling.

---

## 4. Traceability

| Test Scenario                   | Spec Reference | Pedro Lock |
| ------------------------------- | -------------- | ---------- |
| Sum validation (100 = 33+33+34) | FR3, AC2       | Lock #1    |
| Zero-amount rejection           | FR4            | Lock #1    |
| Empty/single-child rejection    | FR2            | —          |
| Cents conversion                | FR4            | Lock #1    |
