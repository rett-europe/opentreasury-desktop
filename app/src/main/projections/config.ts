// WI-15-lite projections — Configuración read-side selectors.
//
// Thin wrappers over the core read model. The reducer (core/query/reducers.ts)
// folds AccountCreated / CategoryCreated / TagCreated events into the three
// `configAccounts` / `configCategories` / `configTags` arrays; these selectors
// return defensive copies (mutable arrays) so IPC handlers can hand them off
// without worrying about shared mutable references.

import type { ReadModel } from '../../core/query/types.js';
import type { AccountRecord } from '../../shared/ipc-contracts/accounts.js';
import type { CategoryRecord } from '../../shared/ipc-contracts/categories.js';
import type { TagRecord } from '../../shared/ipc-contracts/tags.js';

export function selectAccounts(model: ReadModel): AccountRecord[] {
  return model.configAccounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    openingBalance: a.openingBalance,
    createdAt: a.createdAt,
    ...(a.bankName !== undefined ? { bankName: a.bankName } : {}),
  }));
}

export function selectCategories(model: ReadModel): CategoryRecord[] {
  return model.configCategories.map((c) => ({
    id: c.id,
    name: c.name,
    createdAt: c.createdAt,
    ...(c.color !== undefined ? { color: c.color } : {}),
  }));
}

export function selectTags(model: ReadModel): TagRecord[] {
  return model.configTags.map((t) => ({
    id: t.id,
    name: t.name,
    createdAt: t.createdAt,
  }));
}
