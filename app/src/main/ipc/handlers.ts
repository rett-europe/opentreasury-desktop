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
import {
  IPC_ACCOUNTS_CREATE,
  IPC_ACCOUNTS_LIST,
  IPC_ACCOUNTS_UPDATE,
  IPC_ACCOUNTS_ARCHIVE,
  IPC_ACCOUNTS_UNARCHIVE,
  createAccountResponseSchema,
  accountsListResponseSchema,
  updateAccountResponseSchema,
  archiveAccountResponseSchema,
  unarchiveAccountResponseSchema,
} from '../../shared/ipc-contracts/accounts.js';
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
  createCategoryResponseSchema,
  categoriesListResponseSchema,
  categoriesUsageResponseSchema,
  updateCategoryResponseSchema,
  archiveCategoryResponseSchema,
  unarchiveCategoryResponseSchema,
  createSubcategoryResponseSchema,
  updateSubcategoryResponseSchema,
  archiveSubcategoryResponseSchema,
  unarchiveSubcategoryResponseSchema,
} from '../../shared/ipc-contracts/categories.js';
import {
  IPC_TAGS_CREATE,
  IPC_TAGS_LIST,
  IPC_TAGS_UPDATE,
  IPC_TAGS_ARCHIVE,
  IPC_TAGS_UNARCHIVE,
  createTagResponseSchema,
  tagsListResponseSchema,
  updateTagResponseSchema,
  archiveTagResponseSchema,
  unarchiveTagResponseSchema,
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
  IPC_TRANSACTION_NOTE_EDIT,
  IPC_TRANSACTION_NOTE_DELETE,
  addNoteResponseSchema,
  listNotesResponseSchema,
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
import {
  createAccountsCreateHandler,
  createAccountsListHandler,
  createAccountsUpdateHandler,
  createAccountsArchiveHandler,
  createAccountsUnarchiveHandler,
} from './handlers/accounts.js';
import {
  createCategoriesCreateHandler,
  createCategoriesListHandler,
  createCategoriesUpdateHandler,
  createCategoriesArchiveHandler,
  createCategoriesUnarchiveHandler,
  createCategoriesUsageHandler,
  createSubcategoriesCreateHandler,
  createSubcategoriesUpdateHandler,
  createSubcategoriesArchiveHandler,
  createSubcategoriesUnarchiveHandler,
} from './handlers/categories.js';
import {
  createTagsCreateHandler,
  createTagsListHandler,
  createTagsUpdateHandler,
  createTagsArchiveHandler,
  createTagsUnarchiveHandler,
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
  dialogPickFolderResponseSchema,
} from '../../shared/ipc-contracts/dialog.js';
import { handleDialogPickFolder } from './handlers/dialog.js';
import {
  IPC_APP_NEEDS_ONBOARDING,
  appNeedsOnboardingResponseSchema,
} from '../../shared/ipc-contracts/onboarding.js';
import {
  createAppNeedsOnboardingHandler,
  buildProductionNeedsOnboardingDeps,
} from './handlers/onboarding.js';
import {
  IPC_SHELL_OPEN_PATH,
  shellOpenPathResponseSchema,
} from '../../shared/ipc-contracts/shell.js';
import { handleShellOpenPath } from './handlers/shell.js';
import {
  getEventLog,
  getProfile,
  getDeviceId,
  getDatasetId,
  isOnboardingPending,
} from '../bootstrap.js';
import { getReadModel } from '../../core/query/reducers.js';
import { newUlid } from '../ids.js';

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

  // shell:openPath reveals a folder/file in the OS file explorer. Routed
  // through IPC because Electron's shell module is unavailable in sandboxed
  // preloads when imported renderer-side.
  ipcMain.handle(IPC_SHELL_OPEN_PATH, async (_event, raw: unknown) => {
    const response = await handleShellOpenPath(raw);
    return shellOpenPathResponseSchema.parse(response);
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
    // so this parse should never throw in practice.
    return createTransactionResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_TRANSACTION_UPDATE, async (_event, raw: unknown) => {
    const response = await handleTransactionUpdate(raw);
    return updateTransactionResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_TRANSACTION_DELETE, async (_event, raw: unknown) => {
    const response = await handleTransactionDelete(raw);
    return deleteTransactionResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_TRANSACTION_BULK_UPDATE, async (_event, raw: unknown) => {
    const response = await handleTransactionBulkUpdate(raw);
    return bulkUpdateTransactionResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_TRANSACTION_BULK_ADD_LABEL, async (_event, raw: unknown) => {
    const response = await handleTransactionBulkAddLabel(raw);
    return bulkAddLabelTransactionResponseSchema.parse(response);
  });

  const handleMovementsList = createMovementsListHandler({ getReadModel });

  ipcMain.handle(IPC_MOVEMENTS_LIST, async (_event, raw: unknown) => {
    const response = await handleMovementsList(raw);
    return movementsListResponseSchema.parse(response);
  });

  // WI-15-lite — Configuración (accounts / categories / tags) create + list.
  const configDeps = {
    eventLog: getEventLog(),
    getReadModel,
    now: () => new Date(),
    newId: newUlid,
  };

  const handleAccountsCreate = createAccountsCreateHandler(configDeps);
  const handleAccountsList = createAccountsListHandler({ getReadModel });
  const handleAccountsUpdate = createAccountsUpdateHandler(configDeps);
  const handleAccountsArchive = createAccountsArchiveHandler(configDeps);
  const handleAccountsUnarchive = createAccountsUnarchiveHandler(configDeps);
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

  const handleCategoriesCreate = createCategoriesCreateHandler(configDeps);
  const handleCategoriesList = createCategoriesListHandler({ getReadModel });
  const handleCategoriesUsage = createCategoriesUsageHandler({ getReadModel });
  const handleCategoriesUpdate = createCategoriesUpdateHandler(configDeps);
  const handleCategoriesArchive = createCategoriesArchiveHandler(configDeps);
  const handleCategoriesUnarchive = createCategoriesUnarchiveHandler(configDeps);
  const handleSubcategoriesCreate = createSubcategoriesCreateHandler(configDeps);
  const handleSubcategoriesUpdate = createSubcategoriesUpdateHandler(configDeps);
  const handleSubcategoriesArchive = createSubcategoriesArchiveHandler(configDeps);
  const handleSubcategoriesUnarchive = createSubcategoriesUnarchiveHandler(configDeps);
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

  const handleTagsCreate = createTagsCreateHandler(configDeps);
  const handleTagsList = createTagsListHandler({ getReadModel });
  const handleTagsUpdate = createTagsUpdateHandler(configDeps);
  const handleTagsArchive = createTagsArchiveHandler(configDeps);
  const handleTagsUnarchive = createTagsUnarchiveHandler(configDeps);
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
}
