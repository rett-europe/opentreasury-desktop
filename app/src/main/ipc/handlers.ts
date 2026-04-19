// IPC handler registry (ADR-001 C6, C13 / ADR-002 §4.1).
// Every handler validates its request with the Zod schema in schemas.ts BEFORE any logic runs.
// Validation failure = throw; never silently coerce.
//
// Scaffold only — only a ping handler wired.
import type { IpcMain } from 'electron';
import { IpcSchemas } from './schemas.js';
import {
  IPC_PANEL_GET_ACCOUNTS,
  IPC_PANEL_GET_ACCOUNT_BALANCES,
  IPC_PANEL_GET_MONTH_KPIS,
  IPC_PANEL_GET_ACCOUNT_SPARKLINES,
  IPC_PANEL_QUERY_RECENT_TRANSACTIONS,
  getAccountsRequestSchema,
  getAccountsResponseSchema,
  getAccountBalancesRequestSchema,
  getAccountBalancesResponseSchema,
  getMonthKPIsRequestSchema,
  getMonthKPIsResponseSchema,
  getAccountSparklinesRequestSchema,
  getAccountSparklinesResponseSchema,
  queryRecentTransactionsRequestSchema,
  queryRecentTransactionsResponseSchema,
} from '../../shared/ipc-contracts/panel.js';
import {
  handleGetAccounts,
  handleGetAccountBalances,
  handleGetMonthKPIs,
  handleGetAccountSparklines,
  handleQueryRecentTransactions,
} from './handlers/panel.js';

export function registerIpcHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('app:ping', (_event, raw: unknown) => {
    const parsed = IpcSchemas['app:ping'].request.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Invalid app:ping payload: ${parsed.error.message}`);
    }
    const response = { ok: true as const, ts: Date.now() };
    // TODO(C13): validate the response too — belt-and-suspenders on the main side.
    return IpcSchemas['app:ping'].response.parse(response);
  });

  // Panel handlers — WI-2 mock implementations
  ipcMain.handle(IPC_PANEL_GET_ACCOUNTS, async (_event, raw: unknown) => {
    const request = getAccountsRequestSchema.parse(raw ?? {});
    const response = await handleGetAccounts(request);
    return getAccountsResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_PANEL_GET_ACCOUNT_BALANCES, async (_event, raw: unknown) => {
    const request = getAccountBalancesRequestSchema.parse(raw ?? {});
    const response = await handleGetAccountBalances(request);
    return getAccountBalancesResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_PANEL_GET_MONTH_KPIS, async (_event, raw: unknown) => {
    const request = getMonthKPIsRequestSchema.parse(raw);
    const response = await handleGetMonthKPIs(request);
    return getMonthKPIsResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_PANEL_GET_ACCOUNT_SPARKLINES, async (_event, raw: unknown) => {
    const request = getAccountSparklinesRequestSchema.parse(raw);
    const response = await handleGetAccountSparklines(request);
    return getAccountSparklinesResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_PANEL_QUERY_RECENT_TRANSACTIONS, async (_event, raw: unknown) => {
    const request = queryRecentTransactionsRequestSchema.parse(raw);
    const response = await handleQueryRecentTransactions(request);
    return queryRecentTransactionsResponseSchema.parse(response);
  });

  // TODO: wire real handlers from src/core/commands/ as features ship.
}
