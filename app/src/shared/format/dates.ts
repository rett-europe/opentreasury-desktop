// Issue #353 — Pure numeric date formatting (no Intl, no locale).
//
// Converts an ISO calendar date (`YYYY-MM-DD`) into the user's chosen numeric
// layout. Deliberately free of `Intl.DateTimeFormat` so the visible order and
// separators are fully deterministic and identical on every OS/Chromium locale
// — the native `<input type="date">` could never give us this guarantee.

import type { DateFormat } from './types.js';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

/** Separator used between day/month/year for each layout. */
function separatorFor(df: DateFormat): '/' | '-' {
  return df === 'ISO' ? '-' : '/';
}

/**
 * Format an ISO date (`YYYY-MM-DD`) into the chosen numeric layout. Components
 * are kept zero-padded exactly as they appear in the ISO input.
 *   - `DMY` → `DD/MM/YYYY`
 *   - `MDY` → `MM/DD/YYYY`
 *   - `ISO` → `YYYY-MM-DD`
 *
 * Invalid / non-`YYYY-MM-DD` input is returned unchanged (defensive fallback,
 * mirroring the previous display helpers).
 */
export function formatDateNumeric(iso: string, df: DateFormat): string {
  const m = ISO_DATE.exec(iso);
  if (m === null) return iso;
  const [, year, month, day] = m;
  switch (df) {
    case 'DMY':
      return `${day}/${month}/${year}`;
    case 'MDY':
      return `${month}/${day}/${year}`;
    case 'ISO':
    default:
      return `${year}-${month}-${day}`;
  }
}

/**
 * Format an ISO date range as `<from> <sep> <to>` where each endpoint uses the
 * chosen numeric layout. The endpoints are joined with an en dash. Used by the
 * Movements date-filter pill.
 */
export function formatDateRangeNumeric(from: string, to: string, df: DateFormat): string {
  return `${formatDateNumeric(from, df)} – ${formatDateNumeric(to, df)}`;
}

/**
 * Parse a user-typed date string in the chosen numeric layout back to an ISO
 * `YYYY-MM-DD` string, or `null` when it is not a valid calendar date in that
 * layout. Used by the custom `DateInput` to keep an ISO value model while the
 * user types in their preferred format.
 *
 * Validation accepts day/month either zero-padded or not (`1/4/2026` and
 * `01/04/2026` are both fine); the ISO output is always zero-padded. Impossible
 * calendar dates (e.g. `31/02/2026`) are rejected.
 */
export function parseDateNumeric(value: string, df: DateFormat): string | null {
  const trimmed = value.trim();
  let year: string;
  let month: string;
  let day: string;

  if (df === 'ISO') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(trimmed);
    if (m === null) return null;
    year = m[1]!;
    month = m[2]!;
    day = m[3]!;
  } else {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/u.exec(trimmed);
    if (m === null) return null;
    if (df === 'DMY') {
      day = m[1]!;
      month = m[2]!;
      year = m[3]!;
    } else {
      month = m[1]!;
      day = m[2]!;
      year = m[3]!;
    }
  }

  const y = Number(year);
  const mo = Number(month);
  const d = Number(day);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;

  // Reject impossible calendar dates (e.g. 31 April, 29 Feb non-leap) by
  // round-tripping through a UTC Date and comparing components back.
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    return null;
  }

  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * A human-facing placeholder string for the chosen layout, suitable for an
 * input field's `placeholder` attribute (e.g. `DD/MM/YYYY`).
 */
export function placeholderFor(df: DateFormat): string {
  switch (df) {
    case 'DMY':
      return 'DD/MM/YYYY';
    case 'MDY':
      return 'MM/DD/YYYY';
    case 'ISO':
    default:
      return 'YYYY-MM-DD';
  }
}

export { separatorFor as dateSeparatorFor };
