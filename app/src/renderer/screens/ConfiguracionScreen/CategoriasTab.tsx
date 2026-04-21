import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, FolderOpen, Search, Edit, Trash2, Download } from 'lucide-react';

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

export function CategoriasTab({ onListChanged }: CategoriasTabProps): JSX.Element {
  const { t } = useTranslation('common');
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const resp = await listCategories();
      setState({ kind: 'loaded', categories: resp.categories });
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'unknown',
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreated = useCallback(() => {
    void load();
    onListChanged?.();
  }, [load, onListChanged]);

  // Filter categories by search query
  const filteredCategories =
    state.kind === 'loaded'
      ? state.categories.filter((c) => {
          if (!searchQuery) return true;
          return c.name.toLowerCase().includes(searchQuery.toLowerCase());
        })
      : [];

  return (
    <>
      <div className="ot-config__tab-actions">
        <div>
          <h2 className="ot-config__tab-title">{t('configuracion.categorias.heading')}</h2>
          {state.kind === 'loaded' && state.categories.length > 0 ? (
            <div className="ot-page-header__stats">
              <span>
                {state.categories.length} categoría{state.categories.length !== 1 ? 's' : ''}
              </span>
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {state.kind === 'loaded' && state.categories.length > 0 ? (
            <Button variant="secondary" size="md" leadingIcon={<Download size={16} />}>
              Exportar
            </Button>
          ) : null}
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

          <div className="ot-config__table-wrapper">
            <table className="ot-config__table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th>Nombre</th>
                  <th style={{ width: '80px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredCategories.length > 0 ? (
                  filteredCategories.map((c) => (
                    <tr key={c.id}>
                      <td>
                        {c.color ? (
                          <div
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              background: c.color,
                              border: '1px solid var(--color-border-default)',
                            }}
                            aria-hidden="true"
                          />
                        ) : (
                          <FolderOpen size={20} style={{ color: 'var(--color-text-muted)' }} />
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 'var(--font-weight-medium)' }}>{c.name}</div>
                      </td>
                      <td>
                        <div className="ot-config__row-actions">
                          <button
                            className="ot-config__row-action-btn"
                            title="Editar categoría"
                            aria-label="Editar categoría"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            className="ot-config__row-action-btn ot-config__row-action-btn--danger"
                            title="Eliminar categoría"
                            aria-label="Eliminar categoría"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="ot-config__table-empty">
                      Ninguna categoría coincide con la búsqueda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
