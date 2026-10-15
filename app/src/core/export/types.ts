// SPEC-027 — Export row model + column metadata (FR11).
//
// An ExportRow is the locale-independent, fully-resolved representation of one
// exported line (a parent transaction with no splits, OR a single split child).
// Column ORDER and header labels (ES/EN) live here so the CSV and XLSX writers
// stay format-only.

export type ExportLocale = 'es' | 'en';

/** v1 hard cap — checked AFTER split expansion (FR9). */
export const MAX_EXPORT_ROWS = 100_000;

export interface ExportRow {
  readonly date: string; // YYYY-MM-DD
  readonly account: string;
  readonly category: string; // blank if uncategorised
  readonly subcategory: string; // blank if none
  readonly description: string;
  /** Signed decimal euros (negative = expense). Number — writers format it. */
  readonly amount: number;
  /**
   * SPEC-027 §15 — running balance of the row's account immediately AFTER this
   * row, in decimal euros. Computed from the account's opening balance plus
   * EVERY movement of that account (filters never change it).
   */
  readonly balance: number;
  readonly currency: string; // ISO-4217, currently always EUR
  readonly labels: string; // semicolon-separated tag names
  readonly reference: string; // blank if none
  readonly comment: string; // tx.details (parent) / split.comment (child)
  readonly id: string; // the row's own ULID
  readonly isSplit: boolean;
  readonly parentId: string; // parent ULID when isSplit, else blank
}

/** Ordered column keys (FR11 order). */
export const EXPORT_COLUMN_KEYS = [
  'date',
  'account',
  'category',
  'subcategory',
  'description',
  'amount',
  'balance',
  'currency',
  'labels',
  'reference',
  'comment',
  'id',
  'isSplit',
  'parentId',
] as const;

export type ExportColumnKey = (typeof EXPORT_COLUMN_KEYS)[number];

const HEADERS_ES: Record<ExportColumnKey, string> = {
  date: 'Fecha',
  account: 'Cuenta',
  category: 'Categoría',
  subcategory: 'Subcategoría',
  description: 'Descripción',
  amount: 'Importe',
  balance: 'Saldo',
  currency: 'Moneda',
  labels: 'Etiquetas',
  reference: 'Referencia',
  comment: 'Comentario',
  id: 'ID',
  isSplit: 'EsSplit',
  parentId: 'IDPadre',
};

const HEADERS_EN: Record<ExportColumnKey, string> = {
  date: 'Date',
  account: 'Account',
  category: 'Category',
  subcategory: 'Subcategory',
  description: 'Description',
  amount: 'Amount',
  balance: 'Balance',
  currency: 'Currency',
  labels: 'Labels',
  reference: 'Reference',
  comment: 'Comment',
  id: 'Id',
  isSplit: 'IsSplit',
  parentId: 'ParentId',
};

export function exportHeaders(locale: ExportLocale): string[] {
  const map = locale === 'es' ? HEADERS_ES : HEADERS_EN;
  return EXPORT_COLUMN_KEYS.map((k) => map[k]);
}

/** Format the amount as a locale-independent dot-decimal string (2 dp). */
export function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

/**
 * Project a row to ordered string cells (used by the CSV writer; XLSX keeps
 * `amount` numeric and uses this for the other columns).
 */
export function exportRowCells(row: ExportRow): string[] {
  return [
    row.date,
    row.account,
    row.category,
    row.subcategory,
    row.description,
    formatAmount(row.amount),
    formatAmount(row.balance),
    row.currency,
    row.labels,
    row.reference,
    row.comment,
    row.id,
    row.isSplit ? 'true' : 'false',
    row.parentId,
  ];
}

// ---------------------------------------------------------------------------
// SPEC-027 §15 — Per-account balance summary (XLSX `Saldos` sheet).
//
// One line per exported account so the person exporting can tie the closing
// balance out against the bank statement. A mismatch means movements are
// missing (or the account's opening balance is wrong). Figures cover ALL of the
// account's movements in the date range, independent of category/label filters,
// so `closing = opening + moneyIn − moneyOut` always holds.
// ---------------------------------------------------------------------------

export interface AccountBalanceSummary {
  readonly account: string;
  /** Balance at the start of `dateFrom` (decimal euros). */
  readonly opening: number;
  /** Money in during the range (positive decimal euros). */
  readonly moneyIn: number;
  /** Money out during the range (positive decimal euros). */
  readonly moneyOut: number;
  /** Balance at the end of `dateTo` (decimal euros). */
  readonly closing: number;
  /** Movements of the account in the range (parent transactions, all filters ignored). */
  readonly movementCount: number;
}

export const BALANCE_SUMMARY_COLUMN_KEYS = [
  'account',
  'opening',
  'moneyIn',
  'moneyOut',
  'closing',
  'movementCount',
] as const;

export type BalanceSummaryColumnKey = (typeof BALANCE_SUMMARY_COLUMN_KEYS)[number];

const SUMMARY_HEADERS_ES: Record<BalanceSummaryColumnKey, string> = {
  account: 'Cuenta',
  opening: 'Saldo inicial',
  moneyIn: 'Entradas',
  moneyOut: 'Salidas',
  closing: 'Saldo final',
  movementCount: 'Movimientos',
};

const SUMMARY_HEADERS_EN: Record<BalanceSummaryColumnKey, string> = {
  account: 'Account',
  opening: 'Opening balance',
  moneyIn: 'Money in',
  moneyOut: 'Money out',
  closing: 'Closing balance',
  movementCount: 'Movements',
};

export function balanceSummaryHeaders(locale: ExportLocale): string[] {
  const map = locale === 'es' ? SUMMARY_HEADERS_ES : SUMMARY_HEADERS_EN;
  return BALANCE_SUMMARY_COLUMN_KEYS.map((k) => map[k]);
}

/** Explanatory note written under the summary table (plain text). */
export function balanceSummaryNote(
  locale: ExportLocale,
  dateFrom: string,
  dateTo: string,
): readonly string[] {
  return locale === 'es'
    ? [
        `Saldos del ${dateFrom} al ${dateTo}, calculados con todos los movimientos de cada cuenta (sin aplicar filtros de categoría o etiqueta).`,
        'Compare el saldo final con el extracto bancario. Si no coincide, faltan movimientos o el saldo inicial de la cuenta es incorrecto.',
      ]
    : [
        `Balances from ${dateFrom} to ${dateTo}, computed from every movement of each account (category/label filters are not applied).`,
        'Compare the closing balance with the bank statement. If it does not match, movements are missing or the account opening balance is wrong.',
      ];
}
