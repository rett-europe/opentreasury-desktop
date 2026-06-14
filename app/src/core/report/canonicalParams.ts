// SPEC-030 §6.1 — Canonical report parameters + `after_hash` provenance.
//
// The `report.generate` audit entry's `after_hash` is computed over a
// canonical-JSON description of the report PARAMETERS (period, account scope,
// grouping, format) — NEVER the rendered PDF bytes and never raw transaction
// data. This binds the signed audit entry to exactly what was requested without
// recording any aggregate figures or PII.
//
// The same canonical object binds the one-shot confirmation token to its build
// params (reportGate), so `report:generate` is guaranteed to reproduce the same
// report the user previewed in `report:build`.

import { canonicalHashHex } from '../crypto/hash.js';
import type {
  ReportFormat,
  ReportGrouping,
  ReportPeriodKind,
} from '../../shared/ipc-contracts/report.js';

export interface CanonicalReportParams {
  readonly format: ReportFormat;
  readonly periodKind: ReportPeriodKind;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly accountIds: string[];
  readonly grouping: ReportGrouping;
}

export interface ReportParamsInput {
  readonly periodKind: ReportPeriodKind;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly accountIds?: readonly string[];
  readonly grouping: ReportGrouping;
}

function sortedCopy(values: readonly string[] | undefined): string[] {
  return [...(values ?? [])].sort();
}

export function buildCanonicalReportParams(
  format: ReportFormat,
  params: ReportParamsInput,
): CanonicalReportParams {
  return {
    format,
    periodKind: params.periodKind,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    accountIds: sortedCopy(params.accountIds),
    grouping: params.grouping,
  };
}

/** BLAKE2b-256 hex over the canonical-JSON of the report parameter set. */
export function computeReportAfterHash(format: ReportFormat, params: ReportParamsInput): string {
  return canonicalHashHex(buildCanonicalReportParams(format, params));
}
