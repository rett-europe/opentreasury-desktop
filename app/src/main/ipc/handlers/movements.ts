// movements:list IPC handler factory — WI-12.
//
// Projects the core read model into the renderer's `MovementRecord` wire
// shape (ID-based; same columns as queryRecentTransactions). Applies optional
// filters and sorts DESC by date then createdAt, so the most recent movement
// appears first. Label resolution (accountId → accountLabel, etc.) is the
// renderer's concern per WI-14 — this handler stays pure wire-level.

import type { ReadModel, Transaction } from '../../../core/query/types.js';
import {
  movementsListRequestSchema,
  type MovementRecord,
  type MovementsListRequest,
} from '../../../shared/ipc-contracts/movements.js';

export interface MovementsListHandlerDeps {
  readonly getReadModel: () => ReadModel;
}

export function createMovementsListHandler(
  deps: MovementsListHandlerDeps,
): (raw: unknown) => Promise<MovementRecord[]> {
  return async function handleMovementsList(raw: unknown): Promise<MovementRecord[]> {
    const parsed: MovementsListRequest = movementsListRequestSchema.parse(raw ?? {});
    const model = deps.getReadModel();

    const filtered: Transaction[] = model.transactions.filter((tx) => {
      if (parsed.accountId !== undefined && tx.accountId !== parsed.accountId) return false;
      if (parsed.dateFrom !== undefined && tx.date < parsed.dateFrom) return false;
      if (parsed.dateTo !== undefined && tx.date > parsed.dateTo) return false;
      // SPEC-023 FR10/AC6 — Category filter: include parent if ANY split matches categoryId.
      if (parsed.categoryId !== undefined) {
        const parentMatches = tx.categoryId === parsed.categoryId;
        const splitMatches =
          model.splitParentIds.has(tx.id) &&
          (model.splits.get(tx.id) ?? []).some((s) => s.categoryId === parsed.categoryId);
        if (!parentMatches && !splitMatches) return false;
      }
      // SPEC-023 FR10/AC6 — Subcategory filter: include parent if ANY split matches subcategoryId.
      if (parsed.subcategoryId !== undefined) {
        const parentMatches = tx.subcategoryId === parsed.subcategoryId;
        const splitMatches =
          model.splitParentIds.has(tx.id) &&
          (model.splits.get(tx.id) ?? []).some((s) => s.subcategoryId === parsed.subcategoryId);
        if (!parentMatches && !splitMatches) return false;
      }
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
      accountId: tx.accountId,
      categoryId: tx.categoryId,
      subcategoryId: tx.subcategoryId,
      tagIds: [...tx.tagIds],
      status: tx.status,
      createdAt: tx.createdAt,
      reference: tx.reference,
      details: tx.details,
      // SPEC-023 — populate split metadata for renderer badge + edit routing.
      hasSplits: model.splitParentIds.has(tx.id),
      splitCount: model.splitParentIds.has(tx.id) ? (model.splits.get(tx.id)?.length ?? 0) : 0,
      // SPEC-023 FR10/AC6 — Include split category/subcategory IDs for client-side filtering.
      splitCategoryIds: model.splitParentIds.has(tx.id)
        ? (model.splits.get(tx.id) ?? [])
            .map((s) => s.categoryId)
            .filter((id): id is string => id !== null)
        : [],
      splitSubcategoryIds: model.splitParentIds.has(tx.id)
        ? (model.splits.get(tx.id) ?? [])
            .map((s) => s.subcategoryId)
            .filter((id): id is string => id !== null)
        : [],
    }));
  };
}
