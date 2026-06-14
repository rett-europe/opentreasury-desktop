// SPEC-030 FR10 — European currency formatting for the Financial Report.
//
// The report ALWAYS renders the active-locale European format (`.` thousands,
// `,` decimal) with the `€` symbol as a suffix preceded by a NON-BREAKING SPACE
// (U+00A0), e.g. `9.506,21 €`. Negative figures use a real MINUS SIGN (U+2212)
// followed by a THIN SPACE (U+2009), e.g. `− 8.647,50 €` — the hyphen-minus is
// forbidden in the document body (it breaks tabular alignment and reads as a
// list dash; design §5).
//
// Pure + dependency-free so it is unit-tested in isolation and import-safe from
// both core (template) and main.

const NBSP = '\u00A0';
const MINUS = '\u2212';
const THIN_SPACE = '\u2009';
const EURO = '€';

export type AmountSign = 'none' | 'plus' | 'minus';

export interface FormatEuroOptions {
  /** Sign treatment. `none` = magnitude only; `plus`/`minus` prefix the figure. */
  readonly sign?: AmountSign;
}

/** Group an integer-part digit string with `.` every three digits from the right. */
function groupThousands(digits: string): string {
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += '.';
    out += digits[i];
  }
  return out;
}

/**
 * Format a numeric amount as a European-format euro string. The value's own
 * sign is ignored for the figure (magnitude is rendered); the `sign` option
 * controls any explicit prefix so callers decide credit/debit presentation.
 *
 *   formatEuroAmount(9506.21)                    → "9.506,21 €"
 *   formatEuroAmount(8647.5, { sign: 'minus' })  → "− 8.647,50 €"
 *   formatEuroAmount(9506.21, { sign: 'plus' })  → "+9.506,21 €"
 */
export function formatEuroAmount(value: number, options: FormatEuroOptions = {}): string {
  const sign = options.sign ?? 'none';
  const safe = Number.isFinite(value) ? value : 0;
  // Round to cents on the magnitude to avoid float drift in the last digit.
  const cents = Math.round(Math.abs(safe) * 100);
  const intPart = Math.floor(cents / 100).toString();
  const fracPart = (cents % 100).toString().padStart(2, '0');
  const figure = `${groupThousands(intPart)},${fracPart}${NBSP}${EURO}`;

  if (sign === 'minus') return `${MINUS}${THIN_SPACE}${figure}`;
  if (sign === 'plus') return `+${figure}`;
  return figure;
}
