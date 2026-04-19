import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, FolderOpen, Landmark, Plus, X } from 'lucide-react';

import { Button } from '../../components/Button/index.js';
import { Card } from '../../components/Card/index.js';
import { EmptyState } from '../../components/EmptyState/index.js';
import { Table } from '../../components/Table/index.js';
import type { TableColumn, SortDirection } from '../../components/Table/index.js';
import { getMockMovements } from '../../mocks/movements.js';
import type { Movement, MovementTotals } from '../../types/movement.js';
import './MovementsScreen.css';

/**
 * UX-003 — Movements screen (prototype-parity filter bar).
 *
 * States:
 *   - loading : initial mock fetch in progress
 *   - loaded  : all rows in memory; filtering is client-side
 *   - error   : fetch failed; retry button
 *
 * Filters (all client-side over the full loaded set):
 *   type | account | category | month | minAmount | maxAmount | uncategorizedOnly
 *
 * NOTE: `uncategorizedOnly` requires a nullable category on Movement.
 * The current mock schema always sets `category`, so this filter is a
 * no-op against v0.1 data. See `.squad/decisions/inbox/trinity-movement-schema-gaps.md`.
 */

type ScreenState =
  | { kind: 'loading' }
  | { kind: 'loaded'; rows: readonly Movement[] }
  | { kind: 'error'; message: string };

type SortColumn = 'date' | 'description' | 'account' | 'category' | 'amount';

type TypeFilter = 'all' | 'income' | 'expense';
type MonthFilter = 'all' | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

const WIDE_RANGE = {
  from: new Date(Date.UTC(2020, 0, 1)),
  // "Today" is deliberately generous so the mock data (through 2026-04) fits.
  to: new Date(Date.UTC(2099, 11, 31)),
};

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

export function MovementsScreen(): JSX.Element {
  const { t, i18n } = useTranslation('common');
  const locale = i18n.language.startsWith('es') ? 'es-ES' : 'en-US';

  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [sortBy, setSortBy] = useState<SortColumn>('date');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  // Filter state
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<MonthFilter>('all');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [uncategorizedOnly, setUncategorizedOnly] = useState(false);

  const loadAll = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const rows = await getMockMovements(WIDE_RANGE);
      setState({ kind: 'loaded', rows });
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'unknown',
      });
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleRetry = useCallback(() => {
    void loadAll();
  }, [loadAll]);

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

  const allRows = useMemo(
    () => (state.kind === 'loaded' ? state.rows : ([] as readonly Movement[])),
    [state],
  );

  // Distinct accounts / categories for the select options.
  const accountOptions = useMemo(() => {
    const s = new Set<string>();
    for (const m of allRows) s.add(m.account);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [allRows]);

  const categoryOptions = useMemo(() => {
    const s = new Set<string>();
    for (const m of allRows) s.add(m.category);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [allRows]);

  const monthFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'long' }),
    [locale],
  );
  const monthNames = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const d = new Date(Date.UTC(2024, i, 1));
      const label = monthFmt.format(d);
      out.push(label.charAt(0).toUpperCase() + label.slice(1));
    }
    return out;
  }, [monthFmt]);

  const filteredRows = useMemo(() => {
    const minN = minAmount.trim() === '' ? null : Number(minAmount);
    const maxN = maxAmount.trim() === '' ? null : Number(maxAmount);
    return allRows.filter((m) => {
      if (typeFilter !== 'all' && m.type !== typeFilter) return false;
      if (accountFilter !== 'all' && m.account !== accountFilter) return false;
      if (categoryFilter !== 'all' && m.category !== categoryFilter) return false;
      if (monthFilter !== 'all') {
        const mo = Number(m.date.slice(5, 7));
        if (mo !== monthFilter) return false;
      }
      if (minN != null && !Number.isNaN(minN) && m.amount < minN) return false;
      if (maxN != null && !Number.isNaN(maxN) && m.amount > maxN) return false;
      if (uncategorizedOnly) {
        // TODO: needs Movement.category to be nullable (or a dedicated
        // `uncategorized` flag / empty-string convention). Current mock
        // always sets a category, so this filter returns no rows.
        if (m.category && m.category.length > 0) return false;
      }
      return true;
    });
  }, [
    allRows,
    typeFilter,
    accountFilter,
    categoryFilter,
    monthFilter,
    minAmount,
    maxAmount,
    uncategorizedOnly,
  ]);

  const hasActiveFilters =
    typeFilter !== 'all' ||
    accountFilter !== 'all' ||
    categoryFilter !== 'all' ||
    monthFilter !== 'all' ||
    minAmount.trim() !== '' ||
    maxAmount.trim() !== '' ||
    uncategorizedOnly;

  const clearFilters = useCallback(() => {
    setTypeFilter('all');
    setAccountFilter('all');
    setCategoryFilter('all');
    setMonthFilter('all');
    setMinAmount('');
    setMaxAmount('');
    setUncategorizedOnly(false);
  }, []);

  const sortedRows = useMemo(
    () => sortRows(filteredRows, sortBy, sortDir),
    [filteredRows, sortBy, sortDir],
  );

  const totals = useMemo(() => computeTotals(filteredRows), [filteredRows]);

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

  return (
    <div className="ot-movements">
      <header className="ot-page-header">
        <div>
          <h1>{t('movements.title')}</h1>
          <p className="ot-page-header__subtitle">{t('movements.subtitle')}</p>
        </div>
        <div className="ot-page-header__actions">
          <Button
            variant="primary"
            size="md"
            leadingIcon={<Plus size={16} />}
            disabled={state.kind !== 'loaded'}
          >
            {t('movements.cta.new')}
          </Button>
        </div>
      </header>

      <div className="ot-filter-bar" role="group" aria-label={t('movements.filters.aria-label')}>
        <div className="ot-filter-bar__chips" role="tablist" aria-label={t('movements.filters.type.label')}>
          <button
            type="button"
            role="tab"
            aria-selected={typeFilter === 'all'}
            className={
              typeFilter === 'all'
                ? 'ot-filter-bar__chip ot-filter-bar__chip--active'
                : 'ot-filter-bar__chip'
            }
            onClick={() => setTypeFilter('all')}
          >
            {t('movements.filters.type.all')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={typeFilter === 'income'}
            className={
              typeFilter === 'income'
                ? 'ot-filter-bar__chip ot-filter-bar__chip--active'
                : 'ot-filter-bar__chip'
            }
            onClick={() => setTypeFilter('income')}
          >
            {t('movements.filters.type.income')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={typeFilter === 'expense'}
            className={
              typeFilter === 'expense'
                ? 'ot-filter-bar__chip ot-filter-bar__chip--active'
                : 'ot-filter-bar__chip'
            }
            onClick={() => setTypeFilter('expense')}
          >
            {t('movements.filters.type.expense')}
          </button>
        </div>

        <label className="ot-filter-bar__input">
          <Landmark size={14} aria-hidden="true" />
          <span className="ot-visually-hidden">{t('movements.filters.account.label')}</span>
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            aria-label={t('movements.filters.account.label')}
          >
            <option value="all">{t('movements.filters.account.all')}</option>
            {accountOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        <label className="ot-filter-bar__input">
          <FolderOpen size={14} aria-hidden="true" />
          <span className="ot-visually-hidden">{t('movements.filters.category.label')}</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label={t('movements.filters.category.label')}
          >
            <option value="all">{t('movements.filters.category.all')}</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="ot-filter-bar__input">
          <Calendar size={14} aria-hidden="true" />
          <span className="ot-visually-hidden">{t('movements.filters.month.label')}</span>
          <select
            value={monthFilter === 'all' ? 'all' : String(monthFilter)}
            onChange={(e) =>
              setMonthFilter(e.target.value === 'all' ? 'all' : (Number(e.target.value) as MonthFilter))
            }
            aria-label={t('movements.filters.month.label')}
          >
            <option value="all">{t('movements.filters.month.all')}</option>
            {monthNames.map((m, i) => (
              <option key={i} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="ot-filter-bar__input ot-filter-bar__input--amount">
          <span className="ot-filter-bar__prefix">{t('movements.filters.amountMin')}</span>
          <input
            type="number"
            inputMode="decimal"
            placeholder="0"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            aria-label={t('movements.filters.amountMin')}
          />
        </label>

        <label className="ot-filter-bar__input ot-filter-bar__input--amount">
          <span className="ot-filter-bar__prefix">{t('movements.filters.amountMax')}</span>
          <input
            type="number"
            inputMode="decimal"
            placeholder="∞"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
            aria-label={t('movements.filters.amountMax')}
          />
        </label>

        <label className="ot-filter-bar__checkbox">
          <input
            type="checkbox"
            checked={uncategorizedOnly}
            onChange={(e) => setUncategorizedOnly(e.target.checked)}
          />
          {t('movements.filters.uncategorizedOnly')}
        </label>

        {hasActiveFilters ? (
          <button
            type="button"
            className="ot-filter-bar__clear"
            onClick={clearFilters}
          >
            <X size={14} aria-hidden="true" />
            {t('movements.filters.clear')}
          </button>
        ) : null}
      </div>

      {state.kind === 'loading' ? (
        <Card padding="lg">
          <div className="ot-movements__loading" role="status" aria-live="polite">
            {t('common.loading')}
          </div>
        </Card>
      ) : state.kind === 'error' ? (
        <div className="ot-movements__error" role="alert">
          <span>{t('movements.error.query')}</span>
          <Button variant="secondary" onClick={handleRetry}>
            {t('common.retry')}
          </Button>
        </div>
      ) : (
        <>
          <div
            className="ot-movements__totals"
            role="status"
            aria-live="polite"
            aria-label={t('movements.title') satisfies string}
          >
            <div>
              <span className="ot-movements__totals-label">{t('movements.totals.income')}</span>
              <span className="ot-movements__totals-value ot-movements__totals-value--income">
                {currencyFmt.format(totals.income)}
              </span>
            </div>
            <div>
              <span className="ot-movements__totals-label">{t('movements.totals.expense')}</span>
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

          {sortedRows.length === 0 ? (
            <Card padding="lg">
              <EmptyState
                title={t('movements.empty.filters.title')}
                body={t('movements.empty.in-range.body')}
                actions={
                  hasActiveFilters ? (
                    <Button variant="secondary" onClick={clearFilters}>
                      {t('movements.filters.clear')}
                    </Button>
                  ) : null
                }
              />
            </Card>
          ) : (
            <Table
              caption={t('movements.title') satisfies string}
              columns={columns}
              rows={sortedRows}
              getRowKey={(m) => m.id}
              sortBy={sortBy}
              sortDirection={sortDir}
              onSort={handleSort}
            />
          )}
        </>
      )}
    </div>
  );
}
