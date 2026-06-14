// SPEC-030 §7/§8 — Report gate (main process).
//
// One-shot confirmation tokens that bind a `report:build` result to a single
// `report:generate`. The token carries the resolved build parameters + the
// canonical `afterHash` so `report:generate` (which receives ONLY the token)
// can re-derive the EXACT same report the user previewed — the renderer never
// echoes params, a destination path, or any aggregate figure.
//
// In-memory + process-lifetime (mirrors the token half of `exportGate.ts`).
// Unlike export there is no persisted rate-limit / lockout: report generation
// is a lightweight, non-destructive action (FR15 — no typed-word confirmation,
// no throttle).

import { randomBytes as nodeRandomBytes } from 'node:crypto';
import type {
  ReportGrouping,
  ReportLocaleCode,
  ReportModel,
  ReportPeriodKind,
} from '../../shared/ipc-contracts/report.js';

/** Token time-to-live — a confirmation must be completed within this window. */
export const REPORT_TOKEN_TTL_MS = 60_000;

export interface PendingReport {
  readonly token: string;
  /** Originating renderer window id (`event.sender.id`). */
  readonly webContentsId: number;
  /** Workspace folder the token is bound to (invalidated on workspace change). */
  readonly workspaceFolderPath: string;
  // Build parameters — `report:generate` re-runs the queries from these so the
  // generated PDF is provably the previewed one.
  readonly periodKind: ReportPeriodKind;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly accountIds: readonly string[];
  readonly grouping: ReportGrouping;
  readonly locale: ReportLocaleCode;
  /** Canonical-params BLAKE2b hash → the audit entry `after_hash`. */
  readonly afterHash: string;
  /** The assembled aggregate model previewed by the renderer. */
  readonly model: ReportModel;
  /** Suggested save-dialog file name. */
  readonly defaultBasename: string;
  readonly createdAt: number;
  readonly expiresAt: number;
}

// At most one pending report per window. Minting a new one drops the previous.
const pendingByWindow = new Map<number, PendingReport>();
const pendingByToken = new Map<string, PendingReport>();

function dropPending(p: PendingReport): void {
  pendingByToken.delete(p.token);
  if (pendingByWindow.get(p.webContentsId) === p) {
    pendingByWindow.delete(p.webContentsId);
  }
}

export interface MintPendingReportInput {
  readonly webContentsId: number;
  readonly workspaceFolderPath: string;
  readonly periodKind: ReportPeriodKind;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly accountIds: readonly string[];
  readonly grouping: ReportGrouping;
  readonly locale: ReportLocaleCode;
  readonly afterHash: string;
  readonly model: ReportModel;
  readonly defaultBasename: string;
  readonly now: number;
}

/** Mint a one-shot token, invalidating any prior pending report for the window. */
export function mintPendingReport(input: MintPendingReportInput): PendingReport {
  const existing = pendingByWindow.get(input.webContentsId);
  if (existing) dropPending(existing);

  const token = nodeRandomBytes(32).toString('base64url');
  const pending: PendingReport = {
    token,
    webContentsId: input.webContentsId,
    workspaceFolderPath: input.workspaceFolderPath,
    periodKind: input.periodKind,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    accountIds: [...input.accountIds],
    grouping: input.grouping,
    locale: input.locale,
    afterHash: input.afterHash,
    model: input.model,
    defaultBasename: input.defaultBasename,
    createdAt: input.now,
    expiresAt: input.now + REPORT_TOKEN_TTL_MS,
  };
  pendingByWindow.set(input.webContentsId, pending);
  pendingByToken.set(token, pending);
  return pending;
}

/**
 * Consume a token: one-shot. Returns the pending report only when the token
 * exists, has not expired, and was minted for the same window. The token is
 * removed regardless (so a failed/replayed attempt can't be reused).
 */
export function consumePendingReport(
  token: string,
  webContentsId: number,
  now: number,
): PendingReport | null {
  const pending = pendingByToken.get(token);
  if (!pending) return null;
  dropPending(pending);
  if (pending.webContentsId !== webContentsId) return null;
  if (now >= pending.expiresAt) return null;
  return pending;
}

/** Invalidate any pending token for one window. */
export function invalidatePendingReportForWindow(webContentsId: number): void {
  const existing = pendingByWindow.get(webContentsId);
  if (existing) dropPending(existing);
}

/** Invalidate ALL pending tokens (workspace lock/clear/switch, shutdown). */
export function invalidateAllPendingReports(): void {
  pendingByWindow.clear();
  pendingByToken.clear();
}

/** Test-only reset of the in-memory token tables. */
export function _resetPendingReports(): void {
  invalidateAllPendingReports();
}
