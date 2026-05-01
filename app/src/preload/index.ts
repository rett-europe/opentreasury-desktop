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
  IPC_PANEL_GET_MONTHLY_INCOME_EXPENSE,
  type GetAccountsResponse,
  type GetAccountBalancesResponse,
  type GetMonthKPIsRequest,
  type GetMonthKPIsResponse,
  type GetAccountSparklinesRequest,
  type GetAccountSparklinesResponse,
  type QueryRecentTransactionsRequest,
  type QueryRecentTransactionsResponse,
  type GetMonthlyIncomeExpenseResponse,
} from '../shared/ipc-contracts/panel.js';
import {
  IPC_SALDO_GET_COMPARISON,
  type SaldoComparisonRequest,
  type SaldoComparisonResponse,
} from '../shared/ipc-contracts/saldo.js';
import {
  IPC_TRANSACTION_CREATE,
  IPC_TRANSACTION_UPDATE,
  IPC_TRANSACTION_DELETE,
  IPC_TRANSACTION_BULK_UPDATE,
  IPC_TRANSACTION_BULK_ADD_LABEL,
  type CreateTransactionRequest,
  type CreateTransactionResponse,
  type UpdateTransactionRequest,
  type UpdateTransactionResponse,
  type DeleteTransactionRequest,
  type DeleteTransactionResponse,
  type BulkUpdateTransactionRequest,
  type BulkUpdateTransactionResponse,
  type BulkAddLabelTransactionRequest,
  type BulkAddLabelTransactionResponse,
} from '../shared/ipc-contracts/transaction.js';
import {
  IPC_MOVEMENTS_LIST,
  type MovementRecord,
  type MovementsListRequest,
} from '../shared/ipc-contracts/movements.js';
import {
  IPC_ACCOUNTS_CREATE,
  IPC_ACCOUNTS_LIST,
  IPC_ACCOUNTS_UPDATE,
  IPC_ACCOUNTS_ARCHIVE,
  IPC_ACCOUNTS_UNARCHIVE,
  type CreateAccountRequest,
  type CreateAccountResponse,
  type AccountsListRequest,
  type AccountsListResponse,
  type UpdateAccountRequest,
  type UpdateAccountResponse,
  type ArchiveAccountRequest,
  type ArchiveAccountResponse,
  type UnarchiveAccountRequest,
  type UnarchiveAccountResponse,
} from '../shared/ipc-contracts/accounts.js';
import {
  IPC_CATEGORIES_CREATE,
  IPC_CATEGORIES_LIST,
  IPC_CATEGORIES_UPDATE,
  IPC_CATEGORIES_ARCHIVE,
  IPC_CATEGORIES_UNARCHIVE,
  IPC_CATEGORIES_USAGE,
  IPC_SUBCATEGORIES_CREATE,
  IPC_SUBCATEGORIES_UPDATE,
  IPC_SUBCATEGORIES_ARCHIVE,
  IPC_SUBCATEGORIES_UNARCHIVE,
  type CreateCategoryRequest,
  type CreateCategoryResponse,
  type CategoriesListRequest,
  type CategoriesListResponse,
  type CategoriesUsageResponse,
  type UpdateCategoryRequest,
  type UpdateCategoryResponse,
  type ArchiveCategoryRequest,
  type ArchiveCategoryResponse,
  type UnarchiveCategoryRequest,
  type UnarchiveCategoryResponse,
  type CreateSubcategoryRequest,
  type CreateSubcategoryResponse,
  type UpdateSubcategoryRequest,
  type UpdateSubcategoryResponse,
  type ArchiveSubcategoryRequest,
  type ArchiveSubcategoryResponse,
  type UnarchiveSubcategoryRequest,
  type UnarchiveSubcategoryResponse,
} from '../shared/ipc-contracts/categories.js';
import {
  IPC_TAGS_CREATE,
  IPC_TAGS_LIST,
  IPC_TAGS_UPDATE,
  IPC_TAGS_ARCHIVE,
  IPC_TAGS_UNARCHIVE,
  type CreateTagRequest,
  type CreateTagResponse,
  type TagsListRequest,
  type TagsListResponse,
  type UpdateTagRequest,
  type UpdateTagResponse,
  type ArchiveTagRequest,
  type ArchiveTagResponse,
  type UnarchiveTagRequest,
  type UnarchiveTagResponse,
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
import {
  IPC_TRANSACTION_SPLIT,
  IPC_TRANSACTION_SPLIT_REMOVE,
  IPC_TRANSACTION_SPLIT_GET,
  type SplitTransactionRequest,
  type SplitTransactionResponse,
  type RemoveSplitRequest,
  type RemoveSplitResponse,
  type GetSplitsRequest,
  type GetSplitsResponse,
} from '../shared/ipc-contracts/transaction-splits.js';
import {
  IPC_INSIGHTS_LANDING_SUMMARY,
  type InsightsLandingSummaryRequest,
  type InsightsLandingSummaryResponse,
  IPC_INSIGHTS_LABEL_SUMMARY,
  type InsightsLabelSummaryRequest,
  type InsightsLabelSummaryResponse,
  IPC_INSIGHTS_LABEL_BY_CATEGORY,
  type InsightsLabelByCategoryRequest,
  type InsightsLabelByCategoryResponse,
  IPC_INSIGHTS_LABEL_BY_SUBCATEGORY,
  type InsightsLabelBySubcategoryRequest,
  type InsightsLabelBySubcategoryResponse,
  IPC_INSIGHTS_LABEL_MONTHLY_EVOLUTION,
  type InsightsLabelMonthlyEvolutionRequest,
  type InsightsLabelMonthlyEvolutionResponse,
  IPC_INSIGHTS_LABEL_BY_ACCOUNT,
  type InsightsLabelByAccountRequest,
  type InsightsLabelByAccountResponse,
} from '../shared/ipc-contracts/insights.js';
import {
  IPC_CONFIG_GET,
  IPC_CONFIG_SET_DATA_DIR,
  type ConfigGetResponse,
  type ConfigSetDataDirRequest,
  type ConfigSetDataDirResponse,
} from '../shared/ipc-contracts/config.js';
import {
  IPC_DIALOG_PICK_FOLDER,
  type DialogPickFolderResponse,
} from '../shared/ipc-contracts/dialog.js';
import {
  IPC_PROFILE_GET,
  IPC_PROFILE_SAVE,
  type ProfileGetResponse,
  type ProfileSaveResponse,
  type Profile,
} from '../shared/ipc-contracts/profile.js';
import { IPC_SHELL_OPEN_PATH, type ShellOpenPathResponse } from '../shared/ipc-contracts/shell.js';

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
    getMonthlyIncomeExpense: (): Promise<GetMonthlyIncomeExpenseResponse> => {
      return ipcRenderer.invoke(IPC_PANEL_GET_MONTHLY_INCOME_EXPENSE, {});
    },
  },
  saldo: {
    getComparison: (req: SaldoComparisonRequest): Promise<SaldoComparisonResponse> => {
      return ipcRenderer.invoke(IPC_SALDO_GET_COMPARISON, req);
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
    bulkUpdate: (req: BulkUpdateTransactionRequest): Promise<BulkUpdateTransactionResponse> => {
      return ipcRenderer.invoke(IPC_TRANSACTION_BULK_UPDATE, req);
    },
    bulkAddLabel: (
      req: BulkAddLabelTransactionRequest,
    ): Promise<BulkAddLabelTransactionResponse> => {
      return ipcRenderer.invoke(IPC_TRANSACTION_BULK_ADD_LABEL, req);
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
    split: {
      create: (req: SplitTransactionRequest): Promise<SplitTransactionResponse> => {
        return ipcRenderer.invoke(IPC_TRANSACTION_SPLIT, req);
      },
      remove: (req: RemoveSplitRequest): Promise<RemoveSplitResponse> => {
        return ipcRenderer.invoke(IPC_TRANSACTION_SPLIT_REMOVE, req);
      },
      get: (req: GetSplitsRequest): Promise<GetSplitsResponse> => {
        return ipcRenderer.invoke(IPC_TRANSACTION_SPLIT_GET, req);
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
    list: (req?: AccountsListRequest): Promise<AccountsListResponse> => {
      return ipcRenderer.invoke(IPC_ACCOUNTS_LIST, req ?? {});
    },
    update: (req: UpdateAccountRequest): Promise<UpdateAccountResponse> => {
      return ipcRenderer.invoke(IPC_ACCOUNTS_UPDATE, req);
    },
    archive: (req: ArchiveAccountRequest): Promise<ArchiveAccountResponse> => {
      return ipcRenderer.invoke(IPC_ACCOUNTS_ARCHIVE, req);
    },
    unarchive: (req: UnarchiveAccountRequest): Promise<UnarchiveAccountResponse> => {
      return ipcRenderer.invoke(IPC_ACCOUNTS_UNARCHIVE, req);
    },
  },
  categories: {
    create: (req: CreateCategoryRequest): Promise<CreateCategoryResponse> => {
      return ipcRenderer.invoke(IPC_CATEGORIES_CREATE, req);
    },
    list: (req?: CategoriesListRequest): Promise<CategoriesListResponse> => {
      return ipcRenderer.invoke(IPC_CATEGORIES_LIST, req ?? {});
    },
    usage: (): Promise<CategoriesUsageResponse> => {
      return ipcRenderer.invoke(IPC_CATEGORIES_USAGE);
    },
    update: (req: UpdateCategoryRequest): Promise<UpdateCategoryResponse> => {
      return ipcRenderer.invoke(IPC_CATEGORIES_UPDATE, req);
    },
    archive: (req: ArchiveCategoryRequest): Promise<ArchiveCategoryResponse> => {
      return ipcRenderer.invoke(IPC_CATEGORIES_ARCHIVE, req);
    },
    unarchive: (req: UnarchiveCategoryRequest): Promise<UnarchiveCategoryResponse> => {
      return ipcRenderer.invoke(IPC_CATEGORIES_UNARCHIVE, req);
    },
    subcategory: {
      create: (req: CreateSubcategoryRequest): Promise<CreateSubcategoryResponse> => {
        return ipcRenderer.invoke(IPC_SUBCATEGORIES_CREATE, req);
      },
      update: (req: UpdateSubcategoryRequest): Promise<UpdateSubcategoryResponse> => {
        return ipcRenderer.invoke(IPC_SUBCATEGORIES_UPDATE, req);
      },
      archive: (req: ArchiveSubcategoryRequest): Promise<ArchiveSubcategoryResponse> => {
        return ipcRenderer.invoke(IPC_SUBCATEGORIES_ARCHIVE, req);
      },
      unarchive: (req: UnarchiveSubcategoryRequest): Promise<UnarchiveSubcategoryResponse> => {
        return ipcRenderer.invoke(IPC_SUBCATEGORIES_UNARCHIVE, req);
      },
    },
  },
  tags: {
    create: (req: CreateTagRequest): Promise<CreateTagResponse> => {
      return ipcRenderer.invoke(IPC_TAGS_CREATE, req);
    },
    list: (req?: TagsListRequest): Promise<TagsListResponse> => {
      return ipcRenderer.invoke(IPC_TAGS_LIST, req ?? {});
    },
    update: (req: UpdateTagRequest): Promise<UpdateTagResponse> => {
      return ipcRenderer.invoke(IPC_TAGS_UPDATE, req);
    },
    archive: (req: ArchiveTagRequest): Promise<ArchiveTagResponse> => {
      return ipcRenderer.invoke(IPC_TAGS_ARCHIVE, req);
    },
    unarchive: (req: UnarchiveTagRequest): Promise<UnarchiveTagResponse> => {
      return ipcRenderer.invoke(IPC_TAGS_UNARCHIVE, req);
    },
  },
  insights: {
    landingSummary: (
      req?: InsightsLandingSummaryRequest,
    ): Promise<InsightsLandingSummaryResponse> => {
      return ipcRenderer.invoke(IPC_INSIGHTS_LANDING_SUMMARY, req ?? {});
    },
    labelSummary: (req: InsightsLabelSummaryRequest): Promise<InsightsLabelSummaryResponse> => {
      return ipcRenderer.invoke(IPC_INSIGHTS_LABEL_SUMMARY, req);
    },
    labelByCategory: (
      req: InsightsLabelByCategoryRequest,
    ): Promise<InsightsLabelByCategoryResponse> => {
      return ipcRenderer.invoke(IPC_INSIGHTS_LABEL_BY_CATEGORY, req);
    },
    labelBySubcategory: (
      req: InsightsLabelBySubcategoryRequest,
    ): Promise<InsightsLabelBySubcategoryResponse> => {
      return ipcRenderer.invoke(IPC_INSIGHTS_LABEL_BY_SUBCATEGORY, req);
    },
    labelMonthlyEvolution: (
      req: InsightsLabelMonthlyEvolutionRequest,
    ): Promise<InsightsLabelMonthlyEvolutionResponse> => {
      return ipcRenderer.invoke(IPC_INSIGHTS_LABEL_MONTHLY_EVOLUTION, req);
    },
    labelByAccount: (
      req: InsightsLabelByAccountRequest,
    ): Promise<InsightsLabelByAccountResponse> => {
      return ipcRenderer.invoke(IPC_INSIGHTS_LABEL_BY_ACCOUNT, req);
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
  config: {
    get: (): Promise<ConfigGetResponse> => {
      return ipcRenderer.invoke(IPC_CONFIG_GET);
    },
    setDataDir: (req: ConfigSetDataDirRequest): Promise<ConfigSetDataDirResponse> => {
      return ipcRenderer.invoke(IPC_CONFIG_SET_DATA_DIR, req);
    },
  },
  dialog: {
    pickFolder: (): Promise<DialogPickFolderResponse> => {
      return ipcRenderer.invoke(IPC_DIALOG_PICK_FOLDER);
    },
  },
  profile: {
    get: (): Promise<ProfileGetResponse> => {
      return ipcRenderer.invoke(IPC_PROFILE_GET);
    },
    save: (profile: Profile): Promise<ProfileSaveResponse> => {
      return ipcRenderer.invoke(IPC_PROFILE_SAVE, profile);
    },
  },
  shell: {
    openPath: (p: string): Promise<ShellOpenPathResponse> => {
      return ipcRenderer.invoke(IPC_SHELL_OPEN_PATH, { path: p });
    },
  },
} as const;

export type OpenTreasuryApi = typeof api;

contextBridge.exposeInMainWorld('opentreasury', api);

// Smoke test: confirm preload runs and exposes the API (ADR-002 §11).
console.log('[preload] opentreasury API exposed — window.opentreasury.panel is ready');
