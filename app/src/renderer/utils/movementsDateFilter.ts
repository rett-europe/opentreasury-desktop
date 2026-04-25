import { z } from 'zod';
import {
  DATE_PRESET_IDS,
  type DatePresetId,
  getPresetRange,
  type IsoDateRange,
} from './datePresets.js';

/**
 * Canonical Movements date-filter state.
 *
 *   - `preset` — one of the named presets (resolved via `getPresetRange`).
 *   - `custom` — user-picked from/to (YYYY-MM-DD strings).
 *   - `all`   — no date filter.
 */
export type MovementsDateFilter =
  | { readonly kind: 'preset'; readonly id: DatePresetId }
  | { readonly kind: 'custom'; readonly from: string; readonly to: string }
  | { readonly kind: 'all' };

export const DEFAULT_MOVEMENTS_DATE_FILTER: MovementsDateFilter = {
  kind: 'preset',
  id: 'this-month',
};

const STORAGE_KEY = 'opentreasury:movements:dateFilter';

const presetSchema = z.object({
  kind: z.literal('preset'),
  id: z.enum(DATE_PRESET_IDS),
});

const allSchema = z.object({ kind: z.literal('all') });

// Custom is intentionally NOT persisted, but we still validate it strictly
// when resolving a filter. Persisted shape is preset|all only.
const persistedSchema = z.union([presetSchema, allSchema]);

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(s: string): boolean {
  return isoDateRegex.test(s);
}

/**
 * Resolve a `MovementsDateFilter` to a concrete `{from,to}` range. Returns
 * `null` for `kind: 'all'` (no filtering) or invalid custom ranges.
 */
export function resolveDateFilter(
  filter: MovementsDateFilter,
  today: Date = new Date(),
): IsoDateRange | null {
  switch (filter.kind) {
    case 'all':
      return null;
    case 'preset':
      return getPresetRange(filter.id, today);
    case 'custom':
      if (!isIsoDate(filter.from) || !isIsoDate(filter.to)) return null;
      if (filter.to < filter.from) return null;
      return { from: filter.from, to: filter.to };
  }
}

/**
 * Inclusive boundary check: tx.date must be a `YYYY-MM-DD` string and the
 * comparison is lexicographic — never via `Date` objects.
 */
export function matchesDateFilter(
  tx: { readonly date: string },
  filter: MovementsDateFilter,
  today: Date = new Date(),
): boolean {
  const range = resolveDateFilter(filter, today);
  if (range === null) return true;
  return tx.date >= range.from && tx.date <= range.to;
}

/**
 * Load the persisted filter from localStorage. Returns the default on any
 * parse error or if running outside a browser. Custom ranges are never
 * persisted, so the persisted shape is always preset|all.
 */
export function loadPersistedDateFilter(): MovementsDateFilter {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_MOVEMENTS_DATE_FILTER;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT_MOVEMENTS_DATE_FILTER;
    const parsed = persistedSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return DEFAULT_MOVEMENTS_DATE_FILTER;
    return parsed.data;
  } catch {
    return DEFAULT_MOVEMENTS_DATE_FILTER;
  }
}

/** Persist `preset` and `all` only; `custom` is intentionally dropped. */
export function persistDateFilter(filter: MovementsDateFilter): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (filter.kind === 'custom') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filter));
  } catch {
    /* swallow — storage quotas / private mode */
  }
}

export const MOVEMENTS_DATE_FILTER_STORAGE_KEY = STORAGE_KEY;
