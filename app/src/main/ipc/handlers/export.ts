// SPEC-027 — Export IPC handlers (main process).
//
// `export:prepare`  → validate filters (mandatory-filter gate) → build rows for
//                     the count + 100k cap → resolve a save destination via the
//                     OS dialog (default Documents) → dest-guard (hard-block
//                     inside workspace / temp) → rate-limit pre-check → mint a
//                     one-shot confirmation token.
// `export:run`      → consume token (one-shot, window-bound) → re-run dest-guard
//                     (TOCTOU) → record rate-limit attempt → write `started`
//                     audit entry + verify chain (fail closed) BEFORE the first
//                     byte → stream the file atomically → append succeeded/failed
//                     → emit `export:progress` (counts only).
// `export:reveal`   → reveal the last successful export for the calling window
//                     in the OS file manager (the path stays in main).
//
// The renderer NEVER receives a path or a plaintext row. The typed confirmation
// word is checked in the renderer and never crosses IPC.

import { app, dialog, shell, BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import * as nodePath from 'node:path';
import {
  IPC_EXPORT_PROGRESS,
  exportPrepareRequestSchema,
  exportRunRequestSchema,
  exportRevealRequestSchema,
  isMinimumFilterSetSatisfied,
  type ExportPrepareResponse,
  type ExportRunResponse,
  type ExportRevealResponse,
  type ExportProgress,
} from '../../../shared/ipc-contracts/export.js';
import type { ReadModel } from '../../../core/query/types.js';
import { buildExportRows } from '../../../core/export/buildExportRows.js';
import { computeAfterHash } from '../../../core/export/canonicalFilter.js';
import { buildExportFilename } from '../../../core/export/filename.js';
import {
  canStartExport,
  clearExpiredLockout,
  recordExportAttempt,
} from '../../../core/export/gate.js';
import type { AuditLog } from '../../../core/audit/types.js';
import { FileAuditLog, createFsAuditStore } from '../../../core/audit/AuditLog.js';
import type { ActiveWorkspace } from '../../workspace-session.js';
import { assertDestinationAllowed } from '../../services/exportDestGuard.js';
import { writeExport } from '../../services/exportService.js';
import {
  consumePendingExport,
  invalidatePendingForWindow,
  loadGateState,
  mintPendingExport,
  saveGateState,
} from '../../services/exportGate.js';

const PROGRESS_THROTTLE_MS = 200;

export interface ExportHandlerDeps {
  readonly getActiveWorkspace: () => ActiveWorkspace | null;
  readonly getReadModel: () => ReadModel;
  readonly getDatasetId: () => string;
  /** Stable user identity stamped on audit entries (userId or device id). */
  readonly getActorUserIdentity: () => string;
  readonly newUlid: () => string;
  readonly now: () => number;
  /** Injectable for tests. Defaults to electron's save dialog. */
  readonly showSaveDialog?: (
    window: BrowserWindow | null,
    defaultPath: string,
    format: 'csv' | 'xlsx',
  ) => Promise<{ canceled: boolean; filePath?: string | undefined }>;
  /** Injectable for tests. Defaults to a FileAuditLog under the workspace. */
  readonly createAuditLog?: (ws: ActiveWorkspace, datasetId: string, actor: string) => AuditLog;
  /** Documents directory for the default save path. */
  readonly documentsDir?: () => string;
}

export interface ExportHandlers {
  prepare(event: IpcMainInvokeEvent, raw: unknown): Promise<ExportPrepareResponse>;
  run(event: IpcMainInvokeEvent, raw: unknown): Promise<ExportRunResponse>;
  reveal(event: IpcMainInvokeEvent, raw: unknown): Promise<ExportRevealResponse>;
}

// Last successful export destination per window — fuels `export:reveal` without
// ever sending a path to the renderer.
const lastExportByWindow = new Map<number, string>();

function defaultShowSaveDialog(
  window: BrowserWindow | null,
  defaultPath: string,
  format: 'csv' | 'xlsx',
): Promise<{ canceled: boolean; filePath?: string | undefined }> {
  const filters =
    format === 'csv'
      ? [{ name: 'CSV', extensions: ['csv'] }]
      : [{ name: 'Excel', extensions: ['xlsx'] }];
  return dialog.showSaveDialog(window ?? undefined!, {
    defaultPath,
    filters,
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });
}

function defaultCreateAuditLog(ws: ActiveWorkspace, datasetId: string, actor: string): AuditLog {
  return new FileAuditLog({
    store: createFsAuditStore(nodePath.join(ws.folderPath, '.treasury', 'audit')),
    mk: ws.mk,
    datasetId,
    deviceId: ws.deviceId,
    actorUserIdentity: actor,
    now: () => new Date(),
  });
}

export function createExportHandlers(deps: ExportHandlerDeps): ExportHandlers {
  const showSaveDialog = deps.showSaveDialog ?? defaultShowSaveDialog;
  const createAuditLog = deps.createAuditLog ?? defaultCreateAuditLog;
  const documentsDir = deps.documentsDir ?? (() => app.getPath('documents'));

  async function prepare(event: IpcMainInvokeEvent, raw: unknown): Promise<ExportPrepareResponse> {
    const parsed = exportPrepareRequestSchema.parse(raw);
    const webContentsId = event.sender.id;

    const ws = deps.getActiveWorkspace();
    if (ws === null) {
      invalidatePendingForWindow(webContentsId);
      return { ok: false, code: 'EXPORT_NO_WORKSPACE' };
    }

    if (!isMinimumFilterSetSatisfied(parsed.filters)) {
      invalidatePendingForWindow(webContentsId);
      return { ok: false, code: 'EXPORT_MIN_FILTERS' };
    }

    // Rate-limit / lockout pre-check (authoritative re-check happens at run).
    const datasetId = deps.getDatasetId();
    const gateState = clearExpiredLockout(
      await loadGateState({ workspaceFolderPath: ws.folderPath, mk: ws.mk, datasetId }),
      deps.now(),
    );
    const decision = canStartExport(gateState, deps.now());
    if (!decision.allowed) {
      invalidatePendingForWindow(webContentsId);
      return { ok: false, code: decision.code };
    }

    const built = buildExportRows(deps.getReadModel(), parsed.filters);
    if (!built.ok) {
      invalidatePendingForWindow(webContentsId);
      return { ok: false, code: built.code };
    }

    const basename = buildExportFilename(parsed.locale, parsed.format, parsed.filters);
    const window = BrowserWindow.fromWebContents(event.sender);
    const defaultPath = nodePath.join(documentsDir(), basename);

    let dialogResult: { canceled: boolean; filePath?: string | undefined };
    try {
      dialogResult = await showSaveDialog(window, defaultPath, parsed.format);
    } catch {
      invalidatePendingForWindow(webContentsId);
      return { ok: false, code: 'EXPORT_INTERNAL' };
    }
    if (dialogResult.canceled || !dialogResult.filePath) {
      invalidatePendingForWindow(webContentsId);
      return { ok: false, code: 'USER_CANCELLED_DIALOG' };
    }
    const destPath = dialogResult.filePath;

    const guard = await assertDestinationAllowed(destPath, ws.folderPath);
    if (!guard.ok) {
      invalidatePendingForWindow(webContentsId);
      return { ok: false, code: guard.code };
    }

    const afterHash = computeAfterHash(parsed.format, parsed.filters);
    const pending = mintPendingExport({
      webContentsId,
      workspaceFolderPath: ws.folderPath,
      format: parsed.format,
      filters: parsed.filters,
      locale: parsed.locale,
      destPath,
      basename,
      estimatedRowCount: built.rows.length,
      afterHash,
      now: deps.now(),
    });

    const warnings =
      nodePath.isAbsolute(destPath) && /^\\\\/u.test(destPath) ? (['unc-path'] as const) : [];
    return {
      ok: true,
      confirmationToken: pending.token,
      basename,
      warnings: [...warnings],
      estimatedRowCount: built.rows.length,
    };
  }

  async function run(event: IpcMainInvokeEvent, raw: unknown): Promise<ExportRunResponse> {
    const parsed = exportRunRequestSchema.parse(raw);
    const webContentsId = event.sender.id;

    const pending = consumePendingExport(parsed.confirmationToken, webContentsId, deps.now());
    if (pending === null) {
      return { ok: false, code: 'EXPORT_TOKEN_INVALID' };
    }

    const ws = deps.getActiveWorkspace();
    if (ws === null || ws.folderPath !== pending.workspaceFolderPath) {
      return { ok: false, code: 'EXPORT_NO_WORKSPACE' };
    }

    const datasetId = deps.getDatasetId();
    const gateDeps = { workspaceFolderPath: ws.folderPath, mk: ws.mk, datasetId };

    // Authoritative rate-limit: re-check then record the attempt.
    const gateState = clearExpiredLockout(await loadGateState(gateDeps), deps.now());
    const decision = canStartExport(gateState, deps.now());
    if (!decision.allowed) {
      return { ok: false, code: decision.code };
    }
    await saveGateState(gateDeps, recordExportAttempt(gateState, deps.now()));

    // TOCTOU: re-run the destination guard before writing.
    const guard = await assertDestinationAllowed(pending.destPath, ws.folderPath);
    if (!guard.ok) {
      return { ok: false, code: guard.code };
    }

    // Rebuild rows from the current read model (source of truth at run time).
    const built = buildExportRows(deps.getReadModel(), pending.filters);
    if (!built.ok) {
      return { ok: false, code: built.code };
    }

    const action = pending.format === 'csv' ? 'export.csv' : 'export.xlsx';
    const exportId = deps.newUlid();
    const audit = createAuditLog(ws, datasetId, deps.getActorUserIdentity());

    // Verify the chain and write the `started` entry BEFORE the first byte.
    try {
      const verdict = await audit.verifyChain();
      if (!verdict.ok) return { ok: false, code: 'EXPORT_AUDIT_FAILED' };
      await audit.append({
        action,
        result: 'started',
        targetId: exportId,
        afterHash: pending.afterHash,
      });
    } catch {
      return { ok: false, code: 'EXPORT_AUDIT_FAILED' };
    }

    // Stream the file. Progress is throttled to ≤ 1 per 200 ms, counts only.
    let lastEmit = 0;
    const emit = (rowsDone: number, rowsTotal: number): void => {
      const t = deps.now();
      if (rowsDone !== rowsTotal && t - lastEmit < PROGRESS_THROTTLE_MS) return;
      lastEmit = t;
      const payload: ExportProgress = { phase: 'writing', rowsDone, rowsTotal };
      if (!event.sender.isDestroyed()) event.sender.send(IPC_EXPORT_PROGRESS, payload);
    };

    try {
      await writeExport({
        rows: built.rows,
        format: pending.format,
        destPath: pending.destPath,
        locale: pending.locale,
        onProgress: emit,
      });
    } catch {
      await safeAppend(audit, {
        action,
        result: 'failed',
        targetId: exportId,
        afterHash: pending.afterHash,
      });
      return { ok: false, code: 'EXPORT_WRITE_FAILED' };
    }

    await safeAppend(audit, {
      action,
      result: 'succeeded',
      targetId: exportId,
      afterHash: pending.afterHash,
    });
    lastExportByWindow.set(webContentsId, pending.destPath);
    return { ok: true, basename: pending.basename, rowCount: built.rows.length };
  }

  async function reveal(event: IpcMainInvokeEvent, raw: unknown): Promise<ExportRevealResponse> {
    exportRevealRequestSchema.parse(raw);
    const destPath = lastExportByWindow.get(event.sender.id);
    if (!destPath) return { ok: false };
    try {
      shell.showItemInFolder(destPath);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  return { prepare, run, reveal };
}

// The pending export records the format but not the locale; the filename was
// already computed with the renderer's locale at prepare time.
async function safeAppend(
  audit: AuditLog,
  input: Parameters<AuditLog['append']>[0],
): Promise<void> {
  try {
    await audit.append(input);
  } catch {
    // Completion-entry append failures are swallowed: the operation outcome is
    // already determined and diagnostics capture the local failure. The next
    // verifyChain will surface a corrupt chain (fail closed) on the following
    // export.
  }
}
