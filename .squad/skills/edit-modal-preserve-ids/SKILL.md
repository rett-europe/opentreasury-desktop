# Skill: Edit Modal Form State — Always Preserve Original IDs

## Context

When implementing edit modals for domain entities that have foreign-key relationships (e.g., transactions with category/subcategory IDs), the form state must be initialized with the actual **IDs** from the entity, not display labels or derived values.

## Problem Pattern

A common bug pattern:
1. Display layer shows labels ("Payroll", "Staff costs") for user readability
2. Edit modal receives entity data with those labels mixed in
3. Form state initialized with labels instead of IDs
4. On save, labels sent to backend → validation fails

Example bug from MovementsScreen (PR #103):
```typescript
// Display layer object
const row = { id: "...", category: "Payroll", subcategory: "Staff costs" };

// WRONG: Using display labels as IDs
const tx: RecentTransaction = {
  categoryId: row.category,        // "Payroll" (label, not ULID!)
  subcategoryId: row.subcategory,  // "Staff costs" (label, not ULID!)
};

// Form state gets labels, save fails with "String must contain exactly 26 character(s)"
```

## Solution Pattern

**Always initialize edit form state from the ID-bearing source layer**, not the display layer.

### 1. Identify the layers
- **Wire/Domain layer**: Contains actual IDs (e.g., `MovementRecord` with `categoryId: string`)
- **Display layer**: Contains labels (e.g., `Movement` with `category: string`)

### 2. Source from the ID layer when entering edit mode

```typescript
// ✅ CORRECT: Use the raw record (ID layer)
const record = rawRecordById.get(row.id);  // MovementRecord
const tx: RecentTransaction = {
  categoryId: record.categoryId,           // "01HCAT..." (ULID)
  subcategoryId: record.subcategoryId,     // "01HCAT..." (ULID)
  tagIds: record.tagIds,                   // ["01HTAG...", ...] (ULIDs)
};
```

### 3. Form state preserves IDs through the save cycle

```typescript
// Modal receives tx with ULIDs
function TransactionDetailModal({ transaction }) {
  const [categoryId, setCategoryId] = useState('');
  
  useEffect(() => {
    if (transaction) {
      // ✅ Form state gets ULIDs
      setCategoryId(transaction.categoryId ?? '');
      setSubcategoryId(transaction.subcategoryId ?? '');
    }
  }, [transaction]);

  const handleSave = async () => {
    // ✅ Save sends ULIDs (or undefined if empty)
    await onUpdate({
      categoryId: categoryId || undefined,
      subcategoryId: subcategoryId || undefined,
    });
  };
}
```

### 4. Display labels are resolved via lookup, not stored in state

```typescript
// ✅ CORRECT: Resolve labels for display from IDs
const category = categories.find((c) => c.id === transaction.categoryId);
const categoryLabel = category?.name ?? null;

// Display: {categoryLabel ?? 'None'}
```

## When This Applies

- ✅ Edit modals for transactions, invoices, contacts, etc. with FK relationships
- ✅ Bulk-edit panels (same principle: preserve IDs through the form cycle)
- ✅ Any component that receives data from both a display layer and needs to round-trip it to the backend

## When This Doesn't Apply

- ❌ Read-only views (can use labels directly, no save cycle)
- ❌ Create forms (no existing IDs to preserve)
- ❌ Filters/search (user selects from labels, but the filter state stores IDs before querying)

## Testing Pattern

Always test that IDs survive the edit→save cycle intact:

```typescript
it('preserves category ULIDs when saving without changes', async () => {
  const txWithCategory = {
    id: '01HZTX...',
    categoryId: '01HCAT00000000000000000001',
    subcategoryId: '01HCAT00000000000000000002',
  };

  const handleUpdate = vi.fn();
  render(<EditModal transaction={txWithCategory} onUpdate={handleUpdate} />);

  // Open edit mode
  fireEvent.click(screen.getByRole('button', { name: /Edit/i }));

  // Verify dropdowns pre-filled with ULIDs
  expect(document.getElementById('category-select').value).toBe('01HCAT00000000000000000001');

  // Save without changes
  fireEvent.click(screen.getByRole('button', { name: /Save/i }));

  // Assert ULIDs submitted intact
  await vi.waitFor(() => expect(handleUpdate).toHaveBeenCalled());
  expect(handleUpdate.mock.calls[0][0].categoryId).toBe('01HCAT00000000000000000001');
});
```

## References

- **Bug:** PR #103 — MovementsScreen transaction detail modal category/subcategory bug
- **Fix:** Always source edit form state from `rawRecordById` (ID layer) not `displayRows` (label layer)
- **Contracts:** `MovementRecord` (wire, IDs) vs `Movement` (display, labels) in `app/src/shared/ipc-contracts/movements.ts` and `app/src/renderer/types/movement.ts`
