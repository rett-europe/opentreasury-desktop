import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Tag as TagIcon, Search, Edit, Archive, RotateCcw } from 'lucide-react';

import { Button } from '../../components/Button/index.js';
import { EmptyState } from '../../components/EmptyState/index.js';
import { AddTagModal, ArchiveConfirmModal } from '../../components/ConfigModals/index.js';
import { listTags } from '../../services/tagsApi.js';
import {
  archiveTag,
  ConfigMutationError,
  isArchived,
  unarchiveTag,
  type ConfigTag,
} from '../../services/configMutationsApi.js';
import { mapConfigMutationErrorToMessage } from '../../components/ConfigModals/errorMap.js';
import type { TagRecord } from '../../types/config.js';

type State =
  | { kind: 'loading' }
  | { kind: 'loaded'; tags: readonly ConfigTag[] }
  | { kind: 'error'; message: string };

export interface EtiquetasTabProps {
  readonly onListChanged?: (() => void) | undefined;
}

/**
 * Etiquetas — card grid only (round 2).
 *
 * The earlier version shipped a list/grid segmented toggle and exposed the raw
 * ULID (`tag.id`) as a "slug" under the name, which leaked opaque identifiers
 * like `01KPKVR0RMXVV963MEH1TSK2QZ` into the UI. The prototype intended that
 * slot for a human-readable slug derived from the tag name — a field we do not
 * (yet) carry on `TagCreated`. Rather than fabricate one, we simply drop the
 * meta row until the schema grows a slug. Grid-only until usage counts exist.
 */
export function EtiquetasTab({ onListChanged }: EtiquetasTabProps): JSX.Element {
  const { t } = useTranslation('common');
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ConfigTag | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ConfigTag | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const resp = await listTags({ includeArchived: showArchived });
      setState({ kind: 'loaded', tags: resp.tags as readonly ConfigTag[] });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'unknown' });
    }
  }, [showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaved = useCallback(
    (_saved: TagRecord) => {
      void load();
      onListChanged?.();
    },
    [load, onListChanged],
  );

  const handleArchive = useCallback(async () => {
    if (!archiveTarget) return;
    await archiveTag(archiveTarget.id);
    await load();
    onListChanged?.();
  }, [archiveTarget, load, onListChanged]);

  const handleUnarchive = useCallback(
    async (id: string) => {
      try {
        await unarchiveTag(id);
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

  const visibleTags =
    state.kind === 'loaded' ? state.tags.filter((tg) => showArchived || !isArchived(tg)) : [];

  const filteredTags = visibleTags.filter((tg) => {
    if (!searchQuery) return true;
    return tg.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <>
      <header className="ot-page-header ot-config__tab-header">
        <div>
          <h1>{t('configuracion.etiquetas.heading')}</h1>
          <p className="ot-page-header__subtitle">{t('configuracion.etiquetas.subtitle')}</p>
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
            <Button
              variant="primary"
              size="md"
              leadingIcon={<Plus size={16} />}
              onClick={() => setModalOpen(true)}
            >
              {t('configuracion.etiquetas.add')}
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
            <label className="ot-config__archived-toggle">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              {t('configuracion.archivedToggle')}
            </label>
            <span className="ot-config__filter-count">
              {filteredTags.length} de {visibleTags.length}
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
              {filteredTags.map((tg) => {
                const archived = isArchived(tg);
                return (
                  <li
                    key={tg.id}
                    className={`ot-config__tag-grid-item${archived ? ' ot-config__tag-grid-item--archived' : ''}`}
                  >
                    <div className="ot-config__tag-grid-header">
                      <span
                        className="ot-config__swatch-lg"
                        style={{ background: tg.color || 'var(--color-brand-primary)' }}
                        aria-hidden="true"
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          className="ot-config__cell-truncate"
                          style={{
                            fontWeight: 'var(--font-weight-medium)',
                            textDecoration: archived ? 'line-through' : undefined,
                          }}
                          title={tg.name}
                        >
                          {tg.name}
                          {archived ? (
                            <span className="ot-config__archived-badge">
                              {t('configuracion.archivedBadge')}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="ot-config__tag-grid-actions">
                        {archived ? (
                          <button
                            className="ot-config__row-action-btn"
                            title={t('configuracion.unarchiveTooltip')}
                            aria-label={t('configuracion.unarchiveTooltip')}
                            onClick={() => void handleUnarchive(tg.id)}
                          >
                            <RotateCcw size={14} />
                          </button>
                        ) : (
                          <>
                            <button
                              className="ot-config__row-action-btn"
                              title={t('configuracion.etiquetas.actions.editTooltip')}
                              aria-label={t('configuracion.etiquetas.actions.editTooltip')}
                              onClick={() => setEditing(tg)}
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              className="ot-config__row-action-btn"
                              title={t('configuracion.etiquetas.actions.archiveTooltip')}
                              aria-label={t('configuracion.etiquetas.actions.archiveTooltip')}
                              onClick={() => setArchiveTarget(tg)}
                            >
                              <Archive size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <AddTagModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSaved={handleSaved} />
      <AddTagModal
        isOpen={editing !== null}
        mode="edit"
        record={editing}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
      />
      <ArchiveConfirmModal
        isOpen={archiveTarget !== null}
        entity="etiquetas"
        name={archiveTarget?.name ?? ''}
        onClose={() => setArchiveTarget(null)}
        onConfirm={handleArchive}
      />
    </>
  );
}
