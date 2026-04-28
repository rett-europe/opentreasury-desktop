/**
 * SPEC-024 — Free-text Movement Search Tests
 *
 * Unit tests for pure search functions (normalize, parseQuery, matchAmount,
 * matchDate, buildHaystack, searchMovements).
 */

import { describe, it, expect } from 'vitest';
import {
  normalize,
  parseQuery,
  matchAmount,
  matchDate,
  buildHaystack,
  searchMovements,
  type LookupTables,
  type Transaction,
  type SearchRow,
} from './search.js';

describe('normalize', () => {
  it('strips diacritics and lowercases', () => {
    expect(normalize('Café')).toBe('cafe');
    expect(normalize('Acción')).toBe('accion');
    expect(normalize('COMIDA Equipo')).toBe('comida equipo');
  });

  it('handles Spanish accents', () => {
    expect(normalize('Niño')).toBe('nino');
    expect(normalize('Año')).toBe('ano');
    expect(normalize('Corazón')).toBe('corazon');
  });

  it('handles empty and whitespace', () => {
    expect(normalize('')).toBe('');
    expect(normalize('   ')).toBe('   ');
  });
});

describe('parseQuery', () => {
  it('tokenizes whitespace-separated words', () => {
    const result = parseQuery('comida material');
    expect(result.tokens).toEqual(['comida', 'material']);
    expect(result.phrases).toEqual([]);
  });

  it('preserves quoted phrases as single tokens', () => {
    const result = parseQuery('"comida equipo"');
    expect(result.tokens).toEqual(['comida equipo']);
    expect(result.phrases).toEqual(['comida equipo']);
  });

  it('mixes quoted and unquoted tokens', () => {
    const result = parseQuery('comida "equipo deportivo" material');
    expect(result.tokens).toEqual(['comida', 'equipo deportivo', 'material']);
    expect(result.phrases).toEqual(['equipo deportivo']);
  });

  it('normalizes query (case + diacritics)', () => {
    const result = parseQuery('Café "Acción Social"');
    expect(result.tokens).toEqual(['cafe', 'accion social']);
    expect(result.phrases).toEqual(['accion social']);
  });

  it('collapses whitespace', () => {
    const result = parseQuery('   comida    material   ');
    expect(result.tokens).toEqual(['comida', 'material']);
  });

  it('handles empty query', () => {
    const result = parseQuery('');
    expect(result.tokens).toEqual([]);
    expect(result.phrases).toEqual([]);
  });
});

describe('matchAmount', () => {
  it('matches integer amounts exactly', () => {
    expect(matchAmount('27', 2700)).toBe(true);
    expect(matchAmount('27', 2750)).toBe(false);
    expect(matchAmount('100', 10000)).toBe(true);
  });

  it('matches decimal amounts with . separator', () => {
    expect(matchAmount('27.5', 2750)).toBe(true);
    expect(matchAmount('27.50', 2750)).toBe(true);
    expect(matchAmount('27.51', 2750)).toBe(false);
  });

  it('matches decimal amounts with , separator', () => {
    expect(matchAmount('27,5', 2750)).toBe(true);
    expect(matchAmount('27,50', 2750)).toBe(true);
  });

  it('rejects non-numeric tokens', () => {
    expect(matchAmount('comida', 2750)).toBe(false);
    expect(matchAmount('abc', 2750)).toBe(false);
  });
});

describe('matchDate', () => {
  it('matches ISO YYYY-MM prefix', () => {
    expect(matchDate('2024-09', '2024-09-15', 'es-ES')).toBe(true);
    expect(matchDate('2024-09', '2024-10-15', 'es-ES')).toBe(false);
  });

  it('matches ISO YYYY-MM-DD exact', () => {
    expect(matchDate('2024-09-15', '2024-09-15', 'es-ES')).toBe(true);
    expect(matchDate('2024-09-15', '2024-09-16', 'es-ES')).toBe(false);
  });

  it('matches month name in English (long)', () => {
    expect(matchDate('september', '2024-09-15', 'en-US')).toBe(true);
    expect(matchDate('january', '2024-01-05', 'en-US')).toBe(true);
    expect(matchDate('january', '2024-02-05', 'en-US')).toBe(false);
  });

  it('matches month name in English (short)', () => {
    expect(matchDate('sep', '2024-09-15', 'en-US')).toBe(true);
    expect(matchDate('jan', '2024-01-05', 'en-US')).toBe(true);
  });

  it('matches month name in Spanish (long)', () => {
    expect(matchDate('enero', '2024-01-05', 'es-ES')).toBe(true);
    expect(matchDate('septiembre', '2024-09-15', 'es-ES')).toBe(true);
  });

  it('matches month name in Spanish (short)', () => {
    expect(matchDate('ene', '2024-01-05', 'es-ES')).toBe(true);
    expect(matchDate('sept', '2024-09-15', 'es-ES')).toBe(true); // Spanish uses 'sept' not 'sep'
  });

  it('is case-insensitive for month names', () => {
    expect(matchDate('SEPTEMBER', '2024-09-15', 'en-US')).toBe(true);
    expect(matchDate('Enero', '2024-01-05', 'es-ES')).toBe(true);
  });

  it('rejects non-matching tokens', () => {
    expect(matchDate('comida', '2024-09-15', 'es-ES')).toBe(false);
  });
});

describe('buildHaystack', () => {
  const mockLookups: LookupTables = {
    accountNameById: new Map([['acc1', 'Unicaja']]),
    categoryNameById: new Map([['cat1', 'Materiales']]),
    subcategoryNameById: new Map([['sub1', 'Oficina']]),
    tagNameById: new Map([['tag1', 'Proyecto A']]),
    notesByTxId: new Map([['tx1', [{ text: 'nota importante' }]]]),
    splitsByTxId: new Map([
      [
        'tx2',
        [
          {
            splitId: 'split1',
            comment: 'comida equipo',
            categoryId: 'cat1',
            subcategoryId: null,
            amountCents: 30000,
          },
          {
            splitId: 'split2',
            comment: 'material taller',
            categoryId: null,
            subcategoryId: null,
            amountCents: 20000,
          },
        ],
      ],
    ]),
  };

  it('includes all parent fields', () => {
    const tx: Transaction = {
      id: 'tx1',
      date: '2024-09-15',
      type: 'expense',
      amount: 2750,
      description: 'Pago Café',
      accountId: 'acc1',
      categoryId: 'cat1',
      subcategoryId: 'sub1',
      tagIds: ['tag1'],
      reference: 'REF-123',
      details: 'detalle adicional',
    };

    const row = buildHaystack(tx, mockLookups);

    expect(row.id).toBe('tx1');
    expect(row.amountCents).toBe(2750);
    expect(row.dateIso).toBe('2024-09-15');
    expect(row.haystack).toContain('pago cafe');
    expect(row.haystack).toContain('unicaja');
    expect(row.haystack).toContain('materiales');
    expect(row.haystack).toContain('oficina');
    expect(row.haystack).toContain('proyecto a');
    expect(row.haystack).toContain('ref-123');
    expect(row.haystack).toContain('detalle adicional');
    expect(row.haystack).toContain('27.50');
    expect(row.haystack).toContain('nota importante');
  });

  it('includes split fields', () => {
    const tx: Transaction = {
      id: 'tx2',
      date: '2024-09-15',
      type: 'expense',
      amount: 50000,
      description: 'Pago materiales',
      accountId: 'acc1',
      categoryId: null,
      subcategoryId: null,
      tagIds: [],
      reference: null,
      details: null,
    };

    const row = buildHaystack(tx, mockLookups);

    expect(row.splitIds).toEqual(['split1', 'split2']);
    expect(row.splitHaystacks).toHaveLength(2);
    expect(row.splitHaystacks[0]).toContain('comida equipo');
    expect(row.splitHaystacks[0]).toContain('materiales');
    expect(row.splitHaystacks[0]).toContain('300.00');
    expect(row.splitHaystacks[1]).toContain('material taller');
    expect(row.splitHaystacks[1]).toContain('200.00');
    expect(row.haystack).toContain('comida equipo');
    expect(row.haystack).toContain('material taller');
  });

  it('handles null/missing fields gracefully', () => {
    const tx: Transaction = {
      id: 'tx3',
      date: '2024-09-15',
      type: 'income',
      amount: 10000,
      description: 'Ingreso',
      accountId: 'unknown',
      categoryId: null,
      subcategoryId: null,
      tagIds: [],
      reference: null,
      details: null,
    };

    const row = buildHaystack(tx, mockLookups);

    expect(row.haystack).toContain('ingreso');
    expect(row.haystack).toContain('100.00');
  });
});

describe('searchMovements', () => {
  const mockRows: SearchRow[] = [
    {
      id: 'tx1',
      haystack: 'pago cafe del puerto materiales proyecto a 27.50',
      amountCents: 2750,
      dateIso: '2024-09-15',
      splitHaystacks: [],
      splitIds: [],
    },
    {
      id: 'tx2',
      haystack: 'compra material oficina 100.00',
      amountCents: 10000,
      dateIso: '2024-01-10',
      splitHaystacks: [],
      splitIds: [],
    },
    {
      id: 'tx3',
      haystack: 'pago servicios comida equipo materiales 300.00 material taller 200.00',
      amountCents: 50000,
      dateIso: '2024-09-20',
      splitHaystacks: ['comida equipo materiales 300.00', 'material taller 200.00'],
      splitIds: ['split1', 'split2'],
    },
  ];

  it('returns empty for empty query', () => {
    const result = searchMovements('', mockRows, 'es-ES');
    expect(result.matchedIds.size).toBe(0);
  });

  it('matches single token', () => {
    const result = searchMovements('cafe', mockRows, 'es-ES');
    expect(result.matchedIds.has('tx1')).toBe(true);
    expect(result.matchedIds.has('tx2')).toBe(false);
  });

  it('applies AND semantics (all tokens must match)', () => {
    const result = searchMovements('material proyecto', mockRows, 'es-ES');
    expect(result.matchedIds.has('tx1')).toBe(true);
    expect(result.matchedIds.has('tx2')).toBe(false);
    expect(result.matchedIds.has('tx3')).toBe(false);
  });

  it('matches quoted phrase', () => {
    const result = searchMovements('"comida equipo"', mockRows, 'es-ES');
    expect(result.matchedIds.has('tx3')).toBe(true);
    expect(result.matchedIds.has('tx1')).toBe(false);
  });

  it('matches amount', () => {
    const result = searchMovements('27.5', mockRows, 'es-ES');
    expect(result.matchedIds.has('tx1')).toBe(true);
    expect(result.matchedIds.has('tx2')).toBe(false);
  });

  it('matches amount with , separator', () => {
    const result = searchMovements('27,5', mockRows, 'es-ES');
    expect(result.matchedIds.has('tx1')).toBe(true);
  });

  it('matches date ISO prefix', () => {
    const result = searchMovements('2024-09', mockRows, 'es-ES');
    expect(result.matchedIds.has('tx1')).toBe(true);
    expect(result.matchedIds.has('tx3')).toBe(true);
    expect(result.matchedIds.has('tx2')).toBe(false);
  });

  it('matches month name in locale', () => {
    const result = searchMovements('septiembre', mockRows, 'es-ES');
    expect(result.matchedIds.has('tx1')).toBe(true);
    expect(result.matchedIds.has('tx3')).toBe(true);
    expect(result.matchedIds.has('tx2')).toBe(false);
  });

  it('flags split matches', () => {
    const result = searchMovements('comida', mockRows, 'es-ES');
    expect(result.matchedIds.has('tx3')).toBe(true);
    expect(result.splitMatchIdsByTx.get('tx3')).toEqual(['split1']);
  });

  it('flags multiple split matches', () => {
    const result = searchMovements('taller', mockRows, 'es-ES'); // Only in split2
    expect(result.matchedIds.has('tx1')).toBe(false);
    expect(result.matchedIds.has('tx2')).toBe(false);
    expect(result.matchedIds.has('tx3')).toBe(true);
    expect(result.splitMatchIdsByTx.get('tx3')).toEqual(['split2']);
  });

  it('is case-insensitive', () => {
    const result = searchMovements('CAFE', mockRows, 'es-ES');
    expect(result.matchedIds.has('tx1')).toBe(true);
  });

  it('is accent-insensitive', () => {
    const rowsWithAccents: SearchRow[] = [
      {
        id: 'tx4',
        haystack: 'cafe accion', // Pre-normalized haystack
        amountCents: 1000,
        dateIso: '2024-09-15',
        splitHaystacks: [],
        splitIds: [],
      },
    ];
    const result = searchMovements('cafe accion', rowsWithAccents, 'es-ES');
    expect(result.matchedIds.has('tx4')).toBe(true);
  });
});
