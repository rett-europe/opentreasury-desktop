---
name: "transactions-table"
description: "Shared TransactionsTable component with lookup-map props pattern"
domain: "component-architecture"
confidence: "medium"
source: "earned (applied in MovementsScreen + PanelScreen)"
---

## Context

When multiple screens need to render the same table structure (transaction lists with columns for type, date, account, description, category, subcategory, tags, status, amount), extract a shared component instead of duplicating JSX and CSS.

The TransactionsTable component demonstrates the lookup-map prop pattern: instead of taking screen-specific types like `Movement[]` or `RecentTransaction[]`, it accepts:
1. A normalized `TransactionRow[]` shape (IDs only, no labels)
2. Lookup maps (`accountLookup`, `tagLookup`, `categoryLookup`, `subcategoryLookup`) that resolve IDs → display data

Each screen maps its native type to the shared `TransactionRow` at the boundary, builds lookup maps once from reference data, and passes both to the table.

This pattern works when:
- Multiple screens show the same visual structure (column order, widths, cell rendering)
- Screens have different data sources (IPC queries, local state) but equivalent semantics
- The table doesn't own data fetching, filtering, or sorting — caller handles

## Patterns

### 1. Define a Normalized Row Type

The shared component takes a minimal row shape with IDs only:

```typescript
export interface TransactionRow {
  readonly id: string;
  readonly date: string;
  readonly type: TransactionRowType;
  readonly amount: number;
  readonly description: string;
  readonly accountId: string;        // ID, not label
  readonly categoryId: string | null;
  readonly subcategoryId: string | null;
  readonly tagIds: readonly string[];  // IDs, not names
  readonly status: TransactionRowStatus;
  readonly reference?: string | null;
  readonly details?: string | null;
  readonly hasSplits?: boolean;
  readonly splitCount?: number;
}
```

This is the canonical shape both screens agree on. Screens map their native types (Movement, RecentTransaction, SearchResult, etc.) to this shape.

### 2. Pass Lookup Maps as Props

Instead of baking labels into the row type, the table takes lookup maps:

```typescript
export interface LookupItem {
  readonly name: string;
  readonly color: string;
}

export interface TransactionsTableProps {
  readonly rows: readonly TransactionRow[];
  readonly accountLookup: ReadonlyMap<string, LookupItem>;
  readonly tagLookup: ReadonlyMap<string, LookupItem>;
  readonly categoryLookup: ReadonlyMap<string, string>;
  readonly subcategoryLookup: ReadonlyMap<string, string>;
  // ... other props
}
```

Cells render by looking up IDs:

```tsx
const account = accountLookup.get(row.accountId);
const label = account?.name ?? 'Unknown Account';
const color = account?.color ?? '#888888';
```

### 3. Build Lookups Once at the Screen Level

Each screen builds lookup maps from its reference data:

```typescript
const accountLookup = useMemo(() => {
  const map = new Map<string, { name: string; color: string }>();
  for (const acc of accounts) {
    map.set(acc.id, {
      name: acc.bankNameShort ?? acc.accountLabel,
      color: acc.color ?? '#888888',
    });
  }
  return map;
}, [accounts]);

const categoryLookup = useMemo(() => {
  const map = new Map<string, string>();
  for (const cat of categories) {
    map.set(cat.id, cat.name);
  }
  return map;
}, [categories]);

const subcategoryLookup = useMemo(() => {
  const map = new Map<string, string>();
  for (const cat of categories) {
    for (const sub of cat.subcategories ?? []) {
      map.set(sub.id, sub.name);
    }
  }
  return map;
}, [categories]);

const tagLookup = useMemo(() => {
  const map = new Map<string, { name: string; color: string }>();
  for (const tag of tags) {
    map.set(tag.id, { name: tag.name, color: tag.color ?? '#9b72cf' });
  }
  return map;
}, [tags]);
```

This happens once when reference data loads. The maps stay stable across re-renders unless the underlying arrays change.

### 4. Map Screen's Native Type → TransactionRow at Boundary

Each screen has its own data type (Movement, RecentTransaction). Map it to TransactionRow:

```typescript
// MovementsScreen (from MovementRecord[])
const transactionRows = useMemo(() => {
  if (state.kind !== 'loaded') return [];
  return state.rawRecords.map((record) => ({
    id: record.id,
    date: record.date,
    type: record.type,
    amount: record.amount,
    description: record.description,
    accountId: record.accountId,
    categoryId: record.categoryId,
    subcategoryId: record.subcategoryId,
    tagIds: record.tagIds,
    status: record.status,
    reference: record.reference ?? null,
    details: record.details ?? null,
    hasSplits: record.hasSplits,
    splitCount: record.splitCount,
  }));
}, [state]);

// PanelScreen (from RecentTransaction[])
const transactionRows = useMemo(() => {
  return transactions.map((tx) => ({
    id: tx.id,
    date: tx.date,
    type: tx.type,
    amount: tx.amount,
    description: tx.description,
    accountId: tx.accountId,
    categoryId: tx.categoryId,
    subcategoryId: tx.subcategoryId,
    tagIds: tx.tagIds,
    status: tx.status,
    reference: tx.reference ?? null,
    details: tx.details ?? null,
  }));
}, [transactions]);
```

The mapping happens once per data refresh. The table doesn't know or care about Movement vs RecentTransaction — it only sees TransactionRow.

### 5. Optional Features via Boolean Props

When screens need different table variants (with/without select column, with/without split modal), use optional boolean props:

```typescript
export interface TransactionsTableProps {
  readonly showSelectColumn?: boolean;  // Movements: true, Dashboard: false
  readonly selectedIds?: ReadonlySet<string>;
  readonly onToggleRow?: (id: string) => void;
  readonly onToggleAll?: () => void;
  readonly onSplitClick?: (row: TransactionRow) => void;
  // ...
}
```

The component conditionally includes columns/callbacks:

```typescript
const columns: TableColumn<TransactionRow>[] = [
  ...(showSelectColumn
    ? [{ id: 'select', header: <input ... />, render: (row) => <input ... /> }]
    : []),
  // other columns
];
```

### 6. Canonical CSS in Component, Not Screen

Column widths, table-layout, cell truncation live in `TransactionsTable.css`:

```css
/* WITH SELECT COLUMN */
.ot-transactions-table--with-select .ot-table {
  table-layout: fixed;
  width: 100%;
  min-width: 1012px;
}

.ot-transactions-table--with-select .ot-table th:nth-child(1),
.ot-transactions-table--with-select .ot-table td:nth-child(1) {
  width: 32px;
  max-width: 32px;
}

/* NO SELECT COLUMN */
.ot-transactions-table .ot-table {
  table-layout: fixed;
  width: 100%;
  min-width: 980px;
}

.ot-transactions-table .ot-table th:nth-child(1),
.ot-transactions-table .ot-table td:nth-child(1) {
  width: 32px;
  max-width: 32px;
}
```

Screen CSS files no longer duplicate nth-child rules. They only own wrappers (overflow-x, flex containers).

## Examples

**MovementsScreen usage:**

```tsx
<div className="ot-movements__table-container">
  <TransactionsTable
    rows={sortedTransactionRows}
    accountLookup={accountLookup}
    tagLookup={tagLookup}
    categoryLookup={categoryLookup}
    subcategoryLookup={subcategoryLookup}
    showSelectColumn
    selectedIds={selected}
    onToggleRow={toggleRow}
    onToggleAll={toggleAllVisible}
    allSelected={allVisibleSelected}
    someSelected={someVisibleSelected}
    onRowClick={(row) => { /* open detail modal */ }}
    onSplitClick={(row) => { /* open split modal */ }}
    sortBy={sortBy}
    sortDirection={sortDir}
    onSort={handleSort}
    getRowClassName={(row) => row.hasSplits ? 'ot-split-parent' : undefined}
    virtualise={sortedTransactionRows.length >= VIRTUAL_ROW_THRESHOLD}
    containerStyle={sortedTransactionRows.length >= VIRTUAL_ROW_THRESHOLD
      ? { maxHeight: 'calc(100vh - 440px)', minHeight: '300px' }
      : undefined}
  />
</div>
```

**PanelScreen usage:**

```tsx
<div className="ot-panel-recent">
  <TransactionsTable
    rows={transactionRows}
    accountLookup={accountLookup}
    tagLookup={tagLookup}
    categoryLookup={categoryLookup}
    subcategoryLookup={subcategoryLookup}
    onRowClick={(row) => { /* open detail modal */ }}
  />
  <div className="ot-panel-recent__footer">
    <a href="/movements">View all →</a>
  </div>
</div>
```

## Anti-Patterns

**❌ Don't duplicate the table JSX:**

```tsx
// BAD: inlining Table with custom columns in every screen
<Table
  columns={[
    { id: 'type', header: '', render: (row) => <TypeArrow ... /> },
    { id: 'date', header: 'Date', render: (row) => formatDate(row.date) },
    // ... 8 more column definitions
  ]}
  rows={rows}
/>
```

This creates maintenance burden. Column width changes require editing N files.

**❌ Don't bake labels into the row type:**

```tsx
// BAD: duplicating label resolution logic in every screen
const rows = movements.map(m => ({
  id: m.id,
  date: m.date,
  accountName: accounts.find(a => a.id === m.accountId)?.name ?? 'Unknown',
  categoryName: categories.find(c => c.id === m.categoryId)?.name ?? null,
  // ...
}));
```

This couples row mapping to label resolution. When tag colors or account names change, every mapping function breaks.

**❌ Don't put screen-specific CSS in TransactionsTable.css:**

```css
/* BAD: screen-specific wrapper in shared component CSS */
.ot-movements__table-container .ot-transactions-table {
  overflow-x: auto;
}
```

The component CSS should be context-agnostic. Wrappers (overflow, flex containers) live in screen CSS.

**✅ DO use lookup maps + normalized row type:**

The table resolves labels at render time. Screens build lookup maps once, pass them as props. When reference data updates (new tag color, renamed account), the maps rebuild and the table re-renders with fresh labels — no row re-mapping needed.
