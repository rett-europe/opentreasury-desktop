// SPEC-027 — buildExportRows (FR11 row expansion + filtering + cap).
//
// Reuses the Movements read model as the DATA SOURCE (no parallel query
// pipeline), but the exported ROW SHAPE differs: split parents are expanded to
// one row PER CHILD (the parent envelope is not exported separately), and
// filters are applied at the exported-row level. The 100k cap is enforced
// AFTER expansion.
//
// SPEC-027 §15 — every row also carries the running balance of its account,
// and a per-account summary (opening / in / out / closing) is returned for the
// date range. Both are computed in integer cents over ALL of the account's
// movements (seeded from `ConfigAccount.openingBalance`), so category/label
// filters never distort a balance — they only decide which rows are emitted.

import type {
  ConfigAccount,
  ConfigCategory,
  ConfigTag,
  ReadModel,
  Transaction,
  TransactionSplit,
} from '../query/types.js';
import type { ExportFilters } from '../../shared/ipc-contracts/export.js';
import { MAX_EXPORT_ROWS, type AccountBalanceSummary, type ExportRow } from './types.js';

export type BuildExportRowsResult =
  | {
      readonly ok: true;
      readonly rows: ExportRow[];
      readonly balances: AccountBalanceSummary[];
    }
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

  // Running balance per account, in integer cents, seeded from the opening
  // balance. Advanced by EVERY movement (in or out of the filters) so each
  // emitted row shows the real account balance after it.
  const runningCents = new Map<string, number>();
  for (const a of model.configAccounts as readonly ConfigAccount[]) {
    runningCents.set(a.id, toCents(a.openingBalance));
  }
  const rangeStats = new Map<string, { inCents: number; outCents: number; count: number }>();
  const accountsWithRows = new Set<string>();

  // Deterministic order: date ASC, then createdAt ASC, then split sortOrder ASC.
  // The stable sort keeps event-log order for ties (an import batch shares one
  // createdAt), i.e. the order the rows had in the imported file.
  const ordered = [...model.transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.createdAt.localeCompare(b.createdAt);
  });

  for (const tx of ordered) {
    if (tx.date > filters.dateTo) break;

    const sign = tx.type === 'expense' ? -1 : 1;
    const hasSplits = model.splitParentIds.has(tx.id);
    const splits = hasSplits
      ? [...((model.splits.get(tx.id) ?? []) as readonly TransactionSplit[])].sort(
          (a, b) => a.sortOrder - b.sortOrder,
        )
      : [];
    const totalCents = hasSplits
      ? splits.reduce((sum, s) => sum + s.amountCents, 0)
      : toCents(tx.amount);
    const startCents = runningCents.get(tx.accountId) ?? 0;

    if (tx.date < filters.dateFrom) {
      runningCents.set(tx.accountId, startCents + sign * totalCents);
      continue;
    }

    const stats = rangeStats.get(tx.accountId) ?? { inCents: 0, outCents: 0, count: 0 };
    if (sign > 0) stats.inCents += totalCents;
    else stats.outCents += totalCents;
    stats.count += 1;
    rangeStats.set(tx.accountId, stats);
    runningCents.set(tx.accountId, startCents + sign * totalCents);

    if (accountIds !== null && !accountIds.has(tx.accountId)) continue;

    const labelNames = labelNamesFor(tx, lookups);
    if (labels !== null && !labelNames.some((n) => labels.has(n))) continue;

    const labelsCell = labelNames.join(';');
    const accountCell = resolveName(lookups.accountName, tx.accountId);

    if (hasSplits) {
      // Each child row shows the balance after that child; the last child
      // therefore equals the balance after the whole parent movement.
      let childCents = startCents;
      for (const split of splits) {
        childCents += sign * split.amountCents;
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
          balance: childCents / 100,
          currency: tx.currency,
          labels: labelsCell,
          reference: tx.reference ?? '',
          comment: split.comment ?? '',
          id: split.splitId,
          isSplit: true,
          parentId: tx.id,
        });
        accountsWithRows.add(tx.accountId);
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
        balance: (startCents + sign * totalCents) / 100,
        currency: tx.currency,
        labels: labelsCell,
        reference: tx.reference ?? '',
        comment: tx.details ?? '',
        id: tx.id,
        isSplit: false,
        parentId: '',
      });
      accountsWithRows.add(tx.accountId);
      if (rows.length > MAX_EXPORT_ROWS) return { ok: false, code: 'EXPORT_ROW_CAP_EXCEEDED' };
    }
  }

  // Summary scope: the explicitly selected accounts (even with no rows — an
  // unchanged balance is still worth confirming), else every account that
  // produced at least one row. Listed in the user's configured account order.
  const summaryIds = accountIds ?? accountsWithRows;
  const knownIds = new Set(model.configAccounts.map((a) => a.id));
  const orderedIds = [
    ...[...model.configAccounts]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((a) => a.id)
      .filter((id) => summaryIds.has(id)),
    ...[...summaryIds].filter((id) => !knownIds.has(id)).sort(),
  ];

  const balances: AccountBalanceSummary[] = orderedIds.map((id) => {
    const closingCents = runningCents.get(id) ?? 0;
    const stats = rangeStats.get(id) ?? { inCents: 0, outCents: 0, count: 0 };
    return {
      account: resolveName(lookups.accountName, id),
      opening: (closingCents - stats.inCents + stats.outCents) / 100,
      moneyIn: stats.inCents / 100,
      moneyOut: stats.outCents / 100,
      closing: closingCents / 100,
      movementCount: stats.count,
    };
  });

  return { ok: true, rows, balances };
}

function toCents(euros: number): number {
  return Math.round(euros * 100);
}
