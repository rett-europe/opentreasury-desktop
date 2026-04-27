// Panel API client — thin wrapper over window.opentreasury IPC bridge.
// Calls the 5 Panel queries and parses responses with Zod.

import {
  getAccountsResponseSchema,
  type GetAccountsResponse,
  getAccountBalancesResponseSchema,
  type GetAccountBalancesResponse,
  getMonthKPIsResponseSchema,
  type GetMonthKPIsResponse,
  getAccountSparklinesResponseSchema,
  type GetAccountSparklinesResponse,
  queryRecentTransactionsResponseSchema,
  type QueryRecentTransactionsResponse,
  getMonthlyIncomeExpenseResponseSchema,
  type GetMonthlyIncomeExpenseResponse,
} from '../../shared/ipc-contracts/panel';

/**
 * Get all accounts for Panel account cards.
 */
export async function getAccounts(): Promise<GetAccountsResponse> {
  const raw = await window.opentreasury.panel.getAccounts();
  return getAccountsResponseSchema.parse(raw);
}

/**
 * Get aggregate balance (income/expense/net) for each account.
 */
export async function getAccountBalances(): Promise<GetAccountBalancesResponse> {
  const raw = await window.opentreasury.panel.getAccountBalances();
  return getAccountBalancesResponseSchema.parse(raw);
}

/**
 * Get current month KPIs (Income/Expense/Net).
 * @param yearMonth - YYYY-MM format, e.g., "2026-04"
 */
export async function getMonthKPIs(yearMonth: string): Promise<GetMonthKPIsResponse> {
  const raw = await window.opentreasury.panel.getMonthKPIs({ yearMonth });
  return getMonthKPIsResponseSchema.parse(raw);
}

/**
 * Get 12-month sparkline data for a specific account.
 * @param accountId - Account ID
 */
export async function getAccountSparklines(
  accountId: string,
): Promise<GetAccountSparklinesResponse> {
  const raw = await window.opentreasury.panel.getAccountSparklines({ accountId });
  return getAccountSparklinesResponseSchema.parse(raw);
}

/**
 * Get the latest N confirmed transactions.
 * @param limit - Number of transactions to fetch (default: 10)
 */
export async function queryRecentTransactions(
  limit: number = 10,
): Promise<QueryRecentTransactionsResponse> {
  const raw = await window.opentreasury.panel.queryRecentTransactions({ limit });
  return queryRecentTransactionsResponseSchema.parse(raw);
}

/**
 * Get last 12 months income/expense breakdown (all accounts).
 */
export async function getMonthlyIncomeExpense(): Promise<GetMonthlyIncomeExpenseResponse> {
  const raw = await window.opentreasury.panel.getMonthlyIncomeExpense();
  return getMonthlyIncomeExpenseResponseSchema.parse(raw);
}
