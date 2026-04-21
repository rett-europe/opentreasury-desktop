import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Folder, Search, Edit, Trash2 } from 'lucide-react';

import { Button } from '../../components/Button/index.js';
import { EmptyState } from '../../components/EmptyState/index.js';
import { AddCategoryModal } from '../../components/ConfigModals/index.js';
import { listCategories } from '../../services/categoriesApi.js';
import type { CategoryKind, CategoryRecord } from '../../types/config.js';

type State =
  | { kind: 'loading' }
  | { kind: 'loaded'; categories: readonly CategoryRecord[] }
  | { kind: 'error'; message: string };

type KindFilter = 'all' | CategoryKind;

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
 * Subcategory and usage counts are shown as 0 — the data model does not yet
 * track them. Wiring them is a follow-up event slice.
 */
export function CategoriasTab({ onListChanged }: CategoriasTabProps): JSX.Element {
  const { t } = useTranslation('common');
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [modalOpen, setModalOpen] = useState(false);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const resp = await listCategories();
      setState({ kind: 'loaded', categories: resp.categories });
      if (resp.categories.length > 0 && !selectedId) {
        setSelectedId(resp.categories[0]?.id ?? null);
      }
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'unknown' });
    }
    // selectedId intentionally excluded — we only seed it once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreated = useCallback(() => {
    void load();
    onListChanged?.();
  }, [load, onListChanged]);

  const categories = useMemo(
    () => (state.kind === 'loaded' ? state.categories : ([] as readonly CategoryRecord[])),
    [state],
  );

  const counts = useMemo(
    () => ({
      all: categories.length,
      income: categories.filter((c) => c.kind === 'income').length,
      expense: categories.filter((c) => c.kind === 'expense').length,
    }),
    [categories],
  );

  const filteredCategories = useMemo(() => {
    return categories.filter((c) => {
      if (kindFilter !== 'all' && c.kind !== kindFilter) return false;
      if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [categories, kindFilter, searchQuery]);

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

  return (
    <>
      <div className="ot-config__tab-actions">
        <div>
          <h2 className="ot-config__tab-title">{t('configuracion.categorias.heading')}</h2>
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
          <Button
            variant="primary"
            size="md"
            leadingIcon={<Plus size={16} />}
            onClick={() => setModalOpen(true)}
          >
            {t('configuracion.categorias.add')}
          </Button>
        </div>
      </div>

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
            <div className="ot-filter-bar__chips" role="tablist" aria-label="Filtro de tipo">
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
                    return (
                      <li
                        key={c.id}
                        className={`ot-config__list-row${active ? ' ot-config__list-row--active' : ''}`}
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
                            </span>
                            <span className="ot-config__list-row-sub">
                              {t('configuracion.categorias.master.rowSub', {
                                subs: 0,
                                moves: 0,
                                count: 0,
                              })}
                            </span>
                          </span>
                        </button>
                        {renderKindPill(c.kind)}
                        <span className="ot-config__list-row-actions">
                          <button
                            className="ot-config__row-action-btn"
                            title={t('configuracion.categorias.actions.editTitle')}
                            aria-label={t('configuracion.categorias.actions.editTitle')}
                            disabled
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            className="ot-config__row-action-btn ot-config__row-action-btn--danger"
                            title={t('configuracion.categorias.actions.deleteTitle')}
                            aria-label={t('configuracion.categorias.actions.deleteTitle')}
                            disabled
                          >
                            <Trash2 size={14} />
                          </button>
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
                          subs: 0,
                          moves: 0,
                          count: 0,
                        })}
                      </div>
                    </div>
                    <div className="ot-config__md-head-actions">
                      <Button
                        variant="secondary"
                        size="sm"
                        leadingIcon={<Edit size={14} />}
                        disabled
                        title={t('configuracion.categorias.actions.renameTitle')}
                      >
                        {t('configuracion.categorias.detail.rename')}
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        leadingIcon={<Plus size={14} />}
                        disabled
                        title={t('configuracion.categorias.actions.addSubTitle')}
                      >
                        {t('configuracion.categorias.detail.addSub')}
                      </Button>
                    </div>
                  </div>
                  <ul className="ot-config__list-rows">
                    <li className="ot-config__md-empty">
                      <Folder size={20} aria-hidden="true" />
                      <span>{t('configuracion.categorias.detail.emptySub')}</span>
                    </li>
                  </ul>
                  <button
                    type="button"
                    className="ot-config__list-add"
                    title={t('configuracion.categorias.actions.addSubTitle')}
                    disabled
                  >
                    <Plus size={14} aria-hidden="true" />{' '}
                    {t('configuracion.categorias.detail.addSubTo')}{' '}
                    <strong style={{ marginLeft: 4 }}>{selected.name}</strong>
                  </button>
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
        onCreated={handleCreated}
      />
    </>
  );
}
