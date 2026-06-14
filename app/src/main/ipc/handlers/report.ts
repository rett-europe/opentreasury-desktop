// SPEC-030 — Report IPC handlers (main process).
//
// `report:build`    → require an unlocked workspace → run the WI-1 queries +
//                     resolve the WI-4 org profile in MAIN → assemble the
//                     AGGREGATE-ONLY view-model → assert the reconciliation ties
//                     out (FR20) → mint a one-shot confirmation token bound to
//                     the exact build params. Returns the model (preview) + token
//                     only — no path, no plaintext rows.
// `report:generate` → consume token (one-shot, window-bound) → re-assert the
//                     workspace (the encrypted-but-locked guard) → resolve a save
//                     destination via the OS dialog (default Documents) →
//                     dest-guard → write a signed `report.generate` audit entry
//                     (verify chain, fail closed) BEFORE any file bytes → render
//                     the PDF → atomic write → append succeeded/failed. Returns an
//                     OUTCOME — never a path string.
//
// The renderer NEVER receives a path. The generate request carries only the
// opaque token.

import { app, dialog, BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import * as nodePath from 'node:path';
import {
  reportBuildRequestSchema,
  reportGenerateRequestSchema,
  type ReportBuildResponse,
  type ReportGenerateResponse,
  type ReportModel,
} from '../../../shared/ipc-contracts/report.js';
import type {
  CategoryBreakdown,
  CategoryBreakdownGrouping,
  RangeReconciliation,
} from '../../../core/query/queries.js';
import {
  getCategoryBreakdownInRange,
  getReconciliationForRange,
} from '../../../core/query/queries.js';
import { getReadModel } from '../../../core/query/reducers.js';
import type { OrgProfileViewModel } from '../../../shared/ipc-contracts/org-profile.js';
import { assembleReportModel } from '../../../core/report/assembleModel.js';
import { buildReportHtml } from '../../../core/report/template.js';
import { buildDefaultReportFilename } from '../../../core/report/filename.js';
import { computeReportAfterHash } from '../../../core/report/canonicalParams.js';
import type { AuditLog } from '../../../core/audit/types.js';
import { FileAuditLog, createFsAuditStore } from '../../../core/audit/AuditLog.js';
import type { ActiveWorkspace } from '../../workspace-session.js';
import { assertDestinationAllowed } from '../../services/exportDestGuard.js';
import { renderHtmlToPdf, writeReportPdf } from '../../services/reportPdf.js';
import { getOrgProfileViewModel, readLogoDataUrl } from '../../orgProfile.js';
import { getOrgProfile } from '../../bootstrap.js';
import {
  consumePendingReport,
  invalidatePendingReportForWindow,
  mintPendingReport,
} from '../../services/reportGate.js';

/** Cent-level tolerance for the reconciliation tie-out assertion (FR20). */
const RECONCILE_EPSILON = 0.005;

export interface OrgContext {
  readonly org: OrgProfileViewModel;
  /** Logo inlined as a data: URL (never an on-disk path crosses IPC). */
  readonly logoDataUrl: string | null;
}

export interface ReportHandlerDeps {
  readonly getActiveWorkspace: () => ActiveWorkspace | null;
  readonly getDatasetId: () => string;
  /** Stable user identity stamped on audit entries (userId or device id). */
  readonly getActorUserIdentity: () => string;
  readonly newUlid: () => string;
  readonly now: () => number;
  /** Generation date `YYYY-MM-DD` (defaults to today, local). */
  readonly today?: () => string;
  // --- Injectable data sources (default to the WI-1 query singletons) ---
  readonly getCategoryBreakdown?: (
    from: string,
    to: string,
    grouping: CategoryBreakdownGrouping,
    accountId?: string,
  ) => CategoryBreakdown;
  readonly getReconciliation?: (
    from: string,
    to: string,
    accountId?: string,
  ) => RangeReconciliation;
  readonly getAccountName?: (accountId: string) => string | null;
  readonly loadOrgContext?: () => Promise<OrgContext>;
  // --- Injectable side effects (default to electron / services) ---
  readonly renderPdf?: (html: string) => Promise<Buffer>;
  readonly writePdf?: (buffer: Buffer, destPath: string) => Promise<void>;
  readonly showSaveDialog?: (
    window: BrowserWindow | null,
    defaultPath: string,
  ) => Promise<{ canceled: boolean; filePath?: string | undefined }>;
  readonly createAuditLog?: (ws: ActiveWorkspace, datasetId: string, actor: string) => AuditLog;
  readonly documentsDir?: () => string;
}

export interface ReportHandlers {
  build(event: IpcMainInvokeEvent, raw: unknown): Promise<ReportBuildResponse>;
  generate(event: IpcMainInvokeEvent, raw: unknown): Promise<ReportGenerateResponse>;
}

function defaultShowSaveDialog(
  window: BrowserWindow | null,
  defaultPath: string,
): Promise<{ canceled: boolean; filePath?: string | undefined }> {
  return dialog.showSaveDialog(window ?? undefined!, {
    defaultPath,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });
}

function defaultCreateAuditLog(ws: ActiveWorkspace, datasetId: string, actor: string): AuditLog {
  const auditDir = nodePath.resolve(ws.folderPath, '.treasury', 'audit');
  return new FileAuditLog({
    store: createFsAuditStore(auditDir),
    mk: ws.mk,
    datasetId,
    deviceId: ws.deviceId,
    actorUserIdentity: actor,
    now: () => new Date(),
    lockKey: auditDir,
  });
}

function defaultToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultLoadOrgContext(): Promise<OrgContext> {
  const userDataDir = app.getPath('userData');
  const profile = getOrgProfile();
  return Promise.all([
    getOrgProfileViewModel(userDataDir, profile),
    readLogoDataUrl(userDataDir, profile.logo),
  ]).then(([org, logoDataUrl]) => ({ org, logoDataUrl }));
}

function defaultGetAccountName(accountId: string): string | null {
  const model = getReadModel();
  const account = model.configAccounts.find((a) => a.id === accountId);
  return account ? account.name : null;
}

export function createReportHandlers(deps: ReportHandlerDeps): ReportHandlers {
  const getCategoryBreakdown = deps.getCategoryBreakdown ?? getCategoryBreakdownInRange;
  const getReconciliation = deps.getReconciliation ?? getReconciliationForRange;
  const getAccountName = deps.getAccountName ?? defaultGetAccountName;
  const loadOrgContext = deps.loadOrgContext ?? defaultLoadOrgContext;
  const renderPdf = deps.renderPdf ?? renderHtmlToPdf;
  const writePdf = deps.writePdf ?? writeReportPdf;
  const showSaveDialog = deps.showSaveDialog ?? defaultShowSaveDialog;
  const createAuditLog = deps.createAuditLog ?? defaultCreateAuditLog;
  const documentsDir = deps.documentsDir ?? (() => app.getPath('documents'));
  const today = deps.today ?? defaultToday;

  /** Re-derive the aggregate model from a set of build params (pure-ish: queries + org). */
  async function assemble(params: {
    periodKind: 'calendar-year' | 'custom-range';
    periodStart: string;
    periodEnd: string;
    accountIds: readonly string[];
    grouping: CategoryBreakdownGrouping;
    locale: 'es' | 'en';
  }): Promise<{ ok: true; model: ReportModel } | { ok: false; code: 'REPORT_RECONCILE_MISMATCH' }> {
    const accountId = params.accountIds[0];
    const breakdown = getCategoryBreakdown(
      params.periodStart,
      params.periodEnd,
      params.grouping,
      accountId,
    );
    const reconciliation = getReconciliation(params.periodStart, params.periodEnd, accountId);

    // FR20 — opening + credits − debits must tie to closing.
    const expectedClosing = reconciliation.opening + reconciliation.credits - reconciliation.debits;
    if (Math.abs(expectedClosing - reconciliation.closing) > RECONCILE_EPSILON) {
      return { ok: false, code: 'REPORT_RECONCILE_MISMATCH' };
    }

    const { org, logoDataUrl } = await loadOrgContext();
    const scopeAccountName = accountId ? getAccountName(accountId) : null;

    const model = assembleReportModel({
      breakdown,
      reconciliation,
      org,
      logoDataUrl,
      periodKind: params.periodKind,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      grouping: params.grouping,
      locale: params.locale,
      scopeAccountName,
      generatedAtIso: today(),
    });
    return { ok: true, model };
  }

  async function build(event: IpcMainInvokeEvent, raw: unknown): Promise<ReportBuildResponse> {
    const parsed = reportBuildRequestSchema.parse(raw);
    const webContentsId = event.sender.id;

    const ws = deps.getActiveWorkspace();
    if (ws === null) {
      invalidatePendingReportForWindow(webContentsId);
      return { ok: false, code: 'REPORT_NO_WORKSPACE' };
    }

    const params = {
      periodKind: parsed.periodKind,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      accountIds: parsed.accountIds ?? [],
      grouping: parsed.grouping,
      locale: parsed.locale,
    };

    let assembled;
    try {
      assembled = await assemble(params);
    } catch {
      invalidatePendingReportForWindow(webContentsId);
      return { ok: false, code: 'REPORT_INTERNAL' };
    }
    if (!assembled.ok) {
      invalidatePendingReportForWindow(webContentsId);
      return { ok: false, code: assembled.code };
    }

    const afterHash = computeReportAfterHash('pdf', params);
    const defaultBasename = buildDefaultReportFilename({
      periodKind: params.periodKind,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      locale: params.locale,
    });

    const pending = mintPendingReport({
      webContentsId,
      workspaceFolderPath: ws.folderPath,
      periodKind: params.periodKind,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      accountIds: params.accountIds,
      grouping: params.grouping,
      locale: params.locale,
      afterHash,
      model: assembled.model,
      defaultBasename,
      now: deps.now(),
    });

    return { ok: true, model: assembled.model, confirmationToken: pending.token };
  }

  async function generate(
    event: IpcMainInvokeEvent,
    raw: unknown,
  ): Promise<ReportGenerateResponse> {
    const parsed = reportGenerateRequestSchema.parse(raw);
    const webContentsId = event.sender.id;

    const pending = consumePendingReport(parsed.confirmationToken, webContentsId, deps.now());
    if (pending === null) {
      return { outcome: 'error', code: 'REPORT_TOKEN_INVALID' };
    }

    // Encrypted-but-locked guard: the master key only exists on an unlocked
    // active workspace. A null workspace (or a different one than the token was
    // minted for) refuses generation — no decrypt, no file.
    const ws = deps.getActiveWorkspace();
    if (ws === null || ws.folderPath !== pending.workspaceFolderPath) {
      return { outcome: 'error', code: 'REPORT_NO_WORKSPACE' };
    }

    // Resolve the destination via the OS dialog. Cancel → no audit, no file.
    const window = BrowserWindow.fromWebContents(event.sender);
    const defaultPath = nodePath.join(documentsDir(), pending.defaultBasename);
    let dialogResult: { canceled: boolean; filePath?: string | undefined };
    try {
      dialogResult = await showSaveDialog(window, defaultPath);
    } catch {
      return { outcome: 'error', code: 'REPORT_INTERNAL' };
    }
    if (dialogResult.canceled || !dialogResult.filePath) {
      return { outcome: 'canceled' };
    }
    const destPath = dialogResult.filePath;

    const guard = await assertDestinationAllowed(destPath, ws.folderPath);
    if (!guard.ok) {
      const code =
        guard.code === 'EXPORT_DEST_INSIDE_WORKSPACE'
          ? 'REPORT_DEST_INSIDE_WORKSPACE'
          : 'REPORT_DEST_TEMP_DIR';
      return { outcome: 'error', code };
    }

    // Re-derive the model from the token's bound params (source of truth at
    // generate time; provably the previewed report via the same afterHash).
    let assembled;
    try {
      assembled = await assemble({
        periodKind: pending.periodKind,
        periodStart: pending.periodStart,
        periodEnd: pending.periodEnd,
        accountIds: pending.accountIds,
        grouping: pending.grouping,
        locale: pending.locale,
      });
    } catch {
      return { outcome: 'error', code: 'REPORT_INTERNAL' };
    }
    if (!assembled.ok) {
      return { outcome: 'error', code: assembled.code };
    }

    const reportId = deps.newUlid();
    const audit = createAuditLog(ws, deps.getDatasetId(), deps.getActorUserIdentity());

    // AUDIT-FIRST (AC10): verify the chain then write the signed `started`
    // `report.generate` entry BEFORE any file I/O. Fail closed on any error.
    try {
      const verdict = await audit.verifyChain({ allowKeyCreation: false });
      if (!verdict.ok) return { outcome: 'error', code: 'REPORT_AUDIT_FAILED' };
      await audit.append({
        action: 'report.generate',
        result: 'started',
        targetId: reportId,
        targetType: 'report',
        afterHash: pending.afterHash,
      });
    } catch {
      return { outcome: 'error', code: 'REPORT_AUDIT_FAILED' };
    }

    // Render the PDF (offscreen, sandboxed) — still no target-file bytes yet.
    let pdf: Buffer;
    try {
      pdf = await renderPdf(buildReportHtml(assembled.model));
    } catch {
      await safeAppend(audit, {
        action: 'report.generate',
        result: 'failed',
        targetId: reportId,
        targetType: 'report',
        afterHash: pending.afterHash,
      });
      return { outcome: 'error', code: 'REPORT_RENDER_FAILED' };
    }

    // Atomic write (temp → rename).
    try {
      await writePdf(pdf, destPath);
    } catch {
      await safeAppend(audit, {
        action: 'report.generate',
        result: 'failed',
        targetId: reportId,
        targetType: 'report',
        afterHash: pending.afterHash,
      });
      return { outcome: 'error', code: 'REPORT_WRITE_FAILED' };
    }

    await safeAppend(audit, {
      action: 'report.generate',
      result: 'succeeded',
      targetId: reportId,
      targetType: 'report',
      afterHash: pending.afterHash,
    });

    return { outcome: 'saved', basename: nodePath.basename(destPath) };
  }

  return { build, generate };
}

// Completion-entry append failures are swallowed; the outcome is already
// determined and the next verifyChain surfaces a corrupt chain (fail closed).
async function safeAppend(
  audit: AuditLog,
  input: Parameters<AuditLog['append']>[0],
): Promise<void> {
  try {
    await audit.append(input);
  } catch {
    // intentionally swallowed (see note above)
  }
}
