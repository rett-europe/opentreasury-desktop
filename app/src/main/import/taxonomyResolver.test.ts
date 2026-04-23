import { describe, it, expect } from 'vitest';
import type { ReadModel } from '../../core/query/types.js';
import {
  buildTaxonomyIndex,
  resolveRowTaxonomy,
  TaxonomyPreviewCollector,
  TAG_DELIMITER,
  planTaxonomyCreations,
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

  it('reports willCreate when a creation plan is passed to snapshot', () => {
    const c = new TaxonomyPreviewCollector();
    c.addCategory('Donativos', true);
    c.addCategory('Alquiler', false);
    c.addCategory('Material', false);
    c.addSubcategory('Oficina', false);

    const plan = {
      categoryNames: new Set(['alquiler']),
      subcategoryNames: new Set(['oficina']),
      orderedCategories: [{ name: 'Alquiler' }],
      orderedSubcategories: [{ parentKey: 'alquiler', name: 'Oficina' }],
    };
    const snap = c.snapshot(10, plan);
    expect(snap.categories.willCreate).toEqual(['Alquiler']);
    expect(snap.categories.willCreateCount).toBe(1);
    // "Material" stayed in the unknown bucket but NOT in the plan → no chip.
    expect(snap.categories.unknown).toContain('Material');
    expect(snap.subcategories.willCreate).toEqual(['Oficina']);
  });
});

// ---------------------------------------------------------------------------
// Issue #22 — planTaxonomyCreations
// ---------------------------------------------------------------------------
describe('planTaxonomyCreations', () => {
  it('returns an empty plan when every category/subcategory is already known', () => {
    const idx = buildTaxonomyIndex(
      makeModel({
        categories: [
          { id: 'c1', name: 'Donativos', subcategories: [{ id: 's1', name: 'Particular' }] },
        ],
      }),
    );
    const plan = planTaxonomyCreations(
      [
        { rawCategory: 'Donativos', rawSubcategory: 'Particular' },
        { rawCategory: 'DONATIVOS', rawSubcategory: 'particular' },
      ],
      idx,
    );
    expect(plan.orderedCategories).toEqual([]);
    expect(plan.orderedSubcategories).toEqual([]);
  });

  it('dedupes case-insensitively and keeps the first display-cased spelling', () => {
    const idx = buildTaxonomyIndex(makeModel({}));
    const plan = planTaxonomyCreations(
      [
        { rawCategory: 'Alquiler', rawSubcategory: '' },
        { rawCategory: 'alquiler', rawSubcategory: '' },
        { rawCategory: 'ALQUILER', rawSubcategory: '' },
      ],
      idx,
    );
    expect(plan.orderedCategories).toEqual([{ name: 'Alquiler' }]);
    expect(plan.categoryNames.has('alquiler')).toBe(true);
  });

  it('chains: creates a new parent category and a subcategory underneath it', () => {
    const idx = buildTaxonomyIndex(makeModel({}));
    const plan = planTaxonomyCreations([{ rawCategory: 'Viajes', rawSubcategory: 'Hoteles' }], idx);
    expect(plan.orderedCategories).toEqual([{ name: 'Viajes' }]);
    expect(plan.orderedSubcategories).toEqual([{ parentKey: 'viajes', name: 'Hoteles' }]);
  });

  it('creates a new subcategory under an existing category', () => {
    const idx = buildTaxonomyIndex(
      makeModel({
        categories: [{ id: 'c-dona', name: 'Donativos', subcategories: [] }],
      }),
    );
    const plan = planTaxonomyCreations(
      [{ rawCategory: 'Donativos', rawSubcategory: 'Particular' }],
      idx,
    );
    expect(plan.orderedCategories).toEqual([]);
    expect(plan.orderedSubcategories).toEqual([{ parentKey: 'donativos', name: 'Particular' }]);
  });

  it('skips subcategories whose category cell is empty (no parent to attach to)', () => {
    const idx = buildTaxonomyIndex(makeModel({}));
    const plan = planTaxonomyCreations([{ rawCategory: '', rawSubcategory: 'Orphan' }], idx);
    expect(plan.orderedSubcategories).toEqual([]);
    expect(plan.subcategoryNames.size).toBe(0);
  });

  it('emits categories alphabetically and subcategories grouped by parent then alphabetically', () => {
    const idx = buildTaxonomyIndex(makeModel({}));
    const plan = planTaxonomyCreations(
      [
        { rawCategory: 'Zeta', rawSubcategory: 'alpha' },
        { rawCategory: 'Alpha', rawSubcategory: 'zebra' },
        { rawCategory: 'Alpha', rawSubcategory: 'mango' },
      ],
      idx,
    );
    expect(plan.orderedCategories.map((c) => c.name)).toEqual(['Alpha', 'Zeta']);
    expect(plan.orderedSubcategories).toEqual([
      { parentKey: 'alpha', name: 'mango' },
      { parentKey: 'alpha', name: 'zebra' },
      { parentKey: 'zeta', name: 'alpha' },
    ]);
  });
});
