import type { Transaction, Account } from './types';
import { getReadModel } from './reducers';

// Query 1: Get recent transactions (sorted DESC by createdAt)
export function queryRecentTransactions(limit = 10): Transaction[] {
  const model = getReadModel();
  return [...model.transactions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
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

export function getAccountBalances(): AccountBalance[] {
  const model = getReadModel();
  const accountMap = new Map<string, Account>();
  
  for (const account of model.accounts) {
    accountMap.set(account.id, account);
  }

  const balanceMap = new Map<string, { income: number; expense: number }>();

  for (const tx of model.transactions) {
    if (!balanceMap.has(tx.accountId)) {
      balanceMap.set(tx.accountId, { income: 0, expense: 0 });
    }
    const balance = balanceMap.get(tx.accountId)!;
    if (tx.type === 'income') {
      balance.income += tx.amount;
    } else {
      balance.expense += tx.amount;
    }
  }

  const result: AccountBalance[] = [];
  for (const [accountId, { income, expense }] of balanceMap) {
    const account = accountMap.get(accountId);
    if (account) {
      result.push({
        accountId,
        accountLabel: account.accountLabel,
        income: Math.round(income * 100) / 100,
        expense: Math.round(expense * 100) / 100,
        net: Math.round((income - expense) * 100) / 100,
      });
    }
  }

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
      if (tx.type === 'income') {
        income += tx.amount;
      } else {
        expense += tx.amount;
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
        if (tx.type === 'income') {
          bucket.income += tx.amount;
        } else {
          bucket.expense += tx.amount;
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
export function getAccounts(): Account[] {
  const model = getReadModel();
  return [...model.accounts].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.accountLabel.localeCompare(b.accountLabel);
  });
}
