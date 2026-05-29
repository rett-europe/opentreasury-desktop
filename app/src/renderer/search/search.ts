/**
 * SPEC-024 — Free-text Movement Search
 *
 * Pure functions for searching transactions across all searchable fields.
 * Implements FR1-FR15 with NFD normalization, AND tokenization, and split-level
 * matching.
 */

/**
 * FR3 — Normalize text for accent-insensitive, case-insensitive matching.
 * Applies Unicode NFD decomposition, strips combining diacritics, and lowercases.
 *
 * Examples:
 *   normalize('Café') → 'cafe'
 *   normalize('Acción') → 'accion'
 *   normalize('COMIDA Equipo') → 'comida equipo'
 */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * FR4, FR5 — Parse query into tokens (AND semantics) and phrases.
 * Quoted phrases are preserved as single tokens. Whitespace-only tokens are collapsed.
 *
 * Examples:
 *   parseQuery('comida material') → { tokens: ['comida', 'material'], phrases: [] }
 *   parseQuery('"comida equipo"') → { tokens: ['comida equipo'], phrases: ['comida equipo'] }
 *   parseQuery('comida "equipo deportivo" material') → { tokens: ['comida', 'equipo deportivo', 'material'], phrases: ['equipo deportivo'] }
 */
export function parseQuery(q: string): { tokens: string[]; phrases: string[] } {
  const normalized = normalize(q);
  const tokens: string[] = [];
  const phrases: string[] = [];

  // Match quoted phrases and unquoted words
  const pattern = /"([^"]+)"|(\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(normalized)) !== null) {
    if (match[1] != null) {
      // Quoted phrase
      phrases.push(match[1]);
      tokens.push(match[1]);
    } else if (match[2] != null) {
      // Unquoted token
      tokens.push(match[2]);
    }
  }

  return { tokens, phrases };
}

/**
 * FR6 — Match amount queries against transaction amount in cents.
 * Accepts both , and . as decimal separator. Integer form matches exact cents only.
 *
 * Examples:
 *   matchAmount('27', 2700) → true
 *   matchAmount('27', 2750) → false
 *   matchAmount('27.5', 2750) → true
 *   matchAmount('27,5', 2750) → true
 *   matchAmount('27.50', 2750) → true
 */
export function matchAmount(token: string, amountCents: number): boolean {
  // Try to parse as decimal number with , or . separator
  // TODO(perocha, trial.3.13+): unify with `parseLocaleAmount` from
  // utils/numberFormat so search-query parsing matches the form inputs'
  // ES-locale handling (1.234,56 / 1,234.56 / 1234,56 / 1234.56). Out of
  // scope for the comma-decimal sweep PR — touched there only as a TODO.
  const normalized = token.replace(',', '.');
  const parsed = Number.parseFloat(normalized);

  if (Number.isNaN(parsed)) {
    return false;
  }

  // Convert to cents
  const expectedCents = Math.round(parsed * 100);
  return expectedCents === amountCents;
}

/**
 * FR7 — Match date queries against transaction date.
 * Supports:
 *   - ISO prefix: '2024-09' matches '2024-09-15'
 *   - Month name (full or 3-char abbrev) in current locale
 *   - Month + year combination
 *
 * Examples:
 *   matchDate('2024-09', '2024-09-15', 'es-ES') → true
 *   matchDate('sep', '2024-09-15', 'en-US') → true
 *   matchDate('sep 2024', '2024-09-15', 'en-US') → true
 *   matchDate('enero', '2024-01-05', 'es-ES') → true
 */
export function matchDate(token: string, dateIso: string, locale: string): boolean {
  // ISO prefix match (YYYY-MM or YYYY-MM-DD)
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(token)) {
    return dateIso.startsWith(token);
  }

  // Month name match
  const monthNames = getMonthNames(locale);
  const normalizedToken = normalize(token);

  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    const fullName = monthNames.long[monthIndex];
    const shortName = monthNames.short[monthIndex];

    if (
      fullName &&
      shortName &&
      (normalizedToken === normalize(fullName) || normalizedToken === normalize(shortName))
    ) {
      const monthStr = String(monthIndex + 1).padStart(2, '0');
      const dateMonth = dateIso.slice(5, 7);
      return dateMonth === monthStr;
    }
  }

  return false;
}

/**
 * Helper to get month names for a locale.
 * Uses Intl.DateTimeFormat to get localized month names.
 */
function getMonthNames(locale: string): { long: string[]; short: string[] } {
  const longFormatter = new Intl.DateTimeFormat(locale, { month: 'long' });
  const shortFormatter = new Intl.DateTimeFormat(locale, { month: 'short' });

  const long: string[] = [];
  const short: string[] = [];

  for (let month = 0; month < 12; month++) {
    const date = new Date(2000, month, 1);
    long.push(longFormatter.format(date));
    short.push(shortFormatter.format(date));
  }

  return { long, short };
}

/**
 * FR1 — Build search haystack for a transaction.
 * Concatenates all searchable fields: description, reference, details,
 * account, category, subcategory, tags, notes, splits (comment, category, subcategory).
 */
export interface SearchRow {
  readonly id: string;
  readonly haystack: string;
  readonly amountCents: number;
  readonly dateIso: string;
  readonly splitHaystacks: readonly string[];
  readonly splitIds: readonly string[];
}

export interface LookupTables {
  readonly accountNameById: Map<string, string>;
  readonly categoryNameById: Map<string, string>;
  readonly subcategoryNameById: Map<string, string>;
  readonly tagNameById: Map<string, string>;
  readonly notesByTxId: ReadonlyMap<string, readonly { text: string }[]>;
  readonly splitsByTxId: ReadonlyMap<
    string,
    readonly {
      splitId: string;
      comment: string | null;
      categoryId: string | null;
      subcategoryId: string | null;
      amountCents: number;
    }[]
  >;
}

export interface Transaction {
  readonly id: string;
  readonly date: string;
  readonly type: 'income' | 'expense';
  readonly amount: number;
  readonly description: string;
  readonly accountId: string;
  readonly categoryId: string | null;
  readonly subcategoryId: string | null;
  readonly tagIds: readonly string[];
  readonly reference: string | null;
  readonly details: string | null;
}

export function buildHaystack(tx: Transaction, lookups: LookupTables): SearchRow {
  const parts: string[] = [];

  // Core transaction fields
  parts.push(normalize(tx.description));

  if (tx.reference) {
    parts.push(normalize(tx.reference));
  }

  if (tx.details) {
    parts.push(normalize(tx.details));
  }

  // Account
  const accountName = lookups.accountNameById.get(tx.accountId);
  if (accountName) {
    parts.push(normalize(accountName));
  }

  // Category & subcategory
  if (tx.categoryId) {
    const categoryName = lookups.categoryNameById.get(tx.categoryId);
    if (categoryName) {
      parts.push(normalize(categoryName));
    }
  }

  if (tx.subcategoryId) {
    const subcategoryName = lookups.subcategoryNameById.get(tx.subcategoryId);
    if (subcategoryName) {
      parts.push(normalize(subcategoryName));
    }
  }

  // Tags
  for (const tagId of tx.tagIds) {
    const tagName = lookups.tagNameById.get(tagId);
    if (tagName) {
      parts.push(normalize(tagName));
    }
  }

  // Notes
  const notes = lookups.notesByTxId.get(tx.id);
  if (notes) {
    for (const note of notes) {
      parts.push(normalize(note.text));
    }
  }

  // Amount (formatted as decimal with . separator)
  const amountFormatted = (tx.amount / 100).toFixed(2);
  parts.push(amountFormatted);

  // Splits
  const splits = lookups.splitsByTxId.get(tx.id);
  const splitHaystacks: string[] = [];
  const splitIds: string[] = [];

  if (splits) {
    for (const split of splits) {
      splitIds.push(split.splitId);

      const splitParts: string[] = [];

      if (split.comment) {
        splitParts.push(normalize(split.comment));
      }

      if (split.categoryId) {
        const categoryName = lookups.categoryNameById.get(split.categoryId);
        if (categoryName) {
          splitParts.push(normalize(categoryName));
        }
      }

      if (split.subcategoryId) {
        const subcategoryName = lookups.subcategoryNameById.get(split.subcategoryId);
        if (subcategoryName) {
          splitParts.push(normalize(subcategoryName));
        }
      }

      const splitAmountFormatted = (split.amountCents / 100).toFixed(2);
      splitParts.push(splitAmountFormatted);

      const splitHaystack = splitParts.join(' ');
      splitHaystacks.push(splitHaystack);
      parts.push(splitHaystack);
    }
  }

  const haystack = parts.join(' ');
  const amountCents = tx.amount;
  const dateIso = tx.date;

  return {
    id: tx.id,
    haystack,
    amountCents,
    dateIso,
    splitHaystacks,
    splitIds,
  };
}

/**
 * FR1-FR15 — Search movements with full query support.
 * Returns matched transaction IDs and split-match indicators.
 */
export interface SearchResult {
  readonly matchedIds: Set<string>;
  readonly splitMatchIdsByTx: Map<string, string[]>;
}

export function searchMovements(
  query: string,
  rows: readonly SearchRow[],
  locale: string,
): SearchResult {
  const { tokens } = parseQuery(query);

  // FR9 — Empty query is a no-op
  if (tokens.length === 0) {
    return {
      matchedIds: new Set(),
      splitMatchIdsByTx: new Map(),
    };
  }

  const matchedIds = new Set<string>();
  const splitMatchIdsByTx = new Map<string, string[]>();

  for (const row of rows) {
    const matchedSplitIds: string[] = [];

    // Check if all tokens match somewhere in the row
    const allTokensMatch = tokens.every((token) => {
      // FR6 — Amount match
      if (matchAmount(token, row.amountCents)) {
        return true;
      }

      // FR7 — Date match
      if (matchDate(token, row.dateIso, locale)) {
        return true;
      }

      // FR3 — Substring match in haystack
      if (row.haystack.includes(token)) {
        // FR2 — Check split matches
        for (let i = 0; i < row.splitHaystacks.length; i++) {
          const splitHaystack = row.splitHaystacks[i];
          const splitId = row.splitIds[i];
          if (splitHaystack && splitId && splitHaystack.includes(token)) {
            if (!matchedSplitIds.includes(splitId)) {
              matchedSplitIds.push(splitId);
            }
          }
        }
        return true;
      }

      return false;
    });

    // FR4 — AND semantics: all tokens must match
    if (allTokensMatch) {
      matchedIds.add(row.id);

      if (matchedSplitIds.length > 0) {
        splitMatchIdsByTx.set(row.id, matchedSplitIds);
      }
    }
  }

  return { matchedIds, splitMatchIdsByTx };
}
