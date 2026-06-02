// Issue #353 — Bound formatters hook (renderer).
//
// `useFormatters()` reads the active format preferences from context and returns
// a memoised set of formatting functions that already have the date format,
// number format and UI locale bound in. Components call these instead of the
// old `formatCurrency(value, locale, 'EUR')` style helpers, so a single
// preference change reformats the entire app consistently.

import { useMemo } from 'react';
import { useFormatPrefs } from './FormatPreferencesContext.js';
import {
  formatDateNumeric,
  formatDateRangeNumeric,
  formatNumber as coreFormatNumber,
  parseAmount as coreParseAmount,
  isValidAmountInput as coreIsValidAmountInput,
  formatAmountForInput as coreFormatAmountForInput,
  decimalSeparatorFor,
  placeholderFor,
  type DateFormat,
  type NumberFormat,
} from '../../shared/format/index.js';

export interface NumberFormatOpts {
  readonly minimumFractionDigits?: number;
  readonly maximumFractionDigits?: number;
  readonly useGrouping?: boolean | 'always';
  readonly signDisplay?: 'auto' | 'never' | 'always' | 'exceptZero';
}

export interface Formatters {
  /** Active date format preference (e.g. for placeholders / DateInput). */
  readonly dateFormat: DateFormat;
  /** Active number format preference. */
  readonly numberFormat: NumberFormat;
  /** UI locale governing currency symbol/sign placement. */
  readonly uiLocale: string;
  /** Decimal separator glyph for the active number format. */
  readonly decimalSep: ',' | '.';
  /** Placeholder string for the active date format (e.g. `DD/MM/YYYY`). */
  readonly datePlaceholder: string;

  /** ISO date (`YYYY-MM-DD`) → chosen numeric layout. */
  readonly formatDate: (iso: string) => string;
  /** ISO datetime → numeric date + localized short time. */
  readonly formatDateTime: (iso: string) => string;
  /** ISO date range → `from – to` in the chosen numeric layout. */
  readonly formatDateRange: (from: string, to: string) => string;
  /** `YYYY-MM` → localized month name + year (language-driven label, exempt). */
  readonly formatMonth: (monthStr: string) => string;

  /** Numeric amount → localized currency with preference separators. */
  readonly formatCurrency: (amount: number, currency?: string) => string;
  /** Numeric amount → plain number with preference separators. */
  readonly formatNumber: (amount: number, opts?: NumberFormatOpts) => string;
  /** Fraction (0–1 or 0–100 per opts) → percent with preference separators. */
  readonly formatPercent: (value: number, opts?: NumberFormatOpts) => string;

  /** Parse a user-typed amount under the active number format. */
  readonly parseAmount: (input: string) => number;
  /** Validate a typed amount candidate under the active number format. */
  readonly isValidAmountInput: (candidate: string) => boolean;
  /** Stored number → preference-correct input-field string (no grouping). */
  readonly formatAmountForInput: (amount: number) => string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Numeric date + localized short time, using the LOCAL date components. */
function formatDateTimeBound(iso: string, df: DateFormat, uiLocale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const isoDate = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  const datePart = formatDateNumeric(isoDate, df);
  try {
    const timePart = new Intl.DateTimeFormat(uiLocale, { timeStyle: 'short' }).format(date);
    return `${datePart} ${timePart}`;
  } catch {
    return datePart;
  }
}

/** Localized month-name + year label (language-driven; format-preference exempt). */
function formatMonthBound(monthStr: string, uiLocale: string): string {
  try {
    const parts = monthStr.split('-');
    if (parts.length !== 2) return monthStr;
    const [year, month] = parts;
    const date = new Date(parseInt(year!, 10), parseInt(month!, 10) - 1, 1);
    if (Number.isNaN(date.getTime())) return monthStr;
    return new Intl.DateTimeFormat(uiLocale, { month: 'long', year: 'numeric' }).format(date);
  } catch {
    return monthStr;
  }
}

export function useFormatters(): Formatters {
  const { dateFormat, numberFormat, uiLocale } = useFormatPrefs();

  return useMemo<Formatters>(
    () => ({
      dateFormat,
      numberFormat,
      uiLocale,
      decimalSep: decimalSeparatorFor(numberFormat),
      datePlaceholder: placeholderFor(dateFormat),

      formatDate: (iso: string): string => formatDateNumeric(iso, dateFormat),
      formatDateTime: (iso: string): string => formatDateTimeBound(iso, dateFormat, uiLocale),
      formatDateRange: (from: string, to: string): string =>
        formatDateRangeNumeric(from, to, dateFormat),
      formatMonth: (monthStr: string): string => formatMonthBound(monthStr, uiLocale),

      formatCurrency: (amount: number, currency: string = 'EUR'): string =>
        coreFormatNumber(amount, {
          nf: numberFormat,
          uiLocale,
          style: 'currency',
          currency,
          useGrouping: 'always',
        }),
      formatNumber: (amount: number, opts?: NumberFormatOpts): string =>
        coreFormatNumber(amount, { nf: numberFormat, uiLocale, ...opts }),
      formatPercent: (value: number, opts?: NumberFormatOpts): string =>
        coreFormatNumber(value, { nf: numberFormat, uiLocale, style: 'percent', ...opts }),

      parseAmount: (input: string): number => coreParseAmount(input, numberFormat),
      isValidAmountInput: (candidate: string): boolean =>
        coreIsValidAmountInput(candidate, numberFormat),
      formatAmountForInput: (amount: number): string =>
        coreFormatAmountForInput(amount, numberFormat),
    }),
    [dateFormat, numberFormat, uiLocale],
  );
}
