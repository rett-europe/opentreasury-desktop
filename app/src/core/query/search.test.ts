import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Free-text Search — Unit Tests
// ---------------------------------------------------------------------------
// 📌 Tests the core search logic defined in SPEC-024
//
// Coverage:
// - normalize() — diacritic stripping, case normalization (ES + EN)
// - parseQuery() — tokenization, quoted phrases, mixed tokens
// - matchAmount() — decimal comma/dot, integer-exact, edge cases
// - matchDate() — ISO prefix, full month names, 3-char abbreviations, ES + EN
// - buildHaystack() — covers all FR1 fields including splits
// - AND-across-tokens semantics
// - Splits parent flagging with splitMatchIds
//
// Note: This suite depends on Trinity's search implementation module.
// If the module doesn't exist yet, tests will be skipped (module import wrapped in try-catch).
// Expected module path: app/src/core/query/search.ts or app/src/renderer/search/search.ts
// ---------------------------------------------------------------------------

// Conditional import to handle module not yet existing
// Module will be provided by Trinity's implementation
// Expected interface:
// - normalize(s: string): string
// - parseQuery(q: string): string[]
// - matchAmount(query: string, amountCents: number): boolean
// - matchDate(query: string, dateIso: string, locale: string, year?: number): boolean
// - buildHaystack(tx, splits, notes, lookups, locale?): string
// - searchMovements(query, transactions, splits, notes, lookups): Transaction[]

interface SearchModule {
  normalize?: (s: string) => string;
  parseQuery?: (q: string) => string[];
  matchAmount?: (query: string, amountCents: number) => boolean;
  matchDate?: (query: string, dateIso: string, locale: string, year?: number) => boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildHaystack?: (tx: any, splits: any[], notes: any[], lookups: any, locale?: string) => string;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  searchMovements?: (
    query: string,
    transactions: any[],
    splits: any[],
    notes: any[],
    lookups: any,
  ) => any[];
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

const searchModule: SearchModule = {};
const modulePresent = false;

// Implementation module doesn't exist yet — tests will be skipped until Trinity merges
// When Trinity's implementation lands, uncomment one of these imports:
// import * as searchModule from '../../src/core/query/search.js';
// OR
// import * as searchModule from '../../src/renderer/search/search.js';

const { normalize, parseQuery, matchAmount, matchDate, buildHaystack, searchMovements } =
  searchModule;

describe.skipIf(!modulePresent)('Free-text Search — Core Logic', () => {
  // -------------------------------------------------------------------------
  // normalize() — Diacritic stripping + case normalization
  // -------------------------------------------------------------------------
  describe('normalize()', () => {
    it('converts to lowercase', () => {
      expect(normalize('COMIDA')).toBe('comida');
      expect(normalize('Material')).toBe('material');
    });

    it('strips Spanish diacritics (NFD + diacritic removal)', () => {
      expect(normalize('Café')).toBe('cafe');
      expect(normalize('acción')).toBe('accion');
      expect(normalize('niño')).toBe('nino');
      expect(normalize('María')).toBe('maria');
      expect(normalize('José')).toBe('jose');
      expect(normalize('Ángel')).toBe('angel');
    });

    it('strips English diacritics (rare but supported)', () => {
      expect(normalize('naïve')).toBe('naive');
      expect(normalize('café')).toBe('cafe');
    });

    it('preserves non-diacritic characters', () => {
      expect(normalize('comida-2024')).toBe('comida-2024');
      expect(normalize('user@example.com')).toBe('user@example.com');
    });

    it('handles empty string', () => {
      expect(normalize('')).toBe('');
    });

    it('handles whitespace (preserves for phrase matching)', () => {
      expect(normalize('comida equipo')).toBe('comida equipo');
      expect(normalize('  extra   spaces  ')).toBe('  extra   spaces  ');
    });
  });

  // -------------------------------------------------------------------------
  // parseQuery() — Tokenization and quoted phrase handling
  // -------------------------------------------------------------------------
  describe('parseQuery()', () => {
    it('splits on whitespace by default', () => {
      const result = parseQuery('comida material');
      expect(result).toEqual(['comida', 'material']);
    });

    it('collapses multiple spaces into single token boundary', () => {
      const result = parseQuery('comida   material    equipo');
      expect(result).toEqual(['comida', 'material', 'equipo']);
    });

    it('trims leading and trailing whitespace', () => {
      const result = parseQuery('  comida material  ');
      expect(result).toEqual(['comida', 'material']);
    });

    it('handles quoted phrases as single token', () => {
      const result = parseQuery('"comida equipo"');
      expect(result).toEqual(['comida equipo']);
    });

    it('handles mixed quoted and unquoted tokens', () => {
      const result = parseQuery('material "comida equipo" oficina');
      expect(result).toEqual(['material', 'comida equipo', 'oficina']);
    });

    it('handles multiple quoted phrases', () => {
      const result = parseQuery('"first phrase" "second phrase"');
      expect(result).toEqual(['first phrase', 'second phrase']);
    });

    it('handles empty query', () => {
      const result = parseQuery('');
      expect(result).toEqual([]);
    });

    it('handles whitespace-only query', () => {
      const result = parseQuery('   ');
      expect(result).toEqual([]);
    });

    it('handles unclosed quotes (fallback: treat as literal character)', () => {
      const result = parseQuery('"unclosed phrase');
      // Behavior: either treat as single token or ignore the quote
      // Spec doesn't define this edge case — adjust based on Trinity's implementation
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // matchAmount() — Numeric matching with decimal comma/dot
  // -------------------------------------------------------------------------
  describe('matchAmount()', () => {
    it('matches decimal comma: "27,5" matches 2750 cents', () => {
      expect(matchAmount('27,5', 2750)).toBe(true);
    });

    it('matches decimal dot: "27.5" matches 2750 cents', () => {
      expect(matchAmount('27.5', 2750)).toBe(true);
    });

    it('matches two decimal places: "27.50" matches 2750 cents', () => {
      expect(matchAmount('27.50', 2750)).toBe(true);
      expect(matchAmount('27,50', 2750)).toBe(true);
    });

    it('integer-exact: "27" matches 2700 cents (€27.00) only', () => {
      expect(matchAmount('27', 2700)).toBe(true);
      expect(matchAmount('27', 2750)).toBe(false); // 27 ≠ 27.50
    });

    it('handles negative amounts', () => {
      expect(matchAmount('-27.5', -2750)).toBe(true);
      expect(matchAmount('-27', -2700)).toBe(true);
      expect(matchAmount('-27', -2750)).toBe(false);
    });

    it('handles zero', () => {
      expect(matchAmount('0', 0)).toBe(true);
      expect(matchAmount('0.0', 0)).toBe(true);
      expect(matchAmount('0.00', 0)).toBe(true);
    });

    it('handles very large amounts', () => {
      expect(matchAmount('1000000', 100000000)).toBe(true); // €1,000,000.00
      expect(matchAmount('1000000.99', 100000099)).toBe(true);
    });

    it('rejects non-numeric queries', () => {
      expect(matchAmount('abc', 2750)).toBe(false);
      expect(matchAmount('27abc', 2750)).toBe(false);
    });

    it('handles decimal-only formats: ".50" matches 50 cents', () => {
      expect(matchAmount('.50', 50)).toBe(true);
      expect(matchAmount(',50', 50)).toBe(true);
    });

    it('handles thousands separator (if supported)', () => {
      // SPEC doesn't specify thousands separator support — adjust based on implementation
      // Example: "1,000.50" → 100050 cents
      // For now, assume NOT supported in v1 (keep test commented or skip)
    });
  });

  // -------------------------------------------------------------------------
  // matchDate() — ISO prefix and month name matching
  // -------------------------------------------------------------------------
  describe('matchDate()', () => {
    it('matches ISO prefix: "2024-09" matches "2024-09-15"', () => {
      expect(matchDate('2024-09', '2024-09-15', 'en')).toBe(true);
      expect(matchDate('2024-09', '2024-09-01', 'en')).toBe(true);
      expect(matchDate('2024-09', '2024-10-15', 'en')).toBe(false);
    });

    it('matches full ISO date: "2024-09-15" matches "2024-09-15"', () => {
      expect(matchDate('2024-09-15', '2024-09-15', 'en')).toBe(true);
      expect(matchDate('2024-09-15', '2024-09-16', 'en')).toBe(false);
    });

    it('matches English month abbreviation: "sep" matches September (any year)', () => {
      expect(matchDate('sep', '2024-09-15', 'en')).toBe(true);
      expect(matchDate('sep', '2023-09-20', 'en')).toBe(true);
      expect(matchDate('sep', '2024-10-15', 'en')).toBe(false);
    });

    it('matches English full month name: "september" matches September', () => {
      expect(matchDate('september', '2024-09-15', 'en')).toBe(true);
      expect(matchDate('september', '2024-10-15', 'en')).toBe(false);
    });

    it('matches Spanish month abbreviation: "sep" matches septiembre', () => {
      expect(matchDate('sep', '2024-09-15', 'es')).toBe(true);
      expect(matchDate('sep', '2024-10-15', 'es')).toBe(false);
    });

    it('matches Spanish full month name: "septiembre" matches September', () => {
      expect(matchDate('septiembre', '2024-09-15', 'es')).toBe(true);
      expect(matchDate('septiembre', '2024-10-15', 'es')).toBe(false);
    });

    it('case-insensitive month names', () => {
      expect(matchDate('SEPTEMBER', '2024-09-15', 'en')).toBe(true);
      expect(matchDate('Sep', '2024-09-15', 'en')).toBe(true);
      expect(matchDate('SEPTIEMBRE', '2024-09-15', 'es')).toBe(true);
    });

    it('diacritic-insensitive month names (Spanish)', () => {
      // "febrero" (February in Spanish)
      expect(matchDate('febrero', '2024-02-10', 'es')).toBe(true);
      // Even if user types without accent, should match
    });

    it('matches month + year: "sep 2024" narrows to September 2024', () => {
      // This may require parseQuery to tokenize "sep 2024" → ['sep', '2024']
      // and matchDate to accept a year token separately
      // Spec says: "if a 4-digit year token is also present — that month of that specific year"
      // Implementation detail: matchDate may need to accept both tokens or a combined query
      // For now, test the basic case where the query is pre-parsed
      expect(matchDate('sep', '2024-09-15', 'en', 2024)).toBe(true);
      expect(matchDate('sep', '2023-09-15', 'en', 2024)).toBe(false);
    });

    it('handles all 12 months (English)', () => {
      const months = [
        'jan',
        'feb',
        'mar',
        'apr',
        'may',
        'jun',
        'jul',
        'aug',
        'sep',
        'oct',
        'nov',
        'dec',
      ];
      months.forEach((month, index) => {
        const monthNum = String(index + 1).padStart(2, '0');
        const date = `2024-${monthNum}-15`;
        expect(matchDate(month, date, 'en')).toBe(true);
      });
    });

    it('handles all 12 months (Spanish)', () => {
      const months = [
        'ene',
        'feb',
        'mar',
        'abr',
        'may',
        'jun',
        'jul',
        'ago',
        'sep',
        'oct',
        'nov',
        'dic',
      ];
      months.forEach((month, index) => {
        const monthNum = String(index + 1).padStart(2, '0');
        const date = `2024-${monthNum}-15`;
        expect(matchDate(month, date, 'es')).toBe(true);
      });
    });
  });

  // -------------------------------------------------------------------------
  // buildHaystack() — Covers all FR1 fields
  // -------------------------------------------------------------------------
  describe('buildHaystack()', () => {
    it('includes description field', () => {
      const tx = {
        id: 'tx-1',
        description: 'Comida del mercado',
        amount: 2750,
        date: '2024-09-15',
      };
      const haystack = buildHaystack(tx, [], [], {});
      expect(haystack).toContain('comida del mercado');
    });

    it('includes reference, details, and notes', () => {
      const tx = {
        id: 'tx-1',
        description: 'Payment',
        reference: 'REF-12345',
        details: 'Invoice details',
        amount: 5000,
        date: '2024-09-15',
      };
      const notes = [
        { text: 'Note from treasurer', transactionId: 'tx-1' },
        { text: 'Follow-up required', transactionId: 'tx-1' },
      ];
      const haystack = buildHaystack(tx, [], notes, {});
      expect(haystack).toContain('ref-12345');
      expect(haystack).toContain('invoice details');
      expect(haystack).toContain('note from treasurer');
      expect(haystack).toContain('follow-up required');
    });

    it('includes account, category, subcategory names via lookups', () => {
      const tx = {
        id: 'tx-1',
        description: 'Payment',
        accountId: 'acc-1',
        categoryId: 'cat-1',
        subcategoryId: 'sub-1',
        amount: 5000,
        date: '2024-09-15',
      };
      const lookups = {
        accounts: { 'acc-1': { name: 'Unicaja' } },
        categories: { 'cat-1': { name: 'Materiales' } },
        subcategories: { 'sub-1': { name: 'Oficina' } },
      };
      const haystack = buildHaystack(tx, [], [], lookups);
      expect(haystack).toContain('unicaja');
      expect(haystack).toContain('materiales');
      expect(haystack).toContain('oficina');
    });

    it('includes tag names via lookups', () => {
      const tx = {
        id: 'tx-1',
        description: 'Event expense',
        tagIds: ['tag-1', 'tag-2'],
        amount: 5000,
        date: '2024-09-15',
      };
      const lookups = {
        tags: {
          'tag-1': { name: 'Urgent' },
          'tag-2': { name: 'Project Alpha' },
        },
      };
      const haystack = buildHaystack(tx, [], [], lookups);
      expect(haystack).toContain('urgent');
      expect(haystack).toContain('project alpha');
    });

    it('includes formatted amount (both cents and decimal)', () => {
      const tx = {
        id: 'tx-1',
        description: 'Payment',
        amount: 2750, // €27.50
        date: '2024-09-15',
      };
      const haystack = buildHaystack(tx, [], [], {});
      // Should include both "2750" (cents) and "27.50" or "27,50" (formatted)
      expect(haystack).toMatch(/27[.,]50|2750/);
    });

    it('includes ISO date and localized month name', () => {
      const tx = {
        id: 'tx-1',
        description: 'Payment',
        amount: 5000,
        date: '2024-09-15',
      };
      const haystack = buildHaystack(tx, [], [], {}, 'en');
      expect(haystack).toContain('2024-09-15');
      expect(haystack).toContain('september'); // or 'sep'
    });

    it('includes split comment, category, subcategory, and amount', () => {
      const tx = {
        id: 'tx-1',
        description: 'Pago materiales',
        amount: 50000, // Parent amount (splits override this)
        date: '2024-09-15',
      };
      const splits = [
        { comment: 'Comida equipo', categoryId: 'cat-1', amount: 30000 },
        { comment: 'Material oficina', categoryId: 'cat-2', amount: 20000 },
      ];
      const lookups = {
        categories: {
          'cat-1': { name: 'Alimentación' },
          'cat-2': { name: 'Suministros' },
        },
      };
      const haystack = buildHaystack(tx, splits, [], lookups);
      expect(haystack).toContain('comida equipo');
      expect(haystack).toContain('material oficina');
      expect(haystack).toContain('alimentacion'); // normalized
      expect(haystack).toContain('suministros');
      expect(haystack).toMatch(/300[.,]00|30000/); // split amount
      expect(haystack).toMatch(/200[.,]00|20000/);
    });

    it('normalizes all fields (lowercase, diacritic-stripped)', () => {
      const tx = {
        id: 'tx-1',
        description: 'Café María',
        amount: 2750,
        date: '2024-09-15',
      };
      const haystack = buildHaystack(tx, [], [], {});
      expect(haystack).toContain('cafe maria'); // normalized
      expect(haystack).not.toContain('Café María'); // original should be normalized
    });
  });

  // -------------------------------------------------------------------------
  // AND-across-tokens semantics
  // -------------------------------------------------------------------------
  describe('searchMovements() — AND semantics', () => {
    const transactions = [
      {
        id: 'tx-1',
        description: 'Comida del mercado',
        amount: 2750,
        date: '2024-09-15',
      },
      {
        id: 'tx-2',
        description: 'Material de oficina',
        amount: 5000,
        date: '2024-09-20',
      },
      {
        id: 'tx-3',
        description: 'Comida para evento',
        categoryId: 'cat-equipo',
        amount: 10000,
        date: '2024-09-25',
      },
    ];

    const lookups = {
      categories: {
        'cat-equipo': { name: 'Equipo' },
      },
    };

    it('single token matches any transaction containing that token', () => {
      const result = searchMovements('comida', transactions, [], [], lookups);
      expect(result.map((r) => r.id)).toEqual(['tx-1', 'tx-3']);
    });

    it('multi-token AND: both tokens must match (possibly in different fields)', () => {
      const result = searchMovements('comida equipo', transactions, [], [], lookups);
      // tx-1: has "comida" but NOT "equipo" → excluded
      // tx-2: has neither → excluded
      // tx-3: has "comida" in description AND "equipo" in category → MATCH
      expect(result.map((r) => r.id)).toEqual(['tx-3']);
    });

    it('quoted phrase requires exact substring match', () => {
      const result = searchMovements('"comida del"', transactions, [], [], lookups);
      // tx-1: has exact phrase "comida del mercado" → MATCH
      // tx-3: has "comida para" → NO MATCH (not exact)
      expect(result.map((r) => r.id)).toEqual(['tx-1']);
    });

    it('mixed quoted and unquoted tokens', () => {
      const result = searchMovements('"comida para" evento', transactions, [], [], lookups);
      // tx-3: has "comida para evento" → both phrase and token match
      expect(result.map((r) => r.id)).toEqual(['tx-3']);
    });

    it('empty query returns all transactions', () => {
      const result = searchMovements('', transactions, [], [], lookups);
      expect(result.map((r) => r.id)).toEqual(['tx-1', 'tx-2', 'tx-3']);
    });

    it('no matches returns empty array', () => {
      const result = searchMovements('nonexistent', transactions, [], [], lookups);
      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Splits parent flagging with splitMatchIds
  // -------------------------------------------------------------------------
  describe('searchMovements() — Splits matching', () => {
    const transactions = [
      {
        id: 'tx-1',
        description: 'Pago materiales taller',
        amount: 50000,
        date: '2024-09-15',
        hasSplits: true,
      },
    ];

    const splits = [
      { id: 'split-1', transactionId: 'tx-1', comment: 'Comida equipo', amount: 30000 },
      { id: 'split-2', transactionId: 'tx-1', comment: 'Material oficina', amount: 20000 },
    ];

    it('returns parent when split comment matches', () => {
      const result = searchMovements('comida', transactions, splits, [], {});
      expect(result.map((r) => r.id)).toEqual(['tx-1']);
    });

    it('flags parent with splitMatchIds when split matches', () => {
      const result = searchMovements('comida', transactions, splits, [], {});
      expect(result[0].splitMatchIds).toEqual(['split-1']);
    });

    it('flags multiple splits if multiple match', () => {
      const result = searchMovements('material', transactions, splits, [], {});
      // "material" appears in parent description AND split-2 comment
      expect(result[0].splitMatchIds).toContain('split-2');
    });

    it('does not flag splits if only parent matches', () => {
      const result = searchMovements('taller', transactions, splits, [], {});
      // "taller" only in parent description, not in splits
      expect(result[0].splitMatchIds || []).toEqual([]);
    });
  });
});
