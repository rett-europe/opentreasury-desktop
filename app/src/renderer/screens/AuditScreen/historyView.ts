// SPEC-028 §4.3 (WI-7 + WI-8) — pure view helpers for the enriched change-history
// lane: renderer-composed localized summaries (FR18) and bulk-group collapsing by
// correlationId (FR23). Kept side-effect-free and free of React/i18n imports so
// they can be unit-tested directly (summary copy in es + en, grouping + "M of N").

import type { TFunction } from 'i18next';
import type { ChangeHistoryDetail, ChangeHistoryRow } from '../../../shared/ipc-contracts/audit.js';

type TFn = TFunction<'common'>;

/** Minimal currency formatter surface (satisfied by `useFormatters`). */
export interface SummaryFormatters {
  readonly formatCurrency: (amount: number, currency?: string) => string;
}

/**
 * Compose the localized one-line `{categoría}/{subcategoría}` path for a
 * transaction detail, falling back to the raw id, then to "uncategorized".
 */
export function composeCategoryPath(detail: ChangeHistoryDetail, t: TFn): string {
  if (detail.summaryKind !== 'tx.created' && detail.summaryKind !== 'tx.updated') {
    return t('audit.summary.noCategory');
  }
  const cat = detail.categoryLabel ?? detail.categoryId;
  if (cat === null) return t('audit.summary.noCategory');
  const sub = detail.subcategoryLabel ?? detail.subcategoryId;
  return sub !== null ? `${cat}/${sub}` : cat;
}

/**
 * SPEC-028 FR18 / AC19 — compose the localized one-line summary that REPLACES the
 * bare action label. Tier-1 only (snapshot/result state; no before→after diff).
 * The collapsed summary carries amount + description + category (OQ10); the fuller
 * field set is disclosed on expand (Option B privacy gate). Rows without usable
 * detail (`tx.deleted`, config, flat, or a malformed snapshot) fall back to the
 * localized action label, honouring §3.4 — never fabricating financial detail.
 */
export function composeSummary(row: ChangeHistoryRow, fmt: SummaryFormatters, t: TFn): string {
  const detail = row.detail;
  if (detail === undefined) {
    return t(`audit.actions.${row.action}`, { defaultValue: row.action });
  }
  switch (detail.summaryKind) {
    case 'tx.created':
      return t('audit.summary.created', {
        amount: fmt.formatCurrency(detail.amount),
        description: detail.description,
        category: composeCategoryPath(detail, t),
      });
    case 'tx.updated':
      return t('audit.summary.updated', {
        amount: fmt.formatCurrency(detail.amount),
        description: detail.description,
        category: composeCategoryPath(detail, t),
      });
    case 'tx.deleted':
      return t('audit.summary.deleted');
    case 'config':
    case 'flat':
    default:
      return t(`audit.actions.${row.action}`, { defaultValue: row.action });
  }
}

/** Whether a row carries an expandable financial breakdown (FR19/FR20). */
export function hasExpandableDetail(row: ChangeHistoryRow): boolean {
  return (
    row.detail !== undefined &&
    (row.detail.summaryKind === 'tx.created' || row.detail.summaryKind === 'tx.updated')
  );
}

export interface HistorySingleItem {
  readonly kind: 'single';
  readonly row: ChangeHistoryRow;
}

export interface HistoryGroupItem {
  readonly kind: 'group';
  readonly groupId: string;
  /** Total members N over the FULL event set (from the view-model `groupSize`). */
  readonly groupSize: number;
  /** Members present after display filtering (M). `members.length === M`. */
  readonly members: readonly ChangeHistoryRow[];
  /** Representative (newest) member — drives the group row's date/actor/device. */
  readonly representative: ChangeHistoryRow;
}

export type HistoryDisplayItem = HistorySingleItem | HistoryGroupItem;

/**
 * SPEC-028 FR23 / AC23 — collapse `correlationId` bulk-update members (rows whose
 * view-model `groupId`/`groupSize` mark a multi-member group) into a single
 * expandable group item, preserving the newest-first order of the incoming rows.
 * Non-grouped rows pass through as single items. The incoming rows are already
 * display-filtered in main, so `members.length` is M and `groupSize` is N.
 */
export function groupHistoryRows(rows: readonly ChangeHistoryRow[]): HistoryDisplayItem[] {
  const items: HistoryDisplayItem[] = [];
  const byGroup = new Map<string, HistoryGroupItem>();

  for (const row of rows) {
    const groupId = row.groupId ?? null;
    const groupSize = row.groupSize ?? null;
    if (groupId !== null && groupSize !== null && groupSize > 1) {
      const existing = byGroup.get(groupId);
      if (existing === undefined) {
        const group: HistoryGroupItem = {
          kind: 'group',
          groupId,
          groupSize,
          members: [row],
          representative: row,
        };
        byGroup.set(groupId, group);
        items.push(group);
      } else {
        (existing.members as ChangeHistoryRow[]).push(row);
      }
    } else {
      items.push({ kind: 'single', row });
    }
  }

  return items;
}
