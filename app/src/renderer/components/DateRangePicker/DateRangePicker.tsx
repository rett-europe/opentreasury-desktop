import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../Button/index.js';
import type { DateRange } from '../../types/movement.js';
import './DateRangePicker.css';

/**
 * DateRangePicker v0.1 — simplified from components-v1.md §4.
 *
 * DECISION (Trinity, 2026-04-19): v0.1 uses native `<input type="date">` for the
 * custom-range inputs. Rich cross-browser calendar grid deferred to v0.2. This
 * keeps the critical UX-003 flow unblocked today without a calendar dep, and
 * native inputs are fully keyboard-accessible + locale-aware on all OSes.
 *
 * Accessibility:
 *  - Presets render as role="radiogroup" / role="radio" per components-v1.md §4.
 *  - Arrow keys traverse presets; Enter / Space selects.
 *  - Custom inputs have real <label>s.
 *  - Invalid range (to < from) disables Apply + surfaces an inline error.
 */

export interface Preset {
  readonly id: string;
  readonly label: string;
  readonly range: () => DateRange;
}

export interface DateRangePickerProps {
  readonly value: DateRange | null;
  readonly onChange: (next: DateRange) => void;
  readonly presets: readonly Preset[];
  readonly activePresetId?: string | null;
  readonly customLabels: {
    readonly from: string;
    readonly to: string;
    readonly apply: string;
    readonly invalidRange: string;
  };
}

function toInputValue(d: Date | null | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function fromInputValue(v: string): Date | null {
  if (!v) return null;
  const parsed = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function DateRangePicker({
  value,
  onChange,
  presets,
  activePresetId,
  customLabels,
}: DateRangePickerProps): JSX.Element {
  const [customFrom, setCustomFrom] = useState<string>(() => toInputValue(value?.from));
  const [customTo, setCustomTo] = useState<string>(() => toInputValue(value?.to));

  // Keep the visible inputs in sync with `value`. Without this, the inputs are
  // seeded only on mount, so a preset click (or any external range change) would
  // leave the From/To fields showing a stale custom range. Keyed on the ISO
  // strings so typing a draft (which doesn't change `value` until Apply) is not
  // clobbered on every render.
  const valueFrom = toInputValue(value?.from);
  const valueTo = toInputValue(value?.to);
  useEffect(() => {
    setCustomFrom(valueFrom);
    setCustomTo(valueTo);
  }, [valueFrom, valueTo]);

  const invalid = useMemo(() => {
    if (!customFrom || !customTo) return false;
    const f = fromInputValue(customFrom);
    const t = fromInputValue(customTo);
    if (!f || !t) return false;
    return t.getTime() < f.getTime();
  }, [customFrom, customTo]);

  const applyCustom = useCallback(() => {
    const f = fromInputValue(customFrom);
    const t = fromInputValue(customTo);
    if (!f || !t || t.getTime() < f.getTime()) return;
    onChange({ from: f, to: t });
  }, [customFrom, customTo, onChange]);

  const onPresetKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number): void => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const direction = e.key === 'ArrowRight' ? 1 : -1;
    const nextIdx = (idx + direction + presets.length) % presets.length;
    const nextBtn =
      e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button[role="radio"]')[
        nextIdx
      ];
    nextBtn?.focus();
  };

  return (
    <div className="ot-daterange">
      <div className="ot-daterange__presets" role="radiogroup" aria-label="Date range presets">
        {presets.map((p, idx) => {
          const checked = activePresetId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked || (activePresetId == null && idx === 0) ? 0 : -1}
              className="ot-daterange__preset"
              onClick={() => onChange(p.range())}
              onKeyDown={(e) => onPresetKeyDown(e, idx)}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="ot-daterange__custom">
        <label className="ot-daterange__field-label">
          <span>{customLabels.from}</span>
          <input
            type="date"
            className="ot-daterange__native"
            value={customFrom}
            max={customTo || undefined}
            onChange={(e) => setCustomFrom(e.target.value)}
          />
        </label>
        <label className="ot-daterange__field-label">
          <span>{customLabels.to}</span>
          <input
            type="date"
            className="ot-daterange__native"
            value={customTo}
            min={customFrom || undefined}
            onChange={(e) => setCustomTo(e.target.value)}
            aria-invalid={invalid ? true : undefined}
          />
        </label>
        <div className="ot-daterange__apply">
          <Button
            variant="primary"
            onClick={applyCustom}
            disabled={!customFrom || !customTo || invalid}
          >
            {customLabels.apply}
          </Button>
        </div>
      </div>
      {invalid ? (
        <p className="ot-daterange__error" role="alert">
          {customLabels.invalidRange}
        </p>
      ) : null}
    </div>
  );
}

export interface DateRangePillProps {
  readonly label: string;
  readonly onClear: () => void;
  readonly clearLabel: string;
}

/** Compact pill that displays the active range and offers keyboard-clear. */
export function DateRangePill({ label, onClear, clearLabel }: DateRangePillProps): JSX.Element {
  return (
    <span className="ot-daterange__pill">
      <span>📅</span>
      <span>{label}</span>
      <button
        type="button"
        className="ot-daterange__pill-clear"
        onClick={onClear}
        aria-label={clearLabel}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </span>
  );
}
