// Issue #353 — Number formatting driven by the chosen decimal/thousands pair.
//
// Strategy (critique A): format with `Intl.NumberFormat` using the UI locale so
// the currency symbol position, spacing and sign placement stay language-correct,
// then swap ONLY the decimal and group separator glyphs to honour the user's
// `NumberFormat` preference via `formatToParts`. This decouples the separators
// from the language without losing the language's currency conventions.

import type { NumberFormat } from './types.js';

/** Decimal separator glyph for the preference (`eu` → `,`, `us` → `.`). */
export function decimalSeparatorFor(nf: NumberFormat): ',' | '.' {
  return nf === 'eu' ? ',' : '.';
}

/** Thousands (group) separator glyph for the preference (`eu` → `.`, `us` → `,`). */
export function thousandsSeparatorFor(nf: NumberFormat): '.' | ',' {
  return nf === 'eu' ? '.' : ',';
}

export interface FormatNumberOptions {
  readonly nf: NumberFormat;
  /** BCP 47 locale that governs symbol/sign placement (NOT the separators). */
  readonly uiLocale: string;
  readonly style?: 'decimal' | 'currency' | 'percent';
  readonly currency?: string;
  readonly minimumFractionDigits?: number;
  readonly maximumFractionDigits?: number;
  readonly useGrouping?: boolean | 'always';
  readonly signDisplay?: 'auto' | 'never' | 'always' | 'exceptZero';
}

/**
 * Format a number with the UI locale's conventions but the preference's
 * separators. Falls back to a bare numeric string if `Intl` throws.
 */
export function formatNumber(amount: number, opts: FormatNumberOptions): string {
  const decimalSep = decimalSeparatorFor(opts.nf);
  const groupSep = thousandsSeparatorFor(opts.nf);
  try {
    const nfmt = new Intl.NumberFormat(opts.uiLocale, {
      style: opts.style ?? 'decimal',
      ...(opts.currency !== undefined ? { currency: opts.currency } : {}),
      ...(opts.minimumFractionDigits !== undefined
        ? { minimumFractionDigits: opts.minimumFractionDigits }
        : {}),
      ...(opts.maximumFractionDigits !== undefined
        ? { maximumFractionDigits: opts.maximumFractionDigits }
        : {}),
      // `useGrouping: 'always'` needs the modern Intl typings; cast for older libs.
      ...(opts.useGrouping !== undefined ? { useGrouping: opts.useGrouping } : {}),
      ...(opts.signDisplay !== undefined ? { signDisplay: opts.signDisplay } : {}),
    } as unknown as Intl.NumberFormatOptions);

    return nfmt
      .formatToParts(amount)
      .map((part) => {
        if (part.type === 'decimal') return decimalSep;
        if (part.type === 'group') return groupSep;
        return part.value;
      })
      .join('');
  } catch {
    return amount.toString().replace('.', decimalSep);
  }
}

/**
 * Parse a user-typed amount string that uses the preference's separators.
 *
 * The configured decimal separator is treated as the decimal point; the OTHER
 * separator is treated strictly as a thousands separator and stripped. After
 * normalising to a `.`-decimal string the result is STRICTLY validated — any
 * leftover junk (stray letters, a second decimal separator, trailing
 * characters) yields `NaN` rather than a silently truncated value. Returns
 * `NaN` for empty/invalid input.
 */
export function parseAmount(input: string, nf: NumberFormat): number {
  if (typeof input !== 'string') return NaN;
  const trimmed = input.trim();
  if (trimmed === '') return NaN;

  const decimalSep = decimalSeparatorFor(nf);
  const groupSep = thousandsSeparatorFor(nf);

  // Strip the thousands separator, then normalise the decimal separator to `.`.
  const withoutGroups = trimmed.split(groupSep).join('');
  const normalized = decimalSep === '.' ? withoutGroups : withoutGroups.split(decimalSep).join('.');

  // Strict: optional sign, then either `123`, `123.`, `123.45`, or `.45`.
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(normalized)) return NaN;
  return Number(normalized);
}

/**
 * Validate a typed amount candidate as the user types — strict per preference.
 *
 * Accepts digits, an optional leading `-`, and at most one decimal separator
 * (the preference's). The thousands separator is NOT accepted at input time
 * (grouping is inserted only at display time). Empty string and a lone `-` are
 * accepted as intermediate states. Up to 12 integer digits and 2 decimals.
 */
export function isValidAmountInput(candidate: string, nf: NumberFormat): boolean {
  if (candidate === '' || candidate === '-') return true;
  const sep = decimalSeparatorFor(nf);
  const escapedSep = sep === '.' ? '\\.' : ',';
  const re = new RegExp(`^-?\\d{0,12}(${escapedSep}\\d{0,2})?$`);
  return re.test(candidate);
}

/**
 * Convert a stored numeric amount to a preference-correct input-field string
 * (no thousands grouping). `"423,89"` for `eu`, `"423.89"` for `us`. Non-finite
 * inputs become an empty string.
 */
export function formatAmountForInput(amount: number, nf: NumberFormat): string {
  if (!Number.isFinite(amount)) return '';
  const raw = amount.toString();
  return decimalSeparatorFor(nf) === ',' ? raw.replace('.', ',') : raw;
}
