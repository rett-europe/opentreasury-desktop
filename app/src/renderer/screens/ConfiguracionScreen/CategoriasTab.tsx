import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Folder,
  Search,
  Edit,
  Archive,
  RotateCcw,
  Check,
  X as XIcon,
  Trash2,
} from 'lucide-react';

import { Button } from '../../components/Button/index.js';
import { EmptyState } from '../../components/EmptyState/index.js';
import { AddCategoryModal, ArchiveConfirmModal } from '../../components/ConfigModals/index.js';
import { ConfirmDialog } from '../../components/ConfirmDialog/index.js';
import { listCategories, getCategoriesUsage } from '../../services/categoriesApi.js';
import {
  archiveCategory,
  archiveSubcategory,
  ConfigMutationError,
  createSubcategory,
  deleteCategory,
  deleteSubcategory,
  isArchived,
  listSubcategoriesUsage,
  unarchiveCategory,
  unarchiveSubcategory,
  updateSubcategory,
  type ConfigCategory,
  type SubcategoryRecord,
} from '../../services/configMutationsApi.js';
import { mapConfigMutationErrorToMessage } from '../../components/ConfigModals/errorMap.js';
import type { CategoryKind, CategoryRecord } from '../../types/config.js';

type State =
  | { kind: 'loading' }
  | { kind: 'loaded'; categories: readonly ConfigCategory[] }
  | { kind: 'error'; message: string };

type KindFilter = 'all' | CategoryKind;

interface CategoryUsage {
  readonly transactionCount: number;
  readonly classifiedCount: number;
}

const ZERO_USAGE: CategoryUsage = { transactionCount: 0, classifiedCount: 0 };

export interface CategoriasTabProps {
  readonly onListChanged?: (() => void) | undefined;
}

/**
 * Categorías — master-detail layout matching the 2026-04-22 prototype.
 *
 * Layout anatomy (faithful to prototype-categorias.png):
 *   · Page header: title + count summary (total, ingresos in green, gastos
 *     in red) on the left, primary "Nueva categoría" button on the right.
 *     "Exportar" is intentionally omitted per decisions/inbox constraint.
 *   · Filter bar: segmented chip group (Todas / Ingresos / Gastos) + a
 *     grow-flex search input.
 *   · Master card: rows of `folder-tile + title/sub + kind-pill + actions`
 *     with active-row lavender tint and a "Nueva categoría" ghost footer.
 *   · Detail card: header with category name + kind-pill + subtitle,
 *     "Renombrar"/"Subcategoría" buttons, placeholder rows with purple
 *     dot + "Esta categoría aún no tiene subcategorías." and an
 *     "+ Añadir subcategoría a {name}" ghost footer (disabled until
 *     SubcategoryAdded events land).
 *
 * issue #52 — subcategory & usage counters now reflect real data: subcategory
 * count comes from `CategoryRecord.subcategories` (active only); transaction
 * and classified counters come from the `categories:usage` IPC.
 */
export function CategoriasTab({ onListChanged }: CategoriasTabProps): JSX.Element {
  const { t } = useTranslation('common');
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ConfigCategory | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ConfigCategory | null>(null);
  const [subArchiveTarget, setSubArchiveTarget] = useState<SubcategoryRecord | null>(null);
  // WI-21-followup — hard-delete targets + per-subcategory usage map.
  // Categories already expose `usage` (transactionCount/classifiedCount via
  // getCategoriesUsage); subcategories get their own listSubcategoriesUsage
  // IPC. The category delete handler also sums references from the parent's
  // subcategories on the server side, but we surface a UI gate here too so
  // the destructive CTA never shows up for a category that has movements.
  const [deleteCatTarget, setDeleteCatTarget] = useState<ConfigCategory | null>(null);
  const [deleteSubTarget, setDeleteSubTarget] = useState<SubcategoryRecord | null>(null);
  const [subUsage, setSubUsage] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [subAddName, setSubAddName] = useState('');
  const [subAddOpen, setSubAddOpen] = useState(false);
  const [subEditing, setSubEditing] = useState<SubcategoryRecord | null>(null);
  const [subEditName, setSubEditName] = useState('');
  const [subError, setSubError] = useState<string | null>(null);
  const [subBusy, setSubBusy] = useState(false);
  // issue #52 — per-category usage counters keyed by categoryId. Populated
  // alongside listCategories so the master rows and detail header reflect
  // real transaction / classified totals instead of placeholder zeros.
  const [usage, setUsage] = useState<ReadonlyMap<string, CategoryUsage>>(() => new Map());

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const [resp, usageResp, subUsageResp] = await Promise.all([
        listCategories({ includeArchived: showArchived }),
        getCategoriesUsage(),
        listSubcategoriesUsage(),
      ]);
      const cats = resp.categories as readonly ConfigCategory[];
      setState({ kind: 'loaded', categories: cats });
      setUsage(
        new Map(
          usageResp.usage.map((u) => [
            u.categoryId,
            { transactionCount: u.transactionCount, classifiedCount: u.classifiedCount },
          ]),
        ),
      );
      setSubUsage(new Map(subUsageResp.usage.map((u) => [u.subcategoryId, u.transactionCount])));
      setSelectedId((prev) => {
        if (prev && cats.some((c) => c.id === prev)) return prev;
        return cats[0]?.id ?? null;
      });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'unknown' });
    }
  }, [showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaved = useCallback(
    (_saved: CategoryRecord) => {
      void load();
      onListChanged?.();
    },
    [load, onListChanged],
  );

  const handleArchive = useCallback(async () => {
    if (!archiveTarget) return;
    await archiveCategory(archiveTarget.id);
    await load();
    onListChanged?.();
  }, [archiveTarget, load, onListChanged]);

  const handleUnarchive = useCallback(
    async (id: string) => {
      try {
        await unarchiveCategory(id);
        await load();
        onListChanged?.();
      } catch (err) {
        const message =
          err instanceof ConfigMutationError
            ? mapConfigMutationErrorToMessage(err, t)
            : err instanceof Error
              ? err.message
              : t('configuracion.errors.submitFailed');
        setState({ kind: 'error', message });
      }
    },
    [load, onListChanged, t],
  );

  const categories = useMemo(
    () => (state.kind === 'loaded' ? state.categories : ([] as readonly ConfigCategory[])),
    [state],
  );

  const counts = useMemo(
    () => ({
      all: categories.filter((c) => !isArchived(c)).length,
      income: categories.filter((c) => c.kind === 'income' && !isArchived(c)).length,
      expense: categories.filter((c) => c.kind === 'expense' && !isArchived(c)).length,
    }),
    [categories],
  );

  const visibleCategories = useMemo(
    () => categories.filter((c) => showArchived || !isArchived(c)),
    [categories, showArchived],
  );

  const filteredCategories = useMemo(() => {
    return visibleCategories.filter((c) => {
      if (kindFilter !== 'all' && c.kind !== kindFilter) return false;
      if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [visibleCategories, kindFilter, searchQuery]);

  const selected = useMemo(
    () => filteredCategories.find((c) => c.id === selectedId) ?? filteredCategories[0] ?? null,
    [filteredCategories, selectedId],
  );

  const renderKindPill = (k: CategoryKind | undefined): JSX.Element | null => {
    if (!k) return null;
    return (
      <span className={`ot-config__kind-pill ot-config__kind-pill--${k}`}>
        {t(`configuracion.categorias.kind.${k}`)}
      </span>
    );
  };

  const submitSubAdd = useCallback(async () => {
    if (!selectedId) return;
    const trimmed = subAddName.trim();
    if (!trimmed) {
      setSubError(t('configuracion.errors.nameEmpty'));
      return;
    }
    setSubBusy(true);
    setSubError(null);
    try {
      await createSubcategory(selectedId, trimmed);
      setSubAddName('');
      setSubAddOpen(false);
      await load();
    } catch (err) {
      setSubError(err instanceof Error ? err.message : t('configuracion.errors.submitFailed'));
    } finally {
      setSubBusy(false);
    }
  }, [selectedId, subAddName, load, t]);

  const submitSubEdit = useCallback(async () => {
    if (!subEditing) return;
    const trimmed = subEditName.trim();
    if (!trimmed) {
      setSubError(t('configuracion.errors.nameEmpty'));
      return;
    }
    setSubBusy(true);
    setSubError(null);
    try {
      await updateSubcategory(subEditing.id, subEditing.parentCategoryId, { name: trimmed });
      setSubEditing(null);
      setSubEditName('');
      await load();
    } catch (err) {
      setSubError(err instanceof Error ? err.message : t('configuracion.errors.submitFailed'));
    } finally {
      setSubBusy(false);
    }
  }, [subEditing, subEditName, load, t]);

  const doSubArchive = useCallback(async () => {
    if (!subArchiveTarget) return;
    await archiveSubcategory(subArchiveTarget.id, subArchiveTarget.parentCategoryId);
    await load();
  }, [subArchiveTarget, load]);

  const doSubUnarchive = useCallback(
    async (sub: SubcategoryRecord) => {
      setSubError(null);
      try {
        await unarchiveSubcategory(sub.id, sub.parentCategoryId);
        await load();
      } catch (err) {
        const message =
          err instanceof ConfigMutationError
            ? mapConfigMutationErrorToMessage(err, t)
            : err instanceof Error
              ? err.message
              : t('configuracion.errors.submitFailed');
        setSubError(message);
      }
    },
    [load, t],
  );

  // WI-21-followup — category usage (for delete gate) sums the category's
  // direct transactionCount PLUS the usage of all its subcategories (the
  // handler does the same on the server side; this mirror keeps the UI in
  // sync so the destructive CTA never appears when refs exist).
  const deleteCatUsage = useMemo(() => {
    if (!deleteCatTarget) return 0;
    let sum = usage.get(deleteCatTarget.id)?.transactionCount ?? 0;
    for (const sub of deleteCatTarget.subcategories ?? []) {
      sum += subUsage.get(sub.id) ?? 0;
    }
    return sum;
  }, [deleteCatTarget, usage, subUsage]);
  const deleteSubUsageCount = deleteSubTarget ? (subUsage.get(deleteSubTarget.id) ?? 0) : 0;

  const handleConfirmCatDelete = useCallback(async () => {
    if (!deleteCatTarget) return;
    const target = deleteCatTarget;
    setDeleteCatTarget(null);
    try {
      if (deleteCatUsage > 0) {
        await archiveCategory(target.id);
      } else {
        await deleteCategory(target.id);
      }
      await load();
      onListChanged?.();
    } catch (err) {
      const message =
        err instanceof ConfigMutationError
          ? err.code === 'HAS_REFERENCES'
            ? t('configuracion.categorias.delete.error.hasReferences', {
                count: err.transactionCount ?? 0,
              })
            : mapConfigMutationErrorToMessage(err, t)
          : err instanceof Error
            ? err.message
            : t('configuracion.errors.submitFailed');
      setState({ kind: 'error', message });
      await load();
    }
  }, [deleteCatTarget, deleteCatUsage, load, onListChanged, t]);

  const handleConfirmSubDelete = useCallback(async () => {
    if (!deleteSubTarget) return;
    const target = deleteSubTarget;
    setDeleteSubTarget(null);
    setSubError(null);
    try {
      if (deleteSubUsageCount > 0) {
        await archiveSubcategory(target.id, target.parentCategoryId);
      } else {
        await deleteSubcategory({ id: target.id, parentId: target.parentCategoryId });
      }
      await load();
      onListChanged?.();
    } catch (err) {
      const message =
        err instanceof ConfigMutationError
          ? err.code === 'HAS_REFERENCES'
            ? t('configuracion.subcategorias.delete.error.hasReferences', {
                count: err.transactionCount ?? 0,
              })
            : mapConfigMutationErrorToMessage(err, t)
          : err instanceof Error
            ? err.message
            : t('configuracion.errors.submitFailed');
      setSubError(message);
      await load();
    }
  }, [deleteSubTarget, deleteSubUsageCount, load, onListChanged, t]);

  const selectedSubs = useMemo<readonly SubcategoryRecord[]>(
    () => (selected?.subcategories ?? []) as readonly SubcategoryRecord[],
    [selected],
  );
  const visibleSubs = selectedSubs.filter((s) => showArchived || !isArchived(s));

  return (
    <>
      <header className="ot-page-header ot-config__tab-header">
        <div>
          <h1>{t('configuracion.categorias.heading')}</h1>
          <p className="ot-page-header__subtitle">{t('configuracion.categorias.subtitle')}</p>
          {state.kind === 'loaded' && state.categories.length > 0 ? (
            <div className="ot-page-header__stats">
              <span>{t('configuracion.categorias.stats.total', { count: counts.all })}</span>
              <span className="ot-page-header__stat-separator">·</span>
              <span className="ot-config__stat--income">
                {t('configuracion.categorias.stats.income', { count: counts.income })}
              </span>
              <span className="ot-page-header__stat-separator">·</span>
              <span className="ot-config__stat--expense">
                {t('configuracion.categorias.stats.expense', { count: counts.expense })}
              </span>
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {state.kind === 'loaded' && state.categories.length > 0 ? (
            <Button
              variant="primary"
              size="md"
              leadingIcon={<Plus size={16} />}
              onClick={() => setModalOpen(true)}
            >
              {t('configuracion.categorias.add')}
            </Button>
          ) : null}
        </div>
      </header>

      {state.kind === 'loading' ? (
        <p>{t('common.loading')}</p>
      ) : state.kind === 'error' ? (
        <EmptyState
          title={t('configuracion.error.loadFailed')}
          body={state.message}
          actions={
            <Button variant="secondary" onClick={() => void load()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : state.categories.length === 0 ? (
        <EmptyState
          icon={<Folder size={32} aria-hidden="true" />}
          title={t('configuracion.categorias.empty.title')}
          body={t('configuracion.categorias.empty.body')}
          actions={
            <Button
              variant="primary"
              leadingIcon={<Plus size={16} />}
              onClick={() => setModalOpen(true)}
            >
              {t('configuracion.categorias.add')}
            </Button>
          }
        />
      ) : (
        <>
          <div className="ot-config__filter-bar">
            <div
              className="ot-filter-bar__chips"
              role="tablist"
              aria-label={t('configuracion.categorias.filter.ariaLabel')}
            >
              {(['all', 'income', 'expense'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={kindFilter === k}
                  className={`ot-filter-bar__chip${kindFilter === k ? ' ot-filter-bar__chip--active' : ''}`}
                  onClick={() => setKindFilter(k)}
                >
                  {t(`configuracion.categorias.filter.${k === 'all' ? 'all' : k}`)}
                </button>
              ))}
            </div>
            <div className="ot-config__search-input">
              <Search size={14} />
              <input
                type="text"
                placeholder={t('configuracion.categorias.filter.search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <label className="ot-config__archived-toggle">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              {t('configuracion.archivedToggle')}
            </label>
          </div>

          <div className="ot-config__master-detail">
            {/* ─── Master: categories list ─── */}
            <div className="ot-config__md-card">
              <div className="ot-config__md-head">
                <div className="ot-config__md-head-text">
                  <div className="ot-config__md-title">
                    {t('configuracion.categorias.master.title')}
                  </div>
                  <div className="ot-config__md-sub">
                    {t('configuracion.categorias.master.results', {
                      count: filteredCategories.length,
                    })}
                  </div>
                </div>
              </div>
              <ul className="ot-config__list-rows">
                {filteredCategories.length === 0 ? (
                  <li className="ot-config__md-empty">
                    <Folder size={20} aria-hidden="true" />
                    <span>{t('configuracion.categorias.filter.none')}</span>
                  </li>
                ) : (
                  filteredCategories.map((c) => {
                    const active = selected?.id === c.id;
                    const swatch = c.color || 'var(--color-brand-primary)';
                    const archived = isArchived(c);
                    // issue #52 — real counters from the read model. `subs`
                    // is the count of *active* subcategories on this category;
                    // `moves` is the total transactions referencing it.
                    const activeSubs = (c.subcategories ?? []).filter((s) => !isArchived(s)).length;
                    const rowUsage = usage.get(c.id) ?? ZERO_USAGE;
                    return (
                      <li
                        key={c.id}
                        className={`ot-config__list-row${active ? ' ot-config__list-row--active' : ''}${
                          archived ? ' ot-config__list-row--archived' : ''
                        }`}
                      >
                        <button
                          type="button"
                          className="ot-config__list-row-main"
                          onClick={() => setSelectedId(c.id)}
                        >
                          <span
                            className="ot-config__folder-tile"
                            style={{ color: swatch }}
                            aria-hidden="true"
                          >
                            <Folder size={16} />
                          </span>
                          <span className="ot-config__list-row-text">
                            <span
                              className="ot-config__list-row-title ot-config__cell-truncate"
                              title={c.name}
                            >
                              {c.name}
                              {archived ? (
                                <span className="ot-config__archived-badge">
                                  {t('configuracion.archivedBadge')}
                                </span>
                              ) : null}
                            </span>
                            <span className="ot-config__list-row-sub">
                              {t('configuracion.categorias.master.rowSub', {
                                subs: activeSubs,
                                moves: rowUsage.transactionCount,
                                count: rowUsage.transactionCount,
                              })}
                            </span>
                          </span>
                        </button>
                        {renderKindPill(c.kind)}
                        <span className="ot-config__list-row-actions">
                          {archived ? (
                            <>
                              <button
                                className="ot-config__row-action-btn"
                                title={t('configuracion.unarchiveTooltip')}
                                aria-label={t('configuracion.unarchiveTooltip')}
                                onClick={() => void handleUnarchive(c.id)}
                              >
                                <RotateCcw size={14} />
                              </button>
                              <button
                                className="ot-config__row-action-btn"
                                title={t('configuracion.categorias.delete.actionTooltip')}
                                aria-label={t('configuracion.categorias.delete.actionTooltip')}
                                onClick={() => setDeleteCatTarget(c)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="ot-config__row-action-btn"
                                title={t('configuracion.categorias.actions.editTooltip')}
                                aria-label={t('configuracion.categorias.actions.editTooltip')}
                                onClick={() => setEditing(c)}
                              >
                                <Edit size={14} />
                              </button>
                              <button
                                className="ot-config__row-action-btn"
                                title={t('configuracion.categorias.actions.archiveTooltip')}
                                aria-label={t('configuracion.categorias.actions.archiveTooltip')}
                                onClick={() => setArchiveTarget(c)}
                              >
                                <Archive size={14} />
                              </button>
                              <button
                                className="ot-config__row-action-btn"
                                title={t('configuracion.categorias.delete.actionTooltip')}
                                aria-label={t('configuracion.categorias.delete.actionTooltip')}
                                onClick={() => setDeleteCatTarget(c)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </span>
                      </li>
                    );
                  })
                )}
              </ul>
              <button
                type="button"
                className="ot-config__list-add"
                onClick={() => setModalOpen(true)}
              >
                <Plus size={14} aria-hidden="true" />{' '}
                {t('configuracion.categorias.master.newCategory')}
              </button>
            </div>

            {/* ─── Detail: subcategory pane ─── */}
            <div className="ot-config__md-card">
              {selected ? (
                <>
                  <div className="ot-config__md-head">
                    <div className="ot-config__md-head-text">
                      <div className="ot-config__md-title">
                        <span
                          className="ot-config__swatch-sm"
                          style={{ background: selected.color || 'var(--color-brand-primary)' }}
                          aria-hidden="true"
                        />
                        {selected.name}
                        {renderKindPill(selected.kind)}
                      </div>
                      <div className="ot-config__md-sub">
                        {t('configuracion.categorias.detail.sub', {
                          subs: visibleSubs.length,
                          moves: (usage.get(selected.id) ?? ZERO_USAGE).classifiedCount,
                          count: (usage.get(selected.id) ?? ZERO_USAGE).classifiedCount,
                        })}
                      </div>
                    </div>
                    <div className="ot-config__md-head-actions">
                      <Button
                        variant="secondary"
                        size="sm"
                        leadingIcon={<Edit size={14} />}
                        onClick={() => setEditing(selected)}
                        title={t('configuracion.categorias.actions.editTitle')}
                      >
                        {t('configuracion.categorias.detail.rename')}
                      </Button>
                      {visibleSubs.length > 0 ? (
                        <Button
                          variant="primary"
                          size="sm"
                          leadingIcon={<Plus size={14} />}
                          onClick={() => {
                            setSubAddOpen(true);
                            setSubAddName('');
                            setSubError(null);
                          }}
                          title={t('configuracion.categorias.actions.addSubTitle')}
                        >
                          {t('configuracion.categorias.detail.addSub')}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {subError ? (
                    <div
                      className="ot-config-modal__error"
                      role="alert"
                      style={{ margin: 'var(--space-3) var(--space-5)' }}
                    >
                      {subError}
                    </div>
                  ) : null}
                  <ul className="ot-config__list-rows" style={{ listStyle: 'none' }}>
                    {visibleSubs.length === 0 && !subAddOpen ? (
                      <li className="ot-config__md-empty">
                        <Folder size={20} aria-hidden="true" />
                        <span>{t('configuracion.subcategorias.empty')}</span>
                      </li>
                    ) : (
                      visibleSubs.map((sub) => {
                        const archived = isArchived(sub);
                        const isEdit = subEditing?.id === sub.id;
                        return (
                          <li
                            key={sub.id}
                            className={`ot-config__subrow${archived ? ' ot-config__subrow--archived' : ''}`}
                          >
                            {isEdit ? (
                              <>
                                <input
                                  autoFocus
                                  value={subEditName}
                                  maxLength={80}
                                  onChange={(e) => setSubEditName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') void submitSubEdit();
                                    if (e.key === 'Escape') setSubEditing(null);
                                  }}
                                  style={{ flex: 1 }}
                                  className="ot-config-modal__input"
                                />
                                <button
                                  className="ot-config__row-action-btn"
                                  title={t('configuracion.subcategorias.inline.update')}
                                  aria-label={t('configuracion.subcategorias.inline.update')}
                                  disabled={subBusy}
                                  onClick={() => void submitSubEdit()}
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  className="ot-config__row-action-btn"
                                  title={t('configuracion.subcategorias.inline.cancel')}
                                  aria-label={t('configuracion.subcategorias.inline.cancel')}
                                  onClick={() => setSubEditing(null)}
                                >
                                  <XIcon size={14} />
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="ot-config__subrow-name" title={sub.name}>
                                  {sub.name}
                                  {archived ? (
                                    <span className="ot-config__archived-badge">
                                      {t('configuracion.archivedBadge')}
                                    </span>
                                  ) : null}
                                </span>
                                {archived ? (
                                  <>
                                    <button
                                      className="ot-config__row-action-btn"
                                      title={t('configuracion.unarchiveTooltip')}
                                      aria-label={t('configuracion.unarchiveTooltip')}
                                      onClick={() => void doSubUnarchive(sub)}
                                    >
                                      <RotateCcw size={14} />
                                    </button>
                                    <button
                                      className="ot-config__row-action-btn"
                                      title={t('configuracion.subcategorias.delete.actionTooltip')}
                                      aria-label={t(
                                        'configuracion.subcategorias.delete.actionTooltip',
                                      )}
                                      onClick={() => setDeleteSubTarget(sub)}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      className="ot-config__row-action-btn"
                                      title={t('configuracion.subcategorias.actions.editTooltip')}
                                      aria-label={t(
                                        'configuracion.subcategorias.actions.editTooltip',
                                      )}
                                      onClick={() => {
                                        setSubEditing(sub);
                                        setSubEditName(sub.name);
                                        setSubError(null);
                                      }}
                                    >
                                      <Edit size={14} />
                                    </button>
                                    <button
                                      className="ot-config__row-action-btn"
                                      title={t(
                                        'configuracion.subcategorias.actions.archiveTooltip',
                                      )}
                                      aria-label={t(
                                        'configuracion.subcategorias.actions.archiveTooltip',
                                      )}
                                      onClick={() => setSubArchiveTarget(sub)}
                                    >
                                      <Archive size={14} />
                                    </button>
                                    <button
                                      className="ot-config__row-action-btn"
                                      title={t('configuracion.subcategorias.delete.actionTooltip')}
                                      aria-label={t(
                                        'configuracion.subcategorias.delete.actionTooltip',
                                      )}
                                      onClick={() => setDeleteSubTarget(sub)}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </>
                                )}
                              </>
                            )}
                          </li>
                        );
                      })
                    )}
                  </ul>
                  {subAddOpen ? (
                    <div className="ot-config__subrow-form">
                      <input
                        autoFocus
                        value={subAddName}
                        maxLength={80}
                        placeholder={t('configuracion.subcategorias.inline.placeholder')}
                        onChange={(e) => setSubAddName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void submitSubAdd();
                          if (e.key === 'Escape') {
                            setSubAddOpen(false);
                            setSubAddName('');
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => void submitSubAdd()}
                        disabled={subBusy}
                      >
                        {subBusy
                          ? t('configuracion.subcategorias.inline.saving')
                          : t('configuracion.subcategorias.inline.save')}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSubAddOpen(false);
                          setSubAddName('');
                        }}
                      >
                        {t('configuracion.subcategorias.inline.cancel')}
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="ot-config__list-add"
                      onClick={() => {
                        setSubAddOpen(true);
                        setSubAddName('');
                        setSubError(null);
                      }}
                    >
                      <Plus size={14} aria-hidden="true" />{' '}
                      {t('configuracion.subcategorias.inline.addLabel', { parent: selected.name })}
                    </button>
                  )}
                </>
              ) : (
                <div className="ot-config__md-empty">
                  <Folder size={24} aria-hidden="true" />
                  <span>{t('configuracion.categorias.detail.selectPrompt')}</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <AddCategoryModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />
      <AddCategoryModal
        isOpen={editing !== null}
        mode="edit"
        record={editing}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
      />
      <ArchiveConfirmModal
        isOpen={archiveTarget !== null}
        entity="categorias"
        name={archiveTarget?.name ?? ''}
        onClose={() => setArchiveTarget(null)}
        onConfirm={handleArchive}
      />
      <ArchiveConfirmModal
        isOpen={subArchiveTarget !== null}
        entity="subcategorias"
        name={subArchiveTarget?.name ?? ''}
        onClose={() => setSubArchiveTarget(null)}
        onConfirm={doSubArchive}
      />
      <ConfirmDialog
        isOpen={deleteCatTarget !== null}
        variant={deleteCatUsage > 0 ? 'default' : 'destructive'}
        title={t(
          deleteCatUsage > 0
            ? 'configuracion.categorias.delete.confirmHasRefs.title'
            : 'configuracion.categorias.delete.confirmEmpty.title',
        )}
        message={
          deleteCatUsage > 0
            ? t('configuracion.categorias.delete.confirmHasRefs.body', { count: deleteCatUsage })
            : t('configuracion.categorias.delete.confirmEmpty.body')
        }
        confirmLabel={t(
          deleteCatUsage > 0
            ? 'configuracion.categorias.delete.confirmHasRefs.archiveCta'
            : 'configuracion.categorias.delete.confirmEmpty.confirmCta',
        )}
        onConfirm={() => void handleConfirmCatDelete()}
        onCancel={() => setDeleteCatTarget(null)}
      />
      <ConfirmDialog
        isOpen={deleteSubTarget !== null}
        variant={deleteSubUsageCount > 0 ? 'default' : 'destructive'}
        title={t(
          deleteSubUsageCount > 0
            ? 'configuracion.subcategorias.delete.confirmHasRefs.title'
            : 'configuracion.subcategorias.delete.confirmEmpty.title',
        )}
        message={
          deleteSubUsageCount > 0
            ? t('configuracion.subcategorias.delete.confirmHasRefs.body', {
                count: deleteSubUsageCount,
              })
            : t('configuracion.subcategorias.delete.confirmEmpty.body')
        }
        confirmLabel={t(
          deleteSubUsageCount > 0
            ? 'configuracion.subcategorias.delete.confirmHasRefs.archiveCta'
            : 'configuracion.subcategorias.delete.confirmEmpty.confirmCta',
        )}
        onConfirm={() => void handleConfirmSubDelete()}
        onCancel={() => setDeleteSubTarget(null)}
      />
    </>
  );
}
