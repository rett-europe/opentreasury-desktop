// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_MOVEMENTS_DATE_FILTER,
  MOVEMENTS_DATE_FILTER_STORAGE_KEY,
  loadPersistedDateFilter,
  matchesDateFilter,
  persistDateFilter,
  resolveDateFilter,
  type MovementsDateFilter,
} from './movementsDateFilter.js';

const REF = new Date('2026-04-25T12:00:00Z');

describe('matchesDateFilter', () => {
  it('returns true for kind=all regardless of date', () => {
    expect(matchesDateFilter({ date: '1999-01-01' }, { kind: 'all' }, REF)).toBe(true);
    expect(matchesDateFilter({ date: '2999-12-31' }, { kind: 'all' }, REF)).toBe(true);
  });

  it('preset thisMonth: inclusive on both ends', () => {
    const filter: MovementsDateFilter = { kind: 'preset', id: 'this-month' };
    expect(matchesDateFilter({ date: '2026-04-01' }, filter, REF)).toBe(true);
    expect(matchesDateFilter({ date: '2026-04-25' }, filter, REF)).toBe(true);
    expect(matchesDateFilter({ date: '2026-03-31' }, filter, REF)).toBe(false);
    expect(matchesDateFilter({ date: '2026-04-26' }, filter, REF)).toBe(false);
  });

  it('custom range: inclusive boundaries via lexicographic compare', () => {
    const filter: MovementsDateFilter = { kind: 'custom', from: '2026-01-15', to: '2026-02-03' };
    expect(matchesDateFilter({ date: '2026-01-15' }, filter, REF)).toBe(true);
    expect(matchesDateFilter({ date: '2026-02-03' }, filter, REF)).toBe(true);
    expect(matchesDateFilter({ date: '2026-01-14' }, filter, REF)).toBe(false);
    expect(matchesDateFilter({ date: '2026-02-04' }, filter, REF)).toBe(false);
  });

  it('custom range: invalid (to < from) acts as no-op (matches all)', () => {
    const filter: MovementsDateFilter = { kind: 'custom', from: '2026-04-10', to: '2026-04-01' };
    expect(matchesDateFilter({ date: '2020-01-01' }, filter, REF)).toBe(true);
  });

  it('lexicographic compare survives year/month boundaries', () => {
    const filter: MovementsDateFilter = { kind: 'custom', from: '2025-12-31', to: '2026-01-02' };
    expect(matchesDateFilter({ date: '2025-12-31' }, filter, REF)).toBe(true);
    expect(matchesDateFilter({ date: '2026-01-01' }, filter, REF)).toBe(true);
    expect(matchesDateFilter({ date: '2026-01-02' }, filter, REF)).toBe(true);
    expect(matchesDateFilter({ date: '2025-12-30' }, filter, REF)).toBe(false);
    expect(matchesDateFilter({ date: '2026-01-03' }, filter, REF)).toBe(false);
  });
});

describe('resolveDateFilter', () => {
  it('returns null for kind=all', () => {
    expect(resolveDateFilter({ kind: 'all' }, REF)).toBeNull();
  });

  it('returns the preset range for preset filters', () => {
    expect(resolveDateFilter({ kind: 'preset', id: 'last-year' }, REF)).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
    });
  });

  it('returns null for malformed custom ranges', () => {
    expect(resolveDateFilter({ kind: 'custom', from: 'bad', to: '2026-01-01' }, REF)).toBeNull();
    expect(
      resolveDateFilter({ kind: 'custom', from: '2026-02-01', to: '2026-01-01' }, REF),
    ).toBeNull();
  });
});

describe('persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('returns the default when nothing is stored', () => {
    expect(loadPersistedDateFilter()).toEqual(DEFAULT_MOVEMENTS_DATE_FILTER);
  });

  it('round-trips a preset selection', () => {
    persistDateFilter({ kind: 'preset', id: 'last-12-months' });
    expect(loadPersistedDateFilter()).toEqual({ kind: 'preset', id: 'last-12-months' });
  });

  it('round-trips kind=all', () => {
    persistDateFilter({ kind: 'all' });
    expect(loadPersistedDateFilter()).toEqual({ kind: 'all' });
  });

  it('does NOT persist custom ranges (avoids stale ranges next session)', () => {
    persistDateFilter({ kind: 'custom', from: '2026-01-01', to: '2026-02-01' });
    expect(localStorage.getItem(MOVEMENTS_DATE_FILTER_STORAGE_KEY)).toBeNull();
    expect(loadPersistedDateFilter()).toEqual(DEFAULT_MOVEMENTS_DATE_FILTER);
  });

  it('falls back to default on malformed JSON', () => {
    localStorage.setItem(MOVEMENTS_DATE_FILTER_STORAGE_KEY, '{not json');
    expect(loadPersistedDateFilter()).toEqual(DEFAULT_MOVEMENTS_DATE_FILTER);
  });

  it('falls back to default on schema violation', () => {
    localStorage.setItem(
      MOVEMENTS_DATE_FILTER_STORAGE_KEY,
      JSON.stringify({ kind: 'preset', id: 'not-a-real-preset' }),
    );
    expect(loadPersistedDateFilter()).toEqual(DEFAULT_MOVEMENTS_DATE_FILTER);
  });
});
