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
    row.currency,
    row.labels,
    row.reference,
    row.comment,
    row.id,
    row.isSplit ? 'true' : 'false',
    row.parentId,
  ];
}
