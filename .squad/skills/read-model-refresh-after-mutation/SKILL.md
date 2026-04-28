# Skill: Read-Model Refresh After Mutation (Modal Selection)

## Context

Many screens in opentreasury-desktop hold a "currently selected entity" in
local state and render a detail modal off it (e.g. `MovementsScreen` ↔
`TransactionDetailModal`). When the user mutates the entity from inside the
modal, the screen typically re-runs `loadAll()` against the read-model, which
rebuilds the canonical record map (`rawRecordById`).

The modal is expected to keep displaying the **freshly loaded** version of
the entity — both in view mode (the auto-restored read-only view that pops
up after save) and in edit mode (if the user re-enters editing).

## Anti-Pattern (PR #133)

Keeping the selection as **two separate state vars** captured at row-click time:

```tsx
const [selectedTx, setSelectedTx] = useState<RecentTransaction | null>(null);
const [selectedRawRecord, setSelectedRawRecord] = useState<MovementRecord | null>(null);

// Row click:
setSelectedTx(recordToRecentTransaction(record));
setSelectedRawRecord(record);

// Then a sync useEffect tries to keep them fresh:
useEffect(() => {
  if (!selectedTx) return;
  const fresh = rawRecordById.get(selectedTx.id);
  if (!fresh || fresh === selectedRawRecord) return;
  setSelectedRawRecord(fresh);
  setSelectedTx(recordToRecentTransaction(fresh));
}, [rawRecordById, selectedTx, selectedRawRecord]);
```

### Why it breaks

1. **Two state vars can drift** — any code path that updates one but forgets
   the other leaves the modal rendering inconsistent props.
2. **Effect ordering races** — when `loadAll()` flips `state` from
   `'loaded'` → `'loading'` → `'loaded'`, the modal can unmount during the
   loading flash. On remount the modal renders *before* the sync effect
   gets a chance to run, so the first commit shows the pre-mutation
   snapshot. The auto-restored view modal that "pops up" after save can
   appear permanently stale to the user (PR #133 regression — Pedro, 2026-04).
3. **Reference-equality bail-outs** (`fresh === selectedRawRecord`) are
   correct in theory but fragile if any layer in the stack memoises records
   or shares references across loadAll calls.

## Correct Pattern

Make the read-model the single source of truth. Store **only the selected
ID**; derive the entity (and any wire-shape conversion) inside `useMemo`:

```tsx
const [selectedId, setSelectedId] = useState<string | null>(null);

// Always reads the freshest record from the read-model. If the record
// disappears (deletion), the derived value becomes null and the modal
// closes naturally via `isOpen={selectedTx !== null}`.
const selectedRawRecord = useMemo<MovementRecord | null>(() => {
  if (!selectedId) return null;
  return rawRecordById.get(selectedId) ?? null;
}, [selectedId, rawRecordById]);

const selectedTx = useMemo<RecentTransaction | null>(
  () => (selectedRawRecord ? recordToRecentTransaction(selectedRawRecord) : null),
  [selectedRawRecord],
);
```

Row click becomes a one-liner:

```tsx
onRowClick={(row) => {
  if (!rawRecordById.has(row.id)) return;
  setSelectedId(row.id);
}}
```

Modal `onClose` / `onDelete` simply clear the ID:

```tsx
onClose={() => setSelectedId(null)}
```

### Why this is robust

- **One source of truth.** No imperative sync, so there's no window where
  one var is fresh and the other stale.
- **No effect ordering race.** The derived values are computed during
  render. On the first commit after a successful loadAll, the modal already
  sees the freshest record — no second-render correction needed.
- **Survives the loading flash.** When `state.kind === 'loading'`,
  `rawRecordById` is empty → derived `selectedRawRecord` is null → modal
  closes during the flash → modal remounts in view mode against the fresh
  record. Exactly the UX users expect.
- **Auto-handles deletion.** If a record is no longer in `rawRecordById`,
  the modal closes with no special-case code.

## Trade-offs

- The modal briefly **closes during the loadAll loading flash** rather than
  staying open with stale data. This matches the existing UX behaviour
  (Pedro's repro: "App returns to list with Cargando for a few seconds
  → VIEW modal pops up automatically").
- `useMemo` returns a new `RecentTransaction` object whenever
  `selectedRawRecord` changes reference. Downstream effects that key on the
  `transaction` prop (e.g. populate-form-on-edit-mode) will re-fire — but
  this is the desired behaviour: edit mode must rehydrate from the freshest
  record.

## When to Use

✅ Any screen that holds an entity selection and renders a modal whose data
must reflect mutations applied via `loadAll()`-style refresh.

✅ Especially when the modal stays open or auto-reopens after a mutation
(e.g. edit-save returns to view mode in the same modal).

❌ One-shot pickers / wizards where the entity is captured for export and
must NOT be replaced by later read-model updates.

## Reference

- **Original bug:** PR #133 — `fix(movements): refresh transaction modal
  after edit-save`. Effect-based sync that worked in isolated scenarios
  but failed under the click-save → loadAll flash on production timing.
- **Re-fix:** PR following this skill — derived-state migration in
  `MovementsScreen.tsx`. Removes the imperative sync effect entirely.
- **Related skills:** `edit-modal-preserve-ids`, `modal-view-edit-parity`.
