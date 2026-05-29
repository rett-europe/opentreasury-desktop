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
    sortOrder: a.sortOrder,
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

// Per-account usage aggregate over the movements read model.
//   • transactionCount: movements whose `accountId` matches.
// Single O(N) pass over `model.transactions`; emits one record per account
// referenced by at least one transaction. Accounts with no movements are
// absent from the result (renderer treats absence as zero — keeps the wire
// payload small for empty datasets). Mirrors `selectCategoryUsage`.
//
// Used by AddAccountModal to gate the opening-balance edit affordance: only
// accounts with `transactionCount === 0` may have their opening balance
// edited (otherwise the user is directed to a balance-adjustment flow).
export function selectAccountUsage(
  model: ReadModel,
): { accountId: string; transactionCount: number }[] {
  const tally = new Map<string, number>();
  for (const tx of model.transactions) {
    tally.set(tx.accountId, (tally.get(tx.accountId) ?? 0) + 1);
  }
  return Array.from(tally, ([accountId, transactionCount]) => ({ accountId, transactionCount }));
}

export function selectCategories(model: ReadModel): CategoryRecord[] {
  return model.configCategories.map((c) => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sortOrder,
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

// issue #52 — per-category usage aggregate over the movements read model.
//   • transactionCount: movements whose `categoryId` matches.
//   • classifiedCount:  movements with BOTH `categoryId` AND `subcategoryId`
//     set (fully classified to subcategory).
// Single O(N) pass over `model.transactions`; emits one record per category
// referenced by at least one transaction. Categories with no movements are
// absent from the result (renderer treats absence as zero — keeps the wire
// payload small for empty datasets).
export function selectCategoryUsage(
  model: ReadModel,
): { categoryId: string; transactionCount: number; classifiedCount: number }[] {
  const tally = new Map<string, { transactionCount: number; classifiedCount: number }>();
  for (const tx of model.transactions) {
    if (tx.categoryId === null) continue;
    const entry = tally.get(tx.categoryId) ?? { transactionCount: 0, classifiedCount: 0 };
    entry.transactionCount += 1;
    if (tx.subcategoryId !== null) entry.classifiedCount += 1;
    tally.set(tx.categoryId, entry);
  }
  return Array.from(tally, ([categoryId, counts]) => ({ categoryId, ...counts }));
}

export function selectTags(model: ReadModel): TagRecord[] {
  return model.configTags.map((t) => ({
    id: t.id,
    name: t.name,
    sortOrder: t.sortOrder,
    createdAt: t.createdAt,
    ...(t.color !== undefined ? { color: t.color } : {}),
    ...(t.archivedAt !== undefined ? { archivedAt: t.archivedAt } : {}),
  }));
}

export function selectActiveTags(model: ReadModel): TagRecord[] {
  return selectTags(model).filter((t) => t.archivedAt === undefined);
}
