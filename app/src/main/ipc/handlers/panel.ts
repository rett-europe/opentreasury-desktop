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
  GetAccountBalancesInRangeRequest,
  GetAccountBalancesInRangeResponse,
  GetAccountTransactionCountsInRangeRequest,
  GetAccountTransactionCountsInRangeResponse,
  GetMonthKPIsRequest,
  GetMonthKPIsResponse,
  GetRangeKPIsRequest,
  GetRangeKPIsResponse,
  GetAccountSparklinesRequest,
  GetAccountSparklinesResponse,
  QueryRecentTransactionsRequest,
  QueryRecentTransactionsResponse,
  GetMonthlyIncomeExpenseRequest,
  GetMonthlyIncomeExpenseResponse,
} from '../../../shared/ipc-contracts/panel.js';
import {
  getAccounts as coreGetAccounts,
  getAccountBalances as coreGetAccountBalances,
  getAccountBalancesInRange as coreGetAccountBalancesInRange,
  getAccountTransactionCountsInRange as coreGetAccountTransactionCountsInRange,
  getMonthKPIs as coreGetMonthKPIs,
  getRangeKPIs as coreGetRangeKPIs,
  getAccountSparklines as coreGetAccountSparklines,
  queryRecentTransactions as coreQueryRecentTransactions,
  getMonthlyIncomeExpense as coreGetMonthlyIncomeExpense,
} from '../../../core/query/index.js';

export async function handleGetAccounts(
  _request: GetAccountsRequest,
): Promise<GetAccountsResponse> {
  // WI-23 — read from unified `configAccounts` projection. Project into the
  // legacy Panel wire shape (`bankName`, `bankNameShort`, `accountLabel`,
  // `sortOrder`, `isActive`) to avoid forcing a renderer-side contract
  // change. `bankNameShort` is not carried on `ConfigAccount` (only the
  // legacy enveloped event had it) — we project it as null, which the
  // Panel renderer already tolerates.
  return {
    accounts: coreGetAccounts().map((a) => ({
      id: a.id,
      bankName: a.bankName ?? '',
      bankNameShort: null,
      accountLabel: a.label ?? a.name,
      color: a.color ?? null,
      sortOrder: a.sortOrder,
      isActive: a.archivedAt === undefined,
      createdAt: a.createdAt,
    })),
  };
}

export async function handleGetAccountBalances(
  _request: GetAccountBalancesRequest,
): Promise<GetAccountBalancesResponse> {
  return { balances: coreGetAccountBalances() };
}

export async function handleGetAccountBalancesInRange(
  request: GetAccountBalancesInRangeRequest,
): Promise<GetAccountBalancesInRangeResponse> {
  return { balances: coreGetAccountBalancesInRange(request.from, request.to) };
}

export async function handleGetAccountTransactionCountsInRange(
  request: GetAccountTransactionCountsInRangeRequest,
): Promise<GetAccountTransactionCountsInRangeResponse> {
  return { counts: coreGetAccountTransactionCountsInRange(request.from, request.to) };
}

export async function handleGetMonthKPIs(
  request: GetMonthKPIsRequest,
): Promise<GetMonthKPIsResponse> {
  return { kpis: coreGetMonthKPIs(request.yearMonth) };
}

export async function handleGetRangeKPIs(
  request: GetRangeKPIsRequest,
): Promise<GetRangeKPIsResponse> {
  return { kpis: coreGetRangeKPIs(request.from, request.to) };
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

export async function handleGetMonthlyIncomeExpense(
  _request: GetMonthlyIncomeExpenseRequest,
): Promise<GetMonthlyIncomeExpenseResponse> {
  return { months: coreGetMonthlyIncomeExpense() };
}
