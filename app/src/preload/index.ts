// Preload — the ONLY bridge between main and renderer (ADR-001 C6, C13 / ADR-002 §4.1).
// Exposes a narrow, typed API via contextBridge. No main imports. No crypto imports. No fs.
//
// Scaffold: exposes a stub `window.opentreasury` surface so the renderer can compile
// against it. Real handlers land with feature work.
import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_PANEL_GET_ACCOUNTS,
  IPC_PANEL_GET_ACCOUNT_BALANCES,
  IPC_PANEL_GET_MONTH_KPIS,
  IPC_PANEL_GET_ACCOUNT_SPARKLINES,
  IPC_PANEL_QUERY_RECENT_TRANSACTIONS,
  type GetAccountsResponse,
  type GetAccountBalancesResponse,
  type GetMonthKPIsRequest,
  type GetMonthKPIsResponse,
  type GetAccountSparklinesRequest,
  type GetAccountSparklinesResponse,
  type QueryRecentTransactionsRequest,
  type QueryRecentTransactionsResponse,
} from '../shared/ipc-contracts/panel.js';
import {
  IPC_TRANSACTION_CREATE,
  type CreateTransactionRequest,
  type CreateTransactionResponse,
} from '../shared/ipc-contracts/transaction.js';
import {
  IPC_MOVEMENTS_LIST,
  type MovementRecord,
  type MovementsListRequest,
} from '../shared/ipc-contracts/movements.js';

// Typed surface the renderer sees on `window.opentreasury`.
// Keep this as narrow as possible — every method is an audited IPC boundary (C13).
const api = {
  ping: async (): Promise<{ ok: true; ts: number }> => {
    return ipcRenderer.invoke('app:ping', {});
  },
  panel: {
    getAccounts: (): Promise<GetAccountsResponse> => {
      return ipcRenderer.invoke(IPC_PANEL_GET_ACCOUNTS);
    },
    getAccountBalances: (): Promise<GetAccountBalancesResponse> => {
      return ipcRenderer.invoke(IPC_PANEL_GET_ACCOUNT_BALANCES);
    },
    getMonthKPIs: (req: GetMonthKPIsRequest): Promise<GetMonthKPIsResponse> => {
      return ipcRenderer.invoke(IPC_PANEL_GET_MONTH_KPIS, req);
    },
    getAccountSparklines: (
      req: GetAccountSparklinesRequest,
    ): Promise<GetAccountSparklinesResponse> => {
      return ipcRenderer.invoke(IPC_PANEL_GET_ACCOUNT_SPARKLINES, req);
    },
    queryRecentTransactions: (
      req: QueryRecentTransactionsRequest,
    ): Promise<QueryRecentTransactionsResponse> => {
      return ipcRenderer.invoke(IPC_PANEL_QUERY_RECENT_TRANSACTIONS, req);
    },
  },
  transaction: {
    create: (req: CreateTransactionRequest): Promise<CreateTransactionResponse> => {
      return ipcRenderer.invoke(IPC_TRANSACTION_CREATE, req);
    },
  },
  movements: {
    list: (req?: MovementsListRequest): Promise<MovementRecord[]> => {
      return ipcRenderer.invoke(IPC_MOVEMENTS_LIST, req ?? {});
    },
  },
} as const;

export type OpenTreasuryApi = typeof api;

contextBridge.exposeInMainWorld('opentreasury', api);

// Smoke test: confirm preload runs and exposes the API (ADR-002 §11).
console.log('[preload] opentreasury API exposed — window.opentreasury.panel is ready');
