// @vitest-environment node
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

describe('REP-1 i18n parity (SPEC-030)', () => {
  it('exposes the Reports nav label in both locales', () => {
    expect(get(es, 'shell.nav.reports')).toBeTruthy();
    expect(get(en, 'shell.nav.reports')).toBeTruthy();
  });

  it('has a `report` block with identical key paths in es and en', () => {
    const esKeys = leafKeys((es as Dict).report).sort();
    const enKeys = leafKeys((en as Dict).report).sort();
    expect(esKeys.length).toBeGreaterThan(0);
    expect(esKeys).toEqual(enKeys);
  });

  it('maps every report error code surfaced by the screen', () => {
    const codes = [
      'REPORT_NO_WORKSPACE',
      'REPORT_TOKEN_INVALID',
      'REPORT_DEST_INSIDE_WORKSPACE',
      'REPORT_DEST_TEMP_DIR',
      'REPORT_RECONCILE_MISMATCH',
      'REPORT_AUDIT_FAILED',
      'REPORT_RENDER_FAILED',
      'REPORT_WRITE_FAILED',
      'REPORT_INTERNAL',
    ];
    for (const code of codes) {
      expect(get(es, `report.errors.${code}`)).toBeTruthy();
      expect(get(en, `report.errors.${code}`)).toBeTruthy();
    }
  });
});
