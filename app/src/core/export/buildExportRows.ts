// SPEC-027 — buildExportRows (FR11 row expansion + filtering + cap).
//
// Reuses the Movements read model as the DATA SOURCE (no parallel query
// pipeline), but the exported ROW SHAPE differs: split parents are expanded to
// one row PER CHILD (the parent envelope is not exported separately), and
// filters are applied at the exported-row level. The 100k cap is enforced
// AFTER expansion.

import type {
  ConfigAccount,
  ConfigCategory,
  ConfigTag,
  ReadModel,
  Transaction,
  TransactionSplit,
} from '../query/types.js';
import type { ExportFilters } from '../../shared/ipc-contracts/export.js';
import { MAX_EXPORT_ROWS, type ExportRow } from './types.js';

export type BuildExportRowsResult =
  | { readonly ok: true; readonly rows: ExportRow[] }
  | { readonly ok: false; readonly code: 'EXPORT_ROW_CAP_EXCEEDED' };

interface Lookups {
  readonly accountName: Map<string, string>;
  readonly categoryName: Map<string, string>;
  readonly subcategoryName: Map<string, string>;
  readonly tagName: Map<string, string>;
}

function buildLookups(model: ReadModel): Lookups {
  const accountName = new Map<string, string>();
  for (const a of model.configAccounts as readonly ConfigAccount[]) accountName.set(a.id, a.name);

  const categoryName = new Map<string, string>();
  const subcategoryName = new Map<string, string>();
  for (const c of model.configCategories as readonly ConfigCategory[]) {
    categoryName.set(c.id, c.name);
    for (const s of c.subcategories) subcategoryName.set(s.id, s.name);
  }

  const tagName = new Map<string, string>();
  for (const t of model.configTags as readonly ConfigTag[]) tagName.set(t.id, t.name);

  return { accountName, categoryName, subcategoryName, tagName };
}

function resolveName(map: Map<string, string>, id: string | null): string {
  if (id === null) return '';
  return map.get(id) ?? '';
}

function labelNamesFor(tx: Transaction, lookups: Lookups): string[] {
  return tx.tagIds.map((id) => lookups.tagName.get(id) ?? '').filter((n) => n.length > 0);
}

/**
 * Expand + filter the read model into ordered ExportRows.
 *
 * Filtering semantics (exported-row level):
 *   - date range: parent `tx.date` ∈ [dateFrom, dateTo] (splits inherit date).
 *   - account: `tx.accountId` ∈ accountIds (splits inherit account).
 *   - label: the parent transaction's tag NAMES intersect `labels`.
 *   - category/subcategory: matched against the ROW's own category — the split
 *     child's category for split rows, the parent's category for non-split rows.
 *
 * A split parent with two splits where only one matches the category filter
 * yields exactly one child row.
 */
export function buildExportRows(model: ReadModel, filters: ExportFilters): BuildExportRowsResult {
  const lookups = buildLookups(model);

  const accountIds =
    filters.accountIds && filters.accountIds.length > 0 ? new Set(filters.accountIds) : null;
  const categoryIds =
    filters.categoryIds && filters.categoryIds.length > 0 ? new Set(filters.categoryIds) : null;
  const subcategoryIds =
    filters.subcategoryIds && filters.subcategoryIds.length > 0
      ? new Set(filters.subcategoryIds)
      : null;
  const labels = filters.labels && filters.labels.length > 0 ? new Set(filters.labels) : null;

  const rows: ExportRow[] = [];

  // Deterministic order: date ASC, then createdAt ASC, then split sortOrder ASC.
  const ordered = [...model.transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.createdAt.localeCompare(b.createdAt);
  });

  for (const tx of ordered) {
    if (tx.date < filters.dateFrom || tx.date > filters.dateTo) continue;
    if (accountIds !== null && !accountIds.has(tx.accountId)) continue;

    const labelNames = labelNamesFor(tx, lookups);
    if (labels !== null && !labelNames.some((n) => labels.has(n))) continue;

    const labelsCell = labelNames.join(';');
    const accountCell = resolveName(lookups.accountName, tx.accountId);
    const hasSplits = model.splitParentIds.has(tx.id);

    if (hasSplits) {
      const splits = (model.splits.get(tx.id) ?? []) as readonly TransactionSplit[];
      const sign = tx.type === 'expense' ? -1 : 1;
      for (const split of [...splits].sort((a, b) => a.sortOrder - b.sortOrder)) {
        if (
          categoryIds !== null &&
          (split.categoryId === null || !categoryIds.has(split.categoryId))
        )
          continue;
        if (
          subcategoryIds !== null &&
          (split.subcategoryId === null || !subcategoryIds.has(split.subcategoryId))
        )
          continue;

        rows.push({
          date: tx.date,
          account: accountCell,
          category: resolveName(lookups.categoryName, split.categoryId),
          subcategory: resolveName(lookups.subcategoryName, split.subcategoryId),
          description: tx.description,
          amount: (sign * split.amountCents) / 100,
          currency: tx.currency,
          labels: labelsCell,
          reference: tx.reference ?? '',
          comment: split.comment ?? '',
          id: split.splitId,
          isSplit: true,
          parentId: tx.id,
        });
        if (rows.length > MAX_EXPORT_ROWS) return { ok: false, code: 'EXPORT_ROW_CAP_EXCEEDED' };
      }
    } else {
      if (categoryIds !== null && (tx.categoryId === null || !categoryIds.has(tx.categoryId)))
        continue;
      if (
        subcategoryIds !== null &&
        (tx.subcategoryId === null || !subcategoryIds.has(tx.subcategoryId))
      )
        continue;

      rows.push({
        date: tx.date,
        account: accountCell,
        category: resolveName(lookups.categoryName, tx.categoryId),
        subcategory: resolveName(lookups.subcategoryName, tx.subcategoryId),
        description: tx.description,
        amount: tx.type === 'expense' ? -tx.amount : tx.amount,
        currency: tx.currency,
        labels: labelsCell,
        reference: tx.reference ?? '',
        comment: tx.details ?? '',
        id: tx.id,
        isSplit: false,
        parentId: '',
      });
      if (rows.length > MAX_EXPORT_ROWS) return { ok: false, code: 'EXPORT_ROW_CAP_EXCEEDED' };
    }
  }

  return { ok: true, rows };
}
