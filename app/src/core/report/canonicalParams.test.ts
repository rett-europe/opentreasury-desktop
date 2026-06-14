// SPEC-030 — canonical report params + after_hash unit tests.

import { describe, it, expect } from 'vitest';
import { buildCanonicalReportParams, computeReportAfterHash } from './canonicalParams.js';

const A = '01HZZZZZZZZZZZZZZZZZZZZZZA';
const B = '01HZZZZZZZZZZZZZZZZZZZZZZB';

const base = {
  periodKind: 'calendar-year' as const,
  periodStart: '2024-01-01',
  periodEnd: '2024-12-31',
  grouping: 'category' as const,
};

describe('buildCanonicalReportParams', () => {
  it('sorts account ids so order does not change the hash', () => {
    const a = buildCanonicalReportParams('pdf', { ...base, accountIds: [A, B] });
    const b = buildCanonicalReportParams('pdf', { ...base, accountIds: [B, A] });
    expect(a).toEqual(b);
  });

  it('defaults missing account ids to an empty array', () => {
    expect(buildCanonicalReportParams('pdf', base).accountIds).toEqual([]);
  });
});

describe('computeReportAfterHash', () => {
  it('is deterministic for identical params', () => {
    expect(computeReportAfterHash('pdf', base)).toBe(computeReportAfterHash('pdf', base));
  });

  it('changes when a meaningful parameter changes (binds the token)', () => {
    const h1 = computeReportAfterHash('pdf', base);
    const h2 = computeReportAfterHash('pdf', { ...base, grouping: 'category-subcategory' });
    const h3 = computeReportAfterHash('pdf', { ...base, periodEnd: '2024-06-30' });
    const h4 = computeReportAfterHash('pdf', { ...base, accountIds: [A] });
    expect(new Set([h1, h2, h3, h4]).size).toBe(4);
  });

  it('produces a 64-char hex digest', () => {
    expect(computeReportAfterHash('pdf', base)).toMatch(/^[0-9a-f]{64}$/u);
  });
});
