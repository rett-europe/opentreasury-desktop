// SPEC-028 WI-4 (#360) — Audit API client (read-only).
//
// Thin wrappers over `window.opentreasury.audit.*`. The renderer only ever
// receives the Zod-validated view-models from `shared/ipc-contracts/audit.ts`;
// all decryption / verification stays in main (FR12 / AC10).

import type {
  AuditVerifyStatusResponse,
  AuditListSignedRequest,
  AuditListSignedResponse,
  AuditListChangeHistoryRequest,
  AuditListChangeHistoryResponse,
} from '../../shared/ipc-contracts/audit.js';

export async function getAuditVerifyStatus(): Promise<AuditVerifyStatusResponse> {
  return window.opentreasury.audit.verifyStatus();
}

export async function listSignedEntries(
  req: AuditListSignedRequest = {},
): Promise<AuditListSignedResponse> {
  return window.opentreasury.audit.listSigned(req);
}

export async function listChangeHistory(
  req: AuditListChangeHistoryRequest = {},
): Promise<AuditListChangeHistoryResponse> {
  return window.opentreasury.audit.listChangeHistory(req);
}
