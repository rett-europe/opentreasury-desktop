// Panel IPC handlers — WI-4′: read from the hydrated event-sourced read
// model (populated by main/bootstrap.ts at app start) instead of the
// hard-coded mocks used during WI-2.
//
// All functions are thin projections over core/query; IPC shape validation
// lives in handlers.ts (request + response parse with Zod on every call).

import type {
  GetAccountsRequest,
  GetAccountsResponse,
  GetAccountBalancesRequest,
  GetAccountBalancesResponse,
  GetMonthKPIsRequest,
  GetMonthKPIsResponse,
  GetAccountSparklinesRequest,
  GetAccountSparklinesResponse,
  QueryRecentTransactionsRequest,
  QueryRecentTransactionsResponse,
} from '../../../shared/ipc-contracts/panel.js';
import {
  getAccounts as coreGetAccounts,
  getAccountBalances as coreGetAccountBalances,
  getMonthKPIs as coreGetMonthKPIs,
  getAccountSparklines as coreGetAccountSparklines,
  queryRecentTransactions as coreQueryRecentTransactions,
} from '../../../core/query/index.js';

export async function handleGetAccounts(
  _request: GetAccountsRequest,
): Promise<GetAccountsResponse> {
  return {
    accounts: coreGetAccounts().map((a) => ({
      id: a.id,
      bankName: a.bankName,
      bankNameShort: a.bankNameShort,
      accountLabel: a.accountLabel,
      color: a.color,
      sortOrder: a.sortOrder,
      isActive: a.isActive,
      createdAt: a.createdAt,
    })),
  };
}

export async function handleGetAccountBalances(
  _request: GetAccountBalancesRequest,
): Promise<GetAccountBalancesResponse> {
  return { balances: coreGetAccountBalances() };
}

export async function handleGetMonthKPIs(
  request: GetMonthKPIsRequest,
): Promise<GetMonthKPIsResponse> {
  return { kpis: coreGetMonthKPIs(request.yearMonth) };
}

export async function handleGetAccountSparklines(
  request: GetAccountSparklinesRequest,
): Promise<GetAccountSparklinesResponse> {
  const sparkline = coreGetAccountSparklines(request.accountId);
  return {
    sparkline: {
      accountId: sparkline.accountId,
      months: sparkline.months.map((m) => ({ yearMonth: m.yearMonth, net: m.net })),
    },
  };
}

export async function handleQueryRecentTransactions(
  request: QueryRecentTransactionsRequest,
): Promise<QueryRecentTransactionsResponse> {
  const limit = request.limit ?? 10;
  return {
    transactions: coreQueryRecentTransactions(limit).map((t) => ({
      id: t.id,
      date: t.date,
      type: t.type,
      amount: t.amount,
      currency: t.currency,
      description: t.description,
      accountId: t.accountId,
      categoryId: t.categoryId,
      subcategoryId: t.subcategoryId,
      tagIds: [...t.tagIds],
      status: t.status,
      createdAt: t.createdAt,
    })),
  };
}
