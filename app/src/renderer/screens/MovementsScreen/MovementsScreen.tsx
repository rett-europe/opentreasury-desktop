import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  FolderOpen,
  Landmark,
  Plus,
  X,
  TrendingUp,
  TrendingDown,
  Calculator,
} from 'lucide-react';

import { Button } from '../../components/Button/index.js';
import { Card } from '../../components/Card/index.js';
import { EmptyState } from '../../components/EmptyState/index.js';
import type { SortDirection } from '../../components/Table/index.js';
import { AddTransactionModal } from '../../components/AddTransactionModal/index.js';
import { TransactionDetailModal } from '../../components/TransactionDetailModal/index.js';
import { BulkActionsBar } from '../../components/BulkActionsBar/index.js';
import { BulkClassifyModal } from '../../components/BulkClassifyModal/index.js';
import { SplitTransactionModal } from '../../components/SplitTransactionModal/index.js';
import { TransactionsTable } from '../../components/TransactionsTable/index.js';
import type { TransactionRow } from '../../components/TransactionsTable/index.js';
import { listMovements } from '../../services/movementsApi.js';
import {
  bulkUpdateTransactions,
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
import type { Movement, MovementTotals } from '../../types/movement.js';
import { DATE_PRESET_IDS, getPresetRange } from '../../utils/datePresets.js';
import {
  DEFAULT_MOVEMENTS_DATE_FILTER,
  loadPersistedDateFilter,
  matchesDateFilter,
  type MovementsDateFilter,
  persistDateFilter,
  resolveDateFilter,
} from '../../utils/movementsDateFilter.js';
import { formatDateRange } from '../../utils/dateFormat.js';
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
  | { kind: 'loaded'; rows: readonly Movement[]; rawRecords: readonly MovementRecord[] }
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
  tagNameById: Map<string, string>,
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
    tags: (record.tagIds ?? []).map((id) => tagNameById.get(id) ?? id),
    status: record.status,
    reference: record.reference ?? null,
    details: record.details ?? null,
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

/**
 * Row count above which the table switches to virtual rendering.
 * Below this threshold every row is mounted; above it only the visible window
 * is mounted. Keeps unit tests (small mock datasets) in non-virtual mode
 * while still virtualising realistic 5 k-row datasets.
 */
const VIRTUAL_ROW_THRESHOLD = 100;

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

  // Selected transaction for detail modal — now includes the raw record
  // so we can check hasSplits and access split metadata.
  const [selectedTx, setSelectedTx] = useState<RecentTransaction | null>(null);
  const [selectedRawRecord, setSelectedRawRecord] = useState<MovementRecord | null>(null);

  // Filter state
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [dateFilter, setDateFilterState] = useState<MovementsDateFilter>(() =>
    loadPersistedDateFilter(),
  );
  // Open state for the custom-range popover. Independent of dateFilter so the
  // user can preview the popover without losing the active filter until Apply.
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  // Local draft state for the two custom date inputs. Reset on popover open.
  const [customDraftFrom, setCustomDraftFrom] = useState<string>('');
  const [customDraftTo, setCustomDraftTo] = useState<string>('');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [uncategorizedOnly, setUncategorizedOnly] = useState(false);

  // Row-selection state (Movements multi-select per prototype). IDs persist
  // across filter changes; the header "select-all" only toggles the rows that
  // are currently visible (matched by the active filters).
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  // WI-31b — bulk-classify modal state. The BulkActionsBar opens it with the
  // current selection; on success we clear `selected` and re-run loadAll()
  // (same invalidation pattern as the detail modal's onUpdate).
  const [isBulkClassifyOpen, setIsBulkClassifyOpen] = useState(false);
  const [bulkSuccessMessage, setBulkSuccessMessage] = useState<string | null>(null);

  // SPEC-023 — split modal state. Opened from row action (context or detail).
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [splitTargetTx, setSplitTargetTx] = useState<MovementRecord | null>(null);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const openBulkClassify = useCallback(() => {
    setIsBulkClassifyOpen(true);
  }, []);

  const closeBulkClassify = useCallback(() => {
    setIsBulkClassifyOpen(false);
  }, []);

  const openSplitModal = useCallback((record: MovementRecord) => {
    setSplitTargetTx(record);
    setIsSplitModalOpen(true);
  }, []);

  const closeSplitModal = useCallback(() => {
    setIsSplitModalOpen(false);
    setSplitTargetTx(null);
  }, []);

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
      const tagNameById = new Map<string, string>(tagsResp.tags.map((t) => [t.id, t.name]));
      const rows = records.map((r) =>
        mapMovementRecord(r, accountsMap, categoryNameById, subcategoryNameById, tagNameById),
      );

      setAccounts(accountsResp.accounts);
      setCategories(categoriesResp.categories);
      setTags(tagsResp.tags);
      setState({ kind: 'loaded', rows, rawRecords: records });
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

  // Build ID→record lookup for split modal / badge rendering.
  const rawRecordById = useMemo(() => {
    if (state.kind !== 'loaded') return new Map<string, MovementRecord>();
    return new Map(state.rawRecords.map((r) => [r.id, r]));
  }, [state]);

  // Build lookup maps for TransactionsTable
  const accountLookup = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    for (const acc of accounts) {
      map.set(acc.id, {
        name: acc.bankNameShort ?? acc.accountLabel,
        color: acc.color ?? '#888888',
      });
    }
    return map;
  }, [accounts]);

  const categoryLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) {
      map.set(cat.id, cat.name);
    }
    return map;
  }, [categories]);

  const subcategoryLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) {
      for (const sub of cat.subcategories ?? []) {
        map.set(sub.id, sub.name);
      }
    }
    return map;
  }, [categories]);

  const tagLookup = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    for (const tag of tags) {
      map.set(tag.id, { name: tag.name, color: tag.color ?? '#9b72cf' });
    }
    return map;
  }, [tags]);

  // Map Movement[] → TransactionRow[] for the shared table
  const transactionRows: readonly TransactionRow[] = useMemo(() => {
    if (state.kind !== 'loaded') return [];
    return state.rawRecords.map((record) => {
      const row: TransactionRow = {
        id: record.id,
        date: record.date,
        type: record.type,
        amount: record.amount,
        description: record.description,
        accountId: record.accountId,
        categoryId: record.categoryId,
        subcategoryId: record.subcategoryId,
        tagIds: record.tagIds,
        status: record.status,
        reference: record.reference ?? null,
        details: record.details ?? null,
        hasSplits: record.hasSplits,
        splitCount: record.splitCount,
      };
      return row;
    });
  }, [state]);

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
  // Suppress unused-warning while monthNames stays around for future ref.
  void monthNames;

  // Persist preset/all selections (custom is intentionally dropped).
  const setDateFilter = useCallback((next: MovementsDateFilter) => {
    setDateFilterState(next);
    persistDateFilter(next);
  }, []);

  const filteredRows = useMemo(() => {
    const minN = minAmount.trim() === '' ? null : Number(minAmount);
    const maxN = maxAmount.trim() === '' ? null : Number(maxAmount);
    return allRows.filter((m) => {
      if (typeFilter !== 'all' && m.type !== typeFilter) return false;
      if (accountFilter !== 'all' && m.account !== accountFilter) return false;
      if (categoryFilter !== 'all' && m.category !== categoryFilter) return false;
      if (!matchesDateFilter(m, dateFilter)) return false;
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
    dateFilter,
    minAmount,
    maxAmount,
    uncategorizedOnly,
  ]);

  // Filter TransactionRows for the table
  const filteredTransactionRows = useMemo(() => {
    const visibleIds = new Set(filteredRows.map((m) => m.id));
    return transactionRows.filter((row) => visibleIds.has(row.id));
  }, [transactionRows, filteredRows]);

  // The default date filter (this-month) is always "active" but doesn't
  // count as user-applied. Anything else does.
  const isDefaultDateFilter = dateFilter.kind === 'preset' && dateFilter.id === 'this-month';

  const hasActiveFilters =
    typeFilter !== 'all' ||
    accountFilter !== 'all' ||
    categoryFilter !== 'all' ||
    !isDefaultDateFilter ||
    minAmount.trim() !== '' ||
    maxAmount.trim() !== '' ||
    uncategorizedOnly;

  const clearFilters = useCallback(() => {
    setTypeFilter('all');
    setAccountFilter('all');
    setCategoryFilter('all');
    setDateFilter(DEFAULT_MOVEMENTS_DATE_FILTER);
    setIsCustomOpen(false);
    setMinAmount('');
    setMaxAmount('');
    setUncategorizedOnly(false);
  }, [setDateFilter]);

  const sortedRows = useMemo(
    () => sortRows(filteredRows, sortBy, sortDir),
    [filteredRows, sortBy, sortDir],
  );

  const totals = useMemo(() => computeTotals(filteredRows), [filteredRows]);

  const currencyFmt = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }),
    [locale],
  );

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

  // Sort transaction rows by the same column/direction as the Movement rows
  const sortedTransactionRows = useMemo(() => {
    if (sortDir === null) return filteredTransactionRows;
    const sorted = [...filteredTransactionRows];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date') cmp = a.date.localeCompare(b.date);
      else if (sortBy === 'account') {
        const aName = accountLookup.get(a.accountId)?.name ?? '';
        const bName = accountLookup.get(b.accountId)?.name ?? '';
        cmp = aName.localeCompare(bName);
      } else if (sortBy === 'description') cmp = a.description.localeCompare(b.description);
      else if (sortBy === 'category') {
        const aCat = a.categoryId ? (categoryLookup.get(a.categoryId) ?? '') : '';
        const bCat = b.categoryId ? (categoryLookup.get(b.categoryId) ?? '') : '';
        cmp = aCat.localeCompare(bCat);
      } else if (sortBy === 'subcategory') {
        const aSub = a.subcategoryId ? (subcategoryLookup.get(a.subcategoryId) ?? '') : '';
        const bSub = b.subcategoryId ? (subcategoryLookup.get(b.subcategoryId) ?? '') : '';
        cmp = aSub.localeCompare(bSub);
      } else if (sortBy === 'status') cmp = a.status.localeCompare(b.status);
      else if (sortBy === 'amount') cmp = a.amount - b.amount;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredTransactionRows, sortBy, sortDir, accountLookup, categoryLookup, subcategoryLookup]);

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

      {/* SPEC-023 — bulk-classify skipped-count toast */}
      {bulkSuccessMessage && (
        <div className="ot-movements__success-toast" role="status" aria-live="polite">
          {bulkSuccessMessage}
        </div>
      )}

      <AddTransactionModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleSubmitTransaction}
        accounts={accounts}
        categories={categories}
        tags={tags}
      />

      <BulkActionsBar
        selectedCount={selected.size}
        onClassify={openBulkClassify}
        onCancel={clearSelection}
      />

      <BulkClassifyModal
        isOpen={isBulkClassifyOpen}
        onClose={closeBulkClassify}
        selectedIds={Array.from(selected)}
        categories={categories}
        onBulkUpdate={bulkUpdateTransactions}
        onSuccess={async ({ skippedSplitParentCount }) => {
          closeBulkClassify();
          clearSelection();
          await loadAll();
          // SPEC-023 FR15 — show skipped-count message if any split parents were skipped.
          if (skippedSplitParentCount > 0) {
            const msg = t('splits.bulk.skipped', { count: skippedSplitParentCount });
            setBulkSuccessMessage(msg);
            setTimeout(() => setBulkSuccessMessage(null), 5000);
          }
        }}
      />

      <div className="ot-filter-bar">
        <div
          className="ot-filter-bar__row ot-filter-bar__row--scope"
          role="group"
          aria-label={t('movements.filters.dateRange.label')}
        >
          <span className="ot-filter-bar__date-label" id="ot-date-filter-label">
            <Calendar size={14} aria-hidden="true" />
            {t('movements.filters.dateRange.label')}
          </span>
          <div
            className="ot-filter-bar__date-chips"
            role="radiogroup"
            aria-labelledby="ot-date-filter-label"
          >
            {DATE_PRESET_IDS.map((id) => {
              const checked = dateFilter.kind === 'preset' && dateFilter.id === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  className={
                    checked
                      ? 'ot-filter-bar__chip ot-filter-bar__chip--active'
                      : 'ot-filter-bar__chip'
                  }
                  onClick={() => {
                    setDateFilter({ kind: 'preset', id });
                    setIsCustomOpen(false);
                  }}
                >
                  {t(`movements.filters.dateRange.presets.${id}`)}
                </button>
              );
            })}
            <div className="ot-filter-bar__date-custom-anchor">
              <button
                type="button"
                role="radio"
                aria-checked={dateFilter.kind === 'custom'}
                aria-haspopup="dialog"
                aria-expanded={isCustomOpen}
                className={
                  dateFilter.kind === 'custom' || isCustomOpen
                    ? 'ot-filter-bar__chip ot-filter-bar__chip--active'
                    : 'ot-filter-bar__chip'
                }
                onClick={() => {
                  setIsCustomOpen((open) => {
                    if (!open) {
                      // Seed inputs from current resolved range so the popover
                      // opens with sensible defaults.
                      const seed = resolveDateFilter(dateFilter) ?? getPresetRange('this-month');
                      setCustomDraftFrom(seed.from);
                      setCustomDraftTo(seed.to);
                    }
                    return !open;
                  });
                }}
              >
                {t('movements.filters.dateRange.presets.custom')}
              </button>
              {isCustomOpen ? (
                <div
                  role="dialog"
                  aria-label={t('movements.filters.dateRange.presets.custom')}
                  className="ot-filter-bar__date-popover"
                >
                  <label className="ot-filter-bar__date-field">
                    <span>{t('movements.filters.dateRange.customFrom')}</span>
                    <input
                      type="date"
                      value={customDraftFrom}
                      onChange={(e) => setCustomDraftFrom(e.target.value)}
                    />
                  </label>
                  <label className="ot-filter-bar__date-field">
                    <span>{t('movements.filters.dateRange.customTo')}</span>
                    <input
                      type="date"
                      value={customDraftTo}
                      onChange={(e) => setCustomDraftTo(e.target.value)}
                      aria-invalid={
                        customDraftFrom && customDraftTo && customDraftTo < customDraftFrom
                          ? true
                          : undefined
                      }
                    />
                  </label>
                  {customDraftFrom && customDraftTo && customDraftTo < customDraftFrom ? (
                    <p className="ot-filter-bar__date-error" role="alert">
                      {t('movements.filters.dateRange.invalidRange')}
                    </p>
                  ) : null}
                  <div className="ot-filter-bar__date-actions">
                    <Button
                      variant="primary"
                      onClick={() => {
                        if (!customDraftFrom || !customDraftTo || customDraftTo < customDraftFrom) {
                          return;
                        }
                        setDateFilter({
                          kind: 'custom',
                          from: customDraftFrom,
                          to: customDraftTo,
                        });
                        setIsCustomOpen(false);
                      }}
                      disabled={
                        !customDraftFrom || !customDraftTo || customDraftTo < customDraftFrom
                      }
                    >
                      {t('movements.filters.dateRange.apply')}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              role="radio"
              aria-checked={dateFilter.kind === 'all'}
              className={
                dateFilter.kind === 'all'
                  ? 'ot-filter-bar__chip ot-filter-bar__chip--active'
                  : 'ot-filter-bar__chip'
              }
              onClick={() => {
                setDateFilter({ kind: 'all' });
                setIsCustomOpen(false);
              }}
            >
              {t('movements.filters.dateRange.presets.all')}
            </button>
          </div>

          {(() => {
            const range = resolveDateFilter(dateFilter);
            if (range == null || isDefaultDateFilter) return null;
            return (
              <span className="ot-movements__date-pill">
                <Calendar size={14} aria-hidden="true" />
                <span>{formatDateRange(range.from, range.to, locale)}</span>
                <button
                  type="button"
                  className="ot-movements__date-pill-clear"
                  onClick={() => {
                    setDateFilter(DEFAULT_MOVEMENTS_DATE_FILTER);
                    setIsCustomOpen(false);
                  }}
                  aria-label={t('movements.filters.dateRange.clear')}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
            );
          })()}
        </div>

        <div
          className="ot-filter-bar__row ot-filter-bar__row--filters"
          role="group"
          aria-label={t('movements.filters.aria-label')}
        >
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
          <div className="ot-kpi-strip" role="status" aria-live="polite">
            <div className="ot-kpi ot-kpi--income">
              <div className="ot-kpi__icon">
                <TrendingUp size={20} />
              </div>
              <div className="ot-kpi__content">
                <div className="ot-kpi__label">{t('movements.totals.income')}</div>
                <div className="ot-kpi__value">{currencyFmt.format(totals.income)}</div>
              </div>
            </div>
            <div className="ot-kpi ot-kpi--expense">
              <div className="ot-kpi__icon">
                <TrendingDown size={20} />
              </div>
              <div className="ot-kpi__content">
                <div className="ot-kpi__label">{t('movements.totals.expense')}</div>
                <div className="ot-kpi__value">{currencyFmt.format(totals.expense)}</div>
              </div>
            </div>
            <div className="ot-kpi ot-kpi--net">
              <div className="ot-kpi__icon">
                <Calculator size={20} />
              </div>
              <div className="ot-kpi__content">
                <div className="ot-kpi__label">{t('movements.totals.net')}</div>
                <div className="ot-kpi__value">{currencyFmt.format(totals.net)}</div>
              </div>
            </div>
            <div className="ot-kpi">
              <div
                className="ot-kpi__icon"
                style={{
                  background: 'var(--color-surface-tertiary)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <span
                  style={{
                    fontSize: 'var(--font-size-14)',
                    fontWeight: 'var(--font-weight-semibold)',
                  }}
                >
                  #
                </span>
              </div>
              <div className="ot-kpi__content">
                <div className="ot-kpi__label">{t('movements.totals.countLabel')}</div>
                <div className="ot-kpi__value">{totals.count}</div>
              </div>
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
              <TransactionsTable
                rows={sortedTransactionRows}
                accountLookup={accountLookup}
                tagLookup={tagLookup}
                categoryLookup={categoryLookup}
                subcategoryLookup={subcategoryLookup}
                showSelectColumn
                selectedIds={selected}
                onToggleRow={toggleRow}
                onToggleAll={toggleAllVisible}
                allSelected={allVisibleSelected}
                someSelected={someVisibleSelected}
                onRowClick={(row) => {
                  // Convert TransactionRow to RecentTransaction for the detail modal
                  const record = rawRecordById.get(row.id);
                  if (!record) return;
                  const tx: RecentTransaction = {
                    id: record.id,
                    date: record.date,
                    type: record.type,
                    amount: record.amount,
                    currency: record.currency,
                    description: record.description,
                    accountId: record.accountId,
                    categoryId: record.categoryId,
                    subcategoryId: record.subcategoryId,
                    tagIds: record.tagIds.slice(),
                    status: record.status,
                    reference: record.reference ?? undefined,
                    details: record.details ?? undefined,
                    createdAt: record.createdAt,
                  };
                  setSelectedTx(tx);
                  setSelectedRawRecord(record);
                }}
                onSplitClick={(row) => {
                  const record = rawRecordById.get(row.id);
                  if (record) openSplitModal(record);
                }}
                sortBy={sortBy}
                sortDirection={sortDir}
                onSort={handleSort}
                getRowClassName={(row) => {
                  const record = rawRecordById.get(row.id);
                  return record?.hasSplits ? 'ot-split-parent' : undefined;
                }}
                virtualise={sortedTransactionRows.length >= VIRTUAL_ROW_THRESHOLD}
                containerStyle={
                  sortedTransactionRows.length >= VIRTUAL_ROW_THRESHOLD
                    ? { maxHeight: 'calc(100vh - 440px)', minHeight: '300px' }
                    : undefined
                }
              />
            </div>
          )}

          <TransactionDetailModal
            isOpen={selectedTx !== null}
            onClose={() => {
              setSelectedTx(null);
              setSelectedRawRecord(null);
            }}
            transaction={selectedTx}
            rawRecord={selectedRawRecord}
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
              setSelectedRawRecord(null);
            }}
            onOpenSplit={() => {
              if (selectedRawRecord) {
                openSplitModal(selectedRawRecord);
              }
            }}
          />

          <SplitTransactionModal
            isOpen={isSplitModalOpen}
            onClose={closeSplitModal}
            transaction={splitTargetTx}
            categories={categories}
            onSplitSaved={async () => {
              closeSplitModal();
              await loadAll();
            }}
          />
        </>
      )}
    </div>
  );
}
