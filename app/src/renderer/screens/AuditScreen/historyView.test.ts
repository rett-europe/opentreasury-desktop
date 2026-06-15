// SPEC-028 §4.3 (WI-7 + WI-8) — pure view-helper tests: localized summary
// composition (es + en), category-path formatting, expandable-detail gating, and
// correlationId bulk grouping with the "M of N" member counts.

import { describe, it, expect } from 'vitest';
import { i18n } from '../../i18n/index.js';
import type { ChangeHistoryRow } from '../../../shared/ipc-contracts/audit.js';
import {
  composeSummary,
  composeCategoryPath,
  hasExpandableDetail,
  groupHistoryRows,
  type SummaryFormatters,
} from './historyView.js';

const tEs = i18n.getFixedT('es', 'common');
const tEn = i18n.getFixedT('en', 'common');

// Deterministic, locale-agnostic stub so assertions don't depend on Intl output.
const fmt: SummaryFormatters = { formatCurrency: (n) => `€${n.toFixed(2)}` };

const ULID_A = '01HZZZZZZZZZZZZZZZZZZZZZZA';
const ULID_B = '01HZZZZZZZZZZZZZZZZZZZZZZB';
const ULID_C = '01HZZZZZZZZZZZZZZZZZZZZZZC';

function row(over: Partial<ChangeHistoryRow> = {}): ChangeHistoryRow {
  return {
    lane: 'history',
    eventId: ULID_A,
    occurredAt: '2026-02-12T10:00:00.000Z',
    action: 'tx.created',
    actor: { kind: 'known', userId: ULID_A },
    device: { kind: 'known', deviceId: ULID_A },
    accountId: ULID_A,
    accountLabel: 'Main account',
    groupId: null,
    groupSize: null,
    ...over,
  };
}

const createdDetail = {
  summaryKind: 'tx.created' as const,
  amount: 150,
  currency: 'EUR' as const,
  txType: 'expense' as const,
  description: 'Office supplies',
  categoryId: ULID_B,
  categoryLabel: 'Operations',
  subcategoryId: ULID_C,
  subcategoryLabel: 'Stationery',
  tagIds: [],
  tagLabels: [],
  status: 'pending' as const,
  reference: null,
};

describe('composeSummary', () => {
  it('composes a tx.created summary in English (amount + description + category)', () => {
    const s = composeSummary(row({ detail: createdDetail }), fmt, tEn);
    expect(s).toBe("Created · €150.00 · 'Office supplies' · Operations/Stationery");
  });

  it('composes a tx.created summary in Spanish (reactive locale)', () => {
    const s = composeSummary(row({ detail: createdDetail }), fmt, tEs);
    expect(s).toBe("Creado · €150.00 · 'Office supplies' · Operations/Stationery");
  });

  it('composes a tx.updated summary localized per language', () => {
    const detail = { ...createdDetail, summaryKind: 'tx.updated' as const };
    expect(composeSummary(row({ action: 'tx.updated', detail }), fmt, tEn)).toContain('Updated');
    expect(composeSummary(row({ action: 'tx.updated', detail }), fmt, tEs)).toContain(
      'Actualizado',
    );
  });

  it('renders tx.deleted as a localized label only (no fabricated detail)', () => {
    const r = row({ action: 'tx.deleted', detail: { summaryKind: 'tx.deleted' } });
    expect(composeSummary(r, fmt, tEn)).toBe('Transaction deleted');
    expect(composeSummary(r, fmt, tEs)).toBe('Transacción eliminada');
  });

  it('falls back to the action label when there is no detail', () => {
    const r = row({ action: 'movement.imported', detail: undefined });
    expect(composeSummary(r, fmt, tEn)).toBe(
      tEn('audit.actions.movement.imported', { defaultValue: 'movement.imported' }),
    );
  });

  it('falls back to the action label for config / flat label-only detail', () => {
    const r = row({ action: 'AccountUpdated', detail: { summaryKind: 'config' } });
    expect(composeSummary(r, fmt, tEn)).toBe(
      tEn('audit.actions.AccountUpdated', { defaultValue: 'AccountUpdated' }),
    );
  });
});

describe('composeCategoryPath', () => {
  it('joins category/subcategory labels', () => {
    expect(composeCategoryPath(createdDetail, tEn)).toBe('Operations/Stationery');
  });

  it('shows the category alone when no subcategory', () => {
    expect(
      composeCategoryPath({ ...createdDetail, subcategoryId: null, subcategoryLabel: null }, tEn),
    ).toBe('Operations');
  });

  it('falls back to the raw id when the label is unresolved', () => {
    expect(
      composeCategoryPath(
        { ...createdDetail, categoryLabel: null, subcategoryId: null, subcategoryLabel: null },
        tEn,
      ),
    ).toBe(ULID_B);
  });

  it('returns the localized "uncategorized" when there is no category', () => {
    const d = { ...createdDetail, categoryId: null, categoryLabel: null };
    expect(composeCategoryPath(d, tEn)).toBe('Uncategorized');
    expect(composeCategoryPath(d, tEs)).toBe('Sin categoría');
  });

  it('returns "uncategorized" for label-only detail kinds', () => {
    expect(composeCategoryPath({ summaryKind: 'config' }, tEn)).toBe('Uncategorized');
  });
});

describe('hasExpandableDetail', () => {
  it('is true only for tx.created / tx.updated detail', () => {
    expect(hasExpandableDetail(row({ detail: createdDetail }))).toBe(true);
    expect(
      hasExpandableDetail(row({ detail: { ...createdDetail, summaryKind: 'tx.updated' } })),
    ).toBe(true);
  });

  it('is false for tx.deleted / config / flat / no detail', () => {
    expect(hasExpandableDetail(row({ detail: { summaryKind: 'tx.deleted' } }))).toBe(false);
    expect(hasExpandableDetail(row({ detail: { summaryKind: 'config' } }))).toBe(false);
    expect(hasExpandableDetail(row({ detail: { summaryKind: 'flat' } }))).toBe(false);
    expect(hasExpandableDetail(row({ detail: undefined }))).toBe(false);
  });
});

describe('groupHistoryRows', () => {
  it('passes single (non-grouped) rows through as single items in order', () => {
    const items = groupHistoryRows([row({ eventId: ULID_A }), row({ eventId: ULID_B })]);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.kind === 'single')).toBe(true);
  });

  it('treats a single-member correlationId (groupSize 1) as an ordinary row', () => {
    const items = groupHistoryRows([row({ groupId: ULID_C, groupSize: 1 })]);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('single');
  });

  it('collapses multi-member correlationId rows into one group (M of N)', () => {
    // N = 3 total members; only M = 2 survived display filtering.
    const items = groupHistoryRows([
      row({ eventId: ULID_A, groupId: ULID_C, groupSize: 3 }),
      row({ eventId: ULID_B, groupId: ULID_C, groupSize: 3 }),
    ]);
    expect(items).toHaveLength(1);
    const group = items[0];
    expect(group.kind).toBe('group');
    if (group.kind !== 'group') throw new Error('expected group');
    expect(group.groupId).toBe(ULID_C);
    expect(group.groupSize).toBe(3); // N (full set, pre-filter)
    expect(group.members).toHaveLength(2); // M (filtered)
    expect(group.representative.eventId).toBe(ULID_A); // newest-first preserved
  });

  it('keeps distinct correlationIds in separate groups and preserves arrival order', () => {
    const items = groupHistoryRows([
      row({ eventId: ULID_A, groupId: 'GA', groupSize: 2 }),
      row({ eventId: ULID_B, groupId: 'GB', groupSize: 2 }),
      row({ eventId: ULID_C, groupId: 'GA', groupSize: 2 }),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0].kind === 'group' && items[0].groupId).toBe('GA');
    expect(items[1].kind === 'group' && items[1].groupId).toBe('GB');
    if (items[0].kind === 'group') expect(items[0].members).toHaveLength(2);
  });
});
