import { Check } from 'lucide-react';
import './TagChipPicker.css';

export interface TagChipPickerProps {
  readonly availableTags: readonly { id: string; name: string }[];
  readonly selectedIds: readonly string[];
  readonly onToggle: (tagId: string) => void;
  readonly disabled?: boolean;
}

/**
 * TagChipPicker — Multi-select tag picker with chip-based toggle UX.
 *
 * UX: Single click toggles selection (no Ctrl/Cmd required). Selected tags show
 * filled background + checkmark; unselected show outline style.
 *
 * This replaces the native `<select multiple>` pattern which required Ctrl+click
 * (poor UX, unintuitive for non-power users).
 */
export function TagChipPicker({
  availableTags,
  selectedIds,
  onToggle,
  disabled = false,
}: TagChipPickerProps): JSX.Element {
  const selectedSet = new Set(selectedIds);

  return (
    <div className="ot-tag-chip-picker" role="group" aria-label="Tags">
      {availableTags.length === 0 ? (
        <span className="ot-tag-chip-picker__empty">No tags available</span>
      ) : (
        availableTags.map((tag) => {
          const isSelected = selectedSet.has(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              className={`ot-tag-chip ${isSelected ? 'ot-tag-chip--selected' : 'ot-tag-chip--unselected'}`}
              onClick={() => onToggle(tag.id)}
              disabled={disabled}
              aria-pressed={isSelected}
            >
              {isSelected && <Check size={14} aria-hidden="true" />}
              <span>{tag.name}</span>
            </button>
          );
        })
      )}
    </div>
  );
}
