// movements:list IPC handler factory — WI-12.
//
// Projects the core read model into the renderer's Movement shape
// (resolving account / category / subcategory / tag labels) and applies
// optional filters. Sorted DESC by date then createdAt, so the most recent
// movement appears first.

import type { ReadModel, Transaction } from '../../../core/query/types.js';
import {
  movementsListRequestSchema,
  type Movement,
  type MovementsListRequest,
} from '../../../shared/ipc-contracts/movements.js';

export interface MovementsListHandlerDeps {
  readonly getReadModel: () => ReadModel;
}

export function createMovementsListHandler(
  deps: MovementsListHandlerDeps,
): (raw: unknown) => Promise<Movement[]> {
  return async function handleMovementsList(raw: unknown): Promise<Movement[]> {
    const parsed: MovementsListRequest = movementsListRequestSchema.parse(raw ?? {});
    const model = deps.getReadModel();

    const accountLabels = new Map(model.accounts.map((a) => [a.id, a.accountLabel]));
    const categoryNames = new Map(model.categories.map((c) => [c.id, c.name]));
    const subcategoryNames = new Map<string, string>();
    for (const cat of model.categories) {
      for (const sub of cat.subcategories) {
        subcategoryNames.set(sub.id, sub.name);
      }
    }
    const tagNames = new Map(model.tags.map((t) => [t.id, t.name]));

    const filtered: Transaction[] = model.transactions.filter((tx) => {
      if (parsed.accountId !== undefined && tx.accountId !== parsed.accountId) return false;
      if (parsed.dateFrom !== undefined && tx.date < parsed.dateFrom) return false;
      if (parsed.dateTo !== undefined && tx.date > parsed.dateTo) return false;
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.createdAt.localeCompare(a.createdAt);
    });

    const offset = parsed.offset ?? 0;
    const limit = parsed.limit ?? sorted.length;
    const page = sorted.slice(offset, offset + limit);

    return page.map((tx) => ({
      id: tx.id,
      date: tx.date,
      type: tx.type,
      amount: tx.amount,
      currency: tx.currency,
      description: tx.description,
      account: accountLabels.get(tx.accountId) ?? tx.accountId,
      category: tx.categoryId === null ? null : (categoryNames.get(tx.categoryId) ?? null),
      subcategory:
        tx.subcategoryId === null ? null : (subcategoryNames.get(tx.subcategoryId) ?? null),
      tags: tx.tagIds.map((id) => tagNames.get(id) ?? id),
      status: tx.status,
    }));
  };
}
