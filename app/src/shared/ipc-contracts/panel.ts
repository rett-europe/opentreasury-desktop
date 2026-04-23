import { z } from 'zod';

// Panel IPC contract — 5 read-model queries for Panel (Dashboard) screen.
// WI-2 (IPC contract) — these schemas define the Panel↔Main bridge.
// Morpheus (Backend) implementation aligned with Trinity's UI needs.

// IPC channel name constants
export const IPC_PANEL_GET_ACCOUNTS = 'panel:get-accounts';
export const IPC_PANEL_GET_ACCOUNT_BALANCES = 'panel:get-account-balances';
export const IPC_PANEL_GET_MONTH_KPIS = 'panel:get-month-kpis';
export const IPC_PANEL_GET_ACCOUNT_SPARKLINES = 'panel:get-account-sparklines';
export const IPC_PANEL_QUERY_RECENT_TRANSACTIONS = 'panel:query-recent-transactions';

// ============================================================================
// 1. getAccounts — Account metadata for account cards
// ============================================================================

export const getAccountsRequestSchema = z.object({});

export type GetAccountsRequest = z.infer<typeof getAccountsRequestSchema>;

export const accountSchema = z.object({
  id: z.string(),
  bankName: z.string(),
  bankNameShort: z.string().nullable(),
  accountLabel: z.string(),
  color: z.string().nullable(),
  sortOrder: z.number().int().nonnegative(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export type Account = z.infer<typeof accountSchema>;

export const getAccountsResponseSchema = z.object({
  accounts: z.array(accountSchema),
});

export type GetAccountsResponse = z.infer<typeof getAccountsResponseSchema>;

// Legacy alias for Trinity compatibility
export const GetAccountsResponseSchema = getAccountsResponseSchema;

// ============================================================================
// 2. getAccountBalances — Aggregate income/expense/net per account
// ============================================================================

export const getAccountBalancesRequestSchema = z.object({});

export type GetAccountBalancesRequest = z.infer<typeof getAccountBalancesRequestSchema>;

export const accountBalanceSchema = z.object({
  accountId: z.string(),
  accountLabel: z.string(),
  income: z.number().nonnegative(),
  expense: z.number().nonnegative(),
  net: z.number(),
});

export type AccountBalance = z.infer<typeof accountBalanceSchema>;

export const getAccountBalancesResponseSchema = z.object({
  balances: z.array(accountBalanceSchema),
});

export type GetAccountBalancesResponse = z.infer<typeof getAccountBalancesResponseSchema>;

// Legacy alias for Trinity compatibility
export const GetAccountBalancesResponseSchema = getAccountBalancesResponseSchema;

// ============================================================================
// 3. getMonthKPIs — Current month's Income/Expense/Net
// ============================================================================

export const getMonthKPIsRequestSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
});

export type GetMonthKPIsRequest = z.infer<typeof getMonthKPIsRequestSchema>;

export const monthKPIsSchema = z.object({
  yearMonth: z.string(),
  income: z.number().nonnegative(),
  expense: z.number().nonnegative(),
  net: z.number(),
  transactionCount: z.number().int().nonnegative(),
});

export type MonthKPIs = z.infer<typeof monthKPIsSchema>;

export const getMonthKPIsResponseSchema = z.object({
  kpis: monthKPIsSchema,
});

export type GetMonthKPIsResponse = z.infer<typeof getMonthKPIsResponseSchema>;

// Legacy alias for Trinity compatibility
export const GetMonthKPIsResponseSchema = getMonthKPIsResponseSchema;

// ============================================================================
// 4. getAccountSparklines — 12-month sparkline data per account
// ============================================================================

export const getAccountSparklinesRequestSchema = z.object({
  accountId: z.string(),
});

export type GetAccountSparklinesRequest = z.infer<typeof getAccountSparklinesRequestSchema>;

export const monthBucketSchema = z.object({
  yearMonth: z.string(), // YYYY-MM
  net: z.number(),
});

export type MonthBucket = z.infer<typeof monthBucketSchema>;

export const accountSparklineSchema = z.object({
  accountId: z.string(),
  months: z.array(monthBucketSchema), // 12 buckets, oldest first
});

export type AccountSparkline = z.infer<typeof accountSparklineSchema>;

export const getAccountSparklinesResponseSchema = z.object({
  sparkline: accountSparklineSchema,
});

export type GetAccountSparklinesResponse = z.infer<typeof getAccountSparklinesResponseSchema>;

// Legacy alias for Trinity compatibility
export const GetAccountSparklinesResponseSchema = getAccountSparklinesResponseSchema;

// ============================================================================
// 5. queryRecentTransactions — Latest N transactions (sorted DESC by createdAt)
// ============================================================================

export const queryRecentTransactionsRequestSchema = z.object({
  limit: z.number().int().positive().default(10),
});

export type QueryRecentTransactionsRequest = z.infer<typeof queryRecentTransactionsRequestSchema>;

export const recentTransactionSchema = z.object({
  id: z.string(),
  date: z.string(), // YYYY-MM-DD
  type: z.enum(['income', 'expense']),
  amount: z.number().nonnegative(),
  currency: z.literal('EUR'),
  description: z.string(),
  accountId: z.string(),
  categoryId: z.string().nullable(),
  subcategoryId: z.string().nullable(),
  tagIds: z.array(z.string()),
  status: z.enum(['pending', 'approved']),
  createdAt: z.string(),
  // WI-19 — optional transaction extras surfaced by the detail modal.
  reference: z.string().max(120).nullable().optional(),
  details: z.string().max(1000).nullable().optional(),
});

export type RecentTransaction = z.infer<typeof recentTransactionSchema>;

export const queryRecentTransactionsResponseSchema = z.object({
  transactions: z.array(recentTransactionSchema),
});

export type QueryRecentTransactionsResponse = z.infer<typeof queryRecentTransactionsResponseSchema>;

// Legacy alias for Trinity compatibility
export const QueryRecentTransactionsResponseSchema = queryRecentTransactionsResponseSchema;
