// SPEC-030 — Default file name for the generated report PDF.
//
// Used only as the SUGGESTED name in the OS save dialog (the user can rename).
// Pure + ASCII-safe so it is a valid file name on every platform.

import type { ReportLocaleCode, ReportPeriodKind } from '../../shared/ipc-contracts/report.js';
import { reportCopy } from './copy.js';

/** Collapse to a filesystem-safe ASCII slug (no spaces, accents, or separators). */
function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '') // strip combining diacritics
    .replace(/[^A-Za-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .replace(/-{2,}/gu, '-');
}

export interface ReportFilenameInput {
  readonly periodKind: ReportPeriodKind;
  readonly periodStart: string; // YYYY-MM-DD
  readonly periodEnd: string; // YYYY-MM-DD
  readonly locale: ReportLocaleCode;
}

export function buildDefaultReportFilename(input: ReportFilenameInput): string {
  const base = slugify(reportCopy(input.locale).titlePrefix) || 'report';
  if (input.periodKind === 'calendar-year') {
    const year = input.periodStart.slice(0, 4);
    return `${base}-${year}.pdf`;
  }
  return `${base}-${input.periodStart}_${input.periodEnd}.pdf`;
}
