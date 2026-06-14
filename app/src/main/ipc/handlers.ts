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
  IPC_PANEL_GET_ACCOUNT_BALANCES_IN_RANGE,
  IPC_PANEL_GET_ACCOUNT_TX_COUNTS_IN_RANGE,
  IPC_PANEL_GET_MONTH_KPIS,
  IPC_PANEL_GET_RANGE_KPIS,
  IPC_PANEL_GET_ACCOUNT_SPARKLINES,
  IPC_PANEL_QUERY_RECENT_TRANSACTIONS,
  IPC_PANEL_GET_MONTHLY_INCOME_EXPENSE,
  getAccountsRequestSchema,
  getAccountsResponseSchema,
  getAccountBalancesRequestSchema,
  getAccountBalancesResponseSchema,
  getAccountBalancesInRangeRequestSchema,
  getAccountBalancesInRangeResponseSchema,
  getAccountTransactionCountsInRangeRequestSchema,
  getAccountTransactionCountsInRangeResponseSchema,
  getMonthKPIsRequestSchema,
  getMonthKPIsResponseSchema,
  getRangeKPIsRequestSchema,
  getRangeKPIsResponseSchema,
  getAccountSparklinesRequestSchema,
  getAccountSparklinesResponseSchema,
  queryRecentTransactionsRequestSchema,
  queryRecentTransactionsResponseSchema,
  getMonthlyIncomeExpenseRequestSchema,
  getMonthlyIncomeExpenseResponseSchema,
} from '../../shared/ipc-contracts/panel.js';
import {
  IPC_SALDO_GET_COMPARISON,
  saldoComparisonRequestSchema,
  saldoComparisonResponseSchema,
} from '../../shared/ipc-contracts/saldo.js';
import {
  IPC_TRANSACTION_CREATE,
  IPC_TRANSACTION_UPDATE,
  IPC_TRANSACTION_DELETE,
  IPC_TRANSACTION_BULK_UPDATE,
  IPC_TRANSACTION_BULK_ADD_LABEL,
  createTransactionResponseSchema,
  updateTransactionResponseSchema,
  deleteTransactionResponseSchema,
  bulkUpdateTransactionResponseSchema,
  bulkAddLabelTransactionResponseSchema,
} from '../../shared/ipc-contracts/transaction.js';
import {
  IPC_MOVEMENTS_LIST,
  movementsListResponseSchema,
} from '../../shared/ipc-contracts/movements.js';
import { IPC_QUERY_REHYDRATE } from '../../shared/ipc-contracts/query.js';
import {
  IPC_ACCOUNTS_CREATE,
  IPC_ACCOUNTS_LIST,
  IPC_ACCOUNTS_UPDATE,
  IPC_ACCOUNTS_ARCHIVE,
  IPC_ACCOUNTS_UNARCHIVE,
  IPC_ACCOUNTS_DELETE,
  IPC_ACCOUNTS_USAGE,
  createAccountResponseSchema,
  accountsListResponseSchema,
  accountsUsageResponseSchema,
  updateAccountResponseSchema,
  archiveAccountResponseSchema,
  unarchiveAccountResponseSchema,
  deleteAccountResponseSchema,
} from '../../shared/ipc-contracts/accounts.js';
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
  createCategoryResponseSchema,
  categoriesListResponseSchema,
  categoriesUsageResponseSchema,
  subcategoriesUsageResponseSchema,
  updateCategoryResponseSchema,
  archiveCategoryResponseSchema,
  unarchiveCategoryResponseSchema,
  deleteCategoryResponseSchema,
  createSubcategoryResponseSchema,
  updateSubcategoryResponseSchema,
  archiveSubcategoryResponseSchema,
  unarchiveSubcategoryResponseSchema,
  deleteSubcategoryResponseSchema,
} from '../../shared/ipc-contracts/categories.js';
import {
  IPC_TAGS_CREATE,
  IPC_TAGS_LIST,
  IPC_TAGS_UPDATE,
  IPC_TAGS_ARCHIVE,
  IPC_TAGS_UNARCHIVE,
  IPC_TAGS_DELETE,
  IPC_TAGS_USAGE,
  createTagResponseSchema,
  tagsListResponseSchema,
  tagsUsageResponseSchema,
  updateTagResponseSchema,
  archiveTagResponseSchema,
  unarchiveTagResponseSchema,
  deleteTagResponseSchema,
} from '../../shared/ipc-contracts/tags.js';
import {
  IPC_IMPORT_STAGE_FILE,
  IPC_IMPORT_DRY_RUN,
  IPC_IMPORT_COMMIT,
  IPC_IMPORT_LAST_MAPPING,
  stageFileResponseSchema,
  dryRunResponseSchema,
  commitImportResponseSchema,
  lastMappingResponseSchema,
} from '../../shared/ipc-contracts/import.js';
import {
  IPC_TRANSACTION_NOTE_ADD,
  IPC_TRANSACTION_NOTE_LIST,
  IPC_TRANSACTION_NOTE_LIST_ALL,
  IPC_TRANSACTION_NOTE_EDIT,
  IPC_TRANSACTION_NOTE_DELETE,
  addNoteResponseSchema,
  listNotesResponseSchema,
  listAllNotesResponseSchema,
  editNoteResponseSchema,
  deleteNoteResponseSchema,
} from '../../shared/ipc-contracts/notes.js';
import {
  IPC_TRANSACTION_SPLIT,
  IPC_TRANSACTION_SPLIT_REMOVE,
  IPC_TRANSACTION_SPLIT_GET,
  splitTransactionResponseSchema,
  removeSplitResponseSchema,
  getSplitsResponseSchema,
} from '../../shared/ipc-contracts/transaction-splits.js';
import {
  handleGetAccounts,
  handleGetAccountBalances,
  handleGetAccountBalancesInRange,
  handleGetAccountTransactionCountsInRange,
  handleGetMonthKPIs,
  handleGetRangeKPIs,
  handleGetAccountSparklines,
  handleQueryRecentTransactions,
  handleGetMonthlyIncomeExpense,
} from './handlers/panel.js';
import { handleGetSaldoComparison } from './handlers/saldo.js';
import {
  createTransactionCreateHandler,
  createTransactionUpdateHandler,
  createTransactionDeleteHandler,
  createTransactionBulkUpdateHandler,
  createTransactionBulkAddLabelHandler,
} from './handlers/transaction.js';
import { createMovementsListHandler } from './handlers/movements.js';
import { createQueryRehydrateHandler } from './handlers/query.js';
import {
  createAccountsCreateHandler,
  createAccountsListHandler,
  createAccountsUpdateHandler,
  createAccountsArchiveHandler,
  createAccountsUnarchiveHandler,
  createAccountsDeleteHandler,
  createAccountsUsageHandler,
} from './handlers/accounts.js';
import {
  createCategoriesCreateHandler,
  createCategoriesListHandler,
  createCategoriesUpdateHandler,
  createCategoriesArchiveHandler,
  createCategoriesUnarchiveHandler,
  createCategoriesUsageHandler,
  createCategoriesDeleteHandler,
  createSubcategoriesCreateHandler,
  createSubcategoriesUpdateHandler,
  createSubcategoriesArchiveHandler,
  createSubcategoriesUnarchiveHandler,
  createSubcategoriesDeleteHandler,
  createSubcategoriesUsageHandler,
} from './handlers/categories.js';
import {
  createTagsCreateHandler,
  createTagsListHandler,
  createTagsUpdateHandler,
  createTagsArchiveHandler,
  createTagsUnarchiveHandler,
  createTagsDeleteHandler,
  createTagsUsageHandler,
} from './handlers/tags.js';
import {
  createStageFileHandler,
  createDryRunHandler,
  createCommitHandler,
  createLastMappingHandler,
} from './handlers/import.js';
import {
  createAddNoteHandler,
  createListNotesHandler,
  createListAllNotesHandler,
  createEditNoteHandler,
  createDeleteNoteHandler,
} from './handlers/notes.js';
import {
  createSplitTransactionHandler,
  createRemoveSplitHandler,
  createGetSplitsHandler,
} from './handlers/transaction-splits.js';
import {
  IPC_INSIGHTS_LANDING_SUMMARY,
  insightsLandingSummaryRequestSchema,
  insightsLandingSummaryResponseSchema,
  IPC_INSIGHTS_LABEL_SUMMARY,
  insightsLabelSummaryRequestSchema,
  insightsLabelSummaryResponseSchema,
  IPC_INSIGHTS_LABEL_BY_CATEGORY,
  insightsLabelByCategoryRequestSchema,
  insightsLabelByCategoryResponseSchema,
  IPC_INSIGHTS_LABEL_BY_SUBCATEGORY,
  insightsLabelBySubcategoryRequestSchema,
  insightsLabelBySubcategoryResponseSchema,
  IPC_INSIGHTS_LABEL_MONTHLY_EVOLUTION,
  insightsLabelMonthlyEvolutionRequestSchema,
  insightsLabelMonthlyEvolutionResponseSchema,
  IPC_INSIGHTS_LABEL_BY_ACCOUNT,
  insightsLabelByAccountRequestSchema,
  insightsLabelByAccountResponseSchema,
} from '../../shared/ipc-contracts/insights.js';
import {
  handleInsightsLandingSummary,
  handleInsightsLabelSummary,
  handleInsightsLabelByCategory,
  handleInsightsLabelBySubcategory,
  handleInsightsLabelMonthlyEvolution,
  handleInsightsLabelByAccount,
} from './handlers/insights.js';
import {
  IPC_PROFILE_GET,
  IPC_PROFILE_SAVE,
  profileGetResponseSchema,
  profileSaveResponseSchema,
} from '../../shared/ipc-contracts/profile.js';
import { handleProfileGet, handleProfileSave } from './handlers/profile.js';
import {
  IPC_ORG_PROFILE_GET,
  IPC_ORG_PROFILE_SAVE,
  IPC_ORG_PROFILE_SET_LOGO,
  IPC_ORG_PROFILE_REMOVE_LOGO,
  IPC_ORG_PROFILE_GET_LOGO,
  orgProfileGetResponseSchema,
  orgProfileSaveResponseSchema,
  orgProfileSetLogoResponseSchema,
  orgProfileRemoveLogoResponseSchema,
  orgProfileGetLogoResponseSchema,
} from '../../shared/ipc-contracts/org-profile.js';
import {
  handleOrgProfileGet,
  handleOrgProfileSave,
  handleOrgProfileSetLogo,
  handleOrgProfileRemoveLogo,
  handleOrgProfileGetLogo,
} from './handlers/orgProfile.js';
import {
  IPC_CONFIG_GET,
  IPC_CONFIG_SET_DATA_DIR,
  configGetResponseSchema,
  configSetDataDirResponseSchema,
} from '../../shared/ipc-contracts/config.js';
import {
  handleConfigGet,
  createConfigSetDataDirHandler,
  buildProductionSetDataDirDeps,
} from './handlers/config.js';
import {
  IPC_DIALOG_PICK_FOLDER,
  IPC_DIALOG_PICK_IMPORT_FILE,
  dialogPickFolderResponseSchema,
  dialogPickImportFileResponseSchema,
} from '../../shared/ipc-contracts/dialog.js';
import { handleDialogPickFolder, handleDialogPickImportFile } from './handlers/dialog.js';
import {
  IPC_APP_NEEDS_ONBOARDING,
  appNeedsOnboardingResponseSchema,
} from '../../shared/ipc-contracts/onboarding.js';
import {
  createAppNeedsOnboardingHandler,
  buildProductionNeedsOnboardingDeps,
} from './handlers/onboarding.js';
import {
  IPC_APP_BOOT_STATUS,
  appBootStatusResponseSchema,
} from '../../shared/ipc-contracts/boot.js';
import { createAppBootStatusHandler } from './handlers/boot.js';
import {
  IPC_SHELL_OPEN_PATH,
  shellOpenPathResponseSchema,
} from '../../shared/ipc-contracts/shell.js';
import { handleShellOpenPath } from './handlers/shell.js';
import {
  IPC_APP_GET_VERSION,
  appGetVersionResponseSchema,
} from '../../shared/ipc-contracts/app.js';
import { createAppGetVersionHandler, buildProductionAppGetVersionDeps } from './handlers/app.js';
import {
  IPC_WORKSPACE_DETECT,
  IPC_WORKSPACE_CREATE,
  IPC_WORKSPACE_CONFIRM_SETUP,
  IPC_WORKSPACE_ENROLL,
  IPC_WORKSPACE_UNLOCK,
  IPC_WORKSPACE_RECOVER,
  IPC_WORKSPACE_LOCK,
  workspaceDetectResponseSchema,
  workspaceCreateResponseSchema,
  workspaceConfirmSetupResponseSchema,
  workspaceEnrollResponseSchema,
  workspaceUnlockResponseSchema,
  workspaceRecoverResponseSchema,
  workspaceLockResponseSchema,
  createWorkspaceHandlers,
  buildProductionWorkspaceDeps,
} from './handlers/workspace.js';
import {
  getEventLog,
  getProfile,
  getDeviceId,
  getDatasetId,
  isOnboardingPending,
  isEncryptedWorkspacePending,
  rehydrateFromDisk,
  getLastUnlockIntegrityVerdict,
} from '../bootstrap.js';
import { getReadModel } from '../../core/query/reducers.js';
import { newUlid } from '../ids.js';
import {
  IPC_EXPORT_PREPARE,
  IPC_EXPORT_RUN,
  IPC_EXPORT_REVEAL,
  exportPrepareResponseSchema,
  exportRunResponseSchema,
  exportRevealResponseSchema,
} from '../../shared/ipc-contracts/export.js';
import { createExportHandlers } from './handlers/export.js';
import {
  IPC_REPORT_BUILD,
  IPC_REPORT_GENERATE,
  reportBuildResponseSchema,
  reportGenerateResponseSchema,
} from '../../shared/ipc-contracts/report.js';
import { createReportHandlers } from './handlers/report.js';
import {
  IPC_AUDIT_VERIFY_STATUS,
  IPC_AUDIT_LIST_SIGNED,
  IPC_AUDIT_LIST_CHANGE_HISTORY,
  auditVerifyStatusResponseSchema,
  auditListSignedResponseSchema,
  auditListChangeHistoryResponseSchema,
} from '../../shared/ipc-contracts/audit.js';
import { createAuditHandlers } from './handlers/audit.js';
import { getActiveWorkspace } from '../workspace-session.js';

// SPEC-026 — When bootstrap deferred event-log construction because the
// workspace is encrypted and locked, IPC handler registration cannot eagerly
// call getEventLog() (it would throw). We stash the IpcMain reference, skip
// the data-handler block at startup, and re-run it from the workspace IPC
// handlers once installEncryptedEventLog() has run (post-unlock /
// confirmSetup / enroll / recover). Mirrors the onboarding-pending pattern
// in #196.
let deferredDataIpcMain: IpcMain | null = null;
let dataIpcRegistered = false;

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

  // P0-2 Profile handlers — trial-readiness
  ipcMain.handle(IPC_PROFILE_GET, async (_event, raw: unknown) => {
    const response = await handleProfileGet(raw);
    return profileGetResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_PROFILE_SAVE, async (_event, raw: unknown) => {
    const response = await handleProfileSave(raw);
    return profileSaveResponseSchema.parse(response);
  });

  // SPEC-030 WI-4 — Organisation profile (Financial Report header/footer).
  // Non-sensitive; always registered (independent of the encrypted workspace).
  ipcMain.handle(IPC_ORG_PROFILE_GET, async (_event, raw: unknown) => {
    const response = await handleOrgProfileGet(raw);
    return orgProfileGetResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_ORG_PROFILE_SAVE, async (_event, raw: unknown) => {
    const response = await handleOrgProfileSave(raw);
    return orgProfileSaveResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_ORG_PROFILE_SET_LOGO, async (_event, raw: unknown) => {
    const response = await handleOrgProfileSetLogo(raw);
    return orgProfileSetLogoResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_ORG_PROFILE_REMOVE_LOGO, async (_event, raw: unknown) => {
    const response = await handleOrgProfileRemoveLogo(raw);
    return orgProfileRemoveLogoResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_ORG_PROFILE_GET_LOGO, async (_event, raw: unknown) => {
    const response = await handleOrgProfileGetLogo(raw);
    return orgProfileGetLogoResponseSchema.parse(response);
  });

  // P0-3 Config handlers — trial-readiness
  ipcMain.handle(IPC_CONFIG_GET, async (_event, raw: unknown) => {
    const response = await handleConfigGet(raw);
    return configGetResponseSchema.parse(response);
  });

  // P1-2 (#149) — config:setDataDir validates a candidate folder, persists
  // it to app-config.json, and schedules an app relaunch. Deps (Electron's
  // `app`) are resolved lazily so the rest of the handler stays test-friendly.
  let setDataDirHandler: ReturnType<typeof createConfigSetDataDirHandler> | null = null;
  ipcMain.handle(IPC_CONFIG_SET_DATA_DIR, async (_event, raw: unknown) => {
    if (setDataDirHandler === null) {
      setDataDirHandler = createConfigSetDataDirHandler(await buildProductionSetDataDirDeps());
    }
    const response = await setDataDirHandler(raw);
    return configSetDataDirResponseSchema.parse(response);
  });

  // P2-4 (#156) — dialog:pickFolder exposes Electron's folder picker to the renderer
  ipcMain.handle(IPC_DIALOG_PICK_FOLDER, async (_event, raw: unknown) => {
    const response = await handleDialogPickFolder(raw);
    return dialogPickFolderResponseSchema.parse(response);
  });

  // dialog:pickImportFile — file picker for import wizard (trial.3.6 fix)
  ipcMain.handle(IPC_DIALOG_PICK_IMPORT_FILE, async (_event, raw: unknown) => {
    const response = await handleDialogPickImportFile(raw);
    return dialogPickImportFileResponseSchema.parse(response);
  });

  // #196 — app:needsOnboarding flag for the first-run folder-picker wizard.
  let needsOnboardingHandler: ReturnType<typeof createAppNeedsOnboardingHandler> | null = null;
  ipcMain.handle(IPC_APP_NEEDS_ONBOARDING, async (_event, raw: unknown) => {
    if (needsOnboardingHandler === null) {
      needsOnboardingHandler = createAppNeedsOnboardingHandler(
        await buildProductionNeedsOnboardingDeps(),
      );
    }
    const response = await needsOnboardingHandler(raw);
    return appNeedsOnboardingResponseSchema.parse(response);
  });

  // app:bootStatus — #242 boot/hydration error surface. Returns whether
  // bootstrap succeeded or failed. If boot failed (corrupt dataset.json,
  // schema version mismatch, hydration error), returns error details so the
  // renderer can show a BootErrorPage with actionable recovery steps.
  const bootStatusHandler = createAppBootStatusHandler();
  ipcMain.handle(IPC_APP_BOOT_STATUS, async (_event, raw: unknown) => {
    const response = await bootStatusHandler(raw);
    return appBootStatusResponseSchema.parse(response);
  });

  // shell:openPath reveals a folder/file in the OS file explorer. Routed
  // through IPC because Electron's shell module is unavailable in sandboxed
  // preloads when imported renderer-side.
  ipcMain.handle(IPC_SHELL_OPEN_PATH, async (_event, raw: unknown) => {
    const response = await handleShellOpenPath(raw);
    return shellOpenPathResponseSchema.parse(response);
  });

  // app:get-version exposes the application version from package.json. Lazy
  // handler creation matches the pattern for other Electron-dependent handlers.
  let appGetVersionHandler: ReturnType<typeof createAppGetVersionHandler> | null = null;
  ipcMain.handle(IPC_APP_GET_VERSION, async (_event) => {
    if (appGetVersionHandler === null) {
      appGetVersionHandler = createAppGetVersionHandler(await buildProductionAppGetVersionDeps());
    }
    const response = await appGetVersionHandler({});
    return appGetVersionResponseSchema.parse(response);
  });

  // ── Workspace lifecycle (SPEC-026 #301) ─────────────────────────────────────
  // Registered unconditionally — workspace channels must be available during
  // onboarding, unlike data channels that require a mounted workspace.
  let workspaceHandlers: ReturnType<typeof createWorkspaceHandlers> | null = null;
  async function getWorkspaceHandlers(): Promise<ReturnType<typeof createWorkspaceHandlers>> {
    if (workspaceHandlers === null) {
      workspaceHandlers = createWorkspaceHandlers(await buildProductionWorkspaceDeps());
    }
    return workspaceHandlers;
  }

  ipcMain.handle(IPC_WORKSPACE_DETECT, async (_event, raw: unknown) => {
    const h = await getWorkspaceHandlers();
    const response = await h.handleDetect(raw);
    return workspaceDetectResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_WORKSPACE_CREATE, async (_event, raw: unknown) => {
    const h = await getWorkspaceHandlers();
    const response = await h.handleCreate(raw);
    return workspaceCreateResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_WORKSPACE_CONFIRM_SETUP, async (_event, raw: unknown) => {
    const h = await getWorkspaceHandlers();
    const response = await h.handleConfirmSetup(raw);
    return workspaceConfirmSetupResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_WORKSPACE_ENROLL, async (_event, raw: unknown) => {
    const h = await getWorkspaceHandlers();
    const response = await h.handleEnroll(raw);
    return workspaceEnrollResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_WORKSPACE_UNLOCK, async (_event, raw: unknown) => {
    const h = await getWorkspaceHandlers();
    const response = await h.handleUnlock(raw);
    return workspaceUnlockResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_WORKSPACE_RECOVER, async (_event, raw: unknown) => {
    const h = await getWorkspaceHandlers();
    const response = await h.handleRecover(raw);
    return workspaceRecoverResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_WORKSPACE_LOCK, async (_event, raw: unknown) => {
    const h = await getWorkspaceHandlers();
    const response = await h.handleLock(raw);
    return workspaceLockResponseSchema.parse(response);
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

  ipcMain.handle(IPC_PANEL_GET_ACCOUNT_BALANCES_IN_RANGE, async (_event, raw: unknown) => {
    const request = getAccountBalancesInRangeRequestSchema.parse(raw);
    const response = await handleGetAccountBalancesInRange(request);
    return getAccountBalancesInRangeResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_PANEL_GET_ACCOUNT_TX_COUNTS_IN_RANGE, async (_event, raw: unknown) => {
    const request = getAccountTransactionCountsInRangeRequestSchema.parse(raw);
    const response = await handleGetAccountTransactionCountsInRange(request);
    return getAccountTransactionCountsInRangeResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_PANEL_GET_MONTH_KPIS, async (_event, raw: unknown) => {
    const request = getMonthKPIsRequestSchema.parse(raw);
    const response = await handleGetMonthKPIs(request);
    return getMonthKPIsResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_PANEL_GET_RANGE_KPIS, async (_event, raw: unknown) => {
    const request = getRangeKPIsRequestSchema.parse(raw);
    const response = await handleGetRangeKPIs(request);
    return getRangeKPIsResponseSchema.parse(response);
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

  ipcMain.handle(IPC_PANEL_GET_MONTHLY_INCOME_EXPENSE, async (_event, raw: unknown) => {
    const request = getMonthlyIncomeExpenseRequestSchema.parse(raw);
    const response = await handleGetMonthlyIncomeExpense(request);
    return getMonthlyIncomeExpenseResponseSchema.parse(response);
  });

  // WI-22 — Saldo aggregation (single read-only comparison endpoint).
  ipcMain.handle(IPC_SALDO_GET_COMPARISON, async (_event, raw: unknown) => {
    const request = saldoComparisonRequestSchema.parse(raw);
    const response = await handleGetSaldoComparison(request);
    return saldoComparisonResponseSchema.parse(response);
  });

  // Insights — landing summary aggregation
  ipcMain.handle(IPC_INSIGHTS_LANDING_SUMMARY, async (_event, raw: unknown) => {
    const request = insightsLandingSummaryRequestSchema.parse(raw);
    const response = await handleInsightsLandingSummary(request);
    return insightsLandingSummaryResponseSchema.parse(response);
  });

  // Insights drilldown (UX-005 §6.3 – §6.7) — label-detail queries.
  // All five accept `{ tagIds, windowStart?, windowEnd?, accountId? }` and
  // apply OR semantics across tagIds (a tx matches if it carries ANY of them).
  ipcMain.handle(IPC_INSIGHTS_LABEL_SUMMARY, async (_event, raw: unknown) => {
    const request = insightsLabelSummaryRequestSchema.parse(raw);
    const response = await handleInsightsLabelSummary(request);
    return insightsLabelSummaryResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_INSIGHTS_LABEL_BY_CATEGORY, async (_event, raw: unknown) => {
    const request = insightsLabelByCategoryRequestSchema.parse(raw);
    const response = await handleInsightsLabelByCategory(request);
    return insightsLabelByCategoryResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_INSIGHTS_LABEL_BY_SUBCATEGORY, async (_event, raw: unknown) => {
    const request = insightsLabelBySubcategoryRequestSchema.parse(raw);
    const response = await handleInsightsLabelBySubcategory(request);
    return insightsLabelBySubcategoryResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_INSIGHTS_LABEL_MONTHLY_EVOLUTION, async (_event, raw: unknown) => {
    const request = insightsLabelMonthlyEvolutionRequestSchema.parse(raw);
    const response = await handleInsightsLabelMonthlyEvolution(request);
    return insightsLabelMonthlyEvolutionResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_INSIGHTS_LABEL_BY_ACCOUNT, async (_event, raw: unknown) => {
    const request = insightsLabelByAccountRequestSchema.parse(raw);
    const response = await handleInsightsLabelByAccount(request);
    return insightsLabelByAccountResponseSchema.parse(response);
  });

  // WI-12 — transaction.create + movements.list
  // WI-20 — transaction.update + transaction.delete
  // P0-2 — actorUserId from loaded profile, not placeholder
  //
  // First-run gate (#196): when bootstrap deferred the event log because no
  // `dataDir` is configured yet, skip every handler that depends on
  // `getEventLog()` / `getDatasetId()`. The renderer mounts only the
  // onboarding wizard in this state; the wizard relies solely on
  // `app:needsOnboarding`, `dialog:pickFolder`, and `config:setDataDir`,
  // all registered above. After the user picks a folder, `setDataDir`
  // relaunches the process and the next boot registers the full set.
  if (isOnboardingPending()) {
    // eslint-disable-next-line no-console
    console.log(
      '[ipc] onboarding pending — skipping data IPC handler registration until a data folder is chosen',
    );
    return;
  }

  // SPEC-026 — Workspace is encrypted and not yet unlocked. Defer data-handler
  // registration until the master key is loaded; the renderer at this point
  // only needs the workspace:* and onboarding/profile/config IPCs already
  // registered above. The renderer routes to JoinFlow / silent-unlock /
  // recovery and never invokes data IPCs in this state.
  if (isEncryptedWorkspacePending()) {
    deferredDataIpcMain = ipcMain;
    // eslint-disable-next-line no-console
    console.log(
      '[ipc] encrypted workspace pending unlock — deferring data IPC handler registration until installEncryptedEventLog runs',
    );
    return;
  }

  registerDataIpcHandlers(ipcMain);
}

/**
 * SPEC-026 — Called by the workspace IPC handlers (via bootstrap's
 * installEncryptedEventLog) right after the encrypted event log is installed
 * and the read model has been hydrated. If startup deferred data-handler
 * registration because the workspace was locked, register them now so the
 * renderer's first queries after unlock find live IPC channels.
 *
 * Idempotent — second and subsequent calls are no-ops.
 */
export function registerDataIpcHandlersIfDeferred(): void {
  if (dataIpcRegistered) return;
  if (deferredDataIpcMain === null) return;
  registerDataIpcHandlers(deferredDataIpcMain);
}

function registerDataIpcHandlers(ipcMain: IpcMain): void {
  if (dataIpcRegistered) return;
  dataIpcRegistered = true;

  const profile = getProfile();
  const transactionDeps = {
    eventLog: getEventLog(),
    getReadModel,
    now: () => new Date(),
    newId: newUlid,
    datasetId: getDatasetId(),
    actorDeviceId: getDeviceId(),
    // P1-1: Use profile.userId if available, otherwise block writes at IPC level
    actorUserId: profile?.userId ?? 'PROFILE_PENDING000000000',
    actorIdentitySource: (profile?.identitySource ?? 'local') as 'local' | 'aad',
    dekVersion: 0,
  };

  const handleTransactionCreate = createTransactionCreateHandler(transactionDeps);
  const handleTransactionUpdate = createTransactionUpdateHandler(transactionDeps);
  const handleTransactionDelete = createTransactionDeleteHandler(transactionDeps);
  const handleTransactionBulkUpdate = createTransactionBulkUpdateHandler(transactionDeps);
  const handleTransactionBulkAddLabel = createTransactionBulkAddLabelHandler(transactionDeps);

  ipcMain.handle(IPC_TRANSACTION_CREATE, async (_event, raw: unknown) => {
    const response = await handleTransactionCreate(raw);
    // Response validation is belt-and-suspenders (ADR-001 C13); any error-
    // producing path inside the handler already returned a structured union,
    // so this parse should never throw in practice. If it does (e.g. a corrupt
    // dev-seed row with a malformed createdAt that the read model preserved),
    // degrade to a structured INTERNAL error instead of letting the IPC call
    // reject unhandled — the renderer then shows a graceful error toast.
    try {
      return createTransactionResponseSchema.parse(response);
    } catch (err) {
      console.error('[ipc] transaction:create response failed validation', err);
      return {
        ok: false as const,
        error: { code: 'INTERNAL' as const, message: 'Internal error' },
      };
    }
  });

  ipcMain.handle(IPC_TRANSACTION_UPDATE, async (_event, raw: unknown) => {
    const response = await handleTransactionUpdate(raw);
    try {
      return updateTransactionResponseSchema.parse(response);
    } catch (err) {
      console.error('[ipc] transaction:update response failed validation', err);
      return {
        ok: false as const,
        error: { code: 'INTERNAL' as const, message: 'Internal error' },
      };
    }
  });

  ipcMain.handle(IPC_TRANSACTION_DELETE, async (_event, raw: unknown) => {
    const response = await handleTransactionDelete(raw);
    try {
      return deleteTransactionResponseSchema.parse(response);
    } catch (err) {
      console.error('[ipc] transaction:delete response failed validation', err);
      return {
        ok: false as const,
        error: { code: 'INTERNAL' as const, message: 'Internal error' },
      };
    }
  });

  ipcMain.handle(IPC_TRANSACTION_BULK_UPDATE, async (_event, raw: unknown) => {
    const response = await handleTransactionBulkUpdate(raw);
    try {
      return bulkUpdateTransactionResponseSchema.parse(response);
    } catch (err) {
      console.error('[ipc] transaction:bulkUpdate response failed validation', err);
      return {
        ok: false as const,
        failures: [{ id: '', code: 'INTERNAL' as const, message: 'Internal error' }],
      };
    }
  });

  ipcMain.handle(IPC_TRANSACTION_BULK_ADD_LABEL, async (_event, raw: unknown) => {
    const response = await handleTransactionBulkAddLabel(raw);
    try {
      return bulkAddLabelTransactionResponseSchema.parse(response);
    } catch (err) {
      console.error('[ipc] transaction:bulkAddLabel response failed validation', err);
      return {
        ok: false as const,
        failures: [{ id: '', code: 'INTERNAL' as const, message: 'Internal error' }],
      };
    }
  });

  const handleMovementsList = createMovementsListHandler({ getReadModel });

  ipcMain.handle(IPC_MOVEMENTS_LIST, async (_event, raw: unknown) => {
    const response = await handleMovementsList(raw);
    return movementsListResponseSchema.parse(response);
  });

  // Multi-instance staleness fix: forces a fresh `eventLog.load()` +
  // `replayEvents()` so renderer queries that follow pick up events written
  // by other desktop instances on the same shared workspace. Channel is
  // intentionally generic (`query:rehydrate`) — other screens can adopt it
  // without a contract break.
  const handleQueryRehydrate = createQueryRehydrateHandler({ rehydrateFromDisk });
  ipcMain.handle(IPC_QUERY_REHYDRATE, async (_event, raw: unknown) => {
    return handleQueryRehydrate(raw);
  });

  // WI-15-lite — Configuración (accounts / categories / tags) create + list.
  // #388 — stamp actor/device on config/taxonomy events, sourced exactly like
  // the transaction handler deps above so the audit change-history viewer can
  // attribute account/category/subcategory/tag mutations.
  const configDeps = {
    eventLog: getEventLog(),
    getReadModel,
    now: () => new Date(),
    newId: newUlid,
    actorDeviceId: getDeviceId(),
    actorUserId: profile?.userId ?? 'PROFILE_PENDING000000000',
  };

  const handleAccountsCreate = createAccountsCreateHandler(configDeps);
  const handleAccountsList = createAccountsListHandler({ getReadModel });
  const handleAccountsUpdate = createAccountsUpdateHandler(configDeps);
  const handleAccountsArchive = createAccountsArchiveHandler(configDeps);
  const handleAccountsUnarchive = createAccountsUnarchiveHandler(configDeps);
  const handleAccountsDelete = createAccountsDeleteHandler(configDeps);
  const handleAccountsUsage = createAccountsUsageHandler({ getReadModel });
  ipcMain.handle(IPC_ACCOUNTS_CREATE, async (_event, raw: unknown) => {
    const response = await handleAccountsCreate(raw);
    return createAccountResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_ACCOUNTS_LIST, async (_event, raw: unknown) => {
    const response = await handleAccountsList(raw);
    return accountsListResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_ACCOUNTS_UPDATE, async (_event, raw: unknown) => {
    const response = await handleAccountsUpdate(raw);
    return updateAccountResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_ACCOUNTS_ARCHIVE, async (_event, raw: unknown) => {
    const response = await handleAccountsArchive(raw);
    return archiveAccountResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_ACCOUNTS_UNARCHIVE, async (_event, raw: unknown) => {
    const response = await handleAccountsUnarchive(raw);
    return unarchiveAccountResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_ACCOUNTS_DELETE, async (_event, raw: unknown) => {
    const response = await handleAccountsDelete(raw);
    return deleteAccountResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_ACCOUNTS_USAGE, async () => {
    const response = await handleAccountsUsage();
    return accountsUsageResponseSchema.parse(response);
  });

  const handleCategoriesCreate = createCategoriesCreateHandler(configDeps);
  const handleCategoriesList = createCategoriesListHandler({ getReadModel });
  const handleCategoriesUsage = createCategoriesUsageHandler({ getReadModel });
  const handleCategoriesUpdate = createCategoriesUpdateHandler(configDeps);
  const handleCategoriesArchive = createCategoriesArchiveHandler(configDeps);
  const handleCategoriesUnarchive = createCategoriesUnarchiveHandler(configDeps);
  const handleCategoriesDelete = createCategoriesDeleteHandler(configDeps);
  const handleSubcategoriesCreate = createSubcategoriesCreateHandler(configDeps);
  const handleSubcategoriesUpdate = createSubcategoriesUpdateHandler(configDeps);
  const handleSubcategoriesArchive = createSubcategoriesArchiveHandler(configDeps);
  const handleSubcategoriesUnarchive = createSubcategoriesUnarchiveHandler(configDeps);
  const handleSubcategoriesDelete = createSubcategoriesDeleteHandler(configDeps);
  const handleSubcategoriesUsage = createSubcategoriesUsageHandler({ getReadModel });
  ipcMain.handle(IPC_CATEGORIES_CREATE, async (_event, raw: unknown) => {
    const response = await handleCategoriesCreate(raw);
    return createCategoryResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_CATEGORIES_LIST, async (_event, raw: unknown) => {
    const response = await handleCategoriesList(raw);
    return categoriesListResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_CATEGORIES_USAGE, async () => {
    const response = await handleCategoriesUsage();
    return categoriesUsageResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_CATEGORIES_UPDATE, async (_event, raw: unknown) => {
    const response = await handleCategoriesUpdate(raw);
    return updateCategoryResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_CATEGORIES_ARCHIVE, async (_event, raw: unknown) => {
    const response = await handleCategoriesArchive(raw);
    return archiveCategoryResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_CATEGORIES_UNARCHIVE, async (_event, raw: unknown) => {
    const response = await handleCategoriesUnarchive(raw);
    return unarchiveCategoryResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_SUBCATEGORIES_CREATE, async (_event, raw: unknown) => {
    const response = await handleSubcategoriesCreate(raw);
    return createSubcategoryResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_SUBCATEGORIES_UPDATE, async (_event, raw: unknown) => {
    const response = await handleSubcategoriesUpdate(raw);
    return updateSubcategoryResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_SUBCATEGORIES_ARCHIVE, async (_event, raw: unknown) => {
    const response = await handleSubcategoriesArchive(raw);
    return archiveSubcategoryResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_SUBCATEGORIES_UNARCHIVE, async (_event, raw: unknown) => {
    const response = await handleSubcategoriesUnarchive(raw);
    return unarchiveSubcategoryResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_CATEGORIES_DELETE, async (_event, raw: unknown) => {
    const response = await handleCategoriesDelete(raw);
    return deleteCategoryResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_SUBCATEGORIES_DELETE, async (_event, raw: unknown) => {
    const response = await handleSubcategoriesDelete(raw);
    return deleteSubcategoryResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_SUBCATEGORIES_USAGE, async () => {
    const response = await handleSubcategoriesUsage();
    return subcategoriesUsageResponseSchema.parse(response);
  });

  const handleTagsCreate = createTagsCreateHandler(configDeps);
  const handleTagsList = createTagsListHandler({ getReadModel });
  const handleTagsUpdate = createTagsUpdateHandler(configDeps);
  const handleTagsArchive = createTagsArchiveHandler(configDeps);
  const handleTagsUnarchive = createTagsUnarchiveHandler(configDeps);
  const handleTagsDelete = createTagsDeleteHandler(configDeps);
  const handleTagsUsage = createTagsUsageHandler({ getReadModel });
  ipcMain.handle(IPC_TAGS_CREATE, async (_event, raw: unknown) => {
    const response = await handleTagsCreate(raw);
    return createTagResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_TAGS_LIST, async (_event, raw: unknown) => {
    const response = await handleTagsList(raw);
    return tagsListResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_TAGS_UPDATE, async (_event, raw: unknown) => {
    const response = await handleTagsUpdate(raw);
    return updateTagResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_TAGS_ARCHIVE, async (_event, raw: unknown) => {
    const response = await handleTagsArchive(raw);
    return archiveTagResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_TAGS_UNARCHIVE, async (_event, raw: unknown) => {
    const response = await handleTagsUnarchive(raw);
    return unarchiveTagResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_TAGS_DELETE, async (_event, raw: unknown) => {
    const response = await handleTagsDelete(raw);
    return deleteTagResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_TAGS_USAGE, async () => {
    const response = await handleTagsUsage();
    return tagsUsageResponseSchema.parse(response);
  });

  // WI-17 — Import handlers
  const importDeps = {
    eventLog: getEventLog(),
    getReadModel,
    now: () => new Date(),
    newId: newUlid,
  };

  const handleStageFile = createStageFileHandler({ getReadModel });
  const handleDryRun = createDryRunHandler({ getReadModel });
  const handleCommit = createCommitHandler(importDeps);
  const handleLastMapping = createLastMappingHandler({ getReadModel });

  ipcMain.handle(IPC_IMPORT_STAGE_FILE, async (_event, raw: unknown) => {
    const response = await handleStageFile(raw);
    return stageFileResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_IMPORT_DRY_RUN, async (_event, raw: unknown) => {
    const response = await handleDryRun(raw);
    return dryRunResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_IMPORT_COMMIT, async (_event, raw: unknown) => {
    const response = await handleCommit(raw);
    return commitImportResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_IMPORT_LAST_MAPPING, async (_event, raw: unknown) => {
    const response = await handleLastMapping(raw);
    return lastMappingResponseSchema.parse(response);
  });

  // WI-19 — transaction notes (add / list / edit / delete). Same deps shape
  // as transaction:create; notes events ride the same NDJSON log.
  const noteDeps = {
    eventLog: getEventLog(),
    getReadModel,
    now: () => new Date(),
    newId: newUlid,
  };

  const handleAddNote = createAddNoteHandler(noteDeps);
  const handleListNotes = createListNotesHandler({ getReadModel });
  const handleListAllNotes = createListAllNotesHandler({ getReadModel });
  const handleEditNote = createEditNoteHandler(noteDeps);
  const handleDeleteNote = createDeleteNoteHandler(noteDeps);

  ipcMain.handle(IPC_TRANSACTION_NOTE_ADD, async (_event, raw: unknown) => {
    const response = await handleAddNote(raw);
    return addNoteResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_TRANSACTION_NOTE_LIST, async (_event, raw: unknown) => {
    const response = await handleListNotes(raw);
    return listNotesResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_TRANSACTION_NOTE_LIST_ALL, async (_event, raw: unknown) => {
    const response = await handleListAllNotes(raw);
    return listAllNotesResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_TRANSACTION_NOTE_EDIT, async (_event, raw: unknown) => {
    const response = await handleEditNote(raw);
    return editNoteResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_TRANSACTION_NOTE_DELETE, async (_event, raw: unknown) => {
    const response = await handleDeleteNote(raw);
    return deleteNoteResponseSchema.parse(response);
  });

  // SPEC-023 — transaction splits (split / split:remove / split:get). Same
  // deps shape as notes; split events ride the same NDJSON event log.
  const splitDeps = {
    eventLog: getEventLog(),
    getReadModel,
    now: () => new Date(),
    newId: newUlid,
  };

  const handleSplitTransaction = createSplitTransactionHandler(splitDeps);
  const handleRemoveSplit = createRemoveSplitHandler(splitDeps);
  const handleGetSplits = createGetSplitsHandler({ getReadModel });

  ipcMain.handle(IPC_TRANSACTION_SPLIT, async (_event, raw: unknown) => {
    const response = await handleSplitTransaction(raw);
    return splitTransactionResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_TRANSACTION_SPLIT_REMOVE, async (_event, raw: unknown) => {
    const response = await handleRemoveSplit(raw);
    return removeSplitResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_TRANSACTION_SPLIT_GET, async (_event, raw: unknown) => {
    const response = await handleGetSplits(raw);
    return getSplitsResponseSchema.parse(response);
  });

  // SPEC-027 — Export (CSV / XLSX). The prepare/run/reveal handlers need the
  // invoke `event` (save dialog parent window, progress channel, per-window
  // token binding), so they are not the pure `(raw) => response` factories used
  // above.
  const exportHandlers = createExportHandlers({
    getActiveWorkspace,
    getReadModel,
    getDatasetId: () => getDatasetId(),
    getActorUserIdentity: () => getProfile()?.userId ?? getDeviceId(),
    newUlid,
    now: () => Date.now(),
  });
  ipcMain.handle(IPC_EXPORT_PREPARE, async (event, raw: unknown) => {
    const response = await exportHandlers.prepare(event, raw);
    return exportPrepareResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_EXPORT_RUN, async (event, raw: unknown) => {
    const response = await exportHandlers.run(event, raw);
    return exportRunResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_EXPORT_REVEAL, async (event, raw: unknown) => {
    const response = await exportHandlers.reveal(event, raw);
    return exportRevealResponseSchema.parse(response);
  });

  // SPEC-030 WI-2 — Financial Report (PDF). `report:build` assembles the
  // aggregate-only view-model from the WI-1 queries + WI-4 org profile and mints
  // a one-shot token; `report:generate` re-derives from the token, writes a
  // signed `report.generate` audit entry BEFORE any bytes, renders the PDF, and
  // atomically writes it. The renderer never sees a path or plaintext rows.
  const reportHandlers = createReportHandlers({
    getActiveWorkspace,
    getDatasetId: () => getDatasetId(),
    getActorUserIdentity: () => getProfile()?.userId ?? getDeviceId(),
    newUlid,
    now: () => Date.now(),
  });
  ipcMain.handle(IPC_REPORT_BUILD, async (event, raw: unknown) => {
    const response = await reportHandlers.build(event, raw);
    return reportBuildResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_REPORT_GENERATE, async (event, raw: unknown) => {
    const response = await reportHandlers.generate(event, raw);
    return reportGenerateResponseSchema.parse(response);
  });

  // SPEC-028 WI-4 — Audit & Evidence viewer (read-only). All three handlers are
  // pure `(raw) => response` reads; decryption/verify stays in main and only the
  // Zod-validated view-models cross IPC (FR12 / AC10).
  const auditHandlers = createAuditHandlers({
    getActiveWorkspace,
    getEventLog: () => getEventLog(),
    getReadModel,
    getDatasetId: () => getDatasetId(),
    getDeviceId: () => getDeviceId(),
    getLastUnlockVerdict: getLastUnlockIntegrityVerdict,
    getActorUserIdentity: () => getProfile()?.userId ?? getDeviceId(),
  });
  ipcMain.handle(IPC_AUDIT_VERIFY_STATUS, async (_event, raw: unknown) => {
    const response = await auditHandlers.verifyStatus(raw);
    return auditVerifyStatusResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_AUDIT_LIST_SIGNED, async (_event, raw: unknown) => {
    const response = await auditHandlers.listSigned(raw);
    return auditListSignedResponseSchema.parse(response);
  });
  ipcMain.handle(IPC_AUDIT_LIST_CHANGE_HISTORY, async (_event, raw: unknown) => {
    const response = await auditHandlers.listChangeHistory(raw);
    return auditListChangeHistoryResponseSchema.parse(response);
  });
}
