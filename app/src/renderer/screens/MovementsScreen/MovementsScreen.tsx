import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  FolderOpen,
  Landmark,
  Plus,
  RefreshCw,
  Tag,
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
import { BulkApproveConfirmModal } from '../../components/BulkApproveConfirmModal/index.js';
import { BulkAddLabelModal } from '../../components/BulkAddLabelModal/index.js';
import { SplitTransactionModal } from '../../components/SplitTransactionModal/index.js';
import { TransactionsTable } from '../../components/TransactionsTable/index.js';
import type { TransactionRow } from '../../components/TransactionsTable/index.js';
import { DateRangePicker, type Preset } from '../../components/DateRangePicker/index.js';
import { listMovements } from '../../services/movementsApi.js';
import { rehydrate } from '../../services/queryApi.js';
import { listAllNotes } from '../../services/notesApi.js';
import {
  bulkAddLabelToTransactions,
  bulkUpdateTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from '../../services/transactionApi.js';
import { getAccounts } from '../../services/panelApi.js';
import { listCategories } from '../../services/categoriesApi.js';
import { listTags } from '../../services/tagsApi.js';
import type { MovementRecord } from '../../../shared/ipc-contracts/movements.js';
import type { TransactionNote } from '../../../shared/ipc-contracts/notes.js';
import type {
  CreateTransactionRequest,
  UpdateTransactionRequest,
} from '../../../shared/ipc-contracts/transaction.js';
import type { Account, RecentTransaction } from '../../../shared/ipc-contracts/panel.js';
import type { CategoryRecord, TagRecord } from '../../types/config.js';
import type { DateRange, Movement, MovementTotals } from '../../types/movement.js';
import { DATE_PRESET_IDS, getPresetRange } from '../../utils/datePresets.js';
import {
  DEFAULT_MOVEMENTS_DATE_FILTER,
  loadPersistedDateFilter,
  matchesDateFilter,
  type MovementsDateFilter,
  persistDateFilter,
  resolveDateFilter,
} from '../../utils/movementsDateFilter.js';
import { useFormatters } from '../../format/index.js';
import { newUlid } from '../../utils/ulid.js';
import {
  buildHaystack,
  searchMovements,
  type SearchRow,
  type LookupTables,
  type Transaction,
} from '../../search/search.js';
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

/** Convert a `YYYY-MM-DD` string to a UTC-midnight Date (mirrors DateRangePicker). */
function isoToDate(v: string): Date {
  return new Date(`${v}T00:00:00Z`);
}

/** Convert a Date back to a `YYYY-MM-DD` string (mirrors DateRangePicker). */
function dateToIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

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
  if (!account) {
    console.warn(
      `MovementsScreen: accountId ${record.accountId} not found in accountsMap for movement ${record.id}`,
    );
  }
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
    accountId: record.accountId,
    category: categoryName,
    subcategory: subcategoryName,
    tags: (record.tagIds ?? []).map((id) => tagNameById.get(id) ?? id),
    status: record.status,
    reference: record.reference ?? null,
    details: record.details ?? null,
  };
}

/**
 * Map a MovementRecord (canonical wire shape) to the RecentTransaction shape
 * consumed by the TransactionDetailModal. Centralised so the detail modal and
 * the post-mutation refresh effect cannot drift out of sync.
 */
function recordToRecentTransaction(record: MovementRecord): RecentTransaction {
  return {
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
  /**
   * Initial filter overrides applied on first mount. Used by the Insights
   * drilldown footer link ("Ver todos los movimientos →"), per UX-005 §4
   * OQ-3: drop the user into Movimientos with the same tag intersection AND
   * date window they were just analysing.
   *
   * Contract:
   *   - `tagIds`: AND-ish — a movement is shown if it carries ALL listed tags
   *      (matches the drilldown's intersection semantics).
   *   - `windowStart` / `windowEnd`: ISO YYYY-MM-DD inclusive bounds.
   *   - `accountId`: Filters to a specific account (dashboard click-to-filter, #227).
   *
   * The values are read once via a ref-guarded effect; subsequent prop changes
   * do not re-apply (users can edit the filters freely after landing).
   */
  readonly initialFilters?: {
    readonly tagIds?: ReadonlyArray<string>;
    readonly windowStart?: string;
    readonly windowEnd?: string;
    readonly accountId?: string;
  };
  /**
   * SPEC-024 — Search query from AppShell topbar.
   * Applied as an additional filter (AND) after structured filters.
   */
  readonly searchQuery?: string;
}

/**
 * Row count above which the table switches to virtual rendering.
 * Below this threshold every row is mounted; above it only the visible window
 * is mounted. Keeps unit tests (small mock datasets) in non-virtual mode
 * while still virtualising realistic 5 k-row datasets.
 */
const VIRTUAL_ROW_THRESHOLD = 100;

export function MovementsScreen({
  configRevision = 0,
  initialFilters,
  searchQuery = '',
}: MovementsScreenProps = {}): JSX.Element {
  const { t } = useTranslation('common');
  const { formatCurrency, formatDateRange, isValidAmountInput, parseAmount, uiLocale } =
    useFormatters();

  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [sortBy, setSortBy] = useState<SortColumn>('date');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<readonly CategoryRecord[]>([]);
  const [tags, setTags] = useState<readonly TagRecord[]>([]);
  // SPEC-024 / bug from trial.3.11: the search box must match against note
  // text. We bulk-fetch every note in loadAll() and feed the map into the
  // search-index lookup tables. Refreshed alongside the rest of the
  // reference data on Refresh / configRevision-driven reloads.
  const [notesByTxId, setNotesByTxId] = useState<ReadonlyMap<string, readonly TransactionNote[]>>(
    () => new Map(),
  );

  // Selected transaction for detail modal — now includes the raw record
  // so we can check hasSplits and access split metadata.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Filter state
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [accountFilter, setAccountFilter] = useState<string>(
    () => initialFilters?.accountId ?? 'all',
  );
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  // Single-select tag filter (separate from the AND-intersection `tagIdsFilter`
  // below which is driven by the Insights drilldown). Holds the tag ID — not
  // the name — because tag names aren't guaranteed unique and `MovementRecord`
  // references tags by ID.
  const [tagFilter, setTagFilter] = useState<string>('all');
  // Tag intersection filter (AND semantics) — populated by the Insights
  // drilldown footer link via `initialFilters`. UI to add/remove tag chips
  // beyond the initial pre-applied set is deferred to a follow-up PR; for
  // now users see the chips and can clear them via the global "Clear filters"
  // affordance. PR 4b/4 only owns the *carry-through* contract.
  const [tagIdsFilter, setTagIdsFilter] = useState<ReadonlyArray<string>>(
    () => initialFilters?.tagIds?.slice() ?? [],
  );
  const [dateFilter, setDateFilterState] = useState<MovementsDateFilter>(() => {
    const start = initialFilters?.windowStart;
    const end = initialFilters?.windowEnd;
    if (start && end) {
      return { kind: 'custom', from: start, to: end };
    }
    return loadPersistedDateFilter();
  });
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
  // Bulk add-label modal state — same lifecycle as classify above.
  const [isBulkAddLabelOpen, setIsBulkAddLabelOpen] = useState(false);
  const [bulkSuccessMessage, setBulkSuccessMessage] = useState<string | null>(null);

  // Bulk-approve confirmation state. We snapshot the {pendingIds, skipped}
  // partition at the moment the user clicks "Aprobar" so the confirm copy
  // and the IPC payload stay consistent even if the underlying selection
  // mutates while the dialog is open.
  const [bulkApprove, setBulkApprove] = useState<{
    readonly pendingIds: readonly string[];
    readonly skippedCount: number;
  } | null>(null);

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

  const openBulkAddLabel = useCallback(() => {
    setIsBulkAddLabelOpen(true);
  }, []);

  const closeBulkAddLabel = useCallback(() => {
    setIsBulkAddLabelOpen(false);
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
      const [accountsResp, records, categoriesResp, tagsResp, notesResp] = await Promise.all([
        getAccounts(),
        listMovements(),
        // Reference-data calls may fail if Morpheus's handlers aren't online
        // yet; swallow so the main movements list keeps working.
        listCategories().catch(() => ({ categories: [] as readonly CategoryRecord[] })),
        listTags().catch(() => ({ tags: [] as readonly TagRecord[] })),
        // Notes fuel the search index. If the bulk-list handler isn't
        // registered (older main) we degrade gracefully — search just won't
        // match against note text on that build, matching the legacy behavior.
        listAllNotes().catch(() => ({
          ok: true as const,
          notesByTxId: {} as Record<string, TransactionNote[]>,
        })),
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
      // Rebuild the notes map from the bulk-list response. On error the
      // catch above produced an `{ ok: true, notesByTxId: {} }` shape, so we
      // can branch on `ok` uniformly here.
      if (notesResp.ok) {
        setNotesByTxId(new Map(Object.entries(notesResp.notesByTxId)));
      } else {
        setNotesByTxId(new Map());
      }
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

  // Refresh button: re-read the event log from disk first so we pick up
  // events written by other instances against the same shared workspace,
  // THEN re-fetch via loadAll. If rehydrate fails, surface a toast and skip
  // loadAll so the user knows the displayed data may still be stale.
  // Initial mount and `configRevision`-driven reloads intentionally skip
  // rehydrate — on cold start the model is already authoritative.
  const handleRefresh = useCallback(async () => {
    const result = await rehydrate();
    if (!result.ok) {
      setBulkSuccessMessage(t('movements.refresh.failed'));
      setTimeout(() => setBulkSuccessMessage(null), 5000);
      return;
    }
    await loadAll();
  }, [loadAll, t]);

  // ─── Bulk approve ────────────────────────────────────────────────────────
  // Open the bulk-approve confirmation: partition the current selection
  // into pending vs already-approved using the loaded rawRecords. If
  // nothing is pending we surface a no-op toast and skip the dialog.
  const openBulkApprove = useCallback(() => {
    const selectedIds = Array.from(selected);
    if (selectedIds.length === 0) return;
    const recordById =
      state.kind === 'loaded'
        ? new Map(state.rawRecords.map((r) => [r.id, r] as const))
        : new Map<string, MovementRecord>();
    const pendingIds: string[] = [];
    let skippedCount = 0;
    for (const id of selectedIds) {
      const rec = recordById.get(id);
      if (rec && rec.status === 'pending') {
        pendingIds.push(id);
      } else {
        skippedCount += 1;
      }
    }
    if (pendingIds.length === 0) {
      setBulkSuccessMessage(t('movements.bulk.approve.noPending'));
      setTimeout(() => setBulkSuccessMessage(null), 5000);
      return;
    }
    setBulkApprove({ pendingIds, skippedCount });
  }, [selected, state, t]);

  const closeBulkApprove = useCallback(() => {
    setBulkApprove(null);
  }, []);

  const confirmBulkApprove = useCallback(async () => {
    if (!bulkApprove) return;
    const { pendingIds } = bulkApprove;
    const total = pendingIds.length;
    const result = await bulkUpdateTransactions({
      ids: [...pendingIds],
      status: 'approved',
      correlationId: newUlid(),
    });

    if (result.ok) {
      setBulkApprove(null);
      clearSelection();
      await loadAll();
      const msg = t('movements.bulk.approve.successToast', { count: result.updatedCount });
      setBulkSuccessMessage(msg);
      setTimeout(() => setBulkSuccessMessage(null), 5000);
      return;
    }

    // Partial / full failure path — surface a concrete count and log details
    // so the failure is never silent.
    const failedCount = result.failures.length;
    const okCount = Math.max(0, total - failedCount);
    // eslint-disable-next-line no-console
    console.error('bulk-approve failures', result.failures);
    setBulkApprove(null);
    if (okCount > 0) {
      clearSelection();
      await loadAll();
    }
    const msg =
      okCount > 0
        ? t('movements.bulk.approve.partialToast', {
            ok: okCount,
            total,
            failed: failedCount,
          })
        : t('movements.bulk.approve.errorToast');
    setBulkSuccessMessage(msg);
    setTimeout(() => setBulkSuccessMessage(null), 5000);
  }, [bulkApprove, clearSelection, loadAll, t]);

  const flashBulkMessage = useCallback((msg: string) => {
    setBulkSuccessMessage(msg);
    setTimeout(() => setBulkSuccessMessage(null), 5000);
  }, []);

  const bulkSetType = useCallback(
    async (type: 'income' | 'expense') => {
      const ids = Array.from(selected);
      if (ids.length === 0) return;
      const label = t(`movements.bulk.setType.${type}`);
      if (!window.confirm(t('movements.bulk.setType.confirm', { count: ids.length, label }))) {
        return;
      }
      const result = await bulkUpdateTransactions({ ids, type, correlationId: newUlid() });
      if (result.ok) {
        clearSelection();
        await loadAll();
        flashBulkMessage(t('movements.bulk.setType.successToast', { count: result.updatedCount }));
        return;
      }
      // eslint-disable-next-line no-console
      console.error('bulk-set-type failures', result.failures);
      flashBulkMessage(t('movements.bulk.setType.errorToast'));
    },
    [selected, clearSelection, loadAll, flashBulkMessage, t],
  );

  const bulkDelete = useCallback(async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!window.confirm(t('movements.bulk.delete.confirm', { count: ids.length }))) return;
    let deleted = 0;
    const failures: string[] = [];
    for (const id of ids) {
      const result = await deleteTransaction({ id });
      if (result.ok) deleted += 1;
      else failures.push(`${id}: ${result.error.message}`);
    }
    if (failures.length > 0) {
      // eslint-disable-next-line no-console
      console.error('bulk-delete failures', failures);
    }
    clearSelection();
    await loadAll();
    flashBulkMessage(
      failures.length === 0
        ? t('movements.bulk.delete.successToast', { count: deleted })
        : t('movements.bulk.delete.partialToast', {
            ok: deleted,
            total: ids.length,
            failed: failures.length,
          }),
    );
  }, [selected, clearSelection, loadAll, flashBulkMessage, t]);

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

  // Modal selection is fully derived from `selectedId` + `rawRecordById`. This
  // is the single source of truth for the open detail modal — both view and
  // edit modes ALWAYS render the freshest record from the read-model. PR #133
  // attempted to fix the same regression with a sync `useEffect`, but its
  // bail-out check (`fresh === selectedRawRecord`) plus React effect ordering
  // around the loadAll() loading→loaded flash meant the post-save view modal
  // could remount holding the pre-save `selectedTx` snapshot. Deriving from
  // the read-model removes the race entirely.
  const selectedRawRecord = useMemo<MovementRecord | null>(() => {
    if (!selectedId) return null;
    return rawRecordById.get(selectedId) ?? null;
  }, [selectedId, rawRecordById]);

  const selectedTx = useMemo<RecentTransaction | null>(
    () => (selectedRawRecord ? recordToRecentTransaction(selectedRawRecord) : null),
    [selectedRawRecord],
  );

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

  // SPEC-024 — Build search index (haystack rows)
  const searchIndex = useMemo<readonly SearchRow[]>(() => {
    if (state.kind !== 'loaded') return [];

    // Build lookup tables for search
    const lookups: LookupTables = {
      accountNameById: new Map(accounts.map((a) => [a.id, a.accountLabel])),
      categoryNameById: new Map(categories.map((c) => [c.id, c.name])),
      subcategoryNameById: new Map(
        categories.flatMap((c) =>
          (c.subcategories ?? []).map((s) => [s.id, s.name] as [string, string]),
        ),
      ),
      tagNameById: new Map(tags.map((t) => [t.id, t.name])),
      // Bug fix (trial.3.11): notes are now bulk-fetched in loadAll() so the
      // search index can match against note text. `notesByTxId` re-renders
      // the index when notes refresh; structurally the Map<string,
      // TransactionNote[]> satisfies LookupTables' `{ text: string }[]`.
      notesByTxId,
      splitsByTxId: new Map(), // TODO: Fetch splits separately for search
    };

    return state.rawRecords.map((record) => {
      const tx: Transaction = {
        id: record.id,
        date: record.date,
        type: record.type,
        amount: record.amount,
        description: record.description,
        accountId: record.accountId,
        categoryId: record.categoryId,
        subcategoryId: record.subcategoryId,
        tagIds: record.tagIds ?? [],
        reference: record.reference ?? null,
        details: record.details ?? null,
      };
      return buildHaystack(tx, lookups);
    });
  }, [state, accounts, categories, tags, notesByTxId]);

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
    // Build from configured accounts, not observed rows - ensures all accounts appear.
    return accounts
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((acc) => ({ value: acc.id, label: acc.accountLabel }));
  }, [accounts]);

  const categoryOptions = useMemo(() => {
    const s = new Set<string>();
    for (const m of allRows) {
      if (m.category != null) s.add(m.category);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [allRows]);

  const tagOptions = useMemo(
    () => tags.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [tags],
  );

  // Persist preset/all selections (custom is intentionally dropped).
  const setDateFilter = useCallback((next: MovementsDateFilter) => {
    setDateFilterState(next);
    persistDateFilter(next);
  }, []);

  // ── Shared DateRangePicker wiring ──────────────────────────────────────
  // Consolidates onto the same component used by Export/Insights: an
  // always-visible preset radiogroup + inline From/To inputs. Movements keeps
  // ownership of the "All time" toggle, the active-range pill, and persistence.
  const dateRangePresets = useMemo<readonly Preset[]>(() => {
    // One `today` snapshot keeps preset equality deterministic (matters under
    // vitest fake timers and across midnight boundaries).
    const today = new Date();
    return DATE_PRESET_IDS.map((id) => ({
      id,
      label: t(`movements.filters.dateRange.presets.${id}`),
      range: () => {
        const r = getPresetRange(id, today);
        return { from: isoToDate(r.from), to: isoToDate(r.to) };
      },
    }));
  }, [t]);

  const dateRangeValue = useMemo<DateRange | null>(() => {
    const r = resolveDateFilter(dateFilter);
    if (r == null) return null;
    return { from: isoToDate(r.from), to: isoToDate(r.to) };
  }, [dateFilter]);

  const activeDatePresetId = dateFilter.kind === 'preset' ? dateFilter.id : null;

  const handleDateRangeChange = useCallback(
    (next: DateRange) => {
      const from = dateToIso(next.from);
      const to = dateToIso(next.to);
      // If the chosen range exactly matches a preset, store it as a preset so
      // it persists + highlights; otherwise it's a custom range (not persisted).
      const today = new Date();
      const matched = DATE_PRESET_IDS.find((id) => {
        const r = getPresetRange(id, today);
        return r.from === from && r.to === to;
      });
      setDateFilter(matched ? { kind: 'preset', id: matched } : { kind: 'custom', from, to });
    },
    [setDateFilter],
  );

  const dateRangeCustomLabels = useMemo(
    () => ({
      from: t('movements.filters.dateRange.customFrom'),
      to: t('movements.filters.dateRange.customTo'),
      apply: t('movements.filters.dateRange.apply'),
      invalidRange: t('movements.filters.dateRange.invalidRange'),
    }),
    [t],
  );

  const filteredRows = useMemo(() => {
    const minN = minAmount.trim() === '' ? null : parseAmount(minAmount);
    const maxN = maxAmount.trim() === '' ? null : parseAmount(maxAmount);
    // Build a lookup of tagIds per movement id so we can apply the
    // drilldown-driven AND filter without re-mapping the wire shape.
    const tagIdsByMovementId = new Map<string, ReadonlySet<string>>();
    if (tagIdsFilter.length > 0 && state.kind === 'loaded') {
      for (const r of state.rawRecords) {
        tagIdsByMovementId.set(r.id, new Set(r.tagIds ?? []));
      }
    }

    // SPEC-024 — Apply structured filters first
    const structuredFiltered = allRows.filter((m) => {
      if (typeFilter !== 'all' && m.type !== typeFilter) return false;
      if (accountFilter !== 'all' && m.accountId !== accountFilter) return false;
      // SPEC-023 FR10/AC6 — Category filter: include parent if parent OR any split matches.
      if (categoryFilter !== 'all') {
        const parentMatches = m.category === categoryFilter;
        // Check if any split categoryId matches (using raw record data).
        const record = state.kind === 'loaded' ? state.rawRecords.find((r) => r.id === m.id) : null;
        const splitMatches =
          record?.splitCategoryIds?.some((catId) => categoryLookup.get(catId) === categoryFilter) ??
          false;
        if (!parentMatches && !splitMatches) return false;
      }
      if (!matchesDateFilter(m, dateFilter)) return false;
      if (tagIdsFilter.length > 0) {
        const tagSet = tagIdsByMovementId.get(m.id);
        if (!tagSet) return false;
        for (const required of tagIdsFilter) {
          if (!tagSet.has(required)) return false;
        }
      }
      if (tagFilter !== 'all') {
        const record = state.kind === 'loaded' ? state.rawRecords.find((r) => r.id === m.id) : null;
        if (!(record?.tagIds ?? []).includes(tagFilter)) return false;
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

    // SPEC-024 FR8 — Apply search filter AFTER structured filters (AND composition)
    if (searchQuery.trim()) {
      const searchResult = searchMovements(searchQuery, searchIndex, uiLocale);
      return structuredFiltered.filter((m) => searchResult.matchedIds.has(m.id));
    }

    return structuredFiltered;
  }, [
    allRows,
    state,
    typeFilter,
    accountFilter,
    categoryFilter,
    categoryLookup,
    dateFilter,
    tagIdsFilter,
    tagFilter,
    minAmount,
    maxAmount,
    uncategorizedOnly,
    searchQuery,
    searchIndex,
    uiLocale,
    parseAmount,
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
    tagFilter !== 'all' ||
    !isDefaultDateFilter ||
    tagIdsFilter.length > 0 ||
    minAmount.trim() !== '' ||
    maxAmount.trim() !== '' ||
    uncategorizedOnly;

  const clearFilters = useCallback(() => {
    setTypeFilter('all');
    setAccountFilter('all');
    setCategoryFilter('all');
    setTagFilter('all');
    setDateFilter(DEFAULT_MOVEMENTS_DATE_FILTER);
    setTagIdsFilter([]);
    setMinAmount('');
    setMaxAmount('');
    setUncategorizedOnly(false);
  }, [setDateFilter]);

  const sortedRows = useMemo(
    () => sortRows(filteredRows, sortBy, sortDir),
    [filteredRows, sortBy, sortDir],
  );

  const totals = useMemo(() => computeTotals(filteredRows), [filteredRows]);

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

  // Navigation support (Issue #280) — transaction IDs and current index
  const transactionIds = useMemo(
    () => sortedTransactionRows.map((row) => row.id),
    [sortedTransactionRows],
  );

  const currentTransactionIndex = useMemo(() => {
    if (!selectedId) return -1;
    return transactionIds.indexOf(selectedId);
  }, [transactionIds, selectedId]);

  const handleNavigate = useCallback(
    (direction: 'prev' | 'next') => {
      const newIndex =
        direction === 'prev' ? currentTransactionIndex - 1 : currentTransactionIndex + 1;
      if (newIndex >= 0 && newIndex < transactionIds.length) {
        setSelectedId(transactionIds[newIndex]!);
      }
    },
    [currentTransactionIndex, transactionIds],
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
            variant="secondary"
            size="md"
            leadingIcon={<RefreshCw size={16} />}
            disabled={state.kind === 'loading'}
            onClick={() => void handleRefresh()}
            aria-label={t('movements.cta.refresh')}
            title={t('movements.cta.refresh')}
          >
            {t('movements.cta.refresh')}
          </Button>
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
        onApprove={openBulkApprove}
        onAddLabel={openBulkAddLabel}
        onSetType={bulkSetType}
        onDelete={bulkDelete}
        onCancel={clearSelection}
      />

      <BulkApproveConfirmModal
        isOpen={bulkApprove !== null}
        pendingCount={bulkApprove?.pendingIds.length ?? 0}
        skippedCount={bulkApprove?.skippedCount ?? 0}
        onClose={closeBulkApprove}
        onConfirm={confirmBulkApprove}
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

      <BulkAddLabelModal
        isOpen={isBulkAddLabelOpen}
        onClose={closeBulkAddLabel}
        selectedIds={Array.from(selected)}
        tags={tags}
        onBulkAddLabel={bulkAddLabelToTransactions}
        onSuccess={async ({ updatedCount, skippedSplitParentCount }) => {
          closeBulkAddLabel();
          clearSelection();
          // Read-model refresh after mutation: re-fetch movements so the
          // detail modal (and any other consumer) sees the new tag when the
          // user re-opens an affected transaction.
          await loadAll();
          const msg = t('movements.bulk.addLabel.successToast', { count: updatedCount });
          setBulkSuccessMessage(msg);
          setTimeout(() => setBulkSuccessMessage(null), 5000);
          // SPEC-023 FR15 — surface skipped split-parents on a follow-up
          // toast so the count discrepancy isn't silent.
          if (skippedSplitParentCount > 0) {
            setTimeout(() => {
              setBulkSuccessMessage(t('splits.bulk.skipped', { count: skippedSplitParentCount }));
              setTimeout(() => setBulkSuccessMessage(null), 5000);
            }, 5100);
          }
        }}
      />

      {/*
        Modals are rendered OUTSIDE the `state.kind === 'loaded'` branch
        below. Reason: when a save triggers `loadAll()`, the parent state
        flips to `loading` for a tick before swinging back to `loaded`.
        If the dialog lives inside the loaded fragment it unmounts during
        that flip, leaking the native <dialog> top-layer (Chromium marks
        the rest of the page inert and keyboard input freezes app-wide
        after ~3 saves). Keeping the modal mounted lets the existing
        `isOpen` effect close/reopen it cleanly — and the
        useCloseDialogOnUnmount hook on each modal still defends against
        any other path that unmounts us mid-open.
      */}
      <TransactionDetailModal
        isOpen={selectedTx !== null}
        onClose={() => {
          setSelectedId(null);
        }}
        transaction={selectedTx}
        rawRecord={selectedRawRecord}
        accounts={accounts}
        categories={categories}
        tags={tags}
        transactionIds={transactionIds}
        currentIndex={currentTransactionIndex}
        onNavigate={handleNavigate}
        onUpdate={async (input: UpdateTransactionRequest) => {
          const result = await updateTransaction(input);
          if (!result.ok) {
            throw new Error(result.error.message);
          }
          // UX: after a successful edit-save we close the detail
          // modal entirely and return the user to the bare
          // movements list. Pedro's directive (verbatim):
          //   "Close everything — return to the transaction list
          //    (simplest, no flash)"
          // Prior behaviour relied on the modal staying open in
          // view mode after save, which produced a 1-2s flash
          // (edit modal disappears during the loadAll() loading
          // state, then the view modal re-mounts with the fresh
          // record). Clearing selectedId here makes the detail
          // modal unmount synchronously in the same render that
          // applies the refreshed read-model — no flash, no
          // auto-reopen.
          await loadAll();
          setSelectedId(null);
        }}
        onDelete={async (id: string) => {
          const result = await deleteTransaction({ id });
          if (!result.ok) {
            throw new Error(result.error.message);
          }
          // Reload movements list to reflect changes
          await loadAll();
          setSelectedId(null);
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
          <div className="ot-filter-bar__date-picker">
            <DateRangePicker
              value={dateRangeValue}
              onChange={handleDateRangeChange}
              presets={dateRangePresets}
              activePresetId={activeDatePresetId}
              customLabels={dateRangeCustomLabels}
              customRangeLayout="popover"
              customTriggerLabel={t('movements.filters.dateRange.presets.custom')}
            />
            <button
              type="button"
              className={
                dateFilter.kind === 'all'
                  ? 'ot-filter-bar__chip ot-filter-bar__chip--active'
                  : 'ot-filter-bar__chip'
              }
              aria-pressed={dateFilter.kind === 'all'}
              onClick={() => setDateFilter({ kind: 'all' })}
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
                <span>{formatDateRange(range.from, range.to)}</span>
                <button
                  type="button"
                  className="ot-movements__date-pill-clear"
                  onClick={() => {
                    setDateFilter(DEFAULT_MOVEMENTS_DATE_FILTER);
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
                <option key={a.value} value={a.value}>
                  {a.label}
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
            <Tag size={14} aria-hidden="true" />
            <span className="ot-visually-hidden">{t('movements.filters.tag.label')}</span>
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              aria-label={t('movements.filters.tag.label')}
            >
              <option value="all">{t('movements.filters.tag.all')}</option>
              {tagOptions.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>

          <label className="ot-filter-bar__input ot-filter-bar__input--amount">
            <span className="ot-filter-bar__prefix">{t('movements.filters.amountMin')}</span>
            <input
              // ES locale sweep: `type="text"` so the browser doesn't reject
              // comma-decimal input (e.g. `100,50`). `parseLocaleAmount` in
              // the filter predicate above accepts both `,` and `.` separators.
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={minAmount}
              onChange={(e) => {
                if (isValidAmountInput(e.target.value)) {
                  setMinAmount(e.target.value);
                }
              }}
              aria-label={t('movements.filters.amountMin')}
            />
          </label>

          <label className="ot-filter-bar__input ot-filter-bar__input--amount">
            <span className="ot-filter-bar__prefix">{t('movements.filters.amountMax')}</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="∞"
              value={maxAmount}
              onChange={(e) => {
                if (isValidAmountInput(e.target.value)) {
                  setMaxAmount(e.target.value);
                }
              }}
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
                <div className="ot-kpi__value">{formatCurrency(totals.income, 'EUR')}</div>
              </div>
            </div>
            <div className="ot-kpi ot-kpi--expense">
              <div className="ot-kpi__icon">
                <TrendingDown size={20} />
              </div>
              <div className="ot-kpi__content">
                <div className="ot-kpi__label">{t('movements.totals.expense')}</div>
                <div className="ot-kpi__value">{formatCurrency(totals.expense, 'EUR')}</div>
              </div>
            </div>
            <div className="ot-kpi ot-kpi--net">
              <div className="ot-kpi__icon">
                <Calculator size={20} />
              </div>
              <div className="ot-kpi__content">
                <div className="ot-kpi__label">{t('movements.totals.net')}</div>
                <div className="ot-kpi__value">{formatCurrency(totals.net, 'EUR')}</div>
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
                  // Selection is just an ID; selectedTx/selectedRawRecord are
                  // derived from rawRecordById, so the modal always renders
                  // the freshest record.
                  if (!rawRecordById.has(row.id)) return;
                  setSelectedId(row.id);
                }}
                onSplitClick={(row) => {
                  const record = rawRecordById.get(row.id);
                  if (record) openSplitModal(record);
                }}
                onSplitAction={(row) => {
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
        </>
      )}
    </div>
  );
}
