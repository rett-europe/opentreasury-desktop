// Issue #399 — Calendar-picker popover for the custom DateInput.
//
// Native `<input type="date">` was dropped in #353 so the visible text could
// honour the user's configured date format; the unintended casualty was the
// browser's calendar popup. This component restores a localized month grid
// WITHOUT reintroducing the native control. It is intentionally self-contained
// (its own view-month + roving-focus state) and emits an ISO `YYYY-MM-DD` string
// via `onSelect`, matching the DateInput value-model contract.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface CalendarPopoverProps {
  /** Currently selected ISO date (`YYYY-MM-DD`) or `''`. */
  readonly selected: string;
  /** Inclusive ISO lower bound. */
  readonly min?: string | undefined;
  /** Inclusive ISO upper bound. */
  readonly max?: string | undefined;
  /** BCP 47 locale governing month/weekday names and week-start. */
  readonly locale: string;
  /** Fires with the chosen day's ISO string. */
  readonly onSelect: (iso: string) => void;
  /** id for the dialog element (wired to the trigger's aria-controls). */
  readonly dialogId: string;
  readonly labelledById?: string | undefined;
  readonly labels: {
    readonly dialog: string;
    readonly previousMonth: string;
    readonly nextMonth: string;
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isoFor(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${pad2(month + 1)}-${pad2(day)}`;
}

function parseIso(iso: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(iso);
  if (m === null) return null;
  return { year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) };
}

/**
 * Week-start derived from the active app locale (es + en are the supported UI
 * languages). Spanish calendars start on Monday; English (en-US) on Sunday.
 */
function weekStartFor(locale: string): 0 | 1 {
  return locale.toLowerCase().startsWith('es') ? 1 : 0;
}

function withinBounds(iso: string, min?: string, max?: string): boolean {
  if (min !== undefined && min !== '' && iso < min) return false;
  if (max !== undefined && max !== '' && iso > max) return false;
  return true;
}

function firstOfMonthIso(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Pick the month to show first, clamped into the [min, max] window. */
function initialView(
  selected: string,
  min?: string,
  max?: string,
): { year: number; month: number } {
  const parsed = parseIso(selected);
  const base = parsed ?? {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  };
  let candidate = isoFor(base.year, base.month, 1);
  if (min !== undefined && min !== '' && candidate < firstOfMonthIso(min)) {
    candidate = firstOfMonthIso(min);
  } else if (max !== undefined && max !== '' && candidate > firstOfMonthIso(max)) {
    candidate = firstOfMonthIso(max);
  }
  const view = parseIso(candidate)!;
  return { year: view.year, month: view.month };
}

export function CalendarPopover({
  selected,
  min,
  max,
  locale,
  onSelect,
  dialogId,
  labelledById,
  labels,
}: CalendarPopoverProps): ReactElement {
  const weekStart = weekStartFor(locale);
  const [view, setView] = useState(() => initialView(selected, min, max));

  // The day currently holding roving focus (ISO). Initialised to the selected
  // day, else the first selectable day of the view month, else day 1.
  const [activeIso, setActiveIso] = useState<string>(() => {
    const parsed = parseIso(selected);
    if (parsed) return selected;
    return isoFor(view.year, view.month, 1);
  });

  const gridRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // Keep the view month in step with the focused day when arrow-keys cross a
  // month boundary.
  useEffect(() => {
    const a = parseIso(activeIso);
    if (a && (a.year !== view.year || a.month !== view.month)) {
      setView({ year: a.year, month: a.month });
    }
  }, [activeIso, view.year, view.month]);

  // Move focus to the active day whenever it changes (and on first open).
  useEffect(() => {
    activeRef.current?.focus();
  }, [activeIso]);

  const monthLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
        new Date(view.year, view.month, 1),
      );
    } catch {
      return `${view.year}-${pad2(view.month + 1)}`;
    }
  }, [locale, view.year, view.month]);

  const weekdayHeaders = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    // 2024-01-07 is a Sunday — a stable reference for building a week.
    const out: { key: number; label: string }[] = [];
    for (let i = 0; i < 7; i += 1) {
      const dow = (weekStart + i) % 7;
      const d = new Date(2024, 0, 7 + dow);
      out.push({ key: dow, label: fmt.format(d) });
    }
    return out;
  }, [locale, weekStart]);

  const weeks = useMemo(() => {
    const firstDow = new Date(view.year, view.month, 1).getDay();
    const lead = (firstDow - weekStart + 7) % 7;
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < lead; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [view.year, view.month, weekStart]);

  const shiftActive = (deltaDays: number): void => {
    const a = parseIso(activeIso) ?? { year: view.year, month: view.month, day: 1 };
    const d = new Date(a.year, a.month, a.day + deltaDays);
    setActiveIso(isoFor(d.getFullYear(), d.getMonth(), d.getDate()));
  };

  const goToMonth = (delta: number): void => {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const selectDay = (iso: string): void => {
    if (!withinBounds(iso, min, max)) return;
    onSelect(iso);
  };

  const onGridKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        shiftActive(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        shiftActive(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        shiftActive(-7);
        break;
      case 'ArrowDown':
        e.preventDefault();
        shiftActive(7);
        break;
      case 'Home':
        e.preventDefault();
        shiftActive(-((parseIso(activeIso)?.day ?? 1) - 1));
        break;
      case 'End': {
        e.preventDefault();
        const a = parseIso(activeIso);
        if (a) {
          const last = new Date(a.year, a.month + 1, 0).getDate();
          shiftActive(last - a.day);
        }
        break;
      }
      case 'PageUp':
        e.preventDefault();
        goToMonth(-1);
        break;
      case 'PageDown':
        e.preventDefault();
        goToMonth(1);
        break;
      case 'Enter':
      case ' ':
        // Select the focused day from the keyboard. preventDefault stops the
        // button's native activation so the day isn't selected twice.
        e.preventDefault();
        selectDay(activeIso);
        break;
      default:
        break;
    }
  };

  return (
    <div
      id={dialogId}
      role="dialog"
      aria-modal="false"
      aria-label={labelledById ? undefined : labels.dialog}
      aria-labelledby={labelledById}
      className="ot-dateinput__popover"
    >
      <div className="ot-dateinput__cal-header">
        <button
          type="button"
          className="ot-dateinput__cal-nav"
          aria-label={labels.previousMonth}
          onClick={() => goToMonth(-1)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span className="ot-dateinput__cal-title" aria-live="polite">
          {monthLabel}
        </span>
        <button
          type="button"
          className="ot-dateinput__cal-nav"
          aria-label={labels.nextMonth}
          onClick={() => goToMonth(1)}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      <div
        ref={gridRef}
        className="ot-dateinput__cal-grid"
        role="grid"
        aria-label={monthLabel}
        onKeyDown={onGridKeyDown}
      >
        <div className="ot-dateinput__cal-weekdays" role="row">
          {weekdayHeaders.map((h) => (
            <span key={h.key} className="ot-dateinput__cal-weekday" role="columnheader">
              {h.label}
            </span>
          ))}
        </div>
        {weeks.map((row, ri) => (
          <div key={ri} className="ot-dateinput__cal-week" role="row">
            {row.map((day, ci) => {
              if (day === null) {
                return (
                  <span
                    key={`e-${ri}-${ci}`}
                    className="ot-dateinput__cal-cell ot-dateinput__cal-cell--empty"
                    role="gridcell"
                    aria-hidden="true"
                  />
                );
              }
              const iso = isoFor(view.year, view.month, day);
              const isSelected = iso === selected;
              const isActive = iso === activeIso;
              const disabled = !withinBounds(iso, min, max);
              return (
                <button
                  key={iso}
                  ref={isActive ? activeRef : undefined}
                  type="button"
                  role="gridcell"
                  className={
                    isSelected
                      ? 'ot-dateinput__cal-cell ot-dateinput__cal-cell--selected'
                      : 'ot-dateinput__cal-cell'
                  }
                  aria-selected={isSelected}
                  aria-disabled={disabled || undefined}
                  disabled={disabled}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => selectDay(iso)}
                  onFocus={() => setActiveIso(iso)}
                >
                  {day}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
