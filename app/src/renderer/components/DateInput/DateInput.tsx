// Issue #353 — Custom date input (replaces native `<input type="date">`).
//
// Native `<input type="date">` renders its visible text in the Chromium/OS
// locale and that format cannot be overridden. To honour the user's chosen date
// format on INPUT fields we use a plain text input whose VALUE MODEL stays ISO
// (`YYYY-MM-DD`) — identical to the native control's contract — while the visible
// text is the configured numeric layout (DD/MM/YYYY, MM/DD/YYYY or YYYY-MM-DD).
//
// Contract (drop-in for the native control):
//   - `value` is an ISO date string (`YYYY-MM-DD`) or `''`.
//   - `onChange(iso)` fires with a valid ISO string, or `''` when cleared.
//   - While the user is mid-typing an incomplete/invalid date we hold the local
//     text and do NOT emit, so the parent's value is never set to garbage.

import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react';
import { Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDateNumeric, parseDateNumeric } from '../../../shared/format/index.js';
import { useFormatters } from '../../format/index.js';
import { CalendarPopover } from './CalendarPopover.js';
import './DateInput.css';

export interface DateInputProps {
  /** ISO date string (`YYYY-MM-DD`) or `''`. */
  readonly value: string;
  /** Fires with a valid ISO string, or `''` when the field is cleared. */
  readonly onChange: (iso: string) => void;
  readonly id?: string;
  readonly name?: string;
  readonly className?: string;
  readonly disabled?: boolean | undefined;
  readonly title?: string | undefined;
  /** Override the auto-derived placeholder (defaults to e.g. `DD/MM/YYYY`). */
  readonly placeholder?: string;
  /** Inclusive ISO lower bound; values before it are not emitted. */
  readonly min?: string | undefined;
  /** Inclusive ISO upper bound; values after it are not emitted. */
  readonly max?: string | undefined;
  readonly autoFocus?: boolean;
  readonly 'aria-invalid'?: boolean | undefined;
  readonly 'aria-describedby'?: string | undefined;
  readonly 'aria-label'?: string | undefined;
}

function withinBounds(iso: string, min?: string, max?: string): boolean {
  if (min !== undefined && min !== '' && iso < min) return false;
  if (max !== undefined && max !== '' && iso > max) return false;
  return true;
}

export function DateInput({
  value,
  onChange,
  id,
  name,
  className,
  disabled,
  title,
  placeholder,
  min,
  max,
  autoFocus,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  'aria-label': ariaLabel,
}: DateInputProps): ReactElement {
  const { dateFormat, datePlaceholder, uiLocale } = useFormatters();
  const { t } = useTranslation();

  const [text, setText] = useState<string>(() =>
    value === '' ? '' : formatDateNumeric(value, dateFormat),
  );
  const textRef = useRef<string>(text);
  textRef.current = text;

  // Re-sync the visible text when the ISO value or the date format changes — but
  // NOT while the user is mid-typing a value that already parses to `value`
  // (reading the latest text via ref keeps this effect off the keystroke path).
  useEffect(() => {
    const currentIso = parseDateNumeric(textRef.current, dateFormat);
    if (currentIso !== value) {
      setText(value === '' ? '' : formatDateNumeric(value, dateFormat));
    }
  }, [value, dateFormat]);

  const handleChange = (next: string): void => {
    setText(next);
    const trimmed = next.trim();
    if (trimmed === '') {
      onChange('');
      return;
    }
    const iso = parseDateNumeric(trimmed, dateFormat);
    if (iso !== null && withinBounds(iso, min, max)) {
      onChange(iso);
    }
    // Otherwise hold the local text; the parent value is left untouched.
  };

  // On blur, revert un-parseable leftover text to the last valid value so the
  // field never displays a partial/garbage date (mirrors the native control).
  const handleBlur = (): void => {
    const trimmed = text.trim();
    if (trimmed === '') return;
    const iso = parseDateNumeric(trimmed, dateFormat);
    if (iso === null || !withinBounds(iso, min, max)) {
      setText(value === '' ? '' : formatDateNumeric(value, dateFormat));
    }
  };

  const trimmedText = text.trim();
  const parsedIso = trimmedText === '' ? null : parseDateNumeric(trimmedText, dateFormat);
  const internalInvalid =
    trimmedText !== '' && (parsedIso === null || !withinBounds(parsedIso, min, max));

  // ── Calendar popover ────────────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const closePopover = useCallback((returnFocus = true): void => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Dismiss on outside pointer-down and Escape; mirrors the DateRangePicker
  // popover contract. Focus is moved INTO the grid by CalendarPopover on open
  // and returned to the trigger here on close.
  useEffect(() => {
    if (!open) return;
    const isOutside = (target: Node | null): boolean =>
      target != null && wrapperRef.current != null && !wrapperRef.current.contains(target);
    const onPointerDown = (e: MouseEvent): void => {
      if (isOutside(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePopover();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, closePopover]);

  const handleSelectDay = (iso: string): void => {
    onChange(iso);
    closePopover();
  };

  const selectedIso = parsedIso !== null && !internalInvalid ? parsedIso : value;
  const inputClassName = className ? `${className} ot-dateinput__input` : 'ot-dateinput__input';

  return (
    <span className="ot-dateinput" ref={wrapperRef} data-ot-dateinput-wrap="">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        id={id}
        name={name}
        className={inputClassName}
        disabled={disabled}
        title={title}
        placeholder={placeholder ?? datePlaceholder}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        autoFocus={autoFocus}
        aria-invalid={ariaInvalid === true || internalInvalid ? true : undefined}
        aria-describedby={ariaDescribedBy}
        aria-label={ariaLabel}
        data-ot-dateinput=""
      />
      {disabled !== true && (
        <button
          ref={triggerRef}
          type="button"
          className="ot-dateinput__trigger"
          aria-label={t('dateInput.openCalendar')}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
          onClick={() => setOpen((v) => !v)}
        >
          <Calendar size={16} aria-hidden="true" />
        </button>
      )}
      {open && disabled !== true && (
        <CalendarPopover
          selected={selectedIso}
          min={min}
          max={max}
          locale={uiLocale}
          onSelect={handleSelectDay}
          dialogId={popoverId}
          labels={{
            dialog: t('dateInput.openCalendar'),
            previousMonth: t('dateInput.previousMonth'),
            nextMonth: t('dateInput.nextMonth'),
          }}
        />
      )}
    </span>
  );
}
