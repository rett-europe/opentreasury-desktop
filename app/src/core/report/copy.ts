// SPEC-030 — Localized copy for the Financial Report body (ES primary, EN
// pilot-ready). Kept in `core/report` (report-owned, deterministic) rather than
// the renderer i18n bundle because the PDF template is rendered in MAIN and must
// be self-contained; the same strings drive the renderer preview model.
//
// Pure + dependency-free.

import type { ReportLocaleCode } from '../../shared/ipc-contracts/report.js';

export interface ReportCopy {
  /** Title prefix, e.g. "Informe financiero" / "Financial Report". */
  readonly titlePrefix: string;
  readonly creditsCaption: string;
  readonly debitsCaption: string;
  readonly reconciliationCaption: string;
  readonly totalLabel: string;
  readonly unclassified: string;
  readonly allAccounts: string;
  readonly generatedPrefix: string;
  readonly openingLabelPrefix: string; // "Balance of account" → "Saldo a"
  readonly closingLabelPrefix: string;
  readonly creditsLineLabel: string; // reconciliation "Credits {year}"
  readonly debitsLineLabel: string;
  /** Reconciliation line for net movement between the org's own accounts. */
  readonly internalTransfersLineLabel: string;
  readonly periodConnector: string; // " – "
  readonly pageLabel: (n: number, m: number) => string;
  readonly signatureTreasurer: string;
  readonly signatureAuditor: string;
  /** Three-letter month abbreviations, index 0 = January. */
  readonly months: readonly string[];
}

const ES: ReportCopy = {
  titlePrefix: 'Informe financiero',
  creditsCaption: 'INGRESOS',
  debitsCaption: 'GASTOS',
  reconciliationCaption: 'CONCILIACIÓN',
  totalLabel: 'TOTAL',
  unclassified: 'Sin clasificar',
  allAccounts: 'Todas las cuentas',
  generatedPrefix: 'Generado',
  openingLabelPrefix: 'Saldo de la cuenta',
  closingLabelPrefix: 'Saldo de la cuenta',
  creditsLineLabel: 'Ingresos',
  debitsLineLabel: 'Gastos',
  internalTransfersLineLabel: 'Traspasos entre cuentas propias (neto)',
  periodConnector: ' – ',
  pageLabel: (n, m) => `Página ${n} de ${m}`,
  signatureTreasurer: 'Tesorero/a',
  signatureAuditor: 'Auditor/a interno/a',
  months: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
};

const EN: ReportCopy = {
  titlePrefix: 'Financial Report',
  creditsCaption: 'CREDITS',
  debitsCaption: 'DEBITS',
  reconciliationCaption: 'RECONCILIATION',
  totalLabel: 'TOTAL',
  unclassified: 'Unclassified',
  allAccounts: 'All accounts',
  generatedPrefix: 'Generated',
  openingLabelPrefix: 'Balance of account',
  closingLabelPrefix: 'Balance of account',
  creditsLineLabel: 'Credits',
  debitsLineLabel: 'Debits',
  internalTransfersLineLabel: 'Transfers between own accounts (net)',
  periodConnector: ' – ',
  pageLabel: (n, m) => `Page ${n} of ${m}`,
  signatureTreasurer: 'Treasurer',
  signatureAuditor: 'Internal auditor',
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

export function reportCopy(locale: ReportLocaleCode): ReportCopy {
  return locale === 'es' ? ES : EN;
}

/** Format a `YYYY-MM-DD` ISO date as "1 Jan 2024" / "1 ene 2024" (UTC-safe). */
export function formatReportDate(iso: string, locale: ReportLocaleCode): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(iso);
  if (!m) return iso;
  const year = m[1];
  const monthIdx = Number(m[2]) - 1;
  const day = Number(m[3]);
  const months = reportCopy(locale).months;
  const month = months[monthIdx] ?? m[2];
  return `${day} ${month} ${year}`;
}

/** "1 ene 2024 – 31 dic 2024" for any range; the year-or-range subtitle line. */
export function formatPeriodLabel(start: string, end: string, locale: ReportLocaleCode): string {
  const c = reportCopy(locale);
  return `${formatReportDate(start, locale)}${c.periodConnector}${formatReportDate(end, locale)}`;
}
