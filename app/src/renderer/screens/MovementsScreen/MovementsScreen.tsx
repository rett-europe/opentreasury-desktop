import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';

import { Button } from '../../components/Button/index.js';
import { Card } from '../../components/Card/index.js';
import { DateRangePicker, DateRangePill } from '../../components/DateRangePicker/index.js';
import type { Preset } from '../../components/DateRangePicker/index.js';
import { EmptyState } from '../../components/EmptyState/index.js';
import { Stack } from '../../components/Stack/index.js';
import { Table } from '../../components/Table/index.js';
import type { TableColumn, SortDirection } from '../../components/Table/index.js';
import { Text } from '../../components/Text/index.js';
import { getMockMovements, getMockMovementCount } from '../../mocks/movements.js';
import type { DateRange, Movement, MovementTotals } from '../../types/movement.js';
import './MovementsScreen.css';

/**
 * UX-003 — Movements screen.
 *
 * States modelled here (subset of UX-003 §5 — enough for v0.1 mock data):
 *   - range-not-selected   : opens this way; table dim; picker active
 *   - range-loading        : spinner/caption after user picks a range
 *   - range-loaded         : table + totals strip
 *   - range-loaded-empty-range : range picked but no rows match
 *   - range-error          : IPC / mock error; retry button
 *
 * Mock data provider simulates a 200 ms round-trip (mocks/movements.ts).
 * When the real IPC bridge lands, swap `getMockMovements` for the
 * `window.api.queryTxRange` call — this screen's state machine stays.
 */

type ScreenState =
  | { kind: 'range-not-selected' }
  | { kind: 'range-loading'; range: DateRange; presetId: string | null }
  | {
      kind: 'range-loaded';
      range: DateRange;
      presetId: string | null;
      rows: readonly Movement[];
    }
  | { kind: 'range-error'; range: DateRange; presetId: string | null; message: string };

type SortColumn = 'date' | 'description' | 'account' | 'category' | 'amount';

// Internal preset id registry. UX-003 suggests >= 3 presets; v0.1 ships 3.
const PRESET_IDS = ['this-month', 'last-30-days', 'ytd'] as const;
type PresetId = (typeof PRESET_IDS)[number];

function buildPresets(labels: Record<PresetId, string>): readonly Preset[] {
  // "Today" in project context is April 19, 2026 (per session context).
  const today = new Date();
  return [
    {
      id: 'this-month',
      label: labels['this-month'],
      range: () => {
        const from = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1));
        const to = new Date(Date.UTC(today.getFullYear(), today.getMonth() + 1, 0));
        return { from, to };
      },
    },
    {
      id: 'last-30-days',
      label: labels['last-30-days'],
      range: () => {
        const to = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
        const from = new Date(to);
        from.setUTCDate(from.getUTCDate() - 29);
        return { from, to };
      },
    },
    {
      id: 'ytd',
      label: labels['ytd'],
      range: () => {
        const from = new Date(Date.UTC(today.getFullYear(), 0, 1));
        const to = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
        return { from, to };
      },
    },
  ];
}

function computeTotals(rows: readonly Movement[]): MovementTotals {
  let income = 0;
  let expense = 0;
  for (const m of rows) {
    if (m.type === 'income') income += m.amount;
    else expense += m.amount;
  }
  return { income, expense, net: income - expense, count: rows.length };
}

function sortRows(
  rows: readonly Movement[],
  column: SortColumn,
  direction: SortDirection,
): readonly Movement[] {
  if (direction === null) return rows;
  const sorted = [...rows];
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (column) {
      case 'date':
        cmp = a.date.localeCompare(b.date);
        break;
      case 'description':
        cmp = a.description.localeCompare(b.description);
        break;
      case 'account':
        cmp = a.account.localeCompare(b.account);
        break;
      case 'category':
        cmp = a.category.localeCompare(b.category);
        break;
      case 'amount': {
        const aSigned = a.type === 'expense' ? -a.amount : a.amount;
        const bSigned = b.type === 'expense' ? -b.amount : b.amount;
        cmp = aSigned - bSigned;
        break;
      }
    }
    return direction === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

function formatRangeLabel(range: DateRange, locale: string): string {
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  return `${fmt.format(range.from)} – ${fmt.format(range.to)}`;
}

export function MovementsScreen(): JSX.Element {
  const { t, i18n } = useTranslation('common');
  const locale = i18n.language.startsWith('es') ? 'es-ES' : 'en-US';

  const [state, setState] = useState<ScreenState>({ kind: 'range-not-selected' });
  const [sortBy, setSortBy] = useState<SortColumn>('date');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  const presetLabels: Record<PresetId, string> = useMemo(
    () => ({
      'this-month': t('movements.presets.this-month'),
      'last-30-days': t('movements.presets.last-30-days'),
      ytd: t('movements.presets.ytd'),
    }),
    [t],
  );
  const presets = useMemo(() => buildPresets(presetLabels), [presetLabels]);

  const hasAnyMovements = getMockMovementCount() > 0;

  const loadRange = useCallback(async (range: DateRange, presetId: string | null) => {
    setState({ kind: 'range-loading', range, presetId });
    try {
      const rows = await getMockMovements(range);
      setState({ kind: 'range-loaded', range, presetId, rows });
    } catch (err) {
      setState({
        kind: 'range-error',
        range,
        presetId,
        message: err instanceof Error ? err.message : 'unknown',
      });
    }
  }, []);

  const handlePresetOrCustom = useCallback(
    (range: DateRange) => {
      // Detect whether the chosen range matches a preset for pill labelling.
      const match = presets.find((p) => {
        const r = p.range();
        return (
          r.from.toISOString().slice(0, 10) === range.from.toISOString().slice(0, 10) &&
          r.to.toISOString().slice(0, 10) === range.to.toISOString().slice(0, 10)
        );
      });
      void loadRange(range, match?.id ?? null);
    },
    [presets, loadRange],
  );

  const handleClearRange = useCallback(() => {
    setState({ kind: 'range-not-selected' });
  }, []);

  const handleRetry = useCallback(() => {
    if (state.kind === 'range-error') {
      void loadRange(state.range, state.presetId);
    }
  }, [state, loadRange]);

  const handleSort = useCallback(
    (columnId: string) => {
      const col = columnId as SortColumn;
      if (sortBy === col) {
        setSortDir((prev) => (prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc'));
      } else {
        setSortBy(col);
        setSortDir('asc');
      }
    },
    [sortBy],
  );

  // Keep focus experience clean when the state transitions.
  useEffect(() => {
    // no-op for v0.1 — real impl will move focus on range-loaded per UX-003 §7.
  }, [state.kind]);

  const currentRange = state.kind !== 'range-not-selected' ? state.range : null;
  const activePresetId = state.kind !== 'range-not-selected' ? state.presetId : null;

  const sortedRows = useMemo(() => {
    if (state.kind !== 'range-loaded') return [];
    return sortRows(state.rows, sortBy, sortDir);
  }, [state, sortBy, sortDir]);

  const totals = useMemo(() => {
    if (state.kind !== 'range-loaded') return null;
    return computeTotals(state.rows);
  }, [state]);

  const currencyFmt = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }),
    [locale],
  );
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }), [locale]);

  const columns: readonly TableColumn<Movement>[] = useMemo(
    () => [
      {
        id: 'type',
        header: '',
        sortable: false,
        align: 'center',
        width: 36,
        render: (m) => {
          const cls =
            m.type === 'income'
              ? 'ot-type-arrow ot-type-arrow--income'
              : 'ot-type-arrow ot-type-arrow--expense';
          return (
            <span className={cls} aria-hidden="true">
              {m.type === 'income' ? '↑' : '↓'}
            </span>
          );
        },
      },
      {
        id: 'date',
        header: t('movements.columns.date'),
        sortable: true,
        tabular: true,
        render: (m) => dateFmt.format(new Date(`${m.date}T00:00:00Z`)),
      },
      {
        id: 'description',
        header: t('movements.columns.description'),
        sortable: true,
        render: (m) => m.description,
      },
      {
        id: 'account',
        header: t('movements.columns.account'),
        sortable: true,
        render: (m) => m.account,
      },
      {
        id: 'category',
        header: t('movements.columns.category'),
        sortable: true,
        render: (m) => (m.subcategory != null ? `${m.category} › ${m.subcategory}` : m.category),
      },
      {
        id: 'amount',
        header: t('movements.columns.amount'),
        sortable: true,
        align: 'right',
        tabular: true,
        render: (m) => {
          const cls = m.type === 'income' ? 'ot-amount--income' : 'ot-amount--expense';
          const sign = m.type === 'expense' ? -m.amount : m.amount;
          return <span className={cls}>{currencyFmt.format(sign)}</span>;
        },
      },
    ],
    [t, currencyFmt, dateFmt],
  );

  const rangeLabel = useMemo(() => {
    if (!currentRange) return '';
    if (activePresetId) {
      const p = presets.find((x) => x.id === activePresetId);
      if (p) return p.label;
    }
    return formatRangeLabel(currentRange, locale);
  }, [currentRange, activePresetId, presets, locale]);

  const customLabels = useMemo(
    () => ({
      from: t('movements.range.from'),
      to: t('movements.range.to'),
      apply: t('movements.range.apply'),
      invalidRange: t('movements.range.invalid'),
    }),
    [t],
  );

  const pickerBlock = (
    <Card padding="md">
      <Stack gap={6}>
        <Text variant="h3">{t('movements.empty.pick-range.title')}</Text>
        <Text variant="body" tone="secondary">
          {t('movements.empty.pick-range.body')}
        </Text>
        <DateRangePicker
          value={currentRange}
          onChange={handlePresetOrCustom}
          presets={presets}
          activePresetId={activePresetId}
          customLabels={customLabels}
        />
      </Stack>
    </Card>
  );

  // db-empty branch takes precedence over range-not-selected per UX-003 §5.
  const showDbEmpty = !hasAnyMovements && state.kind === 'range-not-selected';

  return (
    <div className="ot-movements">
      <header className="ot-page-header">
        <div>
          <h1>{t('movements.title')}</h1>
          <p className="ot-page-header__subtitle">{t('movements.subtitle')}</p>
        </div>
      </header>

      {showDbEmpty ? (
        <Card padding="lg">
          <EmptyState
            title={t('movements.empty.db.title')}
            body={t('movements.empty.db.body')}
            actions={
              <Button variant="primary" leadingIcon={<Plus size={16} />} disabled>
                {t('movements.cta.first-tx')}
              </Button>
            }
          />
        </Card>
      ) : state.kind === 'range-not-selected' ? (
        pickerBlock
      ) : (
        <>
          <div className="ot-movements__toolbar">
            <div className="ot-movements__range-active">
              <DateRangePill
                label={rangeLabel}
                onClear={handleClearRange}
                clearLabel={t('movements.range.clear')}
              />
              <Button
                variant="primary"
                size="md"
                leadingIcon={<Plus size={16} />}
                disabled={state.kind !== 'range-loaded'}
              >
                {t('movements.cta.new')}
              </Button>
            </div>
          </div>

          {state.kind === 'range-loading' ? (
            <Card padding="lg">
              <div className="ot-movements__loading" role="status" aria-live="polite">
                {t('movements.loading', { range: rangeLabel })}
              </div>
            </Card>
          ) : state.kind === 'range-error' ? (
            <div className="ot-movements__error" role="alert">
              <span>{t('movements.error.query')}</span>
              <Button variant="secondary" onClick={handleRetry}>
                {t('common.retry')}
              </Button>
            </div>
          ) : state.rows.length === 0 ? (
            <Card padding="lg">
              <EmptyState
                title={t('movements.empty.in-range.title')}
                body={t('movements.empty.in-range.body')}
                actions={
                  <Button variant="secondary" onClick={handleClearRange}>
                    {t('movements.cta.widen-range')}
                  </Button>
                }
              />
            </Card>
          ) : (
            <>
              {totals ? (
                <div
                  className="ot-movements__totals"
                  role="status"
                  aria-live="polite"
                  aria-label={t('movements.title') satisfies string}
                >
                  <div>
                    <span className="ot-movements__totals-label">
                      {t('movements.totals.income')}
                    </span>
                    <span className="ot-movements__totals-value ot-movements__totals-value--income">
                      {currencyFmt.format(totals.income)}
                    </span>
                  </div>
                  <div>
                    <span className="ot-movements__totals-label">
                      {t('movements.totals.expense')}
                    </span>
                    <span className="ot-movements__totals-value ot-movements__totals-value--expense">
                      {currencyFmt.format(totals.expense)}
                    </span>
                  </div>
                  <div>
                    <span className="ot-movements__totals-label">{t('movements.totals.net')}</span>
                    <span
                      className={
                        totals.net >= 0
                          ? 'ot-movements__totals-value ot-movements__totals-value--net-pos'
                          : 'ot-movements__totals-value ot-movements__totals-value--net-neg'
                      }
                    >
                      {currencyFmt.format(totals.net)}
                    </span>
                  </div>
                  <div>
                    <span className="ot-movements__totals-label">
                      {t('movements.totals.count', { count: totals.count })}
                    </span>
                    <span className="ot-movements__totals-value">{totals.count}</span>
                  </div>
                </div>
              ) : null}

              <Table
                caption={t('movements.title') satisfies string}
                columns={columns}
                rows={sortedRows}
                getRowKey={(m) => m.id}
                sortBy={sortBy}
                sortDirection={sortDir}
                onSort={handleSort}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
