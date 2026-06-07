import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Calendar, X } from 'lucide-react';
import { Button } from '../Button/index.js';
import { DateInput } from '../DateInput/index.js';
import type { DateRange } from '../../types/movement.js';
import './DateRangePicker.css';

/**
 * DateRangePicker v0.1 — simplified from components-v1.md §4.
 *
 * DECISION (Trinity, 2026-04-19): v0.1 used native `<input type="date">` for the
 * custom-range inputs. Issue #353 replaced these with the custom `DateInput` so
 * the visible date format honors the user's preference (locale-independent of UI
 * language) instead of following the Chromium/OS locale; `DateInput` keeps the
 * keyboard accessibility and inclusive min/max bounding of the native control.
 *
 * DECISION (Trinity, regression fix for #356): the custom From/To inputs support
 * two layouts via `customRangeLayout`:
 *  - `'inline'` (default) — the From/To/Apply controls render inline below the
 *    presets. Used by Insights, where the picker sits in a roomy page header.
 *  - `'popover'` — the presets render with a "Custom" trigger that toggles an
 *    anchored `role="dialog"` popover holding From/To/Apply. Used by the
 *    Movements filter bar so the bar height never inflates (the always-inline
 *    row from #356 added a third row that broke the calm two-row layout and the
 *    table's scroll-containment budget — two vertical scrollbars).
 *
 * Accessibility:
 *  - Presets render as role="radiogroup" / role="radio" per components-v1.md §4.
 *  - Arrow keys traverse presets; Enter / Space selects.
 *  - Custom inputs have real <label>s.
 *  - Invalid range (to < from) disables Apply + surfaces an inline error.
 *  - In `'popover'` mode the trigger exposes aria-haspopup="dialog" /
 *    aria-expanded / aria-controls; Escape and outside-click close it and return
 *    focus to the trigger; opening focuses the From field.
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
  /**
   * How the custom From/To/Apply controls are presented. Defaults to `'inline'`
   * to preserve the existing Insights layout byte-for-byte. `'popover'` anchors
   * them in a toggled dialog so the host bar height stays fixed.
   */
  readonly customRangeLayout?: 'inline' | 'popover';
  /** Label for the popover trigger chip (e.g. "Personalizado"). Popover only. */
  readonly customTriggerLabel?: string;
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
  customRangeLayout = 'inline',
  customTriggerLabel,
}: DateRangePickerProps): JSX.Element {
  const [customFrom, setCustomFrom] = useState<string>(() => toInputValue(value?.from));
  const [customTo, setCustomTo] = useState<string>(() => toInputValue(value?.to));

  // Popover state (only meaningful when customRangeLayout === 'popover').
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const closePopover = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Close the popover on outside click / Escape / focus leaving it, and focus
  // the From field on open. Mirrors the TagCombinerDropdown interaction
  // contract. `focusin` makes a keyboard Tab out of the dialog dismiss it (the
  // popover is non-modal, so we don't trap focus — we just close behind it).
  useEffect(() => {
    if (customRangeLayout !== 'popover' || !open) return;
    const isOutside = (target: Node | null): boolean =>
      target != null &&
      popoverRef.current != null &&
      !popoverRef.current.contains(target) &&
      triggerRef.current != null &&
      !triggerRef.current.contains(target);
    const onPointerDown = (e: MouseEvent): void => {
      if (isOutside(e.target as Node)) setOpen(false);
    };
    const onFocusIn = (e: FocusEvent): void => {
      // Focus moved outside the trigger + popover (e.g. Tab past Apply): close
      // without yanking focus back, since the user intentionally moved on.
      if (isOutside(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePopover();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('keydown', onKeyDown);
    const firstInput = popoverRef.current?.querySelector<HTMLInputElement>('input');
    firstInput?.focus();
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [customRangeLayout, open, closePopover]);

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
    if (customRangeLayout === 'popover') closePopover();
  }, [customFrom, customTo, onChange, customRangeLayout, closePopover]);

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

  const presetsGroup = (
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
  );

  const customFields = (
    <div className="ot-daterange__custom">
      <label className="ot-daterange__field-label">
        <span>{customLabels.from}</span>
        <DateInput className="ot-daterange__native" value={customFrom} onChange={setCustomFrom} />
      </label>
      <label className="ot-daterange__field-label">
        <span>{customLabels.to}</span>
        <DateInput
          className="ot-daterange__native"
          value={customTo}
          onChange={setCustomTo}
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
  );

  const errorNode = invalid ? (
    <p className="ot-daterange__error" role="alert">
      {customLabels.invalidRange}
    </p>
  ) : null;

  if (customRangeLayout === 'popover') {
    return (
      <div className="ot-daterange ot-daterange--popover">
        {presetsGroup}
        <div className="ot-daterange__popover-anchor">
          <button
            ref={triggerRef}
            type="button"
            className={
              open
                ? 'ot-daterange__preset ot-daterange__custom-trigger ot-daterange__custom-trigger--open'
                : 'ot-daterange__preset ot-daterange__custom-trigger'
            }
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? popoverId : undefined}
            onClick={() => setOpen((v) => !v)}
          >
            <Calendar size={14} aria-hidden="true" />
            {customTriggerLabel ?? 'Custom'}
          </button>
          {open ? (
            <div
              ref={popoverRef}
              id={popoverId}
              role="dialog"
              aria-label={customTriggerLabel ?? 'Custom'}
              className="ot-daterange__popover"
            >
              {customFields}
              {errorNode}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="ot-daterange">
      {presetsGroup}
      {customFields}
      {errorNode}
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
