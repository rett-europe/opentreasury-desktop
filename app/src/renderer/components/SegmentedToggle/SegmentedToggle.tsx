import { type KeyboardEvent } from 'react';
import './SegmentedToggle.css';

export type SegmentedToggleOption = {
  readonly value: string;
  readonly label: string;
};

export type SegmentedToggleProps = {
  readonly options: ReadonlyArray<SegmentedToggleOption>;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly ariaLabel: string;
};

/**
 * Segmented toggle control (radio group styled as pill buttons).
 * Semantically a display-mode selector, not a sort selector.
 *
 * Keyboard navigation: arrow keys move focus between options.
 */
export function SegmentedToggle({ options, value, onChange, ariaLabel }: SegmentedToggleProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>, currentIndex: number) => {
    let newIndex = currentIndex;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      newIndex = (currentIndex + 1) % options.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      newIndex = currentIndex === 0 ? options.length - 1 : currentIndex - 1;
    } else {
      return;
    }

    const newOption = options[newIndex];
    if (!newOption) return;

    onChange(newOption.value);

    // Focus the new radio button
    setTimeout(() => {
      const radios = document.querySelectorAll('input[name="segmented-toggle"]');
      (radios[newIndex] as HTMLElement)?.focus();
    }, 0);
  };

  return (
    <div className="ot-segmented-toggle" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option, index) => {
        const isSelected = option.value === value;
        const id = `segmented-${option.value}`;

        return (
          <label
            key={option.value}
            className={`ot-segmented-toggle__option ${isSelected ? 'ot-segmented-toggle__option--selected' : ''}`}
            htmlFor={id}
          >
            <input
              type="radio"
              id={id}
              name="segmented-toggle"
              value={option.value}
              checked={isSelected}
              onChange={() => onChange(option.value)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className="ot-segmented-toggle__input"
              aria-checked={isSelected}
            />
            <span className="ot-segmented-toggle__label">{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}
