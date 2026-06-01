// SPEC-027 §7 — Export IPC contract unit tests (Cypher).
//
// Locks the Zod boundary schemas and the mandatory-filter gate predicate
// (FR23/AC18) shared by renderer (button enablement) and main (authoritative
// re-check).

import { describe, it, expect } from 'vitest';
import {
  exportFiltersSchema,
  exportPrepareRequestSchema,
  exportRunRequestSchema,
  isMinimumFilterSetSatisfied,
} from './export.js';

const ULID = '01HZZZZZZZZZZZZZZZZZZZZZZA';
const RANGE = { dateFrom: '2025-01-01', dateTo: '2025-03-31' };

describe('isMinimumFilterSetSatisfied (FR23)', () => {
  it('rejects a date-range-only (full/unfiltered) export', () => {
    expect(isMinimumFilterSetSatisfied(RANGE)).toBe(false);
  });

  it('rejects when the date range is missing even with a facet', () => {
    expect(isMinimumFilterSetSatisfied({ accountIds: [ULID] })).toBe(false);
  });

  it('accepts a date range plus an account facet', () => {
    expect(isMinimumFilterSetSatisfied({ ...RANGE, accountIds: [ULID] })).toBe(true);
  });

  it('accepts a date range plus a label facet', () => {
    expect(isMinimumFilterSetSatisfied({ ...RANGE, labels: ['Comida'] })).toBe(true);
  });

  it('treats empty facet arrays as no facet', () => {
    expect(isMinimumFilterSetSatisfied({ ...RANGE, accountIds: [], labels: [] })).toBe(false);
  });
});

describe('exportFiltersSchema', () => {
  it('requires a date range', () => {
    expect(exportFiltersSchema.safeParse({ accountIds: [ULID] }).success).toBe(false);
  });

  it('rejects dateFrom after dateTo', () => {
    expect(
      exportFiltersSchema.safeParse({ dateFrom: '2025-03-31', dateTo: '2025-01-01' }).success,
    ).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(exportFiltersSchema.safeParse({ ...RANGE, somethingElse: true }).success).toBe(false);
  });

  it('rejects a label containing a path separator', () => {
    expect(exportFiltersSchema.safeParse({ ...RANGE, labels: ['a/b'] }).success).toBe(false);
  });

  it('rejects a non-ULID account id', () => {
    expect(exportFiltersSchema.safeParse({ ...RANGE, accountIds: ['nope'] }).success).toBe(false);
  });

  it('accepts a valid filter set', () => {
    expect(exportFiltersSchema.safeParse({ ...RANGE, accountIds: [ULID] }).success).toBe(true);
  });
});

describe('exportPrepareRequestSchema', () => {
  it('accepts a well-formed prepare request', () => {
    const parsed = exportPrepareRequestSchema.safeParse({
      format: 'csv',
      filters: { ...RANGE, accountIds: [ULID] },
      locale: 'es',
      dateFormat: 'DMY',
      numberFormat: 'eu',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown format', () => {
    expect(
      exportPrepareRequestSchema.safeParse({
        format: 'pdf',
        filters: RANGE,
        locale: 'en',
        dateFormat: 'ISO',
        numberFormat: 'us',
      }).success,
    ).toBe(false);
  });

  it('rejects invalid format preferences', () => {
    expect(
      exportPrepareRequestSchema.safeParse({
        format: 'csv',
        filters: { ...RANGE, accountIds: [ULID] },
        locale: 'en',
        dateFormat: 'YMD',
        numberFormat: 'uk',
      }).success,
    ).toBe(false);
  });
});

describe('exportRunRequestSchema', () => {
  it('requires a confirmationToken and rejects extra keys', () => {
    expect(exportRunRequestSchema.safeParse({ confirmationToken: 'tok' }).success).toBe(true);
    expect(
      exportRunRequestSchema.safeParse({ confirmationToken: 'tok', filters: RANGE }).success,
    ).toBe(false);
  });
});
