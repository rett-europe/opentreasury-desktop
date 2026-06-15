// @vitest-environment node
// SPEC-028 §4.3 — i18n parity for the enriched change-history viewer strings.
import { describe, expect, it } from 'vitest';
import es from '../../locales/es/common.json';
import en from '../../locales/en/common.json';

// Collect the set of leaf key-paths under an object subtree.
function leafKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    leafKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}

type Dict = Record<string, unknown>;
const get = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, k) => (acc as Dict | undefined)?.[k], obj);

describe('SPEC-028 audit i18n parity', () => {
  it('has an `audit` block with identical key paths in es and en', () => {
    const esKeys = leafKeys((es as Dict).audit).sort();
    const enKeys = leafKeys((en as Dict).audit).sort();
    expect(esKeys.length).toBeGreaterThan(0);
    expect(esKeys).toEqual(enKeys);
  });

  it('defines every enriched-detail summary string in both locales (WI-7)', () => {
    const keys = [
      'audit.summary.created',
      'audit.summary.updated',
      'audit.summary.deleted',
      'audit.summary.noCategory',
      'audit.summary.showDetail',
      'audit.summary.hideDetail',
    ];
    for (const key of keys) {
      expect(get(es, key)).toBeTruthy();
      expect(get(en, key)).toBeTruthy();
    }
  });

  it('defines the bulk-group header (plural) + "M of N" strings in both locales (WI-8)', () => {
    const keys = [
      'audit.summary.bulkGroup_one',
      'audit.summary.bulkGroup_other',
      'audit.summary.bulkGroupFiltered',
    ];
    for (const key of keys) {
      expect(get(es, key)).toBeTruthy();
      expect(get(en, key)).toBeTruthy();
    }
  });

  it('defines every expandable financial-detail label in both locales (WI-10 / FR19)', () => {
    const keys = [
      'audit.detail.amount',
      'audit.detail.type',
      'audit.detail.typeIncome',
      'audit.detail.typeExpense',
      'audit.detail.description',
      'audit.detail.category',
      'audit.detail.subcategory',
      'audit.detail.tags',
      'audit.detail.status',
      'audit.detail.statusPending',
      'audit.detail.statusApproved',
      'audit.detail.reference',
      'audit.detail.none',
    ];
    for (const key of keys) {
      expect(get(es, key)).toBeTruthy();
      expect(get(en, key)).toBeTruthy();
    }
  });
});
