import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import './TagChipPicker.css';

export interface TagChipPickerProps {
  readonly availableTags: readonly { id: string; name: string; color?: string | undefined }[];
  readonly selectedIds: readonly string[];
  readonly onToggle: (tagId: string) => void;
  readonly disabled?: boolean;
  /**
   * Opt-in "colored" rendering: each chip becomes a tinted pill carrying the
   * entity's own colour (with a solid colour dot), mirroring the account-pill
   * pattern used across the Accounts / Configuración screens. Chips without an
   * explicit colour fall back to the brand primary, exactly like `CuentasTab`
   * (`a.color || var(--color-brand-primary)`).
   *
   * Left off by default so the plain chip look is preserved everywhere else
   * (e.g. the transaction form tag picker).
   */
  readonly colored?: boolean;
}

/**
 * TagChipPicker — Multi-select tag picker with chip-based toggle UX.
 *
 * UX: Single click toggles selection (no Ctrl/Cmd required). Selected tags show
 * a checkmark; unselected show outline style.
 *
 * This replaces the native `<select multiple>` pattern which required Ctrl+click
 * (poor UX, unintuitive for non-power users).
 */
export function TagChipPicker({
  availableTags,
  selectedIds,
  onToggle,
  disabled = false,
  colored = false,
}: TagChipPickerProps): JSX.Element {
  const selectedSet = new Set(selectedIds);

  return (
    <div className="ot-tag-chip-picker" role="group" aria-label="Tags">
      {availableTags.length === 0 ? (
        <span className="ot-tag-chip-picker__empty">No tags available</span>
      ) : (
        availableTags.map((tag) => {
          const isSelected = selectedSet.has(tag.id);
          const classes = ['ot-tag-chip'];
          if (colored) {
            classes.push('ot-tag-chip--colored');
            if (isSelected) classes.push('ot-tag-chip--selected');
          } else {
            classes.push(isSelected ? 'ot-tag-chip--selected' : 'ot-tag-chip--unselected');
          }
          const style =
            colored && tag.color ? ({ '--ot-chip-color': tag.color } as CSSProperties) : undefined;
          return (
            <button
              key={tag.id}
              type="button"
              className={classes.join(' ')}
              style={style}
              onClick={() => onToggle(tag.id)}
              disabled={disabled}
              aria-pressed={isSelected}
            >
              {isSelected && <Check size={14} aria-hidden="true" />}
              {colored ? <span className="ot-tag-chip__swatch" aria-hidden="true" /> : null}
              <span>{tag.name}</span>
            </button>
          );
        })
      )}
    </div>
  );
}
