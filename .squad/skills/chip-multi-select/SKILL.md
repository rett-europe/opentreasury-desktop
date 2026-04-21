# Chip-based Multi-Select Pattern

**Pattern:** Chip-based toggle UI for multi-select controls (tags, labels, categories, filters).

**When to use:** Any time you need a multi-select control where users can select 0-N items from a list. Replaces native `<select multiple>` which has terrible UX (requires Ctrl+click, non-obvious selection state, poor mobile support).

## Visual Behavior

**Unselected chip:**
- Outline border (1px solid `--color-border`)
- Transparent background
- Secondary text color
- Hover → light grey background (`--color-surface-secondary`)

**Selected chip:**
- Filled brand-primary background
- White text (`--color-brand-on-primary`)
- Checkmark icon (14px lucide `Check`)
- Hover → darker brand background (`--color-brand-hover`)

**Disabled chip:**
- 50% opacity
- `cursor: not-allowed`

## Component API

```tsx
interface ChipPickerProps {
  readonly availableItems: readonly { id: string; name: string }[];
  readonly selectedIds: readonly string[];
  readonly onToggle: (itemId: string) => void;
  readonly disabled?: boolean;
}
```

**Parent owns state and toggle logic:**

```tsx
const [selectedIds, setSelectedIds] = useState<string[]>([]);

<ChipPicker
  availableItems={items}
  selectedIds={selectedIds}
  onToggle={(id) => {
    const newIds = selectedIds.includes(id)
      ? selectedIds.filter(sid => sid !== id)   // Unselect
      : [...selectedIds, id];                    // Select
    setSelectedIds(newIds);
  }}
/>
```

## Implementation Example

See `app/src/renderer/components/TagChipPicker` for reference implementation.

**Key details:**
- Chips wrapped in flex container: `display: flex; flex-wrap: wrap; gap: var(--space-2);`
- Each chip is a `<button type="button">` with `aria-pressed={isSelected}`
- Selected state managed by parent — component is controlled
- Checkmark icon only rendered when `isSelected === true`
- Empty state: "No items available" message when `availableItems.length === 0`

## Accessibility

- ✅ `role="group"` on container with `aria-label="<Category Name>"`
- ✅ Each chip is a `<button>` with `aria-pressed` state
- ✅ Keyboard navigable (Tab through chips, Space/Enter to toggle)
- ✅ Screen reader announces "pressed" / "not pressed" state
- ✅ Disabled chips set `disabled` attribute (not just CSS)

## Mobile Support

- ✅ No modifier keys required (single tap to toggle)
- ✅ Touch targets: min 44×44px (chips have padding: 4px 10px, min-height handled by flex alignment)
- ✅ Visual feedback on selection (filled background, checkmark) — no reliance on hover states

## When NOT to Use

- **Single-select controls** → Use radio buttons or dropdown.
- **Huge lists (>50 items)** → Consider searchable combobox with chip display (like Gmail labels) instead of rendering all chips upfront.
- **Hierarchical selection** → Use tree control or nested checkboxes.

## Reusability

Current implementation (`TagChipPicker`) is specialized for tags. To create a generic version:

1. Rename to `ChipMultiSelect`
2. Accept generic `{ id, name }[]` items instead of `TagRecord[]`
3. Optionally add search/filter input if item count is large (>20)
4. Optionally add "Select All" / "Clear All" buttons

## Migration from Native Multi-Select

**Before:**
```tsx
<select multiple value={tagIds} onChange={handleChange}>
  {tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
</select>
```

**After:**
```tsx
<TagChipPicker
  availableTags={tags}
  selectedIds={tagIds}
  onToggle={(tagId) => {
    const newIds = tagIds.includes(tagId)
      ? tagIds.filter(id => id !== tagId)
      : [...tagIds, tagId];
    setTagIds(newIds);
  }}
/>
```

## References

- **Component:** `app/src/renderer/components/TagChipPicker`
- **Tests:** `app/src/renderer/components/TagChipPicker/TagChipPicker.test.tsx`
- **Decision:** `.squad/decisions/inbox/trinity-tx-modal-unified-width.md`
- **History:** `.squad/agents/trinity/history.md` (2026-04-21 WI-20 Polish)
