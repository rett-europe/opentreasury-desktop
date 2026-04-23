import { describe, it, expect } from 'vitest';
import type { ReadModel } from '../../core/query/types.js';
import {
  buildTaxonomyIndex,
  resolveRowTaxonomy,
  TaxonomyPreviewCollector,
  TAG_DELIMITER,
} from './taxonomyResolver.js';

// Minimal read-model builder. Only the three fields the resolver touches are
// meaningful here; everything else is a stub so the tests stay focused.
function makeModel(opts: {
  categories?: Array<{
    id: string;
    name: string;
    archivedAt?: string;
    subcategories?: Array<{ id: string; name: string; archivedAt?: string }>;
  }>;
  tags?: Array<{ id: string; name: string; archivedAt?: string }>;
}): ReadModel {
  const configCategories = (opts.categories ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...(c.archivedAt !== undefined ? { archivedAt: c.archivedAt } : {}),
    subcategories: (c.subcategories ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      createdAt: '2026-01-01T00:00:00.000Z',
      ...(s.archivedAt !== undefined ? { archivedAt: s.archivedAt } : {}),
    })),
  }));
  const configTags = (opts.tags ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...(t.archivedAt !== undefined ? { archivedAt: t.archivedAt } : {}),
  }));
  return {
    transactions: [],
    accounts: [],
    categories: [],
    tags: [],
    configAccounts: [],
    configCategories,
    configTags,
    importMappings: [],
    rowHashes: new Set(),
    notesByTransactionId: new Map(),
    balancesByAccount: new Map(),
  } as unknown as ReadModel;
}

describe('buildTaxonomyIndex', () => {
  it('excludes archived categories, subcategories and tags', () => {
    const idx = buildTaxonomyIndex(
      makeModel({
        categories: [
          {
            id: 'cat-active',
            name: 'Donativos',
            subcategories: [
              { id: 'sub-active', name: 'Particular' },
              { id: 'sub-archived', name: 'Corporativo', archivedAt: '2026-03-01T00:00:00Z' },
            ],
          },
          { id: 'cat-archived', name: 'Viejo', archivedAt: '2026-02-01T00:00:00Z' },
        ],
        tags: [
          { id: 'tag-active', name: 'urgente' },
          { id: 'tag-archived', name: 'legacy', archivedAt: '2026-02-01T00:00:00Z' },
        ],
      }),
    );
    expect(idx.categoryByName.get('donativos')).toBe('cat-active');
    expect(idx.categoryByName.has('viejo')).toBe(false);
    const subs = idx.subcategoryByNameForCategory.get('cat-active');
    expect(subs?.get('particular')).toBe('sub-active');
    expect(subs?.has('corporativo')).toBe(false);
    expect(idx.tagByName.get('urgente')).toBe('tag-active');
    expect(idx.tagByName.has('legacy')).toBe(false);
  });
});

describe('resolveRowTaxonomy', () => {
  const model = makeModel({
    categories: [
      {
        id: 'cat-don',
        name: 'Donativos',
        subcategories: [{ id: 'sub-part', name: 'Particular' }],
      },
      { id: 'cat-gastos', name: 'Gastos', subcategories: [] },
    ],
    tags: [
      { id: 'tag-viajes', name: 'Viajes' },
      { id: 'tag-madrid', name: 'Madrid' },
    ],
  });
  const index = buildTaxonomyIndex(model);

  it('matches case-insensitively and trims whitespace', () => {
    const out = resolveRowTaxonomy(
      { rawCategory: '  donativos ', rawSubcategory: 'PARTICULAR', rawTag: '' },
      index,
    );
    expect(out.categoryId).toBe('cat-don');
    expect(out.subcategoryId).toBe('sub-part');
    expect(out.seen.category).toEqual({ name: 'donativos', known: true });
    expect(out.seen.subcategory).toEqual({ name: 'PARTICULAR', known: true });
  });

  it('drops subcategory when parent category is unknown', () => {
    const out = resolveRowTaxonomy(
      { rawCategory: 'Desconocida', rawSubcategory: 'Particular', rawTag: '' },
      index,
    );
    expect(out.categoryId).toBeNull();
    expect(out.subcategoryId).toBeNull();
    expect(out.seen.category).toEqual({ name: 'Desconocida', known: false });
    expect(out.seen.subcategory).toEqual({ name: 'Particular', known: false });
  });

  it('drops subcategory when it does not belong to the resolved category', () => {
    const out = resolveRowTaxonomy(
      { rawCategory: 'Gastos', rawSubcategory: 'Particular', rawTag: '' },
      index,
    );
    expect(out.categoryId).toBe('cat-gastos');
    expect(out.subcategoryId).toBeNull();
    expect(out.seen.subcategory).toEqual({ name: 'Particular', known: false });
  });

  it(`splits tags on "${TAG_DELIMITER}", ignores empty segments, resolves each`, () => {
    const out = resolveRowTaxonomy(
      { rawCategory: '', rawSubcategory: '', rawTag: 'Viajes;; madrid ;fantasma' },
      index,
    );
    expect(out.tagIds).toEqual(['tag-viajes', 'tag-madrid']);
    expect(out.seen.tags).toEqual([
      { name: 'Viajes', known: true },
      { name: 'madrid', known: true },
      { name: 'fantasma', known: false },
    ]);
  });

  it('returns empty/null fields when raw cells are blank', () => {
    const out = resolveRowTaxonomy(
      { rawCategory: '   ', rawSubcategory: '', rawTag: '   ' },
      index,
    );
    expect(out.categoryId).toBeNull();
    expect(out.subcategoryId).toBeNull();
    expect(out.tagIds).toEqual([]);
    expect(out.seen.category).toBeNull();
    expect(out.seen.subcategory).toBeNull();
    expect(out.seen.tags).toEqual([]);
  });
});

describe('TaxonomyPreviewCollector', () => {
  it('dedupes case-insensitively, preserves first spelling, and sorts alphabetically', () => {
    const c = new TaxonomyPreviewCollector();
    c.addCategory('Donativos', true);
    c.addCategory('DONATIVOS', true);
    c.addCategory('Alquiler', false);
    c.addCategory('alquiler', false);
    c.addTag('Viajes', true);
    c.addTag('Madrid', true);
    c.addTag('fantasma', false);
    const snap = c.snapshot(10);
    expect(snap.categories.knownCount).toBe(1);
    expect(snap.categories.known).toEqual(['Donativos']);
    expect(snap.categories.unknownCount).toBe(1);
    expect(snap.categories.unknown).toEqual(['Alquiler']);
    expect(snap.tags.known).toEqual(['Madrid', 'Viajes']);
    expect(snap.tags.unknown).toEqual(['fantasma']);
  });

  it('clamps the known/unknown sample lists to the provided limit', () => {
    const c = new TaxonomyPreviewCollector();
    for (let i = 0; i < 25; i++) c.addTag(`t${i.toString().padStart(2, '0')}`, true);
    const snap = c.snapshot(5);
    expect(snap.tags.knownCount).toBe(25);
    expect(snap.tags.known).toHaveLength(5);
    expect(snap.tags.known[0]).toBe('t00');
  });
});
