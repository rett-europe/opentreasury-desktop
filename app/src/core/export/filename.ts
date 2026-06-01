// SPEC-027 FR12 — Locale-aware default export filename.
//
// Produces a basename only (no directory). The user may freely rename in the OS
// save dialog. OS-illegal characters are stripped and the stem is truncated to
// a safe length.

import { formatExportDate, type DateFormat } from '../../shared/format/index.js';
import type { ExportFilters, ExportFormat } from '../../shared/ipc-contracts/export.js';
import type { ExportLocale } from './types.js';

const MAX_STEM_LENGTH = 120;
// Windows-reserved + control characters.
// eslint-disable-next-line no-control-regex -- intentionally strip C0 control chars from filenames
const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/gu;

function sanitizeStem(stem: string): string {
  const cleaned = stem.replace(ILLEGAL, '').replace(/\s+/gu, ' ').trim();
  const collapsed = cleaned.length > 0 ? cleaned : 'OpenTreasury-Export';
  return collapsed.length > MAX_STEM_LENGTH ? collapsed.slice(0, MAX_STEM_LENGTH) : collapsed;
}

export function buildExportFilename(
  locale: ExportLocale,
  format: ExportFormat,
  filters: ExportFilters,
  dateFormat: DateFormat,
): string {
  const isEs = locale === 'es';
  const prefix = isEs ? 'OpenTreasury-Movimientos' : 'OpenTreasury-Movements';
  const from = formatExportDate(filters.dateFrom, dateFormat).replaceAll('/', '-');
  const to = formatExportDate(filters.dateTo, dateFormat).replaceAll('/', '-');
  const range = `${from}_${to}`;

  const segments: string[] = [];
  if ((filters.accountIds?.length ?? 0) > 0) {
    segments.push(`-${isEs ? 'cuenta' : 'account'}-${filters.accountIds!.length}`);
  }
  if ((filters.categoryIds?.length ?? 0) > 0) {
    segments.push(`-cat-${filters.categoryIds!.length}`);
  }
  if ((filters.subcategoryIds?.length ?? 0) > 0) {
    segments.push(`-${isEs ? 'subcat' : 'subcat'}-${filters.subcategoryIds!.length}`);
  }
  if ((filters.labels?.length ?? 0) > 0) {
    segments.push(`-${isEs ? 'etiqueta' : 'label'}-${filters.labels!.length}`);
  }

  const stem = sanitizeStem(`${prefix}-${range}${segments.join('')}`);
  return `${stem}.${format}`;
}
