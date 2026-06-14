// Preload — the ONLY bridge between main and renderer (ADR-001 C6, C13 / ADR-002 §4.1).
// Exposes a narrow, typed API via contextBridge. No main imports. No crypto imports. No fs.
//
// Scaffold: exposes a stub `window.opentreasury` surface so the renderer can compile
// against it. Real handlers land with feature work.
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import {
  IPC_PANEL_GET_ACCOUNTS,
  IPC_PANEL_GET_ACCOUNT_BALANCES,
  IPC_PANEL_GET_ACCOUNT_BALANCES_IN_RANGE,
  IPC_PANEL_GET_ACCOUNT_TX_COUNTS_IN_RANGE,
  IPC_PANEL_GET_MONTH_KPIS,
  IPC_PANEL_GET_RANGE_KPIS,
  IPC_PANEL_GET_ACCOUNT_SPARKLINES,
  IPC_PANEL_QUERY_RECENT_TRANSACTIONS,
  IPC_PANEL_GET_MONTHLY_INCOME_EXPENSE,
  type GetAccountsResponse,
  type GetAccountBalancesResponse,
  type GetAccountBalancesInRangeRequest,
  type GetAccountBalancesInRangeResponse,
  type GetAccountTransactionCountsInRangeRequest,
  type GetAccountTransactionCountsInRangeResponse,
  type GetMonthKPIsRequest,
  type GetMonthKPIsResponse,
  type GetRangeKPIsRequest,
  type GetRangeKPIsResponse,
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
import { IPC_QUERY_REHYDRATE, type QueryRehydrateResponse } from '../shared/ipc-contracts/query.js';
import {
  IPC_EXPORT_PREPARE,
  IPC_EXPORT_RUN,
  IPC_EXPORT_PROGRESS,
  IPC_EXPORT_REVEAL,
  exportProgressSchema,
  type ExportPrepareRequest,
  type ExportPrepareResponse,
  type ExportRunRequest,
  type ExportRunResponse,
  type ExportRevealResponse,
  type ExportProgress,
} from '../shared/ipc-contracts/export.js';
import {
  IPC_AUDIT_VERIFY_STATUS,
  IPC_AUDIT_LIST_SIGNED,
  IPC_AUDIT_LIST_CHANGE_HISTORY,
  type AuditVerifyStatusResponse,
  type AuditListSignedRequest,
  type AuditListSignedResponse,
  type AuditListChangeHistoryRequest,
  type AuditListChangeHistoryResponse,
} from '../shared/ipc-contracts/audit.js';
import {
  IPC_ACCOUNTS_CREATE,
  IPC_ACCOUNTS_LIST,
  IPC_ACCOUNTS_UPDATE,
  IPC_ACCOUNTS_ARCHIVE,
  IPC_ACCOUNTS_UNARCHIVE,
  IPC_ACCOUNTS_DELETE,
  IPC_ACCOUNTS_USAGE,
  type CreateAccountRequest,
  type CreateAccountResponse,
  type AccountsListRequest,
  type AccountsListResponse,
  type AccountsUsageResponse,
  type UpdateAccountRequest,
  type UpdateAccountResponse,
  type ArchiveAccountRequest,
  type ArchiveAccountResponse,
  type UnarchiveAccountRequest,
  type UnarchiveAccountResponse,
  type DeleteAccountRequest,
  type DeleteAccountResponse,
} from '../shared/ipc-contracts/accounts.js';
import {
  IPC_CATEGORIES_CREATE,
  IPC_CATEGORIES_LIST,
  IPC_CATEGORIES_UPDATE,
  IPC_CATEGORIES_ARCHIVE,
  IPC_CATEGORIES_UNARCHIVE,
  IPC_CATEGORIES_USAGE,
  IPC_CATEGORIES_DELETE,
  IPC_SUBCATEGORIES_CREATE,
  IPC_SUBCATEGORIES_UPDATE,
  IPC_SUBCATEGORIES_ARCHIVE,
  IPC_SUBCATEGORIES_UNARCHIVE,
  IPC_SUBCATEGORIES_DELETE,
  IPC_SUBCATEGORIES_USAGE,
  type CreateCategoryRequest,
  type CreateCategoryResponse,
  type CategoriesListRequest,
  type CategoriesListResponse,
  type CategoriesUsageResponse,
  type SubcategoriesUsageResponse,
  type UpdateCategoryRequest,
  type UpdateCategoryResponse,
  type ArchiveCategoryRequest,
  type ArchiveCategoryResponse,
  type UnarchiveCategoryRequest,
  type UnarchiveCategoryResponse,
  type DeleteCategoryRequest,
  type DeleteCategoryResponse,
  type CreateSubcategoryRequest,
  type CreateSubcategoryResponse,
  type UpdateSubcategoryRequest,
  type UpdateSubcategoryResponse,
  type ArchiveSubcategoryRequest,
  type ArchiveSubcategoryResponse,
  type UnarchiveSubcategoryRequest,
  type UnarchiveSubcategoryResponse,
  type DeleteSubcategoryRequest,
  type DeleteSubcategoryResponse,
} from '../shared/ipc-contracts/categories.js';
import {
  IPC_TAGS_CREATE,
  IPC_TAGS_LIST,
  IPC_TAGS_UPDATE,
  IPC_TAGS_ARCHIVE,
  IPC_TAGS_UNARCHIVE,
  IPC_TAGS_DELETE,
  IPC_TAGS_USAGE,
  type CreateTagRequest,
  type CreateTagResponse,
  type TagsListRequest,
  type TagsListResponse,
  type TagsUsageResponse,
  type UpdateTagRequest,
  type UpdateTagResponse,
  type ArchiveTagRequest,
  type ArchiveTagResponse,
  type UnarchiveTagRequest,
  type UnarchiveTagResponse,
  type DeleteTagRequest,
  type DeleteTagResponse,
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
  IPC_TRANSACTION_NOTE_LIST_ALL,
  IPC_TRANSACTION_NOTE_EDIT,
  IPC_TRANSACTION_NOTE_DELETE,
  type AddNoteRequest,
  type AddNoteResponse,
  type ListNotesRequest,
  type ListNotesResponse,
  type ListAllNotesRequest,
  type ListAllNotesResponse,
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
  IPC_DIALOG_PICK_IMPORT_FILE,
  type DialogPickFolderResponse,
  type DialogPickImportFileResponse,
} from '../shared/ipc-contracts/dialog.js';
import {
  IPC_PROFILE_GET,
  IPC_PROFILE_SAVE,
  type ProfileGetResponse,
  type ProfileSaveResponse,
  type Profile,
} from '../shared/ipc-contracts/profile.js';
import {
  IPC_ORG_PROFILE_GET,
  IPC_ORG_PROFILE_SAVE,
  IPC_ORG_PROFILE_SET_LOGO,
  IPC_ORG_PROFILE_REMOVE_LOGO,
  IPC_ORG_PROFILE_GET_LOGO,
  type OrgProfileGetResponse,
  type OrgProfileSaveResponse,
  type OrgProfileSetLogoResponse,
  type OrgProfileRemoveLogoResponse,
  type OrgProfileGetLogoResponse,
  type OrgProfileEditable,
  type OrgProfileSetLogoRequest,
} from '../shared/ipc-contracts/org-profile.js';
import { IPC_SHELL_OPEN_PATH, type ShellOpenPathResponse } from '../shared/ipc-contracts/shell.js';
import {
  IPC_REPORT_BUILD,
  IPC_REPORT_GENERATE,
  type ReportBuildRequest,
  type ReportBuildResponse,
  type ReportGenerateRequest,
  type ReportGenerateResponse,
} from '../shared/ipc-contracts/report.js';
import {
  IPC_APP_NEEDS_ONBOARDING,
  type AppNeedsOnboardingResponse,
} from '../shared/ipc-contracts/onboarding.js';
import { IPC_APP_BOOT_STATUS, type AppBootStatusResponse } from '../shared/ipc-contracts/boot.js';
import { IPC_APP_GET_VERSION, type AppGetVersionResponse } from '../shared/ipc-contracts/app.js';
import {
  IPC_WORKSPACE_DETECT,
  IPC_WORKSPACE_CREATE,
  IPC_WORKSPACE_CONFIRM_SETUP,
  IPC_WORKSPACE_ENROLL,
  IPC_WORKSPACE_UNLOCK,
  IPC_WORKSPACE_RECOVER,
  IPC_WORKSPACE_LOCK,
  type WorkspaceDetectRequest,
  type WorkspaceDetectResponse,
  type WorkspaceCreateRequest,
  type WorkspaceCreateResponse,
  type WorkspaceConfirmSetupRequest,
  type WorkspaceConfirmSetupResponse,
  type WorkspaceEnrollRequest,
  type WorkspaceEnrollResponse,
  type WorkspaceUnlockResponse,
  type WorkspaceRecoverRequest,
  type WorkspaceRecoverResponse,
  type WorkspaceLockResponse,
} from '../shared/ipc-contracts/workspace.js';

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
    getAccountBalancesInRange: (
      req: GetAccountBalancesInRangeRequest,
    ): Promise<GetAccountBalancesInRangeResponse> => {
      return ipcRenderer.invoke(IPC_PANEL_GET_ACCOUNT_BALANCES_IN_RANGE, req);
    },
    getAccountTransactionCountsInRange: (
      req: GetAccountTransactionCountsInRangeRequest,
    ): Promise<GetAccountTransactionCountsInRangeResponse> => {
      return ipcRenderer.invoke(IPC_PANEL_GET_ACCOUNT_TX_COUNTS_IN_RANGE, req);
    },
    getMonthKPIs: (req: GetMonthKPIsRequest): Promise<GetMonthKPIsResponse> => {
      return ipcRenderer.invoke(IPC_PANEL_GET_MONTH_KPIS, req);
    },
    getRangeKPIs: (req: GetRangeKPIsRequest): Promise<GetRangeKPIsResponse> => {
      return ipcRenderer.invoke(IPC_PANEL_GET_RANGE_KPIS, req);
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
      listAll: (req?: ListAllNotesRequest): Promise<ListAllNotesResponse> => {
        return ipcRenderer.invoke(IPC_TRANSACTION_NOTE_LIST_ALL, req ?? {});
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
  export: {
    prepare: (req: ExportPrepareRequest): Promise<ExportPrepareResponse> => {
      return ipcRenderer.invoke(IPC_EXPORT_PREPARE, req);
    },
    run: (req: ExportRunRequest): Promise<ExportRunResponse> => {
      return ipcRenderer.invoke(IPC_EXPORT_RUN, req);
    },
    reveal: (): Promise<ExportRevealResponse> => {
      return ipcRenderer.invoke(IPC_EXPORT_REVEAL, {});
    },
    /**
     * Subscribe to main→renderer export progress (counts only). Returns an
     * unsubscribe function. The payload is Zod-validated before reaching the
     * callback so a malformed event can never surface to the UI.
     */
    onProgress: (cb: (progress: ExportProgress) => void): (() => void) => {
      const listener = (_event: unknown, raw: unknown): void => {
        const parsed = exportProgressSchema.safeParse(raw);
        if (parsed.success) cb(parsed.data);
      };
      ipcRenderer.on(IPC_EXPORT_PROGRESS, listener);
      return () => {
        ipcRenderer.removeListener(IPC_EXPORT_PROGRESS, listener);
      };
    },
  },
  query: {
    rehydrate: (): Promise<QueryRehydrateResponse> => {
      return ipcRenderer.invoke(IPC_QUERY_REHYDRATE, {});
    },
  },
  audit: {
    verifyStatus: (): Promise<AuditVerifyStatusResponse> => {
      return ipcRenderer.invoke(IPC_AUDIT_VERIFY_STATUS, {});
    },
    listSigned: (req?: AuditListSignedRequest): Promise<AuditListSignedResponse> => {
      return ipcRenderer.invoke(IPC_AUDIT_LIST_SIGNED, req ?? {});
    },
    listChangeHistory: (
      req?: AuditListChangeHistoryRequest,
    ): Promise<AuditListChangeHistoryResponse> => {
      return ipcRenderer.invoke(IPC_AUDIT_LIST_CHANGE_HISTORY, req ?? {});
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
    delete: (req: DeleteAccountRequest): Promise<DeleteAccountResponse> => {
      return ipcRenderer.invoke(IPC_ACCOUNTS_DELETE, req);
    },
    usage: (): Promise<AccountsUsageResponse> => {
      return ipcRenderer.invoke(IPC_ACCOUNTS_USAGE);
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
    delete: (req: DeleteCategoryRequest): Promise<DeleteCategoryResponse> => {
      return ipcRenderer.invoke(IPC_CATEGORIES_DELETE, req);
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
      delete: (req: DeleteSubcategoryRequest): Promise<DeleteSubcategoryResponse> => {
        return ipcRenderer.invoke(IPC_SUBCATEGORIES_DELETE, req);
      },
      usage: (): Promise<SubcategoriesUsageResponse> => {
        return ipcRenderer.invoke(IPC_SUBCATEGORIES_USAGE);
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
    delete: (req: DeleteTagRequest): Promise<DeleteTagResponse> => {
      return ipcRenderer.invoke(IPC_TAGS_DELETE, req);
    },
    usage: (): Promise<TagsUsageResponse> => {
      return ipcRenderer.invoke(IPC_TAGS_USAGE);
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
    pickImportFile: (): Promise<DialogPickImportFileResponse> => {
      return ipcRenderer.invoke(IPC_DIALOG_PICK_IMPORT_FILE);
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
  orgProfile: {
    get: (): Promise<OrgProfileGetResponse> => {
      return ipcRenderer.invoke(IPC_ORG_PROFILE_GET);
    },
    save: (edits: OrgProfileEditable): Promise<OrgProfileSaveResponse> => {
      return ipcRenderer.invoke(IPC_ORG_PROFILE_SAVE, edits);
    },
    setLogo: (req: OrgProfileSetLogoRequest): Promise<OrgProfileSetLogoResponse> => {
      return ipcRenderer.invoke(IPC_ORG_PROFILE_SET_LOGO, req);
    },
    removeLogo: (): Promise<OrgProfileRemoveLogoResponse> => {
      return ipcRenderer.invoke(IPC_ORG_PROFILE_REMOVE_LOGO);
    },
    getLogo: (): Promise<OrgProfileGetLogoResponse> => {
      return ipcRenderer.invoke(IPC_ORG_PROFILE_GET_LOGO);
    },
  },
  report: {
    /**
     * Assemble the aggregate-only report view-model for preview and mint a
     * one-shot confirmation token. No plaintext rows or path cross this bridge.
     */
    build: (req: ReportBuildRequest): Promise<ReportBuildResponse> => {
      return ipcRenderer.invoke(IPC_REPORT_BUILD, req);
    },
    /**
     * Generate the PDF for a previously built report. Carries ONLY the opaque
     * confirmation token; the save destination is chosen by the OS dialog in
     * main and the response is an outcome — never a path string.
     */
    generate: (req: ReportGenerateRequest): Promise<ReportGenerateResponse> => {
      return ipcRenderer.invoke(IPC_REPORT_GENERATE, req);
    },
  },
  shell: {
    openPath: (p: string): Promise<ShellOpenPathResponse> => {
      return ipcRenderer.invoke(IPC_SHELL_OPEN_PATH, { path: p });
    },
  },
  onboarding: {
    getStatus: (): Promise<AppNeedsOnboardingResponse> => {
      return ipcRenderer.invoke(IPC_APP_NEEDS_ONBOARDING);
    },
  },
  boot: {
    getStatus: (): Promise<AppBootStatusResponse> => {
      return ipcRenderer.invoke(IPC_APP_BOOT_STATUS);
    },
  },
  app: {
    getVersion: (): Promise<AppGetVersionResponse> => {
      return ipcRenderer.invoke(IPC_APP_GET_VERSION);
    },
  },
  workspace: {
    detect: (req?: WorkspaceDetectRequest): Promise<WorkspaceDetectResponse> => {
      return ipcRenderer.invoke(IPC_WORKSPACE_DETECT, req ?? {});
    },
    create: (req: WorkspaceCreateRequest): Promise<WorkspaceCreateResponse> => {
      return ipcRenderer.invoke(IPC_WORKSPACE_CREATE, req);
    },
    confirmSetup: (req: WorkspaceConfirmSetupRequest): Promise<WorkspaceConfirmSetupResponse> => {
      return ipcRenderer.invoke(IPC_WORKSPACE_CONFIRM_SETUP, req);
    },
    enroll: (req: WorkspaceEnrollRequest): Promise<WorkspaceEnrollResponse> => {
      return ipcRenderer.invoke(IPC_WORKSPACE_ENROLL, req);
    },
    unlock: (): Promise<WorkspaceUnlockResponse> => {
      return ipcRenderer.invoke(IPC_WORKSPACE_UNLOCK);
    },
    recover: (req: WorkspaceRecoverRequest): Promise<WorkspaceRecoverResponse> => {
      return ipcRenderer.invoke(IPC_WORKSPACE_RECOVER, req);
    },
    lock: (): Promise<WorkspaceLockResponse> => {
      return ipcRenderer.invoke(IPC_WORKSPACE_LOCK);
    },
  },
} as const;

export type OpenTreasuryApi = typeof api;

contextBridge.exposeInMainWorld('opentreasury', api);

// Smoke test: confirm preload runs and exposes the API (ADR-002 §11).
console.log('[preload] opentreasury API exposed — window.opentreasury.panel is ready');
