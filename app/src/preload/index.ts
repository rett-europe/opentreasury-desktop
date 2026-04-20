// Preload — the ONLY bridge between main and renderer (ADR-001 C6, C13 / ADR-002 §4.1).
// Exposes a narrow, typed API via contextBridge. No main imports. No crypto imports. No fs.
//
// Scaffold: exposes a stub `window.opentreasury` surface so the renderer can compile
// against it. Real handlers land with feature work.
import { contextBridge, ipcRenderer, webUtils } from 'electron';
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
  IPC_TRANSACTION_UPDATE,
  IPC_TRANSACTION_DELETE,
  type CreateTransactionRequest,
  type CreateTransactionResponse,
  type UpdateTransactionRequest,
  type UpdateTransactionResponse,
  type DeleteTransactionRequest,
  type DeleteTransactionResponse,
} from '../shared/ipc-contracts/transaction.js';
import {
  IPC_MOVEMENTS_LIST,
  type MovementRecord,
  type MovementsListRequest,
} from '../shared/ipc-contracts/movements.js';
import {
  IPC_ACCOUNTS_CREATE,
  IPC_ACCOUNTS_LIST,
  type CreateAccountRequest,
  type CreateAccountResponse,
  type AccountsListResponse,
} from '../shared/ipc-contracts/accounts.js';
import {
  IPC_CATEGORIES_CREATE,
  IPC_CATEGORIES_LIST,
  type CreateCategoryRequest,
  type CreateCategoryResponse,
  type CategoriesListResponse,
} from '../shared/ipc-contracts/categories.js';
import {
  IPC_TAGS_CREATE,
  IPC_TAGS_LIST,
  type CreateTagRequest,
  type CreateTagResponse,
  type TagsListResponse,
} from '../shared/ipc-contracts/tags.js';
import {
  IPC_IMPORT_STAGE_FILE,
  IPC_IMPORT_DRY_RUN,
  IPC_IMPORT_COMMIT,
  IPC_IMPORT_LAST_MAPPING,
  type StageFileRequest,
  type StageFileResponse,
  type DryRunRequest,
  type DryRunResponse,
  type CommitImportRequest,
  type CommitImportResponse,
  type LastMappingRequest,
  type LastMappingResponse,
} from '../shared/ipc-contracts/import.js';
import {
  IPC_TRANSACTION_NOTE_ADD,
  IPC_TRANSACTION_NOTE_LIST,
  IPC_TRANSACTION_NOTE_EDIT,
  IPC_TRANSACTION_NOTE_DELETE,
  type AddNoteRequest,
  type AddNoteResponse,
  type ListNotesRequest,
  type ListNotesResponse,
  type EditNoteRequest,
  type EditNoteResponse,
  type DeleteNoteRequest,
  type DeleteNoteResponse,
} from '../shared/ipc-contracts/notes.js';

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
    update: (req: UpdateTransactionRequest): Promise<UpdateTransactionResponse> => {
      return ipcRenderer.invoke(IPC_TRANSACTION_UPDATE, req);
    },
    delete: (req: DeleteTransactionRequest): Promise<DeleteTransactionResponse> => {
      return ipcRenderer.invoke(IPC_TRANSACTION_DELETE, req);
    },
    note: {
      add: (req: AddNoteRequest): Promise<AddNoteResponse> => {
        return ipcRenderer.invoke(IPC_TRANSACTION_NOTE_ADD, req);
      },
      list: (req: ListNotesRequest): Promise<ListNotesResponse> => {
        return ipcRenderer.invoke(IPC_TRANSACTION_NOTE_LIST, req);
      },
      edit: (req: EditNoteRequest): Promise<EditNoteResponse> => {
        return ipcRenderer.invoke(IPC_TRANSACTION_NOTE_EDIT, req);
      },
      delete: (req: DeleteNoteRequest): Promise<DeleteNoteResponse> => {
        return ipcRenderer.invoke(IPC_TRANSACTION_NOTE_DELETE, req);
      },
    },
  },
  movements: {
    list: (req?: MovementsListRequest): Promise<MovementRecord[]> => {
      return ipcRenderer.invoke(IPC_MOVEMENTS_LIST, req ?? {});
    },
  },
  accounts: {
    create: (req: CreateAccountRequest): Promise<CreateAccountResponse> => {
      return ipcRenderer.invoke(IPC_ACCOUNTS_CREATE, req);
    },
    list: (): Promise<AccountsListResponse> => {
      return ipcRenderer.invoke(IPC_ACCOUNTS_LIST);
    },
  },
  categories: {
    create: (req: CreateCategoryRequest): Promise<CreateCategoryResponse> => {
      return ipcRenderer.invoke(IPC_CATEGORIES_CREATE, req);
    },
    list: (): Promise<CategoriesListResponse> => {
      return ipcRenderer.invoke(IPC_CATEGORIES_LIST);
    },
  },
  tags: {
    create: (req: CreateTagRequest): Promise<CreateTagResponse> => {
      return ipcRenderer.invoke(IPC_TAGS_CREATE, req);
    },
    list: (): Promise<TagsListResponse> => {
      return ipcRenderer.invoke(IPC_TAGS_LIST);
    },
  },
  import: {
    // Electron 32+ removed File.path. Renderers must obtain the absolute
    // filesystem path via webUtils.getPathForFile(file) from the preload.
    // Safe to expose: only resolves for File objects the user already granted
    // access to via <input type="file"> or drag-drop.
    getPathForFile: (file: File): string => {
      return webUtils.getPathForFile(file);
    },
    stageFile: (req: StageFileRequest): Promise<StageFileResponse> => {
      return ipcRenderer.invoke(IPC_IMPORT_STAGE_FILE, req);
    },
    dryRun: (req: DryRunRequest): Promise<DryRunResponse> => {
      return ipcRenderer.invoke(IPC_IMPORT_DRY_RUN, req);
    },
    commit: (req: CommitImportRequest): Promise<CommitImportResponse> => {
      return ipcRenderer.invoke(IPC_IMPORT_COMMIT, req);
    },
    getLastMapping: (req: LastMappingRequest): Promise<LastMappingResponse> => {
      return ipcRenderer.invoke(IPC_IMPORT_LAST_MAPPING, req);
    },
  },
} as const;

export type OpenTreasuryApi = typeof api;

contextBridge.exposeInMainWorld('opentreasury', api);

// Smoke test: confirm preload runs and exposes the API (ADR-002 §11).
console.log('[preload] opentreasury API exposed — window.opentreasury.panel is ready');
