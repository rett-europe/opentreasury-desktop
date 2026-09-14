import type { Transaction, ConfigAccount, ReadModel } from './types';
import { getReadModel } from './reducers';
import { resolveCategoryName, resolveSubcategoryName } from './saldo';

// WI-23 — `Account` entity has been removed from the read model. The Panel
// screen wire contract still uses the legacy shape (`accountLabel`,
// `bankNameShort`, `isActive`) so we provide a projection adapter at the
// IPC-handler layer (main/ipc/handlers/panel.ts). This file now returns
// `ConfigAccount` directly; projection to the Panel wire shape happens
// in the handler. Displays that need the label fall back to
// `label ?? name` — see main/projections/config.ts for the canonical rule.

// SPEC-023 — effectiveAmounts helper: returns the amounts to use for
// aggregation. If the transaction has active splits, returns split amounts
// (converted from cents to EUR). Otherwise, returns the parent's single
// amount with its category. This normalises split children (integer cents)
// to EUR floats for downstream aggregations.
function effectiveAmounts(
  tx: Transaction,
  model: ReadModel,
): readonly { amount: number; categoryId: string | null; subcategoryId: string | null }[] {
  if (model.splitParentIds.has(tx.id)) {
    const splits = model.splits.get(tx.id) ?? [];
    return splits.map((s) => ({
      amount: s.amountCents / 100, // cents → EUR for aggregation
      categoryId: s.categoryId,
      subcategoryId: s.subcategoryId,
    }));
  }
  return [{ amount: tx.amount, categoryId: tx.categoryId, subcategoryId: tx.subcategoryId }];
}

// Query 1: Get recent transactions (sorted DESC by date, then createdAt)
export function queryRecentTransactions(limit = 10): Transaction[] {
  const model = getReadModel();
  return [...model.transactions]
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.createdAt.localeCompare(a.createdAt);
    })
    .slice(0, limit);
}

// Query 2: Get account balances (aggregate by account)
export interface AccountBalance {
  readonly accountId: string;
  readonly accountLabel: string;
  readonly income: number;
  readonly expense: number;
  readonly net: number;
}

function accountDisplayLabel(a: ConfigAccount): string {
  // WI-23 — the legacy `Account.accountLabel` is equivalent to
  // `ConfigAccount.label ?? ConfigAccount.name`. The Panel card renderer
  // relies on this exact fallback; change it here only if the projection
  // adapter in main/ipc/handlers/panel.ts is updated in lockstep.
  return a.label ?? a.name;
}

/**
 * getAccountBalances — Aggregate income/expense/net per account (all-time).
 *
 * Excludes opening balances; only sums transaction amounts across entire history.
 * For range-scoped balance summaries, see future getAccountBalancesInRange(from, to).
 */
export function getAccountBalances(): AccountBalance[] {
  const model = getReadModel();

  const balanceMap = new Map<string, { income: number; expense: number }>();
  for (const tx of model.transactions) {
    const amounts = effectiveAmounts(tx, model);
    for (const ea of amounts) {
      const entry = balanceMap.get(tx.accountId) ?? { income: 0, expense: 0 };
      if (tx.type === 'income') {
        entry.income += ea.amount;
      } else {
        entry.expense += ea.amount;
      }
      balanceMap.set(tx.accountId, entry);
    }
  }

  // Include every known account, even with zero activity — Panel renders one
  // card per account regardless of transaction volume.
  const result: AccountBalance[] = model.configAccounts.map((account: ConfigAccount) => {
    const { income, expense } = balanceMap.get(account.id) ?? { income: 0, expense: 0 };
    return {
      accountId: account.id,
      accountLabel: accountDisplayLabel(account),
      income: Math.round(income * 100) / 100,
      expense: Math.round(expense * 100) / 100,
      net: Math.round((income - expense) * 100) / 100,
    };
  });

  return result.sort((a, b) => a.accountLabel.localeCompare(b.accountLabel));
}

/**
 * getAccountBalancesInRange — Aggregate income/expense/net per account (date range).
 *
 * Excludes opening balances; only sums transaction amounts in the specified date range.
 * Filters by tx.date (YYYY-MM-DD lexicographic comparison) where from <= date <= to.
 * Returns all accounts (including zero-activity accounts) to mirror getAccountBalances behavior.
 *
 * @param from - Start date (inclusive, YYYY-MM-DD format)
 * @param to - End date (inclusive, YYYY-MM-DD format)
 */
export function getAccountBalancesInRange(from: string, to: string): AccountBalance[] {
  const model = getReadModel();

  const balanceMap = new Map<string, { income: number; expense: number }>();
  for (const tx of model.transactions) {
    // Filter transactions by inclusive date range (lexicographic YYYY-MM-DD)
    if (tx.date >= from && tx.date <= to) {
      const amounts = effectiveAmounts(tx, model);
      for (const ea of amounts) {
        const entry = balanceMap.get(tx.accountId) ?? { income: 0, expense: 0 };
        if (tx.type === 'income') {
          entry.income += ea.amount;
        } else {
          entry.expense += ea.amount;
        }
        balanceMap.set(tx.accountId, entry);
      }
    }
  }

  // Include every known account, even with zero activity — Panel renders one
  // card per account regardless of transaction volume.
  const result: AccountBalance[] = model.configAccounts.map((account: ConfigAccount) => {
    const { income, expense } = balanceMap.get(account.id) ?? { income: 0, expense: 0 };
    return {
      accountId: account.id,
      accountLabel: accountDisplayLabel(account),
      income: Math.round(income * 100) / 100,
      expense: Math.round(expense * 100) / 100,
      net: Math.round((income - expense) * 100) / 100,
    };
  });

  return result.sort((a, b) => a.accountLabel.localeCompare(b.accountLabel));
}

// Query 2c: Get account transaction counts in date range (from/to inclusive)
export function getAccountTransactionCountsInRange(
  from: string,
  to: string,
): Record<string, number> {
  const model = getReadModel();

  const countMap = new Map<string, number>();
  for (const tx of model.transactions) {
    // Filter transactions by inclusive date range (lexicographic YYYY-MM-DD)
    if (tx.date >= from && tx.date <= to) {
      const current = countMap.get(tx.accountId) ?? 0;
      countMap.set(tx.accountId, current + 1);
    }
  }

  // Include every known account with zero counts for those with no transactions
  const result: Record<string, number> = {};
  for (const account of model.configAccounts) {
    result[account.id] = countMap.get(account.id) ?? 0;
  }

  return result;
}

// Query 3: Get month KPIs (YYYY-MM format)
export interface MonthKPIs {
  readonly yearMonth: string; // YYYY-MM
  readonly income: number;
  readonly expense: number;
  readonly net: number;
  readonly transactionCount: number;
}

export function getMonthKPIs(yearMonth: string): MonthKPIs {
  const model = getReadModel();

  let income = 0;
  let expense = 0;
  let count = 0;

  for (const tx of model.transactions) {
    if (tx.date.startsWith(yearMonth)) {
      const amounts = effectiveAmounts(tx, model);
      for (const ea of amounts) {
        if (tx.type === 'income') {
          income += ea.amount;
        } else {
          expense += ea.amount;
        }
      }
      count += 1;
    }
  }

  return {
    yearMonth,
    income: Math.round(income * 100) / 100,
    expense: Math.round(expense * 100) / 100,
    net: Math.round((income - expense) * 100) / 100,
    transactionCount: count,
  };
}

// Query 3b: Get range-based KPIs (YYYY-MM-DD from/to, inclusive)
export interface RangeKPIs {
  readonly from: string; // YYYY-MM-DD
  readonly to: string; // YYYY-MM-DD
  readonly income: number;
  readonly expense: number;
  readonly net: number;
  readonly transactionCount: number;
}

export function getRangeKPIs(from: string, to: string): RangeKPIs {
  const model = getReadModel();

  let income = 0;
  let expense = 0;
  let count = 0;

  for (const tx of model.transactions) {
    // Lexicographic comparison is safe for YYYY-MM-DD strings
    if (tx.date >= from && tx.date <= to) {
      const amounts = effectiveAmounts(tx, model);
      for (const ea of amounts) {
        if (tx.type === 'income') {
          income += ea.amount;
        } else {
          expense += ea.amount;
        }
      }
      count += 1;
    }
  }

  return {
    from,
    to,
    income: Math.round(income * 100) / 100,
    expense: Math.round(expense * 100) / 100,
    net: Math.round((income - expense) * 100) / 100,
    transactionCount: count,
  };
}

// Query 4: Get account sparklines (12-month net buckets)
export interface AccountSparkline {
  readonly accountId: string;
  readonly months: readonly MonthBucket[]; // 12 buckets, oldest first
}

export interface MonthBucket {
  readonly yearMonth: string; // YYYY-MM
  readonly net: number;
}

export function getAccountSparklines(accountId: string): AccountSparkline {
  const model = getReadModel();

  // Get the last 12 months relative to now
  const now = new Date();
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push(yearMonth);
  }

  const bucketMap = new Map<string, { income: number; expense: number }>();
  for (const month of months) {
    bucketMap.set(month, { income: 0, expense: 0 });
  }

  for (const tx of model.transactions) {
    if (tx.accountId === accountId) {
      const txMonth = tx.date.substring(0, 7); // YYYY-MM
      if (bucketMap.has(txMonth)) {
        const bucket = bucketMap.get(txMonth)!;
        const amounts = effectiveAmounts(tx, model);
        for (const ea of amounts) {
          if (tx.type === 'income') {
            bucket.income += ea.amount;
          } else {
            bucket.expense += ea.amount;
          }
        }
      }
    }
  }

  const monthBuckets: MonthBucket[] = months.map((month) => {
    const { income, expense } = bucketMap.get(month)!;
    return {
      yearMonth: month,
      net: Math.round((income - expense) * 100) / 100,
    };
  });

  return {
    accountId,
    months: monthBuckets,
  };
}

// Query 5: Get all accounts (sorted by sortOrder, then label)
export function getAccounts(): ConfigAccount[] {
  const model = getReadModel();
  return [...model.configAccounts].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return accountDisplayLabel(a).localeCompare(accountDisplayLabel(b));
  });
}

// Query 6: Get monthly income/expense breakdown (12 months)
export interface MonthlyIncomeExpense {
  readonly yearMonth: string; // YYYY-MM
  readonly income: number;
  readonly expense: number;
}

export function getMonthlyIncomeExpense(): MonthlyIncomeExpense[] {
  const model = getReadModel();

  // Get the last 12 months relative to now
  const now = new Date();
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push(yearMonth);
  }

  const bucketMap = new Map<string, { income: number; expense: number }>();
  for (const month of months) {
    bucketMap.set(month, { income: 0, expense: 0 });
  }

  for (const tx of model.transactions) {
    const txMonth = tx.date.substring(0, 7); // YYYY-MM
    if (bucketMap.has(txMonth)) {
      const bucket = bucketMap.get(txMonth)!;
      const amounts = effectiveAmounts(tx, model);
      for (const ea of amounts) {
        if (tx.type === 'income') {
          bucket.income += ea.amount;
        } else {
          bucket.expense += ea.amount;
        }
      }
    }
  }

  return months.map((month) => {
    const { income, expense } = bucketMap.get(month)!;
    return {
      yearMonth: month,
      income: Math.round(income * 100) / 100,
      expense: Math.round(expense * 100) / 100,
    };
  });
}

// ---------------------------------------------------------------------------
// SPEC-030 (WI-1) — Financial Report core query.
//
// The Financial Report is structurally the same aggregation as the Saldo/Panel
// screen, but grouped BY CATEGORY (and optionally subcategory) instead of by
// account or month. These functions are the ONLY new aggregation introduced by
// the report; everything else composes existing queries (getRangeKPIs,
// getAccountBalancesInRange). They reuse the same `effectiveAmounts`
// split-normalisation and the saldo name resolvers so the report can never
// disagree with the Panel screen.
//
// Classification is the transaction's first-class `Transaction.type`
// ('income' | 'expense') — NOT the amount sign, NOT `category.kind`. Split
// children inherit the parent's `type` (their category may differ). A single
// category may therefore appear on BOTH the income and expense side.
//
// Display names follow the core/query convention (saldo.ts): a `null` label
// means "no resolvable category/subcategory" — the renderer maps `null` to the
// i18n "Unclassified" string. The core layer never hard-codes that string.
// ---------------------------------------------------------------------------

export type CategoryBreakdownGrouping = 'category' | 'category-subcategory';

/**
 * Set of category ids flagged `isInternalTransfer` — money moved between the
 * organisation's own accounts. Built once per query so the hot loop is O(1).
 */
function internalTransferCategoryIds(model: ReadModel): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const category of model.configCategories) {
    if (category.isInternalTransfer === true) ids.add(category.id);
  }
  return ids;
}

function isInternalTransfer(categoryId: string | null, transferIds: ReadonlySet<string>): boolean {
  return categoryId !== null && transferIds.has(categoryId);
}

export interface CategoryBreakdownSubRow {
  readonly subcategoryId: string | null;
  // null → renderer i18n "Unclassified" (subcategory-less tx in subcategory mode)
  readonly label: string | null;
  readonly total: number;
}

export interface CategoryBreakdownRow {
  readonly categoryId: string | null;
  // null → renderer i18n "Unclassified" (uncategorised tx)
  readonly label: string | null;
  // Present only when grouping === 'category-subcategory'.
  readonly subRows?: readonly CategoryBreakdownSubRow[];
  readonly total: number;
}

export interface CategoryBreakdown {
  // type === 'income' line items (+ Unclassified bucket)
  readonly income: CategoryBreakdownRow[];
  // type === 'expense' line items (+ Unclassified bucket)
  readonly expense: CategoryBreakdownRow[];
}

interface BreakdownBucket {
  total: number;
  bySub: Map<string | null, { total: number }>;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

function buildRows(
  byCategory: Map<string | null, BreakdownBucket>,
  grouping: CategoryBreakdownGrouping,
  model: ReadModel,
): CategoryBreakdownRow[] {
  const rows: CategoryBreakdownRow[] = [];
  for (const [categoryId, bucket] of byCategory) {
    const row: CategoryBreakdownRow = {
      categoryId,
      label: resolveCategoryName(categoryId, model),
      total: round2(bucket.total),
      ...(grouping === 'category-subcategory'
        ? {
            subRows: [...bucket.bySub]
              .map(
                ([subcategoryId, sub]): CategoryBreakdownSubRow => ({
                  subcategoryId,
                  label: resolveSubcategoryName(categoryId, subcategoryId, model),
                  total: round2(sub.total),
                }),
              )
              .sort(sortBySubRow),
          }
        : {}),
    };
    rows.push(row);
  }
  return rows.sort(sortByRow);
}

// Deterministic ordering (NFR6): largest magnitude first, then label, then id.
// `null` (Unclassified) sorts last within equal totals so the bucket is stable.
function sortByRow(a: CategoryBreakdownRow, b: CategoryBreakdownRow): number {
  if (b.total !== a.total) return b.total - a.total;
  return (a.label ?? '\uffff').localeCompare(b.label ?? '\uffff');
}

function sortBySubRow(a: CategoryBreakdownSubRow, b: CategoryBreakdownSubRow): number {
  if (b.total !== a.total) return b.total - a.total;
  return (a.label ?? '\uffff').localeCompare(b.label ?? '\uffff');
}

/**
 * getCategoryBreakdownInRange — SPEC-030 FR4/FR5/FR6/FR7.
 *
 * Groups income/expense transactions over an inclusive date range BY CATEGORY,
 * and (when grouping === 'category-subcategory') by subcategory within each
 * category. Classification uses the first-class `Transaction.type`. Split
 * children are normalised via `effectiveAmounts` (each child attributed to its
 * own category/subcategory but the parent's income/expense direction).
 *
 * Amounts in a category flagged `isInternalTransfer` are EXCLUDED from both
 * tables: moving money between the organisation's own accounts is neither
 * income nor expense, and counting both legs inflates credits and debits by
 * the same amount. `getReconciliationForRange` reports them separately as a
 * net line so the cash arithmetic still ties out.
 *
 * Per-table subtotals reconcile exactly to `getReconciliationForRange` over
 * the same range and scope:
 *   - consolidated (accountId omitted): sum(income rows) === reconciliation.credits
 *     and sum(expense rows) === reconciliation.debits
 *   - single account: the same identity scoped to that account
 *
 * NOTE: with internal-transfer categories in play these subtotals intentionally
 * DIVERGE from the Panel screen's `getRangeKPIs`, which still reports raw cash
 * movement.
 *
 * @param from     inclusive start date (YYYY-MM-DD)
 * @param to       inclusive end date (YYYY-MM-DD)
 * @param grouping 'category' or 'category-subcategory'
 * @param accountId optional — scope to a single account; omitted = all accounts
 */
export function getCategoryBreakdownInRange(
  from: string,
  to: string,
  grouping: CategoryBreakdownGrouping,
  accountId?: string,
): CategoryBreakdown {
  const model = getReadModel();
  const transferIds = internalTransferCategoryIds(model);

  const incomeByCategory = new Map<string | null, BreakdownBucket>();
  const expenseByCategory = new Map<string | null, BreakdownBucket>();

  for (const tx of model.transactions) {
    // Lexicographic comparison is safe for YYYY-MM-DD strings.
    if (tx.date < from || tx.date > to) continue;
    // Single-account scope mirrors getAccountBalancesInRange's per-account filter.
    if (accountId !== undefined && tx.accountId !== accountId) continue;

    const target = tx.type === 'income' ? incomeByCategory : expenseByCategory;
    for (const ea of effectiveAmounts(tx, model)) {
      // Internal transfers are not income/expense — see the doc comment.
      if (isInternalTransfer(ea.categoryId, transferIds)) continue;
      let bucket = target.get(ea.categoryId);
      if (!bucket) {
        bucket = { total: 0, bySub: new Map() };
        target.set(ea.categoryId, bucket);
      }
      bucket.total += ea.amount;
      const sub = bucket.bySub.get(ea.subcategoryId) ?? { total: 0 };
      sub.total += ea.amount;
      bucket.bySub.set(ea.subcategoryId, sub);
    }
  }

  return {
    income: buildRows(incomeByCategory, grouping, model),
    expense: buildRows(expenseByCategory, grouping, model),
  };
}

// ---------------------------------------------------------------------------
// SPEC-030 FR8/FR20 — Opening-balance reconciliation.
//
// opening            = Σ ConfigAccount.openingBalance (in scope)
//                    + net(income − expense) of ALL transactions dated BEFORE
//                      `from` (internal transfers included — cash is cash)
// credits            = income in range, EXCLUDING internal-transfer categories
// debits             = expense in range, EXCLUDING internal-transfer categories
// internalTransfersIn/Out = the excluded legs, reported separately
// closing            = opening + credits − debits + (in − out)
//
// The `internalTransfers*` terms net to ZERO in consolidated scope (both legs
// are in scope and cancel) and are non-zero when scoped to a single account,
// where a transfer IS real cash movement. Keeping them as an explicit line is
// what lets the credits/debits tables report true income/expense without
// breaking the FR20 tie-out — and keeps the transfer disclosed rather than
// silently dropped.
//
// Scope: a single account when accountId is provided, otherwise all accounts
// summed (consolidated). The arithmetic ties out exactly on cents.
// ---------------------------------------------------------------------------

export interface RangeReconciliation {
  readonly opening: number;
  readonly credits: number;
  readonly debits: number;
  /** Internal-transfer money IN, in range and in scope (positive magnitude). */
  readonly internalTransfersIn: number;
  /** Internal-transfer money OUT, in range and in scope (positive magnitude). */
  readonly internalTransfersOut: number;
  /** `internalTransfersIn − internalTransfersOut`. Zero in consolidated scope. */
  readonly internalTransfersNet: number;
  readonly closing: number;
}

/**
 * getReconciliationForRange — SPEC-030 FR8/FR20.
 *
 * @param from      inclusive start date (YYYY-MM-DD); the opening balance is the
 *                  running balance immediately before this date
 * @param to        inclusive end date (YYYY-MM-DD)
 * @param accountId optional — single-account scope; omitted = consolidated
 */
export function getReconciliationForRange(
  from: string,
  to: string,
  accountId?: string,
): RangeReconciliation {
  const model = getReadModel();
  const transferIds = internalTransferCategoryIds(model);

  const inScope = (account: ConfigAccount): boolean =>
    accountId === undefined || account.id === accountId;

  let opening = 0;
  for (const account of model.configAccounts) {
    if (inScope(account)) opening += account.openingBalance;
  }

  let priorNet = 0; // net of transactions strictly before `from`
  let credits = 0;
  let debits = 0;
  let transfersIn = 0;
  let transfersOut = 0;
  for (const tx of model.transactions) {
    if (accountId !== undefined && tx.accountId !== accountId) continue;
    const before = tx.date < from;
    const inRange = tx.date >= from && tx.date <= to;
    if (!before && !inRange) continue;
    for (const ea of effectiveAmounts(tx, model)) {
      if (before) {
        // The opening balance is raw cash — transfers count here.
        priorNet += tx.type === 'income' ? ea.amount : -ea.amount;
      } else if (isInternalTransfer(ea.categoryId, transferIds)) {
        if (tx.type === 'income') transfersIn += ea.amount;
        else transfersOut += ea.amount;
      } else {
        if (tx.type === 'income') credits += ea.amount;
        else debits += ea.amount;
      }
    }
  }

  const openingRounded = round2(opening + priorNet);
  const creditsRounded = round2(credits);
  const debitsRounded = round2(debits);
  const transfersInRounded = round2(transfersIn);
  const transfersOutRounded = round2(transfersOut);
  const transfersNet = round2(transfersInRounded - transfersOutRounded);

  return {
    opening: openingRounded,
    credits: creditsRounded,
    debits: debitsRounded,
    internalTransfersIn: transfersInRounded,
    internalTransfersOut: transfersOutRounded,
    internalTransfersNet: transfersNet,
    closing: round2(openingRounded + creditsRounded - debitsRounded + transfersNet),
  };
}
