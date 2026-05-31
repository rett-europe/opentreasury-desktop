// SPEC-027 §6.1 — Canonical filter + after_hash provenance unit tests (Cypher).

import { describe, it, expect } from 'vitest';
import { buildCanonicalFilter, computeAfterHash } from './canonicalFilter.js';
import { blake2b256HexUtf8 } from '../crypto/hash.js';
import type { ExportFilters } from '../../shared/ipc-contracts/export.js';

const BASE: ExportFilters = {
  dateFrom: '2025-01-01',
  dateTo: '2025-12-31',
};

describe('buildCanonicalFilter', () => {
  it('hashes label values rather than recording them raw', () => {
    const canonical = buildCanonicalFilter('csv', { ...BASE, labels: ['Comida', 'Viajes'] });
    expect(canonical.labelHashes).toContain(blake2b256HexUtf8('Comida'));
    expect(canonical.labelHashes).toContain(blake2b256HexUtf8('Viajes'));
    // No raw label leaks into the canonical structure.
    expect(JSON.stringify(canonical)).not.toContain('Comida');
    expect(JSON.stringify(canonical)).not.toContain('Viajes');
  });

  it('sorts label hashes and id arrays for stable ordering', () => {
    const a = buildCanonicalFilter('csv', { ...BASE, labels: ['b', 'a'] });
    const b = buildCanonicalFilter('csv', { ...BASE, labels: ['a', 'b'] });
    expect(a.labelHashes).toEqual(b.labelHashes);
  });

  it('defaults absent facets to empty arrays', () => {
    const canonical = buildCanonicalFilter('xlsx', BASE);
    expect(canonical.accountIds).toEqual([]);
    expect(canonical.categoryIds).toEqual([]);
    expect(canonical.subcategoryIds).toEqual([]);
    expect(canonical.labelHashes).toEqual([]);
  });
});

describe('computeAfterHash', () => {
  it('is stable regardless of label input order', () => {
    const h1 = computeAfterHash('csv', { ...BASE, labels: ['x', 'y', 'z'] });
    const h2 = computeAfterHash('csv', { ...BASE, labels: ['z', 'x', 'y'] });
    expect(h1).toBe(h2);
  });

  it('changes when the format changes', () => {
    expect(computeAfterHash('csv', BASE)).not.toBe(computeAfterHash('xlsx', BASE));
  });

  it('changes when the date range changes', () => {
    const other = computeAfterHash('csv', { ...BASE, dateTo: '2025-06-30' });
    expect(other).not.toBe(computeAfterHash('csv', BASE));
  });

  it('returns a 64-char lowercase hex digest', () => {
    expect(computeAfterHash('csv', BASE)).toMatch(/^[0-9a-f]{64}$/u);
  });
});
