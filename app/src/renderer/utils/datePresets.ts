/**
 * Movements date-filter preset factories.
 *
 * All math is timezone-safe: every range is built with `Date.UTC(...)` and
 * stringified to `YYYY-MM-DD` via `toIsoDate`. Compares against `tx.date`
 * (also `YYYY-MM-DD`) MUST be lexicographic — never via Date objects.
 *
 * Each preset is a pure function that accepts `today` so tests can
 * inject a deterministic clock.
 */

export const DATE_PRESET_IDS = [
  'this-month',
  'last-month',
  'last-3-months',
  'this-year',
  'last-year',
  'last-12-months',
] as const;

export type DatePresetId = (typeof DATE_PRESET_IDS)[number];

export interface IsoDateRange {
  readonly from: string;
  readonly to: string;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

function utcParts(d: Date): { year: number; month: number; day: number } {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

/** Anchor "today" to UTC midnight so all math is stable. */
function utcToday(today: Date): Date {
  return utcDate(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
}

export function thisMonth(today: Date): IsoDateRange {
  const t = utcToday(today);
  const { year, month } = utcParts(t);
  return { from: toIsoDate(utcDate(year, month, 1)), to: toIsoDate(t) };
}

export function lastMonth(today: Date): IsoDateRange {
  const t = utcToday(today);
  const { year, month } = utcParts(t);
  // Last day of previous month = day 0 of current month.
  const start = utcDate(year, month - 1, 1);
  const end = utcDate(year, month, 0);
  return { from: toIsoDate(start), to: toIsoDate(end) };
}

export function last3Months(today: Date): IsoDateRange {
  // Rolling 90 days ending today (NOT calendar quarter).
  const t = utcToday(today);
  const start = new Date(t.getTime());
  start.setUTCDate(start.getUTCDate() - 89);
  return { from: toIsoDate(start), to: toIsoDate(t) };
}

export function thisYear(today: Date): IsoDateRange {
  const t = utcToday(today);
  const { year } = utcParts(t);
  return { from: toIsoDate(utcDate(year, 0, 1)), to: toIsoDate(t) };
}

export function lastYear(today: Date): IsoDateRange {
  const t = utcToday(today);
  const { year } = utcParts(t);
  return {
    from: toIsoDate(utcDate(year - 1, 0, 1)),
    to: toIsoDate(utcDate(year - 1, 11, 31)),
  };
}

export function last12Months(today: Date): IsoDateRange {
  const t = utcToday(today);
  const start = new Date(t.getTime());
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  start.setUTCDate(start.getUTCDate() + 1);
  return { from: toIsoDate(start), to: toIsoDate(t) };
}

const FACTORIES: Readonly<Record<DatePresetId, (today: Date) => IsoDateRange>> = {
  'this-month': thisMonth,
  'last-month': lastMonth,
  'last-3-months': last3Months,
  'this-year': thisYear,
  'last-year': lastYear,
  'last-12-months': last12Months,
};

export function getPresetRange(id: DatePresetId, today: Date = new Date()): IsoDateRange {
  return FACTORIES[id](today);
}
