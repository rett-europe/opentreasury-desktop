// Panel API client — thin wrapper over window.opentreasury IPC bridge.
// Calls the 5 Panel queries and parses responses with Zod.
//
// NOTE: When Morpheus ships the real preload bridge methods, update the
// window.opentreasury interface to match.

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
} from '../../shared/ipc-contracts/panel';

/**
 * Get all accounts for Panel account cards.
 */
export async function getAccounts(): Promise<GetAccountsResponse> {
  // TODO: replace with real IPC call when Morpheus ships preload bridge
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await (window as any).opentreasury?.panel?.getAccounts?.();
  return getAccountsResponseSchema.parse(raw);
}

/**
 * Get aggregate balance (income/expense/net) for each account.
 */
export async function getAccountBalances(): Promise<GetAccountBalancesResponse> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await (window as any).opentreasury?.panel?.getAccountBalances?.();
  return getAccountBalancesResponseSchema.parse(raw);
}

/**
 * Get current month KPIs (Income/Expense/Net).
 * @param yearMonth - YYYY-MM format, e.g., "2026-04"
 */
export async function getMonthKPIs(yearMonth: string): Promise<GetMonthKPIsResponse> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await (window as any).opentreasury?.panel?.getMonthKPIs?.({ yearMonth });
  return getMonthKPIsResponseSchema.parse(raw);
}

/**
 * Get 12-month sparkline data for a specific account.
 * @param accountId - Account ID
 */
export async function getAccountSparklines(
  accountId: string
): Promise<GetAccountSparklinesResponse> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await (window as any).opentreasury?.panel?.getAccountSparklines?.({ accountId });
  return getAccountSparklinesResponseSchema.parse(raw);
}

/**
 * Get the latest N confirmed transactions.
 * @param limit - Number of transactions to fetch (default: 10)
 */
export async function queryRecentTransactions(
  limit: number = 10
): Promise<QueryRecentTransactionsResponse> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await (window as any).opentreasury?.panel?.queryRecentTransactions?.({ limit });
  return queryRecentTransactionsResponseSchema.parse(raw);
}
