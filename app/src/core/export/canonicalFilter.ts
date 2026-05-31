// SPEC-027 §6.1 — Canonical filter JSON + `after_hash` provenance.
//
// The audit entry's `after_hash` is computed over a canonical-JSON description
// of the FILTER SET (never the file contents, never raw label values). Label
// values are hashed individually so the audit chain is tamper-evident without
// recording PII.

import { blake2b256HexUtf8, canonicalHashHex } from '../crypto/hash.js';
import type { ExportFilters, ExportFormat } from '../../shared/ipc-contracts/export.js';

export interface CanonicalFilter {
  readonly format: ExportFormat;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly accountIds: string[];
  readonly categoryIds: string[];
  readonly subcategoryIds: string[];
  readonly labelHashes: string[];
}

function sortedCopy(values: readonly string[] | undefined): string[] {
  return [...(values ?? [])].sort();
}

/** BLAKE2b-256 hex of each label's UTF-8 value, sorted ascending. */
function hashedLabels(labels: readonly string[] | undefined): string[] {
  return [...(labels ?? [])].map((l) => blake2b256HexUtf8(l)).sort();
}

export function buildCanonicalFilter(
  format: ExportFormat,
  filters: ExportFilters,
): CanonicalFilter {
  return {
    format,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    accountIds: sortedCopy(filters.accountIds),
    categoryIds: sortedCopy(filters.categoryIds),
    subcategoryIds: sortedCopy(filters.subcategoryIds),
    labelHashes: hashedLabels(filters.labels),
  };
}

/** BLAKE2b-256 hex over the canonical-JSON of the filter set. */
export function computeAfterHash(format: ExportFormat, filters: ExportFilters): string {
  return canonicalHashHex(buildCanonicalFilter(format, filters));
}
