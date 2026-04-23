// Name → id resolution for import taxonomy columns.
//
// The import wizard lets the user map spreadsheet columns onto `category`,
// `subcategory` and `tag`. Cells in those columns contain human-readable
// names (e.g. "Donativos", "Material oficina", "viajes; madrid"). This
// module builds case-insensitive lookup maps from the current read model
// and resolves each cell to an id, keeping track of which names were
// recognized vs unseen so the dry-run step can surface a taxonomy preview.
//
// Resolution policy (v1, dogfood-friendly):
//   • Case-insensitive, trimmed exact match against ACTIVE
//     (non-archived) entities. No fuzzy matching, no auto-create.
//   • Subcategories are scoped to their parent category: if a row names
//     both, the subcategory must belong to the resolved category. If the
//     category is unknown, the subcategory reference is dropped.
//   • Tags cells are split on `;` (semicolon). Empty segments are ignored.
//     Each segment is resolved independently; unknown tags are skipped.
//   • Unknown names are NOT errors — the row still imports, the reference
//     is simply dropped. Auto-creating unknowns is tracked as a follow-up.
//
// Everything in this module is a pure function over a snapshot taken once
// per handler call. No closures over the read model singleton.

import type { ReadModel } from '../../core/query/types.js';

export const TAG_DELIMITER = ';';

export interface TaxonomyIndex {
  /** name-lowercased → id, for active configCategories. */
  readonly categoryByName: ReadonlyMap<string, string>;
  /** Map of categoryId → (subcategory-name-lowercased → subcategoryId). */
  readonly subcategoryByNameForCategory: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /** name-lowercased → id, for active configTags. */
  readonly tagByName: ReadonlyMap<string, string>;
}

export function buildTaxonomyIndex(model: ReadModel): TaxonomyIndex {
  const categoryByName = new Map<string, string>();
  const subcategoryByNameForCategory = new Map<string, Map<string, string>>();
  for (const cat of model.configCategories) {
    if (cat.archivedAt !== undefined) continue;
    categoryByName.set(normalize(cat.name), cat.id);
    const subMap = new Map<string, string>();
    for (const sub of cat.subcategories) {
      if (sub.archivedAt !== undefined) continue;
      subMap.set(normalize(sub.name), sub.id);
    }
    subcategoryByNameForCategory.set(cat.id, subMap);
  }

  const tagByName = new Map<string, string>();
  for (const tag of model.configTags) {
    if (tag.archivedAt !== undefined) continue;
    tagByName.set(normalize(tag.name), tag.id);
  }

  return { categoryByName, subcategoryByNameForCategory, tagByName };
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

export interface ResolveRowInput {
  readonly rawCategory: string;
  readonly rawSubcategory: string;
  readonly rawTag: string;
}

export interface ResolveRowOutput {
  readonly categoryId: string | null;
  readonly subcategoryId: string | null;
  readonly tagIds: readonly string[];
  /** Trimmed (display-cased) names the row referenced, for preview aggregation. */
  readonly seen: {
    readonly category: { name: string; known: boolean } | null;
    readonly subcategory: { name: string; known: boolean } | null;
    readonly tags: ReadonlyArray<{ name: string; known: boolean }>;
  };
}

export function resolveRowTaxonomy(input: ResolveRowInput, index: TaxonomyIndex): ResolveRowOutput {
  const categoryName = input.rawCategory.trim();
  const subcategoryName = input.rawSubcategory.trim();
  const rawTag = input.rawTag.trim();

  let categoryId: string | null = null;
  let seenCategory: { name: string; known: boolean } | null = null;
  if (categoryName !== '') {
    const id = index.categoryByName.get(normalize(categoryName));
    categoryId = id ?? null;
    seenCategory = { name: categoryName, known: id !== undefined };
  }

  let subcategoryId: string | null = null;
  let seenSubcategory: { name: string; known: boolean } | null = null;
  if (subcategoryName !== '') {
    if (categoryId !== null) {
      const subMap = index.subcategoryByNameForCategory.get(categoryId);
      const id = subMap?.get(normalize(subcategoryName));
      subcategoryId = id ?? null;
      seenSubcategory = { name: subcategoryName, known: id !== undefined };
    } else {
      // Subcategory without a resolvable parent — treated as unknown in the
      // preview so the user is informed, but not imported.
      seenSubcategory = { name: subcategoryName, known: false };
    }
  }

  const tagIds: string[] = [];
  const seenTags: Array<{ name: string; known: boolean }> = [];
  if (rawTag !== '') {
    for (const raw of rawTag.split(TAG_DELIMITER)) {
      const name = raw.trim();
      if (name === '') continue;
      const id = index.tagByName.get(normalize(name));
      if (id !== undefined) tagIds.push(id);
      seenTags.push({ name, known: id !== undefined });
    }
  }

  return {
    categoryId,
    subcategoryId,
    tagIds,
    seen: {
      category: seenCategory,
      subcategory: seenSubcategory,
      tags: seenTags,
    },
  };
}

/**
 * Aggregator that collects distinct known / unknown names across all rows
 * for a single import run. Names are de-duplicated case-insensitively but
 * the first display-cased spelling is preserved for the preview UI.
 */
export class TaxonomyPreviewCollector {
  private readonly fields = {
    categories: makeFieldAgg(),
    subcategories: makeFieldAgg(),
    tags: makeFieldAgg(),
  };

  addCategory(name: string, known: boolean): void {
    add(this.fields.categories, name, known);
  }
  addSubcategory(name: string, known: boolean): void {
    add(this.fields.subcategories, name, known);
  }
  addTag(name: string, known: boolean): void {
    add(this.fields.tags, name, known);
  }

  ingest(seen: ResolveRowOutput['seen']): void {
    if (seen.category) this.addCategory(seen.category.name, seen.category.known);
    if (seen.subcategory) this.addSubcategory(seen.subcategory.name, seen.subcategory.known);
    for (const t of seen.tags) this.addTag(t.name, t.known);
  }

  snapshot(limit: number): {
    categories: FieldPreview;
    subcategories: FieldPreview;
    tags: FieldPreview;
  } {
    return {
      categories: finalize(this.fields.categories, limit),
      subcategories: finalize(this.fields.subcategories, limit),
      tags: finalize(this.fields.tags, limit),
    };
  }
}

interface FieldAgg {
  readonly known: Map<string, string>;
  readonly unknown: Map<string, string>;
}

interface FieldPreview {
  knownCount: number;
  unknownCount: number;
  known: string[];
  unknown: string[];
}

function makeFieldAgg(): FieldAgg {
  return { known: new Map(), unknown: new Map() };
}

function add(agg: FieldAgg, name: string, known: boolean): void {
  const key = normalize(name);
  if (key === '') return;
  const bucket = known ? agg.known : agg.unknown;
  if (!bucket.has(key)) bucket.set(key, name);
}

function finalize(agg: FieldAgg, limit: number): FieldPreview {
  return {
    knownCount: agg.known.size,
    unknownCount: agg.unknown.size,
    known: [...agg.known.values()].sort((a, b) => a.localeCompare(b)).slice(0, limit),
    unknown: [...agg.unknown.values()].sort((a, b) => a.localeCompare(b)).slice(0, limit),
  };
}
