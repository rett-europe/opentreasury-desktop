# Skill: Search Over ReadModel (In-Memory Haystack Pattern)

**Status:** Active  
**Owner:** Trinity  
**First Use:** SPEC-024 (PR #132) — Free-text Movement Search  
**Last Updated:** 2026-04-28

## When to Use This Pattern

Apply this pattern when you need to implement **free-text search** over an in-memory dataset (e.g., transactions, categories, accounts) with:

- **Accent-insensitive, case-insensitive matching**
- **AND tokenization** (all query tokens must match)
- **Quoted phrase support**
- **Special field normalization** (amounts, dates)
- **Performance budget** < 100ms for 10k+ rows

Use this pattern when:
- Data is already loaded in memory (no server-side search)
- Dataset size is < 100k rows (linear scan is acceptable)
- Search must work offline
- You want zero external dependencies

Do NOT use this pattern when:
- Dataset > 100k rows (reverse index needed)
- Search must support fuzzy/typo-tolerant matching (use Fuse.js/MiniSearch)
- Backend has full-text search (PostgreSQL FTS, Elasticsearch)

## Core Components

### 1. Normalization Function

Strip diacritics, lowercase, handle Unicode NFD:

```typescript
export function normalize(s: string): string {
  return s
    .normalize('NFD') // Decompose accented chars → base + combining diacritics
    .replace(/[\u0300-\u036f]/g, '') // Strip combining diacritics
    .toLowerCase();
}
```

**Examples:**
- `normalize('Café')` → `'cafe'`
- `normalize('Acción')` → `'accion'`

### 2. Query Parser (AND Tokenization + Quoted Phrases)

```typescript
export function parseQuery(q: string): { tokens: string[]; phrases: string[] } {
  const normalized = normalize(q);
  const tokens: string[] = [];
  const phrases: string[] = [];

  const pattern = /"([^"]+)"|(\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(normalized)) !== null) {
    if (match[1]) {
      // Quoted phrase
      phrases.push(match[1]);
      tokens.push(match[1]);
    } else if (match[2]) {
      // Unquoted token
      tokens.push(match[2]);
    }
  }

  return { tokens, phrases };
}
```

**Examples:**
- `parseQuery('comida material')` → `{ tokens: ['comida', 'material'], phrases: [] }`
- `parseQuery('"comida equipo"')` → `{ tokens: ['comida equipo'], phrases: ['comida equipo'] }`

### 3. Haystack Builder

Pre-compute a single normalized string per row containing all searchable fields:

```typescript
export interface SearchRow {
  readonly id: string;
  readonly haystack: string; // Pre-normalized concatenated fields
  readonly amountCents: number; // For amount queries
  readonly dateIso: string; // For date queries
  // ... any other structured query fields
}

export function buildHaystack(item: YourDataType, lookups: LookupTables): SearchRow {
  const parts: string[] = [];

  // Add all searchable text fields (normalized)
  parts.push(normalize(item.description));
  if (item.reference) parts.push(normalize(item.reference));
  if (item.details) parts.push(normalize(item.details));

  // Add lookup-resolved names
  const accountName = lookups.accountNameById.get(item.accountId);
  if (accountName) parts.push(normalize(accountName));

  // Add formatted amounts/dates if they should be searchable
  const amountFormatted = (item.amount / 100).toFixed(2);
  parts.push(amountFormatted);

  const haystack = parts.join(' ');

  return {
    id: item.id,
    haystack,
    amountCents: item.amount,
    dateIso: item.date,
  };
}
```

### 4. Memoized Search Index

Build the haystack array **lazily** on first search use, memoized by **data dependencies** (not query):

```typescript
const searchIndex = useMemo<readonly SearchRow[]>(() => {
  if (data.length === 0) return [];

  const lookups: LookupTables = {
    accountNameById: new Map(accounts.map(a => [a.id, a.name])),
    categoryNameById: new Map(categories.map(c => [c.id, c.name])),
    // ... other lookups
  };

  return data.map(item => buildHaystack(item, lookups));
}, [data, accounts, categories]); // NOT [query, data] — query changes don't rebuild haystack
```

**Key:** Memoize by data sources (accounts, categories, etc), NOT by query. Haystack is derived from data, not from the query.

### 5. Search Function (Linear Scan)

```typescript
export function search(
  query: string,
  rows: readonly SearchRow[],
  locale: string,
): Set<string> {
  const { tokens } = parseQuery(query);

  if (tokens.length === 0) {
    return new Set(); // Empty query → no-op
  }

  const matchedIds = new Set<string>();

  for (const row of rows) {
    // AND semantics: all tokens must match
    const allMatch = tokens.every(token => {
      // Try amount match
      if (matchAmount(token, row.amountCents)) return true;

      // Try date match
      if (matchDate(token, row.dateIso, locale)) return true;

      // Try substring match in haystack
      if (row.haystack.includes(token)) return true;

      return false;
    });

    if (allMatch) {
      matchedIds.add(row.id);
    }
  }

  return matchedIds;
}
```

### 6. Filter Integration (AND Composition)

Apply search **after** structured filters to narrow results:

```typescript
const filtered = useMemo(() => {
  // 1. Apply structured filters first
  const structuredFiltered = allRows.filter(row => {
    if (typeFilter !== 'all' && row.type !== typeFilter) return false;
    if (accountFilter !== 'all' && row.account !== accountFilter) return false;
    // ... other filters
    return true;
  });

  // 2. Apply search filter (if query is non-empty)
  if (searchQuery.trim()) {
    const matchedIds = search(searchQuery, searchIndex, locale);
    return structuredFiltered.filter(row => matchedIds.has(row.id));
  }

  return structuredFiltered;
}, [allRows, typeFilter, accountFilter, searchQuery, searchIndex, locale]);
```

## Optional Extensions

### Amount Normalization

Support both `,` and `.` as decimal separators:

```typescript
export function matchAmount(token: string, amountCents: number): boolean {
  const normalized = token.replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  if (Number.isNaN(parsed)) return false;

  const expectedCents = Math.round(parsed * 100);
  return expectedCents === amountCents;
}
```

**Examples:**
- `matchAmount('27', 2700)` → `true`
- `matchAmount('27.5', 2750)` → `true`
- `matchAmount('27,5', 2750)` → `true`

### Date Normalization (ISO + Month Names)

```typescript
export function matchDate(token: string, dateIso: string, locale: string): boolean {
  // ISO prefix match (YYYY-MM or YYYY-MM-DD)
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(token)) {
    return dateIso.startsWith(token);
  }

  // Month name match (full or 3-char abbrev)
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
      return dateIso.slice(5, 7) === monthStr;
    }
  }

  return false;
}

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
```

**Examples:**
- `matchDate('2024-09', '2024-09-15', 'es-ES')` → `true`
- `matchDate('september', '2024-09-15', 'en-US')` → `true`
- `matchDate('sept', '2024-09-15', 'es-ES')` → `true` (Spanish)

## Match Highlighting

Build a React component to render text with `<mark>` tags around matched substrings:

```typescript
export function HighlightedText({ query, text }: { query: string; text: string }): JSX.Element {
  const highlighted = useMemo(() => {
    if (!query.trim()) return [text];

    const normalizedText = normalize(text);
    const tokens = normalize(query).split(/\s+/).filter(t => t.length > 0);

    // Find all match positions
    const matches: Array<{ start: number; end: number }> = [];
    for (const token of tokens) {
      let pos = 0;
      while ((pos = normalizedText.indexOf(token, pos)) !== -1) {
        matches.push({ start: pos, end: pos + token.length });
        pos += token.length;
      }
    }

    if (matches.length === 0) return [text];

    // Sort and merge overlapping matches
    matches.sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number }> = [];

    for (const match of matches) {
      if (merged.length === 0) {
        merged.push(match);
      } else {
        const last = merged[merged.length - 1];
        if (last && match.start <= last.end) {
          last.end = Math.max(last.end, match.end);
        } else {
          merged.push(match);
        }
      }
    }

    // Build fragments
    const fragments: Array<string | JSX.Element> = [];
    let lastEnd = 0;

    for (let i = 0; i < merged.length; i++) {
      const match = merged[i];
      if (!match) continue;

      if (match.start > lastEnd) {
        fragments.push(text.substring(lastEnd, match.start));
      }

      fragments.push(
        <mark key={`mark-${i}`} className="search-mark">
          {text.substring(match.start, match.end)}
        </mark>,
      );

      lastEnd = match.end;
    }

    if (lastEnd < text.length) {
      fragments.push(text.substring(lastEnd));
    }

    return fragments;
  }, [query, text]);

  return <>{highlighted}</>;
}
```

**Usage:**
```tsx
<HighlightedText query={searchQuery} text={transaction.description} />
```

## Performance Checklist

- [ ] Haystack built lazily (not on every projection)
- [ ] Memoized by data dependencies, not query
- [ ] Linear scan < 10ms for your dataset size
- [ ] Search index invalidated on rename events (account/category/tag)
- [ ] Debounce user input (200ms trailing-edge recommended)

## Testing Pattern

```typescript
describe('search', () => {
  it('matches single token', () => {
    const rows: SearchRow[] = [
      { id: '1', haystack: 'cafe del puerto', amountCents: 2750, dateIso: '2024-09-15' },
      { id: '2', haystack: 'material oficina', amountCents: 10000, dateIso: '2024-01-10' },
    ];

    const result = search('cafe', rows, 'es-ES');
    expect(result.has('1')).toBe(true);
    expect(result.has('2')).toBe(false);
  });

  it('applies AND semantics', () => {
    const result = search('cafe material', rows, 'es-ES');
    expect(result.size).toBe(0); // No row has both tokens
  });

  it('is accent-insensitive', () => {
    const result = search('café', rows, 'es-ES');
    expect(result.has('1')).toBe(true); // haystack normalized to 'cafe'
  });
});
```

## Common Gotchas

1. **Memoization key:** Use data dependencies (`[data, accounts, categories]`), NOT `[query, data]`. Query changes shouldn't rebuild the haystack.

2. **Month name localization:** Spanish September is `"sept"` (4 chars), not `"sep"`. Use `Intl.DateTimeFormat` instead of manual truncation.

3. **Overlapping matches:** Merge adjacent/overlapping match positions before building `<mark>` fragments, or you'll get nested tags.

4. **NFD edge cases:** NFD doesn't decompose all combined chars (e.g., ß, æ). For SPEC-024 scope (Spanish/English), this is not an issue. For broader Unicode support, consider a library like `unorm`.

5. **Empty query:** Always no-op on empty/whitespace-only query to avoid returning the full dataset.

## References

- **First implementation:** PR #132 — Free-text Movement Search (SPEC-024)
- **Test coverage:** `app/src/renderer/search/search.test.ts` (36 tests)
- **Performance measurement:** SPEC-024 §12 — Linear scan ~2-4ms @ 10k rows (Node 18, i5-class laptop)

## Gotcha 6 — Debounce the *applied* query, not the input value

The topbar input must update its visible text on every keystroke (otherwise it feels broken), but anything that triggers a re-render of the screen rendering search results MUST be debounced. Wiring `<input onChange={setAppliedQuery}>` directly to the parent's setter looks like it works in dev (small dataset → cheap rerender) but produces visible per-keystroke lag at realistic scale (~10k rows → multi-frame stalls per character).

**Pattern:**

- Local state: `inputValue` (instant, drives the input's `value=`).
- Debounced dispatch: 200 ms trailing edge writes `inputValue` to the parent (`onSearchQueryChange`) and triggers any side effect (navigation, telemetry).
- Enter / Esc / clear-button: cancel the pending timer and dispatch (or clear) immediately — the user has expressed intent.
- Prop → local sync via `lastDispatchedRef` so external resets (e.g. App clearing the query on route change) reach the input, but our own debounced echoes don't clobber in-flight typing.

This is a *parent re-render* problem, not a search-cost problem: `searchMovements` itself is ~2-4 ms at 10k rows. The cost that bites is React committing the full filtered result tree on every keystroke.

**Symptom to recognise:** "typing 'c' 'ca' 'cal' 'calen' each lags individually" — this is the parent rerendering per keystroke, not a slow regex.

**First seen:** PR fix(search) — eliminate per-keystroke lag in global search (Trinity, post-PR #132).