import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, FolderOpen, Landmark, Plus, X } from 'lucide-react';

import { Button } from '../../components/Button/index.js';
import { Card } from '../../components/Card/index.js';
import { EmptyState } from '../../components/EmptyState/index.js';
import { Table } from '../../components/Table/index.js';
import type { TableColumn, SortDirection } from '../../components/Table/index.js';
import { AddTransactionModal } from '../../components/AddTransactionModal/index.js';
import { TransactionDetailModal } from '../../components/TransactionDetailModal/index.js';
import { listMovements } from '../../services/movementsApi.js';
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from '../../services/transactionApi.js';
import { getAccounts } from '../../services/panelApi.js';
import { listCategories } from '../../services/categoriesApi.js';
import { listTags } from '../../services/tagsApi.js';
import type { MovementRecord } from '../../../shared/ipc-contracts/movements.js';
import type {
  CreateTransactionRequest,
  UpdateTransactionRequest,
} from '../../../shared/ipc-contracts/transaction.js';
import type { Account, RecentTransaction } from '../../../shared/ipc-contracts/panel.js';
import type { CategoryRecord, TagRecord } from '../../types/config.js';
import type { Movement, MovementStatus, MovementTotals } from '../../types/movement.js';
import './MovementsScreen.css';

/**
 * UX-003 — Movements screen (WI-13 real-data integration).
 *
 * States:
 *   - loading : initial IPC fetch in progress
 *   - loaded  : all rows in memory; filtering is client-side
 *   - error   : fetch failed; retry button
 *
 * Filters (all client-side over the full loaded set):
 *   type | account | category | month | minAmount | maxAmount | uncategorizedOnly
 *
 * WI-13 changes:
 *   - Replaced getMockMovements() with listMovements() IPC call
 *   - Added AddTransactionModal component integration
 *   - Map MovementRecord (ID-based wire shape) to Movement (label-based display shape)
 *   - Panel invalidation: after successful create, reload movements list
 */

type ScreenState =
  | { kind: 'loading' }
  | { kind: 'loaded'; rows: readonly Movement[] }
  | { kind: 'error'; message: string };

type SortColumn =
  | 'date'
  | 'account'
  | 'description'
  | 'category'
  | 'subcategory'
  | 'status'
  | 'amount';

type TypeFilter = 'all' | 'income' | 'expense';
type MonthFilter = 'all' | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/**
 * Map MovementRecord (ID-based wire shape from IPC) to Movement (label-based
 * display shape for UI). WI-14 will add proper category/tag label lookups;
 * for now we stub with the ID as the label (works for accounts since the
 * Panel contract already returns accountLabel).
 */
function mapMovementRecord(
  record: MovementRecord,
  accountsMap: Map<string, Account>,
  categoryNameById: Map<string, string>,
  subcategoryNameById: Map<string, string>,
): Movement {
  const account = accountsMap.get(record.accountId);
  const categoryName =
    record.categoryId != null
      ? (categoryNameById.get(record.categoryId) ?? record.categoryId)
      : null;
  const subcategoryName =
    record.subcategoryId != null
      ? (subcategoryNameById.get(record.subcategoryId) ?? record.subcategoryId)
      : null;
  return {
    id: record.id,
    date: record.date,
    type: record.type,
    amount: record.amount,
    currency: record.currency,
    description: record.description,
    account: account?.accountLabel ?? record.accountId,
    category: categoryName,
    subcategory: subcategoryName,
    tags: record.tagIds ?? [],
    status: record.status,
  };
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
        cmp = (a.category ?? '').localeCompare(b.category ?? '');
        break;
      case 'subcategory':
        cmp = (a.subcategory ?? '').localeCompare(b.subcategory ?? '');
        break;
      case 'status':
        cmp = a.status.localeCompare(b.status);
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

export interface MovementsScreenProps {
  /** Bumped by the App when Configuración creates a new account/category/tag.
   *  Forces a re-fetch of reference data so the Add-Transaction modal selects
   *  hydrate fresh values without a full reload. WI-15-lite. */
  readonly configRevision?: number;
}

export function MovementsScreen({ configRevision = 0 }: MovementsScreenProps = {}): JSX.Element {
  const { t, i18n } = useTranslation('common');
  const locale = i18n.language.startsWith('es') ? 'es-ES' : 'en-US';

  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [sortBy, setSortBy] = useState<SortColumn>('date');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<readonly CategoryRecord[]>([]);
  const [tags, setTags] = useState<readonly TagRecord[]>([]);

  // Selected transaction for detail modal
  const [selectedTx, setSelectedTx] = useState<RecentTransaction | null>(null);

  // Filter state
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<MonthFilter>('all');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [uncategorizedOnly, setUncategorizedOnly] = useState(false);

  // Row-selection state (Movements multi-select per prototype). IDs persist
  // across filter changes; the header "select-all" only toggles the rows that
  // are currently visible (matched by the active filters).
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  const loadAll = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const [accountsResp, records, categoriesResp, tagsResp] = await Promise.all([
        getAccounts(),
        listMovements(),
        // Reference-data calls may fail if Morpheus's handlers aren't online
        // yet; swallow so the main movements list keeps working.
        listCategories().catch(() => ({ categories: [] as readonly CategoryRecord[] })),
        listTags().catch(() => ({ tags: [] as readonly TagRecord[] })),
      ]);

      const accountsMap = new Map(accountsResp.accounts.map((a) => [a.id, a]));
      const categoryNameById = new Map<string, string>();
      const subcategoryNameById = new Map<string, string>();
      for (const cat of categoriesResp.categories) {
        categoryNameById.set(cat.id, cat.name);
        for (const sub of cat.subcategories ?? []) {
          subcategoryNameById.set(sub.id, sub.name);
        }
      }
      const rows = records.map((r) =>
        mapMovementRecord(r, accountsMap, categoryNameById, subcategoryNameById),
      );

      setAccounts(accountsResp.accounts);
      setCategories(categoriesResp.categories);
      setTags(tagsResp.tags);
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
  }, [loadAll, configRevision]);

  const handleRetry = useCallback(() => {
    void loadAll();
  }, [loadAll]);

  const handleOpenModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const handleSubmitTransaction = useCallback(
    async (input: CreateTransactionRequest) => {
      const result = await createTransaction(input);

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      // Reload movements list to show the new transaction
      await loadAll();

      // TODO(WI-14): Emit panel:invalidate event to trigger Panel refresh
      // For now, Panel will only reflect the change after a manual reload
    },
    [loadAll],
  );

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
    for (const m of allRows) {
      if (m.category != null) s.add(m.category);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [allRows]);

  const monthFmt = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'long' }), [locale]);
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
        // `null` is the canonical "uncategorised" signal (see
        // types/movement.ts). Treat empty strings defensively too.
        if (m.category != null && m.category.length > 0) return false;
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

  // ── Selection helpers ──────────────────────────────────────────────────
  // Derived set of IDs currently visible through the filter pipeline.
  const visibleIds = useMemo(() => new Set(filteredRows.map((m) => m.id)), [filteredRows]);

  // Count of visible rows that are currently in `selected`. Used for the
  // header checkbox tri-state (none / indeterminate / all).
  const selectedVisibleCount = useMemo(() => {
    let n = 0;
    for (const id of visibleIds) if (selected.has(id)) n += 1;
    return n;
  }, [selected, visibleIds]);

  const allVisibleSelected = visibleIds.size > 0 && selectedVisibleCount === visibleIds.size;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  const toggleRow = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllVisible = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }, [allVisibleSelected, visibleIds]);

  // Native checkboxes don't accept an `indeterminate` prop; we have to set it
  // imperatively. Callback ref avoids stale state from reused DOM nodes.
  const headerCbRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (headerCbRef.current) {
      headerCbRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  // ── Tag chip palette ───────────────────────────────────────────────────
  // Deterministic hash → palette index so a given tag always renders the
  // same hue. The mock Movement.tags are opaque strings; the real domain
  // will resolve tag colors from reference data. Values chosen in oklch-
  // friendly hex to mix cleanly with the prototype's color-mix() recipe.
  const TAG_COLORS = useMemo(
    () =>
      [
        '#9b72cf', // brand
        '#4e8bd6', // blue
        '#e06b6b', // coral
        '#6ca974', // green
        '#d6a94e', // amber
        '#b06bd6', // violet
      ] as const,
    [],
  );
  const tagColor = useCallback(
    (tag: string): string => {
      let h = 0;
      for (let i = 0; i < tag.length; i += 1) {
        h = (h * 31 + tag.charCodeAt(i)) >>> 0;
      }
      return TAG_COLORS[h % TAG_COLORS.length] as string;
    },
    [TAG_COLORS],
  );

  const statusLabel = useCallback((s: MovementStatus) => t(`movements.status.${s}`), [t]);
  const statusClass = (s: MovementStatus): string => {
    if (s === 'pending') return 'ot-badge ot-badge--pending';
    if (s === 'rejected') return 'ot-badge ot-badge--rejected';
    return 'ot-badge ot-badge--approved';
  };

  const columns: readonly TableColumn<Movement>[] = useMemo(
    () => [
      {
        id: 'select',
        header: (
          <input
            ref={headerCbRef}
            type="checkbox"
            className="ot-header-checkbox"
            checked={allVisibleSelected}
            onChange={toggleAllVisible}
            onClick={(e) => e.stopPropagation()}
            aria-label={t('movements.columns.select')}
          />
        ),
        sortable: false,
        align: 'center',
        width: 36,
        render: (m) => (
          <input
            type="checkbox"
            className="ot-row-checkbox"
            checked={selected.has(m.id)}
            onChange={() => toggleRow(m.id)}
            onClick={(e) => e.stopPropagation()}
            aria-label={t('movements.columns.select')}
          />
        ),
      },
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
        id: 'account',
        header: t('movements.columns.account'),
        sortable: true,
        render: (m) => (
          <span className="ot-account-pill" title={m.account}>
            <span className="ot-account-pill__dot" aria-hidden="true" />
            {m.account}
          </span>
        ),
      },
      {
        id: 'description',
        header: t('movements.columns.observations'),
        sortable: true,
        render: (m) => <span title={m.description}>{m.description}</span>,
      },
      {
        id: 'category',
        header: t('movements.columns.category'),
        sortable: true,
        render: (m) =>
          m.category != null ? (
            <span title={m.category}>{m.category}</span>
          ) : (
            <span className="ot-badge ot-badge--uncategorized">
              {t('movements.filters.uncategorizedOnly')}
            </span>
          ),
      },
      {
        id: 'subcategory',
        header: t('movements.columns.subcategory'),
        sortable: true,
        render: (m) =>
          m.subcategory != null ? (
            <span title={m.subcategory}>{m.subcategory}</span>
          ) : (
            <span className="ot-text-muted">—</span>
          ),
      },
      {
        id: 'tags',
        header: t('movements.columns.tags'),
        sortable: false,
        render: (m) => {
          if (m.tags.length === 0) return <span className="ot-text-muted">—</span>;
          // Show max 2 chips visibly; overflow as +N indicator with title listing rest
          const MAX_VISIBLE = 2;
          const visibleTags = m.tags.slice(0, MAX_VISIBLE);
          const overflowTags = m.tags.slice(MAX_VISIBLE);
          const overflowCount = overflowTags.length;
          return (
            <span className="ot-tag-cell" title={m.tags.join(', ')}>
              <span className="ot-tag-cell__chips">
                {visibleTags.map((tag) => (
                  <span
                    key={tag}
                    className="ot-tag-chip"
                    style={{ ['--ot-tag-color' as string]: tagColor(tag) }}
                    title={tag}
                  >
                    {tag}
                  </span>
                ))}
              </span>
              {overflowCount > 0 && (
                <span className="ot-tag-cell__overflow" title={overflowTags.join(', ')}>
                  +{overflowCount}
                </span>
              )}
            </span>
          );
        },
      },
      {
        id: 'status',
        header: t('movements.columns.status'),
        sortable: true,
        render: (m) => <span className={statusClass(m.status)}>{statusLabel(m.status)}</span>,
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
    [
      t,
      currencyFmt,
      dateFmt,
      selected,
      toggleRow,
      tagColor,
      statusLabel,
      allVisibleSelected,
      toggleAllVisible,
    ],
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
            onClick={handleOpenModal}
          >
            {t('movements.cta.new')}
          </Button>
        </div>
      </header>

      <AddTransactionModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleSubmitTransaction}
        accounts={accounts}
        categories={categories}
        tags={tags}
      />

      <div className="ot-filter-bar" role="group" aria-label={t('movements.filters.aria-label')}>
        <div
          className="ot-filter-bar__chips"
          role="tablist"
          aria-label={t('movements.filters.type.label')}
        >
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
              setMonthFilter(
                e.target.value === 'all' ? 'all' : (Number(e.target.value) as MonthFilter),
              )
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
          <button type="button" className="ot-filter-bar__clear" onClick={clearFilters}>
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
              <span className="ot-movements__totals-label">{t('movements.totals.countLabel')}</span>
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
            <div className="ot-movements__table-container">
              <Table
                caption={t('movements.title') satisfies string}
                columns={columns}
                rows={sortedRows}
                getRowKey={(m) => m.id}
                sortBy={sortBy}
                sortDirection={sortDir}
                onSort={handleSort}
                onRowClick={(row) => {
                  // Convert Movement to RecentTransaction for the detail modal
                  const tx: RecentTransaction = {
                    id: row.id,
                    date: row.date,
                    type: row.type,
                    amount: row.amount,
                    currency: row.currency,
                    description: row.description,
                    accountId: accounts.find((a) => a.accountLabel === row.account)?.id ?? '',
                    categoryId: row.category ?? null,
                    subcategoryId: row.subcategory ?? null,
                    tagIds: row.tags.slice(),
                    status: row.status === 'rejected' ? 'pending' : row.status,
                    reference: undefined,
                    details: undefined,
                    createdAt: new Date().toISOString(),
                  };
                  setSelectedTx(tx);
                }}
              />
            </div>
          )}

          <TransactionDetailModal
            isOpen={selectedTx !== null}
            onClose={() => setSelectedTx(null)}
            transaction={selectedTx}
            accounts={accounts}
            categories={categories}
            tags={tags}
            onUpdate={async (input: UpdateTransactionRequest) => {
              const result = await updateTransaction(input);
              if (!result.ok) {
                throw new Error(result.error.message);
              }
              // Reload movements list to reflect changes
              await loadAll();
            }}
            onDelete={async (id: string) => {
              const result = await deleteTransaction({ id });
              if (!result.ok) {
                throw new Error(result.error.message);
              }
              // Reload movements list to reflect changes
              await loadAll();
              setSelectedTx(null);
            }}
          />
        </>
      )}
    </div>
  );
}
