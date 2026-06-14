// SPEC-030 — Pure assembler: WI-1 query outputs + WI-4 org profile → ReportModel.
//
// This is the single place the aggregate-only `ReportModel` (what crosses IPC
// for preview AND is re-derived in main for the PDF) is composed. It is PURE —
// no fs, no electron, no singletons — so it is unit-tested against fixtures and
// guarantees the preview and the printed PDF are byte-identical in content.
//
// All report math comes from the WI-1 queries (passed in) — this module never
// re-sums transactions.

import type {
  CategoryBreakdown,
  CategoryBreakdownRow,
  RangeReconciliation,
} from '../query/queries.js';
import type { OrgProfileViewModel } from '../../shared/ipc-contracts/org-profile.js';
import type {
  ReportGrouping,
  ReportLineItem,
  ReportLocaleCode,
  ReportModel,
  ReportPeriodKind,
  ReportTable,
} from '../../shared/ipc-contracts/report.js';
import { reportCopy, formatPeriodLabel, formatReportDate } from './copy.js';

export interface AssembleReportInput {
  readonly breakdown: CategoryBreakdown;
  readonly reconciliation: RangeReconciliation;
  readonly org: OrgProfileViewModel;
  /** Logo inlined as a data: URL by main (never an on-disk path crosses IPC). */
  readonly logoDataUrl: string | null;
  readonly periodKind: ReportPeriodKind;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly grouping: ReportGrouping;
  readonly locale: ReportLocaleCode;
  /** Resolved account name when scoped to one account; null/undefined = all. */
  readonly scopeAccountName?: string | null;
  /** Generation date `YYYY-MM-DD` (caller supplies; keeps this pure). */
  readonly generatedAtIso: string;
}

function rowsToLineItems(
  rows: readonly CategoryBreakdownRow[],
  unclassified: string,
): ReportLineItem[] {
  return rows.map((row) => {
    const item: ReportLineItem = {
      label: row.label ?? unclassified,
      amount: row.total,
    };
    if (row.subRows && row.subRows.length > 0) {
      return {
        ...item,
        subRows: row.subRows.map((sub) => ({
          label: sub.label ?? unclassified,
          amount: sub.total,
        })),
      };
    }
    return item;
  });
}

export function assembleReportModel(input: AssembleReportInput): ReportModel {
  const copy = reportCopy(input.locale);

  const year = input.periodKind === 'calendar-year' ? Number(input.periodStart.slice(0, 4)) : null;

  const title =
    input.periodKind === 'calendar-year' && year !== null
      ? `${copy.titlePrefix} ${year}`
      : copy.titlePrefix;

  const credits: ReportTable = {
    rows: rowsToLineItems(input.breakdown.income, copy.unclassified),
    // Tie the TOTAL to the reconciliation figure (FR20) rather than re-summing.
    total: input.reconciliation.credits,
  };
  const debits: ReportTable = {
    rows: rowsToLineItems(input.breakdown.expense, copy.unclassified),
    total: input.reconciliation.debits,
  };

  return {
    locale: input.locale,
    grouping: input.grouping,
    header: {
      orgName: input.org.orgName,
      legalRegistrationLine: input.org.legalRegistrationLine,
      address: input.org.address,
      contactEmail: input.org.contactEmail,
      logoDataUrl: input.logoDataUrl,
      title,
      periodLabel: formatPeriodLabel(input.periodStart, input.periodEnd, input.locale),
      generatedLabel: `${copy.generatedPrefix} ${formatReportDate(
        input.generatedAtIso,
        input.locale,
      )}`,
    },
    scopeLabel: input.scopeAccountName ?? copy.allAccounts,
    credits,
    debits,
    reconciliation: {
      opening: input.reconciliation.opening,
      credits: input.reconciliation.credits,
      debits: input.reconciliation.debits,
      closing: input.reconciliation.closing,
    },
    period: {
      kind: input.periodKind,
      start: input.periodStart,
      end: input.periodEnd,
      year,
    },
    signatures: {
      treasurer: {
        name: input.org.treasurer.name,
        role: input.org.treasurer.role,
        place: input.org.treasurer.place,
      },
      auditor: {
        name: input.org.auditor.name,
        role: input.org.auditor.role,
        place: input.org.auditor.place,
      },
    },
  };
}
