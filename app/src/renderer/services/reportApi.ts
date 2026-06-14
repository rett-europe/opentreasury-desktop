// Report API client — thin wrapper over window.opentreasury.report.*
// SPEC-030 (WI-2 IPC, consumed by WI-3). The renderer never supplies a path
// and never computes totals: `build` returns an aggregate-only ReportModel +
// a one-shot confirmation token (TTL ≤ 60s); `generate` carries only that
// token and resolves to an outcome ('saved' | 'canceled' | 'error') — never a
// path string. Responses are validated with the shared Zod schemas so a
// malformed payload fails loudly at the boundary.

import {
  reportBuildRequestSchema,
  reportBuildResponseSchema,
  reportGenerateResponseSchema,
  type ReportBuildRequest,
  type ReportBuildResponse,
  type ReportGenerateResponse,
} from '../../shared/ipc-contracts/report.js';

/**
 * Build the aggregate-only report view-model for the on-screen preview and
 * mint a one-shot confirmation token. The request is validated client-side
 * (mirrors the main-process boundary) so an invalid period/scope is caught
 * before it crosses IPC.
 */
export async function buildReport(req: ReportBuildRequest): Promise<ReportBuildResponse> {
  const parsedReq = reportBuildRequestSchema.parse(req);
  const raw = await window.opentreasury.report.build(parsedReq);
  return reportBuildResponseSchema.parse(raw);
}

/**
 * Generate the PDF for a previously built report. Carries ONLY the opaque
 * confirmation token; the save destination is chosen by the OS dialog in main.
 */
export async function generateReport(confirmationToken: string): Promise<ReportGenerateResponse> {
  const raw = await window.opentreasury.report.generate({ confirmationToken });
  return reportGenerateResponseSchema.parse(raw);
}
