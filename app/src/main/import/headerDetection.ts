// Header-row auto-detection — WI-18.
//
// Scores the first up-to-20 preview rows of a CSV/XLSX sheet and picks
// the most-plausible "header" row. Pure function; easy to unit-test.
//
// Scoring rules (per row at 1-based index `i`, with `next` = row i+1):
// - +2 if row has >=3 non-empty cells AND all non-empty cells are short
//      text (<=40 chars) that do NOT parse as dates or numbers.
// - +3 if `next` row has >=2 cells that look date-ish or number-ish.
// - +1 if no cell in the row contains any digit.
// - -2 if the row has exactly 1 non-empty cell.
//
// Tie-break: earliest row wins. If max score < 3, fall back to row 1.

const MAX_HEADER_CELL_LEN = 40;

function isNonEmpty(cell: string): boolean {
  return cell.trim().length > 0;
}

function hasDigit(cell: string): boolean {
  return /\d/.test(cell);
}

// Loose date-ish check: any digit-based token that looks like a calendar
// value (DD/MM/YYYY, YYYY-MM-DD, DD.MM.YY, …). Intentionally permissive —
// we only need to know "the row below contains data-looking cells".
function looksLikeDate(cell: string): boolean {
  const s = cell.trim();
  if (!s) return false;
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(s)) return true;
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(s)) return true;
  return false;
}

// Loose number-ish check: digits with optional sign, decimal separator
// (, or .), thousands separators, parentheses, CR/DB or currency glyphs.
function looksLikeNumber(cell: string): boolean {
  const s = cell.trim();
  if (!s) return false;
  // Strip common decorations before testing.
  const stripped = s
    .replace(/[€$£¥]/g, '')
    .replace(/\bCR\b|\bDB\b/i, '')
    .replace(/[()\s']/g, '')
    .trim();
  if (!stripped) return false;
  // Must contain at least one digit and no letters.
  if (!/\d/.test(stripped)) return false;
  if (/[a-zA-Z]/.test(stripped)) return false;
  // Accept leading sign, digits, and separators.
  return /^[-+]?[\d.,]+$/.test(stripped);
}

function looksLikeHeaderCell(cell: string): boolean {
  const s = cell.trim();
  if (!s) return false;
  if (s.length > MAX_HEADER_CELL_LEN) return false;
  if (looksLikeDate(s)) return false;
  if (looksLikeNumber(s)) return false;
  return true;
}

function scoreRow(row: string[], next: string[] | undefined): number {
  const nonEmpty = row.filter(isNonEmpty);
  let score = 0;

  if (nonEmpty.length >= 3 && nonEmpty.every(looksLikeHeaderCell)) {
    score += 2;
  }

  if (next) {
    const nextDataCells = next.filter(
      (c) => isNonEmpty(c) && (looksLikeDate(c) || looksLikeNumber(c)),
    );
    if (nextDataCells.length >= 2) {
      score += 3;
    }
  }

  if (nonEmpty.length > 0 && !row.some((c) => hasDigit(c))) {
    score += 1;
  }

  if (nonEmpty.length === 1) {
    score -= 2;
  }

  return score;
}

/**
 * Returns the 1-based index of the best header row candidate in
 * `previewRows`. Never returns > 20. Falls back to 1 when no candidate
 * scores high enough.
 */
export function detectHeaderRow(previewRows: string[][]): number {
  if (previewRows.length === 0) return 1;

  const limit = Math.min(previewRows.length, 20);
  let bestIdx = 1;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < limit; i++) {
    const row = previewRows[i] ?? [];
    const next = previewRows[i + 1];
    const s = scoreRow(row, next);
    if (s > bestScore) {
      bestScore = s;
      bestIdx = i + 1;
    }
  }

  if (bestScore < 3) return 1;
  return bestIdx;
}
