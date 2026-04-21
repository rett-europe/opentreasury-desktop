import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, FolderOpen, Search, Edit, Trash2, Info } from 'lucide-react';

import { Button } from '../../components/Button/index.js';
import { EmptyState } from '../../components/EmptyState/index.js';
import { AddCategoryModal } from '../../components/ConfigModals/index.js';
import { listCategories } from '../../services/categoriesApi.js';
import type { CategoryRecord } from '../../types/config.js';

type State =
  | { kind: 'loading' }
  | { kind: 'loaded'; categories: readonly CategoryRecord[] }
  | { kind: 'error'; message: string };

export interface CategoriasTabProps {
  readonly onListChanged?: (() => void) | undefined;
}

/**
 * Categorías — master-detail layout (PR#2 parity, round 2).
 *
 * Round-2 rebalance: master rows are richer (icon · name · meta line · swatch
 * · actions) so the left card holds its weight against the detail pane. The
 * detail pane renders a subcategory empty-state with the same `list-rows`
 * rhythm as the master, plus a footer "Añadir subcategoría" ghost button that
 * stays disabled until `SubcategoryAdded` events exist. The prototype's
 * Ingreso/Gasto chip filter is intentionally omitted — Pedro's Q4 decision
 * locked categories as direction-agnostic.
 */
export function CategoriasTab({ onListChanged }: CategoriasTabProps): JSX.Element {
  const { t } = useTranslation('common');
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [modalOpen, setModalOpen] = useState(false);
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

  const filteredCategories = useMemo(() => {
    if (state.kind !== 'loaded') return [] as readonly CategoryRecord[];
    if (!searchQuery) return state.categories;
    const q = searchQuery.toLowerCase();
    return state.categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [state, searchQuery]);

  const selected = useMemo(
    () => filteredCategories.find((c) => c.id === selectedId) ?? filteredCategories[0] ?? null,
    [filteredCategories, selectedId],
  );

  return (
    <>
      <div className="ot-config__tab-actions">
        <div>
          <h2 className="ot-config__tab-title">{t('configuracion.categorias.heading')}</h2>
          {state.kind === 'loaded' && state.categories.length > 0 ? (
            <div className="ot-page-header__stats">
              <span>
                {state.categories.length} categoría
                {state.categories.length !== 1 ? 's' : ''}
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
          icon={<FolderOpen size={32} aria-hidden="true" />}
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
            <div className="ot-config__search-input">
              <Search size={14} />
              <input
                type="text"
                placeholder="Buscar categoría…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <span className="ot-config__filter-count">
              {filteredCategories.length} de {state.categories.length}
            </span>
          </div>

          <div className="ot-config__master-detail">
            {/* ─── Master: categories list ─── */}
            <div className="ot-config__md-card">
              <div className="ot-config__md-head">
                <div>
                  <div className="ot-config__md-title">Categorías</div>
                  <div className="ot-config__md-sub">
                    {filteredCategories.length} resultado
                    {filteredCategories.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
              <ul className="ot-config__list-rows">
                {filteredCategories.length === 0 ? (
                  <li className="ot-config__md-empty">
                    <FolderOpen size={20} aria-hidden="true" />
                    <span>Ninguna categoría coincide con la búsqueda.</span>
                  </li>
                ) : (
                  filteredCategories.map((c) => {
                    const active = selected?.id === c.id;
                    const color = c.color || 'var(--color-brand-primary)';
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
                            className="ot-config__entity-icon ot-config__entity-icon--sm"
                            style={{ background: color }}
                            aria-hidden="true"
                          >
                            <FolderOpen size={14} />
                          </span>
                          <span className="ot-config__list-row-text">
                            <span
                              className="ot-config__list-row-title ot-config__cell-truncate"
                              title={c.name}
                            >
                              {c.name}
                            </span>
                            <span className="ot-config__list-row-sub">
                              Sin subcategorías · pendiente de eventos
                            </span>
                          </span>
                        </button>
                        <span className="ot-config__list-row-actions">
                          <button
                            className="ot-config__row-action-btn"
                            title="Editar (próximamente)"
                            aria-label="Editar categoría"
                            disabled
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            className="ot-config__row-action-btn ot-config__row-action-btn--danger"
                            title="Eliminar (próximamente)"
                            aria-label="Eliminar categoría"
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
                <Plus size={14} aria-hidden="true" /> Nueva categoría
              </button>
            </div>

            {/* ─── Detail: subcategory pane ─── */}
            <div className="ot-config__md-card">
              {selected ? (
                <>
                  <div className="ot-config__md-head">
                    <div>
                      <div className="ot-config__md-title">
                        <span
                          className="ot-config__swatch-sm"
                          style={{ background: selected.color || 'var(--color-brand-primary)' }}
                          aria-hidden="true"
                        />
                        {selected.name}
                      </div>
                      <div className="ot-config__md-sub">
                        0 subcategorías · modelo plano (WI-15-lite)
                      </div>
                    </div>
                    <button
                      className="ot-config__row-action-btn"
                      title="Renombrar (próximamente)"
                      aria-label="Renombrar"
                      disabled
                    >
                      <Edit size={14} />
                    </button>
                  </div>
                  <ul className="ot-config__list-rows">
                    <li className="ot-config__md-empty">
                      <FolderOpen size={20} aria-hidden="true" />
                      <span>Esta categoría aún no tiene subcategorías.</span>
                    </li>
                  </ul>
                  <div className="ot-config__md-body">
                    <div className="ot-config__callout" role="note">
                      <Info size={14} aria-hidden="true" />
                      <span>
                        Las <strong>subcategorías</strong> forman parte de la renovación pero aún no
                        están conectadas al event log (pendiente de{' '}
                        <code>SubcategoryAdded/Removed/Renamed</code>). Hasta entonces la pantalla
                        refleja el modelo plano de WI-15-lite.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="ot-config__list-add"
                    title="Añadir subcategoría (próximamente)"
                    disabled
                  >
                    <Plus size={14} aria-hidden="true" /> Añadir subcategoría
                  </button>
                </>
              ) : (
                <div className="ot-config__md-empty">
                  <FolderOpen size={24} aria-hidden="true" />
                  <span>Selecciona una categoría para ver sus detalles.</span>
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
