import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Tag as TagIcon, Search, Edit, Trash2, Download } from 'lucide-react';

import { Button } from '../../components/Button/index.js';
import { EmptyState } from '../../components/EmptyState/index.js';
import { AddTagModal } from '../../components/ConfigModals/index.js';
import { listTags } from '../../services/tagsApi.js';
import type { TagRecord } from '../../types/config.js';

type State =
  | { kind: 'loading' }
  | { kind: 'loaded'; tags: readonly TagRecord[] }
  | { kind: 'error'; message: string };

export interface EtiquetasTabProps {
  readonly onListChanged?: (() => void) | undefined;
}

export function EtiquetasTab({ onListChanged }: EtiquetasTabProps): JSX.Element {
  const { t } = useTranslation('common');
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const resp = await listTags();
      setState({ kind: 'loaded', tags: resp.tags });
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

  // Filter tags by search query
  const filteredTags =
    state.kind === 'loaded'
      ? state.tags.filter((t) => {
          if (!searchQuery) return true;
          return t.name.toLowerCase().includes(searchQuery.toLowerCase());
        })
      : [];

  return (
    <>
      <div className="ot-config__tab-actions">
        <div>
          <h2 className="ot-config__tab-title">{t('configuracion.etiquetas.heading')}</h2>
          {state.kind === 'loaded' && state.tags.length > 0 ? (
            <div className="ot-page-header__stats">
              <span>
                {state.tags.length} etiqueta{state.tags.length !== 1 ? 's' : ''}
              </span>
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {state.kind === 'loaded' && state.tags.length > 0 ? (
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
            {t('configuracion.etiquetas.add')}
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
      ) : state.tags.length === 0 ? (
        <EmptyState
          icon={<TagIcon size={32} aria-hidden="true" />}
          title={t('configuracion.etiquetas.empty.title')}
          body={t('configuracion.etiquetas.empty.body')}
          actions={
            <Button
              variant="primary"
              leadingIcon={<Plus size={16} />}
              onClick={() => setModalOpen(true)}
            >
              {t('configuracion.etiquetas.add')}
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
                placeholder="Buscar etiqueta…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <span className="ot-config__filter-count">
              {filteredTags.length} de {state.tags.length}
            </span>
          </div>

          {filteredTags.length === 0 ? (
            <div className="ot-config__table-wrapper">
              <div className="ot-config__table-empty">
                Ninguna etiqueta coincide con la búsqueda.
              </div>
            </div>
          ) : (
            <ul className="ot-config__tag-grid">
              {filteredTags.map((tg) => (
                <li key={tg.id} className="ot-config__tag-grid-item">
                  <div className="ot-config__tag-grid-header">
                    <span className="ot-config__tag-pill">{tg.name}</span>
                    <div className="ot-config__tag-grid-actions">
                      <button
                        className="ot-config__row-action-btn"
                        title="Editar etiqueta"
                        aria-label="Editar etiqueta"
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        className="ot-config__row-action-btn ot-config__row-action-btn--danger"
                        title="Eliminar etiqueta"
                        aria-label="Eliminar etiqueta"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <span className="ot-config__meta-text">ID: {tg.id}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <AddTagModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
    </>
  );
}
