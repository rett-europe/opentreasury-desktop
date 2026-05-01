import type { Transaction, ConfigAccount, ReadModel } from './types';
import { getReadModel } from './reducers';

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
