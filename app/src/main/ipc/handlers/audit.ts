// SPEC-028 WI-4 (#360) — Audit & Evidence viewer IPC handlers (main process).
//
// Three READ-ONLY `invoke` handlers backing the auditor screen. Everything that
// touches plaintext, ciphertext, the master key, or signatures happens here in
// main; the renderer receives only the Zod-validated view-models from
// `shared/ipc-contracts/audit.ts` (FR12 / AC10):
//
//   - `verifyStatus`      → surface the LAST unlock integrity verdict (NEVER a
//                           fresh verify on navigation, §2 entry #1) enriched
//                           with per-device "anchored through" + timestamp state
//                           read from the (decrypted) audit chain.
//   - `listSigned`        → the "Registro firmado" lane from the audit chain.
//   - `listChangeHistory` → the "Historial de cambios" lane projected from the
//                           decrypted domain event log, with honest `unknown`
//                           attribution for pre-coverage / flat events (§3.4).
//
// These handlers NEVER write, anchor, verify-on-demand, or export — anchoring is
// a main lifecycle concern and the evidence-export bundle is a separate WI (WI-6).

import * as nodePath from 'node:path';
import {
  auditListChangeHistoryRequestSchema,
  auditListSignedRequestSchema,
  auditVerifyStatusRequestSchema,
  type AuditListChangeHistoryResponse,
  type AuditListSignedResponse,
  type AuditVerifyStatusResponse,
} from '../../../shared/ipc-contracts/audit.js';
import type { IntegrityVerdict } from '../../../shared/ipc-contracts/audit-integrity.js';
import type { AuditEntry, AuditLog } from '../../../core/audit/types.js';
import { FileAuditLog, createFsAuditStore } from '../../../core/audit/AuditLog.js';
import { projectChangeHistory } from '../../../core/audit/changeHistory.js';
import { deriveVerifyStatus, projectSignedEntries } from '../../../core/audit/signedEntriesView.js';
import type { DomainEvent } from '../../../core/events/schemas.js';
import type { ReadModel } from '../../../core/query/types.js';
import type { ActiveWorkspace } from '../../workspace-session.js';

export interface AuditHandlerDeps {
  readonly getActiveWorkspace: () => ActiveWorkspace | null;
  /** Decrypted domain event log (change-history source). */
  readonly getEventLog: () => { load: () => Promise<readonly DomainEvent[]> };
  readonly getReadModel: () => ReadModel;
  readonly getDatasetId: () => string;
  readonly getDeviceId: () => string;
  /** The last unlock-time integrity verdict (NOT re-run here). */
  readonly getLastUnlockVerdict: () => IntegrityVerdict | null;
  /** Stable identity stamped on audit entries (userId or device id). */
  readonly getActorUserIdentity: () => string;
  /** Seam for tests; defaults to a real read-only `FileAuditLog`. */
  readonly createAuditLog?: (ws: ActiveWorkspace, datasetId: string, actor: string) => AuditLog;
}

export interface AuditHandlers {
  verifyStatus(raw: unknown): Promise<AuditVerifyStatusResponse>;
  listSigned(raw: unknown): Promise<AuditListSignedResponse>;
  listChangeHistory(raw: unknown): Promise<AuditListChangeHistoryResponse>;
}

/**
 * Build a read-only audit log over the active workspace. Mirrors the export
 * handler's construction exactly so the shipped read path / crypto behavior is
 * unchanged — this is a pure decryption read (`readAll`), never an append.
 */
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

/** Resolve an account ULID to its best display label from the read model. */
function buildAccountLabelResolver(readModel: ReadModel): (id: string) => string | null {
  const byId = new Map<string, string>();
  for (const acc of readModel.configAccounts) {
    const label = acc.label !== undefined && acc.label.length > 0 ? acc.label : acc.name;
    byId.set(acc.id, label);
  }
  return (id) => byId.get(id) ?? null;
}

export function createAuditHandlers(deps: AuditHandlerDeps): AuditHandlers {
  const createAuditLog = deps.createAuditLog ?? defaultCreateAuditLog;

  /** Read all signed audit entries, or [] when no workspace is unlocked. */
  async function readAuditEntries(): Promise<readonly AuditEntry[]> {
    const ws = deps.getActiveWorkspace();
    if (ws === null) return [];
    const audit = createAuditLog(ws, deps.getDatasetId(), deps.getActorUserIdentity());
    return audit.readAll();
  }

  return {
    async verifyStatus(raw: unknown): Promise<AuditVerifyStatusResponse> {
      auditVerifyStatusRequestSchema.parse(raw);
      const verdict = deps.getLastUnlockVerdict();
      const entries = await readAuditEntries();
      return deriveVerifyStatus(verdict, entries, deps.getDeviceId());
    },

    async listSigned(raw: unknown): Promise<AuditListSignedResponse> {
      const req = auditListSignedRequestSchema.parse(raw);
      const entries = await readAuditEntries();
      const { entries: rows, totalCount } = projectSignedEntries(entries, {
        ...(req.dateFrom !== undefined ? { dateFrom: req.dateFrom } : {}),
        ...(req.dateTo !== undefined ? { dateTo: req.dateTo } : {}),
      });
      return { entries: rows.slice(), totalCount };
    },

    async listChangeHistory(raw: unknown): Promise<AuditListChangeHistoryResponse> {
      const req = auditListChangeHistoryRequestSchema.parse(raw);
      const events = await deps.getEventLog().load();
      const accountLabelById = buildAccountLabelResolver(deps.getReadModel());
      const { rows, totalCount } = projectChangeHistory(
        events,
        {
          ...(req.dateFrom !== undefined ? { dateFrom: req.dateFrom } : {}),
          ...(req.dateTo !== undefined ? { dateTo: req.dateTo } : {}),
          ...(req.accountIds !== undefined ? { accountIds: req.accountIds } : {}),
          ...(req.deviceIds !== undefined ? { deviceIds: req.deviceIds } : {}),
        },
        { accountLabelById },
      );
      return { rows: rows.slice(), totalCount };
    },
  };
}
