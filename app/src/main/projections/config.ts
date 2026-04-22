// WI-15-lite + WI-21 projections — Configuración read-side selectors.
//
// Thin wrappers over the core read model. The reducer
// (core/query/reducers.ts) folds `*Created` / `*Updated` / `*Archived` /
// `*Unarchived` events into the three `configAccounts` / `configCategories`
// / `configTags` arrays (with subcategories inlined on categories, per
// WI-21 subcategory-shape decision — see
// `.squad/decisions/inbox/morpheus-wi21-events-ipc.md`).
//
// Two selector flavours per entity:
//   • `select*` — returns ALL records (including archived). Use when the
//     caller needs to render the "Mostrar archivadas" list.
//   • `selectActive*` — filters archived items out. Use for pickers, form
//     selectors, and default list views.
//
// `archivedAt` is projected verbatim; renderers decide how to style an
// archived entity.

import type { ReadModel } from '../../core/query/types.js';
import type { AccountRecord } from '../../shared/ipc-contracts/accounts.js';
import type { CategoryRecord, SubcategoryRecord } from '../../shared/ipc-contracts/categories.js';
import type { TagRecord } from '../../shared/ipc-contracts/tags.js';

function projectSubcategory(s: {
  readonly id: string;
  readonly parentCategoryId: string;
  readonly name: string;
  readonly color?: string;
  readonly createdAt: string;
  readonly archivedAt?: string;
}): SubcategoryRecord {
  return {
    id: s.id,
    parentCategoryId: s.parentCategoryId,
    name: s.name,
    createdAt: s.createdAt,
    ...(s.color !== undefined ? { color: s.color } : {}),
    ...(s.archivedAt !== undefined ? { archivedAt: s.archivedAt } : {}),
  };
}

export function selectAccounts(model: ReadModel): AccountRecord[] {
  return model.configAccounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    openingBalance: a.openingBalance,
    createdAt: a.createdAt,
    ...(a.bankName !== undefined ? { bankName: a.bankName } : {}),
    ...(a.label !== undefined ? { label: a.label } : {}),
    ...(a.iban !== undefined ? { iban: a.iban } : {}),
    ...(a.color !== undefined ? { color: a.color } : {}),
    ...(a.isPaypal !== undefined ? { isPaypal: a.isPaypal } : {}),
    ...(a.archivedAt !== undefined ? { archivedAt: a.archivedAt } : {}),
  }));
}

export function selectActiveAccounts(model: ReadModel): AccountRecord[] {
  return selectAccounts(model).filter((a) => a.archivedAt === undefined);
}

export function selectCategories(model: ReadModel): CategoryRecord[] {
  return model.configCategories.map((c) => ({
    id: c.id,
    name: c.name,
    createdAt: c.createdAt,
    subcategories: c.subcategories.map(projectSubcategory),
    ...(c.color !== undefined ? { color: c.color } : {}),
    ...(c.kind !== undefined ? { kind: c.kind } : {}),
    ...(c.archivedAt !== undefined ? { archivedAt: c.archivedAt } : {}),
  }));
}

// Returns active categories AND strips archived subcategories from the
// nested array — the Movement form picker must not surface archived
// subcategories under an otherwise-active parent.
export function selectActiveCategories(model: ReadModel): CategoryRecord[] {
  return selectCategories(model)
    .filter((c) => c.archivedAt === undefined)
    .map((c) => ({
      ...c,
      subcategories: (c.subcategories ?? []).filter((s) => s.archivedAt === undefined),
    }));
}

export function selectTags(model: ReadModel): TagRecord[] {
  return model.configTags.map((t) => ({
    id: t.id,
    name: t.name,
    createdAt: t.createdAt,
    ...(t.color !== undefined ? { color: t.color } : {}),
    ...(t.archivedAt !== undefined ? { archivedAt: t.archivedAt } : {}),
  }));
}

export function selectActiveTags(model: ReadModel): TagRecord[] {
  return selectTags(model).filter((t) => t.archivedAt === undefined);
}
